// Tiny square-wave synth for retro blips. No assets needed.
let ctx = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq0, freq1, dur, vol = 0.15, type = 'square', when = 0) {
  const c = ac();
  const t = c.currentTime + when;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq1), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.25) {
  const c = ac();
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, c.currentTime);
  filter.frequency.exponentialRampToValueAtTime(120, c.currentTime + dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start();
}

export function sfx(name) {
  try {
    switch (name) {
      case 'jump': tone(300, 620, 0.12, 0.08); break;
      case 'throw': tone(500, 180, 0.15, 0.08); break;
      case 'boom': noise(0.5, 0.3); tone(120, 40, 0.4, 0.2, 'sawtooth'); break;
      case 'hit': tone(220, 60, 0.25, 0.2, 'sawtooth'); break;
      case 'antdie': tone(700, 90, 0.2, 0.1); break;
      case 'rescue':
        tone(440, 440, 0.1, 0.12); tone(554, 554, 0.1, 0.12, 'square', 0.1);
        tone(659, 659, 0.18, 0.12, 'square', 0.2);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.16, 0.12, 'square', i * 0.14));
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.9, 0.22, 0.14, 'square', i * 0.18));
        break;
    }
  } catch { /* audio not available — fine */ }
}
