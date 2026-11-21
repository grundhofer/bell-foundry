export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const svg = (cls, box, body) =>
  `<svg class="${cls}" viewBox="${box}" aria-hidden="true" focusable="false">${body}</svg>`;

const FLAME_OUT =
  'M12.5 1C12.7 8.1 19.8 12.9 19.8 22.7 19.8 29.9 16.3 35 12 35 7.7 35 4.2 30 4.2 23.3 4.2 15.5 11 11.2 12.5 1Z';
const FLAME_IN =
  'M12.2 16C12.6 19.9 15.7 22.1 15.7 26.4 15.7 30.5 14.1 33.2 12 33.2 9.9 33.2 8.3 30.6 8.3 27 8.3 22.9 11.4 20.7 12.2 16Z';

const FLASK = 'M8 4.6H12V11.2A7.6 7.6 0 1 1 8 11.2ZM6.8 2.3H13.2V4.6H6.8Z';
const FLASK_EARS = 'M8 6.3C4.7 6 3.1 8.9 4.5 12.4M12 6.3C15.3 6 16.9 8.9 15.5 12.4';

export const ICON = {
  flame: svg('tbf-i-flame', '0 0 24 36', `<path class="o" d="${FLAME_OUT}"/><path class="c" d="${FLAME_IN}"/>`),
  lamp: svg(
    'tbf-i-lamp',
    '0 0 40 40',
    `<circle class="h" cx="20" cy="20" r="14"/><circle class="r" cx="20" cy="20" r="17.2"/>` +
      `<g class="f"><g transform="translate(12.9 8.4) scale(.59)"><path class="o" d="${FLAME_OUT}"/><path class="c" d="${FLAME_IN}"/></g></g>`,
  ),
  flask: svg(
    'tbf-i-flask',
    '0 0 20 28',
    `<path class="k" d="${FLASK}"/><path class="q" d="M4.42 15.6H15.58A6.3 6.3 0 1 1 4.42 15.6Z"/><path class="g" d="${FLASK}${FLASK_EARS}"/>`,
  ),
  lock: svg(
    'tbf-i-lock',
    '-14 -14 28 28',
    `<g class="d"><path d="M0-9.2 9.2 0 0 9.2-9.2 0Z"/><circle r="1.5"/></g>` +
      `<g class="l"><path d="M0-9.2 9.2 0 0 9.2-9.2 0Z"/><circle r="1.5"/></g>`,
  ),
  lozenge: svg('tbf-i-loz', '-5 -5 10 10', `<path d="M0-4.2 3 0 0 4.2-3 0Z"/>`),
  ring: svg(
    'tbf-i-ring',
    '-12 -12 24 24',
    `<circle class="t" r="9.5"/><circle class="v" r="9.5" pathLength="100" transform="rotate(-90)"/>`,
  ),
  turn: svg(
    'tbf-i-turn',
    '0 0 64 48',
    `<rect class="p" x="6.5" y="9" width="17" height="31" rx="3.2"/><rect class="l" x="28.5" y="23" width="31" height="17" rx="3.2"/>` +
      `<path class="s" d="M19 4.6C28.6 2.4 38.4 6.8 42.8 16"/><path class="f" d="M45.4 11.6 44 19.2 38.4 14.9Z"/>`,
  ),
};

const SWORD = (blade, guard, pommel) =>
  `<g transform="rotate(45 12 12)">${blade}<path class="s${guard ? ' w' : ''}" d="${guard || 'M7.4 14.9H16.6'}"/><path class="s" d="M12 15.2V19.6"/><circle class="f" cx="12" cy="20.9" r="${pommel}"/></g>`;
const tsvg = (body) => svg('tbf-i-t', '0 0 24 24', body);
export const TOUCH_ICON = {
  attack: tsvg(SWORD('<path class="d" d="M12 1.2 13.6 4.4V14.6H10.4V4.4Z"/>', '', 1.25)),
  heavy: tsvg(
    SWORD('<path class="f" d="M12 .8 14.1 4.6V14.6H9.9V4.6Z"/>', 'M6.6 14.9H17.4', 1.45) +
      '<path class="a" d="M5 1.9 6.9 5 5 8.1 3.1 5Z"/>',
  ),
  block: tsvg(
    '<path class="d" d="M12 2.4C14.6 4 17.3 4.6 19.6 4.6V11.4C19.6 16.2 16.4 19.7 12 21.6 7.6 19.7 4.4 16.2 4.4 11.4V4.6C6.7 4.6 9.4 4 12 2.4Z"/><path class="f" d="M12 8.2 14.1 11.6 12 15 9.9 11.6Z"/>',
  ),
  roll: tsvg('<path class="s w" d="M15.7 6A7.4 7.4 0 1 1 5.6 8.7"/><path class="f" d="M7.3 5.6 7.5 10.6 3 8Z"/>'),
  jump: tsvg(
    '<path class="s w" d="M12 17V9"/><path class="f" d="M12 3.4 16.6 9.6H7.4Z"/><path class="s" d="M6.2 20.6H17.8"/>',
  ),
  lock: tsvg('<path class="s" d="M12 3.2 20.8 12 12 20.8 3.2 12Z"/><circle class="f" cx="12" cy="12" r="1.8"/>'),
  pause: tsvg('<path class="s w" d="M9.1 6.8V17.2M14.9 6.8V17.2"/>'),
  stick: tsvg('<circle class="s" cx="12" cy="12" r="8.8"/><circle class="f" cx="12" cy="12" r="3.2"/>'),
  look: tsvg(
    '<circle class="f" cx="12" cy="12" r="2.5"/><path class="s" d="M6.8 8.4 3.2 12 6.8 15.6M17.2 8.4 20.8 12 17.2 15.6"/>',
  ),
};

const mouse = (which) =>
  svg(
    'tbf-i-mouse',
    '0 0 14 20',
    (which === 'l'
      ? '<path class="b" d="M7 1V8H1V7A6 6 0 0 1 7 1Z"/>'
      : which === 'r'
        ? '<path class="b" d="M7 1A6 6 0 0 1 13 7V8H7Z"/>'
        : which === 'm'
          ? '<rect class="b" x="5.6" y="2.8" width="2.8" height="4.6" rx="1.4"/>'
          : '') + '<path class="s" d="M7 1H7A6 6 0 0 1 13 7V13A6 6 0 0 1 1 13V7A6 6 0 0 1 7 1ZM1 8H13M7 1V8"/>',
  );

const TOKEN = {
  mouse: () => `<span class="tbf-m" title="Mouse">${mouse('')}</span>`,
  lmb: () => `<span class="tbf-m" title="Left mouse button">${mouse('l')}</span>`,
  rmb: () => `<span class="tbf-m" title="Right mouse button">${mouse('r')}</span>`,
  mmb: () => `<span class="tbf-m" title="Middle mouse button">${mouse('m')}</span>`,
  PA: () => '<kbd class="tbf-p">A</kbd>',
  PB: () => '<kbd class="tbf-p">B</kbd>',
  PX: () => '<kbd class="tbf-p">X</kbd>',
  PY: () => '<kbd class="tbf-p">Y</kbd>',
  LS: () => '<kbd class="tbf-p tbf-st" title="Left stick">L</kbd>',
  RS: () => '<kbd class="tbf-p tbf-st" title="Right stick">R</kbd>',
  R3: () => '<kbd class="tbf-p tbf-st tbf-cl" title="Press the right stick">R</kbd>',
  dpad: () => '<kbd class="tbf-p tbf-dp" title="Directional pad"></kbd>',
  up: () => '<kbd class="tbf-k tbf-ar">&#8593;</kbd>',
  down: () => '<kbd class="tbf-k tbf-ar">&#8595;</kbd>',
  left: () => '<kbd class="tbf-k tbf-ar">&#8592;</kbd>',
  right: () => '<kbd class="tbf-k tbf-ar">&#8594;</kbd>',
  '+': () => '<span class="tbf-plus">+</span>',
  Tstick: () => `<span class="tbf-t tbf-tn" title="The stick, under the left thumb">${TOUCH_ICON.stick}</span>`,
  Tlook: () => `<span class="tbf-t tbf-tn" title="Drag with the right thumb">${TOUCH_ICON.look}</span>`,
  Tattack: () => `<span class="tbf-t">${TOUCH_ICON.attack}</span>`,
  Theavy: () => `<span class="tbf-t">${TOUCH_ICON.heavy}</span>`,
  Tblock: () => `<span class="tbf-t">${TOUCH_ICON.block}</span>`,
  Troll: () => `<span class="tbf-t">${TOUCH_ICON.roll}</span>`,
  Tjump: () => `<span class="tbf-t">${TOUCH_ICON.jump}</span>`,
  Theal: () => `<span class="tbf-t tbf-tf">${ICON.flask}</span>`,
  Tlock: () => `<span class="tbf-t">${TOUCH_ICON.lock}</span>`,
  Tpause: () => `<span class="tbf-t">${TOUCH_ICON.pause}</span>`,
};
export function glyph(token) {
  return TOKEN[token]
    ? TOKEN[token]()
    : `<kbd class="tbf-k${token.length > 1 ? ' tbf-w' : ''}">${escapeHtml(token)}</kbd>`;
}

export const BINDINGS = {
  move: { keys: ['W', 'A', 'S', 'D'], pad: ['LS'], touch: ['Tstick'] },
  look: { keys: ['mouse'], pad: ['RS'], touch: ['Tlook'] },
  lock: { keys: ['Q'], alt: ['mmb'], pad: ['R3'], touch: ['Tlock'] },
  attack: { keys: ['lmb'], pad: ['RB'], touch: ['Tattack'] },
  heavy: { keys: ['E'], alt: ['Shift', '+', 'lmb'], pad: ['RT'], touch: ['Theavy'] },
  block: { keys: ['rmb'], pad: ['LB'], touch: ['Tblock'] },
  roll: { keys: ['Space'], pad: ['PB'], touch: ['Troll'] },
  jump: { keys: ['F'], pad: ['PA'], touch: ['Tjump'] },
  heal: { keys: ['R'], pad: ['PX'], touch: ['Theal'] },
  pause: { keys: ['Esc'], pad: ['Start'], touch: ['Tpause'] },
  confirm: { keys: ['Enter'], pad: ['PA'] },
  back: { keys: ['Esc'], pad: ['PB'] },
  skip: { keys: ['Enter'], pad: ['PA'] },
  choose: { keys: ['up', 'down'], pad: ['dpad'] },
  adjust: { keys: ['left', 'right'], pad: ['dpad'] },
};

export function glyphsFor(action, device = 'keys', which = null) {
  const b = BINDINGS[action];
  if (!b) return '';
  const list = which === 'alt' ? b.alt : device === 'pad' ? b.pad : device === 'touch' ? b.touch : b.keys;
  return list && list.length ? `<span class="tbf-g">${list.map(glyph).join('')}</span>` : '';
}

export function expandBindingPlaceholders(text, device = 'keys') {
  return String(text)
    .split(/(\{[a-z]+\})/)
    .map((part) => {
      const m = part.match(/^\{([a-z]+)\}$/);
      return m && BINDINGS[m[1]] ? glyphsFor(m[1], device) : escapeHtml(part);
    })
    .join('');
}
