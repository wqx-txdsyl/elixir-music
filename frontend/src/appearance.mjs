// The appearance profile: which skin is on, which parts replace the skin's own, colour and type
// tuning, and the listener's saved looks. Pure functions only; the React side lives in useAppearance.
import { SKINS, SKIN_MAP, LEGACY_THEMES, skinOf } from './skins.mjs';
import { COMPONENT_DEFAULTS, SLOT_MAP, TUNING_DEFAULTS, NAV_DEFAULT, NAV_HIDDEN_DEFAULT, HOME_DEFAULT, HOME_MODULES, NAV_ITEMS } from './components.mjs';

export const PROFILE_KEY = 'elixir-appearance-v2';
export const PROFILE_VERSION = 2;
const LOOK_KEYS = ['skin', 'components', 'tuning', 'nav', 'homeModules', 'customCss', 'backgroundImage'];
const HEX = /^#[0-9a-f]{6}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const pick = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const variantIds = key => SLOT_MAP[key].variants.map(([id]) => id);

export function defaultLook(skin = 'netease') {
  return { skin: SKIN_MAP[skin] ? skin : 'netease', components: { ...COMPONENT_DEFAULTS }, tuning: { ...TUNING_DEFAULTS }, nav: { order: [...NAV_DEFAULT], hidden: [...NAV_HIDDEN_DEFAULT] }, homeModules: HOME_DEFAULT.map(m => ({ ...m })), customCss: '', backgroundImage: '' };
}

export function defaultProfile(skin) {
  return { version: PROFILE_VERSION, ...defaultLook(skin), saved: [], schedule: { enabled: false, day: '', night: '', dayAt: '07:00', nightAt: '19:00', last: '' } };
}

// Accepts anything (old versions, hand-edited files, share codes) and returns a valid look.
export function normalizeLook(raw = {}) {
  const base = defaultLook(raw.skin);
  const components = { ...base.components };
  for (const key of Object.keys(COMPONENT_DEFAULTS)) components[key] = pick(raw.components?.[key], variantIds(key), COMPONENT_DEFAULTS[key]);
  const t = raw.tuning || {};
  const tuning = {
    accent: t.accent === 'cover' || HEX.test(t.accent || '') ? t.accent.toLowerCase() : 'skin',
    radius: pick(t.radius, ['native', 'sharp', 'round'], 'native'),
    font: pick(t.font, ['native', 'sans', 'serif', 'rounded', 'mono'], 'native'),
    density: pick(t.density, ['native', 'compact', 'comfy'], 'native'),
    scale: Math.min(120, Math.max(85, Math.round((Number(t.scale) || 100) / 5) * 5)),
    motion: pick(t.motion, ['full', 'reduced'], 'full'),
    contrast: pick(t.contrast, ['normal', 'high'], 'normal'),
  };
  const known = NAV_ITEMS.map(([key]) => key);
  const order = [...new Set([...(Array.isArray(raw.nav?.order) ? raw.nav.order : []).filter(k => known.includes(k)), ...known])];
  const hidden = (Array.isArray(raw.nav?.hidden) ? raw.nav.hidden : NAV_HIDDEN_DEFAULT).filter(k => known.includes(k) && k !== 'studio');
  const moduleKeys = HOME_MODULES.map(([key]) => key);
  const listed = (Array.isArray(raw.homeModules) ? raw.homeModules : []).filter(m => moduleKeys.includes(m?.key));
  const homeModules = [...listed.map(m => ({ key: m.key, on: m.on !== false })), ...HOME_DEFAULT.filter(m => !listed.some(l => l.key === m.key))]
    .filter((m, i, all) => all.findIndex(x => x.key === m.key) === i);
  const customCss = typeof raw.customCss === 'string' ? raw.customCss.slice(0, 20000) : '';
  const backgroundImage = typeof raw.backgroundImage === 'string' && raw.backgroundImage.startsWith('data:image/') && raw.backgroundImage.length < 3_000_000 ? raw.backgroundImage : '';
  return { skin: base.skin, components, tuning, nav: { order, hidden }, homeModules, customCss, backgroundImage };
}

export function normalizeProfile(raw = {}) {
  const look = normalizeLook(raw);
  const saved = (Array.isArray(raw.saved) ? raw.saved : []).filter(s => s && typeof s.name === 'string').slice(0, 40)
    .map(s => ({ id: String(s.id || 'style-' + Math.random().toString(36).slice(2, 9)), name: s.name.slice(0, 40) || '未命名方案', created: Number(s.created) || Date.now(), look: normalizeLook(s.look) }));
  const s = raw.schedule || {};
  const ref = value => typeof value === 'string' && (value.startsWith('skin:') ? !!SKIN_MAP[value.slice(5)] : saved.some(x => x.id === value)) ? value : '';
  const schedule = { enabled: !!s.enabled, day: ref(s.day), night: ref(s.night), dayAt: TIME.test(s.dayAt || '') ? s.dayAt : '07:00', nightAt: TIME.test(s.nightAt || '') ? s.nightAt : '19:00', last: ['day', 'night'].includes(s.last) ? s.last : '' };
  return { version: PROFILE_VERSION, ...look, saved, schedule };
}

// First start on 2.0: carry over the 1.x theme choice.
export function loadProfile(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(PROFILE_KEY);
    if (stored) return { profile: normalizeProfile(JSON.parse(stored)), migrated: false };
  } catch { /* fall through to a fresh profile */ }
  const legacy = storage?.getItem('musicplatform-theme');
  const profile = defaultProfile(LEGACY_THEMES.includes(legacy) ? legacy : 'netease');
  const visualizer = storage?.getItem('elixir-visualizer');
  if (['bars', 'wave', 'ring', 'off'].includes(visualizer)) profile.components.visualizer = visualizer;
  return { profile, migrated: true };
}

export function saveProfile(profile, storage = globalThis.localStorage) {
  try { storage?.setItem(PROFILE_KEY, JSON.stringify(profile)); return true; } catch { return false; }
}

export const lookOf = profile => Object.fromEntries(LOOK_KEYS.map(key => [key, structuredClone(profile[key])]));

// What is actually on screen: the listener's choice where they made one, otherwise the skin's pick.
export function resolveLook(look) {
  const skin = skinOf(look.skin), d = skin.defaults || {};
  const parts = {};
  for (const [key, value] of Object.entries(look.components)) parts[key] = value === 'native' && d[key] ? d[key] : value;
  const tuning = { ...look.tuning };
  if (tuning.radius === 'native' && d.radius) tuning.radius = d.radius;
  if (tuning.font === 'native' && d.font) tuning.font = d.font;
  if (tuning.density === 'native' && d.density) tuning.density = d.density;
  // The sidebar is the only home of the navigation unless a top navigation replaces it.
  const frame = ['sidebar', 'side', 'topbar', 'player'].some(key => parts[key] !== 'native' && parts[key] !== 'left') || parts.panel === 'on';
  return { skin, parts, tuning, frame };
}

// Home layout and now-playing style when the skin's own is kept.
export const homeLayout = resolved => resolved.parts.home === 'native' ? (['netease', 'qqmusic', 'spotify', 'aurora', 'ink', 'apple'].includes(resolved.skin.base) ? resolved.skin.base : 'netease') : resolved.parts.home;
export function nowPlayingStyle(resolved) {
  const np = resolved.parts.np;
  if (np !== 'native') return np;
  return { netease: 'vinyl', apple: 'immersive', qqmusic: 'immersive' }[resolved.skin.base] || 'cover';
}
export function visualizerStyle(resolved) {
  const v = resolved.parts.visualizer;
  if (v !== 'native') return v;
  return { netease: 'ring', qqmusic: 'bars', spotify: 'wave', aurora: 'ring', ink: 'wave', apple: 'off' }[resolved.skin.base] || 'bars';
}

// ---- schedule (day / night looks) ----
const minutes = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export function schedulePeriod(schedule, date = new Date()) {
  const now = date.getHours() * 60 + date.getMinutes(), day = minutes(schedule.dayAt), night = minutes(schedule.nightAt);
  if (day === night) return 'day';
  return day < night ? (now >= day && now < night ? 'day' : 'night') : (now >= night && now < day ? 'night' : 'day');
}
export function lookForRef(profile, ref) {
  if (!ref) return null;
  if (ref.startsWith('skin:')) return { ...lookOf(profile), skin: ref.slice(5) };
  return profile.saved.find(s => s.id === ref)?.look || null;
}

// ---- sharing ----
const toBase64 = text => typeof btoa === 'function' ? btoa(String.fromCharCode(...new TextEncoder().encode(text))) : Buffer.from(text, 'utf8').toString('base64');
const fromBase64 = code => typeof atob === 'function' ? new TextDecoder().decode(Uint8Array.from(atob(code), c => c.charCodeAt(0))) : Buffer.from(code, 'base64').toString('utf8');

// A short code without the background picture, so it fits in a chat message.
export function shareCode(look) {
  const { backgroundImage, ...rest } = normalizeLook(look);
  return 'ELIXIR2:' + toBase64(JSON.stringify(rest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function parseShared(text) {
  const value = String(text || '').trim();
  if (!value) throw new Error('内容为空');
  let data;
  if (value.startsWith('ELIXIR2:')) {
    const code = value.slice(8).replace(/-/g, '+').replace(/_/g, '/');
    try { data = JSON.parse(fromBase64(code + '='.repeat((4 - code.length % 4) % 4))); } catch { throw new Error('分享码已损坏，请完整复制后再试'); }
  } else {
    try { data = JSON.parse(value); } catch { throw new Error('不是 Elixir 外观文件或分享码'); }
    if (data.format === 'elixir-appearance') data = data.look;
  }
  if (!data || typeof data !== 'object' || !SKIN_MAP[data.skin]) throw new Error('无法识别的外观方案');
  return normalizeLook(data);
}
export const exportFile = (look, name = '我的方案') => JSON.stringify({ format: 'elixir-appearance', version: PROFILE_VERSION, name, look: normalizeLook(look) }, null, 2);

// ---- colour helpers ----
export function hexToRgb(hex) { const n = parseInt(hex.slice(1, 7), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
export const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
function luminance([r, g, b]) { const c = [r, g, b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
export const contrastText = hex => luminance(hexToRgb(hex)) > .45 ? '#141414' : '#ffffff';
export function mix(hex, other, amount) { const a = hexToRgb(hex), b = hexToRgb(other); return rgbToHex(...a.map((v, i) => v + (b[i] - v) * amount)); }
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hslToHex(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
// Picks the most vivid well-represented colour of a small RGBA pixel buffer, tuned to read on the skin.
export function accentFromPixels(data, dark) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (s < .22 || l < .12 || l > .9) continue;
    const key = Math.round(h / 20) % 18, b = buckets.get(key) || { n: 0, h: 0, s: 0 };
    b.n++; b.h += h; b.s += s; buckets.set(key, b);
  }
  let best = null;
  for (const b of buckets.values()) { const score = b.n * (b.s / b.n); if (!best || score > best.score) best = { score, h: b.h / b.n, s: b.s / b.n }; }
  if (!best || best.score < 3) return '';
  return hslToHex(best.h, Math.min(.85, Math.max(.5, best.s)), dark ? .62 : .46);
}

// Every newer skin gets its palette from its swatch first, so a skin is recognisable even before
// (or without) a stylesheet of its own. `:where` keeps these rules weaker than any real skin rule.
export function swatchVars(skin) {
  const { bg, side, panel, accent, text } = skin.swatch, solid = c => c.slice(0, 7), dark = skin.scheme === 'dark';
  return {
    '--bg': bg, '--sidebar': side, '--panel': panel, '--text': text,
    '--muted': mix(solid(text), solid(bg), .48), '--subtle': mix(solid(text), solid(bg), .26),
    '--line': solid(text) + (dark ? '1a' : '14'), '--hover': solid(text) + (dark ? '12' : '0b'), '--chip': solid(text) + (dark ? '14' : '0d'),
    '--accent': accent, '--accent-tint': solid(accent) + (dark ? '2e' : '1c'), '--accent-hover': mix(solid(accent), dark ? '#ffffff' : '#000000', .12),
    '--accent-text': contrastText(solid(accent)), 'color-scheme': dark ? 'dark' : 'light',
  };
}
const NL = String.fromCharCode(10);
export function swatchCss(skins = SKINS) {
  return '@layer skins {' + NL + skins.filter(skin => !skin.legacy).map(skin =>
    `:root:where([data-skin=${skin.id}]){${Object.entries(swatchVars(skin)).map(([k, v]) => k + ':' + v).join(';')}}${NL}` +
    `:root:where([data-skin=${skin.id}]) :where(.app){background:${skin.swatch.bg};color:${skin.swatch.text}}`
  ).join(NL) + NL + '}';
}
