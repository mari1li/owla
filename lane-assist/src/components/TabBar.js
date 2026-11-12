import { mount } from '../lib/dom.js';

const ICONS = {
  nav: '<path d="M12 2 L20 21 L12 17 L4 21 Z" fill="currentColor"/>',
  profile: '<circle cx="12" cy="7.5" r="4.2" fill="currentColor"/><path d="M3.5 21.5c0-4.7 3.8-8 8.5-8s8.5 3.3 8.5 8z" fill="currentColor"/>',
};
const TABS = [['nav', 'Navigate'], ['profile', 'Driver']];

// The nav bar: a left rail on wide screens, a bottom bar on phones (see styles/responsive.css).
export function createTabBar(slotId, { onSelect }) {
  mount(slotId, `
    <nav class="tabbar" aria-label="Sections">
      ${TABS.map(([id, label]) => `<button class="tab" type="button" data-page="${id}" aria-current="${id === 'nav' ? 'page' : 'false'}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id]}</svg>${label}</button>`).join('')}
    </nav>`);
  const tabs = [...document.querySelectorAll('.tabbar .tab')];
  tabs.forEach(t => t.addEventListener('click', () => onSelect(t.dataset.page)));
  return {
    select(page) {
      tabs.forEach(t => t.setAttribute('aria-current', t.dataset.page === page ? 'page' : 'false'));
    },
  };
}
