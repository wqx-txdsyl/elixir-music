import React, { useMemo, useRef, useState } from 'react';
import { ArrowCounterClockwise, ArrowDown, ArrowUp, CheckCircle, Copy, DownloadSimple, Eye, EyeSlash, FloppyDisk, ImageSquare, MagicWand, PaintBrush, PencilSimple, PuzzlePiece, Shuffle, SquaresFour, Trash, UploadSimple, X } from '@phosphor-icons/react';
import PageHero from './PageHero';
import { SKINS, SKIN_GROUPS } from './skins.mjs';
import { SLOTS, SLOT_MAP, SLOT_GROUPS, TUNING, ACCENT_PRESETS, LAYOUT_PRESETS, NAV_ITEMS, HOME_MODULES, COMPONENT_DEFAULTS, randomParts } from './components.mjs';
import { shareCode, parseShared, exportFile } from './appearance.mjs';
import { SkinPreview } from './Parts';
import { PartArt, WindowDiagram, effectivePart } from './PartArt';
import { SlotPanel, currentName } from './PartPicker';

const TABS = [['skins', '皮肤'], ['parts', '组件'], ['tuning', '色彩与字体'], ['nav', '导航与首页'], ['saved', '我的方案'], ['share', '分享与高级']];
const TAB_KEY = 'elixir-studio-tab';
const NAV_NAMES = Object.fromEntries(NAV_ITEMS);
const MODULE_NAMES = Object.fromEntries(HOME_MODULES);
// 窗口示意图上点到的区域对应哪个部件。
const DIAGRAM_SLOT = { home: 'home', sidebar: 'sidebar', topbar: 'topbar', panel: 'panel', player: 'player' };

function Chips({ value, variants, onChange, label }) {
  return <div className="studio-chips" role="radiogroup" aria-label={label}>
    {variants.map(([id, name, from]) => <button type="button" key={id} role="radio" aria-checked={value === id} className={value === id ? 'chosen' : ''} onClick={() => onChange(id)} title={from || ''}>
      <strong>{name}</strong>{from && <small>{from}</small>}
    </button>)}
  </div>;
}

function Row({ title, note, children }) {
  return <div className="studio-row"><div className="studio-row-title"><strong>{title}</strong>{note && <small>{note}</small>}</div><div className="studio-row-body">{children}</div></div>;
}

function Block({ title, text, actions, children, className = '' }) {
  return <section className={'settings-section studio-block ' + className}>
    {(title || actions) && <header className="studio-block-head"><div>{title && <h2>{title}</h2>}{text && <p>{text}</p>}</div>{actions && <div className="studio-block-actions">{actions}</div>}</header>}
    {children}
  </section>;
}

function move(list, index, step) { const next = [...list], to = index + step; if (to < 0 || to >= next.length) return list; [next[index], next[to]] = [next[to], next[index]]; return next; }

export default function Studio({ appearance, notify, onEdit }) {
  const { profile, look, resolved } = appearance;
  const [tab, setTabState] = useState(() => { const saved = sessionStorage.getItem(TAB_KEY); return TABS.some(([id]) => id === saved) ? saved : 'skins'; });
  const [slot, setSlot] = useState('sidebar');
  const [styleName, setStyleName] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [importText, setImportText] = useState('');
  const [css, setCss] = useState(look.customCss);
  const fileRef = useRef(null), imageRef = useRef(null);
  const skin = resolved.skin;
  const changedSlots = SLOTS.filter(s => look.components[s.key] !== COMPONENT_DEFAULTS[s.key]);
  const refs = useMemo(() => [...SKINS.map(s => ['skin:' + s.id, '皮肤 · ' + s.name]), ...profile.saved.map(s => [s.id, '方案 · ' + s.name])], [profile.saved]);

  function setTab(id) { setTabState(id); sessionStorage.setItem(TAB_KEY, id); document.querySelector('.main-scroll')?.scrollTo({ top: 0 }); }
  function applyPreset(preset) { appearance.applyLook({ ...look, components: { ...look.components, ...preset.parts } }); notify('已换成「' + preset.name + '」布局'); }
  function lucky() { appearance.applyLook({ ...look, skin: SKINS[Math.floor(Math.random() * SKINS.length)].id, components: { ...look.components, ...randomParts() } }); notify('随机搭了一套，不喜欢可以撤销'); }
  async function copyCode() { try { await navigator.clipboard.writeText(shareCode(look)); notify('分享码已复制，发给朋友粘贴到这里即可'); } catch { notify('复制失败，请手动选择'); } }
  function importLook(text) { try { appearance.applyLook(parseShared(text)); setImportText(''); notify('已应用导入的外观'); } catch (e) { notify(e.message); } }
  function download() { const url = URL.createObjectURL(new Blob([exportFile(look, skin.name + ' 方案')], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'Elixir-外观-' + skin.name + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function readFile(file) { if (!file) return; const reader = new FileReader(); reader.onload = () => importLook(String(reader.result)); reader.readAsText(file); }
  function readImage(file) {
    if (!file) return;
    if (file.size > 2_000_000) { notify('图片太大，请选择 2 MB 以内的图片'); return; }
    const reader = new FileReader(); reader.onload = () => { appearance.setBackgroundImage(String(reader.result)); notify('已设为背景'); }; reader.readAsDataURL(file);
  }
  const presetActive = preset => Object.entries(preset.parts).every(([k, v]) => effectivePart(resolved, k) === v);

  return <div className="studio-page">
    <PageHero compact kind="studio" icon={PaintBrush} title="个性化工坊" meta={'当前皮肤：' + skin.name + ' · ' + (changedSlots.length ? '已替换 ' + changedSlots.length + ' 个组件' : '组件全部跟随皮肤') + ' · 改动即时生效，可以撤销'}
      actions={<>
        <button className="button quiet" disabled={!appearance.canUndo} onClick={appearance.undo}><ArrowCounterClockwise size={17} />撤销</button>
        <button className="button quiet" onClick={lucky}><Shuffle size={17} />手气不错</button>
        <button className="button primary" onClick={onEdit}><PuzzlePiece size={17} />在界面上拆装</button>
      </>} />

    <div className="studio-tabs" role="tablist" aria-label="工坊分类">
      {TABS.map(([id, label]) => <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}{id === 'parts' && changedSlots.length > 0 && <em>{changedSlots.length}</em>}{id === 'saved' && profile.saved.length > 0 && <em>{profile.saved.length}</em>}</button>)}
    </div>

    {tab === 'skins' && <div className="studio-pane" role="tabpanel">
      <p className="studio-lead">皮肤决定配色、质感和默认组件。换皮肤时，你单独替换过的组件会保留。</p>
      {SKIN_GROUPS.map(group => <Block key={group} title={group} className="studio-skin-group">
        <div className="studio-skins">{SKINS.filter(s => s.group === group).map(s => <button type="button" key={s.id} className={'studio-skin' + (s.id === skin.id ? ' chosen' : '')} aria-pressed={s.id === skin.id} title={s.note} onClick={() => appearance.setSkin(s.id)}>
          <SkinPreview skin={s} />
          <span className="studio-skin-name"><strong>{s.name}</strong>{s.id === skin.id && <CheckCircle size={17} weight="fill" />}</span>
          <small>{s.hint}</small>
        </button>)}</div>
      </Block>)}
    </div>}

    {tab === 'parts' && <div className="studio-pane" role="tabpanel">
      <div className="studio-workbench">
        <aside className="studio-slots">
          <div className="studio-window">
            <WindowDiagram resolved={resolved} selected={slot} onPick={key => setSlot(DIAGRAM_SLOT[key] || key)} />
            <small>点示意图里的区域，或从下面选一个部件</small>
          </div>
          {SLOT_GROUPS.map(group => <div className="studio-slot-group" key={group.key}>
            <h3>{group.title}</h3>
            {SLOTS.filter(s => s.group === group.key).map(s => {
              const value = look.components[s.key];
              const removed = s.removable && resolved.parts[s.key] === s.removable;
              return <button type="button" key={s.key} className={'studio-slot' + (slot === s.key ? ' active' : '') + (removed ? ' removed' : '')} aria-pressed={slot === s.key} onClick={() => setSlot(s.key)}>
                <PartArt slot={s.key} value={value} resolved={resolved} />
                <span><strong>{s.title}</strong><small>{removed ? '已拆下' : currentName(look, resolved, s.key)}</small></span>
                {value !== COMPONENT_DEFAULTS[s.key] && <i className="studio-slot-dot" title="已改动" />}
              </button>;
            })}
          </div>)}
          <button type="button" className="button quiet studio-reset" disabled={!changedSlots.length} onClick={() => { appearance.resetParts(); notify('组件、色彩和导航已恢复为皮肤原样'); }}><ArrowCounterClockwise size={16} />全部恢复为皮肤原样</button>
        </aside>
        <div className="studio-slot-detail">
          <SlotPanel slot={slot} look={look} resolved={resolved} onChange={appearance.setPart} note={SLOT_GROUPS.find(g => g.key === SLOT_MAP[slot]?.group)?.text} />
          {slot === 'home' && resolved.parts.home === 'modular' && <p className="studio-hint">模块化首页的区块顺序在「导航与首页」里调整。</p>}
          {slot === 'background' && <p className="studio-hint">想用自己的图片当背景，到「分享与高级」里选择图片。</p>}
        </div>
      </div>
      <Block title="一键布局" text="一次换掉几个部件，得到一种完整的窗口分区；只改动示意图里的框架部件。">
        <div className="studio-presets">{LAYOUT_PRESETS.map(preset => <button type="button" key={preset.id} className={'studio-preset' + (presetActive(preset) ? ' chosen' : '')} onClick={() => applyPreset(preset)} title={preset.text}>
          <WindowDiagram resolved={resolved} override={preset.parts} />
          <strong>{preset.name}</strong><small>{preset.text}</small>
        </button>)}</div>
      </Block>

    </div>}

    {tab === 'tuning' && <div className="studio-pane" role="tabpanel">
      <Block title="色彩与字体" text="这些调整叠加在任何皮肤上。">
        <Row title="强调色" note="按钮、进度条和选中项的颜色">
          <div className="studio-accents">
            <button type="button" className={'accent-option text' + (look.tuning.accent === 'skin' ? ' chosen' : '')} onClick={() => appearance.setTuning('accent', 'skin')}>跟随皮肤</button>
            <button type="button" className={'accent-option text' + (look.tuning.accent === 'cover' ? ' chosen' : '')} onClick={() => appearance.setTuning('accent', 'cover')} title="从正在播放的封面里取色，每首歌都不一样"><MagicWand size={15} />跟随封面</button>
            {ACCENT_PRESETS.map(color => <button type="button" key={color} className={'accent-option' + (look.tuning.accent === color ? ' chosen' : '')} style={{ '--swatch': color }} aria-label={'强调色 ' + color} onClick={() => appearance.setTuning('accent', color)} />)}
            <label className="accent-custom" title="自选颜色"><input type="color" value={/^#/.test(look.tuning.accent) ? look.tuning.accent : skin.swatch.accent} onChange={e => appearance.setTuning('accent', e.target.value)} /><span>自选</span></label>
          </div>
        </Row>
        {TUNING.map(t => <Row key={t.key} title={t.title}><Chips label={t.title} value={look.tuning[t.key]} variants={t.variants} onChange={value => appearance.setTuning(t.key, value)} /></Row>)}
        <Row title="界面缩放" note={look.tuning.scale + '%'}>
          <div className="studio-scale"><span>A</span><input type="range" min="85" max="120" step="5" value={look.tuning.scale} style={{ '--range': (look.tuning.scale - 85) / 35 * 100 + '%' }} onChange={e => appearance.setTuning('scale', Number(e.target.value))} aria-label="界面缩放" /><span className="big">A</span>{look.tuning.scale !== 100 && <button className="text-button" onClick={() => appearance.setTuning('scale', 100)}>还原</button>}</div>
        </Row>
        <Row title="高对比度" note="加深次要文字和分隔线">
          <Chips label="高对比度" value={look.tuning.contrast} variants={[['normal', '标准'], ['high', '高对比']]} onChange={value => appearance.setTuning('contrast', value)} />
        </Row>
      </Block>
    </div>}

    {tab === 'nav' && <div className="studio-pane" role="tabpanel">
      <p className="studio-lead">决定侧栏（或顶部导航）里出现哪些入口、按什么顺序；模块化首页的区块也在这里排。</p>
      <div className="studio-columns">
        <Block title="导航入口" className="studio-list-card">
          {look.nav.order.map((key, i) => { const hidden = look.nav.hidden.includes(key); return <div className={'studio-list-row' + (hidden ? ' off' : '')} key={key}>
            <span>{NAV_NAMES[key]}</span>
            <button className="icon-button" aria-label={'上移 ' + NAV_NAMES[key]} disabled={i === 0} onClick={() => appearance.setNav({ ...look.nav, order: move(look.nav.order, i, -1) })}><ArrowUp size={15} /></button>
            <button className="icon-button" aria-label={'下移 ' + NAV_NAMES[key]} disabled={i === look.nav.order.length - 1} onClick={() => appearance.setNav({ ...look.nav, order: move(look.nav.order, i, 1) })}><ArrowDown size={15} /></button>
            <button className="icon-button" aria-label={(hidden ? '显示 ' : '隐藏 ') + NAV_NAMES[key]} disabled={key === 'studio'} title={key === 'studio' ? '工坊入口不能隐藏，也可以用 Ctrl K 打开' : ''} onClick={() => appearance.setNav({ ...look.nav, hidden: hidden ? look.nav.hidden.filter(k => k !== key) : [...look.nav.hidden, key] })}>{hidden ? <EyeSlash size={15} /> : <Eye size={15} />}</button>
          </div>; })}
        </Block>
        <Block title="模块化首页" text={resolved.parts.home === 'modular' ? '正在使用' : '当前首页不是模块化'} className="studio-list-card">
          {resolved.parts.home !== 'modular' && <button className="button quiet studio-inline" onClick={() => appearance.setPart('home', 'modular')}><SquaresFour size={16} />换成模块化首页</button>}
          {look.homeModules.map((m, i) => <div className={'studio-list-row' + (m.on ? '' : ' off')} key={m.key}>
            <span>{MODULE_NAMES[m.key]}</span>
            <button className="icon-button" aria-label={'上移 ' + MODULE_NAMES[m.key]} disabled={i === 0} onClick={() => appearance.setHomeModules(move(look.homeModules, i, -1))}><ArrowUp size={15} /></button>
            <button className="icon-button" aria-label={'下移 ' + MODULE_NAMES[m.key]} disabled={i === look.homeModules.length - 1} onClick={() => appearance.setHomeModules(move(look.homeModules, i, 1))}><ArrowDown size={15} /></button>
            <button className="icon-button" aria-label={(m.on ? '隐藏 ' : '显示 ') + MODULE_NAMES[m.key]} onClick={() => appearance.setHomeModules(look.homeModules.map(x => x.key === m.key ? { ...x, on: !x.on } : x))}>{m.on ? <Eye size={15} /> : <EyeSlash size={15} />}</button>
          </div>)}
        </Block>
      </div>
    </div>}

    {tab === 'saved' && <div className="studio-pane" role="tabpanel">
      <Block title="我的方案" text="把当前皮肤、组件、色彩和导航存成一套方案，随时切回来。">
        <form className="studio-save" onSubmit={e => { e.preventDefault(); appearance.saveStyle(styleName.trim()); setStyleName(''); notify('方案已保存'); }}>
          <input value={styleName} maxLength={40} onChange={e => setStyleName(e.target.value)} placeholder={'方案名称，例如「深夜写代码」'} aria-label="方案名称" />
          <button className="button primary"><FloppyDisk size={16} />保存当前外观</button>
        </form>
        {profile.saved.length ? <div className="studio-saved">{profile.saved.map(s => <div className="studio-saved-card" key={s.id}>
          <SkinPreview skin={SKINS.find(x => x.id === s.look.skin) || skin} />
          {renaming === s.id ? <form onSubmit={e => { e.preventDefault(); appearance.renameStyle(s.id, e.currentTarget.elements.name.value.trim() || s.name); setRenaming(null); }}><input name="name" autoFocus defaultValue={s.name} maxLength={40} aria-label="新名称" onBlur={e => { appearance.renameStyle(s.id, e.target.value.trim() || s.name); setRenaming(null); }} /></form>
            : <strong>{s.name}</strong>}
          <small>{(SKINS.find(x => x.id === s.look.skin)?.name || '') + ' · ' + new Date(s.created).toLocaleDateString('zh-CN')}</small>
          <div className="studio-saved-actions">
            <button className="button primary" onClick={() => { appearance.applyStyle(s.id); notify('已切换到「' + s.name + '」'); }}>使用</button>
            <button className="icon-button" title="用当前外观覆盖" aria-label={'用当前外观覆盖 ' + s.name} onClick={() => { appearance.overwriteStyle(s.id); notify('已更新「' + s.name + '」'); }}><FloppyDisk size={16} /></button>
            <button className="icon-button" title="重命名" aria-label={'重命名 ' + s.name} onClick={() => setRenaming(s.id)}><PencilSimple size={16} /></button>
            <button className="icon-button" title="删除" aria-label={'删除 ' + s.name} onClick={() => { if (confirm('删除方案「' + s.name + '」？')) appearance.deleteStyle(s.id); }}><Trash size={16} /></button>
          </div>
        </div>)}</div> : <p className="studio-empty">还没有保存的方案。在上面起个名字保存，或者在界面拆装时点「存为方案」。</p>}
      </Block>
      <Block title="白天 / 夜间自动切换" text="到点自动换成指定的皮肤或方案。">
        <label className="studio-switch"><input type="checkbox" checked={profile.schedule.enabled} onChange={e => appearance.setSchedule({ enabled: e.target.checked })} /><span>开启自动切换</span></label>
        <div className={'studio-schedule-grid' + (profile.schedule.enabled ? '' : ' off')}>
          {[['day', '白天', 'dayAt'], ['night', '夜间', 'nightAt']].map(([key, label, at]) => <div key={key}>
            <span>{label}从</span><input type="time" value={profile.schedule[at]} onChange={e => appearance.setSchedule({ [at]: e.target.value })} aria-label={label + '开始时间'} /><span>开始使用</span>
            <select value={profile.schedule[key]} onChange={e => appearance.setSchedule({ [key]: e.target.value })} aria-label={label + '方案'}><option value="">保持不变</option>{refs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          </div>)}
        </div>
      </Block>
    </div>}

    {tab === 'share' && <div className="studio-pane" role="tabpanel">
      <Block title="分享与导入" text="分享码不包含背景图片，可以直接发在聊天里；导出文件包含全部内容。">
        <div className="studio-share">
          <button className="button quiet" onClick={copyCode}><Copy size={16} />复制分享码</button>
          <button className="button quiet" onClick={download}><DownloadSimple size={16} />导出外观文件</button>
          <button className="button quiet" onClick={() => fileRef.current?.click()}><UploadSimple size={16} />导入外观文件</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <form className="studio-import" onSubmit={e => { e.preventDefault(); importLook(importText); }}>
          <textarea rows={2} value={importText} onChange={e => setImportText(e.target.value)} placeholder="粘贴别人发来的 ELIXIR2: 分享码" aria-label="分享码" spellCheck="false" />
          <button className="button primary" disabled={!importText.trim()}>应用</button>
        </form>
      </Block>
      <Block title="背景图片" text="放一张自己的图当整窗背景，会自动压暗以保证文字可读。">
        <div className="studio-share">
          <button className="button quiet" onClick={() => imageRef.current?.click()}><ImageSquare size={16} />{look.backgroundImage ? '更换图片' : '选择图片'}</button>
          {look.backgroundImage && <button className="button quiet" onClick={() => appearance.setBackgroundImage('')}><X size={16} />移除</button>}
          {look.backgroundImage && <span className="studio-thumb" style={{ backgroundImage: `url("${look.backgroundImage}")` }} />}
          <input ref={imageRef} type="file" accept="image/*" hidden onChange={e => { readImage(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </Block>
      <Block title="自定义 CSS" text="写在最上层，可以改动界面上的任何东西；出错时清空即可恢复。">
        <textarea className="studio-css" rows={8} value={css} onChange={e => setCss(e.target.value)} spellCheck="false" aria-label="自定义 CSS" placeholder={'.player { border-top: 2px solid var(--accent); }\n.nav-item.selected { font-weight: 800; }'} />
        <div className="studio-row-actions"><button className="button primary" onClick={() => { appearance.setCustomCss(css); notify(css.trim() ? '自定义 CSS 已应用' : '已清空自定义 CSS'); }}>应用 CSS</button>{look.customCss && <button className="button quiet" onClick={() => { setCss(''); appearance.setCustomCss(''); }}>清空</button>}</div>
      </Block>
    </div>}
  </div>;
}
