// Replaceable parts of the interface. Every part has a list of variants; `native` means "whatever
// the current skin does", so a skin keeps its own look until the listener swaps that part.
// Each variant names where the idea comes from, so the studio reads like a parts catalogue.

export const SLOT_GROUPS = [
  { key: 'frame', title: '框架', text: '决定窗口怎么分区：导航放哪、播放器放哪。' },
  { key: 'play', title: '播放', text: '播放栏、进度条和点开歌曲后的播放页。' },
  { key: 'content', title: '内容', text: '首页的排法、音浪和背景。' },
  { key: 'extra', title: '附加件', text: '可以装上也可以拆下的小部件。' },
];

export const SLOTS = [
  { key: 'sidebar', group: 'frame', title: '侧边栏', removable: 'hidden', variants: [
    ['native', '跟随皮肤'],
    ['full', '完整侧栏', '网易云 · QQ音乐 · Spotify'],
    ['rail', '图标窄栏', 'YouTube Music · TIDAL'],
    ['float', '悬浮卡片', 'Elixir'],
    ['dock', '程序坞', 'Elixir · 像桌面底部的程序坞'],
    ['hidden', '拆下，改用顶部导航', '汽水音乐'],
  ] },
  { key: 'side', group: 'frame', title: '侧栏位置', variants: [
    ['left', '左侧'],
    ['right', '右侧', 'Elixir'],
  ] },
  { key: 'topbar', group: 'frame', title: '顶栏', removable: 'hidden', variants: [
    ['native', '跟随皮肤'],
    ['full', '标准', '导航按钮 + 搜索 + 账号'],
    ['center', '搜索居中', 'Apple Music · YouTube Music'],
    ['hidden', '拆下，用 Ctrl K 搜索', 'Elixir'],
  ] },
  { key: 'player', group: 'play', title: '播放栏', removable: 'hidden', variants: [
    ['native', '跟随皮肤'],
    ['bar', '经典底栏', '网易云 · Spotify'],
    ['top', '顶部播放器', 'Apple Music · Winamp · 千千静听'],
    ['float', '悬浮胶囊', '汽水音乐 · 波点音乐'],
    ['island', '灵动岛', 'Elixir'],
    ['mini', '极简细条', 'Elixir'],
    ['hidden', '拆下，只用快捷键和命令面板', 'Elixir'],
  ] },
  { key: 'progress', group: 'play', title: '进度条', variants: [
    ['native', '跟随皮肤'],
    ['line', '细线'],
    ['thick', '粗条', '酷狗音乐 · Pandora'],
    ['edge', '贯通顶边', 'YouTube Music · Amazon Music'],
    ['wave', '声波', 'SoundCloud'],
    ['lyric', '歌词刻度', 'Elixir · 每句歌词一道刻度，副歌更高'],
  ] },
  { key: 'np', group: 'play', title: '正在播放页', variants: [
    ['native', '跟随皮肤'],
    ['vinyl', '黑胶唱机', '网易云 · 酷我音乐'],
    ['cover', '封面与歌词', 'Spotify · YouTube Music · TIDAL'],
    ['immersive', '沉浸全屏', 'Apple Music · 汽水音乐 · 咪咕音乐'],
    ['karaoke', '卡拉 OK 大字', '千千静听 · Winamp'],
    ['poster', '海报', 'Elixir'],
    ['cassette', '磁带随身听', 'Elixir'],
    ['ipod', '转盘随身听', 'iPod Classic'],
    ['cd', 'CD 随身听', 'Elixir · Discman'],
  ] },
  { key: 'lyrics', group: 'play', title: '歌词排版', variants: [
    ['native', '跟随皮肤'],
    ['center', '居中渐隐', '网易云 · QQ音乐'],
    ['left', '左对齐大字', 'Apple Music'],
    ['block', '整块色底', 'Spotify'],
    ['vertical', '竖排', 'Elixir · 古籍竖排'],
    ['focus', '提词器', 'Elixir · 只看前后几行'],
    ['single', '单行字幕', 'Elixir · 电影字幕'],
  ] },
  { key: 'home', group: 'content', title: '首页', variants: [
    ['native', '跟随皮肤'],
    ['netease', '发现音乐', '网易云 · 酷狗音乐 · 咪咕音乐'],
    ['qqmusic', '今日推荐', 'QQ音乐 · 酷我音乐 · Deezer'],
    ['spotify', '快捷磁贴', 'Spotify · YouTube Music · 波点音乐'],
    ['apple', '置顶精选', 'Apple Music · TIDAL · Pandora'],
    ['aurora', '便当格', '极光'],
    ['ink', '唱片台', '墨刻'],
    ['crate', '唱片箱', 'Elixir · 像在唱片店翻唱片'],
    ['modular', '模块化，自己排', 'Elixir'],
  ] },
  { key: 'visualizer', group: 'content', title: '音浪', removable: 'off', variants: [
    ['native', '跟随皮肤'],
    ['bars', '柱状'],
    ['mirror', '镜像柱', 'Windows Media Player'],
    ['wave', '波形'],
    ['ring', '环形', '网易云'],
    ['dots', '点阵', 'Winamp · 千千静听'],
    ['off', '拆下'],
  ] },
  { key: 'background', group: 'content', title: '背景', variants: [
    ['native', '跟随皮肤'],
    ['plain', '纯色'],
    ['cover', '封面氛围', 'QQ音乐动态皮肤 · 汽水音乐'],
    ['flow', '流光', 'Elixir'],
    ['grain', '胶片颗粒', 'Elixir'],
    ['mosaic', '封面墙', 'Elixir · 用播放队列的封面拼成'],
    ['image', '自定义图片', 'Elixir'],
  ] },
  { key: 'panel', group: 'extra', title: '右侧正在播放栏', removable: 'off', variants: [
    ['off', '拆下'],
    ['on', '装上', 'Spotify'],
  ] },
  { key: 'lyricBar', group: 'extra', title: '播放栏歌词', removable: 'off', variants: [
    ['off', '拆下'],
    ['on', '装上', 'QQ音乐 · 酷狗音乐'],
  ] },
  { key: 'clock', group: 'extra', title: '侧栏听歌时钟', removable: 'off', variants: [
    ['off', '拆下'],
    ['on', '装上', 'Elixir'],
  ] },
];

export const SLOT_MAP = Object.fromEntries(SLOTS.map(slot => [slot.key, slot]));
export const COMPONENT_DEFAULTS = { sidebar: 'native', side: 'left', topbar: 'native', player: 'native', progress: 'native', np: 'native', lyrics: 'native', home: 'native', visualizer: 'native', background: 'native', panel: 'off', lyricBar: 'off', clock: 'off' };
export const variantName = (key, value) => SLOT_MAP[key]?.variants.find(([id]) => id === value)?.[1] || value;

// Colour, corners, type, density and scale.
export const TUNING = [
  { key: 'radius', title: '圆角', variants: [['native', '跟随皮肤'], ['sharp', '直角', 'TIDAL · SoundCloud · Winamp'], ['round', '圆润', '咪咕音乐 · 波点音乐']] },
  { key: 'font', title: '字体', variants: [['native', '跟随皮肤'], ['sans', '黑体'], ['serif', '宋体 / 衬线'], ['rounded', '圆体'], ['mono', '等宽']] },
  { key: 'density', title: '列表密度', variants: [['native', '跟随皮肤'], ['compact', '紧凑', 'foobar2000 · iTunes'], ['comfy', '宽松', 'Elixir']] },
  { key: 'motion', title: '动效', variants: [['full', '完整'], ['reduced', '减少动效']] },
];
export const TUNING_DEFAULTS = { accent: 'skin', radius: 'native', font: 'native', density: 'native', scale: 100, motion: 'full', contrast: 'normal' };
export const ACCENT_PRESETS = ['#ef4655', '#31c27c', '#1ed760', '#fa2d48', '#1f9cff', '#ffd21f', '#ff5500', '#a238ff', '#25d1da', '#6a6cf6', '#ec2f6d', '#3668ff', '#d7f53a', '#ff7a45', '#13c2c2', '#c4382d'];

// One-click arrangements of several parts at once. Only the parts listed change.
export const LAYOUT_PRESETS = [
  { id: 'classic', name: '经典三段', text: '左侧栏、顶栏、底部播放栏，大多数音乐软件的样子。',
    parts: { sidebar: 'full', side: 'left', topbar: 'full', player: 'bar', panel: 'off' } },
  { id: 'spotify3', name: '三栏工作台', text: '左边导航，中间内容，右边一直显示正在播放和歌词。',
    parts: { sidebar: 'full', side: 'left', topbar: 'full', player: 'bar', panel: 'on' } },
  { id: 'immersive', name: '沉浸大屏', text: '拆掉侧栏改顶部导航，封面染色背景加悬浮播放胶囊。',
    parts: { sidebar: 'hidden', topbar: 'full', player: 'float', background: 'cover', np: 'immersive', panel: 'off' } },
  { id: 'island', name: '灵动岛', text: '播放器缩成顶部中间的小岛，鼠标移上去才展开。',
    parts: { sidebar: 'float', topbar: 'center', player: 'island', background: 'flow', panel: 'off' } },
  { id: 'focus', name: '极简专注', text: '图标窄栏、无顶栏、细条播放器，音浪也拆掉。',
    parts: { sidebar: 'rail', topbar: 'hidden', player: 'mini', visualizer: 'off', panel: 'off', lyricBar: 'on' } },
  { id: 'retro', name: '复古顶置', text: '播放器放在窗口顶上，像 Winamp 和千千静听。',
    parts: { sidebar: 'full', topbar: 'full', player: 'top', np: 'karaoke', visualizer: 'dots' } },
  { id: 'keyboard', name: '纯键盘', text: '只留内容区，所有操作交给 Ctrl K 和快捷键。',
    parts: { sidebar: 'hidden', topbar: 'hidden', player: 'hidden', panel: 'off' } },
  { id: 'desk', name: '桌面程序坞', text: '导航收成底部程序坞，封面墙做背景，像在自己的桌面上听歌。',
    parts: { sidebar: 'dock', topbar: 'center', player: 'island', background: 'mosaic', panel: 'off' } },
  { id: 'reader', name: '竖排阅读', text: '竖排歌词配墨水屏一样的安静界面，适合慢慢听。',
    parts: { sidebar: 'rail', topbar: 'hidden', player: 'mini', np: 'cover', lyrics: 'vertical', visualizer: 'off', background: 'plain' } },
  { id: 'stage', name: '提词舞台', text: '播放页只留提词器式的歌词，大字跟唱。',
    parts: { np: 'karaoke', lyrics: 'focus', player: 'float', background: 'cover' } },
];

// Sidebar entries that can be hidden or reordered.
export const NAV_ITEMS = [
  ['home', '首页'], ['search', '搜索'], ['music', '我的音乐'], ['likes', '喜欢'], ['history', '最近播放'], ['ranking', '听歌排行'], ['library', '本地与下载'], ['studio', '个性化工坊'],
];
export const NAV_DEFAULT = NAV_ITEMS.map(([key]) => key);
export const NAV_HIDDEN_DEFAULT = ['search'];

// Blocks of the modular home page.
export const HOME_MODULES = [
  ['greeting', '问候与本周统计'], ['hero', '接着听'], ['shortcuts', '快捷入口'], ['recent', '最近播放'], ['top', '最近常听'],
  ['crate', '唱片箱'], ['calendar', '听歌日历'], ['picks', '平台推荐'], ['artists', '常听歌手'], ['albums', '收藏的专辑'], ['playlists', '我的歌单'], ['charts', '排行榜'],
];
export const HOME_DEFAULT = HOME_MODULES.map(([key]) => ({ key, on: !['charts', 'crate'].includes(key) }));

// A random but coherent look: one variant per part, never removing the navigation and the player together.
export function randomParts(random = Math.random) {
  const parts = {};
  for (const slot of SLOTS) {
    const choices = slot.variants.map(([id]) => id).filter(id => id !== 'native' && !(slot.key === 'background' && id === 'image'));
    parts[slot.key] = choices[Math.floor(random() * choices.length)];
  }
  if (parts.sidebar === 'hidden' && parts.topbar === 'hidden') parts.topbar = 'full';
  if (parts.player === 'hidden') parts.player = 'float';
  if (parts.home === 'native') parts.home = 'modular';
  return parts;
}
