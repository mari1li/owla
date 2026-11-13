import { PLANS } from '../config.js';
import { $, mount, setText } from '../lib/dom.js';

const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const money = n => `$${n.toFixed(2)}`;

// What a plan costs under the chosen billing period: { big, small, note }.
export function planPrice(plan, period) {
  if (!plan.monthly) return { big: '$0', small: '', note: 'Free forever' };
  if (period === 'yearly') {
    const perMonth = Math.floor(plan.yearly / 12 * 100) / 100;
    const saving = Math.round((1 - plan.yearly / (plan.monthly * 12)) * 100);
    return { big: money(plan.yearly), small: '/year', note: `${money(perMonth)}/month · save ${saving}%` };
  }
  return { big: money(plan.monthly), small: '/month', note: `or ${money(plan.yearly)}/year` };
}

const card = p => `
  <article class="plan${p.popular ? ' popular' : ''}" data-plan="${p.id}" aria-labelledby="plan-${p.id}">
    ${p.popular ? '<span class="plan-badge">Most popular</span>' : ''}
    <h3 id="plan-${p.id}">${p.name}</h3>
    <p class="plan-tag">${p.tagline}</p>
    <div class="plan-price"><b></b><small></small></div>
    <p class="plan-note"></p>
    <button class="btn${p.popular ? ' primary' : ''}" type="button" ${p.monthly ? 'disabled' : 'aria-disabled="true"'}>
      ${p.monthly ? 'Coming soon' : 'Your current plan'}
    </button>
    <ul class="plan-features">
      ${p.features.map(f => `<li class="${f.ready ? '' : 'soon'}">${CHECK}<span>${f.text}${f.ready ? '' : ' <em>soon</em>'}</span></li>`).join('')}
    </ul>
  </article>`;

/* The Plans tab: Free / Plus / Family, monthly or yearly. Plans and prices live in config.js. */
export function createPricingPage(slotId) {
  mount(slotId, `
    <div class="plans-wrap">
      <h2>Plans</h2>
      <p>Safety warnings are free for everyone, always. Plus and Family add the coaching and record-keeping that help a new driver get licensed.</p>
      <div class="billing" role="radiogroup" aria-label="Billing period">
        <button type="button" role="radio" data-period="monthly" aria-checked="true">Monthly</button>
        <button type="button" role="radio" data-period="yearly" aria-checked="false">Yearly <span class="save">save up to 27%</span></button>
      </div>
      <div class="plans">${PLANS.map(card).join('')}</div>
      <p class="plans-fine">Prices in US dollars. Paid plans aren't on sale yet; features marked <em>soon</em> are being built. Cancel any time once they launch.</p>
    </div>`);

  const periods = [...document.querySelectorAll('.billing [data-period]')];
  function show(period) {
    periods.forEach(b => b.setAttribute('aria-checked', String(b.dataset.period === period)));
    for (const p of PLANS) {
      const el = document.querySelector(`.plan[data-plan="${p.id}"]`), price = planPrice(p, period);
      setText(el.querySelector('.plan-price b'), price.big);
      setText(el.querySelector('.plan-price small'), price.small);
      setText(el.querySelector('.plan-note'), price.note);
    }
  }
  periods.forEach(b => b.addEventListener('click', () => show(b.dataset.period)));
  show('monthly');

  // The "save up to" figure follows the prices in config.js.
  const best = Math.max(...PLANS.filter(p => p.monthly).map(p => Math.round((1 - p.yearly / (p.monthly * 12)) * 100)));
  setText($('pagePlans').querySelector('.save'), `save up to ${best}%`);
}
