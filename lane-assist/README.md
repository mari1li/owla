# New-driver lane assist

A phone web app for new drivers. The phone is mounted on the dash with its rear camera looking
at the road. It combines turn-by-turn navigation (GPS, OpenStreetMap, OSRM) with on-device
computer vision (OpenCV.js lane detection, COCO-SSD vehicle and person detection) into **one
spoken instruction**, such as "Exit in 0.6 miles. Right lane is clear. Check your right blind
spot, then move over." It never says a move is safe.

Plain JavaScript (ES modules) built with [Vite](https://vitejs.dev). No framework and no
backend: everything runs on the phone.

## Quick start

You need [Node.js](https://nodejs.org) 18+ (or [Bun](https://bun.sh)).

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. On a computer, the camera and location work on `localhost`.
To try the app at a desk, set **Driver → Position → Simulated drive**: the car then drives the
route at typical speeds instead of following GPS.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload. It also listens on your network so a phone can open it, but see the next section about HTTPS. |
| `npm test` | Unit tests (Vitest), about 0.3 s |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |

With Bun: `bun install`, then `bunx --bun vite`, `bunx --bun vitest run` and `bunx --bun vite build`.

## Running it on a phone (HTTPS)

Browsers only allow the camera and GPS on a **secure (https://) page**, so the phone needs an
https address. A plain `http://<computer-ip>:5173` won't work.

**GitHub Pages** (free; the workflow is in `.github/workflows/pages.yml` at the repo root):

1. One time: on GitHub, open the repo's **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to main. The **Actions** tab shows the build: it installs, runs the tests, builds and
   publishes. If the tests fail, nothing is published.
3. The app is at **https://mari1li.github.io/owla/**. Every push that changes `lane-assist/`
   redeploys it in a minute or two.

The build is served from `/owla/`, so the workflow sets `BASE_PATH=/owla/`. Locally, and on
Netlify, it stays at `/`.

**Netlify** (also free; `netlify.toml` is already set up):

- **From Git:** in Netlify choose **Add new site → Import an existing project**, pick the
  `owla` repo, and set **Base directory** to `lane-assist`. The rest comes from `netlify.toml`
  (`npm run build`, publish `dist`). Every push to main redeploys.
- **By hand:** run `npm run build`, then drag the `dist/` folder onto
  <https://app.netlify.com/drop>.

Open the `https://….netlify.app` address in Safari. **Share → Add to Home Screen** makes it
open full screen like an app (there's a web app manifest).

In the car:

1. Mount the phone **sideways**, with the rear camera looking out of the windscreen.
2. Turn Silent mode off and the volume up, or connect to the car by Bluetooth or CarPlay.
3. Enter a destination (leave Start blank to start where you are), tap **Start navigation**,
   and **Allow** the camera and your location.
4. Check the **road area** once per mount (see [The road area](#the-road-area)).

If something was refused:

- Camera: **Settings → Apps → Safari → Camera**.
- Location: **Settings → Privacy & Security → Location Services → Safari Websites**.

## Project structure

```
index.html              Page shell: empty slots the components mount into
public/                 Icon and web app manifest (copied as-is)
src/
  main.js               Entry: styles, then startApp()
  app.js                Mounts the components and owns the flow: routing, start/stop,
                        GPS fixes, rerouting, arrival, the camera, and the main loop
  config.js             Constants and service URLs (overridable with VITE_* env vars)
  state.js              Shared app state (S)

  components/           UI. Each one renders its own markup into a slot and returns a small API
    Header.js           Title and the "GPS position / Simulated drive" line
    TabBar.js           Navigate / Driver tabs (left rail, or bottom bar on phones)
    RouteForm.js        Start and destination, collapses to a summary once routed
    PlaceSuggest.js     Type-ahead place suggestions (accessible combobox)
    Controls.js         Turn on camera, Start/Stop navigation, Voice, Save trip
    MapView.js          Leaflet map, route, car, trail, accuracy circle, HUD; heading-up follow
    CameraView.js       Camera pane: live overlay, "camera off" state, road-area controls
    cameraOverlay.js    Draws road area, lane lines and tracked boxes on the frame
    RoadAreaEditor.js   Drag the road area's corners, or the whole shape
    GuidancePanel.js    The instruction, blind-spot check, inputs and lane ribbon
    LaneRibbon.js       Left lane · you · right lane, coloured by state
    DriverPage.js       Driver profile, position source, camera tuning
    PricingPage.js      Plans tab: Free / Plus / Family, monthly or yearly (plans in config.js)

  nav/                  Where the car is and where it's going
    route.js            Active route (R), maneuvers from OSRM steps, position along the route
    gps.js              Live GPS (G): speed, course, snapping to the route, off-route detection
    drive.js            One tick of the car: follows GPS between fixes, or simulates
    trip.js             Trip log, summary, GPX export, local backup

  vision/               What the camera sees
    camera.js           Rear camera stream and the processing canvas
    loaders.js          Loads OpenCV.js (CDN) and TensorFlow.js + COCO-SSD (lazy chunk)
    lanes.js            Lane detection and "find the road" automatically
    roi.js              Road-area geometry and saving it on the phone
    detector.js         COCO-SSD runs, IoU tracker, distance and time-to-arrival

  guidance/             Turning it all into one instruction
    fusion.js           Lane states, priority rules, position problems (pure functions)
    instructions.js     Hysteresis: urgent takes over, the rest must hold 0.9 s
    voice.js            Speech rules: no repeats, spacing, urgent interrupts

  services/             The only code that calls external APIs
    geocode.js          Nominatim (free text → place)
    routing.js          OSRM (driving route with steps and speeds)
    places.js           Photon (type-ahead suggestions)

  lib/                  Small helpers: DOM, geometry, storage, script loading, wake lock
  styles/               CSS by area; tokens.css holds the colours, responsive.css the phone layouts
tests/                  Vitest unit tests for the logic (no browser needed)
```

### How a frame flows

`app.js` runs one `requestAnimationFrame` loop. Each tick:

1. **Position.** `nav/drive.js` moves the car: toward the latest GPS fix (snapped to the route),
   or along the route in simulated mode. `MapView` draws it heading-up.
2. **Vision.** When the camera has a new frame, `vision/lanes.js` finds lane lines inside the
   road area. `vision/detector.js` runs COCO-SSD on the newest frame, never queueing, and
   updates the tracks. `CameraView` draws the overlay.
3. **Fusion.** `guidance/fusion.js` turns the tracks into left / ahead / right lane states.
   Then `decide()` picks one instruction from the lane states and the next maneuver.
   `withPosition()` replaces it with a GPS message when there's no fix or you're off route.
4. **Output.** `guidance/instructions.js` settles it (no flicker), `GuidancePanel` shows it,
   and `voice.js` speaks it.

GPS fixes arrive separately, about once a second. Each fix is recorded to the trip, matched to
the route, and triggers a reroute after three fixes clearly off it.

### Conventions

- **Components** mount with `mount(slotId, markup)` and expose methods (`update`, `render`,
  `set…`). They don't import each other; `app.js` wires them together with callbacks.
- **Logic modules** (`nav/`, `vision/`, `guidance/`) don't touch the DOM, except `camera.js`,
  which owns its hidden `<video>`. Pure functions take what they need as arguments, so they
  can be tested in Node.
- **Templates** are static strings. Anything from the network or the user goes through
  `textContent` (`setText`), never `innerHTML`.
- **External services** are called only from `src/services/`. Their URLs live in `config.js`.

## Configuration

Copy `.env.example` to `.env` to use your own services. OpenStreetMap's public servers are
rate-limited and meant for light use, so a real deployment should run its own OSRM and
Nominatim, or use a hosted provider:

```
VITE_OSRM_URL=https://your-osrm.example.com
VITE_NOMINATIM_URL=…
VITE_PHOTON_URL=…
VITE_TILE_URL=…
VITE_OPENCV_URL=…
```

The addresses you type go to the geocoding services. GPS positions and the trip log stay on
the phone.

## Tests

```bash
npm test
```

There are 46 tests covering:

- geometry and formatting
- maneuvers built from OSRM steps
- GPS speed (Doppler, distance over time, wander, glitches)
- route matching and off-route detection
- trip distance and GPX output
- the guidance priorities, including that nothing ever says "safe"
- road-area geometry
- lane fitting
- finding the road automatically
- detector distance and time-to-arrival

The camera, map and speech need a real browser and phone; test those by hand.

---

## How it works

### Position and speed

With **Phone GPS** (the default), the map follows the phone as soon as a route is set, so
the car shows where you are before you start navigating.

- **The location stream is kept alive.** The app asks for updates without a timeout (on iPhones
  a timeout can end the stream). It restarts the stream after an error, after 10 s without a fix,
  and whenever the page comes back from the background.
- **Approximate location is detected.** With Precise Location off, fixes are 1–3 km off. The
  app shows "Location is only approximate" and where to turn Precise Location on, places the car
  at the rough position, and doesn't reroute.
- **The HUD shows the fix**: `GPS ±8 m`, `approximate`, or `GPS lost 12 s`.

- **Speed** is the phone's own GPS speed when it reports one. Otherwise it's the distance
  between fixes over the time between them.
  - Movement smaller than the fix's uncertainty counts as standing still.
  - A jump faster than about 155 mph is a glitch and is ignored.
- **Position** is snapped onto the route. Between fixes the car carries on at the measured
  speed, so the map glides instead of hopping.
- **Off route**: after three fixes clearly away from the route (35–80 m, depending on accuracy),
  the app says "Off route — finding a new route" and reroutes from where you are, at most every
  15 s.
- **Arrival** happens within 30 m of the end of the route.
- **Trip log**: every fix while navigating is recorded and drawn as a blue trail.
  - Stopping or arriving shows the distance, time, average and top speed.
  - **Save trip** downloads a `.gpx` file.
  - A copy is kept on the phone in case the page reloads.

### Guidance

Each frame is split into thirds: left lane, ahead, and right lane. A lane turns **red
(closing)** when something in it, within 60 m, would reach you within the driver's margin:
8 s for a first-year driver, 6 s for a newer driver, 4 s for a confident one. Higher priority
wins:

1. A person is detected → "Person near the road".
2. Traffic is closing inside the margin → "Hold — traffic closing on your right".
3. A maneuver is coming up and that side is clear → "Exit in 0.6 miles — right lane is clear",
   plus "Check your right blind spot, then move over". The camera only sees ahead.
4. A maneuver is coming up and that side is occupied → "Exit ahead — wait for a gap on your right".
5. Otherwise a quiet state: "Both sides look clear".

"Coming up" means within 1 mile for exits and forks, and 400 m for turns and ramps.

Voice rules:

- The same phrase isn't repeated within 5 s.
- Nothing non-urgent is spoken within 1.6 s of anything else.
- Priorities 1–2 interrupt; 3–5 wait their turn.

### The road area

Lanes are only looked for inside the **road area**, the dashed four-corner shape on the camera
view. It can sit anywhere in the picture (bottom, top or off to one side), whatever the mount.

- **Automatically.** The first time the camera starts, the app looks for lane-like lines across
  the whole picture for about 1.5 s. It finds their vanishing point and puts the area around
  the lines that run through it. Run it again with **Road area → Find the road**.
- **By hand.** Tap **Road area**, then drag a corner, or drag inside to move the whole shape.
  **Reset** restores the default.

Left and right lane lines are split at the middle of the road area, not the middle of the
picture. The area is saved on the phone.

### Real or estimated

| Part | Status |
|---|---|
| Route and maneuvers | Real (Nominatim, OSRM) |
| Position and speed | Real with Phone GPS; simulated in Simulated drive mode |
| Lane detection | Real (top-hat, Hough, least-squares fit, 10-frame average) |
| Vehicle and person detection | Real (COCO-SSD lite MobileNet v2) |
| Distance | Estimated (pinhole model, tunable focal length) |
| Closing speed and time-to-arrival | Inferred from how fast a box grows |

## Plans

The **Plans** tab offers three tiers. Safety features stay free for everyone.

| Plan | Price | Adds |
|---|---|---|
| Free | $0 | Navigation, voice, lane detection, closing-traffic and person warnings, blind-spot reminders, 3 driver profiles, last trip as GPX |
| Plus | $3.99/month or $34.99/year | Unlimited trip history, permit practice-hours log, drive reports, weekly progress, voice settings |
| Family | $7.99/month or $69.99/year | Up to 4 drivers, supervisor view, shareable trip reports, practice hours export |

Plans, prices and features are edited in `PLANS` in `src/config.js`. Payments aren't wired up:
the paid plans show **Coming soon**, and features that aren't built yet are marked *soon*.
Selling plans needs a payment provider (for example Stripe Checkout) and a small backend to
check who has paid.

## Limitations

- **Daylight only.** There's no night, rain or glare handling.
- **No blind-spot coverage.** There's one forward camera, so cars alongside or behind you
  aren't seen.
- **Distances need calibrating per camera.** The default focal length (480 px at 640 px wide)
  suits an iPhone 1× camera.
- **Left / ahead / right is a split into thirds**, not real lane assignment. On curves, a car in
  your lane can land in a side third.
- **GPS is metres, not lanes.** The map knows the road, not the lane. Tunnels lose GPS.
- **The screen must stay on.** iPhones stop the camera and voice when the screen locks.
  Navigating asks to keep it awake; keep the phone charging.
- **Public map services are rate-limited.** See [Configuration](#configuration).
