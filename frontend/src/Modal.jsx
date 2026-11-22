import React, { useEffect, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { IconButton } from './ui';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])';

// 通用弹窗：打开时把焦点移进来，Tab 只在弹窗内循环，Esc 关闭，关闭后焦点回到打开前的位置。
// 弹窗里输入过内容后，点遮罩不再关闭，避免误触丢掉正在填的内容（Esc 与右上角关闭照常可用）。
export default function Modal({ title, children, onClose, wide }) {
  const box = useRef(null), close = useRef(onClose), dirty = useRef(false);
  close.current = onClose;
  // 在首次渲染时记下打开前的焦点：子元素的 autoFocus 会在 effect 之前把焦点移进弹窗
  const [previous] = useState(() => document.activeElement);
  useEffect(() => {
    const node = box.current;
    // 带 autoFocus 的输入框此时已拿到焦点；否则把焦点放在弹窗本身，读屏会先读标题
    if (node && !node.contains(document.activeElement)) node.focus({ preventScroll: true });
    const key = e => {
      if (!node || e.isComposing || e.keyCode === 229) return;
      const active = document.activeElement;
      // 焦点在弹窗外（上面又叠了确认框、命令面板等）时交给那一层处理
      if (active && active !== document.body && !node.contains(active)) return;
      if (e.key === 'Escape') {
        if (node.querySelector('[aria-expanded="true"]')) return; // 先让弹窗里展开的下拉菜单自己收起
        e.preventDefault(); e.stopPropagation(); close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length);
      if (!items.length) { e.preventDefault(); node.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (active === first || active === node)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      if (previous?.isConnected && typeof previous.focus === 'function') previous.focus({ preventScroll: true });
    };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !dirty.current) onClose(); }}>
    <section ref={box} tabIndex={-1} className={'modal ' + (wide ? 'modal-wide' : '')} role="dialog" aria-modal="true" aria-label={title} onInput={() => { dirty.current = true; }}>
      <div className="modal-head"><h2>{title}</h2><IconButton icon={X} title="关闭" onClick={onClose} /></div>
      {children}
    </section>
  </div>;
}
