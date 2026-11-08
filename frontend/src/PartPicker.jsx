import React from 'react';
import { Check } from '@phosphor-icons/react';
import { SLOT_MAP } from './components.mjs';
import { PartArt, effectivePart } from './PartArt';

// 「跟随皮肤」时实际用的是哪种样式，用来在卡片上写明。
export function nativeName(resolved, key) {
  const def = SLOT_MAP[key];
  const id = effectivePart({ ...resolved, parts: { ...resolved.parts, [key]: 'native' } }, key);
  return def?.variants.find(([v]) => v === id)?.[1] || '皮肤原样';
}

// 某个部件现在用的样式名；「跟随皮肤」时附上实际样式。
export function currentName(look, resolved, key) {
  const def = SLOT_MAP[key];
  const value = look.components[key];
  if (value === 'native') return '跟随皮肤 · ' + nativeName(resolved, key);
  return def?.variants.find(([v]) => v === value)?.[1] || value;
}

// 一个部件的全部样式，每种样式带一张示意图。工坊和布局编辑共用。
export function VariantGrid({ slot, look, resolved, onChange, hideImage = true, compact = false }) {
  const def = SLOT_MAP[slot];
  if (!def) return null;
  const value = look.components[slot];
  const variants = def.variants.filter(([id]) => !(hideImage && slot === 'background' && id === 'image' && !look.backgroundImage));
  return <div className={'variant-grid' + (compact ? ' compact' : '')} role="radiogroup" aria-label={def.title}>
    {variants.map(([id, name, from]) => {
      const chosen = value === id;
      const removed = def.removable === id;
      return <button type="button" key={id} role="radio" aria-checked={chosen} className={'variant-card' + (chosen ? ' chosen' : '') + (removed ? ' removed' : '')} onClick={() => onChange(slot, id)} title={from || ''}>
        <span className="variant-art"><PartArt slot={slot} value={id} resolved={resolved} />{chosen && <Check className="variant-check" size={14} weight="bold" />}</span>
        <strong>{name}</strong>
        <small>{id === 'native' ? '现在是' + nativeName(resolved, slot) : from || (removed ? '整个去掉' : ' ')}</small>
      </button>;
    })}
  </div>;
}

// 一个部件的标题、当前样式和全部可选样式。
export function SlotPanel({ slot, look, resolved, onChange, compact = false, note }) {
  const def = SLOT_MAP[slot];
  if (!def) return null;
  const value = look.components[slot];
  const hasNative = def.variants.some(([id]) => id === 'native');
  return <section className={'slot-panel' + (compact ? ' compact' : '')} aria-label={def.title}>
    <header>
      <div><strong>{def.title}</strong><small>{note || currentName(look, resolved, slot)}</small></div>
      {hasNative && value !== 'native' && <button type="button" className="slot-reset" onClick={() => onChange(slot, 'native')}>恢复皮肤原样</button>}
    </header>
    <VariantGrid slot={slot} look={look} resolved={resolved} onChange={onChange} compact={compact} />
  </section>;
}
