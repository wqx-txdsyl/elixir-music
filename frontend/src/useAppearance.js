import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadProfile, saveProfile, normalizeLook, normalizeProfile, resolveLook, lookOf, lookForRef, schedulePeriod, accentFromPixels, contrastText, mix, defaultLook, swatchCss } from './appearance.mjs';
import { SKIN_MAP } from './skins.mjs';
import { mediaUrl } from './api';

const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');

// Reads the dominant colour of a cover. Covers from other hosts may refuse canvas access; then the
// skin's own accent stays.
function useCoverAccent(cover, enabled, dark) {
  const [accent, setAccent] = useState('');
  useEffect(() => {
    if (!enabled || !cover) { setAccent(''); return; }
    let alive = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 28;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, 28, 28);
        const color = accentFromPixels(ctx.getImageData(0, 0, 28, 28).data, dark);
        if (alive) setAccent(color);
      } catch { if (alive) setAccent(''); }
    };
    img.onerror = () => { if (alive) setAccent(''); };
    img.src = mediaUrl(cover);
    return () => { alive = false; };
  }, [cover, enabled, dark]);
  return accent;
}

export function useAppearance(cover) {
  const initial = useRef(null);
  if (!initial.current) initial.current = loadProfile();
  const [profile, setProfile] = useState(initial.current.profile);
  const migrated = useRef(initial.current.migrated);
  const undoStack = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [systemDark, setSystemDark] = useState(() => !!darkQuery()?.matches);
  useEffect(() => { const q = darkQuery(); if (!q) return; const on = e => setSystemDark(e.matches); q.addEventListener('change', on); return () => q.removeEventListener('change', on); }, []);

  useEffect(() => { const timer = setTimeout(() => saveProfile(profile), 250); return () => clearTimeout(timer); }, [profile]);

  // Every change to the look can be undone; saved looks and the schedule are not part of the stack.
  const changeLook = useCallback(update => {
    setProfile(old => {
      const next = normalizeProfile({ ...old, ...update(lookOf(old)) });
      if (JSON.stringify(lookOf(next)) === JSON.stringify(lookOf(old))) return old;
      undoStack.current = [...undoStack.current.slice(-29), lookOf(old)];
      setCanUndo(true);
      migrated.current = false;
      return next;
    });
  }, []);
  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    setCanUndo(undoStack.current.length > 0);
    if (previous) setProfile(old => normalizeProfile({ ...old, ...previous }));
  }, []);

  const actions = useMemo(() => ({
    setSkin: id => SKIN_MAP[id] && changeLook(look => ({ ...look, skin: id })),
    setPart: (key, value) => changeLook(look => ({ ...look, components: { ...look.components, [key]: value } })),
    setTuning: (key, value) => changeLook(look => ({ ...look, tuning: { ...look.tuning, [key]: value } })),
    setNav: nav => changeLook(look => ({ ...look, nav })),
    setHomeModules: homeModules => changeLook(look => ({ ...look, homeModules })),
    setCustomCss: customCss => changeLook(look => ({ ...look, customCss })),
    setBackgroundImage: backgroundImage => changeLook(look => ({ ...look, backgroundImage, components: { ...look.components, background: backgroundImage ? 'image' : look.components.background === 'image' ? 'native' : look.components.background } })),
    resetParts: () => changeLook(look => defaultLook(look.skin)),
    applyLook: next => changeLook(() => normalizeLook(next)),
    // Adopts the theme stored by the 1.x service, but only before the listener changed anything.
    adoptLegacy: theme => { if (migrated.current && SKIN_MAP[theme]) setProfile(old => old.skin === theme ? old : normalizeProfile({ ...old, skin: theme })); },
    saveStyle: name => setProfile(old => normalizeProfile({ ...old, saved: [{ id: 'style-' + Date.now().toString(36), name: name || '我的方案 ' + (old.saved.length + 1), created: Date.now(), look: lookOf(old) }, ...old.saved] })),
    overwriteStyle: id => setProfile(old => normalizeProfile({ ...old, saved: old.saved.map(s => s.id === id ? { ...s, look: lookOf(old) } : s) })),
    renameStyle: (id, name) => setProfile(old => normalizeProfile({ ...old, saved: old.saved.map(s => s.id === id ? { ...s, name } : s) })),
    deleteStyle: id => setProfile(old => normalizeProfile({ ...old, saved: old.saved.filter(s => s.id !== id), schedule: { ...old.schedule, day: old.schedule.day === id ? '' : old.schedule.day, night: old.schedule.night === id ? '' : old.schedule.night } })),
    applyStyle: id => setProfile(old => { const style = old.saved.find(s => s.id === id); if (!style) return old; undoStack.current = [...undoStack.current.slice(-29), lookOf(old)]; setCanUndo(true); return normalizeProfile({ ...old, ...style.look }); }),
    setSchedule: patch => setProfile(old => normalizeProfile({ ...old, schedule: { ...old.schedule, ...patch, last: '' } })),
  }), [changeLook]);

  // Day / night looks switch at the boundary times; in between the listener can still edit freely.
  useEffect(() => {
    if (!profile.schedule.enabled) return;
    const check = () => setProfile(old => {
      if (!old.schedule.enabled) return old;
      const period = schedulePeriod(old.schedule);
      if (old.schedule.last === period) return old;
      const look = lookForRef(old, old.schedule[period]);
      return normalizeProfile({ ...old, ...(look || {}), schedule: { ...old.schedule, last: period } });
    });
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [profile.schedule.enabled, profile.schedule.day, profile.schedule.night, profile.schedule.dayAt, profile.schedule.nightAt]);

  const look = useMemo(() => lookOf(profile), [profile]);
  const resolved = useMemo(() => resolveLook(look), [look]);
  const dark = resolved.skin.scheme === 'dark' || (resolved.skin.scheme === 'system' && systemDark);
  const coverAccent = useCoverAccent(cover, profile.tuning.accent === 'cover', dark);
  const accent = profile.tuning.accent === 'cover' ? coverAccent : profile.tuning.accent === 'skin' ? '' : profile.tuning.accent;

  useEffect(() => {
    if (document.getElementById('elixir-skin-swatches')) return;
    const node = document.createElement('style'); node.id = 'elixir-skin-swatches';
    node.textContent = swatchCss(); document.head.appendChild(node);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved.skin.base;
    root.dataset.skin = resolved.skin.id;
    root.dataset.scheme = dark ? 'dark' : 'light';
    try { localStorage.setItem('musicplatform-theme', resolved.skin.base); } catch { /* storage full */ }
  }, [resolved.skin, dark]);

  useEffect(() => {
    const style = document.documentElement.style;
    const keys = ['--accent', '--accent-tint', '--accent-hover', '--accent-text'];
    if (!accent) { keys.forEach(key => style.removeProperty(key)); return; }
    style.setProperty('--accent', accent);
    style.setProperty('--accent-tint', accent + (dark ? '2e' : '1c'));
    style.setProperty('--accent-hover', mix(accent, dark ? '#ffffff' : '#000000', .12));
    style.setProperty('--accent-text', contrastText(accent));
  }, [accent, dark]);

  useEffect(() => {
    const scale = resolved.tuning.scale / 100;
    if (scale === 1) document.documentElement.style.removeProperty('--ui-scale'); else document.documentElement.style.setProperty('--ui-scale', String(scale));
  }, [resolved.tuning.scale]);

  useEffect(() => {
    let node = document.getElementById('elixir-user-css');
    if (!profile.customCss.trim()) { node?.remove(); return; }
    if (!node) { node = document.createElement('style'); node.id = 'elixir-user-css'; document.head.appendChild(node); }
    node.textContent = '@layer user {\n' + profile.customCss + '\n}';
  }, [profile.customCss]);

  return { profile, look, resolved, dark, accent, canUndo, undo, ...actions };
}
