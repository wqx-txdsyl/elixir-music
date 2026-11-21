import { useEffect, useState } from 'react';

// 安卓端识别。两种信号任一即可：
//   1. 安卓外壳用 ?platform=android 打开页面（记进 sessionStorage，页面内改地址后仍然有效）；
//   2. 外壳注入的 window.desktop.platform === 'android'——注入可能晚于页面脚本，所以加载完成后再补判几次。
// 桌面版（Electron 或浏览器）两种信号都没有，下面的标记一个也不会写，界面保持原样。
const query = new URLSearchParams(location.search);
if (query.get('platform') === 'android') sessionStorage.setItem('elixir-platform', 'android');
// 调试用：?device=phone|tablet 强制设备类型（只在安卓模式下有意义）。
if (['phone', 'tablet'].includes(query.get('device'))) sessionStorage.setItem('elixir-device', query.get('device'));

const detectAndroid = () => sessionStorage.getItem('elixir-platform') === 'android' || window.desktop?.platform === 'android';

// 手机还是平板按屏幕短边判断（600dp 为界），不看视口高度：输入法弹出会压低视口，不能因此把平板当成手机。
// 视口长边也参与：平板分屏把窗口压窄到手机宽度时按手机排。
function measure() {
  const forced = sessionStorage.getItem('elixir-device');
  const shortest = Math.min(screen.width || innerWidth, screen.height || innerHeight, Math.max(innerWidth, innerHeight));
  return {
    android: true,
    device: forced || (shortest < 600 ? 'phone' : 'tablet'),
    orientation: innerWidth > innerHeight ? 'landscape' : 'portrait',
  };
}

const DESKTOP = { android: false, device: 'desktop', orientation: 'landscape' };
let state = DESKTOP;
const listeners = new Set();

function apply() {
  const root = document.documentElement;
  root.dataset.platform = 'android';
  root.dataset.device = state.device;
  root.dataset.orientation = state.orientation;
}
function update() {
  const next = measure();
  if (next.device === state.device && next.orientation === state.orientation && state.android) return;
  state = next; apply(); listeners.forEach(fn => fn(state));
}
function enable() {
  if (state.android) return;
  sessionStorage.setItem('elixir-platform', 'android');
  update();
  addEventListener('resize', update);
  screen.orientation?.addEventListener?.('change', update);
}

if (detectAndroid()) enable();
else {
  // 晚注入的 window.desktop：首帧、load 之后和稍后各补判一次，判到就切换，之后不再检查。
  const recheck = () => { if (!state.android && detectAndroid()) enable(); };
  requestAnimationFrame(recheck);
  addEventListener('load', () => { recheck(); setTimeout(recheck, 300); setTimeout(recheck, 1500); }, { once: true });
  addEventListener('elixir-platform', recheck);
}

export const isAndroid = () => state.android;

export function useDevice() {
  const [value, setValue] = useState(state);
  useEffect(() => {
    listeners.add(setValue); setValue(state);
    return () => listeners.delete(setValue);
  }, []);
  return value;
}
