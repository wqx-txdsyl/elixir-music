import { PlatformMark, PlatformSearchLink, openPlatform } from './PlatformAccounts';
import { CATALOG_SOURCES } from './api';
import { AccountCenter, connectedCount } from './AccountCenter';
import { MvPlayer } from './MvPlayer';
import './layers.css';
import { useDevice } from './device';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { SpotifyLogoIcon } from '@phosphor-icons/react';
import { House, MagnifyingGlass, Heart, ClockCounterClockwise, FolderSimple, Playlist, GearSix, UserCircle, MusicNotes, CaretLeft, CaretRight, CaretDown, Plus, X, Minus, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, RepeatOnce, SpeakerHigh, SpeakerSlash, Queue, MicrophoneStage, DotsThree, ArrowSquareOut, Check, WarningCircle, CircleNotch, DownloadSimple, LinkSimple, Trash, ArrowsClockwise, Timer, SlidersHorizontal, MonitorPlay, Disc, ArrowRight, ListBullets, Moon, CheckCircle, Info, SignOut, Crown, Copy, PaintBrush, PuzzlePiece, Shuffle as ShuffleIcon, Palette, ArrowCounterClockwise, FloppyDisk, List as MenuIcon } from '@phosphor-icons/react';
import { api, appToken, mediaUrl, trackPath, SOURCE_NAMES, THEME_NAMES, formatDuration, parseLrc, formatSourceError } from './api';
import './styles.css';
import DesktopLyrics from './DesktopLyrics';
import WindowControls from './WindowControls';
import { useNavFit } from './useNavFit';
import { useIslandClear } from './useIslandClear';
import { NavigationItem, PlaybackTrackTable } from './TrackTable';
import {ListeningHistory} from './ListeningHistory';
import {useListeningHistory} from './useListeningHistory';
import {useSpotifyListeningHistory} from './useSpotifyListeningHistory';
import { AudioEffects, useAudioEffects } from './AudioEffects';
import SelectMenu from './SelectMenu';
import Modal from './Modal';
import ContextMenu, { menuPoint } from './ContextMenu';
import SearchSuggest from './SearchSuggest';
import { mergeSearchResults } from './search-merge.mjs';
import { ArrowUp, ArrowDown, HeartBreak } from '@phosphor-icons/react';
import {insertNext,moveItem,pinNext,pinnedNext} from './playback-queue.mjs';
import {ownedSpotifySnapshot,spotifyClockPosition,reconcileSpotifyClock,followingTrack,spotifyHandoff} from './spotify-state.mjs';
import { LocalFolders, TrackInformation, MusicLibrary, MusicSearchTypes, EntitySearch, EntityDetail, PlaylistTools, SearchHistory } from './MusicWorkspace';
import Home from './Home';
import PlayerBar from './PlayerBar';
import LyricLines from './LyricLines';
import DesktopLyricSync from './DesktopLyricSync';
import {IconButton,Cover,Empty,Loading,ErrorNote,Note,Tabs,Skeleton} from './ui';
import {playbackClock} from './playback-clock.mjs';
import Visualizer from './Visualizer';
import './controls.css';
import ThemeMenu from './ThemeMenu';
import { detectChorus } from './chorus.mjs';
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
import './components.css';
import './skins-cn.css';
import './skins-global.css';
import './skins-global-2.css';
import './skins-classic.css';
import './skins-elixir.css';
import './skins-elixir-2.css';
import './skins-elixir-magazine.css';
import './skins-elixir-brutal.css';
import './skins-elixir-eink.css';
import './skins-elixir-pixel.css';
import './skins-elixir-vapor.css';
import './skins-elixir-constructivist.css';
import './skin-spotify.css';
import './tuning.css';
import { useAppearance } from './useAppearance';
import { skinLabels, SKINS } from './skins.mjs';
import { nowPlayingStyle, visualizerStyle, homeLayout } from './appearance.mjs';
import { SLOTS, LAYOUT_PRESETS, randomParts } from './components.mjs';
import Studio from './Studio';
import CommandPalette from './CommandPalette';
import { LayoutEditor } from './LayoutEditor';
import { NowPanel, Cassette, SidebarClock, IpodPlayer, PosterMark, SkinPreview, CdPlayer, CoverMosaic } from './Parts';
import { useShortcuts, comboFromEvent, comboParts, ANYWHERE } from './shortcuts';
import ShortcutSettings from './ShortcutSettings';
import './studio.css';
import './workshop.css';
import './parts.css';
import './interaction.css';
import './mobile.css';
const AUDIO_FAILED = '音频加载失败，可能是播放地址失效或网络中断。';

const sources = ['all', 'local', 'netease', 'qqmusic', 'spotify', ...CATALOG_SOURCES];
const themes = ['netease', 'qqmusic', 'spotify', 'aurora', 'ink', 'apple'];
// Word-timed lyrics when the platform has them, otherwise ordinary LRC lines.
const lyricTimeline = data => { const words = parseWordLyrics(data?.words); return words.length ? words : parseLrc(data?.original || ''); };
playbackClock.set(localStorage.getItem('musicplatform-last-position') || 0);

const settingSections = [['settings-theme', '外观'], ['settings-playback', '播放'], ['settings-effects', '音效'], ['settings-desktop', '桌面与快捷键'], ['settings-connection', '连接'], ['settings-about', '关于']];
function listMeta(tracks) { const minutes = Math.round(tracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0) / 60000), sources = new Set(tracks.map(t => t.source)).size; return [tracks.length + ' 首', minutes ? (minutes >= 60 ? Math.floor(minutes / 60) + ' 小时 ' + (minutes % 60) + ' 分钟' : minutes + ' 分钟') : '', sources > 1 ? '来自 ' + sources + ' 个来源' : ''].filter(Boolean).join(' · '); }
function TrackListHero({ page, title, playlist, tracks, busy, onImport, tools }) {
  const meta = busy ? '正在加载…' : listMeta(tracks);
  if (page === 'playlist') return playlist ? <PlaylistTools playlist={playlist} tracks={tracks} meta={meta} {...tools} /> : <PageHero kind="playlist" icon={Playlist} eyebrow="Elixir 歌单" title={title} meta={meta} />;
  if (page === 'library') return <PageHero kind="library" icon={FolderSimple} eyebrow="本地音乐" title={title} meta={meta} actions={<button className="button primary" onClick={onImport}><Plus size={18} />添加文件夹</button>} />;
  return <PageHero kind="likes" icon={Heart} eyebrow="收藏" title={title} meta={meta} />;
}
// 搜索平台页签上的进度：转圈、条数或失败
function SearchBadge({ status }) {
  if (!status) return null;
  if (status.state === 'loading') return <CircleNotch className="spin search-badge" size={12} aria-label="加载中" />;
  if (status.state === 'error') return <WarningCircle className="search-badge failed" size={13} aria-label="搜索失败" />;
  if (status.state === 'skipped') return null;
  return <small className="search-badge">{status.count}</small>;
}
function SourceTag({ source }) { return <span className={'source-tag source-' + source}>{source === 'netease' ? '网易云' : SOURCE_NAMES[source] || source}</span>; }

function importSummary(job) {
  const parts = ['导入完成 · 新增 ' + (job.imported || 0) + ' 首'];
  if (job.restored) parts.push('其中 ' + job.restored + ' 首是之前移除后重新加入的');
  if (job.unchanged) parts.push(job.unchanged + ' 首已在音乐库中');
  if (job.removed) parts.push(job.removed + ' 首之前已移除，未重新加入');
  return parts.join('，');
}

function App() {
  const [page, setPage] = useState('home');
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [source, setSource] = useState('all');
  const [searchKind, setSearchKind] = useState('track');
  const [entity, setEntity] = useState(null);
  const [queueUndo, setQueueUndo] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  // 各平台的搜索进度：{ 平台: { state: loading | done | error | skipped, count } }；stale 表示还在显示上一次的结果
  const [searchStatus, setSearchStatus] = useState({});
  const [searchStale, setSearchStale] = useState(false);
  const [lyricTune, setLyricTune] = useState(false);
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
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [modalInput, setModalInput] = useState('');
  const [modalBusy, setModalBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('lyrics');
  const [lyrics, setLyrics] = useState(null);
  const [comments, setComments] = useState(null);
  const [detailErrors, setDetailErrors] = useState({});
  const [queue, setQueue] = useState(() => { try { const q=JSON.parse(localStorage.getItem('musicplatform-queue') || '[]');return Array.isArray(q)?q:[]; } catch { return []; } });
  const [current, setCurrent] = useState(()=>{try{const t=JSON.parse(localStorage.getItem('musicplatform-last-track') || 'null');return t?.id && sources.includes(t.source)?t:null;}catch{return null;}});
  const [playing, setPlaying] = useState(false);
  const appearance = useAppearance(current?.cover);
  const { resolved, look } = appearance, parts = resolved.parts, theme = resolved.skin.base;
  const [editing, setEditing] = useState(false);
  const closeEditor = useCallback(() => setEditing(false), []);
  const [palette, setPalette] = useState(false);
  // 安卓端：phone 用抽屉侧栏 + 底部标签栏；桌面版 device.android 为 false，以下状态都不参与渲染。
  const device = useDevice(), phone = device.android && device.device === 'phone';
  const [navOpen, setNavOpen] = useState(false);
  // 手机播放页左右分两页（封面 / 歌词），npPage 记当前是哪一页。
  const npLayoutRef = useRef(null), [npPage, setNpPage] = useState(0);
  useEffect(() => { if (!detail) setNpPage(0); }, [!detail]);
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
  const audioRetry = useRef('');
  const [job, setJob] = useState(null);
  const [sleepUntil, setSleepUntil] = useState(null);
  const [sleepMinutes, setSleepMinutes] = useState(30);
  const [speed, setSpeed] = useState(1);
  const shortcuts = useShortcuts();
  const mutedVolume = useRef(0.7);
  const [matchTrack, setMatchTrack] = useState(null);
  const [matches, setMatches] = useState(null);
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState([]);
  const [cloudPlaylists, setCloudPlaylists] = useState([]);
  const [cloudPlaylistStatus,setCloudPlaylistStatus]=useState(null);
  const [qr, setQr] = useState(null);
  const [qrStatus, setQrStatus] = useState('loading');
  const [qrError,setQrError]=useState('');
  const accountRequest=useRef(null),lastAccountRefresh=useRef(0),spotifyOAuthPending=useRef(false);
  const tableActions=useRef({});
  const stableLocalPlaylist=useCallback(id=>tableActions.current.navigate('playlist',id),[]);
  const stableCloudPlaylist=useCallback((...args)=>tableActions.current.openCloudPlaylist(...args),[]);
  const stablePlay=useCallback((...args)=>tableActions.current.play(...args),[]),stablePlayAll=useCallback(list=>tableActions.current.playAll(list),[]),stableDetail=useCallback((...args)=>tableActions.current.openDetail(...args),[]),stableEntity=useCallback((...args)=>tableActions.current.openEntity(...args),[]);
  const audioRef = useRef(null);
  const effects = useAudioEffects(audioRef);
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
  const officialTrack = useRef(null);
  const detailRequestId = useRef(0);
  const scrollRef = useRef(null);
  const currentRef = useRef(current); currentRef.current = current;
  const spotifyPendingTrack=useRef(null),spotifyPendingSeek=useRef(null),spotifyControlGeneration=useRef(0);
  const spotifyBlocked=useRef(false);
  // 续播 Spotify：播放命令不带进度，等播放器真正换到这首歌后再跳到上次听到的位置。
  const spotifyResumeAt=useRef(null);
  // 暂停、继续时的音量渐变：每次操作递增序号，淡出途中又点了继续，旧的淡出就不会再去暂停。
  const fadeToken=useRef(0);
  // 自动连播时遇到放不了的歌就跳过，连续失败 3 首后停下。
  const playAuto=useRef(false),autoSkips=useRef(0),playFailedSkip=useRef(false);
  // 睡眠定时的「播完这首再停」：sleepFinishTrack 是设置项，sleepAfterTrack 表示已经到点、正等这首播完。
  const [sleepAfterTrack,setSleepAfterTrack]=useState(false),sleepAfterTrackRef=useRef(false);sleepAfterTrackRef.current=sleepAfterTrack;
  const [sleepFinishTrack,setSleepFinishTrack]=useState(()=>localStorage.getItem('musicplatform-sleep-finish-track')!=='0');
  useEffect(()=>{localStorage.setItem('musicplatform-sleep-finish-track',sleepFinishTrack?'1':'0');},[sleepFinishTrack]);
  // spotifyPendingAt：最近一次播放命令发出的时间；spotifyEngaged：发出过 Spotify 播放、切走时需要停掉它。
  const spotifyPendingAt=useRef(0),spotifyEngaged=useRef(false);
  const spotifyClock=useRef({position_ms:0,duration_ms:0,at:0,playing:false});
  const spotifyUpdate=useRef(null),spotifyQueued=useRef(null),spotifyLast=useRef(null),spotifyTransport=useRef('web');
  const queueRef = useRef(queue); queueRef.current = queue;
  const upNextRef = useRef(upNext); upNextRef.current = upNext;
  useEffect(() => { localStorage.setItem('musicplatform-play-mode', playMode); }, [playMode]);
  // A play-next request is used up once that song starts, and dropped when it leaves the queue.
  useEffect(() => { setUpNext(old => { const next = old.filter(id => id !== current?.id && queue.some(t => t.id === id)); return next.length === old.length ? old : next; }); }, [current?.id, queue]);
  useEffect(() => { localStorage.setItem('musicplatform-up-next', JSON.stringify(upNext)); }, [upNext]);
  const modeRef = useRef(playMode); modeRef.current = playMode;
  useListeningHistory(audioRef,current?.id,playRequestId.current,!!settings.private_session);
  const reportSpotifyListening=useSpotifyListeningHistory(!!settings.private_session);
  // 提示可带操作按钮；sticky 的提示（如播放失败）不自动消失，等用户处理或关闭
  const notify = useCallback((message, options) => setToast({ text: String(message || '操作完成'), actions: options?.actions || [], sticky: !!options?.sticky }), []);
  useEffect(() => { if (toast && !toast.sticky) { const timer = setTimeout(() => setToast(null), 5000); return () => clearTimeout(timer); } }, [toast]);
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
    const stop=window.desktop?.onSpotifyState?.(state=>{
      if(state.playback_blocked)stopForSpotifyLicense(state.status);
      if(state.license_error||spotifyBlocked.current)return;
      if(state.observation||state.media_started||state.media_paused||state.native)spotifyUpdate.current?.();
      if(state.device_id)setDeviceId(state.device_id);
      if(state.media_started||(state.ready&&currentRef.current?.source==='spotify'))setRemoteWatch(true);
      if(state.media_paused)spotifyClock.current={...spotifyClock.current,position_ms:spotifyClockPosition(spotifyClock.current,performance.now()),at:performance.now(),playing:false};
      if(state.reason)notify(state.reason);
    });
    return()=>{off?.();stop?.();};
  },[refreshAccounts,notify]);
  const setPrivateListening=useCallback(async value=>{try{const result=await api('/api/settings',{method:'PUT',body:{private_session:value}});setSettings(result);setSettingsDraft(old=>({...old,private_session:value}));}catch(e){notify(e.message);}},[notify]);
  const refreshPlaylists = useCallback(async () => { const data = await api('/api/playlists'); setPlaylists(data.playlists || []); }, []);
  useEffect(() => {
    const initialRequest = requestId.current;
    Promise.allSettled([
      api('/api/home').then(data => { setHome(data); if (requestId.current === initialRequest) { setTracks(data.tracks || []); if (data.errors) setErrors(normalizeErrors(data.errors)); } }),
      refreshPlaylists(), refreshAccounts(),
      api('/api/settings').then(data => { setSettings(data); setSettingsDraft(data); if (themes.includes(data.theme)) appearance.adoptLegacy(data.theme); }),
      api('/api/likes').then(data => setLiked(new Set((data.tracks || []).map(t => t.id))))
    ]).then(results => { if (requestId.current !== initialRequest) return; const failed = results.filter(r => r.status === 'rejected'); if (failed.length) setErrors(failed.map(r => r.reason.message)); setBusy(false); });
    const refresh = () => { refreshAccounts(spotifyOAuthPending.current); spotifyOAuthPending.current=false; }; window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh);
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
    setPage(target); setDetail(null); setNavOpen(false); setErrors([]); setPlaylist(null); setQueueOpen(false); scrollRef.current?.scrollTo(0, 0);
    if (target === 'music' || target === 'history' || target === 'ranking' || target === 'studio') { setBusy(false); return; }
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
  // 旋梯导航：开合都走井口过渡；选中某项时在同一次过渡里收起旋梯并切页
  function openEntity(item) { if(item.kind==='mv'){window.desktop?.platformStop?.().catch(()=>{});if(currentRef.current?.source==='spotify'&&(playing||buffering))spotifyControl('pause');else audioRef.current?.pause();setModal({type:'mv',item});return;}remember({ type: 'entity', item });setDetail(null); setEntity(item); setPage('entity'); setQueueOpen(false); scrollRef.current?.scrollTo(0,0); }
  function trackEntity(track,kind) {
    const originalSource = track.matched_track_id?.split(':')[0] || track.source;
    const sid = kind === 'album' ? track.album_id : track.artist_ids?.[0];
    if (sid && originalSource !== 'local') openEntity({id:originalSource+':'+kind+':'+sid,source:originalSource,source_id:String(sid),kind,title:kind==='album'?track.album:track.artists?.[0]?.name || track.artist,cover:kind==='album'?track.cover:''});
    else {setDetail(null); search(kind==='album'?track.album:track.artist,source,kind);}
  }
  function editQueue(next) {setQueueUndo(queueRef.current);setQueue(next);}
  function moveQueueTo(from,to) {const next=moveItem(queueRef.current,from,to);if(next!==queueRef.current)editQueue(next);}
  function moveQueue(index,direction) {const list=[...queueRef.current],to=index+direction;if(to<0||to>=list.length)return;[list[index],list[to]]=[list[to],list[index]];editQueue(list);}
  const searchableSources = sources.filter(name => name==='all' || name==='local' || accounts.some(account=>account.source===name&&account.logged_in));
  async function search(value = query, provider = source, kind = searchKind) {
    if (!searchableSources.includes(provider)) provider='all';
    remember({ type: 'search', value: String(value || '').trim(), provider, kind });
    if (!value.trim()) { ++requestId.current; setPage('search'); setSearched(''); setTracks([]); setBusy(false); setSearchStatus({}); setSearchStale(false); searchRef.current?.focus(); return; }
    if(provider==='local'&&kind!=='track')kind='track';
    const req = ++requestId.current, text = value.trim();
    // 已经在看歌曲结果时，新结果回来之前先把旧结果淡化留着，免得页面闪成空白
    const keep = page === 'search' && searchKind === 'track' && kind === 'track' && tracks.length > 0;
    setSearchKind(kind); setQuery(value); setSearched(text); setPage('search'); setSource(provider); setBusy(true); setErrors([]); setSearchStale(keep); if (!keep) setTracks([]); scrollRef.current?.scrollTo(0, 0);
    if (kind !== 'track') { setBusy(false); setSearchStatus({}); setSearchStale(false); return; }
    // 「全部平台」拆成每个平台各发一次请求，哪个先回来先显示哪个；链接和歌曲 ID 仍整体交给后端识别
    const direct = /^https?:\/\//i.test(text) || /^[a-z]+:[A-Za-z0-9_-]{1,160}$/.test(text);
    const names = provider === 'all' && !direct ? searchableSources.filter(name => name !== 'all') : [provider];
    const lists = names.map(name => ({ source: name, tracks: [] })), failures = {};
    setSearchStatus(Object.fromEntries(names.map(name => [name, { state: 'loading', count: 0 }])));
    const publish = () => {
      if (req !== requestId.current) return;
      const arrived = lists.filter(list => list.tracks.length);
      if (!arrived.length && lists.some(list => !list.done)) return;
      setTracks(names.length > 1 ? mergeSearchResults(arrived) : arrived.flatMap(list => list.tracks));
      setSearchStale(false);
      setErrors(Object.values(failures));
    };
    await Promise.all(names.map(async (name, i) => {
      let state = 'done';
      try {
        const data = await api('/api/search?q=' + encodeURIComponent(text) + '&source=' + name + '&limit=50', { timeout: 75000 });
        if (req !== requestId.current) return;
        lists[i].tracks = data.tracks || [];
        if (data.login_required) { if (provider === 'all') state = 'skipped'; else { failures[name] = '请先登录这个音乐平台'; state = 'error'; } }
        else if (data.errors?.length) { failures[name] = normalizeErrors(data.errors).join('；'); state = 'error'; }
        if (window.desktop?.platformSearch && data.web_search?.length) {
          publish();
          const results = await Promise.allSettled(data.web_search.map(site => window.desktop.platformSearch(site, text)));
          if (req !== requestId.current) return;
          const seen = new Set(lists[i].tracks.map(track => track.id));
          for (const result of results) if (result.status === 'fulfilled') for (const track of result.value.tracks || []) if (!seen.has(track.id)) { seen.add(track.id); lists[i].tracks.push(track); }
        }
      } catch (e) {
        if (req !== requestId.current) return;
        failures[name] = names.length > 1 ? formatSourceError(name, e.message) : e.message; state = 'error';
      }
      lists[i].done = true;
      setSearchStatus(old => ({ ...old, [name]: { state, count: lists[i].tracks.length } }));
      publish();
    }));
    if (req === requestId.current) { setBusy(false); setSearchStale(false); }
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
  // 歌曲的操作：右键菜单和「…」弹窗共用同一组选项
  function trackMenuItems(track, playlistContext) {
    const isLiked = liked.has(track.id), album = track.source === 'local' && track.album === '本地音乐' ? '' : track.album;
    const alternatives = track.alternatives || [];
    return [
      { label: '播放', icon: Play, onClick: () => play(track) },
      currentRef.current?.id !== track.id && { label: '下一首播放', icon: SkipForward, onClick: () => batchTracks('next', [track]) },
      { label: '加入播放队列', icon: Queue, onClick: () => batchTracks('queue', [track]) },
      { label: '添加到歌单', icon: Plus, onClick: () => setModal({ type: 'add-playlist', track }) },
      { label: isLiked ? '取消喜欢' : '喜欢', icon: isLiked ? HeartBreak : Heart, onClick: () => toggleLike(track) },
      'divider',
      { label: '查看歌词与评论', icon: MicrophoneStage, onClick: () => openDetail(track) },
      track.artist && track.artist !== '未知歌手' && { label: '歌手：' + track.artist, icon: UserCircle, onClick: () => trackEntity(track, 'artist') },
      album && { label: '专辑：' + album, icon: Disc, onClick: () => trackEntity(track, 'album') },
      alternatives.length > 0 && 'divider',
      ...alternatives.map(alt => ({ label: '改用' + (SOURCE_NAMES[alt.source] || alt.source) + '播放', icon: ArrowsClockwise, onClick: () => playAlternative(track, alt) })),
      'divider',
      track.source === 'local' && { label: '匹配封面、歌词与评论', icon: LinkSimple, onClick: () => findMatches(track) },
      playlistContext && { label: playlistContext.remote_source ? '从 Elixir 副本移除' : '从当前歌单移除', icon: Trash, danger: true, onClick: () => batchTracks('playlist_remove', [track], playlistContext) },
      track.source === 'local' && { label: '从音乐库移除', icon: Trash, danger: true, onClick: () => batchTracks('local_remove', [track]) },
      { label: '在原平台打开', icon: ArrowSquareOut, disabled: !track.source_url, onClick: () => external(track.source_url) },
      { label: '复制链接 / ID', icon: Copy, onClick: () => navigator.clipboard.writeText(track.source_url || track.id).then(() => notify('已复制歌曲链接 / ID')) },
    ];
  }
  const menuPlaylistContext = () => page === 'playlist' ? playlist : page === 'entity' && entity?.kind === 'playlist' ? { ...entity, remote_source: entity.source } : null;
  function openMenu(event, items, label) { event.preventDefault?.(); const { x, y } = menuPoint(event); setContextMenu({ x, y, items, label, key: Date.now() }); }
  // 合并行里换一个平台播放：这一行（列表和队列里）改以该平台为主，原来的平台留作备选
  function playAlternative(track, alt) {
    const strip = ({ alternatives, ...rest }) => rest;
    const swapped = { ...strip(alt), alternatives: [strip(track), ...(track.alternatives || []).filter(t => t.id !== alt.id).map(strip)] };
    const replace = list => list.map(t => t.id === track.id ? swapped : t);
    if (queueRef.current.some(t => t.id === track.id)) { const next = replace(queueRef.current); setQueue(next); queueRef.current = next; }
    setTracks(old => old.some(t => t.id === track.id) ? replace(old) : old);
    play(swapped);
  }
  function queueMenu(track, index, event) {
    const list = queueRef.current;
    openMenu(event, [
      { label: currentRef.current?.id === track.id ? '从头播放' : '播放', icon: Play, onClick: () => play(track) },
      currentRef.current?.id !== track.id && { label: '下一首播放', icon: SkipForward, onClick: () => batchTracks('next', [track]) },
      { label: '查看歌词与评论', icon: MicrophoneStage, onClick: () => openDetail(track) },
      { label: '添加到歌单', icon: Plus, onClick: () => setModal({ type: 'add-playlist', track }) },
      'divider',
      { label: '上移', icon: ArrowUp, disabled: index === 0, onClick: () => moveQueue(index, -1) },
      { label: '下移', icon: ArrowDown, disabled: index === list.length - 1, onClick: () => moveQueue(index, 1) },
      { label: '从队列移除', icon: X, danger: true, onClick: () => editQueue(queueRef.current.filter((_, i) => i !== index)) },
    ], track.title);
  }
  function playlistMenu(id, title, event) {
    const load = run => async () => { try { const data = await api('/api/playlists/' + encodeURIComponent(id)); const list = data.tracks || []; if (!list.length) { notify('「' + title + '」还没有歌曲'); return; } run(list); } catch (e) { notify(e.message); } };
    openMenu(event, [
      { label: '打开歌单', icon: Playlist, onClick: () => navigate('playlist', id) },
      { label: '播放', icon: Play, onClick: load(list => playAll(list)) },
      { label: '下一首播放', icon: SkipForward, onClick: load(list => batchTracks('next', list)) },
      { label: '加入播放队列', icon: Queue, onClick: load(list => batchTracks('queue', list)) },
    ], title);
  }
  async function play(track, list, resume=false, auto=false) {
    if(auto&&spotifyBlocked.current)return;
    spotifyBlocked.current=false;
    setSpotifyInterlude(null);playAuto.current=auto;if(!auto)autoSkips.current=0;++fadeToken.current;fadingOut.current=false;
    const resumePosition=resume && currentRef.current?.id===track.id?playbackClock.get():0;
    const req = ++playRequestId.current;
    officialTrack.current=null;
    // 切到别的音源时先停掉 Spotify。不只看当前歌曲：快速切歌时当前歌曲可能还没来得及变成 Spotify。
    if (track.source !== 'spotify' && (spotifyEngaged.current || currentRef.current?.source === 'spotify')) {
      spotifyEngaged.current=false;
      if (window.desktop?.spotifyStop) window.desktop.spotifyStop().catch(()=>{}); else await spotifyControl('pause');
    }
    if (req !== playRequestId.current) return;
    await window.desktop?.platformStop?.();
    if (req !== playRequestId.current) return;
    if (list?.length) {
      // 整批替换队列可以撤销：恢复原队列，正在播的这首插在原来播放位置之后
      const old = queueRef.current, oldUpNext = upNextRef.current, previousId = currentRef.current?.id;
      const replaced = old.length > 0 && (old.length !== list.length || old.some((t, i) => t.id !== list[i].id));
      setQueue(list); setUpNext([]); upNextRef.current = [];
      if (replaced) {
        setQueueUndo(old);
        notify('播放队列已换成当前列表（' + list.length + ' 首）', { actions: [{ label: '撤销', run: () => {
          const playing = currentRef.current, at = old.findIndex(t => t.id === previousId) + 1;
          const restored = !playing || old.some(t => t.id === playing.id) ? old : [...old.slice(0, at), playing, ...old.slice(at)];
          setQueue(restored); queueRef.current = restored; setUpNext(oldUpNext); upNextRef.current = oldUpNext; setQueueUndo(null); notify('已恢复原来的播放队列');
        } }] });
      }
    } else if (!queueRef.current.some(t => t.id === track.id)) setQueue(q => [...q, track]);
    spotifyPendingTrack.current=track.source==='spotify'?track:null;spotifyPendingSeek.current=null;
    spotifyResumeAt.current=track.source==='spotify'&&resumePosition>0?{id:track.id,position_ms:Math.round(resumePosition*1000)}:null;spotifyQueued.current=null;spotifyLast.current=null;
    // Spotify 歌曲也立刻显示成新歌；播放器真正换歌之前，轮询拿到的上一首状态会被忽略。
    if(track.source==='spotify'){++spotifyControlGeneration.current;spotifyEngaged.current=true;spotifyPendingAt.current=performance.now();setPlaying(false);}
    setRemoteWatch(track.source==='spotify');setCurrent(track);setPosition(0);setDuration(track.duration_ms/1000||0);
    spotifyClock.current={position_ms:0,duration_ms:track.duration_ms||0,at:performance.now(),playing:false};setBuffering(true);setPlayHint('');
    const audio = audioRef.current; if(track.source!=='spotify'){await effects.prepare();effects.fade(1);}audio.pause(); audio.removeAttribute('src'); audio.load();
    try {
      if (track.source === 'spotify') {
        if(!window.desktop?.spotifyPlay)throw Error('请使用 Elixir 桌面版的应用内 Spotify 播放器');
        const result=await window.desktop.spotifyPlay(track.source_id);
        if (req !== playRequestId.current) return;
        spotifyPendingAt.current=performance.now();
        spotifyTransport.current=result.transport||'web';if(result.device_id)setDeviceId(result.device_id);
        if(!result.pending)setPlaying(!!result.confirmed&&!!result.state?.is_playing);setRemoteWatch(true);setPlayHint(result.reason||'');if(result.reason)notify(result.reason);
      } else {
        const result = await api(trackPath(track.id) + '/stream?quality=' + encodeURIComponent(settings.quality || 'standard'));
        if (req !== playRequestId.current) return;
        if (result.transport === 'official-web') {
          setPlaying(false);
          const official={id:track.id,reason:result.reason || '在平台窗口点播放'};
          officialTrack.current=official;
          const opened=await openPlatform(track.source,result.source_url,true,track);
          if (req === playRequestId.current && officialTrack.current===official) {
            setPlaying(!!opened?.playing);
            setPlayHint(opened?.playing?'':official.reason);
          }
          return;
        }
        if (!result.url) throw new Error(result.reason || '平台未提供可用音源，可查看歌曲资料或匹配本地文件。');
        audio.src = mediaUrl(result.url); audio.volume = volume; audio.playbackRate = speed;
        setPlayHint(result.trial ? '当前为平台授权试听片段' : result.reason || '');
        if (result.fallback) notify(result.reason);
        if(resumePosition>0)audio.currentTime=resumePosition;
        await audio.play();
      }
      if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: track.album, artwork: track.cover ? [{ src: mediaUrl(track.cover) }] : [] });
    } catch (e) { if (req === playRequestId.current) { officialTrack.current=null;if(track.source==='spotify')spotifyPendingTrack.current=null;setPlaying(false); if (e?.name === 'AbortError') return; const message = e?.name === 'NotSupportedError' ? AUDIO_FAILED : e?.message || '播放失败'; setPlayHint(message); playFailed(track, message); } }
    finally { if (req === playRequestId.current) setBuffering(false); }
  }
  function stopForSpotifyLicense(status) {
    const track=spotifyPendingTrack.current || currentRef.current;
    if(track?.source!=='spotify'||!spotifyEngaged.current||spotifyBlocked.current)return;
    spotifyBlocked.current=true;
    ++playRequestId.current;
    ++spotifyControlGeneration.current;
    spotifyPendingTrack.current=null;
    spotifyPendingSeek.current=null;
    spotifyResumeAt.current=null;
    spotifyQueued.current=null;
    spotifyLast.current=null;
    playAuto.current=false;
    playFailedSkip.current=false;
    const now=performance.now();
    spotifyClock.current={...spotifyClock.current,position_ms:spotifyClockPosition(spotifyClock.current,now),at:now,playing:false};
    setRemoteWatch(false);
    setSpotifyInterlude(null);
    setBuffering(false);
    setPlaying(false);
    const message=status>=500
      ? 'Spotify 暂时无法发放播放许可证（HTTP '+status+'），已停止自动切歌'
      : 'Spotify 未返回可用的播放许可证，已停止自动切歌';
    setPlayHint(message);
    const actions=[{label:'重试',run:()=>play(track,undefined,true)}];
    if(/^[A-Za-z0-9]{22}$/.test(track.source_id || '')){
      actions.push({label:'在 Spotify 网页打开',run:()=>external('https://open.spotify.com/track/'+track.source_id)});
    }
    notify(message,{sticky:true,actions});
  }
  // 播放失败的提示带「重试 / 下一首」，不自动消失
  function playFailed(track, message) {
    // 连播中自动换到的歌放不了：提示一下直接跳过；连续 3 首都失败就停下，免得整个队列一路报错。
    if (playAuto.current && queueRef.current.length > 1 && ++autoSkips.current < 3) {
      playFailedSkip.current = true;
      notify('「' + track.title + '」无法播放，已跳过');
      next(1, true);
      return;
    }
    autoSkips.current = 0;
    const actions = [{ label: '重试', run: () => play(track, null, true) }];
    if (queueRef.current.length > 1) actions.push({ label: '下一首', run: () => next(1) });
    notify(message, { sticky: true, actions });
  }
  useEffect(()=>window.desktop?.onPlatformPlayback?.(state=>{
    const official=officialTrack.current;
    if(!official || state.track_id!==official.id)return;
    if(state.closed)officialTrack.current=null;
    setPlaying(state.playing);
    setPlayHint(state.closed || state.playing?'':official.reason);
  }),[]);
  function next(direction = 1, automatic = false) {
    if(automatic&&spotifyBlocked.current)return;
    if(spotifyInterlude&&!spotifyBlocked.current){notify(spotifyInterlude.ad?'广告结束后可切歌':'插播结束后可切歌');return;}
    // 睡眠定时选了「播完这首再停」：这首自然播完时停下，不再接下一首。跳过失败歌曲不算播完。
    if (automatic && sleepAfterTrackRef.current && !playFailedSkip.current) {
      setSleepAfterTrack(false); setSleepUntil(null);
      if (currentRef.current?.source === 'spotify') spotifyControl('pause'); else audioRef.current?.pause();
      setPlaying(false); notify('这首播完了，睡眠定时已结束'); return;
    }
    playFailedSkip.current = false;
    const items = queueRef.current; if (!items.length) return;
    const pinned = direction > 0 ? pinnedNext(items, upNextRef.current, spotifyPendingTrack.current?.id || currentRef.current?.id) : null;
    if (pinned) { play(pinned, undefined, false, automatic); return; }
    if (modeRef.current === 'single' && automatic) { if (currentRef.current?.source === 'spotify') { play(currentRef.current); return; } const audio = audioRef.current; audio.currentTime = 0; audio.play().catch(e => notify(e.message)); return; }
    const index = items.findIndex(t => t.id === (spotifyPendingTrack.current?.id||currentRef.current?.id));
    if (automatic && modeRef.current === 'once' && index === items.length - 1) { if (currentRef.current?.source === 'spotify') spotifyControl('pause'); setPlaying(false); return; }
    let nextIndex = (index + direction + items.length) % items.length;
    if (modeRef.current === 'shuffle' && items.length > 1) { do { nextIndex = Math.floor(Math.random() * items.length); } while (nextIndex === index); }
    play(items[nextIndex], undefined, false, automatic);
  }
  useEffect(()=>{
    if(!remoteWatch) return;
    let cancelled=false,pending=false,again=false,lastPoll=0;
    const update=async()=>{if(pending){again=true;return;}pending=true;lastPoll=performance.now();try{
      const generation=spotifyControlGeneration.current;
      const state=await (window.desktop?.spotifyState?window.desktop.spotifyState():api('/api/spotify/state'));if(cancelled||generation!==spotifyControlGeneration.current||spotifyBlocked.current)return;
      if(state.owned_license_error)return;
      if(state.owned_device_id&&state.owned_device_id!==deviceId)setDeviceId(state.owned_device_id);
      const snapshot=ownedSpotifySnapshot(state,deviceId),matches=snapshot.owned;
      if(snapshot.media_mismatch){spotifyClock.current.playing=false;setPlaying(false);setBuffering(true);return;}
      // 刚点了新歌、播放器还在报上一首：先不更新界面，最多等 12 秒；广告插播照常显示。
      const pending=spotifyPendingTrack.current,interludeNow=matches&&!snapshot.track&&snapshot.media?.kind==='interlude';
      if(pending&&!interludeNow&&snapshot.track?.id!==pending.id){
        if(performance.now()-spotifyPendingAt.current<12000){setBuffering(true);return;}
        spotifyPendingTrack.current=null;
      }
      setBuffering(!!state.buffering);reportSpotifyListening(snapshot);
       const interlude=matches&&!snapshot.track&&snapshot.media?.kind==='interlude'?snapshot.media:null;setSpotifyInterlude(interlude);
       if(interlude){setDetail(null);setPlayerLyric([]);}
      // Spotify either continued into the song queued below, or Elixir starts its own next song.
      if(matches&&!spotifyPendingTrack.current){const handoff=spotifyHandoff(spotifyLast.current,snapshot,spotifyQueued.current,performance.now());
        if(handoff==='advance'){spotifyLast.current=null;spotifyQueued.current=null;remoteRecorded.current=playRequestId.current;next(1,true);return;}
        if(handoff==='continued')spotifyQueued.current=null;}
      if(matches&&snapshot.track&&snapshot.track.id!==currentRef.current?.id){
        const track={...queueRef.current.find(t=>t.id===snapshot.track.id),...snapshot.track};
        setCurrent(track);
        api(trackPath(track.id)+(track.artist?'':'?refresh=true')).then(detail=>setCurrent(old=>old?.id===track.id?{...old,...detail}:old)).catch(()=>{});
      }
      if(snapshot.track?.id===spotifyPendingTrack.current?.id)spotifyPendingTrack.current=null;
      const resumeAt=spotifyResumeAt.current;
      if(resumeAt&&matches&&!spotifyPendingTrack.current&&snapshot.track?.id===resumeAt.id){spotifyResumeAt.current=null;if(snapshot.position_ms<resumeAt.position_ms-2500)spotifyControl('seek',resumeAt.position_ms);}
      const seek=spotifyPendingSeek.current;
      if(seek&&Date.now()<seek.until&&Math.abs(snapshot.position_ms-seek.position_ms)>2500)snapshot.position_ms=spotifyClockPosition(spotifyClock.current,performance.now());
      else spotifyPendingSeek.current=null;
      spotifyClock.current=reconcileSpotifyClock(spotifyClock.current,snapshot,performance.now(),!!seek);
      const clockPosition=spotifyClockPosition(spotifyClock.current,performance.now());
      if(matches&&snapshot.track)spotifyLast.current={id:snapshot.track.id,position_ms:clockPosition,duration_ms:snapshot.duration_ms,playing:snapshot.playing,at:performance.now()};else if(!matches)spotifyLast.current=null;
      // Near the end, hand Spotify the next Elixir song so it starts without a new play command.
      const upcoming=matches&&snapshot.playing&&snapshot.track&&!spotifyPendingTrack.current&&snapshot.duration_ms-clockPosition<20000?(pinnedNext(queueRef.current,upNextRef.current,snapshot.track.id)||followingTrack(queueRef.current,snapshot.track.id,modeRef.current)):null;
      if(upcoming?.source==='spotify'&&upcoming.id!==snapshot.track.id&&!sleepAfterTrackRef.current&&spotifyQueued.current?.after!==snapshot.track.id&&window.desktop?.spotifyQueue){spotifyQueued.current={after:snapshot.track.id,id:upcoming.id};window.desktop.spotifyQueue(upcoming.source_id).catch(()=>{spotifyQueued.current=null;});}
      setPlaying(snapshot.playing);setPosition(spotifyClockPosition(spotifyClock.current,performance.now())/1000);
      if(matches&&snapshot.duration_ms)setDuration(snapshot.duration_ms/1000);
      setPlayHint((matches||state.owned_device_id)?state.reason||'':'');
      if(matches && state.track_finished && state.track_id){remoteRecorded.current=playRequestId.current;next(1,true);return;}
      
    }catch(e){if(!cancelled){setPlayHint(e.message);spotifyClock.current.playing=false;}}finally{pending=false;if(again&&!cancelled){again=false;update();}}};
    // State reports pushed from the web player trigger updates; the timer is only a fallback.
    update();spotifyUpdate.current=update;const timer=setInterval(()=>{if(performance.now()-lastPoll>=(spotifyTransport.current==='native'?900:2950))update();},1000);return()=>{cancelled=true;clearInterval(timer);if(spotifyUpdate.current===update)spotifyUpdate.current=null;};
  },[remoteWatch,current?.id,deviceId]);
  useEffect(()=>{window.desktop?.spotifyState?.().then(state=>{if(ownedSpotifySnapshot(state).playing){spotifyEngaged.current=true;setRemoteWatch(true);}}).catch(()=>{});if(currentRef.current?.source==='spotify'){setRemoteWatch(true);const track=currentRef.current;if(!track.artist)api(trackPath(track.id)+'?refresh=true').then(data=>setCurrent(old=>old?.id===track.id?{...old,...data}:old)).catch(()=>{});}let frame,last=0;const tick=now=>{if(now-last>=200){last=now;if(spotifyClock.current.playing)setPosition(spotifyClockPosition(spotifyClock.current,now)/1000);}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[]);
  async function spotifyControl(action, value) { if(spotifyBlocked.current){if(action==='resume'&&currentRef.current?.source==='spotify')await play(currentRef.current,undefined,true);return false;} try {if(!window.desktop?.spotifyControl)throw Error('Spotify 应用内播放器尚未启动');if(action==='seek'){++spotifyControlGeneration.current;spotifyPendingSeek.current={position_ms:Math.max(0,value),until:Date.now()+5000};spotifyClock.current={...spotifyClock.current,position_ms:Math.max(0,value),at:performance.now()};setPosition(Math.max(0,value)/1000);}const data=await window.desktop.spotifyControl(action,value);setRemoteWatch(true);if(data.state){setPlaying(!!data.state.is_playing);setPosition(Number(data.state.position_ms || 0)/1000);}if(data.reason)notify(data.reason);return data.confirmed===true; } catch (e) { notify(e.message); return false; } }
  async function togglePlayback() {
    const track=currentRef.current;
    if(track?.source==='spotify'){
      if(spotifyBlocked.current||(!remoteWatch||!deviceId)&&!playing){await play(track,undefined,true);return;}
      await spotifyControl(playing?'pause':'resume');return;
    }
    if(track?.id && officialTrack.current?.id===track.id){
      const result=await window.desktop?.platformControl?.(track.id,!playing).catch(()=>null);
      if(!result?.accepted && officialTrack.current?.id===track.id)notify('请在平台窗口控制播放');
      return;
    }
    const audio=audioRef.current;
    if(!audio?.src){if(track)play(track,undefined,true);else if(queueRef.current.length)play(queueRef.current[0]);return;}
    if(audio.paused||fadingOut.current)resumeAudio();else pauseAudio();
  }
  // 本地和直链音频暂停前先淡出、继续时淡入，不会“咔”一下断掉。淡出途中又点继续，就从当前音量淡回来。
  const fadingOut=useRef(false);
  function resumeAudio(){
    const audio=audioRef.current;if(!audio)return;
    const token=++fadeToken.current;
    if(fadingOut.current&&!audio.paused){fadingOut.current=false;setPlaying(true);effects.fade(1,.2);return;}
    fadingOut.current=false;effects.fade(0);
    audio.play().then(()=>{if(token===fadeToken.current)effects.fade(1,.25);}).catch(e=>{effects.fade(1);notify(e.message);});
  }
  async function pauseAudio(seconds=.2){
    const audio=audioRef.current;if(!audio||audio.paused)return;
    const token=++fadeToken.current;fadingOut.current=true;setPlaying(false);
    await effects.fade(0,seconds);
    if(token!==fadeToken.current)return;
    fadingOut.current=false;audio.pause();effects.fade(1);
  }
  useEffect(() => {
    const keydown = e => { if (e.target.closest('.shortcut-key')) return; const inField = e.target.closest('input,textarea,select,[contenteditable="true"]'); if (e.code === 'Escape') { if (inField || palette) return; setModalInput(''); setModal(null); setDetail(null); setQueueOpen(false); setEditing(false); return; } const combo = comboFromEvent(e); if (!combo) return; if (combo === 'Ctrl+Z' && editing && !e.target.closest('input,textarea')) { e.preventDefault(); appearance.undo(); return; } if (combo === 'Space' && e.target.closest('button,a,[role=button]')) return; const action = shortcuts.localActionFor(combo); if (!action) return; if (inField && !ANYWHERE.has(action)) return; if (action === 'search' && e.defaultPrevented) return; e.preventDefault(); runAction(action); };
    document.addEventListener('keydown', keydown); return () => document.removeEventListener('keydown', keydown);
  });
  useEffect(() => { if (!('mediaSession' in navigator)) return; navigator.mediaSession.setActionHandler('play', () => { if (currentRef.current?.source === 'spotify') spotifyControl('resume'); else resumeAudio(); }); navigator.mediaSession.setActionHandler('pause', () => { if(currentRef.current?.source==='spotify')spotifyControl('pause');else pauseAudio(); }); navigator.mediaSession.setActionHandler('nexttrack', () => next(1)); navigator.mediaSession.setActionHandler('previoustrack', () => next(-1)); navigator.mediaSession.setActionHandler('seekto', e => { if (!Number.isFinite(e.seekTime)) return; if(currentRef.current?.source==='spotify')spotifyControl('seek',Math.round(e.seekTime*1000));else if(audioRef.current)audioRef.current.currentTime=e.seekTime; }); });
  // 真正播起来了，自动跳过的连续失败计数清零。
  useEffect(() => { if (playing && !spotifyInterlude) autoSkips.current = 0; }, [playing, spotifyInterlude]);
  // 窗口标题显示「歌名 - 歌手」，Alt+Tab 和任务栏悬停时能看出在放哪首。
  useEffect(() => { document.title = current ? current.title + (current.artist ? ' - ' + current.artist : '') + ' · Elixir' : 'Elixir'; }, [current?.title, current?.artist]);
  // 任务栏：缩略图上的上一首 / 播放 / 下一首按钮，图标上显示播放进度，每秒最多更新一次。
  useEffect(() => {
    if (!window.desktop?.updateTaskbar) return;
    let last = -1;
    const send = () => { const total = duration || (current?.duration_ms || 0) / 1000, progress = current && total > 0 ? Math.min(1, playbackClock.get() / total) : -1; window.desktop.updateTaskbar({ hasTrack: !!current, playing: !!playing, progress }).catch(() => {}); };
    send();
    return playbackClock.subscribe(() => { const second = Math.floor(playbackClock.get()); if (second !== last) { last = second; send(); } });
  }, [current?.id, playing, duration]);
  useEffect(() => { if (!sleepUntil) return; const timer = setTimeout(async () => { const track = currentRef.current; if (sleepFinishTrack && playing) { setSleepUntil(null); setSleepAfterTrack(true); notify('定时已到，这首播完就停'); return; } if (track?.source === 'spotify') { if (await spotifyControl('pause')) setPlaying(false); } else if (track?.id && officialTrack.current?.id === track.id) { const result = await window.desktop?.platformControl?.(track.id, false).catch(() => null); if (!result?.accepted) { await window.desktop?.platformStop?.(); officialTrack.current = null; } setPlaying(false); } else await pauseAudio(3); setSleepUntil(null); notify('睡眠定时已结束'); }, Math.max(0, sleepUntil - Date.now())); return () => clearTimeout(timer); }, [sleepUntil, sleepFinishTrack, playing]);
  useEffect(()=>{
    let cancelled=false;setPlayerLyric([]);if(current)api(trackPath(current.id)+'/lyrics').then(data=>{if(!cancelled)setPlayerLyric(lyricTimeline(data));}).catch(()=>{});return()=>{cancelled=true;};
  },[current?.id]);
  useEffect(()=>window.desktop?.onLyricsClosed?.(()=>setDesktopLyrics(false)),[]);
  useEffect(()=>window.desktop?.onPlayerAction?.(runAction));
  // 应用内快捷键、全局快捷键和托盘菜单都走这里
  function runAction(action) {
    switch (action) {
      case 'toggle': togglePlayback(); break;
      case 'next': next(1); break;
      case 'previous': next(-1); break;
      case 'seekBack': seekBy(-5); break;
      case 'seekForward': seekBy(5); break;
      case 'volumeUp': applyVolume(volume + 0.05); break;
      case 'volumeDown': applyVolume(volume - 0.05); break;
      case 'mute': if (volume > 0) { mutedVolume.current = volume; applyVolume(0); } else applyVolume(mutedVolume.current || 0.7); break;
      case 'like': if (current) toggleLike(current); break;
      case 'queue': setQueueOpen(open => !open); break;
      case 'detail': if (current) openDetail(current); break;
      case 'palette': setPalette(open => !open); break;
      case 'search': if (parts.topbar === 'hidden') setPalette(true); else searchRef.current?.focus(); break;
      case 'back': goHistory(-1); break;
      case 'forward': goHistory(1); break;
      case 'lyrics': toggleDesktopLyrics(); break;
    }
  }
  function applyVolume(value) { value = Math.min(1, Math.max(0, Math.round(value * 100) / 100)); setVolume(value); if (current?.source === 'spotify') spotifyControl('volume', Math.round(value * 100)); }
  function seekBy(delta) { if (!current) return; const value = Math.max(0, playbackClock.get() + delta); if (current.source === 'spotify') spotifyControl('seek', Math.round(value * 1000)); else if (audioRef.current) audioRef.current.currentTime = value; setPosition(value); }
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
  async function login(source) { if (source === 'netease' || source==='bodian') { await loadQr(source); return; } if(source==='spotify'){setModalInput('');setModal({type:'spotify-cookie'});return;} await loginOfficial(source); }
  async function loginOfficial(source) { if (!window.desktop) { notify('请从桌面应用打开官方登录窗口'); return; } try { await window.desktop.login(source); setModal({ type: 'login', source }); } catch (e) { notify(e.message); } }
  async function loginSpotifyCookie() { if(!window.desktop?.cookieLogin){notify('请使用桌面应用导入 Cookie');return;} const cookie=modalInput.trim(); setModalInput('');setModalBusy(true); try{await window.desktop.cookieLogin('spotify',cookie);setModal({type:'login',source:'spotify'});}catch(e){notify(e.message);}finally{setModalBusy(false);} }
  async function loadQr(source='netease') {
    setModal({type:'platform-qr',source});setQr(null);setQrError('');setQrStatus('loading');
    try { const data=await api('/api/accounts/'+source+'/qr');setQr({...data,source});setQrStatus('waiting'); }
    catch(error){setQrStatus('error');notify(error.message);}
  }
  useEffect(()=>{
    if(modal?.type!=='platform-qr'||!qr?.key||qr.source!==modal.source)return;
    const source=qr.source;
    let cancelled=false,timer,failures=0,attempts=0;
    const poll=async()=>{
      if(cancelled)return;attempts++;
      try{
        const result=await api('/api/accounts/'+source+'/check?key='+encodeURIComponent(qr.key));
        if(cancelled)return;failures=0;setQrError(result.reason || '');setQrStatus(result.status);
        if(result.status==='expired')return;
        if(result.status==='authorized' && result.profile?.logged_in){setAccounts(old=>[...old.filter(a=>a.source!==source),{...result.profile,source}]);setModal(null);notify(SOURCE_NAMES[source]+'账号已连接');return;}
      }catch(e){
        if(cancelled)return;failures++;setQrError(e.message);
        if(failures>=5){setQrStatus('error');return;}setQrStatus('retrying');
      }
      if(attempts>=60){setQrStatus('timeout');return;}
      timer=setTimeout(poll,3000*Math.min(4,2**failures));
    };
    timer=setTimeout(poll,3000);
    return()=>{cancelled=true;clearTimeout(timer);if(source==='bodian')api('/api/accounts/bodian/qr?key='+encodeURIComponent(qr.key),{method:'DELETE'}).catch(()=>{});};
  },[modal?.type,modal?.source,qr?.key]);
  async function loadCloudPlaylists(source) {
    setModal({type:'cloud-playlists',source});setCloudPlaylists([]);setCloudPlaylistStatus(null);setModalBusy(true);
    try{const data=await api('/api/accounts/'+source+'/playlists');setCloudPlaylists(data.playlists || []);setCloudPlaylistStatus(data.status || {state:'available',empty:!data.playlists?.length});}
    catch(e){setCloudPlaylistStatus({state:'error',reason:e.message,empty:false});}
    finally{setModalBusy(false);}
  }
  async function openCloudPlaylist(item, source) { remember({ type: 'cloud', item: { id: item.id, title: item.title, name: item.name }, source }); const req = ++requestId.current; setModal(null); setPage('playlist'); setBusy(true); setErrors([]); setPlaylist(null); try { const data = await api('/api/remote-playlists/' + source + '/' + encodeURIComponent(item.id), { timeout: 90000 }); if (req !== requestId.current) return; setTracks(data.tracks || []); setPlaylist({ ...data, remote_source: source, title: data.title || item.title || item.name }); } catch (e) { if (req === requestId.current) { setTracks([]); setErrors([e.message]); } } finally { if (req === requestId.current) setBusy(false); } }
  async function finishLogin(source) { setModalBusy(true); try { await window.desktop.finishLogin(source); await refreshAccounts(true); setModal(null); notify('已刷新账号状态'); } catch (e) { notify(e.message); } finally { setModalBusy(false); } }
  async function logout(source) { try { await api('/api/accounts/' + source, { method: 'DELETE' }); await window.desktop?.clearLogin(source); await refreshAccounts(true); notify('已退出该平台账号'); } catch (e) { notify(e.message); } }
  function changeTheme(id) { const base = SKINS.find(s => s.id === id)?.base; appearance.setSkin(id); if (base && base !== settings.theme) api('/api/settings', { method: 'PUT', body: { theme: base } }).then(data => setSettings(data)).catch(() => {}); }
  async function changeQuality(quality) { try { const data = await api('/api/settings', { method: 'PUT', body: { quality } }); setSettings(data); setSettingsDraft(old => ({ ...old, quality: data.quality })); notify('优先音质已切换为' + ({ standard: '标准', higher: '较高', exhigh: '极高', lossless: '无损' }[data.quality] || '标准') + '，下一首生效'); } catch (e) { notify(e.message); } }
  // 设置页即改即存；代理地址在离开输入框时提交，没改就不发请求。
  async function saveProxy() { const proxy = (settingsDraft.proxy || '').trim(); if (proxy === (settings.proxy || '')) return; try { const data = await api('/api/settings', { method: 'PUT', body: { proxy } }); setSettings(data); setSettingsDraft(data); notify(proxy ? '代理已保存' : '已停用代理'); } catch (e) { notify(e.message); setSettingsDraft(d => ({ ...d, proxy: settings.proxy || '' })); } }
  async function loadDevices() { try { const data = await api('/api/spotify/devices'); setDevices(data.devices || []); setModal({ type: 'devices' }); } catch (e) { notify(e.message); } }
  function external(url) { if (!url) return; if (window.desktop) window.desktop.openExternal(url).catch(e => notify(e.message)); else window.open(url, '_blank', 'noopener,noreferrer'); }
  const activeAccount = accounts.find(a => a.source === theme && a.logged_in) || (['aurora','ink','apple'].includes(theme) ? accounts.find(a => a.logged_in) : undefined);
  const greeting = new Date().getHours() < 12 ? '早上好' : new Date().getHours() < 18 ? '下午好' : '晚上好';
  useEffect(() => { if (theme !== 'qqmusic') return; let alive = true; const load = () => api('/api/history').then(d => alive && setHistoryCount(d.tracks?.length || 0)).catch(() => {}); load(); window.addEventListener('elixir-library-changed', load); return () => { alive = false; window.removeEventListener('elixir-library-changed', load); }; }, [theme, current?.id]);
  const labels = useMemo(() => skinLabels(resolved.skin), [resolved.skin]);
  // 播放整个列表：随机模式从随机一首开始，其余模式从第一首开始。
  const playAll=list=>{if(!list?.length)return;play(list[modeRef.current==='shuffle'?Math.floor(Math.random()*list.length):0],list);};
  tableActions.current={search,openCloudPlaylist,batch:batchTracks,navigate,play,playAll,openDetail,openEntity,trackEntity,toggleLike,more:track=>setModal({type:'track',track,playlistContext:menuPlaylistContext()}),contextMenu:(track,event)=>openMenu(event,trackMenuItems(track,menuPlaylistContext()),track.title),playlistMenu};
  const visualMode = visualizerStyle(resolved);
  const showVisualizer = !!detail && visualMode !== 'off' && current?.id === detail.id && !spotifyInterlude;
  // 副歌位置：由当前歌曲的时间轴歌词推算，进度条上标出。
  const chorus = useMemo(() => detectChorus(playerLyric, duration), [playerLyric, duration]);
  const detailSpinning = !!detail && current?.id === detail.id && playing && !buffering;
  const visualizerProps = { mode: visualMode, getAnalyser: effects.analyser, simulated: current?.source === 'spotify', playing: playing && !buffering };
  // Which parts are on screen. A legacy skin keeps its original now-playing page until the listener swaps it.
  const npStyle = nowPlayingStyle(resolved), tuning = resolved.tuning;
  // 环形音浪：封面统一做成圆形唱片（参考网易云），音浪贴着圆一圈；黑胶本来就是圆的，卡带、CD、iPod 不加环。
  const ringLayout = visualMode === 'ring' && !['ipod', 'cassette', 'cd'].includes(npStyle), ringDisc = ringLayout && npStyle !== 'vinyl';
  const partAttr = value => value && value !== 'native' ? value : undefined;
  const frameData = {
    'data-frame': resolved.frame ? '' : undefined, 'data-side': parts.side,
    'data-sidebar': partAttr(parts.sidebar), 'data-topbar': partAttr(parts.topbar), 'data-player': partAttr(parts.player), 'data-progress': partAttr(parts.progress),
    'data-np': look.components.np === 'native' && resolved.skin.legacy ? undefined : partAttr(parts.np),
    'data-bg': partAttr(parts.background), 'data-chrome': resolved.skin.chrome, 'data-lyrics': partAttr(parts.lyrics), 'data-panel': parts.panel === 'on' ? 'on' : undefined, 'data-lyric-bar': parts.lyricBar === 'on' ? 'on' : undefined,
    'data-radius': partAttr(tuning.radius), 'data-font': partAttr(tuning.font), 'data-density': partAttr(tuning.density),
    'data-motion': tuning.motion === 'reduced' ? 'reduced' : undefined, 'data-playing': playing && !buffering ? '' : undefined, 'data-contrast': tuning.contrast === 'high' ? 'high' : undefined, 'data-edit': editing ? '' : undefined,
  };
  // 手机屏幕放不下桌面版式的部件：侧栏、顶栏、播放栏和右侧面板换成手机版式，皮肤的配色、字体和播放页照旧。
  if (phone) Object.assign(frameData, { 'data-side': 'left', 'data-sidebar': undefined, 'data-topbar': undefined, 'data-player': undefined, 'data-panel': undefined, 'data-lyric-bar': undefined });
  const navIcons = { home: House, search: MagnifyingGlass, music: Disc, likes: Heart, history: ClockCounterClockwise, ranking: MusicNotes, library: FolderSimple, studio: PaintBrush };
  const navTitles = { home: labels.home, search: '搜索', music: labels.music || '我的音乐', likes: labels.likes, history: labels.history, ranking: labels.ranking || '听歌排行', library: labels.library, studio: '个性化工坊' };
  const navCounts = { likes: liked.size || undefined, history: theme === 'qqmusic' && historyCount ? historyCount : undefined };
  // Development only: lets the screenshot script open pages and the now-playing view.
  if (import.meta.env.DEV) { window.__elixirAppearance = appearance; window.__elixirNavigate = navigate; window.__elixirOpenDetail = () => { const t = currentRef.current || home.tracks?.[0] || tracks[0]; if (t) openDetail(t); }; window.__elixirEdit = setEditing; }
  const navKeys = look.nav.order.filter(key => !look.nav.hidden.includes(key));
  const topNavRef = useNavFit([navKeys.join(), page, theme, JSON.stringify(frameData), navTitles.home]);
  const topbarRef = useIslandClear([navKeys.join(), page, theme, JSON.stringify(frameData), navTitles.home, activeAccount?.nickname]);
  const playDetail = () => detail && (current?.id === detail.id ? togglePlayback() : play(detail));
  const npStage = npStyle === 'vinyl' ? <div className="vinyl-deck"><div className={'large-cover vinyl-cover' + (detailSpinning ? ' spinning' : '')}><Cover src={detail?.cover} title={detail?.title} /></div><i className={'tonearm' + (detailSpinning ? ' engaged' : '')} aria-hidden="true" /></div>
    : npStyle === 'cassette' ? <Cassette track={detail} duration={current?.id === detail?.id ? duration : (detail?.duration_ms || 0) / 1000} spinning={detailSpinning} />
    : npStyle === 'cd' ? <CdPlayer track={detail} playing={detailSpinning} duration={current?.id === detail?.id ? duration : (detail?.duration_ms || 0) / 1000} index={Math.max(0, queue.findIndex(t => t.id === detail?.id))} onToggle={playDetail} onSkip={next} />
    : npStyle === 'ipod' ? <IpodPlayer track={detail} playing={detailSpinning} duration={current?.id === detail?.id ? duration : (detail?.duration_ms || 0) / 1000} volume={volume} onToggle={playDetail} onSkip={next} onMenu={() => setDetail(null)} onVolume={value => { setVolume(value); if (current?.source === 'spotify') spotifyControl('volume', Math.round(value * 100)); }} />
    : <div className="large-cover"><Cover src={detail?.cover} title={detail?.title} /></div>;
  const commands = useMemo(() => {
    const list = [];
    const pages = [['home', labels.home, House], ['search', '搜索', MagnifyingGlass], ['music', labels.music || '我的音乐', Disc], ['likes', labels.likes, Heart], ['history', labels.history, ClockCounterClockwise], ['ranking', labels.ranking || '听歌排行', MusicNotes], ['library', labels.library, FolderSimple], ['studio', '个性化工坊', PaintBrush], ['settings', '设置', GearSix], ['accounts', '账号与会员', UserCircle]];
    pages.forEach(([key, title, icon]) => list.push({ id: 'page:' + key, group: '前往', title, icon, keywords: key + ' 页面 打开', featured: ['studio', 'likes', 'history', 'settings'].includes(key), run: () => navigate(key) }));
    list.push(
      { id: 'play:toggle', group: '播放', title: playing ? '暂停' : '播放', hint: '空格', icon: playing ? Pause : Play, keywords: 'play pause 暂停 播放', featured: true, run: togglePlayback },
      { id: 'play:next', group: '播放', title: '下一首', hint: 'Ctrl →', icon: SkipForward, keywords: 'next', featured: true, run: () => next(1) },
      { id: 'play:prev', group: '播放', title: '上一首', hint: 'Ctrl ←', icon: SkipBack, keywords: 'previous', run: () => next(-1) },
      { id: 'play:mode', group: '播放', title: '切换播放模式', hint: { list: '当前：列表循环', single: '当前：单曲循环', shuffle: '当前：随机播放', once: '当前：顺序播放' }[playMode], icon: Repeat, keywords: '循环 随机 shuffle repeat', run: () => setPlayMode(m => ({ list: 'single', single: 'shuffle', shuffle: 'once', once: 'list' }[m])) },
      { id: 'play:lyrics', group: '播放', title: '打开歌词与播放页', icon: MicrophoneStage, keywords: 'lyrics 歌词', run: () => current && openDetail(current) },
      { id: 'play:like', group: '播放', title: current && liked.has(current.id) ? '取消喜欢当前歌曲' : '喜欢当前歌曲', icon: Heart, keywords: 'like 收藏 红心', run: () => current && toggleLike(current) },
      { id: 'play:queue', group: '播放', title: '播放队列', icon: Queue, keywords: 'queue 队列', run: () => setQueueOpen(true) },
      { id: 'play:desktop', group: '播放', title: desktopLyrics ? '关闭桌面歌词' : '打开桌面歌词', icon: MonitorPlay, keywords: 'desktop lyrics 桌面歌词', run: toggleDesktopLyrics },
      { id: 'play:sleep', group: '播放', title: '睡眠定时', icon: Timer, keywords: 'sleep timer 定时', run: () => setModal({ type: 'sleep' }) },
      { id: 'look:edit', group: '外观', title: '进入布局编辑（在界面上拆装组件）', icon: PuzzlePiece, keywords: 'edit layout 拆装 编辑 组件', featured: true, run: () => setEditing(true) },
      { id: 'look:lucky', group: '外观', title: '手气不错：随机搭一套外观', icon: ShuffleIcon, keywords: 'random 随机', featured: true, run: () => { appearance.applyLook({ ...look, skin: SKINS[Math.floor(Math.random() * SKINS.length)].id, components: { ...look.components, ...randomParts() } }); notify('随机搭了一套，不喜欢可以撤销'); } },
      { id: 'look:undo', group: '外观', title: '撤销上一次外观修改', icon: ArrowCounterClockwise, keywords: 'undo 撤销', run: appearance.undo },
      { id: 'look:save', group: '外观', title: '把当前外观存为方案', icon: FloppyDisk, keywords: 'save 保存 方案', run: () => { appearance.saveStyle(''); notify('已存为方案，可在个性化工坊里改名'); } },
      { id: 'look:cover', group: '外观', title: look.tuning.accent === 'cover' ? '强调色改回跟随皮肤' : '强调色跟随封面', icon: Palette, keywords: 'accent color 颜色 取色', run: () => appearance.setTuning('accent', look.tuning.accent === 'cover' ? 'skin' : 'cover') },
    );
    SKINS.forEach(skin => list.push({ id: 'skin:' + skin.id, group: '皮肤', title: skin.name, hint: skin.group + ' · ' + skin.hint, icon: PaintBrush, keywords: '皮肤 主题 theme skin ' + skin.id + ' ' + skin.note, current: skin.id === resolved.skin.id, run: () => appearance.setSkin(skin.id) }));
    LAYOUT_PRESETS.forEach(preset => list.push({ id: 'preset:' + preset.id, group: '布局预设', title: preset.name, hint: preset.text, icon: PuzzlePiece, keywords: '布局 layout preset', run: () => appearance.applyLook({ ...look, components: { ...look.components, ...preset.parts } }) }));
    SLOTS.forEach(slot => slot.variants.forEach(([id, name, from]) => list.push({ id: 'part:' + slot.key + ':' + id, group: '组件 · ' + slot.title, title: slot.title + '：' + name, hint: from, icon: PuzzlePiece, keywords: '组件 ' + slot.key + ' ' + id, current: look.components[slot.key] === id, run: () => appearance.setPart(slot.key, id) })));
    appearance.profile.saved.forEach(style => list.push({ id: 'style:' + style.id, group: '我的方案', title: style.name, icon: FloppyDisk, keywords: '方案 style', run: () => appearance.applyStyle(style.id) }));
    return list;
  }, [labels, playing, playMode, current, liked, desktopLyrics, look, resolved.skin.id, appearance.profile.saved]);

  // 安卓返回键：外壳调用 window.__elixirBack()（elixirBack 为别名），返回 true 表示页面已处理（关掉了浮层或后退了一页），false 时由外壳退到后台。
  useEffect(() => {
    if (!device.android) return;
    const back = () => {
      if (palette) { setPalette(false); return true; }
      if (modal) { if (!modalBusy) { setModalInput(''); setModal(null); } return true; }
      if (navOpen) { setNavOpen(false); return true; }
      if (queueOpen) { setQueueOpen(false); return true; }
      if (detail) { setDetail(null); return true; }
      if (editing) { setEditing(false); return true; }
      if (historyPos.back) { goHistory(-1); return true; }
      return false;
    };
    window.__elixirBack = window.elixirBack = back;
    return () => { delete window.__elixirBack; delete window.elixirBack; };
  });
  // index.html 按上次皮肤先给 html 上了底色，界面挂载后交还给皮肤样式
  useEffect(() => { document.documentElement.style.removeProperty('background'); }, []);
  return <div className={'app theme-' + theme + (detail ? ' detail-open' : '')} {...frameData} style={{ '--now-cover': current?.cover ? `url("${mediaUrl(current.cover).replace(/["\\]/g, '\\$&')}")` : 'none', '--user-bg': look.backgroundImage ? `url("${look.backgroundImage}")` : 'none' }}>
    {frameData['data-bg'] && <div className="app-backdrop" aria-hidden="true">{parts.background === 'mosaic' && <CoverMosaic tracks={queue.length ? queue : current ? [current] : []} currentId={current?.id} />}</div>}
    <div className="drag-strip" aria-hidden="true" />
    <audio ref={audioRef} onTimeUpdate={e => setPosition(e.currentTarget.currentTime)} onLoadedMetadata={e => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => next(1, true)} onWaiting={() => setBuffering(true)} onCanPlay={() => setBuffering(false)} onPlaying={() => { audioRetry.current = ''; }} onError={() => { const track = currentRef.current; if (!audioRef.current?.src || !track || track.source === 'spotify') return; if (audioRetry.current !== track.id) { audioRetry.current = track.id; play(track, null, true, playAuto.current); return; } setBuffering(false); setPlaying(false); setPlayHint(AUDIO_FAILED); playFailed(track, AUDIO_FAILED); }} />
    {phone && navOpen && <div className="mobile-scrim" aria-hidden="true" onClick={() => setNavOpen(false)} />}
    <aside className={'sidebar' + (phone && navOpen ? ' nav-open' : '')}>
      <button type="button" className="brand platform-brand" aria-label="Elixir 首页" onClick={()=>navigate('home')}><img src="/elixir-mark.svg" alt=""/><span>Elixir</span></button>
      <nav>{navKeys.map(key => <NavigationItem key={key} activePage={page} activePlaylistId={playlist?.id} actions={tableActions} target={key} icon={navIcons[key]} title={navTitles[key]} count={navCounts[key]} />)}</nav>
      <div className="library-heading playlist-heading"><span>{labels.playlists || '创建的歌单'}</span><IconButton icon={Plus} title="新建歌单" onClick={() => { setModalInput(''); setModal({ type: 'create-playlist' }); }} /></div>
      <div className="playlist-navigation">{playlists.length ? playlists.map(item => <NavigationItem activePage={page} activePlaylistId={playlist?.id} actions={tableActions} key={item.id} target="playlist" id={item.id} icon={Playlist} cover={item.cover} title={item.title || item.name} />) : <button className="create-first" onClick={() => { setModalInput(''); setModal({ type: 'create-playlist' }); }}>创建一张自己的歌单 <Plus size={13} /></button>}</div>
      {parts.clock === 'on' && <SidebarClock currentId={current?.id} />}
      <div className="sidebar-footer">{settings.private_session&&<button className="appearance-button private-mode-indicator" onClick={()=>navigate('history')}>私密收听已开启</button>}<ThemeMenu skin={resolved.skin} onChange={changeTheme} onStudio={() => navigate('studio')} onEdit={() => setEditing(true)} /><div className="sidebar-bottom"><button onClick={() => navigate('settings')}><GearSix size={19} /> 设置</button><button title="账号与会员" onClick={() => navigate('accounts')}><UserCircle size={20} /></button><span>{appVersion && 'v' + appVersion}</span></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar" ref={topbarRef}>{phone && <IconButton icon={MenuIcon} className="mobile-menu" title="菜单" onClick={() => setNavOpen(true)} />}<nav className="top-nav" aria-label="导航" ref={topNavRef}><button className="top-nav-brand" onClick={() => navigate('home')}><span className="top-nav-mark" aria-hidden="true" />Elixir</button>{navKeys.map(key => { const Icon = navIcons[key]; return <button key={key} title={navTitles[key]} className={'top-nav-item' + (page === key ? ' selected' : '')} aria-current={page === key ? 'page' : undefined} onClick={() => navigate(key)}><Icon size={17} weight={page === key ? 'fill' : 'regular'} />{navTitles[key]}</button>; })}</nav><div className="topbar-navigation">{theme === 'spotify' && <IconButton icon={House} title="返回首页" onClick={() => navigate('home')} />}<IconButton icon={CaretLeft} className="nav-back" title="后退 · Alt ←" disabled={!historyPos.back} onClick={() => goHistory(-1)} /><IconButton icon={CaretRight} className="nav-forward" title="前进 · Alt →" disabled={!historyPos.forward} onClick={() => goHistory(1)} /></div><SearchSuggest inputRef={searchRef} value={query} onChange={setQuery} onSearch={value => search(value)} onPlay={track => play(track)} placeholder={theme === 'spotify' ? '想听什么？' : '搜索歌曲、歌手，或粘贴歌曲链接'} kbd={comboParts(shortcuts.local.search).join(' ')} /><div className="topbar-account"><button onClick={() => navigate('accounts')}><UserCircle size={26} weight="light" /><span>{activeAccount?.nickname || '登录'}</span></button></div><WindowControls /></header>
      <main className="main-scroll" ref={scrollRef}>
        {page === 'studio' && <Studio appearance={appearance} notify={notify} onEdit={() => setEditing(true)} />}
        {page === 'home' && <Home theme={homeLayout(resolved)} modules={look.homeModules} actions={tableActions} current={current} currentId={current?.id} playing={playing} liked={liked} labels={labels} accounts={accounts} onToggle={togglePlayback} onImport={()=>importFolder()} external={external} />}
        {page === 'music' && <MusicLibrary liked={liked} currentId={current?.id} playing={playing} actions={tableActions} onRemotePlaylist={stableCloudPlaylist} onOpen={stableEntity} onPlaylist={stableLocalPlaylist} onTracks={navigate} onImport={()=>navigate('library')} onRefresh={refreshPlaylists} notify={notify} />}
        {page === 'entity' && entity && <>{historyPos.back&&<button className="button quiet" onClick={()=>goHistory(-1)}><CaretLeft size={17}/>返回</button>}<EntityDetail liked={liked} currentId={current?.id} playing={playing} batchActions={tableActions} item={entity} onOpen={stableEntity} onTrack={stableDetail} onPlay={stablePlay} onPlayAll={stablePlayAll} notify={notify} external={external} /></>}
        {page==='ranking'&&<ListeningRankings currentId={current?.id} playing={playing} liked={liked} actions={tableActions}/>}
        {page==='history'&&<ListeningHistory currentId={current?.id} playing={playing} liked={liked} actions={tableActions} privateSession={settings.private_session} notify={notify} onPrivacy={setPrivateListening}/>}
        {['search', 'library', 'likes', 'playlist'].includes(page) && <>{page === 'search' ? !searched && <div className="page-heading"><div><h1>搜索音乐</h1></div></div> : <TrackListHero page={page} title={page === 'playlist' ? playlist?.title || '歌单' : labels[page]} playlist={playlist} tracks={tracks} busy={busy} onImport={() => importFolder()} tools={{ onChange: data => { setPlaylist(data); setTracks(data.tracks || []); }, onExit: () => navigate('music'), onRefresh: refreshPlaylists, notify }} />}{page === 'search' && <><div className="search-filters"><MusicSearchTypes value={searchKind} local={source==='local'} onChange={kind=>{setSearchKind(kind);if(searched)search(searched,source,kind);}}/><div className="source-segment" role="group" aria-label="搜索平台">{searchableSources.map(provider => <button key={provider} aria-pressed={source === provider} onClick={() => { setSource(provider); if (searched) search(searched, provider); }}>{SOURCE_NAMES[provider]}{searched && searchKind === 'track' && <SearchBadge status={provider === source && provider !== 'all' ? searchStatus[provider] : source === 'all' ? (provider === 'all' ? (busy ? { state: 'loading' } : { state: 'done', count: tracks.length }) : searchStatus[provider]) : undefined} />}</button>)}</div><PlatformSearchLink source={source} query={searched} connected={searchableSources.includes(source)} notify={notify} /></div>{!searched && <SearchHistory onSearch={search}/>}</>}{page === 'library' && <LocalFolders onScan={importFolder} jobStatus={job?.status} notify={notify}/>}{page === 'library' && job && <div className="job-note"><CircleNotch className={['running','pending'].includes(job.status) ? 'spin' : ''} size={18} /><span>{['completed','done'].includes(job.status) ? importSummary(job) : '正在导入 · ' + (job.done || 0) + (job.total ? '/' + job.total : '')}</span>{job.errors?.length > 0 && <span title={job.errors.map(e => e.file + '：' + e.message).join('\n')}>{job.errors.length} 个文件未导入：{job.errors.slice(0, 3).map(e => e.file).join('、')}{job.errors.length > 3 ? ' 等' : ''}</span>}<IconButton icon={X} title="关闭提示" onClick={() => setJob(null)} /></div>}{errors.map((error, i) => <ErrorNote key={i}>{error}</ErrorNote>)}{page === 'search' && searchKind !== 'track' ? <EntitySearch query={searched} kind={searchKind} source={source} onOpen={openEntity}/> : busy && page === 'search' && !tracks.length ? <Skeleton count={7} className="skeleton-rows" label="正在搜索" /> : busy && page !== 'search' ? <Loading text="正在加载音乐…" /> : tracks.length ? <div className={'track-results' + (page === 'search' && searchStale ? ' stale' : '')} aria-busy={page === 'search' && busy}>{page === 'search' && busy && <Loading compact className="search-waiting" text={searchStale ? '正在搜索…' : '还在等待 ' + Object.entries(searchStatus).filter(([, s]) => s.state === 'loading').map(([name]) => SOURCE_NAMES[name] || name).join('、') + '…'} />}<PlaybackTrackTable stickyHeader={page === 'search'} controls filterable={page !== 'search'} viewKey={page+(page==='search'?':'+source:page==='playlist'?':'+playlist?.id:'')} key={page+':'+(playlist?.id||'')} playlistId={page==='playlist'&&!playlist?.remote_source?playlist?.id:undefined} playlistContext={page==='playlist'?playlist:undefined} items={tracks} currentId={current?.id} playing={playing} liked={liked} actions={tableActions} /></div> : <Empty icon={page === 'library' ? FolderSimple : page === 'likes' ? Heart : MagnifyingGlass} title={page === 'search' ? searched ? '没有找到匹配的歌曲' : '从一首喜欢的歌开始' : page === 'library' ? '把你的音乐带进来' : '这里还没有歌曲'} text={page === 'search' ? '' : page === 'library' ? 'MP3、FLAC、M4A、WAV' : ''} action={page === 'library' ? <button className="button primary" onClick={() => importFolder()}><Plus size={18} />选择音乐文件夹</button> : undefined} />}</>}
        {page === 'accounts' && <div className="accounts-page"><PageHero compact kind="accounts" icon={UserCircle} title="账号与会员" meta={'已连接 ' + connectedCount(accounts) + ' / 3 · 会员与播放权限以平台为准'} actions={<button className="button quiet" onClick={()=>refreshAccounts(true)}><ArrowsClockwise size={18} />刷新状态</button>} />
          <AccountCenter accounts={accounts} onLogin={login} onLogout={logout} onCloud={loadCloudPlaylists} />
          <details className="account-help"><summary>登录与会员说明</summary><div><p>账号信息只保存在本机。会员与播放权限由各平台提供。</p></div></details></div>}
        {page === 'settings' && <div className="settings-page"><PageHero compact kind="settings" icon={GearSix} title="设置" meta={'Elixir' + (appVersion ? ' v' + appVersion : '') + ' · 界面、播放、音效与连接'} /><div className="section-page"><SectionNav sections={settingSections} /><div className="section-body"><section className="settings-section" id="settings-theme"><h2>外观</h2><div className="settings-look"><SkinPreview skin={resolved.skin} /><div><strong>{resolved.skin.name}</strong><p>{resolved.skin.note}</p><div className="settings-look-actions"><button className="button quiet" onClick={() => navigate('studio')}><PaintBrush size={17} />打开个性化工坊</button><button className="button quiet" onClick={() => setEditing(true)}><PuzzlePiece size={17} />在界面上拆装组件</button><button className="button quiet" onClick={() => setPalette(true)}>命令面板 <kbd>Ctrl K</kbd></button></div></div></div></section><section className="settings-section" id="settings-playback"><h2>播放</h2><div className="setting-row"><div><strong>优先音质</strong><p>可用音质取决于账号与平台授权。</p></div><SelectMenu aria-label="播放音质" value={settings.quality || 'standard'} onChange={e => changeQuality(e.target.value)}><option value="standard">标准音质</option><option value="higher">较高音质</option><option value="exhigh">极高音质</option><option value="lossless">无损音质</option></SelectMenu></div><div className="setting-row"><div><strong>播放速度</strong></div><SelectMenu aria-label="播放速度" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[0.75, 1, 1.25, 1.5, 2].map(rate => <option value={rate} key={rate}>{rate}×</option>)}</SelectMenu></div><div className="setting-row"><div><strong>睡眠定时</strong><p>{sleepAfterTrack ? '这首播完后暂停' : sleepUntil ? '将在 ' + new Date(sleepUntil).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) + (sleepFinishTrack ? ' 后播完当前歌曲再暂停' : ' 暂停') : ''}</p></div><button className="button quiet" onClick={() => setModal({ type: 'sleep' })}><Timer size={18} />{sleepUntil || sleepAfterTrack ? '修改定时' : '设置定时'}</button></div></section><div id="settings-effects" className="section-anchor"><AudioEffects effects={effects} remote={current?.source==='spotify'}/></div><section className="settings-section" id="settings-desktop"><h2>桌面与快捷键</h2><div className="setting-row"><div><strong>桌面歌词</strong></div><button className="button quiet" onClick={toggleDesktopLyrics}>{desktopLyrics?'关闭桌面歌词':'打开桌面歌词'}</button></div><ShortcutSettings shortcuts={shortcuts}/></section><section className="settings-section" id="settings-connection"><h2>连接</h2><label className="field-label">网络代理<input placeholder="http://127.0.0.1:7890" value={settingsDraft.proxy || ''} onChange={e => setSettingsDraft(d => ({ ...d, proxy: e.target.value }))} onBlur={saveProxy} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label></section><section className="settings-section about-section" id="settings-about"><img className="app-about-icon" src="/elixir-icon.png" alt=""/><div><h2>Elixir <small>{appVersion}</small></h2><p>独立音乐客户端</p></div><button className="button quiet" onClick={()=>window.desktop?.window('quit')}>退出 Elixir</button></section></div></div></div>}
      </main>
    </div>
    <PlayerBar current={current} interlude={spotifyInterlude} playHint={playHint} liked={liked} playing={playing} buffering={buffering} playMode={playMode} queueLength={queue.length} queueOpen={queueOpen} duration={duration} volume={volume} quality={settings.quality} onOpenDetail={openDetail} onToggleLike={toggleLike} onPlayMode={setPlayMode} onSkip={next} onToggle={togglePlayback} onSeek={value=>{if(current?.source!=='spotify')audioRef.current.currentTime=value;setPosition(value);}} onSeekEnd={value=>{if(current?.source==='spotify')spotifyControl('seek',Math.round(value*1000));}} onQualityChange={changeQuality} desktopLyrics={desktopLyrics} onDesktopLyrics={window.desktop?.openLyrics ? toggleDesktopLyrics : undefined} onVolume={setVolume} onVolumeEnd={value=>{if(current?.source==='spotify')spotifyControl('volume',Math.round(value*100));}} onQueue={()=>setQueueOpen(!queueOpen)} lyric={parts.lyricBar === 'on' ? playerLyric : null} marks={parts.progress === 'lyric' ? playerLyric : null} chorus={chorus} />
    {parts.panel === 'on' && !phone && <NowPanel current={current} queue={queue} upNext={upNext} liked={liked} lyric={playerLyric} onOpenDetail={openDetail} onToggleLike={toggleLike} onPlay={play} onQueue={() => setQueueOpen(!queueOpen)} />}
    {phone && <nav className="mobile-tabs" aria-label="主导航">{[['home', labels.home, House], ['search', '搜索', MagnifyingGlass], ['music', labels.music || '我的音乐', Disc], ['likes', labels.likes, Heart]].map(([key, title, Icon]) => <button key={key} aria-current={page === key && !detail ? 'page' : undefined} onClick={() => { navigate(key); if (key === 'search') setTimeout(() => searchRef.current?.focus(), 50); }}><Icon size={23} weight={page === key && !detail ? 'fill' : 'regular'} /><span>{title}</span></button>)}<button aria-expanded={navOpen} onClick={() => { setDetail(null); setNavOpen(true); }}><DotsThree size={23} weight="bold" /><span>更多</span></button></nav>}
    <DesktopLyricSync current={current} lyric={playerLyric} interlude={spotifyInterlude} playing={playing} buffering={buffering} speed={speed} duration={duration} lyricOffset={lyricOffset} />
    {phone && queueOpen && <div className="mobile-scrim queue-scrim" aria-hidden="true" onClick={() => setQueueOpen(false)} />}
    {queueOpen && <aside className="queue-panel"><div className="queue-heading"><div><h2>播放队列</h2><p>{queue.length} 首歌曲{queue.length > 1 ? '，可拖动调整顺序' : ''}</p></div><button className="text-button" disabled={!queueUndo} onClick={()=>{setQueue(queueUndo);setQueueUndo(null);}}>撤销修改</button><IconButton icon={Trash} title="清空队列" onClick={() => editQueue([])} /><IconButton icon={X} title="关闭队列" onClick={() => setQueueOpen(false)} /></div><div className="queue-items">{queue.length ? queue.map((track, index) => <div className={'queue-item' + (dragOver === index ? ' drop-target' : '')} aria-current={current?.id === track.id ? 'true' : undefined} key={track.id + ':' + index} onContextMenu={e => queueMenu(track, index, e)} draggable onDragStart={e => { dragFrom.current = index; e.dataTransfer.effectAllowed = 'move'; }} onDragOver={e => { if (dragFrom.current === null) return; e.preventDefault(); setDragOver(index); }} onDragLeave={() => setDragOver(old => old === index ? null : old)} onDrop={e => { e.preventDefault(); moveQueueTo(dragFrom.current, index); dragFrom.current = null; setDragOver(null); }} onDragEnd={() => { dragFrom.current = null; setDragOver(null); }}><button onClick={() => play(track)}><Cover src={track.cover} /><span><strong>{track.title}{upNext.includes(track.id) && current?.id !== track.id && <em className="queue-next-tag">{upNext[0] === track.id ? '下一首' : '稍后'}</em>}</strong><small>{track.artist}</small></span></button>{current?.id !== track.id && <IconButton icon={SkipForward} className="queue-play-next" title={'下一首播放 ' + track.title} onClick={() => batchTracks('next', [track])} />}<button className="icon-button queue-move" aria-label={'队列上移 '+track.title} disabled={index===0} onClick={()=>moveQueue(index,-1)}>↑</button><button className="icon-button queue-move" aria-label={'队列下移 '+track.title} disabled={index===queue.length-1} onClick={()=>moveQueue(index,1)}>↓</button><IconButton icon={X} title="从队列移除" onClick={() => editQueue(queue.filter((_, i) => i !== index))} /></div>) : <Empty icon={Queue} title="队列是空的" text="" />}</div></aside>}
    {detail && <section className={'detail-view np-' + npStyle + (npStyle === 'immersive' && frameData['data-np'] ? ' np-fullscreen' : '')} style={{ '--detail-cover': detail.cover ? `url("${mediaUrl(detail.cover).replace(/["\\]/g, '\\$&')}")` : 'none' }}><div className="detail-backdrop" aria-hidden="true" /><div className="detail-toolbar"><button className="button quiet detail-close" onClick={() => setDetail(null)}><CaretDown size={19} />收起</button>{phone && npStyle !== 'karaoke' && <Tabs className="np-pager" label="播放页" value={npPage} onChange={i => npLayoutRef.current?.scrollTo({ left: i * npLayoutRef.current.clientWidth, behavior: 'smooth' })} items={['歌曲', '歌词'].map((title, i) => [i, title])} />}<div><SourceTag source={detail.source} /><button className="text-button" onClick={() => external(detail.source_url)} disabled={!detail.source_url}>在原平台打开<ArrowSquareOut size={15} /></button></div></div><div className="detail-layout" ref={npLayoutRef} onScroll={phone ? e => { const el = e.currentTarget; setNpPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); } : undefined}><aside className="detail-art">{npStyle === 'poster' && <PosterMark track={detail} playing={detailSpinning} />}<div className={'detail-cover-stage' + (ringLayout ? ' has-ring' : '') + (ringDisc ? ' ring-disc' + (detailSpinning ? ' spinning' : '') : '')}>{npStage}{showVisualizer && ringLayout && <Visualizer key={theme} {...visualizerProps} className="visualizer-ring" shape="circle" />}</div>{showVisualizer && visualMode !== 'ring' && <Visualizer key={theme + visualMode} {...visualizerProps} className="visualizer-strip" />}{showVisualizer && visualizerProps.simulated && <p>Spotify 音频受版权保护，此处为模拟音浪</p>}<h1>{detail.title}</h1><ListeningBadge id={detail.id}/><button className="artist-name" onClick={() => trackEntity(detail,'artist')}>{detail.artist}</button><button className="text-button" onClick={()=>trackEntity(detail,'album')} disabled={!detail.album}>{detail.album}</button><div className="detail-actions"><button className="button primary" onClick={playDetail}>{current?.id === detail.id && playing ? <><Pause size={18} weight="fill" />暂停</> : <><Play size={18} weight="fill" />{current?.id === detail.id ? '继续播放' : '播放'}</>}</button><IconButton icon={Heart} title="喜欢" active={liked.has(detail.id)} onClick={() => toggleLike(detail)} /><IconButton icon={Plus} title="添加到歌单" onClick={() => setModal({ type: 'add-playlist', track: detail })} /></div></aside><div className="detail-content"><Tabs className="detail-tabs" label="歌曲详情" value={detailTab} onChange={setDetailTab} items={[['lyrics', '歌词'], ['comments', '评论', comments?.trackId === detail.id && comments.total ? <small>{comments.total.toLocaleString()}</small> : null], ['info', '歌曲资料']]} />{detailTab === 'lyrics' && <div className="lyrics-scroll">{lyricLines.length > 0 && <div className={'lyric-offset' + (lyricTune ? ' open' : '')}>{lyricTranslations.length > 0 && <button className="lyric-translate" aria-pressed={showTranslation} title={showTranslation ? '隐藏翻译' : '显示翻译'} onClick={() => setShowTranslation(value => !value)}>译</button>}<button className="lyric-tune-toggle" aria-expanded={lyricTune} title="歌词和声音对不上时，在这里提前或延后歌词" onClick={() => setLyricTune(open => !open)}><Timer size={14} />{lyricOffset ? '校时 ' + (lyricOffset > 0 ? '+' : '') + lyricOffset.toFixed(1) + '秒' : '校时'}</button>{lyricTune && <>{[-0.5,0,0.5].map(delta=><button key={delta} disabled={delta===0&&!lyricOffset} onClick={()=>{const next=delta===0?0:Math.round((lyricOffset+delta)*10)/10;setLyricOffset(next);localStorage.setItem('lyric-offset:'+detail.id,String(next));}}>{delta===0?'重置':delta>0?'延后 0.5 秒':'提前 0.5 秒'}</button>)}</>}</div>}{detailErrors[detail.id + ':lyrics'] ? <Empty icon={MicrophoneStage} title="暂时无法获取歌词" text={detailErrors[detail.id + ':lyrics']} /> : lyrics?.trackId !== detail.id ? <Loading text="正在获取歌词…" /> : lyricLines.length ? <LyricLines lines={lyricLines} active={current?.id===detail.id} playing={playing} onSeek={line=>{if(current?.id===detail.id){if(current.source==='spotify')spotifyControl('seek',Math.round(line.time*1000));else if(audioRef.current.src){audioRef.current.currentTime=line.time;setPosition(line.time);}}}}>{(lyrics.attribution || lyrics.source || lyrics.reason) && <div className="lyric-attribution">{lyrics.attribution || (lyrics.source === 'lrclib' ? 'LRCLIB 社区歌词库' : SOURCE_NAMES[lyrics.source]) || ''}{lyrics.reason && <span>{lyrics.reason}</span>}</div>}{lyrics.warning && <ErrorNote>{lyrics.warning}</ErrorNote>}</LyricLines> : lyrics.original ? <div>{lyrics.source&&<div className="lyric-attribution">{lyrics.attribution || [SOURCE_NAMES[lyrics.source] || lyrics.source,lyrics.provider_display_name || lyrics.provider].filter(Boolean).join(' · ')}</div>}<pre className="plain-lyrics">{lyrics.original}</pre></div> : <Empty icon={MicrophoneStage} title="暂无歌词" text={lyrics.reason || '平台没有返回该歌曲的歌词，可稍后重试。'} />}{lyrics?.trackId === detail.id && lyrics.translated && !lyricTranslations.length && <details className="translated-lyrics"><summary>查看翻译歌词</summary><pre>{lyrics.translated}</pre></details>}</div>}{detailTab === 'comments' && <div className="comments-scroll">{detailErrors[detail.id + ':comments'] ? <Empty icon={ListBullets} title="暂时无法获取评论" text={detailErrors[detail.id + ':comments']} /> : comments?.trackId !== detail.id ? <Loading text="正在读取平台评论…" /> : comments.items?.length ? <>{comments.warning && <ErrorNote>{comments.warning}</ErrorNote>}<p className="comments-description">来自 {SOURCE_NAMES[comments.source || detail.source]} 的评论 · {comments.total?.toLocaleString() || comments.items.length} 条</p>{comments.items.map((comment, index) => <article className="comment" key={comment.id || index}><div className="comment-avatar">{comment.avatar ? <img src={comment.avatar} alt="" /> : <UserCircle size={31} />}</div><div className="comment-body"><header><strong>{comment.user || '音乐听众'}</strong><span>{comment.likes || 0} 赞</span></header><p>{comment.text}</p><time>{formatCommentTime(comment.time)}</time></div></article>)}{comments.has_more && <button className="button quiet more-comments" disabled={modalBusy} onClick={moreComments}>{modalBusy ? '加载中…' : '加载更多评论'}</button>}</> : <Empty icon={ListBullets} title="平台暂无返回评论" text={comments.reason || '评论是否保留取决于原平台，歌曲下架不一定意味着资料已删除。'} />}</div>}{detailTab === 'info' && <TrackInformation track={detail} onEntity={trackEntity} onMatch={findMatches} onUnlink={async(track)=>{try{await api('/api/library/'+encodeURIComponent(track.id)+'/link',{method:'DELETE'});openDetail(await api(trackPath(track.id)), 'info');notify('已取消资料关联，原音频与标签保持原样');}catch(e){notify(e.message);}}}/>}</div></div></section>}
    {modal && <Modal key={modal.type} title={modalTitle(modal)} wide={modal.type === 'match' || modal.type === 'mv'} onClose={() => { if (!modalBusy) {setModalInput('');setModal(null);} }}>
      {modal.type === 'track' && <><div className="modal-track"><Cover src={modal.track.cover} /><div><strong>{modal.track.title}</strong><p>{modal.track.artist}</p></div></div><div className="action-menu">{trackMenuItems(modal.track, modal.playlistContext).filter(item => item && item !== 'divider').map(item => <button key={item.label} className={item.danger ? 'danger' : undefined} disabled={item.disabled} onClick={() => { setModal(null); item.onClick(); }}><item.icon size={19} />{item.label}</button>)}</div></>}
      {modal.type === 'create-playlist' && <form onSubmit={e => { e.preventDefault(); createPlaylist(); }}><label className="field-label">歌单名称<input autoFocus value={modalInput} maxLength={80} onChange={e => setModalInput(e.target.value)} placeholder="给这段音乐一个名字" /></label><div className="modal-footer"><button type="button" className="button quiet" onClick={() => setModal(null)}>取消</button><button className="button primary" disabled={!modalInput.trim() || modalBusy}>创建歌单</button></div></form>}
      {modal.type === 'mv' && <MvPlayer key={modal.item.id} item={modal.item} external={external} />}
      {modal.type === 'add-playlist' && <div className="playlist-picker">{playlists.length ? playlists.map(item => <button key={item.id} onClick={() => addToPlaylist(item)}><Playlist size={24} /><span>{item.title || item.name}</span><Plus size={18} /></button>) : <Empty icon={Playlist} title="还没有歌单" text="先创建歌单" />}</div>}
      {modal.type === 'import' && <form onSubmit={e => { e.preventDefault(); importFolder(modalInput); }}><label className="field-label">音乐文件夹路径<input autoFocus value={modalInput} onChange={e => setModalInput(e.target.value)} placeholder="例如 D:\Music" /></label><p className="field-help">选择音乐文件夹</p><div className="modal-footer"><button className="button primary" disabled={!modalInput.trim()}>开始导入</button></div></form>}
      {modal.type === 'match' && <><p className="modal-description">为「{matchTrack?.title}」选择匹配版本。</p>{modalBusy ? <Loading text="正在跨平台比对歌曲信息…" /> : matches?.length ? <div className="match-list">{matches.map((entry, index) => { const track = entry.track || entry; return <button key={track.id || index} onClick={() => linkTrack(track)}><Cover src={track.cover} /><span><strong>{track.title}</strong><small>{track.artist} · {track.album} · {formatDuration(track.duration_ms)}</small><SourceTag source={track.source} /></span>{entry.score !== undefined && <b>{Math.round(entry.score <= 1 ? entry.score * 100 : entry.score)}%</b>}<LinkSimple size={20} /></button>; })}</div> : <Empty icon={LinkSimple} title="没有找到可靠候选" text="没有找到匹配版本" />}</>}
      {modal.type === 'login' && <><div className="login-instructions"><UserCircle size={58} weight="light" /><h3>在官方页面完成登录</h3><p>在 {SOURCE_NAMES[modal.source]} 窗口登录后刷新账号。</p><p>播放权限以平台为准。</p></div><div className="modal-footer"><button className="button quiet" onClick={() => loginOfficial(modal.source)}>重新打开页面</button><button className="button primary" disabled={modalBusy} onClick={() => finishLogin(modal.source)}>{modalBusy ? '同步中…' : '已登录，刷新账号'}</button></div></>}
      {modal.type === 'spotify-cookie' && <><form onSubmit={e=>{e.preventDefault();loginSpotifyCookie();}}><p className="modal-description">粘贴 Spotify 的 sp_dc Cookie，或打开官方登录。</p><label className="field-label">Spotify Cookie<textarea autoFocus autoComplete="off" spellCheck="false" value={modalInput} onChange={e=>setModalInput(e.target.value)} placeholder="sp_dc=你的登录 Cookie" rows={4} /></label><p className="field-help">Cookie 仅保存在本机。</p><div className="modal-footer"><button type="button" className="button quiet" onClick={()=>{setModalInput('');loginOfficial('spotify');}}>官方网页登录</button><button className="button primary" disabled={modalBusy||!modalInput.trim()}>{modalBusy?'正在打开…':'导入并打开 Spotify'}</button></div></form></>}
      {modal.type === 'platform-qr' && <><div className="login-instructions"><h3>使用{SOURCE_NAMES[modal.source]} App 扫码</h3><div className="qr-code">{qr?.qr_png ? <img src={qr.qr_png.startsWith('data:') ? qr.qr_png : 'data:image/png;base64,' + qr.qr_png} alt={SOURCE_NAMES[modal.source]+'登录二维码'} /> : <CircleNotch className="spin" size={34} />}{['expired','error','timeout'].includes(qrStatus) && <button className="qr-overlay" onClick={()=>loadQr(modal.source)}><ArrowsClockwise size={25} />刷新二维码</button>}</div><p>{{loading:'正在生成二维码…',waiting:'打开手机 App，扫一扫并确认登录',scanned:'扫码成功，请在手机上确认',expired:'二维码已过期',authorized:'登录成功',verifying:'已收到扫码确认，正在核实账号资料…',retrying:'连接暂时中断，正在自动重试，请勿重复扫码',timeout:'等待时间较长，请刷新二维码后重试',error:'连接失败，请刷新二维码'}[qrStatus]}</p>{qrError&&<ErrorNote className="qr-error-reason">{qrError}</ErrorNote>}</div><div className="modal-footer">{modal.source==='netease' && <button className="button quiet" onClick={() => loginOfficial('netease')}>改用官方网页登录</button>}<button className="button primary" onClick={()=>loadQr(modal.source)}><ArrowsClockwise size={17} />刷新</button></div></>}
      {modal.type === 'cloud-playlists' && <>{modalBusy ? <Loading text="正在读取云端歌单…" /> : <>{cloudPlaylistStatus?.state==='error'?<ErrorNote title="云端歌单读取失败" retry={()=>loadCloudPlaylists(modal.source)} retryText="重新读取">{cloudPlaylistStatus.reason}</ErrorNote>:<><Note>已读取 {cloudPlaylists.length} 个歌单{cloudPlaylistStatus?.partial?' · 当前为部分结果':''}</Note>{cloudPlaylistStatus?.warnings?.map((w,i)=><ErrorNote key={i}>{w}</ErrorNote>)}<div className="playlist-picker">{cloudPlaylists.length?cloudPlaylists.map(item=><button key={item.id} onClick={()=>openCloudPlaylist(item,modal.source)}><Cover src={item.cover}/><span>{item.title || item.name}<small>{Number.isFinite(item.count)?item.count+' 首歌曲':'曲目数待返回'}{item.collection_kind==='created'?' · 自建':item.collection_kind==='saved'?' · 收藏':''}</small></span><CaretRight size={17}/></button>):<Empty icon={Playlist} title={cloudPlaylistStatus?.empty?'账号当前没有云端歌单':'平台未返回可确认的歌单目录'} text={cloudPlaylistStatus?.empty?'平台已成功返回空列表。':'这不代表你的账号没有歌单，请重试读取。'}/>}</div><button className="button quiet" onClick={()=>loadCloudPlaylists(modal.source)}><ArrowsClockwise size={16}/>刷新歌单</button></>}</>}</>}
      {modal.type === 'sleep' && <><p className="modal-description">定时结束后自动暂停音乐。</p><div className="sleep-options">{[15, 30, 45, 60, 90].map(minutes => <button key={minutes} aria-pressed={sleepMinutes === minutes} onClick={() => setSleepMinutes(minutes)}>{minutes} 分钟</button>)}</div><label className="sleep-finish-track"><input type="checkbox" checked={sleepFinishTrack} onChange={e => setSleepFinishTrack(e.target.checked)} />到点后把正在放的这首播完再停</label><div className="modal-footer">{(sleepUntil || sleepAfterTrack) && <button className="button quiet" onClick={() => { setSleepUntil(null); setSleepAfterTrack(false); setModal(null); notify('睡眠定时已取消'); }}>取消定时</button>}<button className="button quiet" onClick={() => { setSleepUntil(null); setSleepAfterTrack(true); setModal(null); notify('这首播完就停'); }}>播完这首就停</button><button className="button primary" onClick={() => { setSleepAfterTrack(false); setSleepUntil(Date.now() + sleepMinutes * 60000); setModal(null); notify(sleepMinutes + ' 分钟后暂停'); }}><Moon size={18} />开始定时</button></div></>}
      {modal.type === 'devices' && <><div className="device-tools"><button className="button quiet" onClick={()=>external('https://open.spotify.com')}>打开网页播放器<ArrowSquareOut size={16}/></button></div><div className="playlist-picker">{devices.length ? devices.map(device => <button key={device.id} onClick={() => { setDeviceId(device.id); setModal(null); notify('已选择 ' + device.name); }}><MonitorPlay size={25} /><span>{device.name}<small>{device.type}{device.is_active ? ' · 当前活动设备' : ''}</small></span>{deviceId === device.id && <Check size={18} />}</button>) : <Empty icon={MonitorPlay} title="未发现可用设备" text="没有在线设备" />}</div><button className="button quiet" onClick={loadDevices}><ArrowsClockwise size={17} />刷新设备</button></>}
    </Modal>}
    {editing && <LayoutEditor look={look} resolved={resolved} appearance={appearance} notify={notify} onDone={closeEditor} />}
    {palette && <CommandPalette commands={commands} onSearch={value => search(value)} onClose={() => setPalette(false)} />}
    {contextMenu && <ContextMenu key={contextMenu.key} x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} label={contextMenu.label} onClose={() => setContextMenu(null)} />}
    {toast && <div className="toast" role={toast.sticky ? 'alert' : 'status'}><Info size={18} /><span>{toast.text}</span>{toast.actions.map(action => <button key={action.label} className="toast-action" onClick={() => { setToast(null); action.run(); }}>{action.label}</button>)}<button aria-label="关闭提示" onClick={() => setToast(null)}><X size={14} /></button></div>}
  </div>;
}
function modalTitle(modal) { if(modal.type==='mv')return modal.item.title; return { track: '歌曲操作', 'create-playlist': '新建歌单', 'add-playlist': '添加到歌单', import: '导入本地音乐', match: '匹配平台资料', login: '连接 ' + SOURCE_NAMES[modal.source], sleep: '睡眠定时', devices: 'Spotify 播放设备', 'spotify-cookie': '连接 Spotify', 'platform-qr': '扫码连接' + SOURCE_NAMES[modal.source], 'cloud-playlists': SOURCE_NAMES[modal.source] + ' · 云端歌单' }[modal.type] || ''; }
function formatCommentTime(value) { if (!value) return ''; let date = new Date(typeof value === 'number' && value < 100000000000 ? value * 1000 : value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
createRoot(document.getElementById('root')).render(new URLSearchParams(location.search).has('desktopLyrics') ? <DesktopLyrics/> : <App />);
