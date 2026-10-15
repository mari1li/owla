"""
Lane tracking, tuned for speed on a Pi 4.

Same detection as before, but:
  - the ISP downscales for us, so no software resize and a much smaller array
  - YUV420's Y plane is already greyscale, so no colour conversion
  - Hough runs on a crop, not the whole frame
  - the window only redraws every few frames

Press 'i' to print where the time is actually going.

Keys
----
  q  quit                     d  cycle view
  t/T sensitivity             k/K kernel width
  y/Y roi top                 h/H roi bottom
  i  timing breakdown         p  print settings
  s  save frame               SPACE  pause/resume display
"""

import time
from collections import deque, defaultdict

import cv2
import numpy as np
from picamera2 import Picamera2

# --------------------------------------------------------------------------
# capture
# --------------------------------------------------------------------------
# Small is good here. Lane markings survive downscaling fine, and every stage
# downstream is cheaper. 480x270 also works if you need more speed.
W, H = 640, 360

piCam = Picamera2()
piCam.configure(piCam.create_video_configuration(
    # YUV420: the first H rows of the returned array are the luma (greyscale)
    # plane. Asking for this instead of RGB saves a full-frame conversion
    # every single frame.
    main={"size": (W, H), "format": "YUV420"},
    controls={"FrameRate": 30},
    buffer_count=4,
))
piCam.start()
time.sleep(2)                      # let auto-exposure settle

DISPLAY_EVERY = 3                  # redraw the window 1 frame in N
show_window = True

settings = {"thresh": 25, "kernel": 25, "roi_top": 62, "roi_bot": 100}

SMOOTH = 10
history = {"left": deque(maxlen=SMOOTH), "right": deque(maxlen=SMOOTH)}

# --------------------------------------------------------------------------
# timing
# --------------------------------------------------------------------------
timings = defaultdict(float)
counts = defaultdict(int)


class stage:
    """with stage('name'): ... — accumulates how long each part takes."""
    def __init__(self, name): self.name = name
    def __enter__(self): self.t = time.perf_counter(); return self
    def __exit__(self, *a):
        timings[self.name] += time.perf_counter() - self.t
        counts[self.name] += 1


def report():
    total = sum(timings.values())
    if total <= 0:
        return
    print("\n  where the time goes")
    print("  " + "-" * 38)
    for name, t in sorted(timings.items(), key=lambda kv: -kv[1]):
        ms = t / max(1, counts[name]) * 1000
        print(f"  {name:<16}{ms:6.2f} ms/frame   {t/total*100:5.1f}%")
    print("  " + "-" * 38)
    timings.clear()
    counts.clear()


# --------------------------------------------------------------------------
# detection
# --------------------------------------------------------------------------
def roi_bounds(h):
    top = int(h * settings["roi_top"] / 100)
    bot = int(h * settings["roi_bot"] / 100)
    return top, bot


def roi_polygon(w, h, y_offset=0):
    top, bot = roi_bounds(h)
    return np.array([[
        (int(w * 0.02), bot - y_offset),
        (int(w * 0.42), top - y_offset),
        (int(w * 0.58), top - y_offset),
        (int(w * 0.98), bot - y_offset),
    ]], np.int32)


def marking_mask(gray):
    """White top-hat: wide horizontal opening erases thin bright ridges,
    so the difference is the lane paint and little else. Measured against
    the local road surface, which is why shadows don't break it."""
    k = settings["kernel"] | 1
    kern = cv2.getStructuringElement(cv2.MORPH_RECT, (k, 1))
    tophat = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, kern)
    _, binary = cv2.threshold(tophat, settings["thresh"], 255, cv2.THRESH_BINARY)
    return binary


def segments(masked, w, y_offset):
    raw = cv2.HoughLinesP(masked, 2, np.pi / 180, 40,
                          minLineLength=30, maxLineGap=90)
    if raw is None:
        return [], []
    mid = w / 2
    left, right = [], []
    for x1, y1, x2, y2 in raw[:, 0]:
        if x1 == x2:
            continue
        slope = (y2 - y1) / (x2 - x1)
        if not 0.4 <= abs(slope) <= 3.0:      # wires above, poles beside
            continue
        cx = (x1 + x2) / 2
        # put the coordinates back into full-frame space
        y1f, y2f = y1 + y_offset, y2 + y_offset
        if slope < 0 and cx < mid:
            left.append((x1, y1f, x2, y2f))
        elif slope > 0 and cx > mid:
            right.append((x1, y1f, x2, y2f))
    return left, right


def fit(segs):
    """x as a function of y — lane lines approach vertical, where the usual
    y = f(x) fit blows up."""
    if not segs:
        return None
    xs, ys = [], []
    for x1, y1, x2, y2 in segs:
        xs += [x1, x2]
        ys += [y1, y2]
    if len(set(ys)) < 2:
        return None
    m, b = np.polyfit(ys, xs, 1)
    return (m, b)


def smoothed(side, line):
    if line is not None:
        history[side].append(line)
    if not history[side]:
        return None
    a = np.array(history[side])
    return a[:, 0].mean(), a[:, 1].mean()


def draw_line(img, line, colour, h):
    if line is None:
        return None
    m, b = line
    top, bot = roi_bounds(h)
    x1, x2 = int(m * bot + b), int(m * top + b)
    cv2.line(img, (x1, bot), (x2, top), colour, 6)
    return x1


# --------------------------------------------------------------------------
# loop
# --------------------------------------------------------------------------
view_mode = 0
frame_no = 0
fps_n, fps_t, fps = 0, time.time(), 0.0

print(__doc__)

try:
    while True:
        frame_no += 1

        with stage("capture"):
            yuv = piCam.capture_array()
            # The luma plane is the top H rows — this IS the greyscale image,
            # no conversion needed.
            gray = yuv[:H, :W]

        with stage("tophat"):
            mask = marking_mask(gray)

        with stage("roi+hough"):
            top, bot = roi_bounds(H)
            # Crop first: Hough then works on a slice instead of the whole
            # frame, which is most of the saving.
            band = mask[top:bot, :]
            poly = roi_polygon(W, H, y_offset=top)
            keep = np.zeros_like(band)
            cv2.fillPoly(keep, poly, 255)
            cv2.bitwise_and(band, keep, band)
            left_segs, right_segs = segments(band, W, top)

        with stage("fit"):
            left = smoothed("left", fit(left_segs))
            right = smoothed("right", fit(right_segs))

        # ---- display, only now and then ----
        if show_window and frame_no % DISPLAY_EVERY == 0:
            with stage("display"):
                if view_mode == 1:
                    out = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
                else:
                    # colour conversion only happens on frames we actually show
                    out = cv2.cvtColor(yuv, cv2.COLOR_YUV420p2BGR)

                cv2.polylines(out, roi_polygon(W, H), True, (0, 220, 220), 1)
                lx = draw_line(out, left, (255, 170, 0), H)
                rx = draw_line(out, right, (0, 120, 255), H)

                offset_txt = ""
                if lx is not None and rx is not None:
                    centre = (lx + rx) / 2
                    off = (W / 2 - centre) / ((rx - lx) / 2 + 1e-6)
                    cv2.line(out, (int(centre), H - 6), (int(centre), H - 28),
                             (0, 255, 0), 3)
                    cv2.line(out, (W // 2, H - 6), (W // 2, H - 28),
                             (255, 255, 255), 2)
                    offset_txt = ("centred" if abs(off) < 0.18 else
                                  ("drifting right" if off < 0 else "drifting left"))

                status = (f"{fps:4.1f}fps  L{len(left_segs):3d} R{len(right_segs):3d} "
                          f" thr{settings['thresh']:3d} k{settings['kernel']:3d}  {offset_txt}")
                cv2.rectangle(out, (0, 0), (W, 20), (0, 0, 0), -1)
                cv2.putText(out, status, (5, 14), cv2.FONT_HERSHEY_SIMPLEX,
                            0.40, (150, 255, 150), 1)
                cv2.imshow("lane tracking", out)

        fps_n += 1
        if time.time() - fps_t >= 1.0:
            fps = fps_n / (time.time() - fps_t)
            fps_n, fps_t = 0, time.time()

        # waitKey(1) is also what pumps the window's event loop, so it has to
        # run every frame even when we aren't redrawing
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('d'):
            view_mode = (view_mode + 1) % 2
        elif key == ord(' '):
            show_window = not show_window
            if not show_window:
                cv2.destroyAllWindows()
                print("display off — this is the fastest the loop gets")
        elif key == ord('t'):
            settings["thresh"] = max(3, settings["thresh"] - 2)
        elif key == ord('T'):
            settings["thresh"] = min(120, settings["thresh"] + 2)
        elif key == ord('k'):
            settings["kernel"] = max(5, settings["kernel"] - 2)
        elif key == ord('K'):
            settings["kernel"] = min(81, settings["kernel"] + 2)
        elif key == ord('y'):
            settings["roi_top"] = max(25, settings["roi_top"] - 2)
        elif key == ord('Y'):
            settings["roi_top"] = min(settings["roi_bot"] - 6, settings["roi_top"] + 2)
        elif key == ord('h'):
            settings["roi_bot"] = max(settings["roi_top"] + 6, settings["roi_bot"] - 2)
        elif key == ord('H'):
            settings["roi_bot"] = min(100, settings["roi_bot"] + 2)
        elif key == ord('i'):
            report()
        elif key == ord('p'):
            print("settings =", settings)
        elif key == ord('s'):
            name = time.strftime("frame_%H%M%S.jpg")
            cv2.imwrite(name, cv2.cvtColor(yuv, cv2.COLOR_YUV420p2BGR))
            print("saved", name)

finally:
    cv2.destroyAllWindows()
    piCam.stop()
    report()
    print("Program Terminated")
