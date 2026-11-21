// PulseDisplay presentation (strip, heartbeat, vignette), shown only while hw.heart has live data; presentation only, never touches the fight.
const W = 168,
  H = 30,
  SPEED = 64; // canvas px, scroll px per second
const COOL = [207, 181, 124],
  WARM = [222, 92, 52];
const HEART =
  '<svg viewBox="0 0 16 14" aria-hidden="true"><path d="M8 13.2 1.6 6.9A3.7 3.7 0 0 1 8 2.6a3.7 3.7 0 0 1 6.4 4.3Z"/></svg>';

// ECG trace for tau seconds after a beat (P bump before it is left out: quiet baseline, QRS spike, T wave).
function ecgWaveform(tau) {
  if (tau < 0) return 0;
  if (tau < 0.03) return -0.18 * (tau / 0.03);
  if (tau < 0.065) return -0.18 + 1.18 * ((tau - 0.03) / 0.035);
  if (tau < 0.1) return 1 - 1.4 * ((tau - 0.065) / 0.035);
  if (tau < 0.14) return -0.4 + 0.4 * ((tau - 0.1) / 0.04);
  if (tau > 0.22 && tau < 0.42) return 0.22 * Math.sin((Math.PI * (tau - 0.22)) / 0.2);
  return 0;
}

export class PulseDisplay {
  constructor(ui, parent) {
    this.ui = ui;
    const vig = (this.vig = document.createElement('div'));
    vig.className = 'tbf-pvig';
    parent.insertBefore(vig, parent.firstChild);
    const el = (this.el = document.createElement('div'));
    el.className = 'tbf-pulse';
    el.innerHTML = `<canvas width="${W}" height="${H}"></canvas><span class="hr">${HEART}</span><span class="bpm"></span>`;
    parent.appendChild(el);
    this.cv = el.querySelector('canvas');
    this.g = this.cv.getContext('2d');
    this.hr = el.querySelector('.hr');
    this.num = el.querySelector('.bpm');
    this.t = 0;
    this.phase = 0;
    this.beats = [];
    this.kick = 0;
    this.on = null;
    this.shownBpm = -1;
    this.col = '';
  }

  heart() {
    const hw = this.ui.ctx && this.ui.ctx.hw;
    return hw && hw.heart;
  }

  update(dt) {
    const h = this.heart(),
      ui = this.ui,
      set = ui.settings || {};
    const live = !!(h && h.live && h.bpm > 0);
    const show = live && ui.screen === 'hud' && !ui.cineOn;
    if (!live) {
      this.beats.length = 0;
      this.phase = 0;
    }
    if (show !== this.on) {
      this.on = show;
      this.vig.style.display = show ? 'block' : 'none';
      if (!show) this.el.classList.remove('on');
    }
    if (!show) return;
    this.el.classList.toggle('on', set.heartShow !== false);
    const s = h.rest ? h.stress : 0,
      bpm = h.bpm,
      calm = !!set.reducedMotion;
    this.t += dt;
    this.phase += (dt * bpm) / 60;
    if (this.phase >= 1) {
      this.phase -= Math.floor(this.phase);
      this.beats.push(this.t);
      this.kick = 1;
      this._playHeartbeat(s, bpm);
    }
    while (this.beats.length > 1 && this.beats[1] < this.t - W / SPEED - 1) this.beats.shift();
    this.kick = Math.max(0, this.kick - dt / 0.35);

    const c = COOL.map((v, i) => Math.round(v + (WARM[i] - v) * s)),
      col = `rgb(${c[0]},${c[1]},${c[2]})`;
    if (col !== this.col) {
      this.col = col;
      this.el.style.setProperty('--pc', col);
    }
    if (bpm !== this.shownBpm) {
      this.shownBpm = bpm;
      this.num.textContent = String(Math.round(bpm));
    }
    this.hr.style.transform = calm ? '' : `scale(${(1 + 0.22 * this.kick * this.kick).toFixed(3)})`;
    if (set.heartShow !== false) this._draw(col);

    const beat = calm ? 0 : this.kick * this.kick;
    const op = Math.round(s * (0.2 + 0.05 * beat) * 100) / 100;
    if (op !== this.op) {
      this.op = op;
      this.vig.style.opacity = op;
    }
  }

  _draw(col) {
    const g = this.g,
      b = this.beats,
      mid = H * 0.62,
      amp = H * 0.5;
    g.clearRect(0, 0, W, H);
    g.lineWidth = 1.6;
    g.lineJoin = 'round';
    g.strokeStyle = col;
    g.shadowColor = col;
    g.shadowBlur = 4;
    g.beginPath();
    let k = 0;
    for (let x = 0; x <= W; x += 1) {
      const at = this.t - (W - x) / SPEED;
      while (k + 1 < b.length && b[k + 1] <= at) k++;
      const y = mid - amp * (b.length && b[k] <= at ? ecgWaveform(at - b[k]) : 0);
      const fade = x < 24 ? x / 24 : 1;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, mid + (y - mid) * fade);
    }
    g.stroke();
  }

  // lub-dub synthesized into the world bus (sfx volume, silent in pause); only from mild stress up
  _playHeartbeat(s, bpm) {
    const a = this.ui.ctx && this.ui.ctx.audio;
    if (!a || !a.running || !a.ac || !a.world || (a.muted && (a.muted.has('heart') || a.muted.has('sfx'))) || s < 0.15)
      return;
    const ac = a.ac,
      t0 = ac.currentTime + 0.02,
      level = 0.25 + 0.75 * Math.min(1, (s - 0.15) / 0.85);
    const gap = Math.min(0.3, (0.32 * 60) / bpm);
    this._playThumpTone(ac, a.world, t0, 62, 0.9 * level);
    this._playThumpTone(ac, a.world, t0 + gap, 74, 0.6 * level);
  }
  _playThumpTone(ac, out, t, f, peak) {
    const o = ac.createOscillator(),
      lp = ac.createBiquadFilter(),
      g = ac.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.14);
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    lp.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    o.connect(lp);
    lp.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.2);
    o.onended = () => {
      o.disconnect();
      lp.disconnect();
      g.disconnect();
    };
  }

  dispose() {
    this.el.remove();
    this.vig.remove();
  }
}
