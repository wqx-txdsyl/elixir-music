import React,{useEffect,useState} from 'react';
import {Disc,MusicNotes,CircleNotch,WarningCircle,ArrowsClockwise} from '@phosphor-icons/react';
import {mediaUrl} from './api';

export const IconButton = ({ icon: Icon, title, active, className = '', ...props }) => <button type="button" title={title} aria-label={title} aria-pressed={active === undefined ? undefined : !!active} className={'icon-button ' + (active ? 'active ' : '') + className} {...props}><Icon size={21} weight={active ? 'fill' : 'regular'} /></button>;
export function Cover({ src, title = '', className = '' }) { const [failed, setFailed] = useState(false); useEffect(() => setFailed(false), [src]); return <div className={'cover ' + className}>{src && !failed ? <img src={mediaUrl(src)} alt={title ? title + ' 封面' : ''} onError={() => setFailed(true)} loading="lazy" /> : <Disc size={36} weight="light" />}</div>; }

// 空态：默认是带图标的大块留白；compact 只有一行标题，用在列表区域下方。
export function Empty({ icon: Icon = MusicNotes, title, text, action, compact, className = '' }) {
  return <div className={'empty ' + (compact ? 'empty-compact ' : '') + className}>{!compact && <div className="empty-icon"><Icon size={44} weight="light" /></div>}<h3>{title}</h3>{text && <p>{text}</p>}{action}</div>;
}
// 加载中：转圈加文字，向读屏播报；compact 贴在内容区顶部而不是占满一屏。
export function Loading({ text = '正在加载…', compact, className = '' }) {
  return <div className={'loading ' + (compact ? 'loading-compact ' : '') + className} role="status" aria-live="polite"><CircleNotch className="spin" size={compact ? 16 : 25} aria-hidden="true" /><span>{text}</span></div>;
}
// 骨架占位：读取中先把版面撑住。
export function Skeleton({ count = 4, label = '正在加载', className = '' }) {
  return <div className={'skeleton ' + className} role="status" aria-label={label} aria-busy="true">{Array.from({ length: count }, (_, i) => <i key={i} />)}</div>;
}
// 轻提示：一句话说明、来源备注、小范围的「暂无」。tight 去掉上下留白，centered 居中。
export function Note({ children, className = '', ...props }) { return <p className={'note ' + className} role="status" {...props}>{children}</p>; }
// 出错：图标加文字，可带标题和重试按钮。
export function ErrorNote({ title, children, retry, retryText = '重试', className = '' }) {
  return <div className={'error-note ' + className} role="alert"><WarningCircle size={19} aria-hidden="true" /><div className="error-note-body">{title && <strong>{title}</strong>}<span>{children}</span>{retry && <button type="button" className="button quiet" onClick={retry}><ArrowsClockwise size={16} />{retryText}</button>}</div></div>;
}
// 分页：items 为 [id, 标签, 角标]，假值项自动跳过；选中态只写 aria-selected，样式按属性选择器走。
export function Tabs({ value, onChange, items, label, className = 'music-type-tabs' }) {
  return <div className={className} role="tablist" aria-label={label}>{items.filter(Boolean).map(([id, name, badge]) => <button type="button" key={id} role="tab" aria-selected={value === id} onClick={() => onChange(id)}>{name}{badge || null}</button>)}</div>;
}
