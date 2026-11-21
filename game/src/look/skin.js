export function skinCss(name) {
  const R = `html[data-look="${name}"]`,
    D = `${R} .tbf:not([data-input="touch"])`;
  const bell = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#3a220f"/><stop offset=".35" stop-color="#8a5328"/><stop offset=".55" stop-color="#b9783c"/><stop offset=".8" stop-color="#5a3216"/><stop offset="1" stop-color="#2a170a"/></linearGradient></defs><path d="M100 6c-10 0-14 6-14 12v4c-34 4-50 30-52 70-2 42-8 78-30 104l-2 4c0 10 44 16 98 16s98-6 98-16l-2-4c-22-26-28-62-30-104-2-40-18-66-52-70v-4c0-6-4-12-14-12z" fill="url(#g)" stroke="#1a0e05" stroke-width="3"/><path d="M8 196c30 8 154 8 184 0" fill="none" stroke="#e0a060" stroke-opacity=".35" stroke-width="2"/></svg>`,
  );
  return `
${R} .tbf {
  --ivory: #f0dcb8; --ivory-2: #c7ab86; --ivory-3: #8f7a62;
  --brass: #c4813f; --gold: #ffb85c; --flame: #ff8a2a; --flame-core: #fff0c8;
  --blood: #ff6a1a; --verd: #e0702a;
  --molten: linear-gradient(90deg, #c4400c, #ff8a1e 45%, #ffc155 80%, #fff2b0);
  --trough: linear-gradient(#0d0b0a, #1c1714 60%, #0a0908);
  --rim: #8a5a2c;
  --serif: "Bell Foundry Ysabeau", "Ysabeau Office", "Gill Sans", system-ui, sans-serif;
}
${R} .tbf-list .it, ${R} .tbf-rows .it, ${R} .tbf-panel h2, ${R} .tbf-boss .nm, ${R} .tbf-banner .tx { text-transform: uppercase; letter-spacing: .14em; font-weight: 600; font-style: normal; }
${R} .tbf-list .it { font-size: .86em; }
${R} .tbf-rows .it { letter-spacing: .05em; font-size: .8em; }
${R} .tbf-rows .ch b { letter-spacing: .04em; font-size: .86em; } ${R} .tbf-rows .ch { gap: calc(var(--u) * 16); }
${R} .tbf-panel h2 { font: 700 max(18px, calc(var(--u) * 26))/1.1 var(--sans); letter-spacing: .24em; }

${D} .tbf-vit { top: auto; left: max(18px, calc(var(--u) * 46)); bottom: max(18px, calc(var(--u) * 40)); width: calc(var(--u) * 121); height: calc(var(--u) * 108); display: block; }
${D} .tbf-vit .lamp { display: none; }
${D} .tbf-vit .bars { position: absolute; left: 0; bottom: 0; width: calc(var(--u) * 108); height: calc(var(--u) * 121); transform-origin: 0 100%; transform: rotate(-90deg) translateY(100%);
  flex-direction: column-reverse; justify-content: flex-start; align-items: flex-start; gap: calc(var(--u) * 12); }
${D} .tbf-bar.hp { width: calc(var(--u) * 108) !important; height: calc(var(--u) * 100); border-radius: 0;
  clip-path: polygon(0% 0.0%, 3% 1.5%, 8% 5.0%, 18% 10.0%, 32% 14.5%, 50% 17.0%, 66% 18.5%, 78% 21.0%, 87% 25.0%, 94% 32.0%, 98% 39.0%, 100% 45.0%, 100% 55.0%, 98% 61.0%, 94% 68.0%, 87% 75.0%, 78% 79.0%, 66% 81.5%, 50% 83.0%, 32% 85.5%, 18% 90.0%, 8% 95.0%, 3% 98.5%, 0% 100.0%); }
${D} .tbf-bar.st { width: calc(var(--u) * 96) !important; height: calc(var(--u) * 9); border-radius: calc(var(--u) * 4); margin-left: calc(var(--u) * 6); }
${D} .tbf-vit::before { content: ''; position: absolute; left: calc(var(--u) * 63); top: calc(var(--u) * -13); width: calc(var(--u) * 16); height: calc(var(--u) * 16); border-radius: 50% 50% 0 0; z-index: 2;
  border: calc(var(--u) * 4) solid #b07038; border-bottom: 0; box-shadow: 0 calc(var(--u) * -1) calc(var(--u) * 4) rgba(0,0,0,.7); }
${D} .tbf-vit::after { content: ''; position: absolute; left: calc(var(--u) * 17); bottom: calc(var(--u) * -4); width: calc(var(--u) * 108); height: calc(var(--u) * 7); border-radius: 50%; z-index: 2;
  background: linear-gradient(#e4a466, #8a5328 55%, #3a200c); box-shadow: 0 calc(var(--u) * 3) calc(var(--u) * 8) rgba(0,0,0,.8); }
${R} .tbf-bar { background: var(--trough);
  box-shadow: inset 0 0 calc(var(--u) * 8) rgba(0,0,0,.95), 0 0 0 max(1px, calc(var(--u) * 2)) var(--rim), 0 calc(var(--u) * 3) calc(var(--u) * 12) rgba(0,0,0,.6); }
${R} .tbf-bar .fi { background: var(--molten); box-shadow: 0 0 calc(var(--u) * 10) rgba(255,140,40,.6); }
${R} .tbf-bar .fi::after { height: 100%; top: 0; background: linear-gradient(0deg, transparent 0, rgba(255,250,210,.32) 50%, transparent 100%) 0 0 / 100% 18%; animation: look-boil 1.8s linear infinite; }
${R} .tbf-bar .tr { background: linear-gradient(90deg, #6a1806, #b8401a); opacity: .95; }
${R} .tbf-bar .fx { background: #fff6dc; }
${R} .tbf-bar .cap { display: none; }
${R} .tbf-bar.hp.low { animation: none; } ${R} .tbf-bar.hp.low .fi { animation: look-sputter .9s ease-in-out infinite; }
${R} .tbf-bar.st .fi { background: linear-gradient(90deg, #8c3010, #e0702a 60%, #ffb070); box-shadow: 0 0 calc(var(--u) * 6) rgba(224,112,42,.5); }
${R} .tbf-bar.st .fi::after { display: none; }
${R} .tbf-bar.st .tr { background: #5a2a14; opacity: .7; }
${R} .tbf-bar.st.dull .fi { filter: saturate(0) brightness(.5); box-shadow: none; }
${D} .tbf-flasks { left: max(18px, calc(var(--u) * 196)); bottom: max(18px, calc(var(--u) * 44)); }
${R} .tbf-flasks .fl { position: relative; width: calc(var(--u) * 26); height: calc(var(--u) * 34); }
${R} .tbf-flasks .fl svg { display: none; }
${R} .tbf-flasks .fl::before { content: ''; position: absolute; left: calc(var(--u) * 11); top: 0; width: calc(var(--u) * 4); height: calc(var(--u) * 20); background: linear-gradient(90deg, #4a2a10, #a0652e, #4a2a10); border-radius: 2px; }
${R} .tbf-flasks .fl::after { content: ''; position: absolute; left: 0; bottom: 0; width: calc(var(--u) * 26); height: calc(var(--u) * 15); border-radius: 0 0 50% 50% / 0 0 100% 100%;
  background: radial-gradient(ellipse at 50% 0, #fff0b0 0, #ffa030 30%, #c04010 70%, #3a1a08 72%); box-shadow: 0 0 0 max(1px, calc(var(--u) * 1.6)) #7a4a20, 0 0 calc(var(--u) * 10) rgba(255,130,30,.55); transition: background .6s ease, box-shadow .6s ease; }
${R} .tbf-flasks .fl.used::after { background: radial-gradient(ellipse at 50% 0, #2a1a10 0, #15100c 70%); box-shadow: 0 0 0 max(1px, calc(var(--u) * 1.6)) #4a2e16; }
${D} .tbf-boss { top: max(14px, calc(var(--u) * 26)); bottom: auto; width: min(calc(var(--u) * 900), 70vw); padding: calc(var(--u) * 14) calc(var(--u) * 40) calc(var(--u) * 26); }
${R} .tbf-boss::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: calc(var(--u) * 10) calc(var(--u) * 10) 50% 50% / calc(var(--u) * 10) calc(var(--u) * 10) calc(var(--u) * 30) calc(var(--u) * 30);
  background: linear-gradient(rgba(26,19,15,.88), rgba(10,8,7,.94)); box-shadow: inset 0 0 0 max(1px, calc(var(--u) * 2)) rgba(138,90,44,.85), inset 0 calc(var(--u) * -6) calc(var(--u) * 12) rgba(255,120,30,.08), 0 calc(var(--u) * 6) calc(var(--u) * 24) rgba(0,0,0,.6); }
${R} .tbf-boss .head { justify-content: center; position: relative; }
${R} .tbf-boss .nm { color: #d8a868; font-size: max(13px, calc(var(--u) * 17)); letter-spacing: .3em; text-shadow: 0 -1px 0 rgba(0,0,0,.95), 0 1px 0 rgba(255,210,150,.2); }
${R} .tbf-boss .dmg { position: absolute; right: 0; color: var(--gold); }
${R} .tbf-bar.bb { height: max(8px, calc(var(--u) * 12)); border-radius: 0 0 50% 50% / 0 0 calc(var(--u) * 8) calc(var(--u) * 8); }
${R} .tbf-bar.bb .tr { background: linear-gradient(90deg, #6a1806, #b8401a); }
${R} .tbf-bar.bb .tbf-i-loz { display: none; }
${R} .tbf-lock span svg { display: none; }
${R} .tbf-lock span::before { content: ''; position: absolute; inset: calc(var(--u) * 6); border-radius: 50%; border: calc(var(--u) * 2.5) solid #ffb060; box-shadow: 0 0 calc(var(--u) * 8) rgba(255,130,30,.9), inset 0 0 calc(var(--u) * 5) rgba(255,130,30,.7); }
${R} .tbf-lock span::after { content: ''; position: absolute; left: 50%; top: 50%; width: calc(var(--u) * 5); height: calc(var(--u) * 5); margin: calc(var(--u) * -2.5); border-radius: 50%; background: #fff0c0; box-shadow: 0 0 calc(var(--u) * 6) #ff9030; }
${R} .tbf-prompt { padding: calc(var(--u) * 8) calc(var(--u) * 20); border-radius: calc(var(--u) * 4); background: linear-gradient(rgba(24,18,15,.82), rgba(11,9,8,.88)); box-shadow: inset 0 0 0 max(1px, calc(var(--u) * 1.4)) rgba(138,90,44,.7); text-transform: uppercase; letter-spacing: .12em; font-size: max(12px, calc(var(--u) * 15)); }

${R} .tbf-list .it.on, ${R} .tbf-rows .it.on { color: #ffe2b0; text-shadow: 0 0 calc(var(--u) * 12) rgba(255,130,40,.85), var(--shade); }
${R} .tbf-list .it::before, ${R} .tbf-list .it::after, ${R} .tbf-rows .it::before { background: #ff8a2a; box-shadow: 0 0 calc(var(--u) * 8) rgba(255,130,40,.9); clip-path: none; border-radius: 50%; width: calc(var(--u) * 8); height: calc(var(--u) * 8); margin-top: calc(var(--u) * -4); }
${D} .tbf-title .tbf-list { padding: calc(var(--u) * 70) calc(var(--u) * 104) calc(var(--u) * 42); gap: 0; bottom: calc(var(--u) * 62); }
${D} .tbf-title .tbf-list .it { padding-top: calc(var(--u) * 4); padding-bottom: calc(var(--u) * 4); }
${D} .tbf-title .tbf-spot { bottom: calc(var(--u) * 392); }
${D} .tbf-title .tbf-list::before { content: ''; position: absolute; inset: 0; z-index: -1; background: url("data:image/svg+xml,${bell}") center / 100% 100% no-repeat; filter: drop-shadow(0 calc(var(--u) * 10) calc(var(--u) * 22) rgba(0,0,0,.7)); opacity: .96; }
${D} .tbf-title .tbf-list .it { color: #2a1608; text-shadow: 0 1px 0 rgba(255,200,140,.35), 0 -1px 0 rgba(0,0,0,.5); font-weight: 700; }
${D} .tbf-title .tbf-list .it.on { color: #fff0c8; text-shadow: 0 0 calc(var(--u) * 10) rgba(255,140,40,1), 0 0 calc(var(--u) * 22) rgba(255,100,20,.7); }
${R} .tbf-pause .col, ${R} .tbf-ask .col, ${R} .tbf-options .col { position: relative; padding: calc(var(--u) * 30) calc(var(--u) * 34); border-radius: calc(var(--u) * 5);
  background: radial-gradient(circle at calc(var(--u) * 12) calc(var(--u) * 12), #c98c4c 0 calc(var(--u) * 3.5), transparent calc(var(--u) * 4.5)), radial-gradient(circle at calc(100% - var(--u) * 12) calc(var(--u) * 12), #c98c4c 0 calc(var(--u) * 3.5), transparent calc(var(--u) * 4.5)),
    radial-gradient(circle at calc(var(--u) * 12) calc(100% - var(--u) * 12), #c98c4c 0 calc(var(--u) * 3.5), transparent calc(var(--u) * 4.5)), radial-gradient(circle at calc(100% - var(--u) * 12) calc(100% - var(--u) * 12), #c98c4c 0 calc(var(--u) * 3.5), transparent calc(var(--u) * 4.5)),
    linear-gradient(rgba(26,19,15,.9), rgba(11,9,8,.94));
  box-shadow: inset 0 0 0 max(1px, calc(var(--u) * 2)) rgba(138,90,44,.85), inset 0 0 calc(var(--u) * 34) rgba(0,0,0,.6), 0 calc(var(--u) * 8) calc(var(--u) * 30) rgba(0,0,0,.6); }
${R} .tbf-panel h2 { color: #f0cf98; border-bottom: max(1px, calc(var(--u) * 2)) solid rgba(196,129,63,.6); text-shadow: 0 0 calc(var(--u) * 14) rgba(255,120,30,.3), var(--shade); }
${R} .tbf-card { padding: calc(var(--u) * 24) calc(var(--u) * 30); border-left: 0; border-radius: calc(var(--u) * 5); background: linear-gradient(rgba(20,15,12,.78), rgba(9,7,6,.86)); box-shadow: inset 0 0 0 max(1px, calc(var(--u) * 1.5)) rgba(138,90,44,.55); }
${R} .tbf-card th { color: #c4813f; }
${R} .tbf-rows .sl::before { background: rgba(196,129,63,.45); height: calc(var(--u) * 4); border-radius: 2px; }
${R} .tbf-rows .sl .fl, ${R} .tbf-rows .it.on .sl .fl { background: var(--molten); box-shadow: 0 0 calc(var(--u) * 6) rgba(255,130,40,.6); height: calc(var(--u) * 4); }
${R} .tbf-rows .sl .kn { background: #c4813f; border-radius: 50%; clip-path: none; } ${R} .tbf-rows .it.on .sl .kn { background: #ffd08a; box-shadow: 0 0 calc(var(--u) * 8) #ff9030; }
${R} .tbf-rows .it.on .ch b.cur { color: var(--gold); border-bottom-color: var(--gold); }
${R} .tbf-banner.death { color: #ff7a2a; } ${R} .tbf-banner.victory { color: #f0c27a; }
${R} .tbf-legend { text-transform: uppercase; letter-spacing: .1em; }
${R} .tbf-pause::before, ${R} .tbf-options::before { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0; opacity: .7;
  background-image: radial-gradient(circle, rgba(255,170,70,.95) 0 1.2px, transparent 2px), radial-gradient(circle, rgba(255,120,30,.8) 0 1px, transparent 1.8px), radial-gradient(circle, rgba(255,200,120,.7) 0 .8px, transparent 1.5px);
  background-size: 180px 260px, 240px 340px, 130px 210px; animation: look-sparks 9s linear infinite; mask-image: linear-gradient(transparent, #000 40%, #000 80%, transparent); }
${R} .tbf-pause > *, ${R} .tbf-options > * { position: relative; z-index: 1; }
${R} .tbf-pause > .tbf-keys, ${R} .tbf-options > .tbf-keys { position: absolute; }
${R} .tbf-rows .it.tabs .ch b { font-size: 1em; }
@keyframes look-boil { from { background-position: 0 0; } to { background-position: 0 -100%; } }
@keyframes look-sputter { 50% { filter: brightness(.55) saturate(.7); } }
@keyframes look-sparks { from { background-position: 0 0, 60px 40px, 30px 90px; } to { background-position: 20px -260px, 30px -300px, 50px -120px; } }
@media (prefers-reduced-motion: reduce) { ${R} .tbf-bar .fi::after, ${R} .tbf-pause::before, ${R} .tbf-options::before { animation: none; } }
`;
}
