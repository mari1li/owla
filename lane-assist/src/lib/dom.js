export const $ = id => document.getElementById(id);

// Only touch the DOM when the text actually changes (most updates run every frame).
export function setText(el, v) {
  if (el.textContent !== v) el.textContent = v;
}

// Replace a placeholder element with a component's markup. Templates are static strings
// written in this codebase; never pass user input or network data through here.
export function mount(slotId, markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  $(slotId).replaceWith(t.content);
}

export const isCompactLayout = () =>
  matchMedia('(max-width: 820px), (orientation: landscape) and (max-height: 500px)').matches;
