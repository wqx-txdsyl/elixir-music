import platforms from '../../backend/providers/platforms.json';

const initialToken = new URLSearchParams(location.search).get('token');
if (initialToken) { sessionStorage.setItem('musicplatform-token', initialToken); const query=new URLSearchParams(location.search);query.delete('token');history.replaceState(null, '', location.pathname+(query.size?'?'+query:'')); }
export const appToken = () => sessionStorage.getItem('musicplatform-token') || '';
let spotifyRefresh;
export function refreshSpotifySession(){
  if(!window.desktop?.refreshSpotifySession)return Promise.reject(new Error('请连接 Spotify 账号'));
  if(!spotifyRefresh)spotifyRefresh=window.desktop.refreshSpotifySession().finally(()=>{spotifyRefresh=null;});
  return spotifyRefresh;
}
export async function api(path, options = {}) {
  const { timeout = 45000, spotifyRetried=false, ...rest } = options;
  const response = await fetch(path, {
    ...rest,
    headers: { 'Content-Type': 'application/json', 'X-App-Token': appToken(), ...(rest.headers || {}) },
    signal: rest.signal || AbortSignal.timeout(timeout),
    ...(rest.body && typeof rest.body !== 'string' ? { body: JSON.stringify(rest.body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if((data.code==='spotify_session_expired'||data.accounts?.some(a=>a.source==='spotify'&&a.can_refresh)||data.errors?.some(e=>e.code==='spotify_session_expired'))&&!spotifyRetried&&window.desktop?.refreshSpotifySession){
    try{await refreshSpotifySession();return api(path,{...options,spotifyRetried:true});}
    catch(error){if(!response.ok)throw error;}
  }
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : data.error || `请求未完成（${response.status}）`);
  return data;
}
export function mediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('/api/')) return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(appToken());
  return url;
}
export const trackPath = id => '/api/tracks/' + encodeURIComponent(id);
export const SOURCE_NAMES = { netease: '网易云音乐', qqmusic: 'QQ音乐', spotify: 'Spotify', local: '本地音乐', all: '全部平台',
  ...Object.fromEntries(Object.entries(platforms).map(([id, platform]) => [id, platform.name])) };
// 暂停接入的平台不再出现在搜索、账号和首页里；已收藏的歌曲仍按原平台显示。
export const CATALOG_SOURCES = Object.keys(platforms).filter(id => !platforms[id].paused && (platforms[id].catalog || platforms[id].links));
export const THEME_NAMES = { netease: '网易云音乐', qqmusic: 'QQ音乐', spotify: 'Spotify', aurora: '极光', ink: '墨刻', apple: 'Apple Music' };
export function formatDuration(ms) { const seconds = Math.max(0, Math.floor(Number(ms || 0) / 1000)); return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); }
export function parseLrc(text = '') {
  const lines = [];
  for (const line of text.split('\n')) {
    const content = line.replace(/\[[^\]]*\]/g, '').trim();
    const timestamps = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    for (const match of timestamps) lines.push({ time: Number(match[1]) * 60 + Number(match[2]), text: content || '♪' });
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function formatSourceError(source,message){ const text=String(message || "请求失败"),label=SOURCE_NAMES[source] || source || ""; return label && !text.startsWith(label+"：") && !text.startsWith(label+":") ? label+"："+text : text; }
