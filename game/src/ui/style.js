const FONTS = new URL('../../assets/fonts/', import.meta.url).href;

const CSS = `
@font-face { font-family: "Bell Foundry Caslon"; src: url("${FONTS}libre-caslon-text-400.woff2") format("woff2"); font-weight: 400; font-style: normal; font-display: block; }
@font-face { font-family: "Bell Foundry Caslon"; src: url("${FONTS}libre-caslon-text-400-italic.woff2") format("woff2"); font-weight: 400; font-style: italic; font-display: block; }
@font-face { font-family: "Bell Foundry Ysabeau"; src: url("${FONTS}ysabeau-office-400-700.woff2") format("woff2"); font-weight: 400 700; font-style: normal; font-display: block; }

.tbf {
  --u: clamp(.7px, min(.0625vw, .1111vh), 1.9px);
  --hair: max(1px, calc(var(--u) * .9));
  --bar: max(0px, calc((100vh - 100vw / 2.39) / 2));
  --ivory: #ece3cd; --ivory-2: #bdb39c; --ivory-3: #8f8775;
  --brass: #cfb57c; --gold: #ecd9a2;
  --flame: #f1bb58; --flame-core: #fff2cc;
  --blood: #a3382f; --verd: #84a791;
  --ink: #05070b;
  --serif: "Bell Foundry Caslon", "Libre Caslon Text", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --sans: "Bell Foundry Ysabeau", "Ysabeau Office", "Gill Sans", "Segoe UI", system-ui, sans-serif;
  --shade: 0 1px 2px rgba(0,0,0,.92), 0 0 calc(var(--u) * 14) rgba(0,0,0,.62);
  font: 400 calc(var(--u) * 18)/1.35 var(--serif); color: var(--ivory);
  overflow: hidden; cursor: default; user-select: none; -webkit-user-select: none;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; font-kerning: normal; font-synthesis: none;
}
.tbf *, .tbf *::before, .tbf *::after { box-sizing: border-box; margin: 0; padding: 0; }
.tbf i, .tbf b, .tbf em { font-style: normal; font-weight: inherit; }
.tbf i { display: block; }
.tbf svg { display: block; overflow: visible; }
.tbf-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.tbf-g { display: inline-flex; align-items: center; gap: .3em; vertical-align: middle; }
.tbf-k, .tbf-p { position: relative; display: inline-flex; align-items: center; justify-content: center; min-width: 1.7em; height: 1.7em; padding: 0 .36em;
  font: 600 .74em/1 var(--sans); letter-spacing: .03em; color: var(--ivory); text-shadow: none; white-space: nowrap;
  border: var(--hair) solid rgba(207,181,124,.6); border-radius: .28em; background: rgba(5,7,11,.52); box-shadow: 0 var(--hair) 0 rgba(207,181,124,.26); }
.tbf-k.tbf-w { padding: 0 .6em; }
.tbf-k.tbf-ar { font-weight: 500; }
.tbf-p { border-radius: 50%; padding: 0; box-shadow: none; }
.tbf-p.tbf-st { box-shadow: 0 0 0 .14em rgba(5,7,11,.5), 0 0 0 calc(.14em + var(--hair)) rgba(207,181,124,.42); margin: 0 .16em; }
.tbf-p.tbf-cl::after { content: ''; position: absolute; left: 50%; bottom: -.62em; width: .5em; height: .3em; margin-left: -.25em; background: rgba(207,181,124,.8); clip-path: polygon(0 0, 100% 0, 50% 100%); }
.tbf-p.tbf-dp { border-radius: .28em; border-color: transparent; background: none; }
.tbf-p.tbf-dp::before, .tbf-p.tbf-dp::after { content: ''; position: absolute; left: 50%; top: 50%; background: rgba(5,7,11,.52); border: var(--hair) solid rgba(207,181,124,.6); border-radius: .12em; }
.tbf-p.tbf-dp::before { width: .56em; height: 1.6em; margin: -.8em 0 0 -.28em; }
.tbf-p.tbf-dp::after { width: 1.6em; height: .56em; margin: -.28em 0 0 -.8em; }
.tbf-m { display: inline-block; width: .9em; height: 1.28em; vertical-align: middle; }
.tbf-m svg { width: 100%; height: 100%; }
.tbf-i-mouse .s { fill: rgba(5,7,11,.45); stroke: rgba(207,181,124,.82); stroke-width: 1.1; stroke-linejoin: round; }
.tbf-i-mouse .b { fill: var(--ivory); }
.tbf-plus { opacity: .6; font: 500 .8em/1 var(--sans); }

.tbf-lbx { position: absolute; left: 0; right: 0; height: var(--bar); background: #000; will-change: transform; }
.tbf-lbx.t { top: 0; transform: translateY(-101%); }
.tbf-lbx.b { bottom: 0; transform: translateY(101%); }
.tbf-fade { position: absolute; inset: 0; background: #000; opacity: 0; }

.tbf-hud { position: absolute; inset: 0; opacity: 0; visibility: hidden; transition: opacity .3s ease, visibility 0s .3s; }
.tbf[data-screen="hud"] .tbf-hud { opacity: 1; visibility: visible; transition: opacity .7s ease .1s, visibility 0s; }

.tbf-vit { position: absolute; left: max(16px, calc(var(--u) * 40)); top: max(14px, calc(var(--u) * 34)); display: flex; align-items: center; }
.tbf-vit .lamp { position: relative; z-index: 1; flex: none; width: calc(var(--u) * 42); height: calc(var(--u) * 42); margin-right: calc(var(--u) * 5); filter: drop-shadow(0 0 calc(var(--u) * 3) rgba(0,0,0,.8)); }
.tbf-vit .lamp svg { width: 100%; height: 100%; }
.tbf-i-lamp .r { fill: rgba(5,7,11,.5); stroke: var(--brass); stroke-width: 1.1; }
.tbf-i-lamp .h { fill: rgba(241,187,88,.13); transition: opacity 1s ease; }
.tbf-i-lamp .f { transform-box: fill-box; transform-origin: 50% 100%; transition: opacity 1.4s ease; filter: drop-shadow(0 0 2.5px rgba(241,170,70,.7)); }
.tbf-i-lamp .o, .tbf-i-flame .o { fill: var(--flame); }
.tbf-i-lamp .c, .tbf-i-flame .c { fill: var(--flame-core); }
.tbf-vit .lamp.low .f { animation: tbf-gutter 1.15s ease-in-out infinite; }
.tbf-vit .lamp.low .h { opacity: .4; }
.tbf-vit .lamp.out .f, .tbf-vit .lamp.out .h { opacity: 0; }
.tbf-vit .bars { display: flex; flex-direction: column; gap: calc(var(--u) * 7); }

.tbf-bar { position: relative; height: max(5px, calc(var(--u) * 8)); background: rgba(5,7,11,.68);
  box-shadow: 0 0 0 var(--hair) rgba(207,181,124,.5), 0 0 0 calc(var(--hair) * 2) rgba(0,0,0,.4), 0 calc(var(--u) * 2) calc(var(--u) * 10) rgba(0,0,0,.5); }
.tbf-bar > i { position: absolute; inset: 0; transform-origin: 0 50%; will-change: transform; }
.tbf-bar .fi { background: linear-gradient(#c65a4f, #a3382f 46%, #7b2420); }
.tbf-bar .fi::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1px; background: rgba(255,222,205,.34); }
.tbf-bar .tr { background: #eadcb6; opacity: .9; }
.tbf-bar .fx { background: #fff1d8; opacity: 0; will-change: opacity; }
.tbf-bar .cap { position: absolute; right: calc(var(--hair) * -1); top: calc(var(--u) * -3); bottom: calc(var(--u) * -3); width: var(--hair); background: rgba(207,181,124,.75); }
.tbf-bar.hp.low { animation: tbf-low 1.5s ease-in-out infinite; }
.tbf-bar.st { height: max(4px, calc(var(--u) * 6)); }
.tbf-bar.st .fi { background: linear-gradient(#a3c4ae, #84a791 48%, #5f8370); transition: filter .35s ease; }
.tbf-bar.st .tr { background: #dfe6d0; opacity: .55; }
.tbf-bar.st.dull .fi { filter: saturate(.12) brightness(.74); }

.tbf-flasks { position: absolute; left: max(16px, calc(var(--u) * 46)); bottom: max(14px, calc(var(--u) * 38)); display: flex; align-items: center; gap: calc(var(--u) * 14); font-size: max(12px, calc(var(--u) * 16)); }
.tbf-flasks.none { display: none; }
.tbf-flasks .row { display: flex; gap: calc(var(--u) * 7); }
.tbf-flasks .fl { width: calc(var(--u) * 20); height: calc(var(--u) * 28); filter: drop-shadow(0 1px calc(var(--u) * 3) rgba(0,0,0,.75)); }
.tbf-flasks .fl svg { width: 100%; height: 100%; }
.tbf-i-flask .k { fill: rgba(5,7,11,.5); }
.tbf-i-flask .g { fill: none; stroke: var(--brass); stroke-width: 1.15; stroke-linejoin: round; transition: stroke .6s ease; }
.tbf-i-flask .q { fill: #dfa650; transform-box: fill-box; transform-origin: 50% 100%; transition: transform .7s cubic-bezier(.4,0,.6,1), opacity .7s ease; }
.tbf-flasks .fl.used .q { transform: scaleY(0); opacity: 0; }
.tbf-flasks .fl.used .g { stroke: rgba(207,181,124,.4); }
.tbf-flasks .fl.still .q, .tbf-flasks .fl.still .g { transition: none; }
.tbf-flasks .key { opacity: .7; }

.tbf-boss { position: absolute; left: 50%; bottom: max(20px, calc(var(--u) * 52)); width: min(calc(var(--u) * 860), 72vw); transform: translateX(-50%); opacity: 0; transition: opacity .5s ease; }
.tbf-boss.on { opacity: 1; transition: opacity 1.3s ease .25s; }
.tbf-boss .head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: calc(var(--u) * 10); padding: 0 calc(var(--u) * 1); }
.tbf-boss .nm { font-size: max(14px, calc(var(--u) * 20)); line-height: 1.1; letter-spacing: .012em; white-space: nowrap; text-shadow: var(--shade); }
.tbf-boss .dmg { font: 500 max(13px, calc(var(--u) * 18))/1 var(--sans); font-variant-numeric: lining-nums tabular-nums; letter-spacing: .04em; text-shadow: var(--shade); opacity: 0; }
.tbf-bar.bb { height: max(5px, calc(var(--u) * 7)); }
.tbf-bar.bb .tr { background: #ead7a4; }
.tbf-bar.bb .tbf-i-loz { position: absolute; top: 50%; width: calc(var(--u) * 10); height: calc(var(--u) * 10); margin-top: calc(var(--u) * -5); fill: var(--brass); filter: drop-shadow(0 0 calc(var(--u) * 2) rgba(0,0,0,.9)); }
.tbf-bar.bb .tbf-i-loz:nth-of-type(1) { left: calc(var(--u) * -13); }
.tbf-bar.bb .tbf-i-loz:nth-of-type(2) { right: calc(var(--u) * -13); }

.tbf-lock { position: absolute; left: 0; top: 0; width: 0; height: 0; will-change: transform; }
.tbf-pulse { position: absolute; left: calc(max(16px, calc(var(--u) * 40)) + var(--sl, 0px)); top: calc(max(14px, calc(var(--u) * 30)) + var(--st, 0px)); display: none; align-items: center; gap: calc(var(--u) * 8); --pc: var(--brass); }
.tbf-pulse.on { display: flex; }
.tbf-pulse canvas { width: calc(var(--u) * 168); height: calc(var(--u) * 30); background: rgba(5,7,11,.5); box-shadow: 0 0 0 var(--hair) rgba(207,181,124,.4), 0 calc(var(--u) * 2) calc(var(--u) * 10) rgba(0,0,0,.5); }
.tbf-pulse .hr { width: calc(var(--u) * 15); height: calc(var(--u) * 13); display: block; filter: drop-shadow(0 0 calc(var(--u) * 3) rgba(0,0,0,.85)); }
.tbf-pulse .hr svg { width: 100%; height: 100%; display: block; fill: var(--pc); }
.tbf-pulse .bpm { min-width: 2.2em; font: 500 max(13px, calc(var(--u) * 18))/1 var(--sans); font-variant-numeric: lining-nums tabular-nums; letter-spacing: .04em; color: var(--ivory); text-shadow: var(--shade); }
.tbf-pvig { position: absolute; inset: 0; display: none; opacity: 0; pointer-events: none; background: rgb(8,4,3); backdrop-filter: saturate(.45);
  -webkit-mask-image: radial-gradient(ellipse at center, transparent 42%, #000 100%); mask-image: radial-gradient(ellipse at center, transparent 42%, #000 100%); }
@media (max-width: 720px) { .tbf-pulse { top: calc(max(14px, calc(var(--u) * 34)) + 44px + var(--st, 0px)); } }
.tbf-lock span { position: absolute; left: calc(var(--u) * -15); top: calc(var(--u) * -15); width: calc(var(--u) * 30); height: calc(var(--u) * 30); opacity: 0; transform: scale(2) rotate(45deg); transition: opacity .12s ease, transform .12s ease; }
.tbf-lock span svg { width: 100%; height: 100%; }
.tbf-lock.on span { opacity: 1; transform: none; transition: opacity .16s ease, transform .34s cubic-bezier(.2,.9,.25,1); }
.tbf-i-lock .d { fill: none; stroke: rgba(5,7,11,.72); stroke-width: 3.6; stroke-linejoin: round; }
.tbf-i-lock .d circle { fill: rgba(5,7,11,.72); stroke-width: 2.2; }
.tbf-i-lock .l { fill: none; stroke: #f4ebd6; stroke-width: 1.25; }
.tbf-i-lock .l circle { fill: #f4ebd6; stroke: none; }

.tbf-prompt { position: absolute; left: 50%; bottom: 23%; transform: translateX(-50%); display: flex; align-items: center; gap: .55em; white-space: nowrap;
  font-size: max(14px, calc(var(--u) * 19)); text-shadow: var(--shade); opacity: 0; transition: opacity .3s ease; }
.tbf-prompt.on { opacity: .95; }

.tbf-banner { position: absolute; left: 0; right: 0; top: 50%; height: calc(var(--u) * 250); transform: translateY(-54%); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: calc(var(--u) * 22); visibility: hidden; }
.tbf-banner.live { visibility: visible; }
.tbf-banner .band { position: absolute; inset: 0; opacity: 0; background: linear-gradient(rgba(2,3,6,0), rgba(2,3,6,.8) 30%, rgba(2,3,6,.87) 50%, rgba(2,3,6,.8) 70%, rgba(2,3,6,0)); }
.tbf-banner .ru { position: relative; width: min(calc(var(--u) * 720), 78vw); height: var(--hair); opacity: 0; background: linear-gradient(90deg, transparent, currentColor 24%, currentColor 76%, transparent); }
.tbf-banner .tx { position: relative; opacity: 0; font-size: clamp(20px, calc(var(--u) * 52), 4.4vw); line-height: 1; letter-spacing: .32em; margin-right: -.32em; text-transform: uppercase; white-space: nowrap; will-change: transform, opacity; }
.tbf-banner.death { color: #a0352d; }
.tbf-banner.death .tx { text-shadow: 0 0 calc(var(--u) * 34) rgba(150,28,20,.45), 0 calc(var(--u) * 2) calc(var(--u) * 3) rgba(0,0,0,.9); }
.tbf-banner.victory { color: #ead7a0; }
.tbf-banner.victory .tx { text-shadow: 0 0 calc(var(--u) * 36) rgba(232,190,104,.36), 0 calc(var(--u) * 2) calc(var(--u) * 3) rgba(0,0,0,.9); }

.tbf-name { position: absolute; left: 50%; bottom: calc(var(--bar) + 6.5vh); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 13); white-space: nowrap; opacity: 0; }
.tbf-name .tx { font-size: max(18px, calc(var(--u) * 30)); line-height: 1.1; letter-spacing: .015em; text-shadow: 0 1px 2px rgba(0,0,0,.95), 0 0 calc(var(--u) * 18) rgba(0,0,0,.78); }
.tbf-name .ru { width: 100%; height: var(--hair); opacity: .75; background: linear-gradient(90deg, transparent, var(--brass) 20%, var(--brass) 80%, transparent); }

.tbf-sub { position: absolute; left: 50%; bottom: max(calc(var(--u) * 50), calc(var(--bar) * .5)); transform: translate(-50%, 50%); width: max-content; max-width: min(84vw, 44em); text-align: center; text-wrap: balance;
  font-size: max(16px, calc(var(--u) * 25)); line-height: 1.36; opacity: 0;
  text-shadow: 0 1px 2px #000, 0 0 calc(var(--u) * 10) rgba(0,0,0,.88), 0 0 calc(var(--u) * 26) rgba(0,0,0,.6); }

.tbf-skip { position: absolute; right: max(16px, calc(var(--u) * 44)); bottom: max(calc(var(--u) * 34), calc(var(--bar) * .5)); transform: translateY(50%); display: flex; align-items: center; gap: .7em; white-space: nowrap;
  font: 500 max(12px, calc(var(--u) * 14.5))/1 var(--sans); letter-spacing: .08em; color: var(--ivory-2); text-shadow: var(--shade); opacity: 0; transition: opacity .4s ease; }
.tbf-skip.on { opacity: 1; transition: opacity .2s ease; }
.tbf-i-ring { width: 1.9em; height: 1.9em; }
.tbf-i-ring .t { fill: rgba(5,7,11,.4); stroke: rgba(207,181,124,.34); stroke-width: 1.3; }
.tbf-i-ring .v { fill: none; stroke: var(--gold); stroke-width: 1.9; stroke-dasharray: 100; stroke-dashoffset: 100; }

.tbf-logo { position: relative; display: block; aspect-ratio: 5.2; container-type: inline-size; color: var(--ivory); }
.tbf-logo svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.tbf-logo .shade { opacity: .6; filter: blur(calc(var(--u) * 7)); transform: translateY(calc(var(--u) * 2)); }
.tbf-logo .shade * { fill: #000 !important; stroke: #000 !important; }
.tbf-logo .shade .flame { display: none; }
.tbf-logo .ink .flame { transform-box: fill-box; transform-origin: 50% 100%; }

/* Center the title clear of the boss and the rose window. */
.tbf { --logo-w: min(calc(var(--u) * 740), 88vw); --title-x: clamp(calc(var(--logo-w) / 2 + 5vw), 32vw, 50vw); }
.tbf-spot { position: absolute; left: var(--title-x); bottom: calc(var(--u) * 222); width: var(--logo-w); transform: translateX(-50%); }

.tbf-load { position: absolute; inset: 0; background: var(--ink); transition: opacity .4s ease, visibility 0s .4s; }
.tbf-load.gone { opacity: 0; visibility: hidden; }
.tbf-load.slow { transition: opacity 2.6s cubic-bezier(.45,0,.2,1) 1.2s, visibility 0s 3.8s; }
.tbf-load .tbf-spot { left: 50%; top: 47%; bottom: auto; width: min(calc(var(--u) * 680), 80vw); transform: translate(-50%, -50%); transition: opacity .45s ease; }
.tbf-load.gone .tbf-spot { opacity: 0; }
.tbf-load .tbf-logo .ink { opacity: .13; }
.tbf-load .tbf-logo .shade, .tbf-load .tbf-logo .ink .flame { display: none; }
.tbf-load .line { position: absolute; left: 50%; top: calc(100% + var(--u) * 34); width: 30%; height: var(--hair); transform: translateX(-50%); background: rgba(207,181,124,.2); transition: opacity .5s ease; }
.tbf-load .line i { position: absolute; inset: 0; background: var(--gold); transform-origin: 0 50%; transform: scaleX(0); transition: transform .3s ease-out; }

.tbf-menus { position: absolute; inset: 0; pointer-events: none; }
.tbf-menus.open { pointer-events: auto; }
.tbf-veil { position: absolute; inset: 0; opacity: 0; transition: opacity .4s ease; }
.tbf-veil.vt { background: linear-gradient(rgba(5,7,11,.32) 0%, rgba(5,7,11,0) 20%, rgba(5,7,11,0) 36%, rgba(5,7,11,.52) 60%, rgba(5,7,11,.9) 100%); }
.tbf-veil.vp { background: radial-gradient(130% 100% at 50% 46%, rgba(5,7,11,.72) 0%, rgba(4,5,9,.9) 100%); }
.tbf-veil.ve { background: radial-gradient(90% 80% at 50% 50%, rgba(5,7,11,.8) 0%, rgba(5,7,11,.45) 100%); }
.tbf-menus[data-panel="title"] .vt, .tbf-menus[data-panel="pause"] .vp, .tbf-menus[data-panel="ask"] .vp, .tbf-menus[data-panel="options"] .vp, .tbf-menus[data-panel="ctrl"] .vp, .tbf-menus[data-panel="end"] .ve { opacity: 1; transition: opacity .8s ease; }

.tbf-panel { position: absolute; inset: 0; opacity: 0; visibility: hidden; transition: opacity .25s ease, visibility 0s .25s; }
.tbf-panel.cur { opacity: 1; visibility: visible; transition: opacity .45s ease .1s, visibility 0s; }
.tbf-menus.leaving .tbf-panel.cur { opacity: 0; transition: opacity .3s ease; }

.tbf-list { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 4); }
.tbf-list .it, .tbf-rows .it { position: relative; cursor: pointer; white-space: nowrap; color: var(--ivory-2); text-shadow: var(--shade); transition: color .16s ease; }
.tbf-list .it { padding: calc(var(--u) * 6) calc(var(--u) * 36); font-size: max(17px, calc(var(--u) * 25)); line-height: 1.25; letter-spacing: .015em; }
.tbf-list .it::before, .tbf-list .it::after, .tbf-rows .it::before { content: ''; position: absolute; top: 50%; width: calc(var(--u) * 8); height: calc(var(--u) * 12); margin-top: calc(var(--u) * -6);
  background: var(--gold); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); opacity: 0; transform: scale(.3); transition: opacity .16s ease, transform .22s ease; }
.tbf-list .it::before, .tbf-rows .it::before { left: calc(var(--u) * 6); }
.tbf-list .it::after { right: calc(var(--u) * 6); }
.tbf-list .it.on, .tbf-rows .it.on { color: #f7f0dd; }
.tbf-list .it.on::before, .tbf-list .it.on::after, .tbf-rows .it.on::before { opacity: 1; transform: none; }

.tbf-legend, .tbf-keys { position: absolute; left: 0; right: 0; bottom: max(12px, calc(var(--u) * 28)); display: flex; flex-wrap: wrap; justify-content: center; gap: calc(var(--u) * 8) calc(var(--u) * 28); padding: 0 4vw;
  font: 500 max(11.5px, calc(var(--u) * 13.5))/1.2 var(--sans); letter-spacing: .07em; color: var(--ivory-3); text-shadow: 0 1px 2px rgba(0,0,0,.9); }
.tbf-legend .e, .tbf-keys .e { display: inline-flex; align-items: center; gap: .55em; white-space: nowrap; }

.tbf-title .tbf-list { position: absolute; left: var(--title-x); bottom: calc(var(--u) * 92); transform: translateX(-50%); }
.tbf-title .ink .letters, .tbf-title .shade { opacity: 0; transition: opacity .3s ease; }
.tbf-title .ink .flame { opacity: 0; transition: opacity .3s ease; }
.tbf-title.cur .ink .letters, .tbf-title.cur .shade { opacity: 1; transition: opacity .8s ease .1s; }
.tbf-title.cur .shade { opacity: .6; }
.tbf-title.cur .ink .flame { opacity: 1; transition: opacity .8s ease .1s; animation: tbf-flicker 4.3s ease-in-out infinite; filter: drop-shadow(0 0 calc(var(--u) * 10) rgba(241,170,70,.62)); }
.tbf-title .tbf-list, .tbf-title .tbf-legend { opacity: 0; transition: opacity .25s ease; }
.tbf-title.cur .tbf-list { opacity: 1; transition: opacity .7s ease .3s; }
.tbf-title.cur .tbf-legend { opacity: 1; transition: opacity .7s ease .5s; }
.tbf.first .tbf-title.cur .ink .flame { transition: opacity 1.1s ease .45s; }
.tbf.first .tbf-title.cur .ink .letters { transition: opacity 2.2s ease .9s; }
.tbf.first .tbf-title.cur .shade { transition: opacity 2.4s ease 1.8s; }
.tbf.first .tbf-title.cur .tbf-list { transition: opacity 1.1s ease 3.3s; }
.tbf.first .tbf-title.cur .tbf-legend { transition: opacity 1.1s ease 3.9s; }

.tbf-pause, .tbf-ask, .tbf-options { display: flex; flex-wrap: wrap; align-items: center; align-content: center; justify-content: center; gap: calc(var(--u) * 34) calc(var(--u) * 80); padding: 4vh 5vw 9vh; }
@media (max-aspect-ratio: 1/1) { .tbf-pause .tbf-card { padding-left: 0; border-left: 0; } }
.tbf-panel .col { min-width: min(calc(var(--u) * 330), 90vw); }
.tbf-panel h2 { font: italic 400 max(21px, calc(var(--u) * 33))/1.15 var(--serif); letter-spacing: .005em; color: var(--ivory); text-shadow: var(--shade);
  padding-bottom: calc(var(--u) * 18); margin-bottom: calc(var(--u) * 18); border-bottom: var(--hair) solid rgba(207,181,124,.32); }
.tbf-pause .tbf-list, .tbf-ask .tbf-list { align-items: flex-start; }
.tbf-pause .tbf-list .it, .tbf-ask .tbf-list .it { padding-left: calc(var(--u) * 30); padding-right: calc(var(--u) * 12); }
.tbf-pause .tbf-list .it::after, .tbf-ask .tbf-list .it::after { display: none; }
.tbf-ask .note { font-size: max(14px, calc(var(--u) * 19)); color: var(--ivory-2); margin: calc(var(--u) * -4) 0 calc(var(--u) * 20); text-shadow: var(--shade); }

.tbf-card { padding-left: calc(var(--u) * 76); border-left: var(--hair) solid rgba(207,181,124,.24); }
.tbf-card table { border-collapse: collapse; font: 500 max(12px, calc(var(--u) * 15))/1.2 var(--sans); color: var(--ivory-2); }
.tbf-card th { font: 500 .82em/1 var(--sans); letter-spacing: .15em; text-align: left; color: var(--ivory-3); padding: 0 calc(var(--u) * 34) calc(var(--u) * 14) 0; white-space: nowrap; transition: opacity .3s ease; }
.tbf-card td { padding: calc(var(--u) * 6) calc(var(--u) * 34) calc(var(--u) * 6) 0; white-space: nowrap; vertical-align: middle; transition: opacity .3s ease; }
.tbf-card td:first-child { font: 400 max(13px, calc(var(--u) * 17.5))/1.2 var(--serif); color: var(--ivory); padding-right: calc(var(--u) * 46); }
.tbf-card em { font: italic 400 .95em/1 var(--serif); margin: 0 .6em; color: var(--ivory-3); }
.tbf-menus[data-device="keys"] .tbf-card .p, .tbf-menus[data-device="pad"] .tbf-card .k { opacity: .58; }

.tbf-options .col { width: min(calc(var(--u) * 720), 92vw); }
.tbf-rows { display: flex; flex-direction: column; gap: calc(var(--u) * 1); }
.tbf-rows .it { display: grid; grid-template-columns: minmax(0, 1fr) calc(var(--u) * 310); align-items: center; column-gap: calc(var(--u) * 24);
  padding: calc(var(--u) * 9) calc(var(--u) * 6) calc(var(--u) * 9) calc(var(--u) * 30); font-size: max(15px, calc(var(--u) * 21)); line-height: 1.25; }
.tbf-rows .it.slider { grid-template-columns: minmax(0, 1fr) calc(var(--u) * 250) calc(var(--u) * 36); }
.tbf-rows .it.act { margin-top: calc(var(--u) * 18); }
.tbf-rows .sl { position: relative; height: calc(var(--u) * 28); --v: 0; }
.tbf-rows .sl::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: var(--hair); margin-top: calc(var(--hair) * -.5); background: rgba(207,181,124,.36); }
.tbf-rows .sl .fl { position: absolute; left: 0; right: 0; top: 50%; height: max(2px, calc(var(--u) * 2)); margin-top: min(-1px, calc(var(--u) * -1)); background: var(--brass); transform-origin: 0 50%; transform: scaleX(var(--v)); }
.tbf-rows .sl .kw { position: absolute; inset: 0; transform: translateX(calc(var(--v) * 100%)); pointer-events: none; }
.tbf-rows .sl .kn { position: absolute; left: calc(var(--u) * -7); top: 50%; width: calc(var(--u) * 14); height: calc(var(--u) * 14); margin-top: calc(var(--u) * -7); background: var(--ivory-2); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
.tbf-rows .it.on .sl .fl { background: var(--gold); }
.tbf-rows .it.on .sl .kn { background: #fff6e0; }
.tbf-rows .val { text-align: right; font: 500 .78em/1 var(--sans); font-variant-numeric: lining-nums tabular-nums; letter-spacing: .03em; color: var(--ivory-3); text-shadow: none; }
.tbf-rows .it.on .val { color: var(--ivory); }
.tbf-rows .ch { display: flex; gap: calc(var(--u) * 24); }
.tbf-rows .ch b { font-size: .9em; color: var(--ivory-3); padding-bottom: calc(var(--u) * 2); border-bottom: var(--hair) solid transparent; transition: color .15s ease, border-color .15s ease; }
.tbf-rows .ch b.cur { color: var(--ivory-2); border-bottom-color: rgba(207,181,124,.5); }
.tbf-rows .it.on .ch b.cur { color: var(--gold); border-bottom-color: var(--gold); }
.tbf-rows .it.tabs { grid-template-columns: minmax(0, 1fr); margin-bottom: calc(var(--u) * 14); padding-bottom: calc(var(--u) * 10); border-bottom: var(--hair) solid rgba(207,181,124,.24); }
.tbf-rows .it.tabs .lb { display: none; }
.tbf-rows .it.tabs .ch { flex-wrap: wrap; row-gap: calc(var(--u) * 6); }
.tbf-rows .it.wrap { grid-template-columns: minmax(0, 1fr); row-gap: calc(var(--u) * 6); }
.tbf-rows .it.wrap .ch { flex-wrap: wrap; row-gap: calc(var(--u) * 6); column-gap: calc(var(--u) * 20); }
.tbf-prev { display: none; position: relative; margin: 0; width: min(calc(var(--u) * 380), 86vw); height: min(calc(var(--u) * 560), 64vh); border: var(--hair) solid rgba(207,181,124,.32); background: radial-gradient(ellipse at 50% 58%, rgba(84,62,36,.92), rgba(14,11,9,.96) 72%); }
.tbf-options.figs .tbf-prev { display: block; }
.tbf-prev canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; transition: opacity .2s ease; }
.tbf-prev[data-state] canvas { opacity: .3; }
.tbf-prev .cap { position: absolute; left: 0; right: 0; bottom: 0; text-align: center; font: 500 max(12px, calc(var(--u) * 14))/1.3 var(--sans); letter-spacing: .04em; color: var(--ivory-2); text-shadow: var(--shade); }
.tbf-rows .inf { text-align: right; font: 500 .74em/1.2 var(--sans); letter-spacing: .03em; color: var(--ivory-3); text-shadow: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tbf-rows .it.on .inf { color: var(--ivory-2); }
.tbf-msg { margin-top: calc(var(--u) * 14); font: 500 max(12px, calc(var(--u) * 15))/1.45 var(--sans); color: var(--ivory-3); text-shadow: var(--shade); min-height: 1.45em; }
.tbf-msg span { display: block; }
.tbf-card .h { display: none; }
.tbf-menus[data-hw="1"] .tbf-card .h { display: table-cell; font: 400 .92em/1.25 var(--sans); }
.tbf-menus[data-hw="1"] .tbf-card .p { display: none; }

.tbf-end .logo { position: absolute; left: 50%; top: 50%; width: min(calc(var(--u) * 960), 82vw); transform: translate(-50%, -50%); opacity: 0; transition: opacity .3s ease; }
.tbf-end.cur .logo { opacity: 1; transition: opacity 2.4s ease .9s; }
.tbf-end.cur .ink .flame { animation: tbf-flicker 4.3s ease-in-out infinite; filter: drop-shadow(0 0 calc(var(--u) * 10) rgba(241,170,70,.6)); }
.tbf-end .thanks { position: absolute; left: 0; right: 0; bottom: calc(var(--u) * 232); text-align: center; margin: 0; font: italic 400 max(15px, calc(var(--u) * 20))/1.3 var(--serif); color: var(--ivory-2); text-shadow: var(--shade); opacity: 0; transition: opacity .3s ease; }
.tbf-end .tbf-list { position: absolute; left: 50%; bottom: calc(var(--u) * 150); transform: translateX(-50%); opacity: 0; transition: opacity .3s ease; }
.tbf-end.cur .thanks { opacity: 1; transition: opacity 1.4s ease 5.6s; }
.tbf-end.cur .tbf-list { opacity: 1; transition: opacity 1.4s ease 6.4s; }

/* Use safe-area insets for controls near screen edges. */
.tbf { --sl: env(safe-area-inset-left, 0px); --sr: env(safe-area-inset-right, 0px); --st: env(safe-area-inset-top, 0px); --sb: env(safe-area-inset-bottom, 0px);
  --tu: clamp(.74px, .2564vh, 1.2px);
  --el: max(var(--sl), calc(var(--tu) * 12)); --er: max(var(--sr), calc(var(--tu) * 12));
  touch-action: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
.tbf-vit { left: calc(max(16px, var(--u) * 40) + var(--sl)); top: calc(max(14px, var(--u) * 34) + var(--st)); }
.tbf-flasks { left: calc(max(16px, var(--u) * 46) + var(--sl)); bottom: calc(max(14px, var(--u) * 38) + var(--sb)); }
.tbf-boss { bottom: calc(max(20px, var(--u) * 52) + var(--sb)); }
.tbf-name { bottom: calc(var(--bar) + 6.5vh + var(--sb)); }
.tbf-sub { bottom: calc(max(var(--u) * 50, var(--bar) * .5) + var(--sb)); }
.tbf-skip { right: calc(max(16px, var(--u) * 44) + var(--sr)); bottom: calc(max(var(--u) * 34, var(--bar) * .5) + var(--sb)); }
.tbf-legend, .tbf-keys { bottom: calc(max(12px, var(--u) * 28) + var(--sb)); padding: 0 calc(4vw + var(--sr)) 0 calc(4vw + var(--sl)); }
.tbf-pause, .tbf-ask, .tbf-options { padding: calc(4vh + var(--st)) calc(5vw + var(--sr)) calc(9vh + var(--sb)) calc(5vw + var(--sl)); }
.tbf { --title-x: clamp(calc(var(--logo-w) / 2 + 5vw + var(--sl)), 32vw, 50vw); }

.tbf-ctl { position: absolute; left: calc(max(16px, var(--u) * 46) + var(--sl)); top: 41%; transform: translateY(-50%); opacity: 0; }
.tbf-ctl::before { content: ''; position: absolute; inset: calc(var(--u) * -46) calc(var(--u) * -90) calc(var(--u) * -46) calc(var(--u) * -46); z-index: -1;
  background: radial-gradient(closest-side, rgba(5,7,11,.58), rgba(5,7,11,.36) 55%, rgba(5,7,11,0)); }
.tbf-ctl h3 { font: italic 400 max(15px, calc(var(--u) * 21))/1.15 var(--serif); letter-spacing: .005em; color: var(--ivory); text-shadow: var(--shade);
  padding-bottom: calc(var(--u) * 11); margin-bottom: calc(var(--u) * 11); border-bottom: var(--hair) solid rgba(207,181,124,.32); }
.tbf-ctl .r { display: grid; grid-template-columns: calc(var(--u) * 100) auto; column-gap: calc(var(--u) * 20); align-items: center; min-height: max(23px, calc(var(--u) * 31));
  font: 400 max(12.5px, calc(var(--u) * 16.5))/1.2 var(--serif); color: var(--ivory); text-shadow: var(--shade); white-space: nowrap; }
.tbf-ctl .r .k { justify-self: end; display: inline-flex; font: 500 max(11.5px, calc(var(--u) * 14.5))/1 var(--sans); }

.tbf-t { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 2em; height: 2em; vertical-align: middle; border-radius: 50%;
  border: var(--hair) solid rgba(207,181,124,.6); background: rgba(5,7,11,.52); color: var(--ivory); }
.tbf-t svg { width: 60%; height: 60%; }
.tbf-t.tbf-tn { border-color: transparent; background: none; }
.tbf-t.tbf-tn svg { width: 92%; height: 92%; }
.tbf-t.tbf-tf svg { width: auto; height: 64%; }
.tbf-i-t .s { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.tbf-i-t .s.w { stroke-width: 1.9; }
.tbf-i-t .d { fill: rgba(5,7,11,.4); stroke: currentColor; stroke-width: 1.3; stroke-linejoin: round; }
.tbf-i-t .f { fill: currentColor; }
.tbf-i-t .a { fill: var(--gold); }

.tbf-touch { position: absolute; inset: 0; opacity: 0; visibility: hidden; transition: opacity .25s ease, visibility 0s .25s; }
.tbf-touch.on { opacity: 1; visibility: visible; transition: opacity .6s ease .2s, visibility 0s; }
.tbf-tb { position: absolute; right: calc(var(--er) + var(--tu) * (var(--x) - var(--d) / 2)); bottom: calc(var(--sb) + var(--tu) * (var(--y) - var(--d) / 2));
  width: calc(var(--tu) * var(--d)); height: calc(var(--tu) * var(--d)); border-radius: 50%; color: rgba(236,227,205,.78);
  background: radial-gradient(closest-side, rgba(5,7,11,.52), rgba(5,7,11,.36) 76%, rgba(5,7,11,.2));
  box-shadow: inset 0 0 0 var(--hair) rgba(207,181,124,.5), 0 0 calc(var(--tu) * 12) rgba(0,0,0,.4);
  transition: box-shadow .2s ease, color .2s ease, transform .14s ease; }
.tbf-tb > svg { position: absolute; left: 50%; top: 50%; width: 50%; height: 50%; transform: translate(-50%, -50%); filter: drop-shadow(0 1px 1.5px rgba(0,0,0,.75)); }
.tbf-tb.attack::before { content: ''; position: absolute; inset: calc(var(--tu) * 5); border-radius: 50%; box-shadow: inset 0 0 0 var(--hair) rgba(207,181,124,.26); }
.tbf-tb.attack > svg { width: 47%; height: 47%; }
.tbf-tb.heal > svg { width: auto; height: 50%; }
.tbf-tb.heal .ct { position: absolute; right: 13%; bottom: 11%; font: 600 max(10.5px, calc(var(--tu) * 11.5))/1 var(--sans); font-variant-numeric: lining-nums; color: var(--ivory); text-shadow: 0 1px 2px #000; }
.tbf-tb.heal.used .tbf-i-flask .q { transform: scaleY(0); opacity: 0; }
.tbf-tb.heal.used .tbf-i-flask .g { stroke: rgba(207,181,124,.4); }
.tbf-tb.lock.lit { color: var(--gold); box-shadow: inset 0 0 0 var(--hair) rgba(236,217,162,.8), 0 0 calc(var(--tu) * 12) rgba(0,0,0,.4); }
.tbf-tb.pause { right: calc(var(--sr) + var(--tu) * 20); top: calc(var(--st) + var(--tu) * 16); bottom: auto; width: calc(var(--tu) * 40); height: calc(var(--tu) * 40);
  background: rgba(5,7,11,.3); box-shadow: inset 0 0 0 var(--hair) rgba(207,181,124,.36); color: rgba(236,227,205,.7); }
.tbf-tb.dn, .tbf-tb.lock.lit.dn { color: #fff6e0; transform: scale(.95); transition: box-shadow .05s ease, color .05s ease, transform .06s ease;
  background: radial-gradient(closest-side, rgba(236,217,162,.24), rgba(236,217,162,.11) 72%, rgba(5,7,11,.3));
  box-shadow: inset 0 0 0 calc(var(--hair) * 1.6) var(--gold), 0 0 calc(var(--tu) * 18) rgba(236,217,162,.3); }

.tbf-ts { position: absolute; left: calc(var(--el) + var(--tu) * 48); bottom: calc(var(--sb) + var(--tu) * 40); width: calc(var(--tu) * 112); height: calc(var(--tu) * 112); border-radius: 50%;
  background: radial-gradient(closest-side, rgba(5,7,11,0) 50%, rgba(5,7,11,.3)); box-shadow: inset 0 0 0 var(--hair) rgba(207,181,124,.32); opacity: .62;
  will-change: transform; transition: opacity .3s ease, transform .16s ease-out; }
.tbf-ts .tk { position: absolute; left: 50%; top: 50%; width: calc(var(--tu) * 5); height: calc(var(--tu) * 7); margin: calc(var(--tu) * -3.5) 0 0 calc(var(--tu) * -2.5);
  background: rgba(207,181,124,.6); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
.tbf-ts .tk:nth-child(1) { transform: translateY(calc(var(--tu) * -48)); }
.tbf-ts .tk:nth-child(2) { transform: translateX(calc(var(--tu) * 48)) rotate(90deg); }
.tbf-ts .tk:nth-child(3) { transform: translateY(calc(var(--tu) * 48)); }
.tbf-ts .tk:nth-child(4) { transform: translateX(calc(var(--tu) * -48)) rotate(90deg); }
.tbf-ts .kn { position: absolute; left: 50%; top: 50%; width: calc(var(--tu) * 46); height: calc(var(--tu) * 46); margin: calc(var(--tu) * -23) 0 0 calc(var(--tu) * -23); border-radius: 50%;
  background: radial-gradient(closest-side, rgba(5,7,11,.55), rgba(5,7,11,.4)); box-shadow: inset 0 0 0 var(--hair) rgba(207,181,124,.55);
  will-change: transform; transition: transform .16s ease-out, box-shadow .2s ease; }
.tbf-ts .kn i { position: absolute; left: 50%; top: 50%; width: calc(var(--tu) * 8); height: calc(var(--tu) * 12); margin: calc(var(--tu) * -6) 0 0 calc(var(--tu) * -4);
  background: rgba(236,227,205,.62); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
.tbf-ts.dn { opacity: 1; transition: opacity .08s ease; }
.tbf-ts.dn .kn { transition: box-shadow .08s ease; box-shadow: inset 0 0 0 calc(var(--hair) * 1.6) var(--gold), 0 0 calc(var(--tu) * 16) rgba(236,217,162,.28); }
.tbf-ts.dn .kn i { background: #fff6e0; }

.tbf-tb .lb, .tbf-ts .lb { position: absolute; left: 50%; top: calc(100% + var(--tu) * 4); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: calc(var(--tu) * 2); white-space: nowrap;
  font: 500 max(10.5px, calc(var(--tu) * 11.5))/1 var(--sans); letter-spacing: .07em; color: var(--ivory); text-shadow: 0 1px 2px rgba(0,0,0,.95), 0 0 calc(var(--tu) * 7) rgba(0,0,0,.85); opacity: 0; transition: opacity .5s ease; }
.tbf-tb .lb em { font-size: .87em; letter-spacing: .05em; color: var(--ivory-2); }
.tbf-tb.pause .lb { left: auto; right: calc(100% + var(--tu) * 9); top: 50%; transform: translateY(-50%); }
.tbf-tcap { position: absolute; left: calc(max(16px, var(--u) * 40) + var(--sl)); top: calc(max(14px, var(--u) * 34) + var(--st) + var(--u) * 42 + 13px); white-space: nowrap;
  font: 500 max(11px, calc(var(--tu) * 12))/1.2 var(--sans); letter-spacing: .06em; color: var(--ivory-2); text-shadow: var(--shade); opacity: 0; transition: opacity .5s ease; }
.tbf-touch.lbl .lb, .tbf-touch.lbl .tbf-tcap { opacity: 1; }

.tbf[data-input="touch"] .tbf-flasks { display: none; }
.tbf[data-input="touch"] .tbf-boss { width: min(calc(var(--u) * 860), 72vw, calc(100vw - 2 * (var(--tu) * 236 + max(var(--el), var(--er))))); container-type: inline-size; }
.tbf[data-input="touch"] .tbf-boss .head { gap: 12px; }
.tbf[data-input="touch"] .tbf-boss .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: clamp(11.5px, 4.75cqw, max(14px, calc(var(--u) * 20))); padding: 8px 10px; margin: -8px -10px; }
.tbf[data-input="touch"] .tbf-skip { flex-direction: row-reverse; gap: 12px; bottom: calc(var(--sb) + var(--tu) * 108); font-size: max(12px, calc(var(--tu) * 13)); }
.tbf[data-input="touch"] .tbf-skip .tbf-i-ring { width: calc(var(--tu) * 46); height: calc(var(--tu) * 46); }
.tbf[data-input="touch"] .tbf-skip .tbf-i-ring .t { stroke-width: .75; stroke: rgba(207,181,124,.6); }
.tbf[data-input="touch"] .tbf-skip .tbf-i-ring .v { stroke-width: 1.3; }
.tbf-skip.dn { color: var(--ivory); }
.tbf-skip.dn .tbf-i-ring .t { fill: rgba(236,217,162,.16); stroke: rgba(236,217,162,.8); }
.tbf[data-input="touch"] .tbf-keys { display: none; }
.tbf[data-input="touch"] .tbf-list { gap: 0; }
.tbf[data-input="touch"] .tbf-list .it { display: flex; align-items: center; min-height: 46px; padding-top: 0; padding-bottom: 0; }
.tbf[data-input="touch"] .tbf-rows .it { min-height: 46px; padding-top: 0; padding-bottom: 0; }
.tbf[data-input="touch"] .tbf-rows .sl { height: 42px; }
.tbf[data-input="touch"] .tbf-rows .ch { gap: calc(var(--u) * 6); }
.tbf[data-input="touch"] .tbf-rows .ch b { padding: 14px 9px 13px; border-bottom-width: 0; background: linear-gradient(transparent, transparent) no-repeat 50% calc(100% - 10px) / calc(100% - 18px) var(--hair); }
.tbf[data-input="touch"] .tbf-rows .ch b.cur { background-image: linear-gradient(rgba(207,181,124,.5), rgba(207,181,124,.5)); }
.tbf[data-input="touch"] .tbf-rows .it.on .ch b.cur { background-image: linear-gradient(var(--gold), var(--gold)); }
.tbf[data-input="touch"] .tbf-pause, .tbf[data-input="touch"] .tbf-ask, .tbf[data-input="touch"] .tbf-options { padding-bottom: calc(4vh + var(--sb)); }
.tbf-card .t { display: none; }
.tbf-menus[data-device="touch"] .tbf-card .k, .tbf-menus[data-device="touch"] .tbf-card .p { display: none; }
.tbf-menus[data-device="touch"] .tbf-card .t { display: table-cell; }
.tbf-card td.t span { margin-left: .7em; color: var(--ivory-3); letter-spacing: .05em; }

.tbf[data-input="touch"] { --logo-w: min(calc(var(--u) * 740), 46.25vw); }
@media (max-height: 520px) {
  .tbf[data-input="touch"] .tbf-title .tbf-spot { bottom: calc(var(--u) * 222 + 22px + var(--sb)); }
  .tbf[data-input="touch"] .tbf-title .tbf-list { bottom: calc(var(--u) * 92 + var(--sb)); }
  .tbf[data-input="touch"] .tbf-pause, .tbf[data-input="touch"] .tbf-ask, .tbf[data-input="touch"] .tbf-options { gap: 10px 28px; padding: calc(2vh + var(--st)) calc(3vw + var(--sr)) calc(2vh + var(--sb)) calc(3vw + var(--sl)); }
  .tbf[data-input="touch"] .tbf-panel h2 { padding-bottom: 9px; margin-bottom: 7px; }
  .tbf[data-input="touch"] .tbf-pause .col { min-width: 0; }
  .tbf[data-input="touch"] .tbf-card { padding-left: 22px; }
  .tbf[data-input="touch"] .tbf-card td { padding-top: 2px; padding-bottom: 2px; }
  .tbf[data-input="touch"] .tbf-card td:first-child { padding-right: 16px; }
  .tbf[data-input="touch"] .tbf-card .t { padding-right: 0; }
  .tbf[data-input="touch"] .tbf-card th { padding-bottom: 6px; }
  .tbf[data-input="touch"] .tbf-options .col { width: 100%; max-width: 760px; }
  .tbf[data-input="touch"] .tbf-rows { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); grid-template-rows: repeat(4, auto); grid-auto-flow: column; column-gap: 18px; }
  .tbf[data-input="touch"] .tbf-rows .it { grid-template-columns: minmax(0, 1fr) auto; column-gap: 10px; padding-left: 24px; padding-right: 0; }
  .tbf[data-input="touch"] .tbf-rows .it.slider { grid-template-columns: minmax(0, 1fr) 88px 28px; }
  .tbf[data-input="touch"] .tbf-rows .it.act { margin-top: 0; }
  .tbf[data-input="touch"] .tbf-rows .ch { gap: 0; }
  .tbf[data-input="touch"] .tbf-rows .ch b { padding-left: 8px; padding-right: 8px; background-size: calc(100% - 16px) var(--hair); }
  .tbf[data-input="touch"] .tbf-end .logo { width: min(calc(var(--u) * 960), 60vw); top: 42%; }
  .tbf[data-input="touch"] .tbf-end .thanks { bottom: calc(var(--sb) + 22px + 46px + 8px); }
  .tbf[data-input="touch"] .tbf-end .tbf-list { bottom: calc(var(--sb) + 22px); }
}

.tbf-turn { position: absolute; inset: 0; z-index: 5; display: none; align-items: center; justify-content: center; text-align: center; pointer-events: auto;
  background: radial-gradient(120% 80% at 50% 46%, rgba(5,7,11,.965) 0%, rgba(3,4,7,.99) 100%); }
.tbf.upright .tbf-turn { display: flex; }
.tbf-turn .in { display: flex; flex-direction: column; align-items: center; padding: 0 9vw; }
.tbf-i-turn { width: 104px; height: 78px; margin-bottom: 26px; }
.tbf-i-turn .p { fill: none; stroke: rgba(207,181,124,.3); stroke-width: 1.1; }
.tbf-i-turn .l { fill: rgba(236,217,162,.06); stroke: var(--brass); stroke-width: 1.2; }
.tbf-i-turn .s { fill: none; stroke: var(--ivory-2); stroke-width: 1.1; stroke-linecap: round; }
.tbf-i-turn .f { fill: var(--ivory-2); }
.tbf-turn .a { font: italic 400 22px/1.25 var(--serif); color: var(--ivory); text-shadow: var(--shade); }
.tbf-turn .b { margin-top: 12px; font: 500 12.5px/1.3 var(--sans); letter-spacing: .08em; color: var(--ivory-3); }

@keyframes tbf-flicker {
  0%, 100% { transform: scale(1, 1) skewX(0deg); } 17% { transform: scale(.975, 1.035) skewX(-1.6deg); } 36% { transform: scale(1.02, .975) skewX(1deg); }
  55% { transform: scale(.985, 1.03) skewX(-.6deg); } 71% { transform: scale(1.012, .99) skewX(1.5deg); } 88% { transform: scale(.99, 1.02) skewX(-.9deg); }
}
@keyframes tbf-gutter {
  0%, 100% { opacity: .9; } 18% { opacity: .5; } 31% { opacity: .82; } 47% { opacity: .42; } 62% { opacity: .78; } 80% { opacity: .55; }
}
@keyframes tbf-low {
  0%, 100% { box-shadow: 0 0 0 var(--hair) rgba(207,181,124,.5), 0 0 0 calc(var(--hair) * 2) rgba(0,0,0,.4), 0 calc(var(--u) * 2) calc(var(--u) * 10) rgba(0,0,0,.5); }
  50% { box-shadow: 0 0 0 var(--hair) rgba(214,120,96,.75), 0 0 0 calc(var(--hair) * 2) rgba(0,0,0,.4), 0 0 calc(var(--u) * 12) rgba(170,40,28,.5); }
}
/* Show menus in their settled state in capture mode. */
.tbf.still *, .tbf.still *::before, .tbf.still *::after { transition: none !important; animation: none !important; }
.tbf.rm *, .tbf.rm *::before, .tbf.rm *::after { animation: none !important; }
.tbf.rm .tbf-lock span { transform: none; }
.tbf.rm .tbf-list .it::before, .tbf.rm .tbf-list .it::after, .tbf.rm .tbf-rows .it::before { transform: none; }
.tbf.rm .tbf-i-flask .q { transition: opacity .5s ease; }
.tbf.rm .tbf-tb.dn { transform: none; }
`;

let node = null,
  users = 0;
export function installStyle() {
  if (users++ === 0) {
    node = document.createElement('style');
    node.setAttribute('data-tbf', '');
    node.textContent = CSS;
    document.head.appendChild(node);
  }
}
export function removeStyle() {
  if (users > 0 && --users === 0 && node) {
    node.remove();
    node = null;
  }
}
