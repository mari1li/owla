"""
Merge assist — Pi pipeline.

Reads a video source (iPhone IP-camera stream, a file, or a USB camera),
finds lane lines, detects vehicles, estimates distance and closing speed,
and warns when a gap is below the driver's safety margin.

    python3 main.py --source video.mp4
    python3 main.py --source http://192.168.1.50:8080/video
    python3 main.py --source rtsp://192.168.1.50:8554/live
    python3 main.py --source 0                      # USB camera

Keys:  q quit   d cycle debug view   space pause

Install (Pi):
    sudo apt install -y python3-opencv
    python3 -m venv --system-site-packages venv
    source venv/bin/activate
    pip install ultralytics
"""

import argparse
import time

import cv2
import numpy as np


# ---------------------------------------------------------------- config
CLASSES = {                       # name: (real size m, 'w' or 'h')
    "car": (1.8, "w"), "truck": (2.4, "w"), "bus": (2.5, "w"),
    "motorcycle": (0.8, "w"), "person": (1.7, "h"), "bicycle": (1.7, "w"),
}
PROFILES = {"new": 6.0, "very_new": 8.0, "experienced": 4.0}


# ------------------------------------------------------------ lane stage
def find_lanes(frame, roi_top=0.60, roi_bottom=1.0, kernel_w=25, thresh=25):
    """Top-hat morphology + Hough. Returns (lines, debug_mask)."""
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    # Lane markings are thin bright ridges. An opening with a wide horizontal
    # kernel erases them; subtracting that leaves exactly the markings. Unlike
    # Canny this is relative to local background, so shadows don't break it.
    kern = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_w | 1, 1))
    tophat = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, kern)
    _, binary = cv2.threshold(tophat, thresh, 255, cv2.THRESH_BINARY)

    # keep only the road trapezoid
    mask = np.zeros_like(binary)
    top_y, bot_y = int(h * roi_top), int(h * roi_bottom)
    poly = np.array([[
        (int(w * 0.05), bot_y), (int(w * 0.44), top_y),
        (int(w * 0.56), top_y), (int(w * 0.95), bot_y)]], np.int32)
    cv2.fillPoly(mask, poly, 255)
    masked = cv2.bitwise_and(binary, mask)

    raw = cv2.HoughLinesP(masked, 2, np.pi / 180, 50,
                          minLineLength=40, maxLineGap=100)

    lines = []
    if raw is not None:
        mid = w / 2
        for x1, y1, x2, y2 in raw[:, 0]:
            if x1 == x2:
                continue
            slope = (y2 - y1) / (x2 - x1)
            if not 0.5 <= abs(slope) <= 3.0:        # drop wires and poles
                continue
            cx = (x1 + x2) / 2
            if slope < 0 and cx > mid:              # side consistency
                continue
            if slope > 0 and cx < mid:
                continue
            lines.append((x1, y1, x2, y2, slope))

    return lines, masked, poly


# ---------------------------------------------------------- vehicle stage
class Tracker:
    """Tracks nearest object per zone so we can derive closing speed."""

    def __init__(self):
        self.prev = {}

    def update(self, zone, dist, now):
        p = self.prev.get(zone)
        self.prev[zone] = (dist, now)
        if not p or now - p[1] < 0.15:
            return None
        return (p[0] - dist) / (now - p[1])         # m/s, + = approaching

    def drop(self, zone):
        self.prev.pop(zone, None)


def zone_of(cx, width, rear):
    third = width / 3
    z = "left" if cx < third else ("right" if cx > third * 2 else "center")
    if rear and z in ("left", "right"):
        z = "right" if z == "left" else "left"      # rear camera mirrors
    return z


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="0")
    ap.add_argument("--focal", type=float, default=800,
                    help="camera focal length in px - calibrate this")
    ap.add_argument("--profile", default="new", choices=PROFILES)
    ap.add_argument("--conf", type=float, default=0.45)
    ap.add_argument("--rear", action="store_true", help="rear-facing camera")
    ap.add_argument("--width", type=int, default=640)
    ap.add_argument("--no-yolo", action="store_true")
    args = ap.parse_args()

    margin = PROFILES[args.profile]

    src = int(args.source) if args.source.isdigit() else args.source
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        print(f"Could not open source: {args.source}")
        return
    # network streams buffer badly - keep it shallow or alerts go stale
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    model = None
    if not args.no_yolo:
        from ultralytics import YOLO
        model = YOLO("yolov8n.pt")
        print("Model loaded.")

    tracker = Tracker()
    debug = 0            # 0 normal, 1 lane mask
    paused = False
    fps_t, frames, fps = time.time(), 0, 0.0

    print("q quit | d debug view | space pause")

    while True:
        if not paused:
            ok, frame = cap.read()
            if not ok:
                print("Stream ended.")
                break

            scale = args.width / frame.shape[1]
            frame = cv2.resize(frame, (args.width, int(frame.shape[0] * scale)))
            h, w = frame.shape[:2]
            now = time.time()

            lines, lane_mask, poly = find_lanes(frame)

            view = cv2.cvtColor(lane_mask, cv2.COLOR_GRAY2BGR) if debug else frame.copy()
            cv2.polylines(view, poly, True, (0, 255, 255), 1)
            for x1, y1, x2, y2, slope in lines:
                cv2.line(view, (x1, y1), (x2, y2),
                         (255, 160, 0) if slope < 0 else (0, 100, 255), 3)

            alerts = []
            seen = set()

            if model is not None:
                res = model(frame, verbose=False, conf=args.conf)[0]
                nearest = {}

                for b in res.boxes:
                    name = model.names[int(b.cls)]
                    if name not in CLASSES:
                        continue
                    size_m, axis = CLASSES[name]
                    x1, y1, x2, y2 = [int(v) for v in b.xyxy[0]]
                    bw, bh = x2 - x1, y2 - y1
                    px = bw if axis == "w" else bh
                    if px < 8:
                        continue

                    dist = size_m * args.focal / px        # pinhole model
                    zone = zone_of((x1 + x2) / 2, w, args.rear)

                    colour = (255, 0, 255) if name in ("person", "bicycle") \
                        else (255, 200, 0)
                    cv2.rectangle(view, (x1, y1), (x2, y2), colour, 2)
                    cv2.putText(view, f"{name} {dist:.0f}m {zone}",
                                (x1, max(14, y1 - 6)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, colour, 1)

                    if name in ("person", "bicycle") and dist < 60:
                        alerts.append(f"PERSON {zone} {dist:.0f}m")

                    if zone not in nearest or dist < nearest[zone]:
                        nearest[zone] = dist

                for zone, dist in nearest.items():
                    seen.add(zone)
                    closing = tracker.update(zone, dist, now)
                    if closing is None or closing <= 0.5:
                        continue
                    tta = dist / closing
                    if zone in ("left", "right") and tta < margin:
                        alerts.append(
                            f"{zone.upper()}: closing {tta:.1f}s "
                            f"(below {margin:.0f}s margin)")

            for z in ("left", "right", "center"):
                if z not in seen:
                    tracker.drop(z)

            frames += 1
            if time.time() - fps_t >= 1.0:
                fps, frames, fps_t = frames / (time.time() - fps_t), 0, time.time()

            banner = "  |  ".join(alerts) if alerts else "monitoring"
            cv2.rectangle(view, (0, 0), (w, 26), (0, 0, 0), -1)
            cv2.putText(view, banner[:70], (6, 18), cv2.FONT_HERSHEY_SIMPLEX,
                        0.5, (0, 200, 255) if alerts else (160, 160, 160), 1)
            cv2.putText(view, f"{fps:.1f}fps  lanes:{len(lines)}  {args.profile}",
                        (6, h - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (120, 220, 120), 1)

            if alerts:
                print(banner + "   - check your mirror")

            cv2.imshow("merge assist", view)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("d"):
            debug = 1 - debug
        if key == ord(" "):
            paused = not paused

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
