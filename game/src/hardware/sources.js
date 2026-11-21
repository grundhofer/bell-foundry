export class SerialSource {
  constructor(onBytes, onState = () => {}) {
    this.onBytes = onBytes;
    this.onState = onState;
    this.port = null;
    this.name = 'Atom (USB)';
    this.open = false;
  }
  static supported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }
  async start() {
    if (!SerialSource.supported())
      throw new Error('Web Serial fehlt: bitte Chrome oder Edge nutzen, Seite über http://localhost oder 127.0.0.1');
    const known = await navigator.serial.getPorts();
    this.port = known.length === 1 ? known[0] : await navigator.serial.requestPort();
    await this.port.open({ baudRate: 921600, bufferSize: 8192 });
    this.open = true;
    this.onState('open');
    this.port.addEventListener('disconnect', () => {
      this.open = false;
      this.onState('lost');
    });
    this._loop();
  }
  async _loop() {
    while (this.open && this.port && this.port.readable) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) this.onBytes(value);
        }
      } catch (e) {
        this.onState('error', e);
      } finally {
        try {
          this.reader.releaseLock();
        } catch (e) {}
      }
    }
  }
  async write(bytes) {
    if (!this.open || !this.port || !this.port.writable) return;
    const w = this.port.writable.getWriter();
    try {
      await w.write(bytes);
    } finally {
      w.releaseLock();
    }
  }
  async stop() {
    this.open = false;
    try {
      if (this.reader) await this.reader.cancel();
    } catch (e) {}
    try {
      if (this.port) await this.port.close();
    } catch (e) {}
    this.onState('closed');
  }
}

const b64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
};
const unb64 = (s) => {
  const t = atob(s),
    u = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
  return u;
};

export class Recorder {
  constructor() {
    this.on = false;
    this.chunks = [];
    this.t0 = 0;
    this.note = '';
  }
  start(note = '') {
    this.on = true;
    this.chunks = [];
    this.t0 = performance.now();
    this.note = note;
  }
  push(bytes) {
    if (this.on) this.chunks.push([Math.round((performance.now() - this.t0) * 10) / 10, b64(bytes)]);
  }
  stop() {
    this.on = false;
    return this.chunks.length;
  }
  get seconds() {
    return this.chunks.length ? this.chunks[this.chunks.length - 1][0] / 1000 : 0;
  }
  toJSON() {
    return {
      kind: 'foundry-hw-recording',
      version: 1,
      note: this.note,
      recorded: new Date().toISOString(),
      chunks: this.chunks,
    };
  }
  save(name) {
    const blob = new Blob([JSON.stringify(this.toJSON())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name || `aufnahme-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

export class ReplaySource {
  constructor(onBytes, data, { speed = 1, loop = false } = {}) {
    if (!data || !/-hw-recording$/.test(data.kind || '')) throw new Error('Das ist keine Aufnahme dieser Testanzeige');
    this.onBytes = onBytes;
    this.chunks = data.chunks.map(([t, s]) => [t, unb64(s)]);
    this.speed = speed;
    this.loop = loop;
    this.name = `Wiedergabe (${(data.chunks.length ? data.chunks[data.chunks.length - 1][0] / 1000 : 0).toFixed(1)} s)`;
  }
  start() {
    let i = 0,
      t0 = performance.now();
    this.timer = setInterval(() => {
      const now = (performance.now() - t0) * this.speed;
      while (i < this.chunks.length && this.chunks[i][0] <= now) this.onBytes(this.chunks[i++][1]);
      if (i >= this.chunks.length) {
        if (this.loop) {
          i = 0;
          t0 = performance.now();
        } else this.stop();
      }
    }, 4);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = 0;
  }
  write() {}
}
