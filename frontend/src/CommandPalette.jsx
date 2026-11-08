import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlass, ArrowElbowDownLeft } from '@phosphor-icons/react';

// Ctrl K: one box for searching music, jumping to pages, switching skins and swapping parts.
// `commands` is a flat list of { id, group, title, hint, keywords, run }.
export default function CommandPalette({ commands, onSearch, onClose }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef(null), list = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const matched = words.length ? commands.filter(c => { const text = (c.group + ' ' + c.title + ' ' + (c.hint || '') + ' ' + (c.keywords || '')).toLowerCase(); return words.every(w => text.includes(w)); }) : commands.filter(c => c.featured);
    const search = q ? [{ id: 'search', group: '搜索', title: '搜索「' + query.trim() + '」', hint: '在所有平台搜索歌曲', run: () => onSearch(query.trim()) }] : [];
    // Commands first when something matches; otherwise Enter searches the music.
    const ranked = matched.sort((a, b) => (b.title.toLowerCase().includes(q) ? 1 : 0) - (a.title.toLowerCase().includes(q) ? 1 : 0));
    return matched.length ? [...ranked.slice(0, 59), ...search] : search;
  }, [commands, query, onSearch]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => { list.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); }, [active]);
  const run = item => { if (!item) return; onClose(); item.run(); };
  const key = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(items[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  };
  let lastGroup = '';
  return <div className="palette-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="palette" role="dialog" aria-modal="true" aria-label="命令面板">
      <label className="palette-input"><MagnifyingGlass size={20} /><input ref={input} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={key} placeholder="搜索音乐，或输入：皮肤、播放栏、首页、方案、暂停…" aria-label="命令" aria-controls="palette-list" aria-activedescendant={items[active] ? 'palette-' + active : undefined} /><kbd>Esc</kbd></label>
      <div className="palette-list" id="palette-list" role="listbox" ref={list}>
        {items.length ? items.map((item, i) => {
          const head = item.group !== lastGroup ? (lastGroup = item.group) : null;
          return <React.Fragment key={item.id}>{head && <div className="palette-group">{head}</div>}
            <button id={'palette-' + i} role="option" aria-selected={i === active} className={i === active ? 'active' : ''} onMouseMove={() => setActive(i)} onClick={() => run(item)}>
              {item.icon && <item.icon size={18} />}<span>{item.title}{item.hint && <small>{item.hint}</small>}</span>{item.current && <em>当前</em>}{i === active && <ArrowElbowDownLeft size={15} />}
            </button></React.Fragment>;
        }) : <p className="palette-empty">没有匹配的命令</p>}
      </div>
      <footer className="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 执行</span><span><kbd>Ctrl</kbd><kbd>K</kbd> 随时打开</span></footer>
    </div>
  </div>;
}
