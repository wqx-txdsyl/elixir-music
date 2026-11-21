import { useState } from 'react';
import { LOCAL_ACTIONS, GLOBAL_ACTIONS, comboFromEvent, comboParts, isGlobalCombo } from './shortcuts';
import './shortcuts.css';

const SCOPE_NAME = { local: '应用内', global: '全局' };
const nameOf = (scope, id) => (scope === 'local' ? LOCAL_ACTIONS : GLOBAL_ACTIONS).find(a => a.id === id)?.name || id;

// 设置页里的快捷键编辑：点一下按键位置进入录入，按下组合键即保存；Esc 取消，Backspace 清空。
export default function ShortcutSettings({ shortcuts }) {
  const [capturing, setCapturing] = useState(null);
  const [note, setNote] = useState('');
  const desktop = !!window.desktop?.setGlobalShortcuts;

  function assign(scope, id, combo) {
    const map = { ...shortcuts[scope] };
    let message = '';
    if (combo) {
      for (const [other, value] of Object.entries(map)) if (value === combo && other !== id) { map[other] = ''; message = '已从「' + nameOf(scope, other) + '」移走这个组合键'; }
      const across = scope === 'local' ? 'global' : 'local';
      const clash = Object.entries(shortcuts[across]).find(([, value]) => value === combo);
      if (clash) message = SCOPE_NAME[across] + '快捷键「' + nameOf(across, clash[0]) + '」也用了这个组合，全局的会先响应';
    }
    map[id] = combo;
    shortcuts.update({ [scope]: map });
    setNote(message);
  }
  function keydown(e, scope, id) {
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') { setCapturing(null); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { assign(scope, id, ''); setCapturing(null); return; }
    const combo = comboFromEvent(e);
    if (!combo) return;
    if (scope === 'global' && !isGlobalCombo(combo)) { setNote('全局快捷键要带 Ctrl / Alt / Shift / Win，或者用功能键、媒体键'); return; }
    assign(scope, id, combo);
    setCapturing(null);
  }

  const group = (scope, actions, head) => (
    <div className={'shortcut-group' + (scope === 'global' && !shortcuts.globalEnabled ? ' off' : '')}>
      <div className="shortcut-group-head">{head}<button type="button" className="button quiet" onClick={() => { shortcuts.reset(scope); setNote(''); }}>恢复默认</button></div>
      <dl className="shortcut-list">
        {actions.map(a => {
          const combo = shortcuts[scope][a.id];
          const active = capturing?.scope === scope && capturing.id === a.id;
          const taken = scope === 'global' && combo && shortcuts.failed.includes(a.id);
          return <div key={a.id}>
            <dt>{a.name}{taken && <em className="shortcut-warn">被其他程序占用</em>}</dt>
            <dd><button type="button" className={'shortcut-key' + (active ? ' capturing' : '') + (combo ? '' : ' empty')} aria-label={a.name + ' 快捷键'} title="点击后按下新的组合键"
              onClick={() => { setCapturing({ scope, id: a.id }); setNote(''); }}
              onKeyDown={active ? e => keydown(e, scope, a.id) : undefined}
              onBlur={() => { if (active) setCapturing(null); }}>
              {active ? <span className="shortcut-hint">按下组合键 · Esc 取消 · Backspace 清除</span> : combo ? comboParts(combo).map((p, i) => <kbd key={i}>{p}</kbd>) : <span className="shortcut-hint">未设置</span>}
            </button></dd>
          </div>;
        })}
      </dl>
    </div>
  );

  return <div className="shortcut-settings">
    {group('local', LOCAL_ACTIONS, <div><h3>应用内快捷键</h3><p>窗口处于前台时生效；在输入框里只有命令面板、搜索和前进后退会响应。</p></div>)}
    <p className="shortcut-fixed"><span><kbd>Esc</kbd> 关闭弹层、退出编辑</span><span><kbd>Ctrl</kbd><kbd>Z</kbd> 撤销外观修改</span></p>
    {desktop
      ? group('global', GLOBAL_ACTIONS, <>
          <div><h3>全局快捷键</h3><p>切到别的程序也能控制播放；和系统或其他软件冲突的会提示占用。</p></div>
          <button type="button" role="switch" aria-label="启用全局快捷键" aria-checked={shortcuts.globalEnabled} className={'eq-switch ' + (shortcuts.globalEnabled ? 'on' : '')} onClick={() => shortcuts.update({ globalEnabled: !shortcuts.globalEnabled })}><span /></button>
        </>)
      : <p className="shortcut-note">全局快捷键只在桌面版可用。</p>}
    {note && <p className="shortcut-note">{note}</p>}
  </div>;
}
