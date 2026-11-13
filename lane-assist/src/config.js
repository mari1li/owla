/* App-wide constants. Service URLs can be overridden at build time with VITE_* variables
   (see .env.example), for example to use your own OSRM server instead of the public one. */
const env = import.meta.env || {};

export const SERVICES = {
  nominatim: env.VITE_NOMINATIM_URL || 'https://nominatim.openstreetmap.org',
  osrm: env.VITE_OSRM_URL || 'https://router.project-osrm.org',
  photon: env.VITE_PHOTON_URL || 'https://photon.komoot.io',
  tiles: env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  opencv: env.VITE_OPENCV_URL || 'https://docs.opencv.org/4.9.0/opencv.js',
};

export const MILE = 1609.344;
export const MPS_TO_MPH = 2.236936;

// Vision
export const WATCH_RANGE_M = 60;      // traffic further away than this doesn't affect a lane
export const PROC_MAX_WIDTH = 640;    // frames are processed at most this wide
export const AUTO_FIND_FRAMES = 40;   // about 1.5 s of frames to find the road automatically

// GPS
export const MAX_GPS_SPEED = 70;      // m/s (about 155 mph): faster between fixes is a GPS jump, not driving
export const REROUTE_EVERY_MS = 15000;
export const ARRIVE_WITHIN_M = 30;

export const PROFILES = { 8: 'First-year driver', 6: 'Newer driver', 4: 'Confident driver' };
export const DEFAULT_MARGIN = 6;
export const KIND_NOUN = { exit: 'Exit', fork: 'Fork', ramp: 'Ramp', turn: 'Turn' };

// Road area: four corners as fractions of the frame. The default is the lower part of the
// picture from a dash-mounted phone; it can be moved anywhere (see vision/roi.js).
export const ROI_DEFAULT = Object.freeze({ tl: [0.42, 0.60], tr: [0.58, 0.60], br: [1, 0.94], bl: [0, 0.94] });

// Plans shown on the Plans tab. Prices in USD. Payments aren't wired up yet: the paid plans
// show "Coming soon". `ready: false` marks features that are planned but not built.
export const PLANS = [
  {
    id: 'free', name: 'Free', tagline: 'Everything that keeps you safe on the road.',
    monthly: 0, yearly: 0,
    features: [
      { text: 'Turn-by-turn navigation with voice', ready: true },
      { text: 'Lane detection and the lane ribbon', ready: true },
      { text: 'Closing-traffic and person warnings', ready: true },
      { text: 'Blind-spot reminders on every lane change', ready: true },
      { text: 'Three driver profiles (8 s, 6 s, 4 s margins)', ready: true },
      { text: 'Last trip saved as a GPX file', ready: true },
    ],
  },
  {
    id: 'plus', name: 'Plus', tagline: 'For learners building skills and logging hours.',
    monthly: 3.99, yearly: 34.99, popular: true,
    features: [
      { text: 'Everything in Free', ready: true },
      { text: 'Unlimited trip history', ready: false },
      { text: 'Practice-hours log for your permit (day and night hours)', ready: false },
      { text: 'Drive report after each trip: following distance, hard braking, lane changes', ready: false },
      { text: 'Weekly progress summary', ready: false },
      { text: 'Choose the voice, speed and how chatty it is', ready: false },
    ],
  },
  {
    id: 'family', name: 'Family', tagline: 'For a parent or instructor riding along.',
    monthly: 7.99, yearly: 69.99,
    features: [
      { text: 'Everything in Plus', ready: true },
      { text: 'Up to 4 drivers', ready: false },
      { text: 'Supervisor view: trip summaries and practice hours for each driver', ready: false },
      { text: 'Share a trip report with a link', ready: false },
      { text: 'Export practice hours for the DMV', ready: false },
    ],
  },
];

export const STORAGE = { trip: 'laneAssistTrip', roi: 'laneAssistRoi' };

export const MAP_START = { center: [37.3382, -121.8863], zoom: 12 };

// Canvas and map colours (the CSS has the same values as custom properties in styles/tokens.css).
export const COLORS = {
  ink: '#0C1410',
  paper: '#F2F4F0',
  guide: '#0F6B3F',
  guideLit: '#1FA45F',
  caution: '#F2A33C',
  stop: '#D23B2E',
  trail: '#7FB2FF',
};
