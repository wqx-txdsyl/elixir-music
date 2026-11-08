import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, CaretLeft, Check, FloppyDisk, Plus, PuzzlePiece, X } from '@phosphor-icons/react';
import { SLOT_MAP, SLOTS } from './components.mjs';
import { SlotPanel, currentName } from './PartPicker';
import { PartArt } from './PartArt';

// 拆下的部件，等着装回去。
export function removedParts(resolved) {
  return SLOTS.filter(s => s.removable && resolved.parts[s.key] === s.removable);
}
// 装回时用皮肤自己的样式；皮肤本身就不带这个部件时，换成第一种可用样式。
export function reinstallValue(slot, skin) {
  const def = SLOT_MAP[slot];
  if ((skin.defaults?.[slot] || 'native') !== def.removable && def.variants.some(([id]) => id === 'native')) return 'native';
  return def.variants.find(([id]) => id !== 'native' && id !== def.removable)?.[0] || 'native';
}

// 窗口里能点选的区域，以及点开后能调整的部件。
const REGIONS = [
  { key: 'sidebar', title: '侧边栏', selector: '.app > .sidebar', slots: ['sidebar', 'side', 'clock'] },
  { key: 'topbar', title: '顶栏', selector: '.workspace > .topbar', slots: ['topbar'] },
  { key: 'main', title: '内容区', selector: '.workspace > .main-scroll', slots: ['home', 'background', 'visualizer', 'np', 'lyrics'] },
  { key: 'panel', title: '右侧正在播放栏', selector: '.app > .now-panel', slots: ['panel'] },
  { key: 'player', title: '播放栏', selector: '.app > .player', slots: ['player', 'progress', 'lyricBar'] },
];
// 播放页打开时，内容区换成播放页相关的部件。
const DETAIL_MAIN = { ...REGIONS[2], title: '播放页', slots: ['np', 'lyrics', 'visualizer', 'background'] };
const regionsFor = detail => detail ? REGIONS.map(r => r.key === 'main' ? DETAIL_MAIN : r) : REGIONS;
const mainSlot = region => region.slots[0];

// 量出各区域在屏幕上的位置。标签不放进组件内部，皮肤的样式就影响不到它。
function measure(app, zoom) {
  const out = {};
  for (const region of REGIONS) {
    const el = app.querySelector(region.selector);
    if (!el) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    const left = Math.max(r.left, 0), top = Math.max(r.top, 0), right = Math.min(r.right, innerWidth), bottom = Math.min(r.bottom, innerHeight);
    if (right - left < 8 || bottom - top < 8) continue;
    out[region.key] = { x: left / zoom, y: top / zoom, w: (right - left) / zoom, h: (bottom - top) / zoom };
  }
  return out;
}

function sameBoxes(a, b) {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => b[k] && ['x', 'y', 'w', 'h'].every(p => Math.abs(a[k][p] - b[k][p]) < .5));
}

// 估算标签宽度：中文按 12px，其他字符按 7px，加上图标和内边距。
const textWidth = text => [...text].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 12 : 7), 0);
const LABEL_H = 26;

// 标签压在区域上边框上；贴着窗口顶边的区域放在里面，太小的区域放在下面。
// 再逐个检查，和前面的标签重叠就往下挪。
function placeLabels(regions, boxes, labels, vw) {
  const placed = [], out = {};
  for (const region of regions) {
    const box = boxes[region.key];
    if (!box) continue;
    const w = textWidth(region.title + labels[region.key]) + 52;
    let x = box.w < w + 20 ? box.x + box.w / 2 - w / 2 : box.x + 10;
    let y = box.y - LABEL_H / 2;
    if (box.y < LABEL_H) y = box.h < 60 ? box.y + box.h + 6 : box.y + 6;
    x = Math.max(6, Math.min(x, vw - w - 6));
    for (let guard = 0; guard < 8 && placed.some(p => x < p.x + p.w + 4 && p.x < x + w + 4 && y < p.y + LABEL_H + 4 && p.y < y + LABEL_H + 4); guard++) y += LABEL_H + 6;
    placed.push({ x, y, w });
    out[region.key] = { left: x, top: y };
  }
  return out;
}

function RegionBox({ region, box, selected, onPick, app }) {
  return <div className={'le-box' + (selected ? ' selected' : '')} style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    onClick={() => onPick(region.key)} onWheel={e => app?.querySelector(region.selector)?.scrollBy({ top: e.deltaY, left: e.deltaX })} role="button" tabIndex={0} aria-label={'调整' + region.title} aria-pressed={selected}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(region.key); } }} />;
}

export function LayoutEditor({ look, resolved, appearance, notify, onDone }) {
  const ref = useRef(null);
  const [boxes, setBoxes] = useState({});
  const [selected, setSelected] = useState(null);
  const [vw, setVw] = useState(innerWidth);
  const [detail, setDetail] = useState(false);

  const update = useCallback(() => {
    const host = ref.current, app = host?.closest('.app');
    if (!app) return;
    const zoom = host.currentCSSZoom || 1;
    const next = measure(app, zoom);
    setBoxes(prev => sameBoxes(prev, next) ? prev : next);
    setVw(innerWidth / zoom);
    setDetail(!!app.querySelector('.detail-view'));
  }, []);

  // 部件换样式时有过渡动画，过渡期间和之后都要重新量。
  useLayoutEffect(() => { update(); const timers = [80, 220, 420, 700].map(t => setTimeout(update, t)); return () => timers.forEach(clearTimeout); }, [resolved, update]);
  useEffect(() => {
    const timer = setInterval(update, 500);
    addEventListener('resize', update);
    return () => { clearInterval(timer); removeEventListener('resize', update); };
  }, [update]);

  // Esc：先关掉面板里的部件，再退出编辑。
  useEffect(() => {
    const key = e => {
      if (e.key !== 'Escape' || e.target.closest?.('input,textarea,[role=listbox]')) return;
      e.preventDefault(); e.stopPropagation();
      if (selected) setSelected(null); else onDone();
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  }, [selected, onDone]);

  const removed = removedParts(resolved);
  const regions = regionsFor(detail);
  const region = selected && regions.find(r => r.key === selected);
  // 面板放在选中区域的对侧，不挡住正在调整的部件。
  const box = selected && boxes[selected];
  const dockLeft = box && box.x + box.w / 2 > vw * .62;
  const setPart = (slot, value) => appearance.setPart(slot, value);
  const labels = Object.fromEntries(regions.map(r => [r.key, currentName(look, resolved, mainSlot(r))]));
  const labelAt = placeLabels(regions, boxes, labels, vw);

  return <div className="layout-editor" ref={ref}>
    <div className="le-shade" />
    {regions.map(r => boxes[r.key] && <RegionBox key={r.key} region={r} box={boxes[r.key]} app={ref.current?.closest('.app')} selected={selected === r.key} onPick={setSelected} />)}
    {regions.map(r => labelAt[r.key] && <span key={r.key} className={'le-label' + (selected === r.key ? ' selected' : '')} style={labelAt[r.key]}><PuzzlePiece size={13} weight="fill" /><strong>{r.title}</strong><em>{labels[r.key]}</em></span>)}

    <aside className={'le-panel' + (dockLeft ? ' left' : '')} role="dialog" aria-label="布局编辑">
      <header className="le-head">
        {region ? <button type="button" className="le-icon" onClick={() => setSelected(null)} aria-label="返回全部区域"><CaretLeft size={16} weight="bold" /></button> : <span className="le-mark"><PuzzlePiece size={16} weight="fill" /></span>}
        <div><strong>{region ? region.title : '布局编辑'}</strong><small>{region ? '选一张卡片即可换上，改动马上生效' : '点窗口里的任意区域，或从下面选'}</small></div>
        <button type="button" className="le-icon" onClick={onDone} aria-label="退出布局编辑" title="退出（Esc）"><X size={16} weight="bold" /></button>
      </header>

      <div className="le-body">
        {region ? region.slots.map(slot => <SlotPanel key={slot} slot={slot} look={look} resolved={resolved} onChange={setPart} compact />) : <>
          <div className="le-regions">
            {regions.map(r => {
              const off = !boxes[r.key];
              const main = mainSlot(r);
              return <button type="button" key={r.key} className={'le-region' + (off ? ' off' : '')} onClick={() => setSelected(r.key)}>
                <PartArt slot={main} value={look.components[main]} resolved={resolved} />
                <span><strong>{r.title}</strong><small>{off && SLOT_MAP[main]?.removable && resolved.parts[main] === SLOT_MAP[main].removable ? '已拆下' : currentName(look, resolved, main)}</small></span>
              </button>;
            })}
          </div>
          <div className="le-tray">
            <h3>已拆下的部件<small>{removed.length ? '点一下装回原位' : ''}</small></h3>
            {removed.length ? <div className="le-tray-list">{removed.map(s => <button type="button" key={s.key} onClick={() => { setPart(s.key, reinstallValue(s.key, resolved.skin)); notify('已装回' + s.title); }}><Plus size={13} weight="bold" />{s.title}</button>)}</div>
              : <p>还没有拆下任何部件。点开一个区域，选「拆下」就会放到这里。</p>}
          </div>
        </>}
      </div>

      <footer className="le-foot">
        <button type="button" className="le-btn" disabled={!appearance.canUndo} onClick={appearance.undo} title="撤销（Ctrl Z）"><ArrowCounterClockwise size={15} />撤销</button>
        <button type="button" className="le-btn" onClick={() => { appearance.saveStyle(''); notify('已存为方案，可在个性化工坊里改名'); }}><FloppyDisk size={15} />存为方案</button>
        <button type="button" className="le-btn primary" onClick={onDone}><Check size={15} weight="bold" />完成</button>
      </footer>
    </aside>
  </div>;
}
