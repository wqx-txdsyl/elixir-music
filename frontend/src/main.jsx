import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { SpotifyLogoIcon } from '@phosphor-icons/react';
import { House, MagnifyingGlass, Heart, ClockCounterClockwise, FolderSimple, Playlist, GearSix, UserCircle, MusicNotes, CaretLeft, CaretRight, CaretDown, Plus, X, Minus, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, RepeatOnce, SpeakerHigh, SpeakerSlash, Queue, MicrophoneStage, DotsThree, ArrowSquareOut, Check, WarningCircle, CircleNotch, DownloadSimple, LinkSimple, Trash, ArrowsClockwise, Timer, SlidersHorizontal, MonitorPlay, Disc, ArrowRight, ListBullets, Moon, CheckCircle, Info, SignOut, Crown, Copy } from '@phosphor-icons/react';
import { api, appToken, mediaUrl, trackPath, SOURCE_NAMES, THEME_NAMES, formatDuration, parseLrc, formatSourceError } from './api';
import './styles.css';
import DesktopLyrics from './DesktopLyrics';
import WindowControls from './WindowControls';
import { NavigationItem, PlaybackTrackTable } from './TrackTable';
import {ListeningHistory} from './ListeningHistory';
import {useListeningHistory} from './useListeningHistory';
import {useSpotifyListeningHistory} from './useSpotifyListeningHistory';
import { AudioEffects, useAudioEffects } from './AudioEffects';
import SelectMenu from './SelectMenu';
import {insertNext,moveItem,pinNext,pinnedNext} from './playback-queue.mjs';
import {ownedSpotifySnapshot,spotifyClockPosition,reconcileSpotifyClock,followingTrack,spotifyHandoff} from './spotify-state.mjs';
import { LocalFolders, TrackInformation, MusicLibrary, MusicSearchTypes, EntitySearch, EntityDetail, PlaylistTools, SearchHistory } from './MusicWorkspace';
import Home from './Home';
import PlayerBar from './PlayerBar';
import LyricLines from './LyricLines';
import DesktopLyricSync from './DesktopLyricSync';
import {IconButton,Cover} from './ui';
import {playbackClock} from './playback-clock.mjs';
import Visualizer from './Visualizer';
import './controls.css';
import ThemeMenu from './ThemeMenu';
import {parseWordLyrics} from './lyric-words.mjs';
import {pairTranslations} from './lyric-translation.mjs';
import './ui-polish.css';
import './lyrics.css';
import './vinyl.css';
import ListeningRankings,{ListeningBadge} from './ListeningRankings';
import PageHero,{SectionNav} from './PageHero';
import './theme-aurora.css';
import './theme-ink.css';
import './theme-apple.css';
import './theme-qqmusic.css';
import './now-playing.css';

const sources = ['all', 'local', 'netease', 'qqmusic', 'spotify'];
const themes = ['netease', 'qqmusic', 'spotify', 'aurora', 'ink', 'apple'];
const platforms = ['netease', 'qqmusic', 'spotify'];
// Word-timed lyrics when the platform has them, otherwise ordinary LRC lines.
const lyricTimeline = data => { const words = parseWordLyrics(data?.words); return words.length ? words : parseLrc(data?.original || ''); };
playbackClock.set(localStorage.getItem('musicplatform-last-position') || 0);

const settingSections = [['settings-theme', '界面风格'], ['settings-playback', '播放'], ['settings-effects', '音效'], ['settings-desktop', '桌面与快捷键'], ['settings-connection', '连接'], ['settings-about', '关于']];
function listMeta(tracks) { const minutes = Math.round(tracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0) / 60000), sources = new Set(tracks.map(t => t.source)).size; return [tracks.length + ' 首', minutes ? (minutes >= 60 ? Math.floor(minutes / 60) + ' 小时 ' + (minutes % 60) + ' 分钟' : minutes + ' 分钟') : '', sources > 1 ? '来自 ' + sources + ' 个来源' : ''].filter(Boolean).join(' · '); }
function TrackListHero({ page, title, playlist, tracks, busy, onImport, tools }) {
  const meta = busy ? '正在加载…' : listMeta(tracks);
  if (page === 'playlist') return playlist ? <PlaylistTools playlist={playlist} tracks={tracks} meta={meta} {...tools} /> : <PageHero kind="playlist" icon={Playlist} eyebrow="Elixir 歌单" title={title} meta={meta} />;
  if (page === 'library') return <PageHero kind="library" icon={FolderSimple} eyebrow="本地音乐" title={title} meta={meta} actions={<button className="button primary" onClick={onImport}><Plus size={18} />添加文件夹</button>} />;
  return <PageHero kind="likes" icon={Heart} eyebrow="收藏" title={title} meta={meta} />;
}
function SourceTag({ source }) { return <span className={'source-tag source-' + source}>{source === 'netease' ? '网易云' : SOURCE_NAMES[source] || source}</span>; }
function Empty({ icon: Icon = MusicNotes, title, text, action }) { return <div className="empty"><div className="empty-icon"><Icon size={44} weight="light" /></div><h3>{title}</h3>{text&&<p>{text}</p>}{action}</div>; }
function Loading({ text = '正在加载音乐…' }) { return <div className="loading"><CircleNotch className="spin" size={25} /><span>{text}</span></div>; }
function Modal({ title, children, onClose, wide }) { return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className={'modal ' + (wide ? 'modal-wide' : '')} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><h2>{title}</h2><IconButton icon={X} title="关闭" onClick={onClose} /></div>{children}</section></div>; }
function ErrorNote({ children }) { return <div className="error-note"><WarningCircle size={19} /><span>{children}</span></div>; }

function importSummary(job) {
  const parts = ['导入完成 · 新增 ' + (job.imported || 0) + ' 首'];
  if (job.restored) parts.push('其中 ' + job.restored + ' 首是之前移除后重新加入的');
  if (job.unchanged) parts.push(job.unchanged + ' 首已在音乐库中');
  if (job.removed) parts.push(job.removed + ' 首之前已移除，未重新加入');
  return parts.join('，');
}

function App() {
  const [theme, setTheme] = useState(localStorage.getItem('musicplatform-theme') || 'netease');
  const [page, setPage] = useState('home');
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [source, setSource] = useState('all');
  const [searchKind, setSearchKind] = useState('track');
  const [entity, setEntity] = useState(null);
  const [queueUndo, setQueueUndo] = useState(null);
  const [lyricOffset, setLyricOffset] = useState(0);
  const [remoteWatch,setRemoteWatch] = useState(false);
  const remoteRecorded = useRef(0);
  const [tracks, setTracks] = useState([]);
  const [home, setHome] = useState({ tracks: [], collections: [] });
  const [busy, setBusy] = useState(true);
  const [errors, setErrors] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [playlist, setPlaylist] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [settings, setSettings] = useState({ quality: 'standard', spotify_client_id: '', proxy: '' });
  const [settingsDraft, setSettingsDraft] = useState({});
  const [liked, setLiked] = useState(new Set());
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null);
  const [modalInput, setModalInput] = useState('');
  const [modalBusy, setModalBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('lyrics');
  const [lyrics, setLyrics] = useState(null);
  const [comments, setComments] = useState(null);
  const [detailErrors, setDetailErrors] = useState({});
  const [queue, setQueue] = useState(() => { try { const q=JSON.parse(localStorage.getItem('musicplatform-queue') || '[]');return Array.isArray(q)?q:[]; } catch { return []; } });
  const [current, setCurrent] = useState(()=>{try{const t=JSON.parse(localStorage.getItem('musicplatform-last-track') || 'null');return t?.id && ['local','netease','qqmusic','spotify'].includes(t.source)?t:null;}catch{return null;}});
  const [playing, setPlaying] = useState(false);
  const [spotifyInterlude,setSpotifyInterlude]=useState(null);
  const [buffering, setBuffering] = useState(false);
  const setPosition = playbackClock.set;
  const [duration, setDuration] = useState(current?.duration_ms/1000 || 0);
  const [volume, setVolume] = useState(Math.min(1,Math.max(0,Number(localStorage.getItem('musicplatform-volume') ?? 0.7)||0)));
  const [playMode, setPlayMode] = useState(() => { const saved = localStorage.getItem('musicplatform-play-mode'); return ['list','single','shuffle','once'].includes(saved) ? saved : 'list'; });
  const [upNext, setUpNext] = useState(() => { try { const ids = JSON.parse(localStorage.getItem('musicplatform-up-next') || '[]'); return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []; } catch { return []; } });
  const [queueOpen, setQueueOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [playHint, setPlayHint] = useState('');
  const [job, setJob] = useState(null);
  const [sleepUntil, setSleepUntil] = useState(null);
  const [sleepMinutes, setSleepMinutes] = useState(30);
  const [speed, setSpeed] = useState(1);
  const [matchTrack, setMatchTrack] = useState(null);
  const [matches, setMatches] = useState(null);
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState([]);
  const [cloudPlaylists, setCloudPlaylists] = useState([]);
  const [cloudPlaylistStatus,setCloudPlaylistStatus]=useState(null);
  const [qr, setQr] = useState(null);
  const [qrStatus, setQrStatus] = useState('loading');
  const [qrError,setQrError]=useState('');
  const accountRequest=useRef(null),lastAccountRefresh=useRef(0);
  const tableActions=useRef({});
  const stableLocalPlaylist=useCallback(id=>tableActions.current.navigate('playlist',id),[]);
  const stableCloudPlaylist=useCallback((...args)=>tableActions.current.openCloudPlaylist(...args),[]);
  const stablePlay=useCallback((...args)=>tableActions.current.play(...args),[]),stableDetail=useCallback((...args)=>tableActions.current.openDetail(...args),[]),stableEntity=useCallback((...args)=>tableActions.current.openEntity(...args),[]);
  const audioRef = useRef(null);
  const effects = useAudioEffects(audioRef);
  const [visualizer, setVisualizer] = useState(() => localStorage.getItem('elixir-visualizer') || 'auto');
  useEffect(() => { localStorage.setItem('elixir-visualizer', visualizer); }, [visualizer]);
  const [playerLyric,setPlayerLyric]=useState([]);
  const [desktopLyrics,setDesktopLyrics]=useState(false);
  const [appVersion,setAppVersion]=useState('');
  useEffect(()=>{window.desktop?.getVersion?.().then(setAppVersion).catch(()=>{});},[]);
  const [showTranslation,setShowTranslation]=useState(()=>localStorage.getItem('elixir-lyric-translation')!=='off');
  useEffect(()=>{localStorage.setItem('elixir-lyric-translation',showTranslation?'on':'off');},[showTranslation]);
  const dragFrom=useRef(null);const [dragOver,setDragOver]=useState(null);
  // Back / forward over pages, searches and detail views; replays never add new entries.
  const viewHistory=useRef({entries:[{type:'page',page:'home'}],index:0}),replayingHistory=useRef(false),goHistoryRef=useRef(null);
  const [historyPos,setHistoryPos]=useState({back:false,forward:false});
  goHistoryRef.current=step=>goHistory(step);
  useEffect(()=>{const mouse=e=>{if(e.button===3||e.button===4){e.preventDefault();goHistoryRef.current(e.button===3?-1:1);}};window.addEventListener('mouseup',mouse);return()=>window.removeEventListener('mouseup',mouse);},[]);
  const searchRef = useRef(null);
  const requestId = useRef(0);
  const playRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const scrollRef = useRef(null);
  const currentRef = useRef(current); currentRef.current = current;
  const spotifyPendingTrack=useRef(null),spotifyPendingSeek=useRef(null),spotifyControlGeneration=useRef(0);
  const spotifyClock=useRef({position_ms:0,duration_ms:0,at:0,playing:false});
  const spotifyUpdate=useRef(null),spotifyQueued=useRef(null),spotifyLast=useRef(null);
  const queueRef = useRef(queue); queueRef.current = queue;
  const upNextRef = useRef(upNext); upNextRef.current = upNext;
  useEffect(() => { localStorage.setItem('musicplatform-play-mode', playMode); }, [playMode]);
  // A play-next request is used up once that song starts, and dropped when it leaves the queue.
  useEffect(() => { setUpNext(old => { const next = old.filter(id => id !== current?.id && queue.some(t => t.id === id)); return next.length === old.length ? old : next; }); }, [current?.id, queue]);
  useEffect(() => { localStorage.setItem('musicplatform-up-next', JSON.stringify(upNext)); }, [upNext]);
  const modeRef = useRef(playMode); modeRef.current = playMode;
  useListeningHistory(audioRef,current?.id,playRequestId.current,!!settings.private_session);
  const reportSpotifyListening=useSpotifyListeningHistory(!!settings.private_session);
  const notify = useCallback(message => setToast(String(message || '操作完成')), []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('musicplatform-theme', theme); }, [theme]);
  useEffect(()=>{if(current)localStorage.setItem('musicplatform-last-track',JSON.stringify(current));},[current]);
  useEffect(()=>{let saved=-1;return playbackClock.subscribe(()=>{const second=Math.floor(playbackClock.get());if(second!==saved){saved=second;localStorage.setItem('musicplatform-last-position',String(second));}});},[]);
  useEffect(() => { localStorage.setItem('musicplatform-queue', JSON.stringify(queue.slice(0, 500))); }, [queue]);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; localStorage.setItem('musicplatform-volume', String(volume)); }, [volume]);
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed]);
  const refreshAccounts = useCallback(async(force=false)=>{
    if(accountRequest.current)return accountRequest.current;
    if(force!==true && Date.now()-lastAccountRefresh.current<30000)return;
    lastAccountRefresh.current=Date.now();
    accountRequest.current=api('/api/accounts').then(data=>setAccounts(data.accounts || [])).catch(e=>notify(e.message)).finally(()=>{accountRequest.current=null;});
    return accountRequest.current;
  },[notify]);
  useEffect(()=>{
    const off=window.desktop?.onAccountsUpdated?.(provider=>{refreshAccounts(true);if(provider==='spotify')setModal(old=>old?.type==='login'&&old.source==='spotify'||old?.type==='spotify-cookie'?null:old);});
    const stop=window.desktop?.onSpotifyState?.(state=>{if(state.observation||state.media_started||state.media_paused)spotifyUpdate.current?.();if(state.device_id)setDeviceId(state.device_id);if(state.media_started||(state.ready&&currentRef.current?.source==='spotify'))setRemoteWatch(true);if(state.media_paused)spotifyClock.current={...spotifyClock.current,position_ms:spotifyClockPosition(spotifyClock.current,performance.now()),at:performance.now(),playing:false};if(state.license_error){spotifyClock.current.playing=false;setPlaying(false);setPlayHint('Spotify 音乐许可证未获批');}else if(state.reason)notify(state.reason);});
    return()=>{off?.();stop?.();};
  },[refreshAccounts,notify]);
  const setPrivateListening=useCallback(async value=>{try{const result=await api('/api/settings',{method:'PUT',body:{private_session:value}});setSettings(result);setSettingsDraft(old=>({...old,private_session:value}));}catch(e){notify(e.message);}},[notify]);
  const refreshPlaylists = useCallback(async () => { const data = await api('/api/playlists'); setPlaylists(data.playlists || []); }, []);
  useEffect(() => {
    const initialRequest = requestId.current;
    Promise.allSettled([
      api('/api/home').then(data => { setHome(data); if (requestId.current === initialRequest) { setTracks(data.tracks || []); if (data.errors) setErrors(normalizeErrors(data.errors)); } }),
      refreshPlaylists(), refreshAccounts(),
      api('/api/settings').then(data => { setSettings(data); setSettingsDraft(data); if (themes.includes(data.theme)) setTheme(data.theme); }),
      api('/api/likes').then(data => setLiked(new Set((data.tracks || []).map(t => t.id))))
    ]).then(results => { if (requestId.current !== initialRequest) return; const failed = results.filter(r => r.status === 'rejected'); if (failed.length) setErrors(failed.map(r => r.reason.message)); setBusy(false); });
    const refresh = () => { refreshAccounts(); }; window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh);
  }, []);
  function normalizeErrors(value) { if (Array.isArray(value)) return value.map(e => typeof e === 'string' ? e : formatSourceError(e.source,e.message || e.error || e.reason || JSON.stringify(e))); return Object.entries(value || {}).map(([key, value]) => (SOURCE_NAMES[key] || key) + '：' + (typeof value === 'string' ? value : JSON.stringify(value))); }
  function remember(entry){
    if(replayingHistory.current)return;const h=viewHistory.current;
    if(JSON.stringify(h.entries[h.index])===JSON.stringify(entry))return;
    h.entries=[...h.entries.slice(0,h.index+1),entry].slice(-50);h.index=h.entries.length-1;setHistoryPos({back:h.index>0,forward:false});
  }
  function goHistory(step){
    const h=viewHistory.current,target=h.index+step;if(target<0||target>=h.entries.length)return;
    h.index=target;setHistoryPos({back:target>0,forward:target<h.entries.length-1});
    const entry=h.entries[target];replayingHistory.current=true;
    try{if(entry.type==='search')search(entry.value,entry.provider,entry.kind);else if(entry.type==='entity')openEntity(entry.item);else if(entry.type==='cloud')openCloudPlaylist(entry.item,entry.source);else navigate(entry.page,entry.id);}
    finally{replayingHistory.current=false;}
  }
  async function navigate(target, id) {
    if (target !== 'search') remember({ type: 'page', page: target, id });
    const req = ++requestId.current;
    setPage(target); setDetail(null); setErrors([]); setPlaylist(null); setQueueOpen(false); scrollRef.current?.scrollTo(0, 0);
    if (target === 'music' || target === 'history' || target === 'ranking') { setBusy(false); return; }
    if (target === 'accounts') { setBusy(false); refreshAccounts(); return; }
    if (target === 'settings') { setSettingsDraft(settings); setBusy(false); return; }
    if (target === 'search') { if (searched) search(searched); else { setTracks([]); setBusy(false); } return; }
    setBusy(true);
    try {
      const path = target === 'home' ? '/api/home' : target === 'playlist' ? '/api/playlists/' + encodeURIComponent(id) : '/api/' + target;
      const data = await api(path);
      if (req !== requestId.current) return;
      setTracks(data.tracks || []); if (target === 'home') setHome(data); if (target === 'playlist') setPlaylist(data); if (data.errors) setErrors(normalizeErrors(data.errors));
    } catch (e) { if (req === requestId.current) { setTracks([]); setErrors([e.message]); } }
    finally { if (req === requestId.current) setBusy(false); }
  }
  function openEntity(item) { if(item.kind==='mv'){external(item.source_url);notify('MV 当前在官方页面播放');return;}remember({ type: 'entity', item });setDetail(null); setEntity(item); setPage('entity'); setQueueOpen(false); scrollRef.current?.scrollTo(0,0); }
  function trackEntity(track,kind) {
    const originalSource = track.matched_track_id?.split(':')[0] || track.source;
    const sid = kind === 'album' ? track.album_id : track.artist_ids?.[0];
    if (sid && originalSource !== 'local') openEntity({id:originalSource+':'+kind+':'+sid,source:originalSource,source_id:String(sid),kind,title:kind==='album'?track.album:track.artists?.[0]?.name || track.artist,cover:kind==='album'?track.cover:''});
    else {setDetail(null); search(kind==='album'?track.album:track.artist,source,kind);}
  }
  function editQueue(next) {setQueueUndo(queueRef.current);setQueue(next);}
  function moveQueueTo(from,to) {const next=moveItem(queueRef.current,from,to);if(next!==queueRef.current)editQueue(next);}
  function moveQueue(index,direction) {const list=[...queueRef.current],to=index+direction;if(to<0||to>=list.length)return;[list[index],list[to]]=[list[to],list[index]];editQueue(list);}
  async function search(value = query, provider = source, kind = searchKind) {
    remember({ type: 'search', value: String(value || '').trim(), provider, kind });
    if (!value.trim()) { setPage('search'); setSearched(''); setTracks([]); setBusy(false); searchRef.current?.focus(); return; }
    if(provider==='local'&&kind!=='track')kind='track';
    const req = ++requestId.current;
    setSearchKind(kind); setQuery(value); setSearched(value.trim()); setPage('search'); setSource(provider); setBusy(true); setErrors([]); setTracks([]); scrollRef.current?.scrollTo(0, 0);
    if (kind !== 'track') { setBusy(false); return; }
    try { const data = await api('/api/search?q=' + encodeURIComponent(value.trim()) + '&source=' + provider + '&limit=50', { timeout: 75000 }); if (req !== requestId.current) return; setTracks(data.tracks || []); setErrors(normalizeErrors(data.errors)); }
    catch (e) { if (req === requestId.current) setErrors([e.message]); } finally { if (req === requestId.current) setBusy(false); }
  }
  async function batchTracks(action,items,playlistId){
    try{
      if(action==='play'){await play(items[0],items);return;}
      if(action==='next'){const next=insertNext(queueRef.current,currentRef.current?.id,items);upNextRef.current=pinNext(upNextRef.current,items,currentRef.current?.id);setUpNext(upNextRef.current);editQueue(next);queueRef.current=next;notify(items.length>1?'已将 '+items.length+' 首设为接下来播放':'已设为下一首播放');return;}
      if(action==='queue'){editQueue([...queueRef.current,...items.filter(t=>!queueRef.current.some(q=>q.id===t.id))]);notify('已加入队列');return;}
      if(action==='playlist'){setModal({type:'add-playlist',tracks:items});return;}
      if(action==='playlist_remove'&&playlistId?.remote_source){
        const copy=await api('/api/music/import-remote',{method:'POST',body:{source:playlistId.remote_source,source_id:playlistId.source_id||playlistId.id.split(':').pop()},timeout:180000});
        await api('/api/tracks/batch',{method:'POST',body:{track_ids:items.map(t=>t.id),action,playlist_id:copy.id}});await refreshPlaylists();await navigate('playlist',copy.id);notify('已保存为 Elixir 歌单并移除所选歌曲');return;
      }
      if(action==='local_remove'){
        await api('/api/tracks/batch',{method:'POST',body:{track_ids:items.map(t=>t.id),action}});
        const ids=new Set(items.map(t=>t.id));setTracks(old=>old.filter(t=>!ids.has(t.id)));editQueue(queueRef.current.filter(t=>!ids.has(t.id)));setLiked(old=>new Set([...old].filter(id=>!ids.has(id))));
        if(ids.has(currentRef.current?.id)){++playRequestId.current;audioRef.current?.pause();audioRef.current?.removeAttribute('src');audioRef.current?.load();setCurrent(null);setPlaying(false);setPosition(0);localStorage.removeItem('musicplatform-last-track');}
        if(ids.has(detail?.id)){++detailRequestId.current;setDetail(null);setLyrics(null);}
        window.dispatchEvent(new Event('elixir-library-changed'));await refreshPlaylists();notify('已从音乐库移除，原文件保留');return;
      }
      if(action==='export'){const payload={format:'musicplatform-playlist',version:1,title:'所选歌曲',tracks:items.map(({id,source,source_id,title,artist,album,duration_ms,cover,source_url})=>({id,source,source_id,title,artist,album,duration_ms,cover:cover?.startsWith('/api/')?'':cover,source_url}))};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='Elixir-selection.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
      await api('/api/tracks/batch',{method:'POST',body:{track_ids:items.map(t=>t.id),action,playlist_id:typeof playlistId==='object'?playlistId.id:playlistId || ''}});
      if(action==='like'||action==='unlike'){setLiked(old=>{const next=new Set(old);items.forEach(t=>action==='like'?next.add(t.id):next.delete(t.id));return next;});if(page==='likes'&&action==='unlike')setTracks(old=>old.filter(t=>!items.some(x=>x.id===t.id)));}
      if(action==='playlist_remove')setTracks(old=>old.filter(t=>!items.some(x=>x.id===t.id)));
      if(action.startsWith('playlist_'))await refreshPlaylists();notify('已处理 '+items.length+' 首歌曲');
    }catch(e){notify(e.message);}
  }
  async function toggleLike(track) {
    try { const data = await api('/api/likes/' + encodeURIComponent(track.id), { method: 'POST' }); setLiked(previous => { const copy = new Set(previous); if (data.liked) copy.add(track.id); else copy.delete(track.id); return copy; }); if (page === 'likes' && !data.liked) setTracks(items => items.filter(item => item.id !== track.id)); }
    catch (e) { notify(e.message); }
  }
  async function play(track, list, resume=false) {
    setSpotifyInterlude(null);
    const resumePosition=resume && currentRef.current?.id===track.id?playbackClock.get():0;
    const req = ++playRequestId.current;
    if (currentRef.current?.source === 'spotify' && track.source !== 'spotify' && playing) await spotifyControl('pause');
    if (req !== playRequestId.current) return;
    if (list?.length) { setQueue(list); setUpNext([]); upNextRef.current = []; } else if (!queueRef.current.some(t => t.id === track.id)) setQueue(q => [...q, track]);
    spotifyPendingTrack.current=track.source==='spotify'?track:null;spotifyPendingSeek.current=null;spotifyQueued.current=null;spotifyLast.current=null;
    setRemoteWatch(track.source==='spotify');if(track.source!=='spotify'){setCurrent(track);setPosition(0);setDuration(track.duration_ms/1000||0);spotifyClock.current.playing=false;}setBuffering(true);setPlayHint('');
    const audio = audioRef.current; if(track.source!=='spotify')await effects.prepare();audio.pause(); audio.removeAttribute('src'); audio.load();
    try {
      if (track.source === 'spotify') {
        if(!window.desktop?.spotifyPlay)throw Error('请使用 Elixir 桌面版的应用内 Spotify 播放器');
        const result=await window.desktop.spotifyPlay(track.source_id);if(result.device_id)setDeviceId(result.device_id);
        if (req !== playRequestId.current) return;
        if(!result.pending)setPlaying(!!result.confirmed&&!!result.state?.is_playing);setRemoteWatch(true);setPlayHint(result.reason||'');if(result.reason)notify(result.reason);
      } else {
        const result = await api(trackPath(track.id) + '/stream?quality=' + encodeURIComponent(settings.quality || 'standard'));
        if (req !== playRequestId.current) return;
        if (!result.url) throw new Error(result.reason || '平台未提供可用音源，可查看歌曲资料或匹配本地文件。');
        audio.src = mediaUrl(result.url); audio.volume = volume; audio.playbackRate = speed;
        setPlayHint(result.trial ? '当前为平台授权试听片段' : result.reason || '');
        if(resumePosition>0)audio.currentTime=resumePosition;
        await audio.play();
      }
      if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: track.album, artwork: track.cover ? [{ src: mediaUrl(track.cover) }] : [] });
    } catch (e) { if (req === playRequestId.current) { setPlayHint(e.message); notify(e.message); setPlaying(false); } }
    finally { if (req === playRequestId.current) setBuffering(false); }
  }
  function next(direction = 1, automatic = false) {
    if(spotifyInterlude){notify(spotifyInterlude.ad?'广告结束后可切歌':'插播结束后可切歌');return;}
    const items = queueRef.current; if (!items.length) return;
    const pinned = direction > 0 ? pinnedNext(items, upNextRef.current, spotifyPendingTrack.current?.id || currentRef.current?.id) : null;
    if (pinned) { play(pinned); return; }
    if (modeRef.current === 'single' && automatic) { if (currentRef.current?.source === 'spotify') { play(currentRef.current); return; } const audio = audioRef.current; audio.currentTime = 0; audio.play().catch(e => notify(e.message)); return; }
    const index = items.findIndex(t => t.id === (spotifyPendingTrack.current?.id||currentRef.current?.id));
    if (automatic && modeRef.current === 'once' && index === items.length - 1) { if (currentRef.current?.source === 'spotify') spotifyControl('pause'); setPlaying(false); return; }
    let nextIndex = (index + direction + items.length) % items.length;
    if (modeRef.current === 'shuffle' && items.length > 1) { do { nextIndex = Math.floor(Math.random() * items.length); } while (nextIndex === index); }
    play(items[nextIndex]);
  }
  useEffect(()=>{
    if(!remoteWatch) return;
    let cancelled=false,pending=false,again=false;
    const update=async()=>{if(pending){again=true;return;}pending=true;try{
      const generation=spotifyControlGeneration.current;
      const state=await (window.desktop?.spotifyState?window.desktop.spotifyState():api('/api/spotify/state'));if(cancelled||generation!==spotifyControlGeneration.current)return;
      if(state.owned_device_id&&state.owned_device_id!==deviceId)setDeviceId(state.owned_device_id);
      const snapshot=ownedSpotifySnapshot(state,deviceId),matches=snapshot.owned;
      if(snapshot.media_mismatch){spotifyClock.current.playing=false;setPlaying(false);setBuffering(true);return;}
      setBuffering(false);reportSpotifyListening(snapshot);
       const interlude=matches&&!snapshot.track&&snapshot.media?.kind==='interlude'?snapshot.media:null;setSpotifyInterlude(interlude);
       if(interlude){setDetail(null);setPlayerLyric([]);}
      // Spotify either continued into the song queued below, or Elixir starts its own next song.
      if(matches&&!spotifyPendingTrack.current){const handoff=spotifyHandoff(spotifyLast.current,snapshot,spotifyQueued.current,performance.now());
        if(handoff==='advance'){spotifyLast.current=null;spotifyQueued.current=null;remoteRecorded.current=playRequestId.current;next(1,true);return;}
        if(handoff==='continued')spotifyQueued.current=null;}
      if(matches&&snapshot.track&&snapshot.track.id!==currentRef.current?.id){
        const track={...queueRef.current.find(t=>t.id===snapshot.track.id),...snapshot.track};
        setCurrent(track);setBuffering(false);
        api(trackPath(track.id)+(track.artist?'':'?refresh=true')).then(detail=>setCurrent(old=>old?.id===track.id?{...old,...detail}:old)).catch(()=>{});
      }
      if(snapshot.track?.id===spotifyPendingTrack.current?.id)spotifyPendingTrack.current=null;
      const seek=spotifyPendingSeek.current;
      if(seek&&Date.now()<seek.until&&Math.abs(snapshot.position_ms-seek.position_ms)>2500)snapshot.position_ms=spotifyClockPosition(spotifyClock.current,performance.now());
      else spotifyPendingSeek.current=null;
      spotifyClock.current=reconcileSpotifyClock(spotifyClock.current,snapshot,performance.now(),!!seek);
      const clockPosition=spotifyClockPosition(spotifyClock.current,performance.now());
      if(matches&&snapshot.track)spotifyLast.current={id:snapshot.track.id,position_ms:clockPosition,duration_ms:snapshot.duration_ms,playing:snapshot.playing,at:performance.now()};else if(!matches)spotifyLast.current=null;
      // Near the end, hand Spotify the next Elixir song so it starts without a new play command.
      const upcoming=matches&&snapshot.playing&&snapshot.track&&!spotifyPendingTrack.current&&snapshot.duration_ms-clockPosition<20000?(pinnedNext(queueRef.current,upNextRef.current,snapshot.track.id)||followingTrack(queueRef.current,snapshot.track.id,modeRef.current)):null;
      if(upcoming?.source==='spotify'&&upcoming.id!==snapshot.track.id&&spotifyQueued.current?.after!==snapshot.track.id&&window.desktop?.spotifyQueue){spotifyQueued.current={after:snapshot.track.id,id:upcoming.id};window.desktop.spotifyQueue(upcoming.source_id).catch(()=>{spotifyQueued.current=null;});}
      setPlaying(snapshot.playing);setPosition(spotifyClockPosition(spotifyClock.current,performance.now())/1000);
      if(matches&&snapshot.duration_ms)setDuration(snapshot.duration_ms/1000);
      setPlayHint(matches?(state.owned_license_error?'Spotify 音乐许可证未获批':''):(state.owned_device_id?state.reason||'':''));
      if(matches && state.track_finished && state.track_id){remoteRecorded.current=playRequestId.current;next(1,true);return;}
      
    }catch(e){if(!cancelled){setPlayHint(e.message);spotifyClock.current.playing=false;}}finally{pending=false;if(again&&!cancelled){again=false;update();}}};
    // State reports pushed from the web player trigger updates; the timer is only a fallback.
    update();spotifyUpdate.current=update;const timer=setInterval(update,3000);return()=>{cancelled=true;clearInterval(timer);if(spotifyUpdate.current===update)spotifyUpdate.current=null;};
  },[remoteWatch,current?.id,deviceId]);
  useEffect(()=>{window.desktop?.spotifyState?.().then(state=>{if(ownedSpotifySnapshot(state).playing)setRemoteWatch(true);}).catch(()=>{});if(currentRef.current?.source==='spotify'){setRemoteWatch(true);const track=currentRef.current;if(!track.artist)api(trackPath(track.id)+'?refresh=true').then(data=>setCurrent(old=>old?.id===track.id?{...old,...data}:old)).catch(()=>{});}let frame,last=0;const tick=now=>{if(now-last>=200){last=now;if(spotifyClock.current.playing)setPosition(spotifyClockPosition(spotifyClock.current,now)/1000);}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[]);
  async function spotifyControl(action, value) { try {if(!window.desktop?.spotifyControl)throw Error('Spotify 应用内播放器尚未启动');if(action==='seek'){++spotifyControlGeneration.current;spotifyPendingSeek.current={position_ms:Math.max(0,value),until:Date.now()+5000};spotifyClock.current={...spotifyClock.current,position_ms:Math.max(0,value),at:performance.now()};setPosition(Math.max(0,value)/1000);}const data=await window.desktop.spotifyControl(action,value);setRemoteWatch(true);if(data.state){setPlaying(!!data.state.is_playing);setPosition(Number(data.state.position_ms || 0)/1000);}if(data.reason)notify(data.reason);return data.confirmed===true; } catch (e) { notify(e.message); return false; } }
  async function togglePlayback() { if (currentRef.current?.source === 'spotify') { if((!remoteWatch||!deviceId)&&!playing){await play(currentRef.current);return;}await spotifyControl(playing ? 'pause' : 'resume'); return; } const audio = audioRef.current; if (!audio?.src) { if (currentRef.current) play(currentRef.current,undefined,true); else if (queueRef.current.length) play(queueRef.current[0]); return; } if (audio.paused) audio.play().catch(e => notify(e.message)); else audio.pause(); }
  useEffect(() => {
    const keydown = e => { if (e.altKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { e.preventDefault(); goHistory(e.code === 'ArrowLeft' ? -1 : 1); return; } if ((e.ctrlKey || e.metaKey) && ['KeyF','KeyK'].includes(e.code)) { e.preventDefault(); searchRef.current?.focus(); return; } if (e.target.closest('input,textarea,select,[contenteditable="true"]')) return; if (e.code === 'Space' && !e.target.closest('button,a,[role=button]')) { e.preventDefault(); togglePlayback(); } if (e.ctrlKey && e.code === 'ArrowRight') { e.preventDefault(); next(1); } if (e.ctrlKey && e.code === 'ArrowLeft') { e.preventDefault(); next(-1); } if (e.code === 'Escape') { setModalInput(''); setModal(null); setDetail(null); setQueueOpen(false); } };
    document.addEventListener('keydown', keydown); return () => document.removeEventListener('keydown', keydown);
  });
  useEffect(() => { if (!('mediaSession' in navigator)) return; navigator.mediaSession.setActionHandler('play', () => { if (currentRef.current?.source === 'spotify') spotifyControl('resume'); else audioRef.current?.play().catch(e=>notify(e.message)); }); navigator.mediaSession.setActionHandler('pause', () => { if(currentRef.current?.source==='spotify')spotifyControl('pause');else audioRef.current?.pause(); }); navigator.mediaSession.setActionHandler('nexttrack', () => next(1)); navigator.mediaSession.setActionHandler('previoustrack', () => next(-1)); navigator.mediaSession.setActionHandler('seekto', e => { if (!Number.isFinite(e.seekTime)) return; if(currentRef.current?.source==='spotify')spotifyControl('seek',Math.round(e.seekTime*1000));else if(audioRef.current)audioRef.current.currentTime=e.seekTime; }); });
  useEffect(() => { if (!sleepUntil) return; const timer = setTimeout(async () => { if (currentRef.current?.source === 'spotify') { if (await spotifyControl('pause')) setPlaying(false); } else audioRef.current?.pause(); setSleepUntil(null); notify('睡眠定时已结束'); }, Math.max(0, sleepUntil - Date.now())); return () => clearTimeout(timer); }, [sleepUntil]);
  useEffect(()=>{
    let cancelled=false;setPlayerLyric([]);if(current)api(trackPath(current.id)+'/lyrics').then(data=>{if(!cancelled)setPlayerLyric(lyricTimeline(data));}).catch(()=>{});return()=>{cancelled=true;};
  },[current?.id]);
  useEffect(()=>window.desktop?.onLyricsClosed?.(()=>setDesktopLyrics(false)),[]);
  useEffect(()=>window.desktop?.onPlayerAction?.(action=>{if(action==='toggle')togglePlayback();if(action==='next')next(1);if(action==='previous')next(-1);}),[playing]);
  async function toggleDesktopLyrics(){try{if(!window.desktop?.openLyrics){notify('桌面歌词在桌面应用内使用');return;}if(desktopLyrics)await window.desktop.closeLyrics();else await window.desktop.openLyrics();setDesktopLyrics(!desktopLyrics);}catch(e){notify(e.message);}}
  async function openDetail(track, tab = 'lyrics') {
    const request = ++detailRequestId.current;
    setLyricOffset(Number(localStorage.getItem('lyric-offset:'+track.id) || 0));
    setDetail(track); setDetailTab(tab); setLyrics(null); setComments(null); setDetailErrors({}); setQueueOpen(false);
    const id = track.id;
    api(trackPath(id)+'?refresh=true').then(data=>{if(request===detailRequestId.current){setDetail(prev=>prev?.id===id?{...prev,...data}:prev);setCurrent(prev=>prev?.id===id?{...prev,...data}:prev);}}).catch(()=>{});
    api(trackPath(id) + '/lyrics').then(data => { if (request === detailRequestId.current) setLyrics({ ...data, trackId: id }); }).catch(e => { if (request === detailRequestId.current) setDetailErrors(prev => ({ ...prev, [id + ':lyrics']: e.message })); });
    api(trackPath(id) + '/comments?offset=0&limit=20').then(data => { if (request === detailRequestId.current) setComments({ ...data, trackId: id }); }).catch(e => { if (request === detailRequestId.current) setDetailErrors(prev => ({ ...prev, [id + ':comments']: e.message })); });
  }
  useEffect(()=>{if(detail&&current&&detail.id!==current.id)openDetail(current,detailTab);},[current?.id]);
  async function moreComments() { if (!detail || !comments) return; const request = detailRequestId.current; setModalBusy(true); try { const data = await api(trackPath(detail.id) + '/comments?offset=' + (comments.next_offset ?? comments.items.length) + '&limit=20'); if (request === detailRequestId.current) setComments(prev => ({ ...data, trackId: detail.id, items: [...prev.items, ...(data.items || []).filter(item => !prev.items.some(old => old.id === item.id))] })); } catch (e) { notify(e.message); } finally { setModalBusy(false); } }
  const lyricTranslations = useMemo(() => lyrics?.translated ? parseLrc(lyrics.translated).filter(line => line.text && line.text !== '♪') : [], [lyrics]);
  const lyricLines = useMemo(() => { if (!(lyrics && detail && lyrics.trackId === detail.id)) return []; const lines = lyricTimeline(lyrics), worded = !!lines[0]?.words, pairs = showTranslation ? pairTranslations(lines, lyricTranslations, worded ? .35 : .05) : []; return lines.map((line, i) => ({ ...line, time: line.time + lyricOffset, words: line.words?.map(word => ({ ...word, time: word.time + lyricOffset })), translation: pairs[i] || '' })); }, [lyrics, detail, lyricOffset, showTranslation, lyricTranslations]);
  async function importFolder(path) {
    try {
      const selected = path || await window.desktop?.pickFolder();
      if (!selected) { if (!window.desktop) { setModal({ type: 'import' }); setModalInput(''); } return; }
      const result = await api('/api/library/import', { method: 'POST', body: { path: selected } });
      setJob({ id: result.job_id, status: 'running', done: 0, total: 0 }); setModal(null); navigate('library');
    } catch (e) { notify(e.message); }
  }
  useEffect(() => {
    if (!job?.id || ['completed', 'done', 'failed', 'error'].includes(job.status)) return;
    const timer = setInterval(async () => { try { const data = await api('/api/jobs/' + job.id); setJob({ id: job.id, ...data }); if (['completed', 'done'].includes(data.status)) { navigate('library'); notify(importSummary(data)); } if (['failed','error'].includes(data.status)) notify(data.error || '导入未完成，请查看详情'); } catch (e) { clearInterval(timer); notify(e.message); } }, 1500);
    return () => clearInterval(timer);
  }, [job?.id, job?.status]);
  // Finished imports clear themselves unless some files failed and still need attention.
  useEffect(() => { if (!['completed','done'].includes(job?.status) || job.errors?.length) return; const timer = setTimeout(() => setJob(null), 8000); return () => clearTimeout(timer); }, [job?.status]);
  async function findMatches(track) { setMatchTrack(track); setMatches(null); setModal({ type: 'match' }); setModalBusy(true); try { const data = await api('/api/library/' + encodeURIComponent(track.id) + '/match', { method: 'POST', timeout: 90000 }); setMatches(data.matches || []); } catch (e) { notify(e.message); setMatches([]); } finally { setModalBusy(false); } }
  async function linkTrack(match) { setModalBusy(true); try { await api('/api/library/' + encodeURIComponent(matchTrack.id) + '/link', { method: 'POST', body: { track_id: match.id || match.track?.id } }); setModal(null); notify('已关联资料'); navigate('library'); } catch (e) { notify(e.message); } finally { setModalBusy(false); } }
  async function createPlaylist() { if (!modalInput.trim()) return; setModalBusy(true); try { const data = await api('/api/playlists', { method: 'POST', body: { title: modalInput.trim() } }); await refreshPlaylists(); setModal(null); if (data.id) navigate('playlist', data.id); } catch (e) { notify(e.message); } finally { setModalBusy(false); } }
  async function addToPlaylist(target) { try { await api('/api/tracks/batch', { method: 'POST', body: { track_ids:(modal.tracks || [modal.track]).map(t=>t.id),action:'playlist_add',playlist_id:target.id } }); await refreshPlaylists(); notify('已添加至「' + target.title + '」'); setModal(null); } catch (e) { notify(e.message); } }
  async function removeFromPlaylist(track) { try { await api('/api/playlists/' + encodeURIComponent(playlist.id) + '/tracks/' + encodeURIComponent(track.id), { method: 'DELETE' }); setTracks(prev => prev.filter(t => t.id !== track.id)); notify('已从歌单移除'); } catch (e) { notify(e.message); } }
  async function login(source) { if (source === 'netease') { await loadQr(); return; } if(source==='spotify'){setModalInput('');setModal({type:'spotify-cookie'});return;} await loginOfficial(source); }
  async function loginOfficial(source) { if (!window.desktop) { notify('请从桌面应用打开官方登录窗口'); return; } try { await window.desktop.login(source); setModal({ type: 'login', source }); } catch (e) { notify(e.message); } }
  async function loginSpotifyCookie() { if(!window.desktop?.cookieLogin){notify('请使用桌面应用导入 Cookie');return;} const cookie=modalInput.trim(); setModalInput('');setModalBusy(true); try{await window.desktop.cookieLogin('spotify',cookie);setModal({type:'login',source:'spotify'});}catch(e){notify(e.message);}finally{setModalBusy(false);} }
  async function loadQr() { setModal({ type: 'netease-qr' }); setQr(null); setQrError(''); setQrStatus('loading'); try { const data = await api('/api/accounts/netease/qr'); setQr(data); setQrStatus('waiting'); } catch (e) { setQrStatus('error'); notify(e.message); } }
  useEffect(()=>{
    if(modal?.type!=='netease-qr'||!qr?.key)return;
    let cancelled=false,timer,failures=0,attempts=0;
    const poll=async()=>{
      if(cancelled)return;attempts++;
      try{
        const result=await api('/api/accounts/netease/check?key='+encodeURIComponent(qr.key));
        if(cancelled)return;failures=0;setQrError(result.reason || '');setQrStatus(result.status);
        if(result.status==='expired')return;
        if(result.status==='authorized' && result.profile?.logged_in){setAccounts(old=>[...old.filter(a=>a.source!=='netease'),{...result.profile,source:'netease'}]);setModal(null);notify('网易云账号已连接');return;}
      }catch(e){
        if(cancelled)return;failures++;setQrError(e.message);
        if(failures>=5){setQrStatus('error');return;}setQrStatus('retrying');
      }
      if(attempts>=60){setQrStatus('timeout');return;}
      timer=setTimeout(poll,3000*Math.min(4,2**failures));
    };
    timer=setTimeout(poll,3000);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[modal?.type,qr?.key]);
  async function loadCloudPlaylists(source) {
    setModal({type:'cloud-playlists',source});setCloudPlaylists([]);setCloudPlaylistStatus(null);setModalBusy(true);
    try{const data=await api('/api/accounts/'+source+'/playlists');setCloudPlaylists(data.playlists || []);setCloudPlaylistStatus(data.status || {state:'available',empty:!data.playlists?.length});}
    catch(e){setCloudPlaylistStatus({state:'error',reason:e.message,empty:false});}
    finally{setModalBusy(false);}
  }
  async function openCloudPlaylist(item, source) { remember({ type: 'cloud', item: { id: item.id, title: item.title, name: item.name }, source }); const req = ++requestId.current; setModal(null); setPage('playlist'); setBusy(true); setErrors([]); setPlaylist(null); try { const data = await api('/api/remote-playlists/' + source + '/' + encodeURIComponent(item.id), { timeout: 90000 }); if (req !== requestId.current) return; setTracks(data.tracks || []); setPlaylist({ ...data, remote_source: source, title: data.title || item.title || item.name }); } catch (e) { if (req === requestId.current) { setTracks([]); setErrors([e.message]); } } finally { if (req === requestId.current) setBusy(false); } }
  async function finishLogin(source) { setModalBusy(true); try { await window.desktop.finishLogin(source); await refreshAccounts(true); setModal(null); notify('已刷新账号状态'); } catch (e) { notify(e.message); } finally { setModalBusy(false); } }
  async function logout(source) { try { await api('/api/accounts/' + source, { method: 'DELETE' }); await window.desktop?.clearLogin(source); await refreshAccounts(true); notify('已退出该平台账号'); } catch (e) { notify(e.message); } }
  function changeTheme(provider) { setTheme(provider); setSettingsDraft(d => ({ ...d, theme: provider })); api('/api/settings', { method: 'PUT', body: { theme: provider } }).then(data => setSettings(data)).catch(e => notify(e.message)); }
  async function changeQuality(quality) { try { const data = await api('/api/settings', { method: 'PUT', body: { quality } }); setSettings(data); setSettingsDraft(old => ({ ...old, quality: data.quality })); notify('优先音质已切换为' + ({ standard: '标准', higher: '较高', exhigh: '极高', lossless: '无损' }[data.quality] || '标准') + '，下一首生效'); } catch (e) { notify(e.message); } }
  async function saveSettings() { setModalBusy(true); try { const data = await api('/api/settings', { method: 'PUT', body: { ...settingsDraft, theme } }); setSettings(data); setSettingsDraft(data); notify('设置已保存'); } catch (e) { notify(e.message); } finally { setModalBusy(false); } }
  async function loadDevices() { try { const data = await api('/api/spotify/devices'); setDevices(data.devices || []); setModal({ type: 'devices' }); } catch (e) { notify(e.message); } }
  function external(url) { if (!url) return; if (window.desktop) window.desktop.openExternal(url).catch(e => notify(e.message)); else window.open(url, '_blank', 'noopener,noreferrer'); }
  const activeAccount = accounts.find(a => a.source === theme && a.logged_in) || (['aurora','ink','apple'].includes(theme) ? accounts.find(a => a.logged_in) : undefined);
  const greeting = new Date().getHours() < 12 ? '早上好' : new Date().getHours() < 18 ? '下午好' : '晚上好';
  useEffect(() => { if (theme !== 'qqmusic') return; let alive = true; const load = () => api('/api/history').then(d => alive && setHistoryCount(d.tracks?.length || 0)).catch(() => {}); load(); window.addEventListener('elixir-library-changed', load); return () => { alive = false; window.removeEventListener('elixir-library-changed', load); }; }, [theme, current?.id]);
  const labels = theme === 'aurora' ? { home: '发现音乐', library: '本地与下载', likes: '心动歌曲', history: '最近播放' } : theme === 'spotify' ?{ home: '发现音乐', library: '本地与下载', likes: '已点赞的歌曲', history: '最近播放' } : theme === 'qqmusic' ? { home: '首页', library: '本地和下载', likes: '喜欢', history: '最近播放', playlists: '自建歌单' } : theme === 'apple' ? { home: '主页', library: '本地与下载', likes: '喜爱的歌曲', history: '最近播放' } : { home: '发现音乐', library: '本地与下载', likes: '我喜欢的音乐', history: '最近播放' };
  tableActions.current={search,openCloudPlaylist,batch:batchTracks,navigate,play,openDetail,openEntity,trackEntity,toggleLike,more:track=>setModal({type:'track',track,playlistContext:page==='playlist'?playlist:page==='entity'&&entity?.kind==='playlist'?{...entity,remote_source:entity.source}:null})};
  const visualMode = visualizer === 'auto' ? { netease: 'ring', qqmusic: 'bars', spotify: 'wave', aurora: 'ring', ink: 'wave', apple: 'off' }[theme] : visualizer;
  const showVisualizer = !!detail && visualMode !== 'off' && current?.id === detail.id && !spotifyInterlude;
  const detailSpinning = !!detail && current?.id === detail.id && playing && !buffering;
  const visualizerProps = { mode: visualMode, getAnalyser: effects.analyser, simulated: current?.source === 'spotify', playing: playing && !buffering };
  return <div className={'app theme-' + theme + (detail ? ' detail-open' : '')} style={{ '--now-cover': current?.cover ? `url("${mediaUrl(current.cover).replace(/["\\]/g, '\\$&')}")` : 'none' }}>
    <audio ref={audioRef} onTimeUpdate={e => setPosition(e.currentTarget.currentTime)} onLoadedMetadata={e => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => next(1, true)} onWaiting={() => setBuffering(true)} onCanPlay={() => setBuffering(false)} onError={() => { if (audioRef.current?.src) { setBuffering(false); setPlaying(false); setPlayHint('音频加载失败，请重试或查看平台播放权限。'); } }} />
    <aside className="sidebar">
      <button type="button" className="brand platform-brand" aria-label="Elixir 首页" onClick={()=>navigate('home')}><img src="/xiandan-mark.svg" alt=""/><span>Elixir</span></button>
      <nav><NavigationItem activePage={page} activePlaylistId={playlist?.id} actions={tableActions} target="home" icon={House} title={labels.home} /><NavigationItem activePage={page} activePlaylistId={playlist?.id} actions={tableActions} target="music" icon={Disc} title="我的音乐" /><NavigationItem activePage={page} activePlaylistId={playlist?.id} actions={tableActions} target="likes" icon={Heart} title={labels.likes} count={liked.size || undefined} /><NavigationItem activePage={page} activePlaylistId={playlist?.id} actions={tableActions} target="history" icon={ClockCounterClockwise} title={labels.history} count={theme === 'qqmusic' && historyCount ? historyCount : undefined} /><NavigationItem activePage={page} actions={tableActions} target="ranking" icon={MusicNotes} title="听歌排行" /><NavigationItem activePage={page} activePlaylistId={playlist?.id} actions={tableActions} target="library" icon={FolderSimple} title={labels.library} /></nav>
      <div className="library-heading playlist-heading"><span>{labels.playlists || '创建的歌单'}</span><IconButton icon={Plus} title="新建歌单" onClick={() => { setModalInput(''); setModal({ type: 'create-playlist' }); }} /></div>
      <div className="playlist-navigation">{playlists.length ? playlists.map(item => <NavigationItem activePage={page} activePlaylistId={playlist?.id} actions={tableActions} key={item.id} target="playlist" id={item.id} icon={Playlist} cover={item.cover} title={item.title || item.name} />) : <button className="create-first" onClick={() => { setModalInput(''); setModal({ type: 'create-playlist' }); }}>创建一张自己的歌单 <Plus size={13} /></button>}</div>
      <div className="sidebar-footer">{settings.private_session&&<button className="appearance-button private-mode-indicator" onClick={()=>navigate('history')}>私密收听已开启</button>}<ThemeMenu theme={theme} themes={themes} onChange={changeTheme} /><div className="sidebar-bottom"><button onClick={() => navigate('settings')}><GearSix size={19} /> 设置</button><button title="账号与会员" onClick={() => navigate('accounts')}><UserCircle size={20} /></button><span>{appVersion && 'v' + appVersion}</span></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="topbar-navigation">{theme === 'spotify' && <IconButton icon={House} title="返回首页" onClick={() => navigate('home')} />}<IconButton icon={CaretLeft} className="nav-back" title="后退 · Alt ←" disabled={!historyPos.back} onClick={() => goHistory(-1)} /><IconButton icon={CaretRight} className="nav-forward" title="前进 · Alt →" disabled={!historyPos.forward} onClick={() => goHistory(1)} /></div><form className="search-box" onSubmit={e => { e.preventDefault(); search(); }}><MagnifyingGlass size={21} /><input ref={searchRef} placeholder={theme === 'spotify' ? '想听什么？' : '搜索歌曲、歌手，或粘贴歌曲链接'} value={query} onChange={e => setQuery(e.target.value)} aria-label="搜索音乐" />{query ? <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X size={15} /></button> : <kbd>Ctrl K</kbd>}</form><div className="topbar-account"><button onClick={() => navigate('accounts')}><UserCircle size={26} weight="light" /><span>{activeAccount?.nickname || '登录'}</span></button></div><WindowControls /></header>
      <main className="main-scroll" ref={scrollRef}>
        {page === 'home' && <Home theme={theme} actions={tableActions} current={current} currentId={current?.id} playing={playing} liked={liked} labels={labels} accounts={accounts} onToggle={togglePlayback} onImport={()=>importFolder()} external={external} />}
        {page === 'music' && <MusicLibrary liked={liked} currentId={current?.id} playing={playing} actions={tableActions} onRemotePlaylist={stableCloudPlaylist} onOpen={stableEntity} onPlaylist={stableLocalPlaylist} onTracks={navigate} onImport={()=>navigate('library')} onRefresh={refreshPlaylists} notify={notify} />}
        {page === 'entity' && entity && <>{historyPos.back&&<button className="button quiet" onClick={()=>goHistory(-1)}><CaretLeft size={17}/>返回</button>}<EntityDetail liked={liked} currentId={current?.id} playing={playing} batchActions={tableActions} item={entity} onOpen={stableEntity} onTrack={stableDetail} onPlay={stablePlay} notify={notify} external={external} /></>}
        {page==='ranking'&&<ListeningRankings currentId={current?.id} playing={playing} liked={liked} actions={tableActions}/>}
        {page==='history'&&<ListeningHistory currentId={current?.id} playing={playing} liked={liked} actions={tableActions} privateSession={settings.private_session} notify={notify} onPrivacy={setPrivateListening}/>}
        {['search', 'library', 'likes', 'playlist'].includes(page) && <>{page === 'search' ? <div className="page-heading"><div><h1>{searched ? '“' + searched + '”' : '搜索音乐'}</h1></div></div> : <TrackListHero page={page} title={page === 'playlist' ? playlist?.title || '歌单' : labels[page]} playlist={playlist} tracks={tracks} busy={busy} onImport={() => importFolder()} tools={{ onChange: data => { setPlaylist(data); setTracks(data.tracks || []); }, onExit: () => navigate('music'), onRefresh: refreshPlaylists, notify }} />}{page === 'search' && <><div className="search-filters"><MusicSearchTypes value={searchKind} local={source==='local'} onChange={kind=>{setSearchKind(kind);if(searched)search(searched,source,kind);}}/><div className="source-segment" role="group" aria-label="搜索平台">{sources.map(provider => <button key={provider} aria-pressed={source === provider} onClick={() => { setSource(provider); if (searched) search(searched, provider); }}>{SOURCE_NAMES[provider]}</button>)}</div></div>{!searched && <SearchHistory onSearch={search}/>}</>}{page === 'library' && <LocalFolders onScan={importFolder} jobStatus={job?.status} notify={notify}/>}{page === 'library' && job && <div className="job-note"><CircleNotch className={['running','pending'].includes(job.status) ? 'spin' : ''} size={18} /><span>{['completed','done'].includes(job.status) ? importSummary(job) : '正在导入 · ' + (job.done || 0) + (job.total ? '/' + job.total : '')}</span>{job.errors?.length > 0 && <span title={job.errors.map(e => e.file + '：' + e.message).join('\n')}>{job.errors.length} 个文件未导入：{job.errors.slice(0, 3).map(e => e.file).join('、')}{job.errors.length > 3 ? ' 等' : ''}</span>}<IconButton icon={X} title="关闭提示" onClick={() => setJob(null)} /></div>}{errors.map((error, i) => <ErrorNote key={i}>{error}</ErrorNote>)}{page === 'search' && searchKind !== 'track' ? <EntitySearch query={searched} kind={searchKind} source={source} onOpen={openEntity}/> : busy ? <Loading text={page === 'search' ? '正在查询平台资料…' : '正在加载音乐…'} /> : tracks.length ? <PlaybackTrackTable controls filterable={page !== 'search'} viewKey={page+(page==='search'?':'+source:page==='playlist'?':'+playlist?.id:'')} key={page+':'+(playlist?.id||'')} playlistId={page==='playlist'&&!playlist?.remote_source?playlist?.id:undefined} playlistContext={page==='playlist'?playlist:undefined} items={tracks} currentId={current?.id} playing={playing} liked={liked} actions={tableActions} /> : <Empty icon={page === 'library' ? FolderSimple : page === 'likes' ? Heart : MagnifyingGlass} title={page === 'search' ? searched ? '没有找到匹配的歌曲' : '从一首喜欢的歌开始' : page === 'library' ? '把你的音乐带进来' : '这里还没有歌曲'} text={page === 'search' ? '' : page === 'library' ? 'MP3、FLAC、M4A、WAV' : ''} action={page === 'library' ? <button className="button primary" onClick={() => importFolder()}><Plus size={18} />选择音乐文件夹</button> : undefined} />}</>}
        {page === 'accounts' && <div className="accounts-page"><PageHero compact kind="accounts" icon={UserCircle} title="账号与会员" meta={'已连接 ' + platforms.filter(p => accounts.some(a => a.source === p && a.logged_in)).length + ' / ' + platforms.length + ' 个平台 · 会员与播放权限以平台为准'} actions={<button className="button quiet" onClick={()=>refreshAccounts(true)}><ArrowsClockwise size={18} />刷新状态</button>} /><div className="account-list">{platforms.map(provider => { const account = accounts.find(a => a.source === provider) || {}; return <section className={'account-card account-' + provider + (account.logged_in ? ' connected-card' : '')} key={provider}><div className="account-band"><div className={'platform-avatar platform-' + provider}><img src={'/platforms/'+provider+'.png'} alt=""/></div></div><div className="account-content"><h2>{SOURCE_NAMES[provider]}{account.logged_in && <span className="connected"><CheckCircle size={14} weight="fill" />已连接</span>}</h2><p>{account.logged_in ? account.nickname || '已登录账号' : '尚未连接'}</p>{account.logged_in && <div className="membership"><Crown size={17} />{account.membership || '会员状态未返回'}</div>}{account.reason&&<small>{account.reason}</small>}</div><div className="account-actions">{account.logged_in ? <><button className="button quiet" onClick={() => login(provider)}>重新登录</button><button className="text-button" onClick={() => loadCloudPlaylists(provider)}><Playlist size={16} />云端歌单</button><button className="text-button" onClick={() => logout(provider)}><SignOut size={16} />退出</button></> : <button className="button primary" onClick={() => login(provider)}>连接账号<ArrowRight size={17} /></button>}</div></section>; })}</div><details className="account-help"><summary>登录与会员说明</summary><div><p>会员与播放权限由各平台提供。</p><p>Spotify 支持官方网页登录与 Cookie 登录。</p></div></details></div>}
        {page === 'settings' && <div className="settings-page"><PageHero compact kind="settings" icon={GearSix} title="设置" meta={'Elixir' + (appVersion ? ' v' + appVersion : '') + ' · 界面、播放、音效与连接'} actions={<button className="button primary" onClick={saveSettings} disabled={modalBusy}><Check size={18} />保存设置</button>} /><div className="section-page"><SectionNav sections={settingSections} /><div className="section-body"><section className="settings-section" id="settings-theme"><h2>界面风格</h2><div className="theme-options">{themes.map(provider => <button className={'theme-option ' + (theme === provider ? 'chosen' : '')} key={provider} onClick={() => { setTheme(provider); setSettingsDraft(d => ({ ...d, theme: provider })); api('/api/settings', { method: 'PUT', body: { theme: provider } }).then(data => setSettings(data)).catch(e => notify(e.message)); }}><div className={'theme-preview preview-' + provider}><i className="preview-sidebar"><b /><b /><b /></i><i className="preview-main"><b /><span><i /><i /><i /></span><b /></i><i className="preview-player" /></div><span>{THEME_NAMES[provider]}{theme === provider && <CheckCircle size={19} weight="fill" />}</span></button>)}</div></section><section className="settings-section" id="settings-playback"><h2>播放</h2><div className="setting-row"><div><strong>优先音质</strong><p>可用音质取决于账号与平台授权。</p></div><SelectMenu aria-label="播放音质" value={settingsDraft.quality || 'standard'} onChange={e => setSettingsDraft(d => ({ ...d, quality: e.target.value }))}><option value="standard">标准音质</option><option value="higher">较高音质</option><option value="exhigh">极高音质</option><option value="lossless">无损音质</option></SelectMenu></div><div className="setting-row"><div><strong>播放速度</strong></div><SelectMenu aria-label="播放速度" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[0.75, 1, 1.25, 1.5, 2].map(rate => <option value={rate} key={rate}>{rate} ×</option>)}</SelectMenu></div><div className="setting-row"><div><strong>音浪</strong><p>歌词页封面处的频谱。Spotify 音频受版权保护，只能显示模拟效果。</p></div><SelectMenu aria-label="音浪样式" value={visualizer} onChange={e => setVisualizer(e.target.value)}><option value="auto">跟随界面风格</option><option value="bars">柱状</option><option value="wave">波形</option><option value="ring">环形</option><option value="off">关闭</option></SelectMenu></div><div className="setting-row"><div><strong>睡眠定时</strong><p>{sleepUntil ? '将在 ' + new Date(sleepUntil).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) + ' 暂停' : ''}</p></div><button className="button quiet" onClick={() => setModal({ type: 'sleep' })}><Timer size={18} />{sleepUntil ? '修改定时' : '设置定时'}</button></div></section><div id="settings-effects" className="section-anchor"><AudioEffects effects={effects} remote={current?.source==='spotify'}/></div><section className="settings-section" id="settings-desktop"><h2>桌面与快捷键</h2><div className="setting-row"><div><strong>桌面歌词</strong></div><button className="button quiet" onClick={toggleDesktopLyrics}>{desktopLyrics?'关闭桌面歌词':'打开桌面歌词'}</button></div><dl className="shortcut-list"><div><dt>播放 / 暂停</dt><dd><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>空格</kbd></dd></div><div><dt>上一首 / 下一首</dt><dd><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>← / →</kbd></dd></div></dl></section><section className="settings-section" id="settings-connection"><h2>连接</h2><label className="field-label">网络代理<input placeholder="http://127.0.0.1:7890" value={settingsDraft.proxy || ''} onChange={e => setSettingsDraft(d => ({ ...d, proxy: e.target.value }))} /></label><details className="advanced-connection"><summary>高级连接</summary><label className="field-label">Spotify Client ID<input placeholder="输入 Client ID" value={settingsDraft.spotify_client_id || ''} onChange={e => setSettingsDraft(d => ({ ...d, spotify_client_id: e.target.value }))} /></label><p className="field-help">仅用于开发者登录。回调地址：<code>http://127.0.0.1:18740/api/accounts/spotify/callback</code></p><button className="text-button" onClick={() => external('https://developer.spotify.com/dashboard')}>打开 Spotify 开发者控制台<ArrowSquareOut size={15} /></button></details></section><section className="settings-section about-section" id="settings-about"><img className="app-about-icon" src="/xiandan-icon.png" alt=""/><div><h2>Elixir <small>{appVersion}</small></h2><p>独立音乐客户端</p></div><button className="button quiet" onClick={()=>window.desktop?.window('quit')}>退出 Elixir</button></section></div></div></div>}
      </main>
    </div>
    <PlayerBar current={current} interlude={spotifyInterlude} playHint={playHint} liked={liked} playing={playing} buffering={buffering} playMode={playMode} queueLength={queue.length} queueOpen={queueOpen} duration={duration} volume={volume} quality={settings.quality} onOpenDetail={openDetail} onToggleLike={toggleLike} onPlayMode={setPlayMode} onSkip={next} onToggle={togglePlayback} onSeek={value=>{if(current?.source!=='spotify')audioRef.current.currentTime=value;setPosition(value);}} onSeekEnd={value=>{if(current?.source==='spotify')spotifyControl('seek',Math.round(value*1000));}} onQualityChange={changeQuality} desktopLyrics={desktopLyrics} onDesktopLyrics={window.desktop?.openLyrics ? toggleDesktopLyrics : undefined} onVolume={setVolume} onVolumeEnd={value=>{if(current?.source==='spotify')spotifyControl('volume',Math.round(value*100));}} onQueue={()=>setQueueOpen(!queueOpen)} />
    <DesktopLyricSync current={current} lyric={playerLyric} interlude={spotifyInterlude} playing={playing} buffering={buffering} speed={speed} duration={duration} lyricOffset={lyricOffset} />
    {queueOpen && <aside className="queue-panel"><div className="queue-heading"><div><h2>播放队列</h2><p>{queue.length} 首歌曲{queue.length > 1 ? '，可拖动调整顺序' : ''}</p></div><button className="text-button" disabled={!queueUndo} onClick={()=>{setQueue(queueUndo);setQueueUndo(null);}}>撤销修改</button><IconButton icon={Trash} title="清空队列" onClick={() => editQueue([])} /><IconButton icon={X} title="关闭队列" onClick={() => setQueueOpen(false)} /></div><div className="queue-items">{queue.length ? queue.map((track, index) => <div className={'queue-item ' + (current?.id === track.id ? 'active' : '') + (dragOver === index ? ' drop-target' : '')} key={track.id + ':' + index} draggable onDragStart={e => { dragFrom.current = index; e.dataTransfer.effectAllowed = 'move'; }} onDragOver={e => { if (dragFrom.current === null) return; e.preventDefault(); setDragOver(index); }} onDragLeave={() => setDragOver(old => old === index ? null : old)} onDrop={e => { e.preventDefault(); moveQueueTo(dragFrom.current, index); dragFrom.current = null; setDragOver(null); }} onDragEnd={() => { dragFrom.current = null; setDragOver(null); }}><button onClick={() => play(track)}><Cover src={track.cover} /><span><strong>{track.title}{upNext.includes(track.id) && current?.id !== track.id && <em className="queue-next-tag">{upNext[0] === track.id ? '下一首' : '稍后'}</em>}</strong><small>{track.artist}</small></span></button>{current?.id !== track.id && <IconButton icon={SkipForward} className="queue-play-next" title={'下一首播放 ' + track.title} onClick={() => batchTracks('next', [track])} />}<button className="icon-button queue-move" aria-label={'队列上移 '+track.title} disabled={index===0} onClick={()=>moveQueue(index,-1)}>↑</button><button className="icon-button queue-move" aria-label={'队列下移 '+track.title} disabled={index===queue.length-1} onClick={()=>moveQueue(index,1)}>↓</button><IconButton icon={X} title="从队列移除" onClick={() => editQueue(queue.filter((_, i) => i !== index))} /></div>) : <Empty icon={Queue} title="队列是空的" text="" />}</div></aside>}
    {detail && <section className="detail-view" style={{ '--detail-cover': detail.cover ? `url("${mediaUrl(detail.cover).replace(/["\\]/g, '\\$&')}")` : 'none' }}><div className="detail-backdrop" aria-hidden="true" /><div className="detail-toolbar"><button className="button quiet detail-close" onClick={() => setDetail(null)}><CaretDown size={19} />收起</button><div><SourceTag source={detail.source} /><button className="text-button" onClick={() => external(detail.source_url)} disabled={!detail.source_url}>在原平台打开<ArrowSquareOut size={15} /></button></div></div><div className="detail-layout"><aside className="detail-art"><div className={'detail-cover-stage' + (showVisualizer && visualMode === 'ring' ? ' has-ring' : '')}>{theme === 'netease' ? <div className="vinyl-deck"><div className={'large-cover vinyl-cover' + (detailSpinning ? ' spinning' : '')}><Cover src={detail.cover} title={detail.title} /></div><i className={'tonearm' + (detailSpinning ? ' engaged' : '')} aria-hidden="true" /></div> : <div className="large-cover"><Cover src={detail.cover} title={detail.title} /></div>}{showVisualizer && visualMode === 'ring' && <Visualizer key={theme} {...visualizerProps} className="visualizer-ring" />}</div>{showVisualizer && visualMode !== 'ring' && <Visualizer key={theme + visualMode} {...visualizerProps} className="visualizer-strip" />}{showVisualizer && visualizerProps.simulated && <p>Spotify 音频受版权保护，此处为模拟音浪</p>}<h1>{detail.title}</h1><ListeningBadge id={detail.id}/><button className="artist-name" onClick={() => trackEntity(detail,'artist')}>{detail.artist}</button><button className="text-button" onClick={()=>trackEntity(detail,'album')} disabled={!detail.album}>{detail.album}</button><div className="detail-actions"><button className="button primary" onClick={() => play(detail)}><Play size={18} weight="fill" />播放</button><IconButton icon={Heart} title="喜欢" active={liked.has(detail.id)} onClick={() => toggleLike(detail)} /><IconButton icon={Plus} title="添加到歌单" onClick={() => setModal({ type: 'add-playlist', track: detail })} /></div></aside><div className="detail-content"><div className="detail-tabs"><button className={detailTab === 'lyrics' ? 'active' : ''} onClick={() => setDetailTab('lyrics')}>歌词</button><button className={detailTab === 'comments' ? 'active' : ''} onClick={() => setDetailTab('comments')}>评论{comments?.trackId === detail.id && comments.total ? <small>{comments.total.toLocaleString()}</small> : null}</button><button className={detailTab === 'info' ? 'active' : ''} onClick={() => setDetailTab('info')}>歌曲资料</button></div>{detailTab === 'lyrics' && <div className="lyrics-scroll"><div className="lyric-offset">{lyricTranslations.length > 0 && <button className={'lyric-translate' + (showTranslation ? ' active' : '')} aria-pressed={showTranslation} title={showTranslation ? '隐藏翻译' : '显示翻译'} onClick={() => setShowTranslation(value => !value)}>译</button>}<span>歌词校时 {lyricOffset>0?'+':''}{lyricOffset.toFixed(1)}秒</span>{[-0.5,0,0.5].map(delta=><button key={delta} onClick={()=>{const next=delta===0?0:Math.round((lyricOffset+delta)*10)/10;setLyricOffset(next);localStorage.setItem('lyric-offset:'+detail.id,String(next));}}>{delta===0?'重置':delta>0?'延后0.5秒':'提前0.5秒'}</button>)}</div>{detailErrors[detail.id + ':lyrics'] ? <Empty icon={MicrophoneStage} title="暂时无法获取歌词" text={detailErrors[detail.id + ':lyrics']} /> : lyrics?.trackId !== detail.id ? <Loading text="正在获取歌词…" /> : lyricLines.length ? <LyricLines lines={lyricLines} active={current?.id===detail.id} playing={playing} onSeek={line=>{if(current?.id===detail.id){if(current.source==='spotify')spotifyControl('seek',Math.round(line.time*1000));else if(audioRef.current.src){audioRef.current.currentTime=line.time;setPosition(line.time);}}}}>{(lyrics.attribution || lyrics.source || lyrics.reason) && <div className="lyric-attribution">{lyrics.attribution || (lyrics.source === 'lrclib' ? 'LRCLIB 社区歌词库' : SOURCE_NAMES[lyrics.source]) || ''}{lyrics.reason && <span>{lyrics.reason}</span>}</div>}{lyrics.warning && <ErrorNote>{lyrics.warning}</ErrorNote>}</LyricLines> : lyrics.original ? <div>{lyrics.source&&<div className="lyric-attribution">{lyrics.attribution || [SOURCE_NAMES[lyrics.source] || lyrics.source,lyrics.provider_display_name || lyrics.provider].filter(Boolean).join(' · ')}</div>}<pre className="plain-lyrics">{lyrics.original}</pre></div> : <Empty icon={MicrophoneStage} title="暂无歌词" text={lyrics.reason || '平台没有返回该歌曲的歌词，可稍后重试。'} />}{lyrics?.trackId === detail.id && lyrics.translated && !lyricTranslations.length && <details className="translated-lyrics"><summary>查看翻译歌词</summary><pre>{lyrics.translated}</pre></details>}</div>}{detailTab === 'comments' && <div className="comments-scroll">{detailErrors[detail.id + ':comments'] ? <Empty icon={ListBullets} title="暂时无法获取评论" text={detailErrors[detail.id + ':comments']} /> : comments?.trackId !== detail.id ? <Loading text="正在读取平台评论…" /> : comments.items?.length ? <>{comments.warning && <ErrorNote>{comments.warning}</ErrorNote>}<p className="comments-description">来自 {SOURCE_NAMES[comments.source || detail.source]} 的评论 · {comments.total?.toLocaleString() || comments.items.length} 条</p>{comments.items.map((comment, index) => <article className="comment" key={comment.id || index}><div className="comment-avatar">{comment.avatar ? <img src={comment.avatar} alt="" /> : <UserCircle size={31} />}</div><div className="comment-body"><header><strong>{comment.user || '音乐听众'}</strong><span>{comment.likes || 0} 赞</span></header><p>{comment.text}</p><time>{formatCommentTime(comment.time)}</time></div></article>)}{comments.has_more && <button className="button quiet more-comments" disabled={modalBusy} onClick={moreComments}>{modalBusy ? '加载中…' : '加载更多评论'}</button>}</> : <Empty icon={ListBullets} title="平台暂无返回评论" text={comments.reason || '评论是否保留取决于原平台，歌曲下架不一定意味着资料已删除。'} />}</div>}{detailTab === 'info' && <TrackInformation track={detail} onEntity={trackEntity} onMatch={findMatches} onUnlink={async(track)=>{try{await api('/api/library/'+encodeURIComponent(track.id)+'/link',{method:'DELETE'});openDetail(await api(trackPath(track.id)), 'info');notify('已取消资料关联，原音频与标签保持原样');}catch(e){notify(e.message);}}}/>}</div></div></section>}
    {modal && <Modal title={modalTitle(modal)} wide={modal.type === 'match'} onClose={() => { if (!modalBusy) {setModalInput('');setModal(null);} }}>
      {modal.type === 'track' && <><div className="modal-track"><Cover src={modal.track.cover} /><div><strong>{modal.track.title}</strong><p>{modal.track.artist}</p></div></div><div className="action-menu"><button onClick={() => { play(modal.track); setModal(null); }}><Play size={19} />播放</button><button onClick={() => { setQueue(q => [...q, modal.track]); setModal(null); notify('已加入播放队列'); }}><Queue size={19} />加入播放队列</button><button onClick={()=>{batchTracks('next',[modal.track]);setModal(null);}}><SkipForward size={19}/>下一首播放</button><button onClick={() => { const track = modal.track; setModal(null); openDetail(track); }}><MicrophoneStage size={19} />查看歌词与评论</button><button onClick={() => setModal({ type: 'add-playlist', track: modal.track })}><Plus size={19} />添加到歌单</button>{modal.track.source === 'local' && <button onClick={()=>{batchTracks('local_remove',[modal.track]);setModal(null);}}><Trash size={19}/>从音乐库移除</button>}{modal.track.source === 'local' && <button onClick={() => findMatches(modal.track)}><LinkSimple size={19} />匹配封面、歌词与评论</button>}{modal.playlistContext&&<button onClick={()=>{batchTracks('playlist_remove',[modal.track],modal.playlistContext);setModal(null);}}><Trash size={19}/>{modal.playlistContext.remote_source?'从 Elixir 副本移除':'从当前歌单移除'}</button>}<button disabled={!modal.track.source_url} onClick={() => external(modal.track.source_url)}><ArrowSquareOut size={19} />在原平台打开</button><button onClick={() => { navigator.clipboard.writeText(modal.track.source_url || modal.track.id).then(() => notify('已复制歌曲链接 / ID')); }}><Copy size={19} />复制链接 / ID</button></div></>}
      {modal.type === 'create-playlist' && <form onSubmit={e => { e.preventDefault(); createPlaylist(); }}><label className="field-label">歌单名称<input autoFocus value={modalInput} maxLength={80} onChange={e => setModalInput(e.target.value)} placeholder="给这段音乐一个名字" /></label><div className="modal-footer"><button type="button" className="button quiet" onClick={() => setModal(null)}>取消</button><button className="button primary" disabled={!modalInput.trim() || modalBusy}>创建歌单</button></div></form>}
      {modal.type === 'add-playlist' && <div className="playlist-picker">{playlists.length ? playlists.map(item => <button key={item.id} onClick={() => addToPlaylist(item)}><Playlist size={24} /><span>{item.title || item.name}</span><Plus size={18} /></button>) : <Empty icon={Playlist} title="还没有歌单" text="先创建歌单" />}</div>}
      {modal.type === 'import' && <form onSubmit={e => { e.preventDefault(); importFolder(modalInput); }}><label className="field-label">音乐文件夹路径<input autoFocus value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="例如 D:\Music" /></label><p className="field-help">选择音乐文件夹</p><div className="modal-footer"><button className="button primary" disabled={!modalInput.trim()}>开始导入</button></div></form>}
      {modal.type === 'match' && <><p className="modal-description">为「{matchTrack?.title}」选择匹配版本。</p>{modalBusy ? <Loading text="正在跨平台比对歌曲信息…" /> : matches?.length ? <div className="match-list">{matches.map((entry, index) => { const track = entry.track || entry; return <button key={track.id || index} onClick={() => linkTrack(track)}><Cover src={track.cover} /><span><strong>{track.title}</strong><small>{track.artist} · {track.album} · {formatDuration(track.duration_ms)}</small><SourceTag source={track.source} /></span>{entry.score !== undefined && <b>{Math.round(entry.score <= 1 ? entry.score * 100 : entry.score)}%</b>}<LinkSimple size={20} /></button>; })}</div> : <Empty icon={LinkSimple} title="没有找到可靠候选" text="没有找到匹配版本" />}</>}
      {modal.type === 'login' && <><div className="login-instructions"><UserCircle size={58} weight="light" /><h3>在官方页面完成登录</h3><p>在 {SOURCE_NAMES[modal.source]} 窗口登录后刷新账号。</p><p>播放权限以平台为准。</p></div><div className="modal-footer"><button className="button quiet" onClick={() => loginOfficial(modal.source)}>重新打开页面</button><button className="button primary" disabled={modalBusy} onClick={() => finishLogin(modal.source)}>{modalBusy ? '同步中…' : '已登录，刷新账号'}</button></div></>}
      {modal.type === 'spotify-cookie' && <form onSubmit={e=>{e.preventDefault();loginSpotifyCookie();}}><p className="modal-description">粘贴 Spotify 的 sp_dc Cookie，或打开官方登录。</p><label className="field-label">Spotify Cookie<textarea autoFocus autoComplete="off" spellCheck="false" value={modalInput} onChange={e=>setModalInput(e.target.value)} placeholder="sp_dc=你的登录 Cookie" rows={4} /></label><p className="field-help">Cookie 仅保存在本机。</p><div className="modal-footer"><button type="button" className="button quiet" onClick={()=>{setModalInput('');loginOfficial('spotify');}}>官方网页登录</button><button className="button primary" disabled={modalBusy||!modalInput.trim()}>{modalBusy?'正在打开…':'导入并打开 Spotify'}</button></div></form>}
      {modal.type === 'netease-qr' && <><div className="login-instructions"><h3>使用网易云音乐 App 扫码</h3><div className="qr-code">{qr?.qr_png ? <img src={qr.qr_png.startsWith('data:') ? qr.qr_png : 'data:image/png;base64,' + qr.qr_png} alt="网易云音乐登录二维码" /> : <CircleNotch className="spin" size={34} />}{['expired','error','timeout'].includes(qrStatus) && <button className="qr-overlay" onClick={loadQr}><ArrowsClockwise size={25} />刷新二维码</button>}</div><p>{{loading:'正在生成二维码…',waiting:'打开网易云音乐，扫一扫并确认登录',scanned:'扫码成功，请在手机上确认',expired:'二维码已过期',authorized:'登录成功',verifying:'已收到扫码确认，正在核实账号资料…',retrying:'连接暂时中断，正在自动重试，请勿重复扫码',timeout:'等待时间较长，请刷新二维码后重试',error:'多次连接失败，请刷新或使用官方网页登录'}[qrStatus]}</p>{qrError&&<p className="qr-error-reason" role="status">{qrError}</p>}</div><div className="modal-footer"><button className="button quiet" onClick={() => loginOfficial('netease')}>改用官方网页登录</button><button className="button primary" onClick={loadQr}><ArrowsClockwise size={17} />刷新</button></div></>}
      {modal.type === 'cloud-playlists' && <>{modalBusy ? <Loading text="正在读取云端歌单…" /> : <>{cloudPlaylistStatus?.state==='error'?<div className="workspace-failure" role="alert"><h3>云端歌单读取失败</h3><p>{cloudPlaylistStatus.reason}</p><button className="button quiet" onClick={()=>loadCloudPlaylists(modal.source)}>重新读取</button></div>:<><p className="workspace-note">已读取 {cloudPlaylists.length} 个歌单{cloudPlaylistStatus?.partial?' · 当前为部分结果':''}</p>{cloudPlaylistStatus?.warnings?.map((w,i)=><ErrorNote key={i}>{w}</ErrorNote>)}<div className="playlist-picker">{cloudPlaylists.length?cloudPlaylists.map(item=><button key={item.id} onClick={()=>openCloudPlaylist(item,modal.source)}><Cover src={item.cover}/><span>{item.title || item.name}<small>{Number.isFinite(item.count)?item.count+' 首歌曲':'曲目数待返回'}{item.collection_kind==='created'?' · 自建':item.collection_kind==='saved'?' · 收藏':''}</small></span><CaretRight size={17}/></button>):<Empty icon={Playlist} title={cloudPlaylistStatus?.empty?'账号当前没有云端歌单':'平台未返回可确认的歌单目录'} text={cloudPlaylistStatus?.empty?'平台已成功返回空列表。':'这不代表你的账号没有歌单，请重试读取。'}/>}</div><button className="button quiet" onClick={()=>loadCloudPlaylists(modal.source)}><ArrowsClockwise size={16}/>刷新歌单</button></>}</>}</>}
      {modal.type === 'sleep' && <><p className="modal-description">定时结束后自动暂停音乐。</p><div className="sleep-options">{[15, 30, 45, 60, 90].map(minutes => <button className={sleepMinutes === minutes ? 'chosen' : ''} key={minutes} onClick={() => setSleepMinutes(minutes)}>{minutes} 分钟</button>)}</div><div className="modal-footer">{sleepUntil && <button className="button quiet" onClick={() => { setSleepUntil(null); setModal(null); notify('睡眠定时已取消'); }}>取消定时</button>}<button className="button primary" onClick={() => { setSleepUntil(Date.now() + sleepMinutes * 60000); setModal(null); notify(sleepMinutes + ' 分钟后暂停'); }}><Moon size={18} />开始定时</button></div></>}
      {modal.type === 'devices' && <><div className="device-tools"><button className="button quiet" onClick={()=>external('https://open.spotify.com')}>打开网页播放器<ArrowSquareOut size={16}/></button></div><div className="playlist-picker">{devices.length ? devices.map(device => <button key={device.id} onClick={() => { setDeviceId(device.id); setModal(null); notify('已选择 ' + device.name); }}><MonitorPlay size={25} /><span>{device.name}<small>{device.type}{device.is_active ? ' · 当前活动设备' : ''}</small></span>{deviceId === device.id && <Check size={18} />}</button>) : <Empty icon={MonitorPlay} title="未发现可用设备" text="没有在线设备" />}</div><button className="button quiet" onClick={loadDevices}><ArrowsClockwise size={17} />刷新设备</button></>}
    </Modal>}
    {toast && <div className="toast" role="status"><Info size={18} /><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast('')}><X size={14} /></button></div>}
  </div>;
}
function modalTitle(modal) { return { track: '歌曲操作', 'create-playlist': '新建歌单', 'add-playlist': '添加到歌单', import: '导入本地音乐', match: '匹配平台资料', login: '连接 ' + SOURCE_NAMES[modal.source], sleep: '睡眠定时', devices: 'Spotify 播放设备', 'spotify-cookie': '连接 Spotify · Cookie 登录', 'netease-qr': '扫码连接网易云音乐', 'cloud-playlists': SOURCE_NAMES[modal.source] + ' · 云端歌单' }[modal.type] || ''; }
function formatCommentTime(value) { if (!value) return ''; let date = new Date(typeof value === 'number' && value < 100000000000 ? value * 1000 : value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
createRoot(document.getElementById('root')).render(new URLSearchParams(location.search).has('desktopLyrics') ? <DesktopLyrics/> : <App />);
