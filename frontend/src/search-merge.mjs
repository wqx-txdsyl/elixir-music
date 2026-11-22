// 「全部平台」搜索：把各平台返回的同一首歌合成一行。
// 判定从严：歌名归一化后完全相同、至少有一位歌手相同、时长相差不超过 4 秒（两边都有时长时）。
// 宁可留着重复，也不能把 Live、伴奏、翻唱等不同版本合在一起：这些标记写在歌名里，归一化后歌名就不同。

const SPLIT_ARTISTS = /\s*(?:[,，、/&;；]|\s+(?:feat\.?|ft\.?|with|x)\s+)\s*/i;
const UNKNOWN = new Set(['', '未知歌手', 'unknown', 'various artists']);
const MAX_DURATION_GAP = 4000;

export function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[\s　'’"“”`·・.,，。!！?？:：\-—–_~～*]+/g, '');
}

export function artistSet(value) {
  return new Set(String(value ?? '').split(SPLIT_ARTISTS).map(normalizeText).filter(name => name && !UNKNOWN.has(name)));
}

export function sameSong(a, b) {
  if (!a || !b || a.source === b.source) return false;
  const title = normalizeText(a.title);
  if (!title || title !== normalizeText(b.title)) return false;
  const left = artistSet(a.artist), right = artistSet(b.artist);
  if (!left.size || !right.size || ![...left].some(name => right.has(name))) return false;
  const da = Number(a.duration_ms) || 0, db = Number(b.duration_ms) || 0;
  return !(da && db && Math.abs(da - db) > MAX_DURATION_GAP);
}

const playable = track => track.availability !== 'unavailable' && track.playable !== false;

// lists：[{source, tracks}]，按平台优先级排列（本地曲库放最前）。
// 结果按「在各自平台里的名次」交错排列，名次相同的按平台优先级；合并后的行带 alternatives。
export function mergeSearchResults(lists) {
  const entries = [];
  lists.forEach(({ tracks = [] }, priority) => tracks.forEach((track, rank) => entries.push({ track, rank, priority })));
  entries.sort((a, b) => a.rank - b.rank || a.priority - b.priority);
  const groups = [], seen = new Set();
  for (const { track } of entries) {
    if (!track?.id || seen.has(track.id)) continue;
    seen.add(track.id);
    const group = groups.find(g => !g.some(t => t.source === track.source) && sameSong(g[0], track));
    if (group) group.push(track); else groups.push([track]);
  }
  return groups.map(group => {
    // 默认播放能放的那个；都能放时保持排序靠前的
    const index = Math.max(0, group.findIndex(playable));
    const [primary] = group.splice(index, 1);
    const { alternatives: _ignored, ...base } = primary;
    return group.length ? { ...base, alternatives: group.map(({ alternatives: _drop, ...rest }) => rest) } : base;
  });
}
