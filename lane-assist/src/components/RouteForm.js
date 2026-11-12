import { $, mount, setText } from '../lib/dom.js';
import { attachPlaceSuggest } from './PlaceSuggest.js';

/* Start and destination with suggestions; collapses to a one-line summary once routed.
   onSubmit({ from, to }) resolves to the summary text, or throws with a message to show.
   `from` is '' when Start was left blank (meaning: my location). */
export function createRouteForm(slotId, { onSubmit, getNear, onLayout }) {
  mount(slotId, `
    <form class="route" id="routeForm">
      <div class="ac"><input class="field" id="fromIn" placeholder="Start (blank = my location)" aria-label="Start" autocomplete="off"></div>
      <div class="ac"><input class="field" id="toIn" placeholder="Destination" aria-label="Destination" autocomplete="off" required></div>
      <button class="btn primary" type="submit" id="routeBtn">Get route</button>
      <span class="route-msg" id="routeMsg" role="status"></span>
    </form>
    <div class="route-sum" id="routeSum" hidden>
      <span id="routeText"></span>
      <button class="btn" type="button" id="editRoute">Change</button>
    </div>`);
  const form = $('routeForm'), fromIn = $('fromIn'), toIn = $('toIn'), btn = $('routeBtn');
  const msg = $('routeMsg'), sum = $('routeSum'), text = $('routeText');
  const from = attachPlaceSuggest(fromIn, getNear);
  const to = attachPlaceSuggest(toIn, getNear);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    btn.disabled = true;
    setText(msg, 'Finding route…');
    try {
      const summary = await onSubmit({
        from: from.place || fromIn.value.trim(),
        to: to.place || toIn.value.trim(),
      });
      setText(text, summary);
      form.hidden = true; sum.hidden = false;
      setText(msg, '');
      onLayout();
    } catch (err) {
      setText(msg, err.message || 'Something went wrong finding that route.');
    }
    btn.disabled = false;
  });
  $('editRoute').addEventListener('click', () => {
    form.hidden = false; sum.hidden = true;
    fromIn.focus();
    onLayout();
  });

  return {
    setSummary(v) { setText(text, v); },
  };
}
