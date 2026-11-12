import 'leaflet/dist/leaflet.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/route.css';
import './styles/controls.css';
import './styles/stage.css';
import './styles/map.css';
import './styles/camera.css';
import './styles/guidance.css';
import './styles/driver.css';
import './styles/responsive.css';   // last: overrides the layout for phones

import { startApp } from './app.js';

const app = startApp();
if (import.meta.env.DEV) window.laneAssist = app;
