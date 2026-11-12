import { describe, it, expect, beforeEach } from 'vitest';
import { createVoice } from '../src/guidance/voice.js';
import { createInstructions } from '../src/guidance/instructions.js';

// A fake speech engine and clock: utterances "finish" when the test calls finish().
function setup() {
  let t = 0;
  const timers = [];
  const synth = {
    spoken: [], speaking: false, paused: false, cancels: 0,
    speak(u) { this.spoken.push(u.text); this.speaking = true; this.last = u; },
    cancel() { this.cancels++; this.speaking = false; },
    resume() { this.paused = false; },
    getVoices: () => [],
  };
  class Utterance { constructor(text) { this.text = text; } }
  const voice = createVoice({
    getSynth: () => synth, Utterance, now: () => t,
    later: (fn, ms) => timers.push({ at: t + ms, fn }),
  });
  const advance = ms => {
    t += ms;
    for (const tm of timers.filter(x => x.at <= t)) { timers.splice(timers.indexOf(tm), 1); tm.fn(); }
  };
  const finish = () => { synth.speaking = false; synth.last.onend(); };
  return { voice, synth, advance, finish };
}

describe('voice', () => {
  let v, synth, advance, finish;
  beforeEach(() => ({ voice: v, synth, advance, finish } = setup()));

  it('says nothing until a tap unlocks it', () => {
    v.say('Exit in 0.6 miles', 3);
    expect(synth.spoken).toEqual([]);
  });
  it('speaks straight away from the unlocking tap (that is what unlocks iPhones)', () => {
    v.unlock('Starting navigation');
    expect(synth.spoken).toEqual(['Starting navigation']);
  });
  it('waits 1.6 s after the last phrase before a non-urgent one', () => {
    v.unlock('Starting navigation');
    finish();
    v.say('Continue on I-280', 5);
    expect(synth.spoken).toHaveLength(1);
    advance(1700); v.pump();
    expect(synth.spoken).toEqual(['Starting navigation', 'Continue on I-280']);
  });
  it('lets urgent phrases cut in, a moment after cancelling', () => {
    v.unlock('Starting navigation');
    v.say('Person near the road', 1);
    expect(synth.cancels).toBe(1);
    expect(synth.spoken).toHaveLength(1);    // not in the same instant as the cancel
    advance(100);
    expect(synth.spoken).toEqual(['Starting navigation', 'Person near the road']);
  });
  it("doesn't repeat a phrase within 5 s", () => {
    v.unlock('');
    v.say('Hold, traffic closing on your right', 2);
    finish();
    advance(2000);
    v.say('Hold, traffic closing on your right', 2);
    expect(synth.spoken).toHaveLength(1);
    advance(4000);
    v.say('Hold, traffic closing on your right', 2);
    expect(synth.spoken).toHaveLength(2);
  });
  it("isn't blocked by an engine that never reports finishing", () => {
    v.unlock('Starting navigation');         // never finishes, and synth.speaking stays true
    v.say('Exit in 0.6 miles', 3);
    advance(12000);                          // the watchdog frees the queue
    advance(1700); v.pump();                 // then the usual gap
    expect(synth.spoken).toEqual(['Starting navigation', 'Exit in 0.6 miles']);
  });
  it('resumes a paused engine before speaking', () => {
    synth.paused = true;
    v.unlock('Voice guidance on');
    expect(synth.paused).toBe(false);
  });
  it('stays quiet when muted', () => {
    v.unlock('');
    v.setMuted(true);
    v.say('Person near the road', 1);
    v.announce('You have arrived');
    expect(synth.spoken).toEqual([]);
  });
});

describe('which instructions are spoken', () => {
  const run = () => {
    const said = [];
    const ins = createInstructions({ render: () => {}, say: t => said.push(t) });
    return { ins, said };
  };

  it('speaks the first instruction after starting, even a quiet one', () => {
    const { ins, said } = run();
    ins.speakNext();
    ins.settle({ pri: 5, key: 'nocam', text: 'Continue on I-280', silent: true }, 0);
    expect(said).toEqual(['Continue on I-280']);
  });
  it('keeps later quiet instructions quiet', () => {
    const { ins, said } = run();
    ins.settle({ pri: 5, key: 'a', text: 'Continue on I-280', silent: true }, 0);
    ins.settle({ pri: 5, key: 'b', text: 'Traffic on your left', silent: true }, 0);
    ins.settle({ pri: 5, key: 'b', text: 'Traffic on your left', silent: true }, 1000);
    expect(said).toEqual([]);
  });
  it('speaks what comes after "Waiting for GPS"', () => {
    const { ins, said } = run();
    ins.settle({ pri: 3, key: 'gps-wait', text: 'Waiting for GPS…', silent: true, status: true }, 0);
    ins.settle({ pri: 5, key: 'nocam', text: 'Continue on I-280', silent: true }, 100);
    ins.settle({ pri: 5, key: 'nocam', text: 'Continue on I-280', silent: true }, 1100);
    expect(said).toEqual(['Continue on I-280']);
  });
  it('turns the dash into a pause for speech', () => {
    const { ins, said } = run();
    ins.settle({ pri: 3, key: 'm', text: 'Exit in 0.6 miles — right lane is clear' }, 0);
    expect(said).toEqual(['Exit in 0.6 miles, right lane is clear']);
  });
});
