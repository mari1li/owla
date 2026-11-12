import L from 'leaflet';
import { COLORS, MAP_START, MPS_TO_MPH, SERVICES } from '../config.js';
import { $, mount, setText } from '../lib/dom.js';
import { toRad, fmtDistShort } from '../lib/geo.js';

const CAR_ICON = `<div class="car-icon"><svg viewBox="0 0 24 24"><path d="M12 2 L20 21 L12 17 L4 21 Z" fill="${COLORS.paper}" stroke="${COLORS.ink}" stroke-width="1.5" stroke-linejoin="round"/></svg></div>`;

/* The map pane: Leaflet + OSM tiles, the route and its maneuvers, the car, the GPS trail
   and accuracy circle, and the HUD (speed, GPS status, next maneuver).
   While following, the map is heading-up: the map element is a square as wide as the pane's
   diagonal, rotated against the heading, so the arrow always points up and no corner shows. */
export function createMapView(slotId) {
  mount(slotId, `
    <section class="pane" id="mapPane" aria-label="Navigation map">
      <div id="map"></div>
      <div class="map-zoom">
        <button class="btn" type="button" id="zoomIn" aria-label="Zoom in">+</button>
        <button class="btn" type="button" id="zoomOut" aria-label="Zoom out">−</button>
      </div>
      <span class="tag map-credit">&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</span>
      <div class="hud">
        <div class="speed"><b id="spd">0</b><small>mph</small><small class="gps num" id="gpsInfo"></small></div>
        <div>
          <div class="meta">Next</div>
          <div class="exname" id="exName">—</div>
          <div class="meta num" id="exInfo">—</div>
        </div>
      </div>
    </section>`);
  const pane = $('mapPane'), el = $('map');
  const hud = { spd: $('spd'), gps: $('gpsInfo'), name: $('exName'), info: $('exInfo') };

  // Attribution and zoom live outside the map element so they don't rotate with it.
  const map = L.map(el, { zoomControl: false, attributionControl: false, scrollWheelZoom: 'center', touchZoom: 'center' })
    .setView(MAP_START.center, MAP_START.zoom);
  L.tileLayer(SERVICES.tiles, { maxZoom: 18 }).addTo(map);
  $('zoomIn').addEventListener('click', () => map.zoomIn());
  $('zoomOut').addEventListener('click', () => map.zoomOut());

  const routeLayer = L.layerGroup().addTo(map);
  const trail = L.polyline([], { color: COLORS.trail, weight: 4, opacity: .85, interactive: false }).addTo(map);
  const accuracy = L.circle([0, 0], { radius: 1, color: COLORS.trail, weight: 1, fillOpacity: .1, interactive: false });
  const car = L.marker([0, 0], {
    interactive: false, zIndexOffset: 1000,
    icon: L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14], html: CAR_ICON }),
  });
  let markers = new Map(), highlighted, rotation = null, follow = false;

  function sizeMap() {
    const r = pane.getBoundingClientRect(), d = Math.ceil(Math.hypot(r.width, r.height));
    el.style.width = el.style.height = d + 'px';
    map.invalidateSize({ pan: false });
  }
  new ResizeObserver(sizeMap).observe(pane);
  addEventListener('resize', () => map.invalidateSize());
  sizeMap();

  // Padding that keeps a fitted route inside the visible pane, not the oversized map.
  function visiblePad() {
    const r = pane.getBoundingClientRect(), d = el.offsetWidth;
    return [(d - r.width) / 2 + 30, (d - r.height) / 2 + 30];
  }
  function rotate(deg) {
    if (rotation !== null && Math.abs(deg - rotation) < 0.05) return;
    rotation = deg;
    el.style.setProperty('--rot', deg.toFixed(2) + 'deg');
  }

  return {
    center: () => map.getCenter(),
    invalidate: () => map.invalidateSize(),

    // keepView: a reroute mid-drive (stay heading-up on the car instead of fitting the route).
    showRoute(route, { keepView = false } = {}) {
      routeLayer.clearLayers();
      markers = new Map();
      highlighted = undefined;
      L.polyline(route.pts, { color: COLORS.guideLit, weight: 6, opacity: .9 }).addTo(routeLayer);
      for (const mv of route.moves) {
        markers.set(mv, L.circleMarker(mv.at, { radius: 5, color: COLORS.paper, weight: 2, fillColor: COLORS.guide, fillOpacity: 1 })
          .bindTooltip(mv.label, { direction: 'top', className: 'exit-tip', offset: [0, -6] })
          .addTo(routeLayer));
      }
      car.addTo(map);
      if (!keepView) {
        this.setFollow(false);
        map.fitBounds(L.latLngBounds(route.pts), { padding: visiblePad() });
      }
    },

    // Follow the car heading-up (navigating) or a normal north-up map you can drag.
    setFollow(on) {
      follow = on;
      if (on) {
        map.dragging.disable();   // dragging a rotated map moves it the wrong way
        map.setZoom(Math.max(map.getZoom(), 16), { animate: false });
      } else {
        rotate(0);
        map.dragging.enable();
      }
    },

    // frame: from nav/drive.js stepDrive().
    update(frame) {
      car.setLatLng([frame.lat, frame.lon]);
      const icon = car.getElement();
      if (icon && icon.firstChild) icon.firstChild.style.transform = `rotate(${frame.heading.toFixed(1)}deg)`;
      if (follow) {
        // Sit the car low in the pane so more of the road ahead is visible.
        rotate(-frame.heading);
        const z = map.getZoom(), k = pane.clientHeight * 0.28, h = frame.heading * toRad;
        const pt = map.project([frame.lat, frame.lon], z).add([Math.sin(h) * k, -Math.cos(h) * k]);
        map.setView(map.unproject(pt, z), z, { animate: false });
      }

      const nx = frame.nx;
      setText(hud.spd, String(Math.round(frame.speed * MPS_TO_MPH)));
      if (nx) {
        setText(hud.name, nx.exit.label);
        setText(hud.info, `${fmtDistShort(nx.dist)} · ${nx.exit.side} side`);
      } else {
        setText(hud.name, 'Destination');
        setText(hud.info, fmtDistShort(frame.remaining));
      }
      const next = nx ? nx.exit : null;
      if (next !== highlighted) {
        markers.forEach((m, mv) => m.setStyle(mv === next ? { radius: 8, fillColor: COLORS.caution } : { radius: 5, fillColor: COLORS.guide }));
        highlighted = next;
      }
    },

    setGpsStatus({ text, weak }) {
      setText(hud.gps, text);
      hud.gps.classList.toggle('weak', weak);
    },
    showAccuracy(p, acc) {
      accuracy.setLatLng(p).setRadius(acc);
      if (!map.hasLayer(accuracy)) accuracy.addTo(map);
    },
    hideAccuracy() { map.removeLayer(accuracy); },
    addTrailPoint(p) { trail.addLatLng(p); },
    clearTrail() { trail.setLatLngs([]); },
  };
}
