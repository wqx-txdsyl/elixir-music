import React from 'react';
import { SLOT_MAP } from './components.mjs';
import { homeLayout, nowPlayingStyle, visualizerStyle } from './appearance.mjs';

// 每个部件的示意图：窗口类部件画成整窗分区图，其余部件画成各自的小图标。
// 颜色全部取自当前皮肤的变量，换皮肤时示意图跟着变。

const W = 96, H = 60;

// 「跟随皮肤」时实际生效的样式，示意图按它来画。
export function effectivePart(resolved, key) {
  const value = resolved.parts[key];
  if (key === 'np') return nowPlayingStyle(resolved);
  if (key === 'visualizer') return visualizerStyle(resolved);
  if (key === 'home') return homeLayout(resolved);
  if (value !== 'native') return value;
  return { sidebar: 'full', topbar: 'full', player: 'bar', progress: 'line', lyrics: 'center', background: 'plain' }[key] || value;
}

const FRAME_SLOTS = ['sidebar', 'side', 'topbar', 'player', 'panel', 'lyricBar', 'clock'];
export const isFrameSlot = key => FRAME_SLOTS.includes(key);

// 把一组部件换算成窗口里的矩形。parts 里的值都是已解析的具体样式。
export function frameRegions(parts) {
  const r = {}, right = parts.side === 'right';
  const player = parts.player, sidebar = parts.sidebar, topbar = parts.topbar;
  let top = 0, bottom = H;
  if (player === 'top') { r.player = { x: 0, y: 0, w: W, h: 9 }; top = 9; }
  if (player === 'bar') { r.player = { x: 0, y: H - 9, w: W, h: 9 }; bottom = H - 9; }
  if (player === 'mini') { r.player = { x: 0, y: H - 4, w: W, h: 4 }; bottom = H - 4; }
  let left = 0, end = W;
  if (sidebar === 'full' || sidebar === 'rail') {
    const w = sidebar === 'full' ? 22 : 9;
    r.sidebar = { x: right ? W - w : 0, y: top, w, h: bottom - top };
    if (right) end = W - w; else left = w;
  }
  if (sidebar === 'float') {
    r.sidebar = { x: right ? W - 23 : 3, y: top + 3, w: 20, h: bottom - top - 6, rx: 3 };
    if (right) end = W - 25; else left = 25;
  }
  if (parts.panel === 'on') { r.panel = { x: end - 20, y: top, w: 20, h: bottom - top }; end -= 20; }
  if (topbar === 'full' || topbar === 'center') { r.topbar = { x: left, y: top, w: end - left, h: 8 }; top += 8; }
  r.main = { x: left, y: top, w: end - left, h: bottom - top };
  if (sidebar === 'dock') r.sidebar = { x: W / 2 - 20, y: bottom - (player === 'float' ? 18 : 9), w: 40, h: 6, rx: 3 };
  if (player === 'float') r.player = { x: W / 2 - 25, y: H - 10, w: 50, h: 7, rx: 3.5 };
  if (player === 'island') r.player = { x: W / 2 - 13, y: 2.5, w: 26, h: 6, rx: 3 };
  if (sidebar === 'hidden' && r.topbar) r.topnav = r.topbar;
  return r;
}

// 拆下时在原位置画一个虚线框，示意「这里原来有东西」。
const GHOST = { sidebar: 'full', topbar: 'full', player: 'bar', panel: 'on', lyricBar: 'on', clock: 'on' };

const Rect = ({ box, className }) => box ? <rect className={className} x={box.x} y={box.y} width={box.w} height={box.h} rx={box.rx || 0} /> : null;

function Frame({ parts, highlight, ghost }) {
  const r = frameRegions(parts);
  const g = ghost ? frameRegions({ ...parts, [ghost]: GHOST[ghost] }) : null;
  const cls = key => key === highlight ? 'pa-hot' : 'pa-dim';
  const m = r.main;
  return <>
    <rect className="pa-win" x=".5" y=".5" width={W - 1} height={H - 1} rx="5" />
    {/* 内容区里的几块示意内容 */}
    <rect className="pa-soft" x={m.x + 5} y={m.y + 4} width={Math.max(8, m.w * .38)} height="3" rx="1.5" />
    <rect className="pa-soft" x={m.x + 5} y={m.y + 10} width={m.w - 10} height={Math.max(6, m.h * .32)} rx="2" />
    {[0, 1, 2].map(i => <rect key={i} className="pa-soft" x={m.x + 5 + i * (m.w - 10) / 3} y={m.y + 13 + Math.max(6, m.h * .32)} width={(m.w - 10) / 3 - 2} height={Math.max(4, m.h * .2)} rx="1.5" />)}
    <Rect box={r.sidebar} className={cls('sidebar')} />
    {parts.sidebar === 'full' && r.sidebar && [0, 1, 2, 3].map(i => <rect key={i} className="pa-ink" x={r.sidebar.x + 4} y={r.sidebar.y + 6 + i * 5} width={r.sidebar.w - 8} height="2" rx="1" />)}
    {parts.sidebar === 'rail' && r.sidebar && [0, 1, 2, 3].map(i => <rect key={i} className="pa-ink" x={r.sidebar.x + 2.5} y={r.sidebar.y + 6 + i * 5} width="4" height="3" rx="1" />)}
    {parts.sidebar === 'dock' && r.sidebar && [0, 1, 2, 3, 4].map(i => <rect key={i} className="pa-ink" x={r.sidebar.x + 5 + i * 6.6} y={r.sidebar.y + 1.5} width="3" height="3" rx="1" />)}
    <Rect box={r.topbar} className={cls('topbar')} />
    {r.topbar && <rect className="pa-ink" x={parts.topbar === 'center' ? r.topbar.x + r.topbar.w / 2 - 12 : r.topbar.x + 4} y={r.topbar.y + 2.5} width="24" height="3" rx="1.5" />}
    {r.topnav && [0, 1, 2].map(i => <rect key={i} className="pa-ink" x={r.topnav.w + r.topnav.x - 34 + i * 10} y={r.topnav.y + 3} width="7" height="2" rx="1" />)}
    <Rect box={r.panel} className={cls('panel')} />
    {r.panel && <rect className="pa-ink" x={r.panel.x + 3} y={r.panel.y + 4} width={r.panel.w - 6} height={r.panel.w - 6} rx="1.5" />}
    <Rect box={r.player} className={cls('player')} />
    {r.player && parts.player !== 'mini' && <circle className="pa-accent" cx={r.player.x + r.player.w / 2} cy={r.player.y + r.player.h / 2} r={Math.min(2.4, r.player.h / 2 - 1)} />}
    {r.player && parts.player === 'mini' && <rect className="pa-accent" x="0" y={r.player.y + 1} width={W * .4} height="2" />}
    {parts.lyricBar === 'on' && r.player && parts.player !== 'mini' && <rect className={highlight === 'lyricBar' ? 'pa-accent' : 'pa-ink'} x={r.player.x + r.player.w / 2 + 5} y={r.player.y + r.player.h / 2 - 1} width={Math.min(18, r.player.w / 2 - 8)} height="2" rx="1" />}
    {parts.clock === 'on' && r.sidebar && parts.sidebar !== 'dock' && <circle className={highlight === 'clock' ? 'pa-accent' : 'pa-ink'} cx={r.sidebar.x + r.sidebar.w / 2} cy={r.sidebar.y + r.sidebar.h - 7} r={Math.min(3.5, r.sidebar.w / 2 - 1.5)} />}
    {highlight === 'side' && r.sidebar && <rect className="pa-outline" x={r.sidebar.x + .5} y={r.sidebar.y + .5} width={r.sidebar.w - 1} height={r.sidebar.h - 1} rx={r.sidebar.rx || 0} />}
    {g && g[ghost === 'lyricBar' || ghost === 'clock' ? 'player' : ghost] && ghost !== 'lyricBar' && ghost !== 'clock' && <Rect box={g[ghost]} className="pa-ghost" />}
  </>;
}

// 进度条：放大的一截播放栏。
function Progress({ id }) {
  const y = 34;
  return <>
    <rect className="pa-win" x=".5" y="14" width={W - 1} height="32" rx="5" />
    <rect className="pa-soft" x="7" y="21" width="12" height="12" rx="2" />
    <circle className="pa-accent" cx="48" cy="25" r="3.2" />
    <rect className="pa-ink" x="38" y="24" width="4" height="2" rx="1" /><rect className="pa-ink" x="54" y="24" width="4" height="2" rx="1" />
    {id === 'line' && <><rect className="pa-soft" x="24" y={y + 4} width="50" height="1.2" /><rect className="pa-accent" x="24" y={y + 4} width="20" height="1.2" /></>}
    {id === 'thick' && <><rect className="pa-soft" x="24" y={y + 2.5} width="50" height="4.5" rx="2.25" /><rect className="pa-accent" x="24" y={y + 2.5} width="20" height="4.5" rx="2.25" /></>}
    {id === 'edge' && <><rect className="pa-soft" x=".5" y="14" width={W - 1} height="2" /><rect className="pa-accent" x=".5" y="14" width="40" height="2" /></>}
    {id === 'wave' && Array.from({ length: 22 }, (_, i) => { const h = 2 + Math.abs(Math.sin(i * 1.7) * 6) + (i % 3); return <rect key={i} className={i < 9 ? 'pa-accent' : 'pa-dim'} x={24 + i * 2.3} y={y + 5 - h / 2} width="1.4" height={h} />; })}
    {id === 'lyric' && <><rect className="pa-soft" x="24" y={y + 5} width="50" height="1.2" /><rect className="pa-accent" x="24" y={y + 5} width="20" height="1.2" />
      {[3, 9, 15, 21, 26, 33, 38, 44, 49].map((t, i) => <rect key={t} className={t < 20 ? 'pa-accent' : 'pa-ink'} x={24 + t} y={y + 5 - ([4, 5].includes(i) ? 5 : 2.5)} width="1" height={[4, 5].includes(i) ? 5 : 2.5} />)}</>}
  </>;
}

const lines = (x, y, widths, gap = 5, cls = 'pa-ink', hot = -1, h = 2) => widths.map((w, i) => <rect key={i} className={i === hot ? 'pa-accent' : cls} x={typeof x === 'function' ? x(w) : x} y={y + i * gap} width={w} height={h} rx={h / 2} />);

function NowPlaying({ id }) {
  const lyric = lines(58, 16, [26, 30, 22, 28, 18], 6, 'pa-ink', 2);
  const shapes = {
    vinyl: <><circle className="pa-deep" cx="28" cy="30" r="17" /><circle className="pa-groove" cx="28" cy="30" r="13" /><circle className="pa-groove" cx="28" cy="30" r="9.5" /><circle className="pa-accent" cx="28" cy="30" r="5.5" /><path className="pa-arm" d="M44 8 L41 22 L33 27" />{lyric}</>,
    cover: <><rect className="pa-accent" x="10" y="12" width="32" height="32" rx="3" />{lines(10, 48, [22, 14], 4)}{lyric}</>,
    immersive: <><rect className="pa-tint" x=".5" y=".5" width={W - 1} height={H - 1} rx="5" /><rect className="pa-accent" x="12" y="14" width="30" height="30" rx="4" />{lines(54, 14, [30, 34, 26, 32, 22], 6, 'pa-ink', 1, 2.6)}</>,
    karaoke: <>{lines(w => (W - w) / 2, 14, [40, 64, 36], 12, 'pa-ink', 1, 5)}</>,
    poster: <><rect className="pa-accent" x=".5" y=".5" width="52" height={H - 1} rx="5" /><rect className="pa-paper" x="8" y="10" width="34" height="7" rx="1" /><rect className="pa-paper" x="8" y="20" width="22" height="7" rx="1" />{lines(60, 16, [26, 30, 22, 28], 7)}</>,
    cassette: <><rect className="pa-deep" x="14" y="14" width="68" height="34" rx="4" /><rect className="pa-paper" x="20" y="18" width="56" height="9" rx="1.5" /><circle className="pa-accent" cx="34" cy="37" r="5.5" /><circle className="pa-accent" cx="62" cy="37" r="5.5" /><rect className="pa-groove" x="40" y="35" width="16" height="4" rx="1" /></>,
    ipod: <><rect className="pa-deep" x="34" y="4" width="28" height="52" rx="5" /><rect className="pa-paper" x="37" y="8" width="22" height="18" rx="1.5" /><circle className="pa-groove" cx="48" cy="41" r="10" /><circle className="pa-accent" cx="48" cy="41" r="3.6" /></>,
    cd: <><rect className="pa-deep" x="10" y="10" width="44" height="44" rx="10" /><circle className="pa-paper" cx="32" cy="32" r="16" /><circle className="pa-accent" cx="32" cy="32" r="4" /><circle className="pa-groove" cx="32" cy="32" r="11" />{lines(62, 18, [24, 28, 20, 26], 6, 'pa-ink', 1)}</>,
  };
  return <><rect className="pa-win" x=".5" y=".5" width={W - 1} height={H - 1} rx="5" />{shapes[id] || shapes.cover}</>;
}

function Lyrics({ id }) {
  const shapes = {
    center: <>{lines(w => (W - w) / 2, 10, [34, 44, 54, 40, 30, 24], 7.5, 'pa-ink', 2, 2.4)}</>,
    left: <>{lines(12, 10, [40, 52, 64, 46, 34], 9, 'pa-ink', 2, 3.6)}</>,
    block: <><rect className="pa-accent" x="8" y="6" width="80" height="48" rx="5" />{lines(16, 13, [44, 58, 50, 36], 9, 'pa-paper-dim', 1, 3.4)}</>,
    vertical: <>{[0, 1, 2, 3, 4, 5].map(i => <rect key={i} className={i === 2 ? 'pa-accent' : 'pa-ink'} x={76 - i * 11} y="10" width="3.4" height={[38, 30, 40, 26, 34, 22][i]} rx="1.7" />)}</>,
    focus: <>{lines(w => (W - w) / 2, 17, [36], 0, 'pa-dim', -1, 3)}<rect className="pa-accent" x="14" y="26" width="68" height="6" rx="3" />{lines(w => (W - w) / 2, 38, [42], 0, 'pa-dim', -1, 3)}</>,
    single: <><rect className="pa-tint" x=".5" y=".5" width={W - 1} height={H - 1} rx="5" /><rect className="pa-deep" x="16" y="40" width="64" height="10" rx="2" /><rect className="pa-paper" x="24" y="43.5" width="48" height="3" rx="1.5" /></>,
  };
  return <><rect className="pa-win" x=".5" y=".5" width={W - 1} height={H - 1} rx="5" />{shapes[id] || shapes.center}</>;
}

function Home({ id }) {
  const row = (y, n, h, cls = 'pa-dim') => Array.from({ length: n }, (_, i) => <rect key={y + '-' + i} className={cls} x={8 + i * (80 / n)} y={y} width={80 / n - 3} height={h} rx="2" />);
  const shapes = {
    netease: <><rect className="pa-accent" x="8" y="8" width="80" height="18" rx="3" />{row(30, 5, 14)}{lines(8, 48, [80, 80], 5, 'pa-soft')}</>,
    qqmusic: <><rect className="pa-accent" x="8" y="8" width="38" height="44" rx="3" />{lines(51, 9, [36, 30, 36, 28, 34, 30], 7.5)}</>,
    spotify: <>{[0, 1, 2, 3, 4, 5].map(i => <rect key={i} className={i ? 'pa-dim' : 'pa-accent'} x={8 + (i % 3) * 27} y={8 + Math.floor(i / 3) * 9} width="24" height="7" rx="1.5" />)}{row(30, 5, 15)}</>,
    apple: <><rect className="pa-accent" x="8" y="8" width="52" height="26" rx="3" /><rect className="pa-dim" x="63" y="8" width="25" height="26" rx="3" />{row(38, 4, 14)}</>,
    aurora: <><rect className="pa-accent" x="8" y="8" width="44" height="26" rx="4" /><rect className="pa-dim" x="55" y="8" width="33" height="12" rx="4" /><rect className="pa-dim" x="55" y="22" width="15" height="12" rx="4" /><rect className="pa-dim" x="73" y="22" width="15" height="30" rx="4" /><rect className="pa-dim" x="8" y="37" width="62" height="15" rx="4" /></>,
    ink: <><circle className="pa-deep" cx="26" cy="27" r="17" /><circle className="pa-accent" cx="26" cy="27" r="5" /><path className="pa-arm" d="M46 8 L42 24" />{lines(52, 12, [32, 24, 34, 20], 7)}{row(48, 5, 6, 'pa-soft')}</>,
    crate: <><rect className="pa-deep" x="6" y="36" width="84" height="18" rx="2" />{[0, 1, 2, 3, 4, 5].map(i => <rect key={i} className={i === 2 ? 'pa-accent' : 'pa-dim'} x={10 + i * 13} y={i === 2 ? 8 : 16} width="20" height="26" rx="1.5" transform={`rotate(${(i - 2.5) * 4} ${20 + i * 13} 40)`} />)}</>,
    modular: <>{[[8, 8, 80, 8], [8, 19, 50, 16], [61, 19, 27, 16], [8, 38, 80, 14]].map(([x, y, w, h], i) => <g key={i}><rect className={i === 1 ? 'pa-accent' : 'pa-dim'} x={x} y={y} width={w} height={h} rx="2" /><rect className="pa-paper-dim" x={x + 2.5} y={y + 2.5} width="1.4" height="3" /><rect className="pa-paper-dim" x={x + 4.6} y={y + 2.5} width="1.4" height="3" /></g>)}</>,
  };
  return <><rect className="pa-win" x=".5" y=".5" width={W - 1} height={H - 1} rx="5" />{shapes[id] || shapes.netease}</>;
}

function Visual({ id }) {
  const n = 18, base = 44;
  const amp = i => 6 + Math.abs(Math.sin(i * .9) * 16) + (i % 4) * 2;
  const shapes = {
    bars: Array.from({ length: n }, (_, i) => <rect key={i} className="pa-accent" x={10 + i * 4.4} y={base - amp(i)} width="3" height={amp(i)} rx="1" />),
    mirror: Array.from({ length: n }, (_, i) => <rect key={i} className="pa-accent" x={10 + i * 4.4} y={30 - amp(i) / 2} width="3" height={amp(i)} rx="1.5" />),
    wave: <><path className="pa-stroke" d={'M8 30 ' + Array.from({ length: 21 }, (_, i) => `L${8 + i * 4} ${30 + Math.sin(i * .8) * (6 + (i % 3) * 3)}`).join(' ')} /><path className="pa-stroke-dim" d={'M8 30 ' + Array.from({ length: 21 }, (_, i) => `L${8 + i * 4} ${30 + Math.cos(i * .7) * 5}`).join(' ')} /></>,
    ring: <><circle className="pa-deep" cx="48" cy="30" r="12" />{Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2, l = 3 + Math.abs(Math.sin(i * 1.3)) * 7; return <line key={i} className="pa-stroke" x1={48 + Math.cos(a) * 14} y1={30 + Math.sin(a) * 14} x2={48 + Math.cos(a) * (14 + l)} y2={30 + Math.sin(a) * (14 + l)} />; })}</>,
    dots: Array.from({ length: 14 }, (_, i) => Array.from({ length: Math.round(amp(i) / 4) }, (_, j) => <rect key={i + '-' + j} className={j > 4 ? 'pa-hot-dot' : 'pa-accent'} x={12 + i * 5.2} y={base - j * 4.2} width="3.2" height="3.2" />)),
    off: <><rect className="pa-ghost" x="12" y="14" width="72" height="32" rx="4" /><path className="pa-stroke-dim" d="M36 22 L60 38 M60 22 L36 38" /></>,
  };
  return <><rect className="pa-win" x=".5" y=".5" width={W - 1} height={H - 1} rx="5" />{shapes[id] || shapes.bars}</>;
}

function Background({ id }) {
  const shapes = {
    plain: <rect className="pa-soft" x="6" y="6" width="84" height="48" rx="3" />,
    cover: <><defs><radialGradient id="pa-cover-g"><stop offset="0" className="pa-stop-accent" /><stop offset="1" className="pa-stop-clear" /></radialGradient></defs><circle fill="url(#pa-cover-g)" cx="30" cy="22" r="34" /><circle fill="url(#pa-cover-g)" cx="78" cy="50" r="22" opacity=".6" /></>,
    flow: <><path className="pa-flow" d="M0 34 C 20 18, 40 46, 60 30 S 90 22, 96 28 L96 60 L0 60Z" /><path className="pa-flow2" d="M0 44 C 24 32, 46 56, 70 40 S 92 40, 96 42 L96 60 L0 60Z" /></>,
    grain: <>{Array.from({ length: 70 }, (_, i) => <rect key={i} className={i % 5 ? 'pa-ink' : 'pa-accent'} x={(i * 37) % 90 + 3} y={(i * 53) % 54 + 3} width="1.2" height="1.2" />)}</>,
    mosaic: <>{Array.from({ length: 24 }, (_, i) => <rect key={i} className={[3, 8, 14, 19].includes(i) ? 'pa-accent' : i % 3 ? 'pa-dim' : 'pa-soft'} x={4 + (i % 6) * 15} y={4 + Math.floor(i / 6) * 13.2} width="13" height="11.5" rx="1.5" />)}</>,
    image: <><rect className="pa-soft" x="6" y="6" width="84" height="48" rx="3" /><path className="pa-accent" d="M10 50 L34 24 L50 40 L60 30 L86 50Z" /><circle className="pa-accent" cx="70" cy="16" r="5" /></>,
  };
  return <><rect className="pa-win" x=".5" y=".5" width={W - 1} height={H - 1} rx="5" />{shapes[id] || shapes.plain}</>;
}

// 某个部件某个样式的缩略图。resolved 用来画「跟随皮肤」和整窗分区。
export function PartArt({ slot, value, resolved, className = '' }) {
  const def = SLOT_MAP[slot];
  const actual = value === 'native' ? effectivePart({ ...resolved, parts: { ...resolved.parts, [slot]: 'native' } }, slot) : value;
  let body;
  if (isFrameSlot(slot)) {
    const parts = {};
    for (const key of FRAME_SLOTS) parts[key] = effectivePart(resolved, key);
    const removed = def?.removable && actual === def.removable;
    parts[slot] = actual;
    body = <Frame parts={parts} highlight={removed ? null : slot === 'side' ? 'side' : slot} ghost={removed ? slot : null} />;
  } else if (slot === 'progress') body = <Progress id={actual} />;
  else if (slot === 'np') body = <NowPlaying id={actual} />;
  else if (slot === 'lyrics') body = <Lyrics id={actual} />;
  else if (slot === 'home') body = <Home id={actual} />;
  else if (slot === 'visualizer') body = <Visual id={actual} />;
  else body = <Background id={actual} />;
  return <svg className={'part-art ' + className} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">{body}</svg>;
}

// 当前窗口的分区示意图，可以点选其中的部件。
export function WindowDiagram({ resolved, override, selected, onPick, className = '' }) {
  const parts = {};
  for (const key of FRAME_SLOTS) parts[key] = override?.[key] ?? effectivePart(resolved, key);
  const r = frameRegions(parts);
  const hit = (key, box) => box && <rect key={key} className={'wd-hit' + (selected === key ? ' selected' : '')} x={box.x} y={box.y} width={box.w} height={box.h} rx={box.rx || 0} onClick={onPick ? () => onPick(key) : undefined}><title>{SLOT_MAP[key]?.title}</title></rect>;
  return <svg className={'part-art window-diagram ' + className} viewBox={`0 0 ${W} ${H}`} role={onPick ? 'group' : undefined} aria-hidden={onPick ? undefined : 'true'}>
    <Frame parts={parts} highlight={['sidebar', 'topbar', 'player', 'panel'].includes(selected) ? selected : null} />
    {onPick && <>{hit('home', r.main)}{hit('sidebar', r.sidebar)}{hit('topbar', r.topbar)}{hit('panel', r.panel)}{hit('player', r.player)}</>}
  </svg>;
}
