/* Study Campus design B — Study Garden.
 * Soft sage, lavender, sky and warm neutrals; rounded cards; a light floating side menu on desktop and a
 * bottom tab bar on phones; progress shown as rings, capsules and growing stems. Calm and encouraging,
 * never childish. Layout only: all data and actions come from studyhq.js. */
(function () {
  'use strict';
  var css = `
body[data-concept="garden"]{background:#f4f3ec;color:#25302b;
  --d-ink:#25302b;--d-ink2:#3d4a43;--d-muted:#5c6761;--d-line:#e1e3d8;--d-accent:#3f6e55;--d-radius:22px;--d-surface:#fff}
.gd-pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}
@media(max-width:1100px){.gd-pair{grid-template-columns:1fr}}
.gd-rv .shq-d-review{grid-template-columns:auto minmax(0,1fr)}.gd-rv .shq-d-review>a{grid-column:1/-1;justify-self:start}
.gd-plant{display:grid;justify-items:center;gap:8px;text-align:center}.gd-plant p{font-size:.9rem;color:var(--d-ink2);max-width:300px}.gd-plant small{font-size:.76rem;color:var(--d-muted)}
.gd-pdays{display:flex;gap:6px}.gd-pday{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:.68rem;font-weight:800;background:var(--bg);color:#8a8f84}.gd-pday.on{background:#C0DD97;color:#27500A}.gd-pday.fut{opacity:.55}
.gd-plantbtn{background:none;border:0;padding:0;cursor:pointer;width:min(260px,80%);display:block;border-radius:16px}.gd-plantbtn:focus-visible{outline:3px solid var(--sage);outline-offset:4px}.gd-plantbtn svg{width:100%;height:auto;max-height:250px;display:block}
.gd-sway{transform-box:view-box;transform-origin:80px 104px;animation:gdSway 6s ease-in-out 1.6s infinite}
.gd-sway.gd-rustle{animation:gdRustle .9s ease-out,gdSway 6s ease-in-out .9s infinite}
.gd-stem{stroke-dasharray:200;stroke-dashoffset:200;animation:gdDraw .9s cubic-bezier(.2,.8,.2,1) .1s forwards}
.gd-leaf{transform-box:fill-box;animation:gdLeaf .6s cubic-bezier(.2,.8,.25,1.25) both;animation-delay:var(--d)}
.gd-flower{transform-origin:center!important;animation-name:gdBloom;animation-duration:.9s}
.gd-new{animation:gdLeaf .6s cubic-bezier(.2,.8,.25,1.25) both,gdNew 2.4s ease-in-out 1.4s 2;animation-delay:var(--d),1.4s}
.gd-drops path{fill:#7DB8E8;opacity:0;animation:gdDrop 1.4s ease-in .6s 2}.gd-drops path:nth-child(2){animation-delay:.9s}.gd-drops path:nth-child(3){animation-delay:1.2s}
@keyframes gdDraw{to{stroke-dashoffset:0}}@keyframes gdLeaf{from{transform:scale(0) rotate(-20deg);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes gdBloom{0%{transform:scale(0) rotate(-60deg);opacity:0}70%{transform:scale(1.12) rotate(5deg);opacity:1}100%{transform:scale(1)}}
@keyframes gdSway{0%,100%{transform:rotate(0)}30%{transform:rotate(1.6deg)}70%{transform:rotate(-1.4deg)}}
@keyframes gdRustle{0%{transform:rotate(0)}20%{transform:rotate(-5deg)}45%{transform:rotate(4deg)}70%{transform:rotate(-2deg)}100%{transform:rotate(0)}}
@keyframes gdNew{0%,100%{filter:none}50%{filter:brightness(1.25) drop-shadow(0 0 3px #d8f0b0)}}
@keyframes gdDrop{0%{opacity:0;transform:translateY(-14px)}20%{opacity:.9}100%{opacity:0;transform:translateY(46px)}}
@media(prefers-reduced-motion:reduce){.gd-sway,.gd-sway.gd-rustle,.gd-leaf,.gd-flower,.gd-new,.gd-drops path{animation:none}.gd-stem{animation:none;stroke-dashoffset:0}.gd-drops{display:none}}
.gd-wk{display:grid;gap:10px}.gd-wkrow{display:grid;gap:2px;padding:10px 12px;border-radius:14px;background:var(--bg);border-left:4px solid var(--c)}.gd-wkrow a{font-weight:800;color:var(--d-ink);text-decoration:none;display:flex;gap:8px;align-items:center}.gd-wkrow span{font-size:.84rem;color:var(--d-ink2)}.gd-wkrow small{font-size:.78rem;color:#9a6b1f;font-weight:700}
.gd-capside{width:100%;justify-content:center;margin:0 0 14px}
.gd-rf{display:grid;gap:4px;font-size:.88rem}.gd-rf dt{font-weight:800;color:var(--d-ink);margin-top:8px}.gd-rf dt:first-child{margin-top:0}.gd-rf dd{color:var(--d-ink2);line-height:1.5}
body[data-concept="garden"] .shq-learn{padding:4px 0}
body[data-concept="garden"] .shq-d-card,body[data-concept="garden"] .shq-d-concepts .cx,body[data-concept="garden"] .shq-d-hits li{box-shadow:0 1px 2px rgba(37,48,43,.05)}
.gd{--bg:#f4f3ec;--card:#fff;--ink:#25302b;--ink2:#3d4a43;--muted:#5c6761;--line:#e4e5db;--sage:#3f6e55;--sage2:#7fa58c;--sage-l:#e6efe7;--lav:#5b4a9e;--lav2:#9c8fd6;--lav-l:#efebfa;--sky:#2c6e9e;--sky-l:#e3eff8;--peach:#b35f3e;--peach-l:#fbece4;--sun:#8a6412;--sun-l:#fbf1d9;--r:22px;--glass:rgba(255,255,255,.75);--glass2:rgba(255,255,255,.96);--btn:var(--sage);--btn2:var(--lav)}
.gd a{color:inherit}
.gd-app{display:grid;grid-template-columns:260px minmax(0,1fr);gap:26px;max-width:1360px;margin:0 auto;padding:24px clamp(14px,2.5vw,32px) 60px}
.gd-side{position:sticky;top:88px;align-self:start;background:var(--card);border-radius:28px;padding:22px 16px;box-shadow:0 20px 50px -38px rgba(37,48,43,.5);display:flex;flex-direction:column;gap:18px;max-height:calc(100vh - 110px);overflow:auto}
.gd-brand{display:flex;align-items:center;gap:12px;padding:0 6px}
.gd-logo{width:42px;height:42px;border-radius:14px;background:linear-gradient(140deg,var(--sage2),var(--lav2));display:grid;place-items:center;color:#fff;flex-shrink:0}
.gd-brand b{display:block;font-size:1.08rem;font-weight:800;letter-spacing:-.01em}
.gd-brand small{display:block;font-size:.76rem;color:var(--muted);margin-top:1px}
.gd-nav{display:flex;flex-direction:column;gap:4px}
.gd-nav a{display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:16px;text-decoration:none;font-size:.9rem;font-weight:700;color:var(--ink2);min-height:46px}
.gd-nav a .ib{width:32px;height:32px;border-radius:11px;display:grid;place-items:center;background:var(--bg);color:var(--muted);flex-shrink:0}
.gd-nav a:hover{background:var(--bg)}
.gd-nav a[aria-current="page"]{background:var(--sage-l);color:var(--sage)}
.gd-nav a[aria-current="page"] .ib{background:var(--btn);color:#fff}
.gd-nav .n{margin-left:auto;font-size:.72rem;font-weight:800;background:var(--bg);color:var(--ink2);border-radius:999px;padding:2px 8px}
.gd-nav .n.warn{background:var(--peach-l);color:var(--peach)}
.gd-side h4{font-size:.7rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:0 10px}
.gd-cnav{display:flex;flex-direction:column;gap:2px}
.gd-cnav a{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:14px;text-decoration:none;font-size:.86rem;font-weight:700;color:var(--ink2)}
.gd-cnav a:hover,.gd-cnav a[aria-current="page"]{background:var(--bg)}
.gd-cnav i{width:12px;height:12px;border-radius:5px;flex-shrink:0}
.gd-termbox{margin-top:auto;background:linear-gradient(150deg,var(--sage-l),var(--sky-l));border-radius:20px;padding:14px;display:flex;gap:12px;align-items:center}
.gd-termbox b{display:block;font-size:.86rem}
.gd-termbox small{display:block;font-size:.74rem;color:var(--ink2)}
.gd-termbox button{border:0;background:none;color:var(--sage);font-weight:800;font-size:.76rem;cursor:pointer;padding:4px 0;text-decoration:underline}
.gd-sidelinks{display:flex;flex-direction:column;gap:2px}
.gd-sidelinks a{font-size:.82rem;font-weight:700;color:var(--sky);text-decoration:none;padding:6px 10px;border-radius:10px}
.gd-sidelinks a:hover{background:var(--sky-l)}
.gd-tabbar{display:none}
@media(max-width:980px){
  .gd-app{grid-template-columns:1fr;padding-bottom:110px}
  .gd-side{display:none}
  .gd-tabbar{display:flex;position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:900;background:var(--glass2);backdrop-filter:blur(10px);border-radius:24px;box-shadow:0 14px 40px -12px rgba(37,48,43,.35);padding:6px;justify-content:space-around}
  .gd-tabbar a,.gd-tabbar summary{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:.68rem;font-weight:800;color:var(--muted);text-decoration:none;padding:6px 8px;border-radius:16px;min-width:58px;cursor:pointer;list-style:none}
  .gd-tabbar summary::-webkit-details-marker{display:none}
  .gd-tabbar .gd-cap{width:54px;height:54px;margin-top:-18px;border-radius:50%;border:0;background:var(--btn);color:#fff;display:grid;place-items:center;box-shadow:0 10px 24px -8px rgba(63,110,85,.7);cursor:pointer;flex:none}
  .gd-tabbar a[aria-current="page"],.gd-tabbar details.cur summary{color:var(--sage);background:var(--sage-l)}
  .gd-tabbar details{position:relative}
  .gd-more{position:absolute;bottom:62px;right:0;background:var(--card);border-radius:18px;box-shadow:0 14px 40px -12px rgba(37,48,43,.4);padding:8px;min-width:190px;display:flex;flex-direction:column}
  .gd-more a{flex-direction:row;font-size:.88rem;color:var(--ink2);gap:10px;justify-content:flex-start;padding:10px 12px}
}
.gd-mobilehead{display:none}
@media(max-width:980px){.gd-mobilehead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}.gd-mobilehead b{font-size:1rem;font-weight:800;display:flex;align-items:center;gap:8px}.gd-mobilehead .gd-logo{width:30px;height:30px;border-radius:10px}}
/* atoms */
.gd .shq-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:0 20px;border-radius:999px;font-size:.88rem;font-weight:800;text-decoration:none;cursor:pointer;border:0;background:none;white-space:nowrap}
.gd .shq-btn.primary{background:var(--btn);color:#fff;box-shadow:0 8px 18px -10px rgba(63,110,85,.9)}.gd .shq-btn.primary:hover{background:#355d48}
.gd .shq-btn.ghost{background:var(--bg);color:var(--ink2)}.gd .shq-btn.ghost:hover{background:#ebeae1}
.gd .shq-btn.soft{background:var(--card);color:var(--lav)}
.gd .shq-btn.small{min-height:36px;padding:0 14px;font-size:.8rem}
.gd .shq-btn:disabled{opacity:.45;cursor:not-allowed}
.gd .shq-notice{background:var(--sun-l);color:#5e4510;padding:14px 18px;border-radius:18px;font-size:.86rem;line-height:1.5;margin-bottom:20px}
.gd .shq-course{display:inline-flex;align-items:center;gap:6px;font-size:.76rem;font-weight:800;color:var(--ink2);white-space:nowrap}
.gd .shq-dot{width:10px;height:10px;border-radius:4px;display:inline-block;flex-shrink:0}
.gd .shq-pill{font-size:.72rem;font-weight:800;padding:3px 10px;border-radius:999px;background:var(--bg);color:var(--ink2);white-space:nowrap}
.gd .shq-pill.warn{background:var(--sun-l);color:var(--sun)}
.gd .shq-pill.info{background:var(--lav-l);color:var(--lav)}
.gd .shq-due{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.gd .shq-due.late{color:var(--peach);font-weight:800}
.gd .shq-check{width:28px;height:28px;border-radius:10px;border:2px solid #c9cfc6;background:var(--card);display:grid;place-items:center;flex-shrink:0;cursor:pointer;color:#fff;transition:background .15s}
.gd .shq-check:hover{border-color:var(--sage2)}
.gd .shq-check[aria-checked="true"]{background:var(--sage2);border-color:var(--sage2)}
.gd .shq-check:disabled{opacity:.5;cursor:not-allowed}
.gd .shq-item{display:flex;gap:14px;align-items:flex-start;padding:14px 16px;border-radius:18px;background:var(--bg)}
.gd .shq-item + .shq-item{margin-top:10px}
.gd .shq-item.blocked{background:var(--sun-l)}
.gd .shq-item-t{flex:1;min-width:0}
.gd .shq-item-t b{display:block;font-size:.94rem;font-weight:800;line-height:1.35}
.gd .shq-item.done{background:transparent;border:1.5px dashed var(--line)}
.gd .shq-item.done .shq-item-t b{text-decoration:line-through;color:var(--muted);font-weight:700}
.gd .shq-meta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:6px;font-size:.78rem;color:var(--muted)}
.gd .shq-item-side{display:flex;gap:4px;align-items:center;flex-shrink:0}
.gd .shq-status{border:0;border-radius:999px;padding:6px 10px;font-size:.76rem;font-weight:800;background:var(--card);color:var(--ink2);cursor:pointer;min-height:32px}
.gd .shq-icon{width:36px;height:36px;border:0;border-radius:12px;background:none;color:var(--muted);cursor:pointer;display:grid;place-items:center}
.gd .shq-icon:hover{background:var(--card);color:var(--ink)}
.gd .shq-time{border:0;background:var(--glass);color:var(--lav);font-size:.8rem;font-weight:800;padding:8px 14px;border-radius:999px;cursor:pointer;min-height:36px}
.gd .shq-time[aria-pressed="true"]{background:var(--btn2);color:#fff}
.gd :focus-visible{outline:3px solid var(--sage2);outline-offset:2px}
/* layout */
.gd-card{background:var(--card);border-radius:var(--r);padding:22px 24px;box-shadow:0 1px 0 rgba(255,255,255,.8) inset,0 18px 40px -34px rgba(37,48,43,.5)}
.gd-card h2,.gd-h2{font-size:1.1rem;font-weight:800;letter-spacing:-.01em;display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px}
.gd-card h2 a,.gd-link{font-size:.82rem;font-weight:800;color:var(--sky);text-decoration:none;white-space:nowrap}
.gd-grid{display:grid;gap:22px}
.gd-two{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:22px;align-items:start}
@media(max-width:1180px){.gd-two{grid-template-columns:1fr}}
.gd-title{font-size:clamp(1.6rem,3vw,2.2rem);font-weight:800;letter-spacing:-.025em;line-height:1.15}
.gd-sub{color:var(--ink2);font-size:.98rem;line-height:1.55;margin-top:8px;max-width:620px}
.gd-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:24px}
.gd-muted{color:var(--muted)}
.gd-empty{border-radius:var(--r);padding:34px 24px;text-align:center;background:var(--card);color:var(--muted);line-height:1.6}
.gd-empty b{display:block;color:var(--ink);font-size:1.05rem;margin-bottom:4px}
.gd-empty .shq-btn{margin-top:14px}
.gd-sprout{display:block;margin:0 auto 10px}
/* overview */
.gd-hero{position:relative;overflow:hidden;border-radius:30px;background:linear-gradient(120deg,#e3eee4 0%,#e9eef6 55%,#efe9f8 100%);padding:30px 32px;display:flex;justify-content:space-between;gap:24px;align-items:center;flex-wrap:wrap}
.gd-hero .hills{position:absolute;inset:auto 0 0 0;height:70px;opacity:.7;pointer-events:none}
.gd-hero > div{position:relative;z-index:1}
.gd-hero .date{font-size:.84rem;font-weight:800;color:var(--sage)}
.gd-hero h1{font-size:clamp(1.7rem,3.4vw,2.4rem);font-weight:800;letter-spacing:-.025em;margin-top:6px}
.gd-hero p{color:var(--ink2);margin-top:6px;font-size:.98rem}
.gd-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.gd-chip{background:var(--glass);border-radius:999px;padding:7px 14px;font-size:.8rem;font-weight:800;color:var(--ink2);display:inline-flex;gap:6px;align-items:center}
.gd-chip b{font-size:.95rem;color:var(--ink)}
.gd-termring{display:flex;gap:14px;align-items:center;background:var(--glass);border-radius:24px;padding:14px 18px}
.gd-termring b{display:block;font-size:.95rem}
.gd-termring small{display:block;font-size:.78rem;color:var(--ink2)}
.gd-focus{background:linear-gradient(160deg,#efebfa,#f6f3fc);border-radius:28px;padding:26px 28px;position:relative;overflow:hidden}
.gd-focus .lbl{font-size:.74rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--lav)}
.gd-focus .top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}
.gd-focus .times{display:flex;gap:6px;flex-wrap:wrap}
.gd-focus h2{font-size:clamp(1.35rem,2.4vw,1.75rem);font-weight:800;letter-spacing:-.02em;line-height:1.25;margin:16px 0 8px}
.gd-focus .meta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:.85rem;color:var(--ink2)}
.gd-focus .why{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}
.gd-focus .why span{background:var(--card);color:var(--lav);font-size:.76rem;font-weight:800;padding:5px 11px;border-radius:999px}
.gd-focus .why span.risk{background:var(--peach-l);color:var(--peach)}
.gd-focus .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}
.gd-focus .acts .shq-btn.primary{background:var(--lav);box-shadow:0 10px 20px -12px rgba(91,74,158,.9)}
.gd-focus .acts .shq-btn.primary:hover{background:#4a3b88}
.gd-focus .acts .shq-btn.ghost{background:var(--card);color:var(--lav)}
.gd-focus .alts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:20px}
.gd-focus .alt{background:var(--glass);border-radius:16px;padding:12px 14px;font-size:.84rem}
.gd-focus .alt b{display:block;font-weight:800;line-height:1.35}
.gd-focus .alt small{color:var(--muted);font-size:.76rem}
.gd-focus .alt.wait{background:rgba(251,241,217,.8)}
.gd-focus .empty{font-size:1.05rem;line-height:1.55;color:var(--ink2);margin-top:14px;max-width:560px}
.gd-bubbles{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.gd-bub{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.gd-bub .wd{font-size:.72rem;font-weight:800;color:var(--muted)}
.gd-bub .ball{width:100%;max-width:56px;aspect-ratio:1;border-radius:50%;background:var(--bg);position:relative;overflow:hidden;display:grid;place-items:center}
.gd-bub .ball i{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(to top,var(--sage2),#a9c7b3)}
.gd-bub .ball.over i{background:linear-gradient(to top,#e0a27f,#efc3a8)}
.gd-bub .ball b{position:relative;font-size:1rem;font-weight:800}
.gd-bub.today .ball{box-shadow:0 0 0 3px var(--card),0 0 0 5px var(--sage2)}
.gd-bub .m{font-size:.72rem;color:var(--muted);font-weight:700;min-height:1em}
.gd-bub .dots{display:flex;gap:3px;min-height:7px}
.gd-bub .dots i{width:7px;height:7px;border-radius:50%}
.gd-tl{display:flex;flex-direction:column;gap:4px;position:relative}
.gd-tl-row{display:grid;grid-template-columns:40px 1fr auto;gap:12px;align-items:center;padding:8px 0}
.gd-tl-row .ic{width:40px;height:40px;border-radius:14px;display:grid;place-items:center}
.gd-tl-row .ic.due{background:var(--sun-l);color:var(--sun)}.gd-tl-row .ic.exam{background:var(--peach-l);color:var(--peach)}.gd-tl-row .ic.lesson{background:var(--sky-l);color:var(--sky)}
.gd-tl-row b{display:block;font-size:.9rem;font-weight:800;line-height:1.3}
.gd-tl-row small{font-size:.76rem;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:2px}
.gd-tl-row .when{font-size:.76rem;font-weight:800;color:var(--ink2);text-align:right;white-space:nowrap}
.gd-tl-row .when.late{color:var(--peach)}
.gd-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}
.gd-tile{border-radius:24px;padding:20px;text-decoration:none;color:inherit;background:color-mix(in srgb,var(--c) 12%,var(--card));display:flex;flex-direction:column;gap:12px;transition:transform .15s;min-height:190px}
.gd-tile:hover{transform:translateY(-3px)}
.gd-tile .top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.gd-tile h3{font-size:1.15rem;font-weight:800;letter-spacing:-.01em}
.gd-tile .sub{font-size:.78rem;color:var(--ink2);margin-top:3px}
.gd-tile .facts{display:grid;gap:6px;font-size:.8rem;color:var(--ink2)}
.gd-tile .facts span{display:flex;gap:7px;align-items:center}
.gd-tile .facts .warn{color:var(--sun);font-weight:800}
.gd-tile .stem{margin-top:auto;height:10px;border-radius:999px;background:var(--glass);overflow:hidden}
.gd-tile .stem i{display:block;height:100%;border-radius:999px;background:var(--c)}
.gd-ring text{font-weight:800;fill:var(--ink)}
.gd-help{background:linear-gradient(150deg,var(--sun-l),#fdf7ea);border-radius:var(--r);padding:22px 24px}
.gd-help h2{font-size:1.05rem;font-weight:800;margin-bottom:12px;display:flex;gap:10px;align-items:center}
.gd-help-row{display:flex;justify-content:space-between;gap:10px;align-items:center;background:var(--glass);border-radius:16px;padding:10px 12px}
.gd-help-row + .gd-help-row{margin-top:8px}
.gd-help-row b{font-size:.88rem;display:block}
.gd-help-row small{font-size:.74rem;color:var(--muted)}
.gd-help p{font-size:.78rem;color:var(--ink2);margin-top:12px;line-height:1.5}
/* course */
.gd-chead{border-radius:30px;padding:28px 30px;background:linear-gradient(135deg,color-mix(in srgb,var(--c) 18%,var(--card)),color-mix(in srgb,var(--c) 6%,var(--card)));display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:26px;align-items:center}
.gd-chead h1{font-size:clamp(1.8rem,3.6vw,2.6rem);font-weight:800;letter-spacing:-.03em;line-height:1.05}
.gd-chead .sub{font-size:.9rem;color:var(--ink2);margin-top:6px}
.gd-chead .acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.gd-chead .acts .shq-btn.ghost{background:var(--card)}
.gd-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.gd-kpi{background:var(--glass);border-radius:16px;padding:8px 14px;font-size:.78rem;color:var(--ink2);font-weight:700}
.gd-kpi b{font-size:1rem;color:var(--ink);margin-right:4px}
@media(max-width:860px){.gd-chead{grid-template-columns:auto 1fr;padding:22px}.gd-chead .acts{grid-column:1 / -1;justify-content:flex-start}}
.gd-topics{display:flex;flex-wrap:wrap;gap:8px}
.gd-topic{display:inline-flex;align-items:center;gap:7px;font-size:.82rem;font-weight:800;padding:8px 14px 8px 10px;border-radius:999px;background:var(--bg);color:var(--ink2)}
.gd-topic.learned{background:var(--sage-l);color:var(--sage)}
.gd-topic.unsure{background:var(--sun-l);color:var(--sun)}
.gd-topic i{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:var(--card);font-style:normal}
.gd-lesson{display:flex;gap:12px;align-items:center;padding:10px 0}
.gd-lesson .av{width:40px;height:40px;border-radius:14px;background:var(--sky-l);color:var(--sky);display:grid;place-items:center;font-weight:800;font-size:.84rem;flex-shrink:0}
.gd-lesson b{display:block;font-size:.9rem}
.gd-lesson small{font-size:.76rem;color:var(--muted)}
.gd-lesson .tag{margin-left:auto;font-size:.72rem;font-weight:800;padding:4px 10px;border-radius:999px}
.gd-lesson .tag.done{background:var(--sage-l);color:var(--sage)}.gd-lesson .tag.up{background:var(--sky-l);color:var(--sky)}
.gd-examcard{border-radius:20px;background:var(--bg);padding:18px;display:grid;gap:12px}
.gd-examcard + .gd-examcard{margin-top:12px}
.gd-examcard .eh{display:flex;justify-content:space-between;gap:12px;align-items:center}
.gd-examcard .eh b{font-size:1rem;font-weight:800}
.gd-examcard .eh small{display:block;font-size:.78rem;color:var(--muted);margin-top:2px}
.gd-cd{width:64px;height:64px;border-radius:50%;background:var(--card);display:grid;place-items:center;text-align:center;flex-shrink:0;box-shadow:inset 0 0 0 3px var(--c,var(--lav2))}
.gd-cd b{font-size:1.2rem;line-height:1;display:block}
.gd-cd small{font-size:.6rem;font-weight:800;color:var(--muted);text-transform:uppercase}
.gd-capsule{height:12px;border-radius:999px;background:var(--card);overflow:hidden}
.gd-capsule i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--c,var(--sage2)),color-mix(in srgb,var(--c,var(--sage2)) 60%,var(--card)))}
/* planner */
.gd-days{display:grid;gap:12px}
.gd-day{background:var(--card);border-radius:24px;padding:16px 20px;display:grid;grid-template-columns:76px minmax(0,1fr) 170px;gap:18px;align-items:center}
.gd-day.today{box-shadow:0 0 0 2px var(--sage2)}
.gd-day .date{text-align:center;border-radius:18px;background:var(--bg);padding:10px 0}
.gd-day.today .date{background:var(--btn);color:#fff}
.gd-day .date b{display:block;font-size:1.5rem;font-weight:800;line-height:1}
.gd-day .date small{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
.gd-pills{display:flex;flex-wrap:wrap;gap:8px}
.gd-pillev{display:inline-flex;align-items:center;gap:8px;border-radius:14px;padding:8px 12px;font-size:.82rem;font-weight:700;background:color-mix(in srgb,var(--c) 12%,var(--card));color:var(--ink);border:0;cursor:default;text-align:left;font-family:inherit}
.gd-pillev small{font-size:.7rem;font-weight:800;color:var(--ink2);text-transform:uppercase;letter-spacing:.03em}
button.gd-pillev{cursor:pointer}
button.gd-pillev:hover{filter:brightness(.97)}
.gd-pillev.exam{background:var(--peach-l)}.gd-pillev.lesson{background:var(--sky-l)}
.gd-pillev.done{opacity:.55;text-decoration:line-through}
.gd-pillev.blocked{background:var(--sun-l)}
.gd-day .free{font-size:.86rem;color:var(--muted)}
.gd-meter{display:flex;flex-direction:column;gap:6px;align-items:flex-end}
.gd-meter .cap{width:100%;height:12px;background:var(--bg);border-radius:999px;overflow:hidden}
.gd-meter .cap i{display:block;height:100%;background:var(--sage2);border-radius:999px}
.gd-meter.over .cap i{background:#e0a27f}
.gd-meter span{font-size:.76rem;font-weight:800;color:var(--ink2)}
.gd-meter button{border:0;background:none;color:var(--sage);font-weight:800;font-size:.78rem;cursor:pointer;padding:4px 0}
@media(max-width:760px){.gd-day{grid-template-columns:62px 1fr;padding:14px}.gd-meter{grid-column:1 / -1;flex-direction:row;align-items:center;justify-content:space-between}.gd-meter .cap{width:50%}}
.gd-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-bottom:16px}
.gd-tools select{border:0;border-radius:999px;padding:8px 12px;background:var(--card);font-weight:800;color:var(--ink2)}
.gd-seg{display:inline-flex;background:var(--card);border-radius:999px;padding:4px;gap:2px}
.gd-seg button{border:0;background:none;border-radius:999px;padding:7px 14px;font-weight:800;font-size:.82rem;color:var(--ink2);cursor:pointer;min-height:36px}
.gd-seg button:hover{background:var(--bg)}
/* lists */
.gd-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.gd-filters button{border:0;background:var(--card);border-radius:999px;padding:8px 14px;font-size:.82rem;font-weight:800;color:var(--ink2);cursor:pointer;display:inline-flex;gap:7px;align-items:center;min-height:38px}
.gd-filters button[aria-pressed="true"]{background:var(--ink);color:#fff}
.gd-group{margin-top:22px}
.gd-group:first-child{margin-top:0}
.gd-group h3{font-size:.86rem;font-weight:800;color:var(--ink2);margin-bottom:10px;display:flex;gap:8px;align-items:center}
.gd-group h3 span{background:var(--card);border-radius:999px;padding:1px 9px;font-size:.74rem}
.gd-group h3.red{color:var(--peach)}
.gd-examgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px}
.gd-bigcd{display:flex;gap:16px;align-items:center}
.gd-bigcd .gd-cd{width:84px;height:84px}
.gd-bigcd .gd-cd b{font-size:1.7rem}
.gd-notes{columns:280px;column-gap:18px}
.gd-note{break-inside:avoid;margin-bottom:18px;border-radius:22px;padding:20px;background:color-mix(in srgb,var(--c) 11%,var(--card));display:flex;flex-direction:column;gap:10px}
.gd-note h3{font-size:1rem;font-weight:800;line-height:1.35;display:flex;gap:8px;align-items:flex-start}
.gd-note p{font-size:.88rem;line-height:1.6;color:var(--ink2);white-space:pre-wrap;overflow-wrap:anywhere}
.gd-note .foot{display:flex;justify-content:space-between;align-items:center;gap:8px}
.gd-note a.url{font-size:.84rem;font-weight:800;color:var(--sky);overflow-wrap:anywhere}
/* progress */
.gd-growth{display:grid;gap:16px}
.gd-grow{display:grid;grid-template-columns:minmax(120px,190px) minmax(0,1fr) 60px;gap:16px;align-items:center}
.gd-grow a{font-weight:800;font-size:.92rem;text-decoration:none;display:flex;gap:8px;align-items:center}
.gd-grow small{display:block;font-size:.74rem;color:var(--muted);font-weight:600;margin-top:2px}
.gd-grow .track{position:relative;height:16px;border-radius:999px;background:var(--bg)}
.gd-grow .track i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 55%,var(--card)),var(--c))}
.gd-grow .track em{position:absolute;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:var(--card);color:var(--c);display:grid;place-items:center;box-shadow:0 3px 8px rgba(37,48,43,.15)}
.gd-grow .pct{font-weight:800;text-align:right}
@media(max-width:640px){.gd-grow{grid-template-columns:1fr auto}.gd-grow .track{grid-column:1 / -1}}
.gd-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:22px}
.gd-stat{border-radius:22px;padding:18px;background:var(--card)}
.gd-stat b{display:block;font-size:1.7rem;font-weight:800;letter-spacing:-.02em}
.gd-stat span{font-size:.8rem;color:var(--ink2);font-weight:700}
.gd-stat:nth-child(1){background:var(--sage-l)}.gd-stat:nth-child(2){background:var(--lav-l)}.gd-stat:nth-child(3){background:var(--sky-l)}.gd-stat:nth-child(4){background:var(--peach-l)}
@media(max-width:760px){.gd-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
.gd-badges{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.gd-badge{background:var(--card);border-radius:24px;padding:22px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px}
.gd-badge .medal{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;margin-bottom:4px}
.gd-badge.verified .medal{background:linear-gradient(140deg,#cfe3d6,#9cc3ab);color:#234a35}
.gd-badge.record .medal{background:linear-gradient(140deg,#d8e7f4,#a9c9e6);color:#1f557e}
.gd-badge.self .medal{background:var(--bg);color:var(--muted);border:2px dashed #cfd3c8}
.gd-badge b{font-size:.94rem;line-height:1.35}
.gd-badge p{font-size:.8rem;color:var(--muted);line-height:1.45}
.gd-badge .lv{font-size:.68rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:3px 10px;border-radius:999px}
.gd-badge.verified .lv{background:var(--sage-l);color:var(--sage)}.gd-badge.record .lv{background:var(--sky-l);color:var(--sky)}.gd-badge.self .lv{background:var(--bg);color:var(--muted)}

/* ---- release 2: sky greeting, Do next, exam spotlight, Exam help, busy weeks, Exams & deadlines ---- */
.gd-sky{position:relative;overflow:hidden;border-radius:28px;min-height:190px;padding:30px clamp(20px,3vw,34px) 28px;color:var(--sky-ink);background:#9CC5EA;box-shadow:0 20px 50px -38px rgba(37,48,43,.6)}
.gd-sky .shq-sky-art{position:absolute;inset:0;width:100%;height:100%;display:block}
.gd-sky-txt{position:relative;max-width:620px}
.gd-sky .date{font-size:.86rem;font-weight:600;color:var(--sky-soft)}
.gd-sky h1{font-size:clamp(1.6rem,3.2vw,2.2rem);font-weight:800;letter-spacing:-.02em;line-height:1.15;margin:6px 0 4px;text-shadow:0 1px 14px rgba(0,0,0,.08)}
.gd-sky p{font-size:1rem;font-weight:600;color:var(--sky-soft);margin:0}
.gd-sky .gd-chip{background:rgba(255,255,255,.88);color:#25302b}
.gd-sky[data-dark] .gd-chip{background:rgba(255,255,255,.16);color:#fff}
.gd-sky .gd-chips{margin-top:14px}
.tw{animation:twk 3.4s ease-in-out infinite}
@keyframes twk{0%,100%{opacity:.25}50%{opacity:1}}
@media(prefers-reduced-motion:reduce){.tw{animation:none}}
.gd-catch{display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:var(--sun-l);border:1px solid #efd9a6;border-radius:18px;padding:12px 16px;font-size:.92rem}
.gd-catch span{flex:1 1 260px}
.gd-plan h2{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}
.gd-plan .q{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:2px 0 14px}
.gd-plan .q>span{font-size:.9rem;font-weight:700;color:var(--ink2);margin-right:4px}
.gd-steps{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.gd-step{display:flex;gap:14px;align-items:center;border:1px solid var(--line);border-radius:16px;padding:12px 14px}
.gd-step .tx{flex:1;min-width:0}.gd-step .tx b{display:block;font-size:.98rem}.gd-step .tx small{display:block;font-size:.82rem;color:var(--muted);margin-top:2px}
.gd-step .mn{font-size:.82rem;font-weight:800;color:var(--ink2);white-space:nowrap}
.gd-step .go{width:28px;height:28px;border-radius:10px;display:grid;place-items:center;background:var(--btn);color:#fff;flex-shrink:0;text-decoration:none}
.gd-step .skip{border:0;background:none;color:var(--muted);font-size:.78rem;text-decoration:underline;cursor:pointer;padding:4px}
.gd-plan .foot{font-size:.8rem;color:var(--muted);margin-top:12px}
.gd a.shq-check{text-decoration:none}.gd a.shq-check.on{background:var(--sage2);border-color:var(--sage2)}
.gd-spots{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.gd-spot{background:var(--card);border-radius:var(--r);padding:18px;border-top:4px solid var(--lav);box-shadow:0 1px 2px rgba(37,48,43,.05);display:grid;gap:8px}
.gd-spot .lb{display:flex;justify-content:space-between;gap:8px;font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--lav)}.gd-spot .lb span{color:var(--muted);text-transform:none;letter-spacing:0;font-weight:600}
.gd-spot .big{display:flex;align-items:baseline;gap:10px}.gd-spot .big b{font-size:2.3rem;font-weight:800;letter-spacing:-.02em}.gd-spot .big span{font-size:.95rem;color:var(--ink2)}
.gd-spot small{font-size:.82rem;color:var(--muted)}
.gd-bar{height:8px;border-radius:99px;background:var(--lav-l)}.gd-bar i{display:block;height:8px;border-radius:99px;background:var(--lav)}
.gd-helpbox h2{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.gd-helpbox h2 button{border:0;background:none;font-size:.8rem;color:var(--muted);text-decoration:underline;cursor:pointer;font-weight:600}
.gd-helpgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.gd-hc{border:1px solid var(--line);border-radius:18px;padding:16px;display:grid;gap:8px;align-content:start}
.gd-hc.ask{border-style:dashed;background:var(--bg)}
.gd-hc .lb{font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--lav)}
.gd-hc b{font-size:1rem}.gd-hc p{margin:0;font-size:.88rem;color:var(--ink2);line-height:1.45}.gd-hc small{font-size:.78rem;color:var(--muted)}
.gd-hc .who{display:flex;gap:12px;align-items:center}.gd-hc .av{width:44px;height:44px;border-radius:50%;background:var(--sky-l);color:var(--sky);display:grid;place-items:center;font-weight:800;flex-shrink:0}
.gd-hc .ok{color:var(--sage);font-weight:700;font-size:.78rem}
.gd-hc .acts{display:flex;gap:8px;flex-wrap:wrap}
.gd-invite{display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:var(--sage-l);border-radius:16px;padding:12px 14px;margin-top:14px;font-size:.9rem}.gd-invite span{flex:1 1 260px}
.gd-busy{display:flex;gap:6px;align-items:flex-end;height:92px;margin-top:10px}
.gd-busy div{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end}
.gd-busy i{display:block;width:100%;border-radius:7px;background:#cfe0d4;min-height:4px}.gd-busy .now i{background:var(--sage2)}.gd-busy .hot i{background:#e7b35a}
.gd-busy b{font-size:.72rem}.gd-busy small{font-size:.68rem;color:var(--muted);white-space:nowrap}
.gd-qa{display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:var(--card);border-radius:18px;padding:12px 14px;margin-bottom:14px;box-shadow:0 1px 2px rgba(37,48,43,.05)}
.gd-qa input{flex:1 1 280px;border:1px solid var(--line);border-radius:12px;padding:11px 12px;font:inherit;font-size:.95rem;background:var(--card);color:var(--ink)}
.gd-qa input:focus{outline:3px solid var(--sage-l);border-color:var(--sage2)}
.gd-qa #qaPreview{flex-basis:100%;display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:.8rem;min-height:22px}
.shq-qa-hint{color:var(--muted)}.shq-qa-chip{background:var(--sky-l);color:var(--sky);border-radius:999px;padding:3px 10px;font-weight:700}.shq-qa-miss{color:var(--peach);font-weight:700}
.gd-types{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.gd-types button{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:7px 14px;font:inherit;font-size:.84rem;font-weight:700;cursor:pointer;color:var(--ink2)}
.gd-types button[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:#fff}
.gd-dlg h3{font-size:.74rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2);margin:18px 0 8px}.gd-dlg h3.red{color:var(--peach)}
.gd-dl{display:flex;gap:14px;align-items:center;background:var(--card);border-radius:16px;padding:12px 14px;border-left:5px solid var(--sky);margin-bottom:8px;box-shadow:0 1px 2px rgba(37,48,43,.05)}
.gd-dl.t-exam{border-left-color:var(--lav)}.gd-dl.late{border-left-color:#e7b35a}
.gd-dl .d{width:52px;flex-shrink:0;text-align:center;background:var(--bg);border-radius:12px;padding:5px 0}.gd-dl.late .d{background:var(--sun-l)}
.gd-dl .d small{display:block;font-size:.68rem;color:var(--muted)}.gd-dl .d b{display:block;font-size:1.3rem;line-height:1.1}
.gd-dl .b{flex:1;min-width:0}.gd-dl .l1{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.gd-dl .l1>b{font-size:.98rem}
.gd-dl .ty{font-size:.66rem;font-weight:800;letter-spacing:.06em;border-radius:6px;padding:2px 7px;background:var(--sky-l);color:var(--sky)}.gd-dl.t-exam .ty{background:var(--lav-l);color:var(--lav)}
.gd-dl .m{font-size:.82rem;color:var(--ink2);margin-top:3px}.gd-dl .s{font-size:.82rem;color:var(--muted);margin-top:2px;font-weight:600}.gd-dl.late .s{color:#9a6b1f}
.gd-dl .r{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0}.gd-dl .w{font-size:.84rem;font-weight:800;color:var(--ink2)}.gd-dl.late .w{color:#9a6b1f}
.gd-dl .acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
@media(max-width:640px){.gd-dl{flex-wrap:wrap}.gd-dl .r{flex-direction:row;width:100%;justify-content:space-between;align-items:center}.gd-sky{min-height:160px;border-radius:22px}}
.gd-howto{display:grid;gap:10px;font-size:.86rem;color:var(--ink2)}.gd-howto b{color:var(--ink)}
.gd-tabbar a{position:relative}.gd-tabbar a .n{position:absolute;top:2px;left:calc(50% + 6px);background:var(--peach);color:#fff;font-size:.62rem;font-weight:800;line-height:1;border-radius:999px;padding:3px 6px}
/* Dark mode: a calm night garden. Same layout; only the colours change. */
html[data-theme="dark"]{color-scheme:dark}
html[data-theme="dark"] body[data-concept="garden"]{background:#121815;color:#e4ebe6;
  --d-ink:#e4ebe6;--d-ink2:#c2ccc5;--d-muted:#97a59d;--d-line:#2b3530;--d-accent:#86c29d;--d-surface:#1b231f;--d-field:#151c18}
html[data-theme="dark"] .gd{--bg:#121815;--card:#1b231f;--ink:#e4ebe6;--ink2:#c2ccc5;--muted:#97a59d;--line:#2b3530;
  --sage:#86c29d;--sage2:#5d9274;--sage-l:#203229;--lav:#b9adf2;--lav2:#7c6fc4;--lav-l:#25213a;--sky:#8fc3ea;--sky-l:#1a2a36;
  --peach:#f2a585;--peach-l:#36231b;--sun:#e8c46e;--sun-l:#2c2617;--glass:rgba(255,255,255,.06);--glass2:rgba(27,35,31,.96);--btn:#3f7a59;--btn2:#5d4fb0;--ring-track:rgba(255,255,255,.12)}
html[data-theme="dark"] .gd-side,html[data-theme="dark"] .gd-card,html[data-theme="dark"] .gd-tabbar,html[data-theme="dark"] .gd-more{box-shadow:0 0 0 1px #26302b,0 20px 50px -38px #000}
html[data-theme="dark"] .gd-hero{background:linear-gradient(120deg,#1c2c23 0%,#1b2532 55%,#251f36 100%)}
html[data-theme="dark"] .gd-focus{background:linear-gradient(160deg,#25213a,#1e1b2e)}
html[data-theme="dark"] .gd-help{background:linear-gradient(150deg,#2c2617,#221e14)}
html[data-theme="dark"] .gd-chead{background:linear-gradient(135deg,color-mix(in srgb,var(--c) 24%,#1b231f),color-mix(in srgb,var(--c) 8%,#1b231f))}
html[data-theme="dark"] .gd-tile,html[data-theme="dark"] .gd-note,html[data-theme="dark"] .gd-pillev{background:color-mix(in srgb,var(--c) 18%,#1b231f)}
html[data-theme="dark"] .gd .shq-btn.primary:hover{background:#4a8a66}
html[data-theme="dark"] .gd .shq-btn.ghost:hover{background:#27312c}
html[data-theme="dark"] .gd-focus .acts .shq-btn.primary:hover{background:#6a5cc0}
html[data-theme="dark"] .gd .shq-notice{color:#f0d79a}
html[data-theme="dark"] .gd .shq-check{border-color:#4a5650}
html[data-theme="dark"] .gd-wkrow small{color:#e8c46e}
html[data-theme="dark"] .gd-catch{border-color:#4a3f22}
html[data-theme="dark"] .gd-filters button[aria-pressed="true"]{background:#e4ebe6;color:#121815}
html[data-theme="dark"] .gd-pday.on{background:#3d5a2a;color:#d6f0b6}
html[data-theme="dark"] .gd-badge.verified .medal{background:linear-gradient(140deg,#2c4a38,#3f6e55);color:#cfe8d8}
html[data-theme="dark"] .gd-badge.record .medal{background:linear-gradient(140deg,#20384d,#2c5577);color:#d3e6f5}
html[data-theme="dark"] .gd-badge.self .medal{border-color:#3a4540}
html[data-theme="dark"] .gd-busy i{background:#33453b}html[data-theme="dark"] .gd-busy .now i{background:var(--sage2)}html[data-theme="dark"] .gd-busy .hot i{background:#c99a45}
html[data-theme="dark"] .gd-sky{filter:brightness(.82) saturate(.9)}
html[data-theme="dark"] .gd img{opacity:.92}
.gd-theme{display:flex;align-items:center;gap:10px;border:0;background:none;cursor:pointer;font-size:.82rem;font-weight:700;color:var(--ink2);padding:8px 10px;border-radius:10px;text-align:left;width:100%;margin-top:6px;border-top:1px solid var(--line);border-radius:0 0 10px 10px;padding-top:12px}
.gd-theme:hover{background:var(--bg)}.gd-theme span{flex:1}
.gd-sw{display:block;width:38px;height:22px;border-radius:999px;background:#cfd3c8;position:relative;flex:none;transition:background .2s}.gd-sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s}
.gd-theme[aria-checked="true"] .gd-sw{background:var(--btn)}.gd-theme[aria-checked="true"] .gd-sw::after{transform:translateX(16px)}
@media(prefers-reduced-motion:reduce){.gd-sw,.gd-sw::after{transition:none}}
.gd-more .gd-theme{font-size:.88rem;padding:10px 12px;color:var(--ink2)}

.gd-prod{margin-bottom:0}
.gd-prod-h h2{margin:0}.gd-prod-h p{margin:4px 0 0;font-size:.85rem}
.gd-prod-empty{margin:14px 0 0;padding:18px;border-radius:16px;background:var(--bg);color:var(--ink2);font-size:.9rem}
.gd-prod-grid{display:grid;grid-template-columns:1fr 260px;gap:22px;margin-top:16px;align-items:end}
.gd-pstats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.gd-pstat{border-radius:18px;padding:14px;background:var(--bg);display:flex;flex-direction:column;gap:3px;min-width:0}
.gd-pstat .ic{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;margin-bottom:6px}
.gd-pstat.g .ic{background:var(--sage-l);color:var(--sage)}.gd-pstat.s .ic{background:var(--sun-l);color:var(--sun)}.gd-pstat.k .ic{background:var(--sky-l);color:var(--sky)}.gd-pstat.l .ic{background:var(--lav-l);color:var(--lav)}
.gd-pstat b{font-size:1.5rem;font-weight:800;line-height:1.1;color:var(--ink)}
.gd-pstat .lb{font-size:.8rem;font-weight:700;color:var(--ink2)}
.gd-pstat small{font-size:.74rem;color:var(--muted)}
.gd-pbars{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;height:150px}
.gd-pbar{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
.gd-pbar span{flex:1;width:100%;max-width:26px;background:var(--bg);border-radius:9px;display:flex;align-items:flex-end;overflow:hidden}
.gd-pbar i{display:block;width:100%;background:var(--sage2);border-radius:9px;opacity:.55}
.gd-pbar.today i{opacity:1;background:var(--sage)}
.gd-pbar.later span{opacity:.5}
.gd-pbar b{font-size:.72rem;font-weight:800;color:var(--ink2);min-height:1em}
.gd-pbar small{font-size:.7rem;color:var(--muted);font-weight:700}
.gd-pbar.today small{color:var(--sage)}
.gd-card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}.gd-card-h h2{margin:0}
.gd-sub-h{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:14px 0 4px;font-weight:800}
.gd-done-row{display:grid;grid-template-columns:36px 1fr auto auto;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)}
.gd-done-row:last-child{border-bottom:0}
.gd-done-row .ic{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:var(--sage-l);color:var(--sage)}
.gd-done-row.achievement .ic{background:var(--sun-l);color:var(--sun)}.gd-done-row.research .ic{background:var(--lav-l);color:var(--lav)}.gd-done-row.plan .ic{background:var(--peach-l);color:var(--peach)}.gd-done-row.lesson .ic{background:var(--sky-l);color:var(--sky)}
.gd-done-row b{display:block;font-size:.88rem;font-weight:800;line-height:1.3}
.gd-done-row small{font-size:.75rem;color:var(--muted);display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:2px}
.gd-done-row .src{font-weight:700;color:var(--sage)}.gd-done-row .src.late{color:var(--peach)}
.gd-done-row .when{font-size:.75rem;font-weight:800;color:var(--ink2);white-space:nowrap}
.gd-iconbtn{border:0;background:none;color:var(--muted);cursor:pointer;padding:6px;border-radius:9px}.gd-iconbtn:hover{background:var(--bg);color:var(--ink)}
.gd-more-done summary{cursor:pointer;font-size:.82rem;font-weight:800;color:var(--sage);padding:10px 0}
.gd-rs-row{display:grid;grid-template-columns:36px 1fr auto;gap:12px;align-items:center;width:100%;text-align:left;border:0;background:none;padding:10px 8px;margin:0 -8px;border-radius:14px;cursor:pointer;color:inherit;font:inherit}
.gd-rs-row:hover{background:var(--bg)}
.gd-rs-row .ic{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:var(--lav-l);color:var(--lav)}
.gd-rs-row b{display:block;font-size:.88rem;font-weight:800;line-height:1.3}
.gd-rs-row small{font-size:.75rem;color:var(--muted);display:flex;align-items:center;gap:5px;margin-top:2px}
.gd-rs-st{font-size:.72rem;font-weight:800;padding:5px 10px;border-radius:999px;background:var(--sun-l);color:var(--sun);white-space:nowrap}
.gd-rs-st.done{background:var(--sage-l);color:var(--sage)}
@media(max-width:1100px){.gd-prod-grid{grid-template-columns:1fr}.gd-pbars{height:120px}}
@media(max-width:720px){.gd-pstats{grid-template-columns:1fr 1fr}.gd-pstat b{font-size:1.3rem}.gd-done-row{grid-template-columns:32px 1fr auto}.gd-done-row .gd-iconbtn{display:none}.gd-card-h{flex-wrap:wrap}}

.gd .shq-rem{display:flex;gap:18px;align-items:flex-start;justify-content:space-between;padding:16px 0;border-top:1px solid var(--line)}
.gd .shq-rem:first-of-type{border-top:0}
.gd .shq-rem-t{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1}
.gd .shq-rem-t>b{display:flex;align-items:center;gap:8px;font-size:.95rem;font-weight:800;color:var(--ink)}
.gd .shq-rem-t>b svg{color:var(--sage)}
.gd .shq-rem-t>small{font-size:.84rem;color:var(--ink2);line-height:1.5;max-width:60ch}
.gd .shq-rem-hour{display:flex;align-items:center;gap:8px;font-size:.84rem;font-weight:700;color:var(--ink2);margin-top:4px}
.gd .shq-rem-hour select{border:1px solid var(--line);border-radius:10px;padding:6px 10px;background:var(--card);color:var(--ink);font:inherit}
.gd .shq-switch{border:0;background:none;padding:4px;cursor:pointer;flex:none}
.gd .shq-switch[aria-checked="true"] .gd-sw{background:var(--btn)}.gd .shq-switch[aria-checked="true"] .gd-sw::after{transform:translateX(16px)}
.gd .shq-rem-link{display:flex;gap:8px;margin-top:6px;max-width:640px}
.gd .shq-rem-link input{flex:1;min-width:0;border:1px solid var(--line);border-radius:12px;padding:9px 12px;background:var(--bg);color:var(--ink2);font:inherit;font-size:.8rem}
.gd .shq-rem .shq-row{margin-top:6px;flex-wrap:wrap}
.gd .shq-rem-note{font-size:.78rem;color:var(--muted)}

.gd-tabbar a,.gd-tabbar summary{white-space:nowrap}
.gd-sky-next{display:inline-flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px;padding:8px 8px 8px 16px;border-radius:999px;background:rgba(255,255,255,.72);color:#25302b;font-size:.88rem;box-shadow:0 6px 18px -12px rgba(0,0,0,.35);max-width:100%}
.gd-sky-next b{font-weight:800}
.gd-sky-go{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:999px;padding:8px 14px;background:var(--btn);color:#fff;font:inherit;font-weight:800;font-size:.84rem;cursor:pointer;text-decoration:none}
.gd-sky-go:hover{filter:brightness(1.08)}
.gd-warn{display:grid;grid-template-columns:44px 1fr;gap:14px;align-items:start;padding:18px 20px;border-radius:var(--r);background:var(--card);border:1px solid var(--line);border-left:5px solid var(--sun);box-shadow:0 20px 50px -40px rgba(37,48,43,.5)}
.gd-warn.high{border-left-color:var(--peach)}
.gd-warn .ic{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:var(--sun-l);color:var(--sun)}
.gd-warn.high .ic{background:var(--peach-l);color:var(--peach)}
.gd-warn b{display:block;font-size:1rem;font-weight:800;color:var(--ink)}
.gd-warn p{margin:4px 0 12px;font-size:.88rem;line-height:1.5;color:var(--ink2)}
.gd-warn .acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.gd-warn-x{border:0;background:none;color:var(--muted);font:inherit;font-size:.82rem;font-weight:700;cursor:pointer;padding:6px 8px;text-decoration:underline}
html[data-theme="dark"] .gd-sky-next{background:rgba(18,24,21,.72);color:#e4ebe6}
@media(max-width:720px){.gd-sky-next{border-radius:18px;padding:10px 12px}.gd-warn{grid-template-columns:1fr;padding:16px}.gd-warn .ic{width:38px;height:38px}}

`;
  function themeBtn(a) {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return '<button type="button" class="gd-theme" data-act="theme" role="switch" aria-checked="' + dark + '">' + a.ic('moon', 18) + '<span>' + a.esc(a.T('dark-mode', 'Dark mode')) + '</span><i class="gd-sw" aria-hidden="true"></i></button>';
  }



  var PALETTE = ['#5e8b6f', '#8b7bc8', '#4f8cc1', '#c9805f', '#b89036', '#b5739b', '#4a9696', '#7c8c4a'];

  function ring(pct, color, size, label, track) {
    size = size || 64; var r = size / 2 - 6, c = 2 * Math.PI * r, v = pct == null ? 0 : pct;
    return '<svg class="gd-ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + label + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + (track || 'var(--ring-track,rgba(255,255,255,.85))') + '" stroke-width="8"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (c * v / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>' +
      '<text x="50%" y="50%" text-anchor="middle" dy=".35em" font-size="' + Math.round(size / 4.6) + '">' + (pct == null ? '–' : v + '%') + '</text></svg>';
  }
  function sprout(size) {
    size = size || 56;
    return '<svg class="gd-sprout" width="' + size + '" height="' + size + '" viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="56" rx="18" ry="4" fill="#e1e6da"/><path d="M32 55V30" stroke="#5e8b6f" stroke-width="3" stroke-linecap="round"/><path d="M32 36c-10 0-16-6-16-16 10 0 16 6 16 16z" fill="#a9c7b3"/><path d="M32 30c0-10 7-17 18-17 0 11-7 17-18 17z" fill="#7fa58c"/></svg>';
  }
  function hills() {
    return '<svg class="hills" viewBox="0 0 1200 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 50C150 20 300 20 450 40S750 70 900 45 1100 20 1200 35V70H0Z" fill="#d5e5d8"/><path d="M0 60C200 40 380 45 600 58S1000 50 1200 55V70H0Z" fill="#c6dccb"/></svg>';
  }
  function termWord(a, t) {
    if (!t) return null;
    return t.before ? a.T('term-starts-s', 'Starts {{d}}', { d: a.fmt(t.start, { day: 'numeric', month: 'short' }) }) : t.after ? a.T('term-over', 'Term finished') : a.T('week-of-n', 'Week {{w}} of {{n}}', { w: t.week, n: t.weeks });
  }
  function shell(a, nav) {
    var p = nav.profile || {}, t = nav.term;
    var items = nav.items.map(function (n) {
      var c = n.count ? '<span class="n' + (n.warn ? ' warn' : '') + '">' + n.count + '</span>' : '';
      return '<a href="' + n.href + '"' + (n.current ? ' aria-current="page"' : '') + '><span class="ib">' + a.ic(n.icon, 17) + '</span>' + a.esc(n.label) + c + '</a>';
    }).join('');
    var cnav = nav.courses.map(function (c) { return '<a href="' + c.href + '"' + (c.current ? ' aria-current="page"' : '') + '><i style="background:' + c.color + '"></i>' + a.esc(c.label) + '</a>'; }).join('') || '<a href="#" data-act="add-course">+ ' + a.esc(a.T('add-course', 'Add a course')) + '</a>';
    var termbox = t ? '<div class="gd-termbox">' + ring(t.pct, '#5e8b6f', 52, a.esc(a.T('term-pct', '{{n}}% of the term', { n: t.pct }))) + '<div><b>' + a.esc(termWord(a, t)) + '</b><small>' + a.esc(t.name) + '</small><button type="button" data-act="term">' + a.esc(a.T('edit-term', 'Edit term')) + '</button></div></div>'
      : '<div class="gd-termbox"><div><b>' + a.esc(a.T('set-term-q', 'When does your term end?')) + '</b><small>' + a.esc(a.T('set-term-sub', 'Add your term dates to see your week.')) + '</small><button type="button" data-act="term">' + a.esc(a.T('set-term', 'Set term dates')) + '</button></div></div>';
    var main = ['overview', 'assignments', 'learn', 'courses'];
    var tabs = nav.items.filter(function (n) { return main.indexOf(n.id) !== -1; }).map(function (n) {
      return '<a href="' + n.href + '"' + (n.current ? ' aria-current="page"' : '') + '>' + a.ic(n.icon, 20) + a.esc(n.id === 'overview' ? a.T('today-tab', 'Today') : n.id === 'assignments' ? a.T('deadlines-tab', 'Deadlines') : n.label) + (n.id === 'assignments' && n.count ? ' <span class="n">' + n.count + '</span>' : '') + '</a>';
    });
    tabs.splice(2, 0, '<button type="button" class="gd-cap" data-act="quick-capture" aria-label="' + a.esc(a.T('capture-h', 'Quick add')) + '">' + a.ic('plus', 24) + '</button>');
    var tabbar = tabs.join('');
    var rest = nav.items.filter(function (n) { return main.indexOf(n.id) === -1; });
    var moreCur = rest.some(function (n) { return n.current; });
    tabbar += '<details' + (moreCur ? ' class="cur"' : '') + '><summary>' + a.ic('more', 20) + a.esc(a.T('more', 'More')) + '</summary><div class="gd-more">' + rest.map(function (n) { return '<a href="' + n.href + '">' + a.ic(n.icon, 18) + a.esc(n.label) + '</a>'; }).join('') + '<a href="student-dashboard.html">' + a.ic('arrow', 18) + a.esc(a.T('tutoring-dashboard', 'Tutoring dashboard')) + '</a>' + themeBtn(a) + '</div></details>';
    return '<div class="gd"><div class="gd-app"><aside class="gd-side" aria-label="Study Campus"><div class="gd-brand"><span class="gd-logo">' + a.ic('leaf', 22) + '</span><div><b>Study Campus</b><small>' + a.esc(p.university || a.T('your-workspace', 'Your study space')) + '</small></div></div>' +
      '<button type="button" class="shq-btn primary gd-capside" data-act="quick-capture">' + a.ic('plus', 16) + a.esc(a.T('capture-h', 'Quick add')) + '</button><nav class="gd-nav" aria-label="Study Campus sections">' + items + '</nav><h4>' + a.esc(a.T('my-courses', 'My courses')) + '</h4><nav class="gd-cnav" aria-label="My courses">' + cnav + '</nav>' + termbox +
      '<div class="gd-sidelinks"><a href="student-dashboard.html">' + a.esc(a.T('tutoring-dashboard', 'Tutoring dashboard')) + ' →</a><a href="find-tutors.html">' + a.esc(a.T('find-a-tutor', 'Find a tutor')) + ' →</a>' + themeBtn(a) + '</div></aside>' +
      '<main id="main" tabindex="-1"><div class="gd-mobilehead"><b><span class="gd-logo">' + a.ic('leaf', 16) + '</span>Study Campus</b>' + (t ? '<span class="gd-chip">' + a.esc(termWord(a, t)) + '</span>' : '<button type="button" class="shq-btn ghost small" data-act="term">' + a.esc(a.T('set-term', 'Set term dates')) + '</button>') + '</div><!--VIEW--></main></div>' +
      '<nav class="gd-tabbar" aria-label="Study Campus">' + tabbar + '</nav></div>';
  }
  function head(a, title, sub, right) {
    return '<div class="gd-head"><div><h1 class="gd-title">' + a.esc(title) + '</h1>' + (sub ? '<p class="gd-sub">' + sub + '</p>' : '') + '</div>' + (right || '') + '</div>';
  }
  function tile(a, m) {
    var p = m.p, facts = [];
    if (p.next) facts.push('<span>' + a.ic(p.next.kind === 'exam' ? 'exam' : 'clock', 14) + a.esc(p.next.kind === 'exam' ? a.T('exam-on', 'Exam {{d}}', { d: a.relDay(p.next.when) }) : p.next.title + ' · ' + a.relDay(p.next.when)) + '</span>');
    if (p.unsure.length) facts.push('<span class="warn">' + a.ic('alert', 14) + a.esc(a.T('unsure-n', '{{n}} topics to strengthen', { n: p.unsure.length })) + '</span>');
    if (p.nextLesson) facts.push('<span>' + a.ic('user', 14) + a.esc(a.T('lesson-on', 'Lesson {{d}}', { d: a.relDay(p.nextLesson.at) })) + '</span>');
    if (!facts.length) facts.push('<span class="gd-muted">' + a.esc(a.T('all-calm', 'All calm here')) + '</span>');
    return '<a class="gd-tile" style="--c:' + m.color + '" href="' + m.href + '"><div class="top"><div><h3>' + a.esc(m.label) + '</h3><div class="sub">' + a.esc(p.total ? a.T('done-of', '{{d}} of {{t}} done', { d: p.done, t: p.total }) : a.T('nothing-yet', 'Nothing added yet')) + '</div></div>' +
      ring(p.pct, m.color, 54, a.esc(p.pct == null ? a.T('no-work', 'No work yet') : a.T('pct-done', '{{n}}% done', { n: p.pct }))) + '</div><div class="facts">' + facts.join('') + '</div><div class="stem"><i style="width:' + (p.pct || 0) + '%"></i></div></a>';
  }

  function skyHero(a, m, line) {
    var t = m.term, sk = m.today.sky;
    return '<section class="gd-sky"' + (sk.ink.dark ? ' data-dark' : '') + ' style="--sky-ink:' + sk.ink.ink + ';--sky-soft:' + sk.ink.soft + '">' + sk.svg +
      '<div class="gd-sky-txt"><div class="date">' + a.esc(m.dateText) + (t ? ' · ' + a.esc(termWord(a, t)) : '') + '</div><h1>' + a.esc(m.greet + (m.first ? ', ' + m.first : '') + '.') + '</h1><p>' + a.esc(line) + '</p>' + heroNext(a, m.today.first) + '</div></section>';
  }
  function heroNext(a, st) {
    if (!st) return '';
    var title = st.type === 'exam_task' ? a.T('revise-topic', 'Revise {{t}}', { t: st.title }) : st.title;
    var btn = st.type === 'review' ? '<a class="gd-sky-go" href="#/learn">' + a.esc(a.T('start', 'Start')) + a.ic('arrow', 14) + '</a>'
      : st.type === 'exam_task' ? '<a class="gd-sky-go" href="exam-planner.html">' + a.esc(a.T('start', 'Start')) + a.ic('arrow', 14) + '</a>'
      : '<button type="button" class="gd-sky-go" data-act="goto-plan">' + a.esc(a.T('start', 'Start')) + a.ic('arrow', 14) + '</button>';
    return '<div class="gd-sky-next"><span>' + a.esc(a.T('start-with', 'Start with')) + ' <b>' + a.esc(title) + '</b>' + (st.course ? ' · ' + a.esc(st.course) : '') + ' · ' + a.esc(a.mins(st.minutes)) + '</span>' + btn + '</div>';
  }
  function warningCard(a, w) {
    if (!w) return '';
    var h, p, acts;
    if (w.kind === 'exam') {
      h = a.T('warn-exam-h', 'You are falling behind in {{c}}', { c: w.course });
      p = (w.daysLeft === 0 ? a.T('warn-exam-today', '{{t}} is today.', { t: w.title }) : w.daysLeft === 1 ? a.T('warn-exam-1', '{{t}} is tomorrow.', { t: w.title }) : a.T('warn-exam-n', '{{t}} is in {{n}} days.', { t: w.title, n: w.daysLeft })) + ' ' +
        (w.behind === 1 ? a.T('warn-behind-1', '1 revision step is overdue ({{f}}).', { f: w.first }) : a.T('warn-behind-n', '{{n}} revision steps are overdue, starting with {{f}}.', { n: w.behind, f: w.first })) + ' ' +
        a.T('warn-fix', 'One catch-up session today gets you back on track.');
      acts = '<a class="shq-btn primary small" href="' + a.esc(w.planHref) + '">' + a.esc(a.T('catch-up', 'Catch up today')) + '</a>' +
        '<a class="shq-btn ghost small" href="' + a.esc(w.helpHref) + '">' + a.esc(w.hasTutor ? a.T('warn-tutor', 'See a tutor for {{c}}', { c: w.course }) : a.T('ask-tutor', 'Ask for a tutor')) + '</a>';
    } else {
      h = a.T('warn-slip-h', '{{n}} things slipped this week', { n: w.n });
      p = a.T('warn-slip-p', '{{a}}, {{b}} and more are still open. Give each a new day, so nothing is forgotten.', { a: w.titles[0], b: w.titles[1] });
      acts = '<a class="shq-btn primary small" href="#/planner">' + a.esc(a.T('plan-week', 'Plan this week')) + '</a>';
    }
    return '<section class="gd-warn ' + w.level + '" role="status"' + (w.color ? ' style="--wc:' + w.color + '"' : '') + '><span class="ic">' + a.ic('alert', 20) + '</span><div class="tx"><b>' + a.esc(h) + '</b><p>' + a.esc(p) + '</p><div class="acts">' + acts +
      '<button type="button" class="gd-warn-x" data-act="hide-warning">' + a.esc(a.T('not-now', 'Not now')) + '</button></div></div></section>';
  }
  function stepRow(a, st) {
    var ctl, extra = '';
    if (st.type === 'review') ctl = '<a class="go" href="#/learn" aria-label="' + a.esc(a.T('start-review', 'Start Quiz me')) + '">' + a.ic('arrow', 14) + '</a>';
    else if (st.type === 'exam_task') ctl = '<a class="shq-check" href="exam-planner.html" aria-label="' + a.esc(a.T('tick-in-planner', 'Tick “{{t}}” in the Exam planner', { t: st.title })) + '"></a>';
    else { ctl = a.checkbox('done', st.id, false, a.T('mark-done', 'Mark “{{t}}” done', { t: st.title }), !a.S.itemsReady); extra = '<button type="button" class="skip" data-act="skip" data-id="' + a.esc(st.id) + '">' + a.esc(a.T('not-now', 'Not now')) + '</button>'; }
    var title = st.type === 'exam_task' ? a.T('revise-topic', 'Revise {{t}}', { t: st.title }) : st.title;
    var sub = [st.course, st.why].filter(Boolean).join(' · ');
    return '<li class="gd-step">' + ctl + '<div class="tx"><b>' + a.esc(title) + '</b>' + (sub ? '<small>' + a.esc(sub) + '</small>' : '') + '</div><span class="mn">' + a.esc(a.mins(st.minutes)) + '</span>' + extra + '</li>';
  }
  function planCard(a, m) {
    var T = m.today, f = m.focus;
    var q = '<div class="q" role="group" aria-label="' + a.esc(a.T('time-q', 'How much time do you have today?')) + '"><span>' + a.esc(a.T('time-q', 'How much time do you have today?')) + '</span>' + a.timeChoices('shq-time') + '</div>';
    var body = T.plan.steps.length ? '<ol class="gd-steps">' + T.plan.steps.map(function (st) { return stepRow(a, st); }).join('') + '</ol><p class="foot">' + a.esc(a.T('planned-of', '{{u}} of {{m}} min planned, around your classes. Tick things off as you go.', { u: T.plan.used, m: T.plan.minutes })) + '</p>'
      : '<p class="gd-muted">' + a.esc(f.message || a.T('wn.none', 'Nothing to plan yet. Add your first assignment or exam and Study Campus will suggest what to do next.')) + '</p>' + (f.state === 'no_items' ? '<div style="margin-top:10px"><a class="shq-btn primary" href="#/assignments">' + a.esc(a.T('add-deadline', 'Add a deadline')) + '</a></div>' : '');
    return '<section class="gd-card gd-plan"><h2>' + a.esc(a.T('do-next', 'Do next')) + '</h2>' + q + body + '</section>';
  }
  function catchUp(a, r) {
    if (!r) return '';
    return '<div class="gd-catch" role="status"><span><b>' + a.esc(r.title) + '</b>' + (r.course ? ' (' + a.esc(r.course) + ')' : '') + ' · ' + a.esc(r.when) + '. ' + a.esc(a.T('no-stress', 'No stress. What happens next?')) + '</span>' +
      '<button type="button" class="shq-btn primary small" data-act="move-tomorrow" data-id="' + a.esc(r.id) + '">' + a.esc(a.T('move-tomorrow', 'Move to tomorrow')) + '</button>' +
      '<button type="button" class="shq-btn ghost small" data-act="done" data-id="' + a.esc(r.id) + '">' + a.esc(a.T('handed-in', 'I handed it in')) + '</button></div>';
  }
  function spotlight(a, list) {
    if (!list.length) return '';
    return '<div class="gd-spots">' + list.map(function (e, i) {
      var plan = e.total ? '<div class="gd-bar" role="img" aria-label="' + a.esc(a.T('plan-pct', '{{n}}% of the revision plan done', { n: e.pct })) + '"><i style="width:' + e.pct + '%"></i></div><small>' + a.esc(a.T('plan-steps', 'Revision plan: {{d}} of {{t}} steps', { d: e.done, t: e.total })) + '</small>'
        : '<a class="shq-btn primary small" style="justify-self:start" href="exam-planner.html?course=' + encodeURIComponent(e.course) + '">' + a.esc(a.T('make-plan', 'Make a revision plan (2 min)')) + '</a>';
      var big = e.daysLeft === 0 ? '<b>' + a.esc(a.T('today', 'Today')) + '</b><span>' + a.esc(e.title) + '</span>' : '<b>' + e.daysLeft + '</b><span>' + a.esc(e.daysLeft === 1 ? a.T('day-to', 'day to {{t}}', { t: e.title }) : a.T('days-to', 'days to {{t}}', { t: e.title })) + '</span>';
      return '<article class="gd-spot" style="border-top-color:' + e.color + '"><div class="lb">' + a.esc(i === 0 ? a.T('next-exam', 'Next exam') : a.T('then', 'Then')) + '<span>' + a.esc(a.fmt(e.date, { weekday: 'short', day: 'numeric', month: 'short' })) + '</span></div><div class="big">' + big + '</div>' +
        (e.title !== e.course ? '<small>' + a.esc(e.course) + '</small>' : '') + plan + (e.unsure ? '<small>' + a.esc(a.T('unsure-n2', 'You marked {{n}} topics unsure', { n: e.unsure })) + '</small>' : '') + '</article>';
    }).join('') + '</div>';
  }
  function helpBox(a, m) {
    var T = m.today;
    if (T.hideHelp) return '<p class="gd-muted" style="font-size:.84rem">' + a.esc(a.T('help-hidden', 'Exam help is hidden.')) + ' <button type="button" class="shq-btn ghost small" data-act="help-show">' + a.esc(a.T('show', 'Show')) + '</button></p>';
    var h = T.help;
    if (!h || (!h.cards.length && !h.invite)) return '';
    var cards = h.cards.map(function (c) {
      var lb = '<span class="lb">' + a.esc(c.course + ' · ' + c.when) + '</span>';
      if (c.type === 'tutor') {
        var t = c.tutor, facts = [t.stars != null ? '★ ' + t.stars + ' (' + t.reviews + ')' : a.T('new-tutor', 'New tutor · fewer than 3 reviews'), c.rateText ? a.T('per-h', '{{r}}/h', { r: c.rateText }) : null].filter(Boolean).join(' · ');
        return '<article class="gd-hc">' + lb + '<div class="who"><span class="av">' + a.esc(c.initials) + '</span><div><b>' + a.esc(t.name) + '</b><br><small>' + (t.verified ? '<span class="ok">✓ ' + a.esc(a.T('uni-verified', 'University verified')) + '</span> · ' : '') + a.esc(a.T('teaches-c', 'Teaches {{c}}', { c: t.course || c.course })) + '</small></div></div>' +
          (c.unsure.length ? '<p>' + a.esc(a.T('help-unsure', 'You marked {{t}} unsure. A second explanation can help.', { t: c.unsure.join(', ') })) + '</p>' : '') + '<small>' + a.esc(facts) + '</small><small>' + a.esc(a.T('pay-protected', 'Payment is protected until the session happens.')) + '</small>' +
          '<div class="acts"><a class="shq-btn ghost small" data-act="help-tutor" data-v="profile" href="' + c.profileHref + '">' + a.esc(a.T('view-profile', 'View profile')) + '</a><a class="shq-btn primary small" data-act="help-tutor" data-v="book" href="' + c.bookHref + '">' + a.esc(a.T('book-session', 'Book a session')) + '</a></div></article>';
      }
      return '<article class="gd-hc ask">' + lb + '<b>' + a.esc(c.requested ? a.T('req-sent', 'You asked for a {{c}} tutor', { c: c.course }) : a.T('no-tutor-yet', 'No {{c}} tutor yet', { c: c.course })) + '</b>' +
        '<p>' + a.esc(c.requested ? a.T('req-sent-p', 'We will tell you as soon as someone who teaches it joins. Your revision plan is the best next step meanwhile.') : a.T('ask-p', 'Ask for one and we will tell you when someone who teaches it joins.')) + '</p>' +
        (c.requested ? '' : '<a class="shq-btn primary small" style="justify-self:start" data-act="help-ask" href="' + c.requestHref + '">' + a.esc(a.T('ask-tutor', 'Ask for a tutor')) + '</a><small>' + a.esc(a.T('ask-note', 'Opens the request form on Find tutors. Tutors on UniSkilled can see requests.')) + '</small>') + '</article>';
    }).join('');
    var invite = h.invite ? '<div class="gd-invite"><span>🎓 ' + a.esc(a.T('invite', 'You finished {{c}}. Help other students with it and earn. You set your own price.', { c: h.invite.course })) + '</span><a class="shq-btn primary small" href="' + h.invite.href + '">' + a.esc(a.T('tutor-this', 'Tutor this course')) + '</a></div>' : '';
    return '<section class="gd-card gd-helpbox"><h2>' + a.esc(a.T('exam-help', 'Exam help')) + '<button type="button" data-act="help-hide">' + a.esc(a.T('hide-box', 'Hide this box')) + '</button></h2>' +
      '<p class="gd-muted" style="margin:-4px 0 12px;font-size:.84rem">' + a.esc(a.T('help-sub', 'For your next exams. A tutor is suggested only when one really teaches the course. We never guess how you are doing.')) + '</p>' +
      (cards ? '<div class="gd-helpgrid">' + cards + '</div>' : '') + invite + '<a class="gd-link" style="display:inline-block;margin-top:12px" href="find-tutors.html">' + a.esc(a.T('browse-tutors', 'Browse all tutors')) + ' →</a></section>';
  }
  function busyCard(a, B, withLink) {
    return '<section class="gd-card"><h2>' + a.esc(a.T('busy-weeks', 'Busy weeks ahead')) + (withLink ? '<a href="#/assignments">' + a.esc(a.T('all-deadlines', 'All deadlines')) + ' →</a>' : '') + '</h2>' +
      '<div class="gd-busy" role="img" aria-label="' + a.esc(B.note) + '">' + B.weeks.map(function (w, i) { return '<div class="' + (i === 0 ? 'now' : '') + (w.busy ? ' hot' : '') + '"><b>' + (w.points ? (Math.round(w.points * 10) / 10) : '') + '</b><i style="height:' + Math.max(4, w.pct * 0.62) + 'px"></i><small>' + a.esc(w.label) + '</small></div>'; }).join('') + '</div>' +
      '<p class="gd-muted" style="font-size:.84rem;margin-top:10px">' + a.esc(B.note) + '</p><p class="gd-muted" style="font-size:.74rem;margin-top:4px">' + a.esc(a.T('busy-key', 'Exams count 2, assignments 1, small tasks ½.')) + '</p></section>';
  }
  function overview(a, m) {
    var d = m.daily, T = m.today;
    // Review is already the first step of Do next, so the assistant does not repeat it here.
    var sugg = (d.suggestions || []).filter(function (x) { return x.k !== 'review'; });
    var line = T.left ? a.T(T.left === 1 ? 'one-thing' : 'n-things', T.left === 1 ? 'One thing to do today.' : '{{n}} things to do today.', { n: T.left }) : a.T('calm-day', 'Nothing urgent today. A good moment to get ahead.');
    var left = warningCard(a, T.warning) + catchUp(a, T.late) + planCard(a, m) + spotlight(a, T.spotlight) + helpBox(a, m) + courseTiles(a, m.courses);
    var right = (d.ready ? '<section class="gd-card"><h2>' + a.esc(a.T('today-classes', 'Today’s classes')) + '<a href="#/settings">' + a.esc(a.T('timetable', 'Timetable')) + ' →</a></h2>' + a.classesBlock(d) + '</section>' : '') +
      busyCard(a, T.busy, true) +
      (d.ready && sugg.length ? '<section class="gd-card"><h2>' + a.esc(a.T('assistant', 'Study assistant')) + '</h2><p class="gd-muted" style="font-size:.8rem;margin:-4px 0 10px">' + a.esc(a.T('assistant-sub', 'Uses only your notes and dates. Suggests, never acts without you.')) + '</p>' + a.suggestBlock({ ready: true, suggestions: sugg }, 3) + '</section>' : '') +
      (d.ready ? '<section class="gd-card"><h2>' + a.esc(a.T('this-week-rec', 'Your week so far')) + '<a href="#/progress">' + a.esc(a.T('your-plant', 'Your plant')) + ' →</a></h2>' + a.recordBlock(d.record) + '</section>' : coming(a, m.upcoming));
    return skyHero(a, m, line) + '<div style="height:18px"></div>' + a.storageNotice() + '<div class="gd-two"><div class="gd-grid">' + left + '</div><div class="gd-grid">' + right + '</div></div>';
  }
  function focus(a, f) {
    var top = '<div class="top"><span class="lbl">' + a.esc(a.T('focus-next-gd', 'Your next step')) + '</span><div class="times" role="group" aria-label="' + a.esc(a.T('time-free', 'Time you have now')) + '">' + a.timeChoices('shq-time') + '</div></div>';
    if (!f.pick) return '<section class="gd-focus">' + top + '<p class="empty">' + a.esc(f.message) + '</p>' + (f.state === 'no_items' ? '<div class="acts">' + a.addBtn('assignment', a.T('add-assignment', 'Add an assignment')) + '</div>' : '') + '</section>';
    var p = f.pick;
    var alts = f.alternates.map(function (x) { return '<div class="alt"><b>' + a.esc(x.type === 'exam_task' ? a.T('revise-topic', 'Revise {{t}}', { t: x.title }) : x.title) + '</b><small>' + a.esc([x.course, x.reasonTexts[0] && x.reasonTexts[0].text].filter(Boolean).join(' · ')) + '</small></div>'; }).join('') +
      f.heldRows.slice(0, 1).map(function (h) { return '<div class="alt wait"><b>' + a.esc(h.title) + '</b><small>' + a.esc(a.T('waiting-x', 'Waiting · {{w}}', { w: h.why })) + '</small></div>'; }).join('');
    return '<section class="gd-focus" aria-label="' + a.esc(a.T('focus-next', 'Focus next')) + '">' + top + '<h2>' + a.esc(p.headline) + '</h2><div class="meta">' + (p.course ? a.courseTag(p.course, p.courseKey) : '') + '<span>' + a.esc(p.what) + '</span><span>' + a.ic('clock', 14) + ' ' + a.esc(a.mins(p.minutes)) + '</span></div>' +
      '<div class="why">' + p.reasonTexts.map(function (r) { return '<span' + (r.risk ? ' class="risk"' : '') + '>' + a.esc(r.text) + '</span>'; }).join('') + '</div>' +
      '<div class="acts">' + a.focusActions(p) + '</div>' + (alts ? '<div class="alts">' + alts + '</div>' : '') + '</section>';
  }
  function week(a, m) {
    var days = a.weekEntries(m.week);
    var b = days.map(function (d, i) {
      var h = Math.min(100, Math.round(d.minutes / m.capacity * 100));
      var dots = '';
      if (d.entries.some(function (e) { return e.type === 'exam'; })) dots += '<i style="background:#c9805f"></i>';
      if (d.entries.some(function (e) { return e.type === 'due' && !e.done; })) dots += '<i style="background:#b89036"></i>';
      if (d.entries.some(function (e) { return e.type === 'lesson'; })) dots += '<i style="background:#4f8cc1"></i>';
      return '<div class="gd-bub' + (i === 0 ? ' today' : '') + '"><span class="wd">' + a.esc(i === 0 ? a.T('today', 'Today') : a.fmt(d.date, { weekday: 'short' })) + '</span><div class="ball' + (d.minutes > m.capacity ? ' over' : '') + '"><i style="height:' + h + '%"></i><b>' + d.date.getDate() + '</b></div><span class="m">' + (d.minutes ? a.esc(a.mins(d.minutes)) : '') + '</span><span class="dots">' + dots + '</span></div>';
    }).join('');
    return '<section class="gd-card"><h2>' + a.esc(a.T('your-week', 'Your week')) + '<a href="#/planner">' + a.esc(a.T('open-planner', 'Open planner')) + ' →</a></h2><div class="gd-bubbles">' + b + '</div>' +
      '<p class="gd-muted" style="font-size:.76rem;margin-top:12px">' + a.esc(a.T('bubble-key', 'Each circle fills with planned study, out of {{m}} a day. Dots: exam, deadline, lesson.', { m: a.mins(m.capacity) })) + '</p></section>';
  }
  function courseTiles(a, list) {
    return '<section><h2 class="gd-h2">' + a.esc(a.T('your-courses', 'Your courses')) + '<a class="gd-link" href="#/courses">' + a.esc(a.T('all-courses', 'All courses')) + ' →</a></h2>' +
      (list.length ? '<div class="gd-tiles">' + list.map(function (c) { return tile(a, c); }).join('') + '</div>' : '<div class="gd-empty">' + sprout() + '<b>' + a.esc(a.T('no-courses', 'Plant your first course')) + '</b>' + a.esc(a.T('no-courses-sub', 'Each course gets its own space for assignments, exams, notes and tutoring.')) + '<br><button type="button" class="shq-btn primary" data-act="add-course">' + a.esc(a.T('add-course', 'Add a course')) + '</button></div>') + '</section>';
  }
  function tlRow(a, e) {
    var icon = { due: 'flag', exam: 'exam', lesson: 'user' }[e.type];
    var when = e.late ? a.T('overdue', 'Overdue') : a.relDay(e.at) + (e.time ? ' · ' + a.fmtTime(e.at) : '');
    return '<div class="gd-tl-row"><span class="ic ' + (e.late ? 'exam' : e.type) + '">' + a.ic(icon, 18) + '</span><div><b>' + a.esc(e.title) + '</b><small>' + (e.type !== 'lesson' ? a.courseTag(e.course, e.key) : '') + (e.weight ? '<span>' + a.esc(a.T('weight', '{{n}}% of grade', { n: e.weight })) + '</span>' : '') + '</small></div><span class="when' + (e.late ? ' late' : '') + '">' + a.esc(when) + '</span></div>';
  }
  function coming(a, list) {
    return '<section class="gd-card"><h2>' + a.esc(a.T('coming-up', 'Coming up')) + '<a href="#/assignments">' + a.esc(a.T('all', 'All')) + ' →</a></h2><div class="gd-tl">' + (list.length ? list.slice(0, 6).map(function (e) { return tlRow(a, e); }).join('') : '<p class="gd-muted">' + a.esc(a.T('nothing-10', 'Nothing due in the next 10 days.')) + '</p>') + '</div></section>';
  }
  function help(a, rows) {
    if (!rows.length) return '<section class="gd-help"><h2>' + a.ic('leaf', 18) + a.esc(a.T('all-good', 'No tricky topics flagged')) + '</h2><p style="margin-top:0">' + a.esc(a.T('flag-hint', 'Mark a topic “unsure” in your revision plan and Study Campus will connect you with tutors for that course.')) + '</p></section>';
    return '<section class="gd-help"><h2>' + a.ic('leaf', 18) + a.esc(a.T('needs-help-gd', 'Topics a tutor could help with')) + '</h2>' + rows.slice(0, 3).map(function (r) {
      return '<div class="gd-help-row"><div><b>' + a.esc(r.topic) + '</b><small>' + a.esc(r.course + ' · ' + r.exam) + '</small></div><a class="shq-btn primary small" href="' + r.tutorHref + '">' + a.esc(a.T('find-tutor-short', 'Find a tutor')) + '</a></div>';
    }).join('') + '<p>' + a.esc(a.T('tutor-note', 'Tutors on the course page teach this course. Booking stays in your tutoring dashboard.')) + '</p></section>';
  }

  function courses(a, m) {
    var sugg = m.suggestions.length ? '<div class="gd-card" style="margin-bottom:18px"><h2 style="margin-bottom:10px">' + a.esc(a.T('from-lessons', 'From your lessons')) + '</h2><div style="display:flex;gap:8px;flex-wrap:wrap">' + m.suggestions.slice(0, 5).map(function (s) {
      return '<button type="button" class="shq-btn ghost small" data-act="follow" data-label="' + a.esc(s.label) + '">' + a.ic('plus', 13) + a.esc(s.label) + '</button>';
    }).join('') + '</div></div>' : '';
    return head(a, a.T('courses-title', 'Your courses'), a.esc(a.T('courses-sub', 'Every course has its own space for assignments, exams, notes and tutoring.')), '<button type="button" class="shq-btn primary" data-act="add-course">' + a.ic('plus', 15) + a.esc(a.T('add-course', 'Add a course')) + '</button>') +
      sugg + (m.courses.length ? '<div class="gd-tiles">' + m.courses.map(function (c) { return tile(a, c); }).join('') + '</div>' : '<div class="gd-empty">' + sprout() + '<b>' + a.esc(a.T('no-courses', 'Plant your first course')) + '</b></div>');
  }

  function topicChips(a, e) {
    var icon = { learned: '✓', unsure: '?', todo: '·' };
    var label = { learned: a.T('ts.learned', 'Learned'), unsure: a.T('ts.unsure', 'Unsure'), todo: a.T('ts.todo', 'To learn') };
    return '<div class="gd-topics">' + e.topics.map(function (t) { return '<span class="gd-topic ' + t.state + '" title="' + a.esc(label[t.state]) + '"><i aria-hidden="true">' + icon[t.state] + '</i>' + a.esc(t.topic) + '<span class="sr"> (' + a.esc(label[t.state]) + ')</span></span>'; }).join('') + '</div>';
  }
  function examCard(a, e, withCourse) {
    return '<div class="gd-examcard" style="--c:' + e.color + '"><div class="eh"><div style="display:flex;gap:14px;align-items:center"><div class="gd-cd"><div><b>' + Math.max(0, e.daysLeft) + '</b><small>' + a.esc(e.daysLeft === 1 ? a.T('day', 'day') : a.T('days', 'days')) + '</small></div></div><div><b>' + a.esc(e.title) + '</b><small>' + (withCourse ? a.esc(e.course) + ' · ' : '') + a.esc(a.fmt(e.date, { weekday: 'short', day: 'numeric', month: 'long' })) + '</small></div></div></div>' +
      (e.total ? '<div><div class="gd-capsule"><i style="width:' + e.pct + '%"></i></div><small class="gd-muted" style="font-size:.78rem;display:block;margin-top:6px">' + a.esc(a.T('plan-progress', '{{d}} of {{t}} revision tasks done', { d: e.done, t: e.total })) + '</small></div>' : '') +
      topicChips(a, e) + (e.dueNow.length ? '<div>' + e.dueNow.map(function (t) { return a.taskRow(t, null); }).join('') + '</div>' : '') +
      '</div>';
  }
  function course(a, m) {
    var p = m.p, dataCourse = ' data-course="' + a.esc(m.label) + '"';
    var h = '<section class="gd-chead" style="--c:' + m.color + '">' + ring(p.pct, m.color, 96, a.esc(p.pct == null ? a.T('no-work', 'No work yet') : a.T('pct-done', '{{n}}% done', { n: p.pct }))) +
      '<div><h1>' + a.esc(m.label) + '</h1><p class="sub">' + a.esc([m.followed ? a.T('in-courses', 'In your courses') : a.T('not-followed', 'Not in your course list yet'), a.S.profile.university].filter(Boolean).join(' · ')) + '</p>' +
      '<div class="gd-kpis"><span class="gd-kpi"><b>' + p.workDone + '/' + p.work + '</b>' + a.esc(a.T('work-done-s', 'tasks')) + '</span><span class="gd-kpi"><b>' + p.examDone + '/' + p.examTasks + '</b>' + a.esc(a.T('rev-done-s', 'revision')) + '</span><span class="gd-kpi"><b>' + p.lessonsDone + '</b>' + a.esc(p.lessonsDone === 1 ? a.T('lesson-1', 'lesson') : a.T('lessons-s', 'lessons')) + '</span>' + (p.unsure.length ? '<span class="gd-kpi" style="color:var(--sun)"><b>' + p.unsure.length + '</b>' + a.esc(a.T('to-strengthen', 'to strengthen')) + '</span>' : '') + '</div></div>' +
      '<div class="acts">' + (m.followed ? '' : '<button type="button" class="shq-btn ghost" data-act="follow" data-label="' + a.esc(m.label) + '">' + a.esc(a.T('add-to-courses', 'Add to my courses')) + '</button>') + a.addBtn('assignment', a.T('add-assignment', 'Add an assignment'), null, dataCourse) + '<a class="shq-btn ghost" href="' + m.tutorHref + '">' + a.esc(a.T('course-page', 'Course page & tutors')) + '</a></div></section><div style="height:22px"></div>' + a.storageNotice();
    var work = '<section class="gd-card"><h2>' + a.esc(a.T('work', 'To do for this course')) + (a.S.itemsReady ? '<button type="button" class="shq-btn ghost small" data-act="add" data-kind="task"' + dataCourse + '>' + a.ic('plus', 13) + a.esc(a.T('add-task', 'Task')) + '</button>' : '') + '</h2>' +
      (m.work.length ? m.work.map(function (i) { return a.itemRow(i, { hideCourse: true }); }).join('') : '<div class="gd-empty" style="padding:20px">' + sprout(44) + a.esc(a.T('no-work-c', 'Nothing to do here yet.')) + '</div>') + '</section>';
    var notes = '<section class="gd-card"><h2>' + a.esc(a.T('notes-res', 'Notes and links')) + (a.S.itemsReady ? '<button type="button" class="shq-btn ghost small" data-act="add" data-kind="resource"' + dataCourse + '>+ ' + a.esc(a.T('link-s', 'Link')) + '</button>' : '') + '</h2>' + '<div style="margin-bottom:12px">' + a.captureButtons(m.label) + '</div>' +
      (m.notes.length ? '<div class="gd-notes" style="columns:220px">' + m.notes.map(function (x) { return noteCard(a, x.n, x.url, m.color); }).join('') + '</div>' : '<p class="gd-muted">' + a.esc(a.T('no-notes-c', 'Keep what the lecturer stressed and links worth revisiting.')) + '</p>') + '</section>';
    var cls = m.classes.length ? '<p class="gd-muted" style="margin-top:10px;font-size:.84rem">' + a.esc(m.classes.map(function (c) { return ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][c.weekday - 1] + ' ' + c.start + (c.room ? ' · ' + c.room : ''); }).join('  ·  ')) + '</p>' : '';
    var exams = '<section class="gd-card"><h2>' + a.esc(a.T('exam-h', 'Exam')) + (m.followed && a.S.itemsReady ? '<button type="button" class="shq-btn ghost small" data-act="exam" data-id="' + a.esc(m.followId) + '">' + a.esc(m.examDate ? a.T('change-date', 'Change date') : a.T('set-exam', 'Set exam date')) + '</button>' : '') + '</h2>' +
      (m.exams.length ? m.exams.map(function (e) { return examCard(a, e, false); }).join('') : '<p class="gd-muted">' + a.esc(a.T('no-exam-d', 'No exam date yet. Add it and Quiz me questions for this course are brought forward before the exam.')) + '</p>') + cls + '</section>';
    var files = '<section class="gd-card"><h2>' + a.esc(a.T('files', 'Files')) + '</h2>' + a.filesBlock(m) + '</section>';
    var tutor = '<section class="gd-card"><h2>' + a.esc(a.T('tutoring', 'Tutoring')) + '</h2>' + (m.lessons.length ? m.lessons.slice(0, 4).map(function (l) {
      var ini = String(l.tutor).split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
      return '<div class="gd-lesson"><span class="av">' + a.esc(ini) + '</span><div><b>' + a.esc(l.tutor) + '</b><small>' + a.esc(l.at ? a.fmt(l.at, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + a.fmtTime(l.at) : '') + '</small></div><span class="tag ' + (l.done ? 'done' : 'up') + '">' + a.esc(l.done ? a.T('completed', 'Done') : a.T('upcoming', 'Upcoming')) + '</span></div>';
    }).join('') : '<p class="gd-muted">' + a.esc(a.T('no-lessons-c', 'No lessons for this course yet.')) + '</p>') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><a class="shq-btn primary small" href="' + m.tutorHref + '">' + a.esc(a.T('tutors-for', 'Tutors for this course')) + '</a><a class="shq-btn ghost small" href="' + m.searchHref + '">' + a.esc(a.T('search-tutors', 'Search all tutors')) + '</a></div></section>';
    h += '<div class="gd-two"><div class="gd-grid">' + notes + files + work + '</div><div class="gd-grid">' + exams + tutor + '</div></div>';
    if (m.followed) h += '<p style="margin-top:22px"><button type="button" class="shq-btn ghost small" data-act="unfollow" data-id="' + a.esc(m.followId) + '">' + a.esc(a.T('remove-course', 'Remove from my courses')) + '</button></p>';
    return h;
  }
  function noteCard(a, n, url, color) {
    return '<article class="gd-note" style="--c:' + (color || a.colorOf(a.keyOf(n))) + '"><h3>' + (n.kind === 'resource' ? a.ic('link', 16) : a.ic('note', 16)) + '<span>' + a.esc(n.title) + '</span></h3>' + (n.body ? '<p>' + a.esc(n.body) + '</p>' : '') +
      '<div class="foot">' + (url ? '<a class="url" href="' + a.esc(url.href) + '" target="_blank" rel="noopener noreferrer">' + a.esc(url.label) + ' ↗</a>' : (n.course_label ? a.courseTag(n.course_label, a.keyOf(n)) : '<span></span>')) + a.editBtn(n) + '</div></article>';
  }

  function planner(a, m) {
    var caps = [60, 90, 120, 180, 240, 300].map(function (x) { return '<option value="' + x + '"' + (m.capacity === x ? ' selected' : '') + '>' + a.esc(a.mins(x)) + '</option>'; }).join('');
    var h = head(a, m.label, a.esc(m.range + ' · ' + a.T('planner-sub', '{{t}} of study planned. Revision and lessons are added for you.', { t: a.mins(m.total) })), a.addBtn('task', a.T('add-task', 'Plan a task')));
    h += a.storageNotice() + '<div class="gd-tools"><div class="gd-seg" role="group" aria-label="' + a.esc(a.T('week-nav', 'Change week')) + '"><button type="button" data-act="week" data-v="-1" aria-label="' + a.esc(a.T('prev-week', 'Previous week')) + '">←</button><button type="button" data-act="week" data-v="0">' + a.esc(a.T('this-week', 'This week')) + '</button><button type="button" data-act="week" data-v="1" aria-label="' + a.esc(a.T('next-week', 'Next week')) + '">→</button></div>' +
      '<label class="gd-muted" style="font-size:.84rem;font-weight:700">' + a.esc(a.T('daily-cap-s', 'A normal day:')) + ' <select data-act="capacity">' + caps + '</select></label></div>';
    h += '<div class="gd-days">' + m.days.map(function (d) {
      var ev = d.entries.map(function (e) {
        var small = { exam: a.T('l.exam', 'Exam'), due: a.T('due', 'Due') + (e.time ? ' ' + e.time : ''), lesson: e.time, revision: a.T('revise', 'Revise'), planned: e.blocked ? a.T('st.blocked', 'Blocked') : a.mins(e.minutes || 30) }[e.type];
        var cls = 'gd-pillev ' + e.type + (e.done ? ' done' : '') + (e.blocked ? ' blocked' : '');
        var inner = '<i class="shq-dot" style="background:' + e.color + '"></i><span><small>' + a.esc(small) + '</small> ' + a.esc(e.title) + '</span>';
        if (e.type === 'revision') return '<button type="button" class="' + cls + '" style="--c:' + e.color + '" data-act="task-done" data-id="' + a.esc(e.id) + '" aria-pressed="' + !!e.done + '">' + inner + '</button>';
        if (e.type === 'planned') return '<button type="button" class="' + cls + '" style="--c:' + e.color + '" data-act="edit" data-id="' + a.esc(e.id) + '">' + inner + '</button>';
        return '<span class="' + cls + '" style="--c:' + e.color + '">' + inner + '</span>';
      }).join('');
      var over = d.minutes > m.capacity;
      return '<div class="gd-day' + (d.today ? ' today' : '') + '"><div class="date"><b>' + d.date.getDate() + '</b><small>' + a.esc(a.fmt(d.date, { weekday: 'short' })) + '</small></div><div class="gd-pills">' + (ev || '<span class="free">' + a.esc(a.T('free-day', 'A free day')) + '</span>') + '</div>' +
        '<div class="gd-meter' + (over ? ' over' : '') + '"><span>' + (d.minutes ? a.esc(a.mins(d.minutes)) + ' / ' + a.esc(a.mins(m.capacity)) : a.esc(a.T('nothing-planned', 'Nothing planned'))) + '</span><div class="cap"><i style="width:' + Math.min(100, Math.round(d.minutes / m.capacity * 100)) + '%"></i></div>' + (a.S.itemsReady ? '<button type="button" data-act="add" data-kind="task" data-date="' + d.iso + '">+ ' + a.esc(a.T('plan', 'Plan something')) + '</button>' : '') + '</div></div>';
    }).join('') + '</div>';
    if (m.unplanned.length) h += '<section class="gd-card" style="margin-top:22px"><h2>' + a.esc(a.T('unplanned', 'Not on a day yet')) + '</h2>' + m.unplanned.map(function (i) { return a.itemRow(i); }).join('') + '</section>';
    return h;
  }
  function filters(a, list, cur, act) {
    if (!list.length) return '';
    return '<div class="gd-filters" role="group" aria-label="' + a.esc(a.T('filter-course', 'Filter by course')) + '"><button type="button" data-act="' + act + '" data-v="all" aria-pressed="' + (cur === 'all') + '">' + a.esc(a.T('all', 'All')) + '</button>' +
      list.map(function (f) { return '<button type="button" data-act="' + act + '" data-v="' + a.esc(f.key) + '" aria-pressed="' + (cur === f.key) + '"><i class="shq-dot" style="background:' + f.color + '"></i>' + a.esc(f.label) + '</button>'; }).join('') + '</div>';
  }
  function dlRowHtml(a, r) {
    var acts = '';
    if (r.type === 'exam') {
      acts = '<a class="shq-btn ghost small" href="' + r.planHref + '">' + a.esc(r.plan ? a.T('open-plan-btn', 'Open revision plan') : a.T('make-plan-s', 'Make a plan')) + '</a>' +
        (r.courseId ? '<button type="button" class="shq-btn ghost small" data-act="exam" data-id="' + a.esc(r.courseId) + '">' + a.esc(a.T('change-date', 'Change date')) + '</button>' : '') +
        '<a class="shq-btn ghost small" data-act="help-ask" href="' + r.helpHref + '">' + a.esc(a.T('get-help', 'Get help')) + '</a>';
    } else if (r.late) {
      acts = '<button type="button" class="shq-btn primary small" data-act="move-tomorrow" data-id="' + a.esc(r.id) + '"' + a.storageOff() + '>' + a.esc(a.T('move-tomorrow', 'Move to tomorrow')) + '</button><button type="button" class="shq-btn ghost small" data-act="done" data-id="' + a.esc(r.id) + '"' + a.storageOff() + '>' + a.esc(a.T('handed-in', 'I handed it in')) + '</button>';
    } else {
      acts = a.editBtn(r.ref) + a.checkbox('done', r.id, false, a.T('mark-done', 'Mark “{{t}}” done', { t: r.title }), !a.S.itemsReady);
    }
    var sub = r.type === 'exam' ? r.meta.join(' · ') : r.startText;
    return '<article class="gd-dl ' + (r.type === 'exam' ? 't-exam' : 't-work') + (r.late ? ' late' : '') + '"><div class="d" aria-hidden="true"><small>' + a.esc(r.dateParts.wd) + '</small><b>' + r.dateParts.day + '</b><small>' + a.esc(r.dateParts.mon) + '</small></div>' +
      '<div class="b"><div class="l1"><span class="ty">' + a.esc(r.type === 'exam' ? a.T('exam-up', 'EXAM') : r.type === 'task' ? a.T('task-up', 'TASK') : a.T('asg-up', 'ASSIGNMENT')) + '</span><b>' + a.esc(r.title) + '</b>' + (r.course && r.course !== r.title ? a.courseTag(r.course, r.key) : '') + '</div>' +
      (r.type !== 'exam' && r.meta.length ? '<div class="m">' + a.esc(r.meta.join(' · ')) + '</div>' : '') + (sub ? '<div class="s">' + a.esc(sub) + '</div>' : '') +
      (r.type === 'exam' ? '<div class="acts" style="justify-content:flex-start;margin-top:8px">' + acts + '</div>' : '') + '</div>' +
      '<div class="r"><span class="w">' + a.esc(r.when) + '</span>' + (r.type === 'exam' ? '' : '<div class="acts">' + acts + '</div>') + '</div></article>';
  }
  function assignments(a, m) {
    var right = '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="shq-btn ghost" data-act="ics">' + a.ic('cal', 15) + a.esc(a.T('add-to-cal', 'Add all to my calendar')) + '</button><a class="shq-btn ghost" href="exam-planner.html">' + a.ic('plus', 15) + a.esc(a.T('add-exam-plan', 'Exam with a plan')) + '</a></div>';
    var h = head(a, a.T('dl-title', 'Exams & deadlines'), a.esc(a.T('dl-sub', 'Every exam and assignment from all your courses, in one list.')), right) + a.storageNotice();
    h += '<form class="gd-qa" data-form="qa" autocomplete="off"><label for="qaInput" class="sr">' + a.esc(a.T('qa-label', 'Add a deadline or exam in one line')) + '</label><input id="qaInput" type="text" maxlength="200" placeholder="' + a.esc(a.T('qa-ph', 'Add one: “EUS essay due 18 Dec 30%”')) + '"' + (a.S.itemsReady ? '' : ' disabled') + '><button type="submit" class="shq-btn primary"' + a.storageOff() + '>' + a.esc(a.T('add', 'Add')) + '</button><div id="qaPreview" aria-live="polite">' + a.qaPreview('') + '</div></form>';
    var types = [['all', a.T('all', 'All'), m.counts.all], ['exam', a.T('exams', 'Exams'), m.counts.exam], ['work', a.T('assignments', 'Assignments'), m.counts.work]];
    h += '<div class="gd-types" role="group" aria-label="' + a.esc(a.T('filter-type', 'Show')) + '">' + types.map(function (t) { return '<button type="button" data-act="dl-type" data-v="' + t[0] + '" aria-pressed="' + (m.type === t[0]) + '">' + a.esc(t[1]) + ' · ' + t[2] + '</button>'; }).join('') + '</div>' + filters(a, m.filters, m.filter, 'asg-filter');
    var list = m.groups.length ? m.groups.map(function (g) { return '<h3' + (g.key === 'overdue' ? ' class="red"' : '') + '>' + a.esc(g.name) + '</h3>' + g.rows.map(function (r) { return dlRowHtml(a, r); }).join(''); }).join('')
      : '<div class="gd-empty">' + sprout() + '<b>' + a.esc(a.T('no-dl', 'No deadlines yet')) + '</b>' + a.esc(a.T('no-dl-sub', 'Type one in the box above, in your own words. Exams from the Exam planner and your courses appear here on their own.')) + '</div>';
    if (m.oldOverdue) list += '<p class="gd-muted" style="font-size:.82rem;margin-top:8px">' + a.esc(a.T('old-overdue', '{{n}} older items are more than 30 days late and hidden here. Find them under Courses.', { n: m.oldOverdue })) + '</p>';
    if (m.nodate.length) list += '<h3>' + a.esc(a.T('g.nodate', 'No due date')) + '</h3><section class="gd-card">' + m.nodate.map(function (i) { return a.itemRow(i); }).join('') + '</section>';
    if (m.done.length) list += '<details style="margin-top:14px"><summary class="gd-muted" style="cursor:pointer;font-weight:700">' + a.esc(a.T('g.done-recent', 'Done recently')) + ' (' + m.done.length + ')</summary><section class="gd-card" style="margin-top:8px">' + m.done.map(function (i) { return a.itemRow(i); }).join('') + '</section></details>';
    var side = busyCard(a, m.busy, false) + '<section class="gd-card"><h2>' + a.esc(a.T('how-helps', 'How this list helps')) + '</h2><div class="gd-howto">' +
      '<div><b>' + a.esc(a.T('h1', 'Start-by dates.')) + '</b> ' + a.esc(a.T('h1s', 'Each assignment shows when to start, from your time estimate.')) + '</div>' +
      '<div><b>' + a.esc(a.T('h2', 'Exam countdowns.')) + '</b> ' + a.esc(a.T('h2s', 'Linked to your revision plan in the Exam planner.')) + '</div>' +
      '<div><b>' + a.esc(a.T('h3', 'In your calendar.')) + '</b> ' + a.esc(a.T('h3s', 'One button adds every date, so your phone reminds you the day before.')) + '</div>' +
      '<div><b>' + a.esc(a.T('h4', 'Nothing shaming.')) + '</b> ' + a.esc(a.T('h4s', 'A missed date gets a “move” button, not red warnings.')) + '</div></div></section>';
    return h + '<div class="gd-two"><div class="gd-dlg">' + list + '</div><div class="gd-grid">' + side + '</div></div>';
  }
  function exams(a, m) {
    var h = head(a, a.T('exams-title', 'Exams'), a.esc(a.T('exams-sub', 'Exams and revision plans come from your Exam planner, so nothing is entered twice.')), '<a class="shq-btn primary" href="exam-planner.html">' + a.ic('plus', 15) + a.esc(a.T('add-exam', 'Add an exam')) + '</a>');
    if (!m.upcoming.length) h += '<div class="gd-empty">' + sprout() + '<b>' + a.esc(a.T('no-exams', 'No upcoming exams')) + '</b>' + a.esc(a.T('no-exams-sub', 'Add one in the Exam planner to get a gentle day-by-day revision plan.')) + '</div>';
    h += '<div class="gd-examgrid">' + m.upcoming.map(function (e) { return '<section class="gd-card" style="padding:16px">' + examCard(a, e, true) + '</section>'; }).join('') + '</div>';
    if (m.past.length) h += '<section class="gd-card" style="margin-top:22px"><h2>' + a.esc(a.T('past-exams', 'Past exams')) + '</h2>' + m.past.map(function (e) { return '<div class="gd-lesson"><span class="av" style="background:var(--bg);color:var(--muted)">' + a.ic('tick', 16) + '</span><div><b>' + a.esc(e.title) + '</b><small>' + a.esc(e.course + ' · ' + a.fmt(e.date, { day: 'numeric', month: 'short', year: 'numeric' })) + '</small></div></div>'; }).join('') + '</section>';
    return h;
  }
  function notes(a, m) {
    var acts = '<div style="display:flex;gap:8px;flex-wrap:wrap">' + a.addBtn('note', a.T('add-note', 'New note')) + '<button type="button" class="shq-btn ghost" data-act="add" data-kind="resource"' + a.storageOff() + '>' + a.ic('link', 15) + a.esc(a.T('add-link', 'Save a link')) + '</button></div>';
    var h = head(a, a.T('notes-title', 'Notes & resources'), a.esc(a.T('notes-sub', 'Your notes and favourite explanations, sorted by course.')), acts) + a.storageNotice() + filters(a, m.filters, m.filter, 'note-filter');
    return h + (m.list.length ? '<div class="gd-notes">' + m.list.map(function (x) { return noteCard(a, x.n, x.url, x.color); }).join('') + '</div>' : '<div class="gd-empty">' + sprout() + '<b>' + a.esc(a.T('no-notes', 'No notes yet')) + '</b>' + a.esc(a.T('no-notes-sub', 'Write down what the lecturer stressed, or save the link to a good explanation.')) + '</div>');
  }

  /* The study plant: one leaf for each day this week with a review, a flower from five days.
     Starts fresh every Monday; it only grows, never wilts. Alive over time: leaves unfold one by
     one, it sways gently, rustles when tapped and gets a little water on days with a review.
     Pure SVG + CSS; no motion with reduced-motion. */
  function plant(a, rec) {
    var n = Math.min(7, rec.reviewDays || 0), base = 104, len = n ? 18 + n * 11 : 0, top = base - len;
    var todayIdx = (new Date().getDay() + 6) % 7, wateredToday = rec.days[todayIdx] && rec.days[todayIdx].cards > 0;
    var bend = 6;                                             // the stem leans a little, like a real seedling
    function xAt(y) { var t = len ? (base - y) / len : 0; return 80 + bend * t * t; }
    var stem = n ? '<path class="gd-stem" d="M80 ' + base + ' Q' + (80 + bend * 0.2) + ' ' + (base - len * 0.55) + ' ' + xAt(top) + ' ' + top + '" stroke="url(#gdpStem)" stroke-width="' + (2.2 + n * 0.25) + '" stroke-linecap="round" fill="none"/>' : '';
    var leaves = '';
    for (var i = 0; i < n; i++) {
      var y = base - 14 - i * (len - 14) / Math.max(1, n), left = i % 2 === 0, size = 1.15 - i * 0.08, x = xAt(y);
      var rot = left ? 'scale(-1,1) rotate(-28)' : 'rotate(-28)';
      leaves += '<g transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"><g class="gd-leaf' + (i === n - 1 && wateredToday ? ' gd-new' : '') + '" style="--d:' + (300 + i * 140) + 'ms;transform-origin:0 0"><g transform="' + rot + ' scale(' + size.toFixed(2) + ')">' +
        '<path d="M0 0 C7 -10 21 -11 31 -1 C22 6 9 7 0 0Z" fill="url(#gdpLeaf' + (i % 2) + ')"/>' +
        '<path d="M1 0 C10 -2 20 -2 29 -1" stroke="#e9f5d8" stroke-width=".7" fill="none" opacity=".8"/>' +
        '<path d="M10 -1.4 l4 -4 M16 -1.5 l4 -4 M13 -1.3 l3 3 M19 -1.2 l3 3" stroke="#e9f5d8" stroke-width=".45" opacity=".55"/></g></g></g>';
    }
    var flower = '';
    if (n >= 5) {
      var fx = xAt(top), fy = top - 2, pet = '';
      for (var k = 0; k < 6; k++) pet += '<ellipse cx="' + fx + '" cy="' + (fy - 6.5) + '" rx="3.6" ry="6.5" fill="url(#gdpPetal)" transform="rotate(' + (k * 60) + ' ' + fx + ' ' + fy + ')"/>';
      flower = '<g class="gd-leaf gd-flower" style="--d:' + (300 + n * 140) + 'ms">' + pet + '<circle cx="' + fx + '" cy="' + fy + '" r="3.4" fill="#F2B544"/><circle cx="' + (fx - 1) + '" cy="' + (fy - 1) + '" r="1.2" fill="#FBE3A3"/></g>';
    }
    var bud = n && n < 5 ? '<ellipse class="gd-leaf" style="--d:' + (300 + n * 140) + 'ms" cx="' + xAt(top) + '" cy="' + (top - 1.5) + '" rx="2.6" ry="3.6" fill="#7FB04A"/>' : '';
    var sprout = n ? '' : '<path d="M80 101 q-1 -5 -5 -7 q4 0 5 4 q1 -5 6 -6 q-3 3 -6 9" fill="#8DBE57"/>';
    var drops = wateredToday ? '<g class="gd-drops"><path d="M58 40 q3 5 0 7 q-3 -2 0 -7Z"/><path d="M102 30 q3 5 0 7 q-3 -2 0 -7Z"/><path d="M90 52 q2.4 4 0 5.6 q-2.4 -1.6 0 -5.6Z"/></g>' : '';
    var vbTop = Math.min(50, top - 22);
    var defs = '<defs>' +
      '<linearGradient id="gdpPot" x1="0" x2="1"><stop offset="0" stop-color="#B9532B"/><stop offset=".45" stop-color="#DC7448"/><stop offset="1" stop-color="#A24624"/></linearGradient>' +
      '<linearGradient id="gdpRim" x1="0" x2="1"><stop offset="0" stop-color="#C86440"/><stop offset=".5" stop-color="#EE9468"/><stop offset="1" stop-color="#B85733"/></linearGradient>' +
      '<radialGradient id="gdpSoil" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#6B4A35"/><stop offset="1" stop-color="#3F2A1E"/></radialGradient>' +
      '<linearGradient id="gdpStem" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#4E7A2A"/><stop offset="1" stop-color="#7FB04A"/></linearGradient>' +
      '<linearGradient id="gdpLeaf0" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4F8A2B"/><stop offset=".6" stop-color="#77B243"/><stop offset="1" stop-color="#A6D46F"/></linearGradient>' +
      '<linearGradient id="gdpLeaf1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#44792A"/><stop offset=".6" stop-color="#689F3A"/><stop offset="1" stop-color="#93C65E"/></linearGradient>' +
      '<radialGradient id="gdpPetal" cx=".5" cy=".9" r=".9"><stop offset="0" stop-color="#F7C7D6"/><stop offset="1" stop-color="#E0789C"/></radialGradient>' +
      '<radialGradient id="gdpShadow"><stop offset="0" stop-color="#2c3a1f" stop-opacity=".28"/><stop offset="1" stop-color="#2c3a1f" stop-opacity="0"/></radialGradient></defs>';
    var pot = '<ellipse cx="80" cy="131" rx="36" ry="6" fill="url(#gdpShadow)"/>' +
      '<path d="M60 106 L100 106 L95 129 Q80 133 65 129Z" fill="url(#gdpPot)"/>' +
      '<path d="M66 112 L70 127" stroke="#F3A77F" stroke-width="1.4" stroke-linecap="round" opacity=".45"/>' +
      '<rect x="57" y="100" width="46" height="8" rx="2.5" fill="url(#gdpRim)"/>' +
      '<ellipse cx="80" cy="102.6" rx="20" ry="2.6" fill="url(#gdpSoil)"/>';
    var wd = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    var dots = rec.days.map(function (d, i) { return '<span class="gd-pday' + (d.cards > 0 ? ' on' : '') + (d.future ? ' fut' : '') + '" title="' + a.esc(wd[i]) + '">' + a.esc(wd[i]) + '</span>'; }).join('');
    var say = n === 0 ? a.T('plant-0', 'Review on any day this week and your plant grows its first leaf.')
      : n >= 5 ? a.T('plant-flower', 'It’s flowering: {{n}} review days this week.', { n: n })
      : a.T('plant-n', '{{n}} review days this week. Five days and it flowers.', { n: n });
    return '<div class="gd-plant"><button type="button" class="gd-plantbtn" data-act="plant-rustle" aria-label="' + a.esc(a.T('plant-aria', 'Study plant with {{n}} leaves', { n: n })) + '">' +
      '<svg viewBox="0 ' + vbTop + ' 160 ' + (138 - vbTop) + '" aria-hidden="true">' + defs + drops + pot +
      '<g class="gd-sway">' + sprout + stem + leaves + bud + flower + '</g></svg></button>' +
      '<div class="gd-pdays">' + dots + '</div><p>' + a.esc(say) + '</p><small>' + a.esc(a.T('plant-fresh', 'A new plant every Monday.')) + '</small></div>';
  }
  function weekWord(a, x, y) {
    if (x > y) return a.T('pr-more', '{{n}} more than last week', { n: x - y });
    if (x < y) return a.T('pr-fewer', '{{n}} fewer than last week', { n: y - x });
    return a.T('pr-same', 'Same as last week');
  }
  function prodBlock(a, p) {
    var t = p.thisWeek, l = p.lastWeek, max = Math.max(1, Math.max.apply(null, t.days.concat(l.days)));
    var dn = [a.T('d.mo', 'M'), a.T('d.tu', 'T'), a.T('d.we', 'W'), a.T('d.th', 'T'), a.T('d.fr', 'F'), a.T('d.sa', 'S'), a.T('d.su', 'S')];
    var bars = '<div class="gd-pbars" role="img" aria-label="' + a.esc(a.T('pr-bars-l', 'Things done each day this week')) + '">' + t.days.map(function (n, i) {
      var cls = i === p.dayOfWeek ? ' today' : i > p.dayOfWeek ? ' later' : '';
      return '<div class="gd-pbar' + cls + '"><span><i style="height:' + (i > p.dayOfWeek ? 0 : Math.max(n ? 12 : 4, Math.round(n / max * 100))) + '%"></i></span><b>' + (i > p.dayOfWeek ? '' : n) + '</b><small>' + a.esc(dn[i]) + '</small></div>';
    }).join('') + '</div>';
    function stat(ic, cls, big, label, sub) { return '<div class="gd-pstat ' + cls + '"><span class="ic">' + a.ic(ic, 18) + '</span><b>' + big + '</b><span class="lb">' + a.esc(label) + '</span><small>' + a.esc(sub) + '</small></div>'; }
    var h = '<section class="gd-card gd-prod"><div class="gd-prod-h"><div><h2>' + a.esc(a.T('pr-h', 'This week')) + '</h2><p class="gd-muted">' + a.esc(a.T('pr-sub', 'Monday to today, next to last week. Counted only from what you did here.')) + '</p></div></div>';
    if (p.empty) return h + '<p class="gd-prod-empty">' + a.esc(a.T('pr-empty', 'Your week starts here. Tick off a task, write a note or answer a few Quiz me questions, and it shows up here.')) + '</p></section>';
    h += '<div class="gd-prod-grid"><div class="gd-pstats">' +
      stat('check', 'g', t.done, a.T('pr-done', 'Tasks done'), weekWord(a, t.done, l.done)) +
      stat('flag', 's', t.due ? a.T('pr-ontime-n', '{{a}} of {{b}}', { a: t.onTime, b: t.due }) : '–', a.T('pr-ontime', 'Deadlines met on time'), t.due ? (t.onTime === t.due ? a.T('pr-all-on', 'All on time') : a.T('pr-some-late', '{{n}} handed in late or still open', { n: t.due - t.onTime })) : a.T('pr-no-due', 'No deadlines so far this week')) +
      stat('cal', 'k', a.T('pr-days-n', '{{n}} of {{d}}', { n: t.studyDays, d: p.dayOfWeek + 1 }), a.T('pr-days', 'Days you studied'), weekWord(a, t.studyDays, l.studyDays)) +
      stat('brain', 'l', t.quiz, a.T('pr-quiz', 'Quiz me questions answered'), weekWord(a, t.quiz, l.quiz)) +
      '</div>' + bars + '</div></section>';
    return h;
  }
  function doneRow(a, e) {
    var ic = { task: 'check', assignment: 'check', achievement: 'star', research: 'search', plan: 'flag', lesson: 'cap' }[e.type] || 'check';
    var src = e.source === 'self' ? a.T('src-self', 'Added by you') : e.source === 'record' ? a.T('src-record', 'UniSkilled lesson') : e.type === 'assignment' ? (e.onTime ? a.T('src-ontime', 'On time') : a.T('src-late', 'Handed in late')) : e.type === 'plan' ? a.T('src-plan', 'Revision plan finished') : e.type === 'research' ? a.T('src-research', 'Research finished') : a.T('src-ticked', 'Ticked off');
    var title = e.type === 'lesson' ? a.T('lesson-t', 'Tutoring lesson: {{s}}', { s: e.title || '' }) : e.title;
    return '<div class="gd-done-row ' + e.type + '"><span class="ic">' + a.ic(ic, 17) + '</span><div><b>' + a.esc(title) + '</b><small>' + (e.course ? '<i class="shq-dot" style="background:' + e.color + '"></i>' + a.esc(e.course) + ' · ' : '') + '<span class="src' + (e.onTime === false ? ' late' : '') + '">' + a.esc(src) + '</span></small></div><span class="when">' + a.esc(e.when) + '</span>' +
      (e.edit ? '<button type="button" class="gd-iconbtn" data-act="edit" data-id="' + a.esc(e.edit) + '" aria-label="' + a.esc(a.T('edit', 'Edit')) + '">' + a.ic('edit', 15) + '</button>' : '') + '</div>';
  }
  function progress(a, m) {
    var h = head(a, a.T('prog-title', 'My progress'), a.esc(a.T('prog-sub', 'What you got done and what you are researching. Private to you: no scores, no comparisons with others.')), m.daily.ready ? '<button type="button" class="shq-btn ghost" data-act="reflect">' + a.ic('leaf', 15) + a.esc(a.T('reflect-btn', 'Reflect on this week')) + '</button>' : '');
    h += prodBlock(a, m.prod);
    var wk = m.done.filter(function (e) { return e.thisWeek; }), older = m.done.filter(function (e) { return !e.thisWeek; });
    h += '<div class="gd-two gd-acc" style="margin:22px 0">' +
      '<section class="gd-card"><div class="gd-card-h"><h2>' + a.esc(a.T('acc-h', 'What I accomplished')) + '</h2>' + a.addBtn('achievement', a.T('acc-add', 'Add something I did'), 'shq-btn ghost small') + '</div>' +
      (m.done.length ? (wk.length ? '<h3 class="gd-sub-h">' + a.esc(a.T('acc-week', 'This week')) + '</h3>' + wk.map(function (e) { return doneRow(a, e); }).join('') : '') +
        (older.length ? '<h3 class="gd-sub-h">' + a.esc(a.T('acc-earlier', 'Earlier')) + '</h3>' + older.slice(0, 6).map(function (e) { return doneRow(a, e); }).join('') +
          (older.length > 6 ? '<details class="gd-more-done"><summary>' + a.esc(a.T('acc-all', 'Show {{n}} more', { n: older.length - 6 })) + '</summary>' + older.slice(6).map(function (e) { return doneRow(a, e); }).join('') + '</details>' : '') : '')
        : '<p class="gd-muted">' + a.esc(a.T('acc-empty', 'Finished tasks, deadlines and revision plans collect here. You can also add things you did outside Study Campus, like a presentation or a lab report.')) + '</p>') +
      '</section>' +
      '<section class="gd-card"><div class="gd-card-h"><h2>' + a.esc(a.T('rs-h', 'My research')) + '</h2>' + a.addBtn('research', a.T('rs-add', 'Add research'), 'shq-btn ghost small') + '</div>' +
      (m.research.length ? m.research.map(function (r) {
        return '<button type="button" class="gd-rs-row" data-act="edit" data-id="' + a.esc(r.id) + '"><span class="ic">' + a.ic('search', 17) + '</span><span class="tx"><b>' + a.esc(r.title) + '</b><small>' + (r.course ? '<i class="shq-dot" style="background:' + r.color + '"></i>' + a.esc(r.course) + ' · ' : '') + a.esc(r.sources === 1 ? a.T('rs-src1', '1 source') : a.T('rs-srcn', '{{n}} sources', { n: r.sources })) + '</small></span><span class="gd-rs-st' + (r.done ? ' done' : '') + '">' + a.esc(r.done ? a.T('rs.done', 'Finished') : a.T('rs.open', 'Working on it')) + '</span></button>';
      }).join('') : '<p class="gd-muted">' + a.esc(a.T('rs-empty', 'Keep each research topic in one place: the question, your sources and what you found. Good for essays, theses and lab reports.')) + '</p>') +
      '</section></div>';
    h += a.storageNotice();
    var lr = m.daily.lastReflection;
    h += '<div class="gd-two" style="margin-bottom:22px"><section class="gd-card"><h2>' + a.esc(a.T('your-plant', 'Your study plant')) + '</h2>' + plant(a, m.daily.record) + '</section><section class="gd-card"><h2>' + a.esc(a.T('learning-week', 'Learning this week')) + '</h2>' + a.recordBlock(m.daily.record) + '</section></div>' +
      '<div class="gd-two" style="margin-bottom:22px">' +
      '<section class="gd-card"><h2>' + a.esc(a.T('last-reflect', 'Your last reflection')) + '</h2>' + (lr ? '<dl class="gd-rf"><dt>' + a.esc(a.T('rf.went', 'What went well?')) + '</dt><dd>' + a.esc(lr.went || '–') + '</dd><dt>' + a.esc(a.T('rf.stuck', 'What is still stuck?')) + '</dt><dd>' + a.esc(lr.stuck || '–') + '</dd><dt>' + a.esc(a.T('rf.aim', 'One aim for next week')) + '</dt><dd>' + a.esc(lr.aim || '–') + '</dd></dl>' : '<p class="gd-muted">' + a.esc(a.T('no-reflect', 'Nothing yet. Three questions at the end of each week, private to you.')) + '</p>') + '</section></div>';
    h += '<div class="gd-two"><section class="gd-card"><h2>' + a.esc(a.T('by-course-week', 'This week, course by course')) + '</h2>' + (m.weekRows.length ? '<div class="gd-wk">' + m.weekRows.map(function (r) {
      return '<div class="gd-wkrow' + (r.quiet ? ' quiet' : '') + '" style="--c:' + r.color + '"><a href="' + r.href + '"><i class="shq-dot" style="background:' + r.color + '"></i>' + a.esc(r.label) + '</a><span>' + a.esc(a.T('wk-line', '{{n}} notes · {{f}} files · {{c}} quiz questions', { n: r.notes, f: r.files, c: r.cards })) + '</span>' + (r.quiet ? '<small>' + a.esc(a.T('wk-quiet', 'Nothing captured yet this week')) + '</small>' : '') + '</div>';
    }).join('') + '</div>' : '<p class="gd-muted">' + a.esc(a.T('no-courses-s', 'No courses yet.')) + '</p>') + '</section>' +
      '<section class="gd-card"><h2>' + a.esc(a.T('next-14', 'Next two weeks')) + '</h2><div class="gd-tl">' + (m.next.length ? m.next.slice(0, 8).map(function (e) { return tlRow(a, e); }).join('') : '<p class="gd-muted">' + a.esc(a.T('nothing-14', 'Nothing due in the next two weeks.')) + '</p>') + '</div></section></div>';
    return h;
  }
  function notFound(a) { return head(a, a.T('not-found', 'Course not found'), a.esc(a.T('not-found-sub', 'This course is not in your Study Campus.'))) + '<a class="shq-btn ghost" href="#/courses">' + a.esc(a.T('back-courses', 'Back to courses')) + '</a>'; }

  window.StudyHQSkins = window.StudyHQSkins || {};
  window.StudyHQSkins.garden = { id: 'garden', name: 'Study Garden', palette: PALETTE, css: css, shell: shell,
    views: { overview: overview, courses: courses, course: course, planner: planner, assignments: assignments, exams: exams, notes: notes, progress: progress, notFound: notFound } };
})();
