import { searchPlaces } from '../services/places.js';

/* Place suggestions as you type, as an accessible combobox. getNear() gives the point to bias
   results toward (wherever the map is looking). Returns { place }: the picked place
   ({ lat, lon, name }), or null once the text is edited. */
export function attachPlaceSuggest(input, getNear) {
  const list = document.createElement('ul');
  list.className = 'suggest';
  list.id = input.id + 'List';
  list.hidden = true;
  list.setAttribute('role', 'listbox');
  input.parentNode.appendChild(list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  const api = { place: null };
  let items = [], itemsQ = '', active = -1, timer = 0, seq = 0;

  function paint() {
    list.replaceChildren(...items.map((it, i) => {
      const li = document.createElement('li');
      li.id = `${list.id}-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === active));
      const m = document.createElement('span'); m.className = 'm'; m.textContent = it.main;
      const r = document.createElement('span'); r.className = 'r'; r.textContent = it.rest;
      li.append(m, r);
      li.addEventListener('pointerdown', e => { e.preventDefault(); choose(i); });
      return li;
    }));
    list.hidden = !items.length;
    input.setAttribute('aria-expanded', String(!!items.length));
    if (active >= 0) {
      input.setAttribute('aria-activedescendant', `${list.id}-${active}`);
      list.children[active].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }
  function close() { items = []; active = -1; paint(); }
  function choose(i) {
    if (itemsQ !== input.value.trim()) return;   // list is from an older query; wait for fresh results
    const it = items[i];
    input.value = it.text;
    api.place = { lat: it.lat, lon: it.lon, name: it.main };
    close();
  }
  async function search(q) {
    const my = ++seq;
    try {
      const found = await searchPlaces(q, getNear());
      if (my !== seq || document.activeElement !== input) return;   // a newer search, or the user left the field
      items = found; itemsQ = q; active = -1;
      paint();
    } catch { /* suggestions are a convenience; typing still works */ }
  }

  input.addEventListener('input', () => {
    api.place = null;
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { seq++; close(); return; }
    timer = setTimeout(() => search(q), 250);
  });
  input.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; paint(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  input.addEventListener('blur', () => { seq++; close(); });
  return api;
}
