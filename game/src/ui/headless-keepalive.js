export const HEADLESS = /Headless/i.test(navigator.userAgent || '') || !!navigator.webdriver;

let sink = 0;
function burnCpu(n) {
  for (let i = 1; i < n; i++) sink += Math.sqrt(i) / i;
  return sink;
}

export function keepHeadlessFramesRunning(ctx) {
  const p = ctx && ctx.params;
  if (
    !HEADLESS ||
    !ctx ||
    !ctx.dev ||
    !p ||
    p.has('perf') ||
    p.get('walk') === '0' ||
    (p.has('shot') && !p.has('page'))
  )
    return () => {};
  let ticks = 0,
    frameTick = 0,
    on = true;
  const frame = () => {
    if (on) {
      frameTick = ticks;
      requestAnimationFrame(frame);
    }
  };
  requestAnimationFrame(frame);
  const id = setInterval(() => {
    if (++ticks - frameTick > 3) burnCpu(900000);
  }, 4);
  return () => {
    on = false;
    clearInterval(id);
  };
}
