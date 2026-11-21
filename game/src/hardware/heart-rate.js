// Uses Web Bluetooth Heart Rate Service. Enable broadcast in Zepp for the Helio Strap.
const LOW = 5,
  HIGH = 30,
  REST_WINDOW = 45;

export class HeartRate {
  constructor() {
    this.bpm = 0;
    this.smooth = 0;
    this.rest = 0;
    this.stress = 0;
    this.calm = 0;
    this.state = 'aus';
    this.name = '';
    this._first = [];
    this._t0 = 0;
    this.device = null;
    this.lastAt = 0;
  }
  static supported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }
  async connect() {
    if (!HeartRate.supported()) throw new Error('Web Bluetooth fehlt: bitte Chrome nutzen');
    this.device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    this.name = this.device.name || 'Pulsband';
    this.device.addEventListener('gattserverdisconnected', () => this._reconnect());
    await this._open();
  }
  /** A strap this page was allowed before: connect without the chooser (needs navigator.bluetooth.getDevices, which Chrome
   *  offers with chrome://flags/#enable-web-bluetooth-new-permissions-backend). Quietly does nothing otherwise. */
  async autoConnect() {
    if (!HeartRate.supported() || !navigator.bluetooth.getDevices || this.device) return false;
    const list = await navigator.bluetooth.getDevices();
    if (!list.length) return false;
    this.device = list[0];
    this.name = this.device.name || 'Pulsband';
    this.device.addEventListener('gattserverdisconnected', () => this._reconnect());
    try {
      await this._open();
      return true;
    } catch (e) {
      // not in reach yet: wait for its advertisements, then connect
      if (this.device.watchAdvertisements) {
        this.state = 'suche';
        this.device.addEventListener(
          'advertisementreceived',
          () => {
            if (this.state === 'suche') this._open().catch(() => {});
          },
          { once: true },
        );
        await this.device.watchAdvertisements().catch(() => {});
      }
      return false;
    }
  }
  async _open() {
    this.state = 'verbinde';
    const server = await this.device.gatt.connect();
    const ch = await (await server.getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement');
    ch.addEventListener('characteristicvaluechanged', (e) => this._onMeasurement(e.target.value));
    await ch.startNotifications();
    this.state = 'verbunden';
    this._t0 = performance.now();
  }
  async _reconnect() {
    this.state = 'getrennt';
    for (let i = 0; i < 5; i++) {
      try {
        await this._open();
        return;
      } catch (e) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    this.state = 'verloren';
  }
  _onMeasurement(dv) {
    const flags = dv.getUint8(0),
      bpm = flags & 1 ? dv.getUint16(1, true) : dv.getUint8(1);
    if (bpm) this.feed(bpm);
  }
  fake(bpm) {
    if (this.state === 'aus') {
      this.state = 'simuliert';
      this.name = 'Simulator';
      this._t0 = performance.now();
    }
    this.feed(bpm);
  }
  feed(bpm) {
    const now = performance.now(),
      dt = this.lastAt ? Math.min(5, (now - this.lastAt) / 1000) : 1;
    this.lastAt = now;
    this.bpm = bpm;
    this.smooth = this.smooth ? this.smooth + 0.15 * (bpm - this.smooth) : bpm;
    if (!this.rest) {
      this._first.push(bpm);
      if ((now - this._t0) / 1000 >= REST_WINDOW) {
        const s = this._first.slice().sort((a, b) => a - b);
        this.rest = s[s.length >> 1];
      }
    }
    const d = this.rest ? this.smooth - this.rest : 0,
      u = Math.min(1, Math.max(0, (d - LOW) / (HIGH - LOW)));
    this.stress = u * u * (3 - 2 * u);
    this.calm = this.rest && this.stress < 0.1 ? this.calm + dt : 0;
  }
  setRest() {
    if (this.smooth) this.rest = Math.round(this.smooth);
  }
  get live() {
    return this.lastAt && performance.now() - this.lastAt < 5000;
  }
}
