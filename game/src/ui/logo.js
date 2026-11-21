// The game's title, set as SVG lettering in the title font (loaded by ui/style.js). Two copies per holder: a blurred
// shade underneath and the gilded ink on top.
import { FOUNDRY_LOOK } from '../config/foundry-look.js';
import { escapeHtml } from './glyphs.js';

const TITLE = FOUNDRY_LOOK.title;
export const NAME = TITLE.name;
let copies = 0;

/** @param {HTMLElement} holder */
export function mountLogo(holder) {
  const W = TITLE.width,
    n = ++copies,
    text = escapeHtml(TITLE.caps ? TITLE.name.toUpperCase() : TITLE.name);
  const one = (
    cls,
  ) => `<svg class="${cls}" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 800">
<defs><linearGradient id="tbf-title-${n}${cls[0]}-ink" gradientUnits="userSpaceOnUse" x1="0" y1="80" x2="0" y2="720"><stop offset="0" stop-color="#f6e2c0"/><stop offset=".55" stop-color="#e8b878"/><stop offset="1" stop-color="#b87436"/></linearGradient></defs>
<g class="letters" fill="#ead2a8" style="fill:url(#tbf-title-${n}${cls[0]}-ink) #ead2a8"><text x="${W / 2}" y="600" text-anchor="middle" font-family="${TITLE.font}" font-weight="${TITLE.weight || 400}" font-size="${TITLE.size || 560}" letter-spacing="${TITLE.spacing}" textLength="${W - 120}" lengthAdjust="spacingAndGlyphs">${text}</text></g><g class="flame"></g></svg>`;
  holder.classList.add('tbf-logo', 'drawn');
  holder.setAttribute('role', 'img');
  holder.setAttribute('aria-label', NAME);
  holder.innerHTML = one('shade') + one('ink');
  holder.style.aspectRatio = String(W / 800);
}
