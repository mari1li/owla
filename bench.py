"""
Will Option B actually run on this Pi?

Times each stage separately so you know where the budget goes, then tells you
what cadence is realistic. Takes about a minute.

    python3 bench.py

Needs: python3-opencv, python3-picamera2.
Object detection is tested only if ultralytics is installed - skipped otherwise,
and the lane numbers are still useful on their own.
"""

import time
import statistics as stats

import cv2
import numpy as np

W, H = 640, 360
WARMUP = 5
RUNS = 40


def timeit(fn, runs=RUNS, warmup=WARMUP):
    for _ in range(warmup):
        fn()
    samples = []
    for _ in range(runs):
        t = time.perf_counter()
        fn()
        samples.append((time.perf_counter() - t) * 1000)
    samples.sort()
    return {
        "median": stats.median(samples),
        "p90": samples[int(len(samples) * 0.9)],
        "max": samples[-1],
    }


def show(name, r, note=""):
    print(f"  {name:<26}{r['median']:7.1f} ms   p90 {r['p90']:6.1f}   {note}")


# --------------------------------------------------------------------------
print("=" * 62)
print("  Pi vision benchmark")
print("=" * 62)

# ---- camera ----
print("\n1. capture")
try:
    from picamera2 import Picamera2
    cam = Picamera2()
    cam.configure(cam.create_video_configuration(
        main={"size": (W, H), "format": "YUV420"},
        controls={"FrameRate": 30}, buffer_count=4))
    cam.start()
    time.sleep(2)

    cap = timeit(lambda: cam.capture_array())
    show("capture_array", cap)
    frame = cam.capture_array()
    gray = frame[:H, :W].copy()          # luma plane is already greyscale
    print("     (YUV420 means no colour conversion needed - the Y plane IS grey)")
except Exception as e:
    print(f"     picamera2 unavailable ({e}) - using a synthetic frame")
    cam = None
    gray = (np.random.rand(H, W) * 255).astype(np.uint8)
    cap = {"median": 0, "p90": 0, "max": 0}

# ---- lane detection ----
print("\n2. lane detection")

KERN = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 1))
roi = np.zeros((H, W), np.uint8)
cv2.fillPoly(roi, np.array([[(int(W*.02), H), (int(W*.42), int(H*.62)),
                             (int(W*.58), int(H*.62)), (int(W*.98), H)]], np.int32), 255)


def lanes():
    g = cv2.GaussianBlur(gray, (5, 5), 0)
    th = cv2.morphologyEx(g, cv2.MORPH_TOPHAT, KERN)
    _, b = cv2.threshold(th, 25, 255, cv2.THRESH_BINARY)
    b = cv2.bitwise_and(b, roi)
    return cv2.HoughLinesP(b, 2, np.pi/180, 40, minLineLength=30, maxLineGap=90)


lane = timeit(lanes)
show("tophat + hough", lane)

# ---- object detection ----
print("\n3. object detection")
det = None
backend = None

try:
    from ultralytics import YOLO
    import os

    bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    if os.path.isdir("yolov8n_ncnn_model"):
        model = YOLO("yolov8n_ncnn_model")
        backend = "NCNN"
    else:
        model = YOLO("yolov8n.pt")
        backend = "PyTorch"
        print("     no NCNN export found - timing PyTorch, which is the slow path")

    det = timeit(lambda: model(bgr, imgsz=320, verbose=False),
                 runs=12, warmup=3)
    show(f"YOLOv8n ({backend}, 320px)", det)

    if backend == "PyTorch":
        print("\n     Export to NCNN for roughly 2-3x on ARM:")
        print("       from ultralytics import YOLO")
        print("       YOLO('yolov8n.pt').export(format='ncnn')")

except ImportError:
    print("     ultralytics not installed - skipping")
    print("       pip3 install ultralytics --break-system-packages")
except Exception as e:
    print(f"     failed: {e}")

# --------------------------------------------------------------------------
print("\n" + "=" * 62)
print("  what this means")
print("=" * 62)

lane_loop = cap["median"] + lane["median"]
lane_fps = 1000 / lane_loop if lane_loop else 0
print(f"\n  Lanes only:        {lane_fps:5.1f} fps   ({lane_loop:.0f} ms/frame)")

if det:
    both = cap["median"] + lane["median"] + det["median"]
    print(f"  Lanes + objects:   {1000/both:5.1f} fps   ({both:.0f} ms/frame)")

    # split cadence: lanes every frame, objects every Nth
    print("\n  Splitting the cadence - lanes every frame, objects every Nth:")
    for n in (2, 3, 4, 5, 6):
        avg = cap["median"] + lane["median"] + det["median"] / n
        print(f"    every {n}th frame  ->  {1000/avg:5.1f} fps lanes, "
              f"{1000/avg/n:4.1f} fps objects")

    print("\n  Closing-speed note: object fps is what sets how fast you can")
    print("  estimate a car's approach. Below about 4 fps you need a full")
    print("  second of observation before the number settles, so a vehicle")
    print("  that appears suddenly gets flagged late. Aim for 4+.")
else:
    print("\n  Install ultralytics to find out whether object detection fits.")
    print("  Lane detection alone clearly does.")

print("\n  Budget check: a usable alert should land inside ~400 ms of the")
print("  moment it describes. Add your transmit time (a few ms over local")
print("  WiFi) to the per-frame number above.\n")

if cam:
    cam.stop()
