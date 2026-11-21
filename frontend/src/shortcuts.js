// 快捷键：动作表、组合键解析与持久化。
// 组合键统一写成 "Ctrl+Shift+Space" 这种形式（修饰键顺序 Ctrl、Alt、Shift、Meta，主键取自 KeyboardEvent.code），
// 应用内直接比对，全局的转成 Electron accelerator 交给主进程注册。
import { useEffect, useMemo, useState } from 'react';

export const LOCAL_ACTIONS = [
  { id: 'toggle', name: '播放 / 暂停', def: 'Space' },
  { id: 'previous', name: '上一首', def: 'Ctrl+Left' },
  { id: 'next', name: '下一首', def: 'Ctrl+Right' },
  { id: 'seekBack', name: '快退 5 秒', def: 'Shift+Left' },
  { id: 'seekForward', name: '快进 5 秒', def: 'Shift+Right' },
  { id: 'volumeUp', name: '音量 +', def: 'Ctrl+Up' },
  { id: 'volumeDown', name: '音量 −', def: 'Ctrl+Down' },
  { id: 'mute', name: '静音 / 恢复', def: 'Ctrl+M' },
  { id: 'like', name: '喜欢当前歌曲', def: 'Ctrl+L' },
  { id: 'queue', name: '播放队列', def: 'Ctrl+Q' },
  { id: 'detail', name: '歌词与详情', def: 'Ctrl+I' },
  { id: 'palette', name: '命令面板', def: 'Ctrl+K' },
  { id: 'search', name: '搜索', def: 'Ctrl+F' },
  { id: 'back', name: '后退', def: 'Alt+Left' },
  { id: 'forward', name: '前进', def: 'Alt+Right' },
];
export const GLOBAL_ACTIONS = [
  { id: 'toggle', name: '播放 / 暂停', def: 'Ctrl+Shift+Space' },
  { id: 'previous', name: '上一首', def: 'Ctrl+Shift+Left' },
  { id: 'next', name: '下一首', def: 'Ctrl+Shift+Right' },
  { id: 'volumeUp', name: '音量 +', def: 'Ctrl+Shift+Up' },
  { id: 'volumeDown', name: '音量 −', def: 'Ctrl+Shift+Down' },
  { id: 'like', name: '喜欢当前歌曲', def: '' },
  { id: 'window', name: '显示 / 隐藏窗口', def: '' },
  { id: 'lyrics', name: '桌面歌词', def: '' },
];
// 这些动作在输入框里也要响应
export const ANYWHERE = new Set(['palette', 'search', 'back', 'forward']);

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Meta'];
const CODE_KEYS = {
  Space: 'Space', Enter: 'Enter', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert',
  Comma: 'Comma', Period: 'Period', Slash: 'Slash', Semicolon: 'Semicolon', Quote: 'Quote', BracketLeft: 'BracketLeft', BracketRight: 'BracketRight',
  Backslash: 'Backslash', Minus: 'Minus', Equal: 'Equal', Backquote: 'Backquote',
  NumpadAdd: 'NumpadAdd', NumpadSubtract: 'NumpadSubtract', NumpadMultiply: 'NumpadMultiply', NumpadDivide: 'NumpadDivide', NumpadDecimal: 'NumpadDecimal',
  MediaPlayPause: 'MediaPlayPause', MediaTrackNext: 'MediaTrackNext', MediaTrackPrevious: 'MediaTrackPrevious', MediaStop: 'MediaStop',
  AudioVolumeUp: 'VolumeUp', AudioVolumeDown: 'VolumeDown', AudioVolumeMute: 'VolumeMute',
};
const ACCEL = {
  Ctrl: 'CommandOrControl', Alt: 'Alt', Shift: 'Shift', Meta: 'Super',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
  NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec',
};
const LABEL = {
  Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Win', Space: '空格', Up: '↑', Down: '↓', Left: '←', Right: '→',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
  NumpadAdd: '小键盘 +', NumpadSubtract: '小键盘 −', NumpadMultiply: '小键盘 ×', NumpadDivide: '小键盘 ÷', NumpadDecimal: '小键盘 .',
  MediaPlayPause: '播放键', MediaTrackNext: '下一曲键', MediaTrackPrevious: '上一曲键', MediaStop: '停止键',
  VolumeUp: '音量+键', VolumeDown: '音量−键', VolumeMute: '静音键', PageUp: 'PgUp', PageDown: 'PgDn',
};
const COMBO_RE = /^[A-Za-z0-9+]{0,48}$/;

function keyFromCode(code = '') {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return code;
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  return CODE_KEYS[code] || null;
}
// 只按下修饰键时返回 null
export function comboFromEvent(e) {
  const key = keyFromCode(e.code);
  if (!key) return null;
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Meta');
  return [...mods, key].join('+');
}
// 全局快捷键必须带修饰键，功能键和媒体键除外
export function isGlobalCombo(combo) {
  const parts = combo.split('+');
  const key = parts[parts.length - 1];
  return parts.length > 1 || /^F\d+$/.test(key) || /^(Media|Volume)/.test(key);
}
export function toAccelerator(combo) {
  return combo.split('+').map(p => ACCEL[p] || (/^Numpad\d$/.test(p) ? 'num' + p.slice(6) : p)).join('+');
}
export function comboParts(combo) {
  return combo ? combo.split('+').map(p => LABEL[p] || (/^Numpad\d$/.test(p) ? '小键盘 ' + p.slice(6) : p)) : [];
}

const STORE = 'elixir-shortcuts';
const defaults = actions => Object.fromEntries(actions.map(a => [a.id, a.def]));
function pick(map, actions) {
  const out = {};
  for (const a of actions) {
    const v = map && typeof map[a.id] === 'string' ? map[a.id] : a.def;
    out[a.id] = COMBO_RE.test(v) && v.split('+').every((p, i, arr) => i === arr.length - 1 ? !MODIFIERS.includes(p) : MODIFIERS.includes(p)) ? v : a.def;
  }
  return out;
}
function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { saved = {}; }
  return { local: pick(saved.local, LOCAL_ACTIONS), global: pick(saved.global, GLOBAL_ACTIONS), globalEnabled: saved.globalEnabled !== false };
}

export function useShortcuts() {
  const [state, setState] = useState(load);
  const [failed, setFailed] = useState([]);
  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
    if (!window.desktop?.setGlobalShortcuts) return;
    const keys = {};
    for (const [id, combo] of Object.entries(state.global)) keys[id] = combo ? toAccelerator(combo) : '';
    let alive = true;
    window.desktop.setGlobalShortcuts({ enabled: state.globalEnabled, keys }).then(result => { if (alive) setFailed(Array.isArray(result) ? result : []); }).catch(() => {});
    return () => { alive = false; };
  }, [state]);
  const localIndex = useMemo(() => {
    const index = {};
    for (const [id, combo] of Object.entries(state.local)) if (combo) index[combo] = id;
    return index;
  }, [state.local]);
  return {
    ...state,
    failed,
    localActionFor: combo => localIndex[combo],
    update: patch => setState(s => ({ ...s, ...patch })),
    reset: scope => setState(s => ({ ...s, [scope]: defaults(scope === 'local' ? LOCAL_ACTIONS : GLOBAL_ACTIONS) })),
  };
}
