import { useCallback, useLayoutEffect, useRef } from 'react';

// 灵动岛浮在内容区顶部正中。顶栏里只要有按钮、搜索框等落在它下面，就给顶栏打上 data-island=clear，
// 由样式把顶栏往下让；不会碰到时顶栏保持原位。
const ITEMS = '.top-nav-brand, .top-nav-item, .topbar-navigation > *, .search-box, .topbar-account > *';
const MARGIN_X = 12, MARGIN_Y = 4;

const visible = el => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' ? r : null;
};

// 导航项可能滚出 .top-nav 的可视范围，只算露在外面的那段。
const clip = (r, box) => {
  if (!box) return r;
  const left = Math.max(r.left, box.left), right = Math.min(r.right, box.right);
  return right > left ? { left, right, top: r.top, bottom: r.bottom } : null;
};

export function useIslandClear(deps) {
  const current = useRef(null);
  const measure = useCallback(() => {
    const bar = current.current?.bar;
    const app = bar?.closest('.app');
    if (!bar || !app) return;
    const island = app.getAttribute('data-player') === 'island' ? app.querySelector(':scope > .player') : null;
    if (!island) { delete bar.dataset.island; return; }
    // 展开时是盖在内容上的浮层，量到的尺寸不是收起状态，保持上次的结果。
    if (island.matches(':hover, :focus-within')) return;
    const before = bar.dataset.island;
    delete bar.dataset.island;
    const isle = visible(island);
    let clash = false;
    if (isle) {
      const navBox = bar.querySelector('.top-nav');
      const navRect = navBox && visible(navBox);
      for (const el of bar.querySelectorAll(ITEMS)) {
        let r = visible(el);
        if (r && navBox?.contains(el)) r = clip(r, navRect);
        if (!r) continue;
        if (r.right > isle.left - MARGIN_X && r.left < isle.right + MARGIN_X
          && r.bottom > isle.top - MARGIN_Y && r.top < isle.bottom + MARGIN_Y) { clash = true; break; }
      }
    }
    if (clash) bar.dataset.island = 'clear';
    else if (before) delete bar.dataset.island;
  }, []);
  const ref = useCallback(bar => {
    current.current?.observer?.disconnect();
    current.current = null;
    if (!bar) return;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => requestAnimationFrame(measure));
    observer?.observe(bar);
    const app = bar.closest('.app');
    if (app) observer?.observe(app);
    current.current = { bar, observer };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
  }, [measure]);
  useLayoutEffect(measure, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}
