import { useCallback, useLayoutEffect, useRef } from 'react';

// 顶部导航放不下时逐级收起：full（图标+文字）→ compact（只有选中项带文字）→ icons（全部只留图标）。
// 每次尺寸变化都从 full 重新量，所以窗口变宽后会自动展开。直接改 DOM 属性，不触发重新渲染。
// 返回回调 ref：导航元素挂上时开始监听，卸下时停止；deps 变化（换皮肤、换部件、切页面）时重新量一次。
const LEVELS = ['full', 'compact', 'icons'];

function overflowing(nav, bar) {
  if (nav.scrollWidth > nav.clientWidth + 1 || bar.scrollWidth > bar.clientWidth + 1) return true;
  // 有的皮肤顶栏会被内容撑宽、再由外层裁掉，光看顶栏自己的 scrollWidth 测不出来，所以拿子元素的右边缘和可见范围比。
  let limit = Math.min(bar.getBoundingClientRect().right, window.innerWidth);
  for (let p = bar.parentElement; p && p !== document.body; p = p.parentElement) {
    if (getComputedStyle(p).overflowX !== 'visible') limit = Math.min(limit, p.getBoundingClientRect().right);
  }
  return [...bar.children].some(child => child.getBoundingClientRect().right > limit + 1);
}

export function useNavFit(deps) {
  const current = useRef(null);
  const fit = useCallback(() => {
    const nav = current.current?.nav;
    const bar = nav?.parentElement;
    if (!nav || !bar) return;
    if (getComputedStyle(nav).display === 'none') { nav.dataset.fit = 'full'; return; }
    for (const level of LEVELS) {
      nav.dataset.fit = level;
      if (!overflowing(nav, bar)) break;
    }
  }, []);
  const ref = useCallback(nav => {
    current.current?.observer?.disconnect();
    current.current = null;
    if (!nav) return;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => requestAnimationFrame(fit));
    observer?.observe(nav.parentElement);
    current.current = { nav, observer };
    fit();
    document.fonts?.ready.then(fit).catch(() => {});
  }, [fit]);
  useLayoutEffect(fit, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}
