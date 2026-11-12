import { DEFAULT_MARGIN } from './config.js';

// Shared app state. Modules read and write these fields directly; app.js owns the flow
// (what happens when navigation starts, stops, reroutes or arrives).
export const S = {
  started: false,     // the first Start navigation tap happened (speech is unlocked)
  navigating: false,
  arrived: false,
  routed: false,
  camLive: false,
  source: 'gps',      // 'gps' = the phone's real position, 'sim' = drive the route at typical speeds
  margin: DEFAULT_MARGIN,
  s: 0,               // distance along the route, metres
  speed: 0,           // m/s
  heading: null,      // degrees, smoothed
  tune: { thr: 25, focal: 480 },
  roi: null,          // road area, set at startup (vision/roi.js)
};

export const isNavigating = () => S.started && S.navigating;
