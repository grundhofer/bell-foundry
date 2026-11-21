import { DEVICE } from './protocol.js';
import { TUNING } from './gestures.js';

const CSS = `
#hwp{position:fixed;top:12px;right:12px;z-index:50;width:min(380px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;
 background:rgba(10,12,14,.92);color:#e8e4da;font:12px/1.45 ui-monospace,Menlo,monospace;border:1px solid rgba(232,228,218,.2);border-radius:8px;padding:10px 12px}
#hwp h3{font:600 12px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;margin:10px 0 4px;color:#ffb347}
#hwp h3:first-child{margin-top:0}
#hwp button{font:12px system-ui,sans-serif;background:#2a2f34;color:#e8e4da;border:1px solid #444;border-radius:5px;padding:4px 8px;margin:2px 4px 2px 0;cursor:pointer}
#hwp button:hover{background:#3a4148}
#hwp .ok{color:#7fd17f}#hwp .bad{color:#ff7a5c}#hwp .dim{color:#8a8a8a}
#hwp .bar{display:inline-block;height:8px;background:#ffb347;vertical-align:middle;border-radius:2px}
#hwp .row{display:flex;justify-content:space-between;gap:8px}
#hwbadge{position:fixed;top:12px;right:12px;z-index:49;font:600 14px system-ui,sans-serif;color:#e8e4da;background:rgba(10,12,14,.6);padding:4px 10px;border-radius:14px;display:none}
`;

export class HardwarePanel {
  constructor(hw, open) {
    this.hw = hw;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.el = document.createElement('div');
    this.el.id = 'hwp';
    this.el.style.display = open ? '' : 'none';
    this.el.innerHTML = `
      <h3>Controller</h3>
      <div><button data-a="serial">Atom verbinden</button><button data-a="sim">Simulator</button><button data-a="stop">Stopp</button></div>
      <div id="hwp-src" class="dim"></div>
      <div id="hwp-dev"></div>
      <h3>Kalibrieren</h3>
      <div><button data-a="guard">Schild-Deckung = jetzt</button><button data-a="vib">Vibration testen</button></div>
      <div class="dim">Oder am Schild KEY1 + KEY2 1,5 s halten, während du es wie zum Blocken hältst.</div>
      <h3>Puls</h3>
      <div><button data-a="heart">Pulsband verbinden</button><button data-a="rest">Ruhepuls = jetzt</button><button data-a="fake+">Sim +10</button><button data-a="fake-">Sim −10</button></div>
      <div id="hwp-hr"></div>
      <h3>Aufnahme</h3>
      <div><button data-a="rec">● Aufnehmen</button><button data-a="save">Speichern</button><button data-a="load">Wiedergabe laden…</button></div>
      <div id="hwp-rec" class="dim"></div>
      <h3>Ereignisse</h3>
      <div id="hwp-log"></div>
      <div class="dim" style="margin-top:8px">Simulator: 1 Hieb · 2 von oben · 3 Stich · 4 Schild hoch/runter · 5 Schild-Stoß · IJKL Stick · U Stick drücken · 7/8 Schwert-Tasten · 9/0 Schild-Tasten. H blendet aus.</div>`;
    this.badge = document.createElement('div');
    this.badge.id = 'hwbadge';
    document.body.appendChild(this.el);
    document.body.appendChild(this.badge);
    this.file = document.createElement('input');
    this.file.type = 'file';
    this.file.accept = '.json,application/json';
    this.file.style.display = 'none';
    document.body.appendChild(this.file);
    this.file.onchange = async () => {
      const f = this.file.files[0];
      if (!f) return;
      try {
        await hw.useReplay(JSON.parse(await f.text()));
      } catch (e) {
        hw._note('Wiedergabe: ' + e.message);
      }
      this.file.value = '';
    };
    this.el.addEventListener('click', (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a) this.act(a, e.target);
    });
    for (const t of ['mousedown', 'pointerdown', 'click']) this.el.addEventListener(t, (e) => e.stopPropagation());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyH' && !e.repeat) this.toggle();
    });
    this.fakeBpm = 70;
    setInterval(() => this.draw(), 125);
  }
  toggle() {
    const open = this.el.style.display === 'none';
    this.el.style.display = open ? '' : 'none';
    if (open && document.exitPointerLock) document.exitPointerLock();
  }
  async act(a, btn) {
    const hw = this.hw;
    try {
      if (a === 'serial') await hw.useSerial();
      else if (a === 'sim') await hw.useSim();
      else if (a === 'stop') await hw.stop();
      else if (a === 'guard') {
        if (!hw.calibrateGuard()) hw._note('Kein Schild-Paket da');
      } else if (a === 'vib') hw.rumble(0.8, 0.8, 0.3);
      else if (a === 'heart') await hw.heart.connect();
      else if (a === 'rest') hw.heart.setRest();
      else if (a === 'fake+' || a === 'fake-') {
        this.fakeBpm += a === 'fake+' ? 10 : -10;
        hw.heart.fake(this.fakeBpm);
        if (!hw.heart.rest) hw.heart.rest = 70;
        clearInterval(this._fake);
        this._fake = setInterval(() => hw.heart.fake(this.fakeBpm), 1000);
      } else if (a === 'rec') {
        if (hw.recorder.on) {
          hw.recorder.stop();
          btn.textContent = '● Aufnehmen';
        } else {
          hw.recorder.start();
          btn.textContent = '■ Stopp';
        }
      } else if (a === 'save') {
        if (hw.recorder.chunks.length) hw.recorder.save();
        else hw._note('Noch nichts aufgenommen');
      } else if (a === 'load') this.file.click();
    } catch (e) {
      hw._note('Fehler: ' + e.message);
    }
  }
  draw() {
    const hw = this.hw,
      h = hw.heart;
    const show = !(hw.ctx.ui && hw.ctx.ui.settings && hw.ctx.ui.settings.heartShow === false);
    this.badge.style.display = this.el.style.display === 'none' && h.live && show ? '' : 'none';
    if (h.live)
      this.badge.textContent = `♥ ${h.bpm}${h.rest ? ` (${h.smooth - h.rest >= 0 ? '+' : ''}${Math.round(h.smooth - h.rest)})` : ''}${hw.mood ? ' · ' + hw.mood : ''}`;
    if (this.el.style.display === 'none') return;
    const $ = (id) => this.el.querySelector('#' + id),
      now = performance.now();
    const st = hw.status;
    $('hwp-src').innerHTML = hw.source
      ? `${hw.source.name}${hw.latency ? ` · USB-Rundlauf ${hw.latency.toFixed(1)} ms` : ''}${st ? ` · Atom fw ${st.fw}, verworfen ${st.dropped}` : ''} · Rahmenfehler ${hw.reader.errors}`
      : 'keine Quelle';
    const dev = (id, extra) => {
      const d = hw.dev[id],
        on = now - d.at < 500,
        p = d.last;
      if (!p) return `<div class="row"><b>${d.name}</b><span class="bad">nie gesehen</span></div>`;
      const b = p.buttons,
        keys = ['KEY1', 'KEY2', 'Stick'].filter((_, i) => b & (1 << i)).join(' ') || '–';
      return `<div class="row"><b>${d.name}</b><span class="${on ? 'ok' : 'bad'}">${on ? 'online' : 'weg'} · ${d.pps}/s · verloren ${d.lost}</span></div>
        <div class="dim">Akku ${p.battery === 255 ? '?' : p.battery + ' %'} · RSSI ${p.rssi} · Tasten ${keys}</div>${extra(p)}`;
    };
    const gyro = (p) => Math.round(Math.hypot(...p.gyro));
    $('hwp-dev').innerHTML =
      dev(
        DEVICE.SWORD,
        (
          p,
        ) => `<div>Drehung ${gyro(p)} °/s <span class="bar" style="width:${Math.min(150, gyro(p) / 10)}px"></span> ${hw.sword.active ? '<b>Schwung</b>' : ''}</div>
        <div class="dim">letzte Geste: ${hw.sword.last ? hw.sword.last.kind + ' ' + hw.sword.last.peak : '–'} · Schwelle ${TUNING.sword.start}/${TUNING.sword.minPeak} °/s</div>`,
      ) +
      dev(
        DEVICE.SHIELD,
        (
          p,
        ) => `<div>Deckung <b class="${hw.shield.guard ? 'ok' : 'dim'}">${hw.shield.guard ? 'OBEN' : 'unten'}</b> · Abweichung ${Math.round(hw.shield.tiltOff)}° (hoch < ${TUNING.shield.enter}°)</div>
        <div class="dim">Stick ${p.joy[0].toFixed(2)} / ${p.joy[1].toFixed(2)} · ${p.flags & 1 ? 'Joystick ok' : '<span class="bad">kein Joystick</span>'}</div>`,
      );
    $('hwp-hr').innerHTML =
      h.state === 'aus'
        ? '<span class="dim">nicht verbunden</span>'
        : `${h.name}: ${h.state} · ${h.bpm} bpm (geglättet ${h.smooth.toFixed(1)}) · Ruhe ${h.rest || 'misst 45 s …'}<br>Stress ${(h.stress * 100).toFixed(0)} % <span class="bar" style="width:${h.stress * 150}px;background:#ff5a40"></span> ${hw.mood || ''}${hw.ctx.boss && hw.ctx.boss.rules ? ` · Boss-Pause ×${hw.ctx.boss.rules.rest.toFixed(2)}` : ''}`;
    $('hwp-rec').textContent = hw.recorder.on
      ? `nimmt auf … ${hw.recorder.seconds.toFixed(1)} s`
      : hw.recorder.chunks.length
        ? `${hw.recorder.seconds.toFixed(1)} s im Speicher`
        : '';
    $('hwp-log').innerHTML = hw.log
      .map(
        (l) =>
          `<div><span class="dim">${((now - l.t) / 1000).toFixed(1)} s</span> ${l.text.replace(/</g, '&lt;')}</div>`,
      )
      .join('');
  }
}
