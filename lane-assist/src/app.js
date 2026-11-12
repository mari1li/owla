import { MPS_TO_MPH, REROUTE_EVERY_MS } from './config.js';
import { S, isNavigating } from './state.js';
import { $ } from './lib/dom.js';
import { keepAwake } from './lib/wakeLock.js';

import { R, planRoute, currentRoad } from './nav/route.js';
import { G, startGps, stopGps, matchFix, resetMatch, currentPlace, gpsStatus } from './nav/gps.js';
import { trip, recordFix, resetTrip, saveTripLocal, loadSavedTrip, tripSummary, downloadGpx } from './nav/trip.js';
import { stepDrive } from './nav/drive.js';

import { V, loadOpenCV, loadDetector } from './vision/loaders.js';
import { createCamera } from './vision/camera.js';
import { processLanes, laneAvg, resetLanes, invalidateMask, setRoadArea, startFindRoad } from './vision/lanes.js';
import { det, runDetect, activeTracks, resetTracks } from './vision/detector.js';
import { loadRoi, defaultRoi } from './vision/roi.js';

import { laneStates, decide, withPosition } from './guidance/fusion.js';
import { createInstructions } from './guidance/instructions.js';
import { voice } from './guidance/voice.js';

import { createHeader } from './components/Header.js';
import { createTabBar } from './components/TabBar.js';
import { createRouteForm } from './components/RouteForm.js';
import { createControls } from './components/Controls.js';
import { createMapView } from './components/MapView.js';
import { createCameraView } from './components/CameraView.js';
import { createGuidancePanel } from './components/GuidancePanel.js';
import { createDriverPage } from './components/DriverPage.js';

/* The app: mounts the components and owns the flow between them — routing, starting and
   stopping navigation, GPS fixes, rerouting, arrival, the camera, and one main loop that
   advances the map and the vision on the same clock. */
export function startApp() {
  const savedRoi = loadRoi();
  S.roi = savedRoi || defaultRoi();
  let savedTrip = loadSavedTrip();
  let autoFindTried = false;

  // ---------- components ----------
  const header = createHeader('header-slot');
  const tabs = createTabBar('tabbar-slot', { onSelect: showPage });
  const mapView = createMapView('map-slot');
  const relayout = () => requestAnimationFrame(() => mapView.invalidate());
  const routeForm = createRouteForm('route-slot', { onSubmit: submitRoute, getNear: () => mapView.center(), onLayout: relayout });
  const controls = createControls('controls-slot', {
    onCamera: () => camera.start(),
    onNav: toggleNav,
    onMute: () => { voice.setMuted(!voice.muted); controls.setMuted(voice.muted); },
    onTrip: () => downloadGpx(trip.pts.length ? trip.pts : savedTrip),
  });
  const cameraView = createCameraView('camera-slot', {
    roadArea: {
      get: () => S.roi,
      set: setRoadArea,
      reset: () => { setRoadArea(defaultRoi()); cameraView.message('Back to the default road area.'); },
      find: () => findRoad(),
    },
  });
  const guidance = createGuidancePanel('guidance-slot');
  const driver = createDriverPage('driver-slot', {
    onMargin: setMargin,
    onSource: setSource,
    onTune: (k, v) => { S.tune[k] = v; },
    onEditRoad: () => {
      showPage('nav');
      if (!S.camLive) { cameraView.message('Turn on the camera first.'); return; }
      cameraView.editRoadArea();
    },
    onFindRoad: () => { showPage('nav'); findRoad(); },
  });
  const instructions = createInstructions({ render: ins => guidance.render(ins), say: (t, p) => voice.say(t, p) });

  const camera = createCamera({
    onStarting: () => controls.setCamera({ starting: true }),
    onLive(info) {
      if (info.resized) { invalidateMask(); resetLanes(); resetTracks(); }
      S.camLive = true;
      cameraView.showLive(info);
      controls.setCamera({ hidden: true });
      // No road area saved on this phone yet: try to find it once the picture has settled.
      if (!savedRoi && !autoFindTried) { autoFindTried = true; setTimeout(() => findRoad(true), 2000); }
      relayout();
    },
    onStopped(message) {
      S.camLive = false;
      cameraView.showOff(message);
      controls.setCamera({ hidden: false });
    },
  });

  // ---------- pages, profile, position source ----------
  function showPage(p) {
    $('pageNav').hidden = p !== 'nav';
    $('pageProfile').hidden = p !== 'profile';
    tabs.select(p);
  }
  function setMargin(m) {
    S.margin = m;
    driver.setMargin(m);
    guidance.setProfile(m);
  }
  function setSource(src) {
    if (S.navigating) toggleNav();
    S.source = src;
    if (src !== 'gps') { stopGps(); mapView.hideAccuracy(); }
    resetMatch();
    if (S.routed && !S.navigating) S.s = 0;
    driver.setSource(src);
    header.setSource(src);
  }

  // ---------- road area ----------
  function findRoad(quiet = false) {
    if (!S.camLive || !V.cv) {
      if (!quiet) cameraView.message(S.camLive ? 'Still loading OpenCV…' : 'Turn on the camera first.');
      return;
    }
    if (!quiet) cameraView.message('Looking for lane lines… keep the road in view.', 0);
    startFindRoad(ok => {
      if (ok) cameraView.message('Road area set. Check it lines up, and drag the corners if not.');
      else if (!quiet) cameraView.message("Couldn't find lane lines. Drag the corners onto the road instead.");
    });
  }

  // ---------- route ----------
  function routeLoaded(keepView) {
    mapView.showRoute(R, { keepView });
    if (!keepView) { S.heading = null; S.speed = 0; }
    S.s = 0; S.routed = true; S.arrived = false;
    resetMatch();
    mapView.update(stepDrive(0, false));
  }
  async function submitRoute({ from, to }) {
    if (S.navigating) toggleNav();
    const r = await planRoute(from || await currentPlace(), to);
    routeLoaded(false);
    if (S.source === 'gps') clearTrip();
    controls.setNavEnabled(true);
    instructions.show({ text: 'Route ready', sub: S.camLive ? 'Start navigation when ready.' : 'Start navigation when ready. It turns on the camera too.' });
    return `${r.from} → ${r.to} · ${r.miles.toFixed(1)} mi · ${Math.round(r.mins)} min`;
  }
  async function reroute() {
    G.lastReroute = performance.now();
    try {
      const r = await planRoute({ lat: G.fix.p[0], lon: G.fix.p[1], name: 'Here' }, R.dest);
      routeLoaded(true);
      routeForm.setSummary(`New route → ${r.to} · ${r.miles.toFixed(1)} mi · ${Math.round(r.mins)} min`);
      updateMatch();
    } catch { /* no signal or no route; try again in 15 s */ }
  }

  // ---------- GPS and the trip ----------
  function updateMatch() {
    if (!S.routed || S.source !== 'gps') return;
    matchFix(R);
    if (G.offRoute && isNavigating() && performance.now() - G.lastReroute > REROUTE_EVERY_MS) reroute();
  }
  function onFix(fix) {
    mapView.showAccuracy(fix.p, fix.acc);
    if (isNavigating()) {
      recordFix(fix, G.speed, G.course);
      mapView.addTrailPoint(fix.p);
    }
    updateMatch();
  }
  function clearTrip() {
    resetTrip();
    mapView.clearTrail();
    controls.setTrip(null);
  }
  function endTrip() {
    stopGps();
    if (trip.pts.length > 1) { saveTripLocal(); savedTrip = null; controls.setTrip('Save trip'); }
  }

  // ---------- navigation ----------
  function toggleNav() {
    if (!S.routed) return;
    if (!S.started) {
      voice.unlock();          // iOS only allows speech after a tap; unlock it here
      S.started = true;
    }
    camera.start();            // same tap, so iOS shows the camera prompt
    S.navigating = !S.navigating;
    if (S.navigating) {
      if (S.arrived) { S.s = 0; S.speed = 0; S.arrived = false; if (S.source === 'gps') clearTrip(); }
      if (S.source === 'gps') { startGps(onFix); controls.setTrip(null); updateMatch(); }
      S.heading = null;
      mapView.setFollow(true);
      keepAwake(true);
    } else {
      keepAwake(false);
      voice.stop();
      endTrip();
      instructions.show({ text: 'Navigation stopped', sub: [tripSummary(), 'Start navigation to resume guidance.'].filter(Boolean).join(' ') });
    }
    controls.setNavigating(S.navigating);
  }
  function arrive() {
    S.navigating = false; S.arrived = true;
    endTrip();
    instructions.show({ text: 'You have arrived', sub: tripSummary() || 'Start navigation to drive the route again, or change the route.' });
    voice.say('You have arrived', 3);
    keepAwake(false);
    controls.setNavigating(false);
  }

  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !/INPUT|BUTTON|SUMMARY/.test(document.activeElement.tagName)) { e.preventDefault(); toggleNav(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && S.navigating) keepAwake(true);
  });

  // ---------- main loop: one clock for map and vision ----------
  let lastNow = performance.now(), frameNo = 0, lastDetFrame = -1, frameT = 0;
  let fpsFrames = 0, fpsDet = 0, fpsT = performance.now();

  function loop(now) {
    const dt = Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    const frame = stepDrive(dt, isNavigating());
    if (frame) {
      mapView.update(frame);
      if (frame.arrived) arrive();
    }
    const nx = frame ? frame.nx : null;

    if (S.camLive && camera.ready()) {
      if (camera.grabFrame()) {
        frameT = now / 1000;
        frameNo++;
        if (V.cv) {
          try { processLanes(camera.ctx, camera.proc.width, camera.proc.height); } catch (e) { console.error(e); }
        }
        fpsFrames++;
      }
      if (V.model && !det.busy && frameNo !== lastDetFrame) { lastDetFrame = frameNo; runDetect(V.model, camera.proc, frameT, S.tune.focal); }
      cameraView.draw(camera.proc, { roi: S.roi, lanes: { left: laneAvg('left'), right: laneAvg('right') }, tracks: det.tracks, margin: S.margin });
    }

    const L = laneStates(activeTracks(), { live: S.camLive && det.live, margin: S.margin });
    guidance.update(L, nx, {
      routed: S.routed, remaining: frame ? frame.remaining : 0, camLive: S.camLive,
      lines: { left: !!laneAvg('left'), right: !!laneAvg('right') },
    });
    if (isNavigating()) {
      const ins = decide(L, nx, S.margin, { camLive: S.camLive, road: currentRoad(S.s) });
      instructions.settle(withPosition(ins, { source: S.source, fix: G.fix, denied: G.denied, err: G.err, offRoute: G.offRoute }), now);
    }
    mapView.setGpsStatus(gpsStatus(S.source));
    voice.pump();

    if (now - fpsT >= 1000) {
      const secs = (now - fpsT) / 1000, f = fpsFrames / secs, dps = (det.count - fpsDet) / secs;
      guidance.setFps(S.camLive ? `${f.toFixed(0)} fps · ${dps.toFixed(1)} detections/s` : '— fps', S.camLive && f < 10);
      fpsFrames = 0; fpsDet = det.count; fpsT = now;
    }
    requestAnimationFrame(loop);
  }

  // ---------- start ----------
  setMargin(S.margin);
  setSource(S.source);
  if (savedTrip) controls.setTrip('Save last trip');
  cameraView.setVisionStatus(V.status);
  const statusUpdate = () => cameraView.setVisionStatus(V.status);
  loadOpenCV().then(statusUpdate);
  loadDetector().then(statusUpdate);
  requestAnimationFrame(loop);

  // Handy for debugging in the console; not used by the app.
  return { S, R, G, trip, det, mph: () => S.speed * MPS_TO_MPH };
}
