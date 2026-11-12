import { $, mount, setText } from '../lib/dom.js';

export function createHeader(slotId) {
  mount(slotId, `
    <header>
      <h1>New-driver lane assist</h1>
      <span class="honest" id="honest">GPS position · daylight only</span>
    </header>`);
  return {
    setSource(src) {
      setText($('honest'), src === 'gps' ? 'GPS position · daylight only' : 'Simulated drive · daylight only');
    },
  };
}
