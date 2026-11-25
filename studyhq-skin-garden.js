/* Study HQ design B — Study Garden.
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
.gd-plant{display:grid;justify-items:center;gap:8px;text-align:center}.gd-plant svg{width:min(260px,80%);height:auto;max-height:240px}.gd-plant p{font-size:.9rem;color:var(--d-ink2);max-width:300px}.gd-plant small{font-size:.76rem;color:var(--d-muted)}
.gd-pdays{display:flex;gap:6px}.gd-pday{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:.68rem;font-weight:800;background:#f1f2ec;color:#8a8f84}.gd-pday.on{background:#C0DD97;color:#27500A}.gd-pday.fut{opacity:.55}
.gd-stem{transform-origin:80px 102px;animation:gdGrow .7s cubic-bezier(.2,.8,.2,1) both}.gd-leaf{transform-box:fill-box;transform-origin:center;animation:gdLeaf .45s cubic-bezier(.2,.8,.2,1.3) both;animation-delay:calc(var(--d) + 250ms)}
@keyframes gdGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}@keyframes gdLeaf{from{transform:scale(0)}to{transform:scale(1)}}
@media(prefers-reduced-motion:reduce){.gd-stem,.gd-leaf{animation:none}}
.gd-wk{display:grid;gap:10px}.gd-wkrow{display:grid;gap:2px;padding:10px 12px;border-radius:14px;background:#f7f8f3;border-left:4px solid var(--c)}.gd-wkrow a{font-weight:800;color:var(--d-ink);text-decoration:none;display:flex;gap:8px;align-items:center}.gd-wkrow span{font-size:.84rem;color:var(--d-ink2)}.gd-wkrow small{font-size:.78rem;color:#9a6b1f;font-weight:700}
.gd-capside{width:100%;justify-content:center;margin:0 0 14px}
.gd-rf{display:grid;gap:4px;font-size:.88rem}.gd-rf dt{font-weight:800;color:var(--d-ink);margin-top:8px}.gd-rf dt:first-child{margin-top:0}.gd-rf dd{color:var(--d-ink2);line-height:1.5}
body[data-concept="garden"] .shq-learn{padding:4px 0}
body[data-concept="garden"] .shq-d-card,body[data-concept="garden"] .shq-d-concepts .cx,body[data-concept="garden"] .shq-d-hits li{box-shadow:0 1px 2px rgba(37,48,43,.05)}
.gd{--bg:#f4f3ec;--card:#fff;--ink:#25302b;--ink2:#3d4a43;--muted:#5c6761;--line:#e4e5db;--sage:#3f6e55;--sage2:#7fa58c;--sage-l:#e6efe7;--lav:#5b4a9e;--lav2:#9c8fd6;--lav-l:#efebfa;--sky:#2c6e9e;--sky-l:#e3eff8;--peach:#b35f3e;--peach-l:#fbece4;--sun:#8a6412;--sun-l:#fbf1d9;--r:22px}
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
.gd-nav a[aria-current="page"] .ib{background:var(--sage);color:#fff}
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
  .gd-tabbar{display:flex;position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:900;background:rgba(255,255,255,.96);backdrop-filter:blur(10px);border-radius:24px;box-shadow:0 14px 40px -12px rgba(37,48,43,.35);padding:6px;justify-content:space-around}
  .gd-tabbar a,.gd-tabbar summary{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:.68rem;font-weight:800;color:var(--muted);text-decoration:none;padding:6px 8px;border-radius:16px;min-width:58px;cursor:pointer;list-style:none}
  .gd-tabbar summary::-webkit-details-marker{display:none}
  .gd-tabbar .gd-cap{width:54px;height:54px;margin-top:-18px;border-radius:50%;border:0;background:var(--sage);color:#fff;display:grid;place-items:center;box-shadow:0 10px 24px -8px rgba(63,110,85,.7);cursor:pointer;flex:none}
  .gd-tabbar a[aria-current="page"],.gd-tabbar details.cur summary{color:var(--sage);background:var(--sage-l)}
  .gd-tabbar details{position:relative}
  .gd-more{position:absolute;bottom:62px;right:0;background:#fff;border-radius:18px;box-shadow:0 14px 40px -12px rgba(37,48,43,.4);padding:8px;min-width:190px;display:flex;flex-direction:column}
  .gd-more a{flex-direction:row;font-size:.88rem;color:var(--ink2);gap:10px;justify-content:flex-start;padding:10px 12px}
}
.gd-mobilehead{display:none}
@media(max-width:980px){.gd-mobilehead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}.gd-mobilehead b{font-size:1rem;font-weight:800;display:flex;align-items:center;gap:8px}.gd-mobilehead .gd-logo{width:30px;height:30px;border-radius:10px}}
/* atoms */
.gd .shq-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:0 20px;border-radius:999px;font-size:.88rem;font-weight:800;text-decoration:none;cursor:pointer;border:0;background:none;white-space:nowrap}
.gd .shq-btn.primary{background:var(--sage);color:#fff;box-shadow:0 8px 18px -10px rgba(63,110,85,.9)}.gd .shq-btn.primary:hover{background:#355d48}
.gd .shq-btn.ghost{background:var(--bg);color:var(--ink2)}.gd .shq-btn.ghost:hover{background:#ebeae1}
.gd .shq-btn.soft{background:#fff;color:var(--lav)}
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
.gd .shq-check{width:28px;height:28px;border-radius:10px;border:2px solid #c9cfc6;background:#fff;display:grid;place-items:center;flex-shrink:0;cursor:pointer;color:#fff;transition:background .15s}
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
.gd .shq-status{border:0;border-radius:999px;padding:6px 10px;font-size:.76rem;font-weight:800;background:#fff;color:var(--ink2);cursor:pointer;min-height:32px}
.gd .shq-icon{width:36px;height:36px;border:0;border-radius:12px;background:none;color:var(--muted);cursor:pointer;display:grid;place-items:center}
.gd .shq-icon:hover{background:#fff;color:var(--ink)}
.gd .shq-time{border:0;background:rgba(255,255,255,.6);color:var(--lav);font-size:.8rem;font-weight:800;padding:8px 14px;border-radius:999px;cursor:pointer;min-height:36px}
.gd .shq-time[aria-pressed="true"]{background:var(--lav);color:#fff}
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
.gd-chip{background:rgba(255,255,255,.75);border-radius:999px;padding:7px 14px;font-size:.8rem;font-weight:800;color:var(--ink2);display:inline-flex;gap:6px;align-items:center}
.gd-chip b{font-size:.95rem;color:var(--ink)}
.gd-termring{display:flex;gap:14px;align-items:center;background:rgba(255,255,255,.7);border-radius:24px;padding:14px 18px}
.gd-termring b{display:block;font-size:.95rem}
.gd-termring small{display:block;font-size:.78rem;color:var(--ink2)}
.gd-focus{background:linear-gradient(160deg,#efebfa,#f6f3fc);border-radius:28px;padding:26px 28px;position:relative;overflow:hidden}
.gd-focus .lbl{font-size:.74rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--lav)}
.gd-focus .top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}
.gd-focus .times{display:flex;gap:6px;flex-wrap:wrap}
.gd-focus h2{font-size:clamp(1.35rem,2.4vw,1.75rem);font-weight:800;letter-spacing:-.02em;line-height:1.25;margin:16px 0 8px}
.gd-focus .meta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:.85rem;color:var(--ink2)}
.gd-focus .why{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}
.gd-focus .why span{background:#fff;color:var(--lav);font-size:.76rem;font-weight:800;padding:5px 11px;border-radius:999px}
.gd-focus .why span.risk{background:var(--peach-l);color:var(--peach)}
.gd-focus .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}
.gd-focus .acts .shq-btn.primary{background:var(--lav);box-shadow:0 10px 20px -12px rgba(91,74,158,.9)}
.gd-focus .acts .shq-btn.primary:hover{background:#4a3b88}
.gd-focus .acts .shq-btn.ghost{background:#fff;color:var(--lav)}
.gd-focus .alts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:20px}
.gd-focus .alt{background:rgba(255,255,255,.75);border-radius:16px;padding:12px 14px;font-size:.84rem}
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
.gd-bub.today .ball{box-shadow:0 0 0 3px #fff,0 0 0 5px var(--sage2)}
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
.gd-tile{border-radius:24px;padding:20px;text-decoration:none;color:inherit;background:color-mix(in srgb,var(--c) 12%,#fff);display:flex;flex-direction:column;gap:12px;transition:transform .15s;min-height:190px}
.gd-tile:hover{transform:translateY(-3px)}
.gd-tile .top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.gd-tile h3{font-size:1.15rem;font-weight:800;letter-spacing:-.01em}
.gd-tile .sub{font-size:.78rem;color:var(--ink2);margin-top:3px}
.gd-tile .facts{display:grid;gap:6px;font-size:.8rem;color:var(--ink2)}
.gd-tile .facts span{display:flex;gap:7px;align-items:center}
.gd-tile .facts .warn{color:var(--sun);font-weight:800}
.gd-tile .stem{margin-top:auto;height:10px;border-radius:999px;background:rgba(255,255,255,.8);overflow:hidden}
.gd-tile .stem i{display:block;height:100%;border-radius:999px;background:var(--c)}
.gd-ring text{font-weight:800;fill:var(--ink)}
.gd-help{background:linear-gradient(150deg,var(--sun-l),#fdf7ea);border-radius:var(--r);padding:22px 24px}
.gd-help h2{font-size:1.05rem;font-weight:800;margin-bottom:12px;display:flex;gap:10px;align-items:center}
.gd-help-row{display:flex;justify-content:space-between;gap:10px;align-items:center;background:rgba(255,255,255,.75);border-radius:16px;padding:10px 12px}
.gd-help-row + .gd-help-row{margin-top:8px}
.gd-help-row b{font-size:.88rem;display:block}
.gd-help-row small{font-size:.74rem;color:var(--muted)}
.gd-help p{font-size:.78rem;color:var(--ink2);margin-top:12px;line-height:1.5}
/* course */
.gd-chead{border-radius:30px;padding:28px 30px;background:linear-gradient(135deg,color-mix(in srgb,var(--c) 18%,#fff),color-mix(in srgb,var(--c) 6%,#fff));display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:26px;align-items:center}
.gd-chead h1{font-size:clamp(1.8rem,3.6vw,2.6rem);font-weight:800;letter-spacing:-.03em;line-height:1.05}
.gd-chead .sub{font-size:.9rem;color:var(--ink2);margin-top:6px}
.gd-chead .acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.gd-chead .acts .shq-btn.ghost{background:#fff}
.gd-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.gd-kpi{background:rgba(255,255,255,.75);border-radius:16px;padding:8px 14px;font-size:.78rem;color:var(--ink2);font-weight:700}
.gd-kpi b{font-size:1rem;color:var(--ink);margin-right:4px}
@media(max-width:860px){.gd-chead{grid-template-columns:auto 1fr;padding:22px}.gd-chead .acts{grid-column:1 / -1;justify-content:flex-start}}
.gd-topics{display:flex;flex-wrap:wrap;gap:8px}
.gd-topic{display:inline-flex;align-items:center;gap:7px;font-size:.82rem;font-weight:800;padding:8px 14px 8px 10px;border-radius:999px;background:var(--bg);color:var(--ink2)}
.gd-topic.learned{background:var(--sage-l);color:var(--sage)}
.gd-topic.unsure{background:var(--sun-l);color:var(--sun)}
.gd-topic i{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:#fff;font-style:normal}
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
.gd-cd{width:64px;height:64px;border-radius:50%;background:#fff;display:grid;place-items:center;text-align:center;flex-shrink:0;box-shadow:inset 0 0 0 3px var(--c,var(--lav2))}
.gd-cd b{font-size:1.2rem;line-height:1;display:block}
.gd-cd small{font-size:.6rem;font-weight:800;color:var(--muted);text-transform:uppercase}
.gd-capsule{height:12px;border-radius:999px;background:#fff;overflow:hidden}
.gd-capsule i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--c,var(--sage2)),color-mix(in srgb,var(--c,var(--sage2)) 60%,#fff))}
/* planner */
.gd-days{display:grid;gap:12px}
.gd-day{background:var(--card);border-radius:24px;padding:16px 20px;display:grid;grid-template-columns:76px minmax(0,1fr) 170px;gap:18px;align-items:center}
.gd-day.today{box-shadow:0 0 0 2px var(--sage2)}
.gd-day .date{text-align:center;border-radius:18px;background:var(--bg);padding:10px 0}
.gd-day.today .date{background:var(--sage);color:#fff}
.gd-day .date b{display:block;font-size:1.5rem;font-weight:800;line-height:1}
.gd-day .date small{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
.gd-pills{display:flex;flex-wrap:wrap;gap:8px}
.gd-pillev{display:inline-flex;align-items:center;gap:8px;border-radius:14px;padding:8px 12px;font-size:.82rem;font-weight:700;background:color-mix(in srgb,var(--c) 12%,#fff);color:var(--ink);border:0;cursor:default;text-align:left;font-family:inherit}
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
.gd-tools select{border:0;border-radius:999px;padding:8px 12px;background:#fff;font-weight:800;color:var(--ink2)}
.gd-seg{display:inline-flex;background:#fff;border-radius:999px;padding:4px;gap:2px}
.gd-seg button{border:0;background:none;border-radius:999px;padding:7px 14px;font-weight:800;font-size:.82rem;color:var(--ink2);cursor:pointer;min-height:36px}
.gd-seg button:hover{background:var(--bg)}
/* lists */
.gd-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.gd-filters button{border:0;background:#fff;border-radius:999px;padding:8px 14px;font-size:.82rem;font-weight:800;color:var(--ink2);cursor:pointer;display:inline-flex;gap:7px;align-items:center;min-height:38px}
.gd-filters button[aria-pressed="true"]{background:var(--ink);color:#fff}
.gd-group{margin-top:22px}
.gd-group:first-child{margin-top:0}
.gd-group h3{font-size:.86rem;font-weight:800;color:var(--ink2);margin-bottom:10px;display:flex;gap:8px;align-items:center}
.gd-group h3 span{background:#fff;border-radius:999px;padding:1px 9px;font-size:.74rem}
.gd-group h3.red{color:var(--peach)}
.gd-examgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px}
.gd-bigcd{display:flex;gap:16px;align-items:center}
.gd-bigcd .gd-cd{width:84px;height:84px}
.gd-bigcd .gd-cd b{font-size:1.7rem}
.gd-notes{columns:280px;column-gap:18px}
.gd-note{break-inside:avoid;margin-bottom:18px;border-radius:22px;padding:20px;background:color-mix(in srgb,var(--c) 11%,#fff);display:flex;flex-direction:column;gap:10px}
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
.gd-grow .track i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 55%,#fff),var(--c))}
.gd-grow .track em{position:absolute;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:#fff;color:var(--c);display:grid;place-items:center;box-shadow:0 3px 8px rgba(37,48,43,.15)}
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
`;

  var PALETTE = ['#5e8b6f', '#8b7bc8', '#4f8cc1', '#c9805f', '#b89036', '#b5739b', '#4a9696', '#7c8c4a'];

  function ring(pct, color, size, label, track) {
    size = size || 64; var r = size / 2 - 6, c = 2 * Math.PI * r, v = pct == null ? 0 : pct;
    return '<svg class="gd-ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + label + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + (track || 'rgba(255,255,255,.85)') + '" stroke-width="8"/>' +
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
    var main = ['overview', 'courses', 'learn', 'progress'];
    var tabs = nav.items.filter(function (n) { return main.indexOf(n.id) !== -1; }).map(function (n) {
      return '<a href="' + n.href + '"' + (n.current ? ' aria-current="page"' : '') + '>' + a.ic(n.icon, 20) + a.esc(n.id === 'overview' ? a.T('today-tab', 'Today') : n.label) + '</a>';
    });
    tabs.splice(2, 0, '<button type="button" class="gd-cap" data-act="quick-capture" aria-label="' + a.esc(a.T('capture-h', 'Capture')) + '">' + a.ic('plus', 24) + '</button>');
    var tabbar = tabs.join('');
    var rest = nav.items.filter(function (n) { return main.indexOf(n.id) === -1; });
    var moreCur = rest.some(function (n) { return n.current; });
    tabbar += '<details' + (moreCur ? ' class="cur"' : '') + '><summary>' + a.ic('more', 20) + a.esc(a.T('more', 'More')) + '</summary><div class="gd-more">' + rest.map(function (n) { return '<a href="' + n.href + '">' + a.ic(n.icon, 18) + a.esc(n.label) + '</a>'; }).join('') + '<a href="student-dashboard.html">' + a.ic('arrow', 18) + a.esc(a.T('tutoring-dashboard', 'Tutoring dashboard')) + '</a></div></details>';
    return '<div class="gd"><div class="gd-app"><aside class="gd-side" aria-label="Study HQ"><div class="gd-brand"><span class="gd-logo">' + a.ic('leaf', 22) + '</span><div><b>Study HQ</b><small>' + a.esc(p.university || a.T('your-workspace', 'Your study space')) + '</small></div></div>' +
      '<button type="button" class="shq-btn primary gd-capside" data-act="quick-capture">' + a.ic('plus', 16) + a.esc(a.T('capture-h', 'Capture')) + '</button><nav class="gd-nav" aria-label="Study HQ sections">' + items + '</nav><h4>' + a.esc(a.T('my-courses', 'My courses')) + '</h4><nav class="gd-cnav" aria-label="My courses">' + cnav + '</nav>' + termbox +
      '<div class="gd-sidelinks"><a href="student-dashboard.html">' + a.esc(a.T('tutoring-dashboard', 'Tutoring dashboard')) + ' →</a><a href="find-tutors.html">' + a.esc(a.T('find-a-tutor', 'Find a tutor')) + ' →</a></div></aside>' +
      '<main id="main" tabindex="-1"><div class="gd-mobilehead"><b><span class="gd-logo">' + a.ic('leaf', 16) + '</span>Study HQ</b>' + (t ? '<span class="gd-chip">' + a.esc(termWord(a, t)) + '</span>' : '<button type="button" class="shq-btn ghost small" data-act="term">' + a.esc(a.T('set-term', 'Set term dates')) + '</button>') + '</div><!--VIEW--></main></div>' +
      '<nav class="gd-tabbar" aria-label="Study HQ">' + tabbar + '</nav></div>';
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

  function overview(a, m) {
    var s = m.stats, t = m.term;
    var d = m.daily;
    var hero = '<section class="gd-hero">' + hills() + '<div><div class="date">' + a.esc(m.dateText) + '</div><h1>' + a.esc(m.greet + (m.first ? ', ' + m.first : '')) + '</h1><p>' + a.esc(d.ready ? a.T('gd-daily', 'Ten minutes a day keeps the term calm. Here is today.') : s.dueWeek || s.exams30 ? a.T('gd-sub', 'One small step at a time. Here is how your week looks.') : a.T('gd-calm', 'A calm week. A good moment to get ahead.')) + '</p>' +
      '<div class="gd-chips">' + (d.ready ? '<span class="gd-chip"><b>' + d.classes.length + '</b>' + a.esc(d.classes.length === 1 ? a.T('class-today-1', 'class today') : a.T('classes-today', 'classes today')) + '</span><span class="gd-chip"><b>' + d.queue.total + '</b>' + a.esc(a.T('cards-review', 'cards to review')) + '</span>' : '') + '<span class="gd-chip"><b>' + s.dueWeek + '</b>' + a.esc(a.T('due-this-week', 'due this week')) + '</span>' + (d.ready ? '' : '<span class="gd-chip"><b>' + s.exams30 + '</b>' + a.esc(a.T('exams-30', 'exams in 30 days')) + '</span>') + '</div></div>' +
      (t ? '<div class="gd-termring">' + ring(t.pct, '#5e8b6f', 64, a.esc(a.T('term-pct', '{{n}}% of the term', { n: t.pct }))) + '<div><b>' + a.esc(termWord(a, t)) + '</b><small>' + a.esc(t.name) + '</small><small>' + a.esc(a.T('days-left-term', '{{n}} days left', { n: t.daysLeft })) + '</small></div></div>' : '') + '</section>';
    var html;
    if (d.ready) {
      var today = '<div class="gd-pair"><section class="gd-card"><h2>' + a.esc(a.T('today-classes', 'Today’s classes')) + '<a href="#/settings">' + a.esc(a.T('timetable', 'Timetable')) + ' →</a></h2>' + a.classesBlock(d) + '</section>' +
        '<section class="gd-card gd-rv"><h2>' + a.esc(a.T('today-review', 'Today’s review')) + '<a href="#/learn">' + a.esc(a.T('nav.review', 'Review')) + ' →</a></h2>' + a.reviewBlock(d) + '</section></div>';
      var sugg = d.suggestions.length ? '<section class="gd-card"><h2>' + a.esc(a.T('suggested', 'Suggested for today')) + '</h2>' + a.suggestBlock(d, 3) + '</section>' : '';
      var rec = '<section class="gd-card"><h2>' + a.esc(a.T('this-week-rec', 'Your week so far')) + '<a href="#/progress">' + a.esc(a.T('nav.week', 'Week')) + ' →</a></h2>' + a.recordBlock(d.record) + '</section>';
      html = hero + '<div style="height:22px"></div>' + a.storageNotice() + '<div class="gd-two"><div class="gd-grid">' + today + coming(a, m.upcoming) + focus(a, m.focus) + '</div><div class="gd-grid">' + sugg + rec + courseTiles(a, m.courses) + '</div></div>';
    } else html = hero + '<div style="height:22px"></div>' + a.storageNotice() + '<div class="gd-two"><div class="gd-grid">' + focus(a, m.focus) + week(a, m) + courseTiles(a, m.courses) + '</div><div class="gd-grid">' + coming(a, m.upcoming) + help(a, m.attention) + '</div></div>';
    return html;
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
    if (!rows.length) return '<section class="gd-help"><h2>' + a.ic('leaf', 18) + a.esc(a.T('all-good', 'No tricky topics flagged')) + '</h2><p style="margin-top:0">' + a.esc(a.T('flag-hint', 'Mark a topic “unsure” in your revision plan and Study HQ will connect you with tutors for that course.')) + '</p></section>';
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
      (m.exams.length ? m.exams.map(function (e) { return examCard(a, e, false); }).join('') : '<p class="gd-muted">' + a.esc(a.T('no-exam-d', 'No exam date yet. Add it and review cards for this course are brought forward before the exam.')) + '</p>') + cls + '</section>';
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
  function assignments(a, m) {
    var h = head(a, a.T('asg-title', 'Assignments'), a.esc(a.T('asg-sub', '{{n}} still open. You’ve got this.', { n: m.open })), a.addBtn('assignment', a.T('add-assignment', 'Add an assignment')));
    h += a.storageNotice() + filters(a, m.filters, m.filter, 'asg-filter');
    if (!m.groups.length) return h + '<div class="gd-empty">' + sprout() + '<b>' + a.esc(a.T('no-asg', 'No assignments yet')) + '</b>' + a.esc(a.T('no-asg-sub', 'Add essays, problem sets and projects with their due dates.')) + '</div>';
    return h + '<section class="gd-card">' + m.groups.map(function (g) {
      return '<div class="gd-group"><h3' + (g.key === 'overdue' ? ' class="red"' : '') + '>' + a.esc(g.name) + '<span>' + g.count + '</span></h3>' + g.items.map(function (i) { return a.itemRow(i); }).join('') + '</div>';
    }).join('') + '</section>';
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
     Starts fresh every Monday. Pure SVG; it only grows, it never wilts or scolds. */
  function plant(a, rec) {
    var n = Math.min(7, rec.reviewDays || 0), h = 10 + n * 10, stemTop = 100 - h, leaves = '';
    for (var i = 0; i < n; i++) {
      var y = 98 - (i + 1) * 10, left = i % 2 === 0, x = left ? 79 : 81, dx = left ? -15 : 15;
      leaves += '<polygon class="gd-leaf" style="--d:' + (i * 70) + 'ms" points="' + x + ',' + y + ' ' + (x + dx) + ',' + (y - 7) + ' ' + (x + dx * 0.6) + ',' + (y + 2) + '" fill="' + (i % 3 === 0 ? '#639922' : '#97C459') + '"/>';
    }
    var flower = n >= 5 ? '<g class="gd-leaf" style="--d:' + (n * 70) + 'ms"><circle cx="80" cy="' + (stemTop - 3) + '" r="7" fill="#ED93B1"/><circle cx="80" cy="' + (stemTop - 3) + '" r="3" fill="#FAC775"/></g>' : '';
    var wd = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    var dots = rec.days.map(function (d, i) { return '<span class="gd-pday' + (d.cards > 0 ? ' on' : '') + (d.future ? ' fut' : '') + '" title="' + a.esc(wd[i]) + '">' + a.esc(wd[i]) + '</span>'; }).join('');
    var say = n === 0 ? a.T('plant-0', 'Review on any day this week and your plant grows its first leaf.')
      : n >= 5 ? a.T('plant-flower', 'It’s flowering: {{n}} review days this week.', { n: n })
      : a.T('plant-n', '{{n}} review days this week. Five days and it flowers.', { n: n });
    return '<div class="gd-plant"><svg viewBox="0 ' + Math.min(48, stemTop - 16) + ' 160 ' + (136 - Math.min(48, stemTop - 16)) + '" role="img" aria-label="' + a.esc(a.T('plant-aria', 'Study plant with {{n}} leaves', { n: n })) + '">' +
      '<polygon points="80,100 132,117 80,134 28,117" fill="#C0DD97"/><polygon points="28,117 80,134 80,136 28,119" fill="#639922"/><polygon points="80,134 132,117 132,119 80,136" fill="#3B6D11"/>' +
      '<polygon points="64,107 96,107 91,123 69,123" fill="#D85A30"/><polygon points="64,107 96,107 96,102 64,102" fill="#F0997B"/>' +
      (n ? '<rect class="gd-stem" x="78.5" y="' + stemTop + '" width="3" height="' + h + '" fill="#3B6D11"/>' : '<ellipse cx="80" cy="102" rx="4" ry="2" fill="#3B6D11"/>') +
      leaves + flower + '</svg><div class="gd-pdays">' + dots + '</div><p>' + a.esc(say) + '</p><small>' + a.esc(a.T('plant-fresh', 'A new plant every Monday.')) + '</small></div>';
  }
  function progress(a, m) {
    var h = head(a, a.T('week-title', 'Your week'), a.esc(a.T('week-sub', 'An honest record to plan the next one. No scores, no comparisons.')), m.daily.ready ? '<button type="button" class="shq-btn ghost" data-act="reflect">' + a.ic('leaf', 15) + a.esc(a.T('reflect-btn', 'Reflect on this week')) + '</button>' : '');
    h += a.storageNotice();
    var lr = m.daily.lastReflection;
    h += '<div class="gd-two" style="margin-bottom:22px"><section class="gd-card"><h2>' + a.esc(a.T('your-plant', 'Your study plant')) + '</h2>' + plant(a, m.daily.record) + '</section><section class="gd-card"><h2>' + a.esc(a.T('learning-week', 'Learning this week')) + '</h2>' + a.recordBlock(m.daily.record) + '</section></div>' +
      '<div class="gd-two" style="margin-bottom:22px">' +
      '<section class="gd-card"><h2>' + a.esc(a.T('last-reflect', 'Your last reflection')) + '</h2>' + (lr ? '<dl class="gd-rf"><dt>' + a.esc(a.T('rf.went', 'What went well?')) + '</dt><dd>' + a.esc(lr.went || '–') + '</dd><dt>' + a.esc(a.T('rf.stuck', 'What is still stuck?')) + '</dt><dd>' + a.esc(lr.stuck || '–') + '</dd><dt>' + a.esc(a.T('rf.aim', 'One aim for next week')) + '</dt><dd>' + a.esc(lr.aim || '–') + '</dd></dl>' : '<p class="gd-muted">' + a.esc(a.T('no-reflect', 'Nothing yet. Three questions at the end of each week, private to you.')) + '</p>') + '</section></div>';
    h += '<div class="gd-two"><section class="gd-card"><h2>' + a.esc(a.T('by-course-week', 'This week, course by course')) + '</h2>' + (m.weekRows.length ? '<div class="gd-wk">' + m.weekRows.map(function (r) {
      return '<div class="gd-wkrow' + (r.quiet ? ' quiet' : '') + '" style="--c:' + r.color + '"><a href="' + r.href + '"><i class="shq-dot" style="background:' + r.color + '"></i>' + a.esc(r.label) + '</a><span>' + a.esc(a.T('wk-line', '{{n}} notes · {{f}} files · {{c}} cards', { n: r.notes, f: r.files, c: r.cards })) + '</span>' + (r.quiet ? '<small>' + a.esc(a.T('wk-quiet', 'Nothing captured yet this week')) + '</small>' : '') + '</div>';
    }).join('') + '</div>' : '<p class="gd-muted">' + a.esc(a.T('no-courses-s', 'No courses yet.')) + '</p>') + '</section>' +
      '<section class="gd-card"><h2>' + a.esc(a.T('next-14', 'Next two weeks')) + '</h2><div class="gd-tl">' + (m.next.length ? m.next.slice(0, 8).map(function (e) { return tlRow(a, e); }).join('') : '<p class="gd-muted">' + a.esc(a.T('nothing-14', 'Nothing due in the next two weeks.')) + '</p>') + '</div></section></div>';
    return h;
  }
  function notFound(a) { return head(a, a.T('not-found', 'Course not found'), a.esc(a.T('not-found-sub', 'This course is not in your Study HQ.'))) + '<a class="shq-btn ghost" href="#/courses">' + a.esc(a.T('back-courses', 'Back to courses')) + '</a>'; }

  window.StudyHQSkins = window.StudyHQSkins || {};
  window.StudyHQSkins.garden = { id: 'garden', name: 'Study Garden', palette: PALETTE, css: css, shell: shell,
    views: { overview: overview, courses: courses, course: course, planner: planner, assignments: assignments, exams: exams, notes: notes, progress: progress, notFound: notFound } };
})();
