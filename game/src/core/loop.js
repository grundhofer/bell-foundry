// @ts-check
export class Loop {
  /** @param {{ step: (dt: number) => void, frame: (dt: number, alpha: number) => void, onError?: (e: Error) => void }} o */
  constructor(o) {
    this.o = o;
    this.DT = 1 / 60;
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this.scale = 1;
    this.freeze = 0;
    this.time = 0;
    this.frames = 0;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      const real = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      try {
        this.advance(real);
      } catch (e) {
        this.running = false;
        console.error(e);
        if (this.o.onError) this.o.onError(e);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  stop() {
    this.running = false;
  }
  advance(real) {
    if (this.freeze > 0) {
      this.freeze -= real;
      this.o.frame(real, 1);
      this.frames++;
      return;
    }
    this.acc += real * this.scale;
    let n = 0;
    while (this.acc >= this.DT && n < 6) {
      this.o.step(this.DT);
      this.acc -= this.DT;
      this.time += this.DT;
      n++;
    }
    if (n === 6) this.acc = 0; // Skip catch-up after the tab was inactive.
    this.o.frame(real, this.acc / this.DT);
    this.frames++;
  }
}
