import React,{useEffect,useRef,useState} from 'react';
import {ArrowSquareOut,ArrowsClockwise,CaretLeft,CaretRight,ClockCounterClockwise,FolderSimple,Heart,LockSimple,MagnifyingGlass,MusicNotes,Pause,Play,Queue,UserCircle} from '@phosphor-icons/react';
import {api,mediaUrl,formatDuration,SOURCE_NAMES} from './api';
import {MusicArt} from './MusicWorkspace';
import './home.css';
import './home-netease.css';
import './home-qqmusic.css';
import './home-spotify.css';
import './home-aurora.css';
import './home-ink.css';
import './home-apple.css';

const DAY=86400;
const LAYOUTS=['netease','qqmusic','spotify','aurora','ink','apple'];
// Platform picks are cached for the session so returning to the home page does not refetch them.
const pickCache=new Map();

function weekStart(){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-(d.getDay()+6)%7);return d.getTime()/1000;}
function greeting(hour){return hour<5?'夜深了':hour<11?'早上好':hour<13?'中午好':hour<18?'下午好':'晚上好';}
function listened(ms){const minutes=Math.round(ms/60000);if(minutes<60)return minutes+' 分钟';const hours=Math.floor(minutes/60),rest=minutes%60;return hours+' 小时'+(rest?' '+rest+' 分钟':'');}
function weekSummary(stats){if(!stats)return '';if(!stats.plays)return '本周还没有听歌记录';return stats.listened_ms>=60000?`本周听了 ${listened(stats.listened_ms)}，播放 ${stats.plays} 次`:`本周播放 ${stats.plays} 次`;}
const cssUrl=src=>src?`url("${mediaUrl(src).replace(/["\\]/g,'\\$&')}")`:'none';
const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const scrollBehavior=()=>reducedMotion()?'auto':'smooth';

function NowBars(){return <span className="home-now-bars" aria-hidden="true"><i/><i/><i/></span>;}
function PlayLabel({now,playing}){return now&&playing?<><Pause size={17} weight="fill"/>暂停</>:<><Play size={17} weight="fill"/>{now?'继续播放':'播放'}</>;}

function CoverCard({cover,icon:Icon,title,detail,badge,round,playable,now,playing,label,onClick}){
  return <button className={'home-card'+(round?' round':'')+(now?' now':'')+(Icon?' icon':'')} onClick={onClick} aria-label={label||title}>
    <span className="home-card-art">{Icon?<span className="music-art home-card-icon"><Icon size={40} weight="fill"/></span>:<MusicArt src={cover} title={title} round={round}/>}
      {badge&&<span className="home-card-badge">{badge}</span>}
      {now&&playing&&<NowBars/>}
      {playable&&<span className="home-card-play" aria-hidden="true">{now&&playing?<Pause size={18} weight="fill"/>:<Play size={18} weight="fill"/>}</span>}
    </span>
    <strong>{title||'未命名'}</strong>{detail&&<small>{detail}</small>}
  </button>;
}

// A shelf scrolls sideways; with `grid` it wraps into rows instead.
function Shelf({id,title,action,grid,className,children}){
  const scroller=useRef(null),[edges,setEdges]=useState({left:false,right:false});
  function measure(){const el=scroller.current;if(!el||grid)return;const next={left:el.scrollLeft>4,right:el.scrollLeft+el.clientWidth<el.scrollWidth-4};setEdges(old=>old.left===next.left&&old.right===next.right?old:next);}
  useEffect(measure);
  useEffect(()=>{const el=scroller.current;if(!el)return;const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();},[]);
  const page=direction=>scroller.current?.scrollBy({left:direction*scroller.current.clientWidth*.85,behavior:scrollBehavior()});
  return <section className={'home-section'+(className?' '+className:'')} id={id}>
    <div className="home-section-head"><h2>{title}</h2><div className="home-section-tools">{action}
      {!grid&&(edges.left||edges.right)&&<><button className="home-arrow" aria-label={'向前浏览'+title} disabled={!edges.left} onClick={()=>page(-1)}><CaretLeft size={15}/></button><button className="home-arrow" aria-label={'向后浏览'+title} disabled={!edges.right} onClick={()=>page(1)}><CaretRight size={15}/></button></>}
    </div></div>
    <div className={grid?'home-cover-grid':'home-shelf'} ref={scroller} onScroll={measure}>{children}</div>
  </section>;
}

function TrackGrid({tracks,actions,currentId,playing,onToggle}){
  return <ul className="home-track-grid">{tracks.map(track=>{const now=track.id===currentId;return <li key={track.id}>
    <button className={'home-track'+(now?' now':'')} onClick={()=>now?onToggle():actions.current.play(track,tracks)} aria-label={(now&&playing?'暂停 ':'播放 ')+track.title}>
      <span className="home-track-art"><MusicArt src={track.cover} title={track.title}/>{now&&playing&&<NowBars/>}</span>
      <span className="home-track-text"><strong>{track.title}</strong><small>{track.artist}</small></span>
      <time>{formatDuration(track.duration_ms)}</time>
    </button>
  </li>;})}</ul>;
}

// Numbered, compact song list; flows down then across so the order reads by column.
function RankList({tracks,currentId,playing,onToggle,run}){
  return <ol className="home-rank">{tracks.map((track,i)=>{const now=track.id===currentId;return <li key={track.id}>
    <button className={'home-rank-row'+(now?' now':'')} onClick={()=>now?onToggle():run.play(track,tracks)} aria-label={(now&&playing?'暂停 ':'播放 ')+track.title}>
      <span className="home-rank-no">{now&&playing?<NowBars/>:String(i+1).padStart(2,'0')}</span>
      <span className="home-rank-art"><MusicArt src={track.cover} title={track.title}/></span>
      <span className="home-rank-text"><strong>{track.title}</strong><small>{track.artist}</small></span>
      {track.play_count>0&&<small className="home-rank-count">{track.play_count} 次</small>}
    </button>
  </li>;})}</ol>;
}

function RecentList({tracks,history,currentId,playing,onToggle,run,action}){
  return <div className="home-recent"><div className="home-recent-head"><h3>最近播放</h3>{action}</div>
    {tracks.map(track=>{const now=track.id===currentId;return <button key={track.id} className={now?'now':undefined} onClick={()=>now?onToggle():run.play(track,history)} aria-label={(now&&playing?'暂停 ':'播放 ')+track.title}>
      <span className="home-recent-art"><MusicArt src={track.cover} title={track.title}/>{now&&playing&&<NowBars/>}</span><span><strong>{track.title}</strong><small>{track.artist}</small></span>
    </button>;})}
  </div>;
}

function HeroMain({hero,heroNow,playing,history,run,onPlay}){
  return <div className="home-hero-main">
    <button className="home-hero-art" onClick={()=>run.openDetail(hero)} aria-label={'查看《'+hero.title+'》的歌词与资料'}><MusicArt src={hero.cover} title={hero.title}/></button>
    <div className="home-hero-copy">
      <span className="home-hero-state">{heroNow&&playing?<><NowBars/>正在播放</>:'上次听到'}</span>
      <h2>{hero.title}</h2>
      <p>{hero.artist}{hero.album&&<span>{hero.album}</span>}</p>
      <div className="home-hero-actions">
        <button className="button primary" onClick={onPlay}><PlayLabel now={heroNow} playing={playing}/></button>
        {history?.length>1&&<button className="button home-ghost" onClick={()=>run.play(history[0],history)}><ClockCounterClockwise size={17}/>播放最近听过的歌</button>}
      </div>
    </div>
  </div>;
}

function EmptyHero({run,onImport,className=''}){
  return <section className={'home-hero home-hero-empty '+className}>
    <div className="home-hero-copy">
      <h2>从第一首歌开始</h2>
      <p>导入电脑里的音乐，或连接网易云音乐、QQ音乐、Spotify 账号。听过的歌、喜欢的歌和常听的歌手都会出现在这里。</p>
      <div className="home-hero-actions">
        <button className="button primary" onClick={onImport}><FolderSimple size={17}/>导入本地音乐</button>
        <button className="button home-ghost" onClick={()=>run.navigate('accounts')}><UserCircle size={17}/>连接账号</button>
        <button className="button home-ghost" onClick={()=>run.search('')}><MagnifyingGlass size={17}/>搜索音乐</button>
      </div>
    </div>
  </section>;
}

// Flat row tile with a square on the left; an optional play button sits beside the main button.
function Shortcut({item,playing}){
  return <div className={'home-shortcut home-shortcut-'+(item.icon?item.key:item.kind||'list')+(item.now?' now':'')}>
    <button className="home-shortcut-main" onClick={item.go} aria-label={item.label}>
      <span className="home-shortcut-art">{item.icon?<item.icon size={22} weight="fill"/>:<MusicArt src={item.cover} title={item.title}/>}{item.now&&playing&&<NowBars/>}</span>
      <span className="home-shortcut-text">{item.eyebrow&&<em>{item.eyebrow}</em>}<strong>{item.title}</strong>{item.detail&&<small>{item.detail}</small>}</span>
    </button>
    {item.play&&<button className="home-shortcut-play" onClick={item.play} aria-label={(item.now&&playing?'暂停 ':'播放 ')+item.title}>{item.now&&playing?<Pause size={18} weight="fill"/>:<Play size={18} weight="fill"/>}</button>}
  </div>;
}

// NetEase-style banner: the last played song first, then recent ones, with dots to switch.
function Banner({slides,history,currentId,playing,onToggle,run,onPlayHero,heroNow}){
  const [index,setIndex]=useState(0),[paused,setPaused]=useState(false);
  const count=slides.length,at=Math.min(index,count-1),slide=slides[at],first=at===0,now=first?heroNow:slide.id===currentId;
  useEffect(()=>{if(count<2||paused||reducedMotion())return;const timer=setInterval(()=>setIndex(i=>(i+1)%count),7000);return()=>clearInterval(timer);},[count,paused]);
  const play=()=>first?onPlayHero():now?onToggle():run.play(slide,history);
  const step=direction=>setIndex((at+direction+count)%count);
  return <section className="home-banner" style={{'--hero-cover':cssUrl(slide.cover)}} aria-roledescription="轮播" aria-label="最近播放" onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={()=>setPaused(false)}>
    <div className="home-banner-slide" key={slide.id}>
      <button className="home-banner-art" onClick={()=>run.openDetail(slide)} aria-label={'查看《'+slide.title+'》的歌词与资料'}><MusicArt src={slide.cover} title={slide.title}/></button>
      <div className="home-banner-copy">
        <span className="home-banner-tag">{now&&playing?<><NowBars/>正在播放</>:first?'上次听到':'最近播放'}</span>
        <h2>{slide.title}</h2>
        <p>{slide.artist}{slide.album&&<span>{slide.album}</span>}</p>
        <div className="home-hero-actions">
          <button className="button primary" onClick={play}><PlayLabel now={now} playing={playing}/></button>
          {history?.length>1&&<button className="button home-ghost" onClick={()=>run.play(history[0],history)}><ClockCounterClockwise size={17}/>播放最近听过的歌</button>}
        </div>
      </div>
    </div>
    {count>1&&<>
      <div className="home-banner-peek">{[1,2,3].filter(n=>n<count).map(n=>{const i=(at+n)%count,s=slides[i];return <button key={s.id} style={{'--n':n}} onClick={()=>setIndex(i)} aria-label={'切换到《'+s.title+'》'}><MusicArt src={s.cover} title={s.title}/></button>;}).reverse()}</div>
      <button className="home-banner-step prev" aria-label="上一张" onClick={()=>step(-1)}><CaretLeft size={20}/></button>
      <button className="home-banner-step next" aria-label="下一张" onClick={()=>step(1)}><CaretRight size={20}/></button>
      <div className="home-banner-dots">{slides.map((s,i)=><button key={s.id} aria-label={'第 '+(i+1)+' 张：'+s.title} aria-current={i===at?'true':undefined} onClick={()=>setIndex(i)}/>)}</div>
    </>}
  </section>;
}

// QQ Music-style section tabs that jump to, and follow, the sections below.
// Apple Music "Top Picks": a tall card whose caption strip takes its colour from the blurred artwork.
function ApplePick({eyebrow,cover,icon:Icon,title,detail,now,playing,onClick,label}){
  return <button className={'apple-pick'+(Icon?' icon':'')+(now?' now':'')} style={{'--pick-cover':cssUrl(cover)}} onClick={onClick} aria-label={label||title}>
    <span className="apple-pick-eyebrow">{eyebrow}</span>
    <span className="apple-pick-art">{Icon?<span className="apple-pick-icon"><Icon size={64} weight="fill"/></span>:<MusicArt src={cover} title={title}/>}{now&&playing&&<NowBars/>}</span>
    <span className="apple-pick-caption"><strong>{title||'未命名'}</strong>{detail&&<small>{detail}</small>}</span>
  </button>;
}

function PlatformPicks({id,title='平台推荐',accounts,actions,currentId,playing,onToggle,external}){
  const [modes,setModes]=useState([]),[active,setActive]=useState(null),[data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[expanded,setExpanded]=useState(false),[waited,setWaited]=useState(false);
  const request=useRef(0);
  const connected=source=>accounts.some(a=>a.source===source&&a.logged_in);
  const usable=mode=>mode.mode==='read'&&(!mode.requires_login||connected(mode.source));
  useEffect(()=>{api('/api/music/discovery').then(d=>setModes(d.modes||[])).catch(e=>setError(e.message));const timer=setTimeout(()=>setWaited(true),2000);return()=>{request.current++;clearTimeout(timer);};},[]);
  // Only personal lists from connected accounts load on their own; anonymous editorial lists wait for a click.
  useEffect(()=>{
    if(active||!modes.length||(!accounts.length&&!waited))return;
    const saved=modes.find(m=>m.id===localStorage.getItem('elixir-home-pick')&&usable(m));
    const first=saved||modes.find(m=>usable(m)&&m.requires_login);
    if(first)select(first);
  },[modes,accounts,waited]);
  async function select(mode,force=false){
    if(mode.mode==='official'){external(mode.url);return;}
    const id=++request.current;setActive(mode);setExpanded(false);setError('');
    if(!usable(mode)){setData(null);setBusy(false);return;}
    localStorage.setItem('elixir-home-pick',mode.id);
    const cached=pickCache.get(mode.id);if(cached&&!force){setData(cached);setBusy(false);return;}
    setData(null);setBusy(true);
    try{const result=await api('/api/music/discovery/'+mode.id.replace(':','/'),{timeout:75000});if(id!==request.current)return;pickCache.set(mode.id,result);setData(result);}
    catch(e){if(id===request.current)setError(e.message);}
    finally{if(id===request.current)setBusy(false);}
  }
  const groups=['netease','qqmusic','spotify'].map(source=>[source,modes.filter(m=>m.source===source)]).filter(([,list])=>list.length);
  const tracks=data?.tracks||[],items=data?.items||[],shown=expanded?tracks:tracks.slice(0,12),shownItems=expanded?items:items.slice(0,12);
  let body;
  if(error)body=<div className="home-pick-note"><p>{error}</p>{active&&<button className="button quiet" onClick={()=>select(active,true)}><ArrowsClockwise size={16}/>重试</button>}</div>;
  else if(!active)body=modes.length?<p className="home-pick-note">连接账号后，这里会显示平台为你准备的每日推荐；也可以点上面任意一项查看。</p>:null;
  else if(!usable(active))body=<div className="home-pick-note"><p>连接{SOURCE_NAMES[active.source]}账号后，这里会显示你的{active.title}。</p><button className="button quiet" onClick={()=>actions.current.navigate('accounts')}><UserCircle size={16}/>连接账号</button></div>;
  else if(busy)body=<div className="home-pick-loading" aria-label="正在读取推荐"><i/><i/><i/><i/><i/><i/></div>;
  else if(tracks.length)body=<>
    <div className="home-pick-actions"><button className="button primary" onClick={()=>actions.current.play(tracks[0],tracks)}><Play size={16} weight="fill"/>播放全部</button><button className="button quiet" onClick={()=>actions.current.batch('queue',tracks)}><Queue size={16}/>加入队列</button><span>{tracks.length} 首</span></div>
    <TrackGrid tracks={shown} actions={actions} currentId={currentId} playing={playing} onToggle={onToggle}/>
    {tracks.length>shown.length&&<button className="home-text-button home-more" onClick={()=>setExpanded(true)}>显示全部 {tracks.length} 首</button>}
  </>;
  else if(items.length)body=<><div className="home-cover-grid">{shownItems.map(item=><CoverCard key={item.id} cover={item.cover} title={item.title} detail={item.artist} label={'查看 '+item.title} onClick={()=>actions.current.openEntity(item)}/>)}</div>{items.length>shownItems.length&&<button className="home-text-button home-more" onClick={()=>setExpanded(true)}>显示全部 {items.length} 个</button>}</>;
  else if(data)body=<p className="home-pick-note">平台这次没有返回内容，可以稍后刷新。</p>;
  return <section className="home-section home-picks" id={id}>
    <div className="home-section-head"><h2>{title}</h2>{active&&usable(active)&&<button className="home-text-button" disabled={busy} onClick={()=>select(active,true)}><ArrowsClockwise size={14}/>刷新</button>}</div>
    <div className="home-pick-modes">{groups.map(([source,list])=><div className="home-pick-group" key={source}><span>{SOURCE_NAMES[source]}</span>
      {list.map(mode=><button key={mode.id} className={'home-pick-chip'+(active?.id===mode.id?' chosen':'')} title={mode.description} aria-pressed={active?.id===mode.id} onClick={()=>select(mode)}>{mode.title}
        {mode.mode==='official'?<ArrowSquareOut size={13} aria-label="在官方页面打开"/>:!usable(mode)&&<LockSimple size={12} aria-label="需要连接账号"/>}
      </button>)}
    </div>)}</div>
    {body}
  </section>;
}

export default function Home({theme,actions,current,currentId,playing,liked,labels,accounts,onToggle,onImport,external}){
  const [history,setHistory]=useState(null),[library,setLibrary]=useState(null),[stats,setStats]=useState(null),[ranking,setRanking]=useState(null),[filter,setFilter]=useState('all');
  useEffect(()=>{
    let alive=true;
    const load=()=>{
      api('/api/history').then(d=>alive&&setHistory(d.tracks||[])).catch(()=>alive&&setHistory([]));
      api('/api/music/library').then(d=>alive&&setLibrary(d)).catch(()=>alive&&setLibrary({}));
      api('/api/music/stats?since='+weekStart()).then(d=>alive&&setStats(d)).catch(()=>{});
      // Prefer the last 30 days; fall back to all records when the month is still empty.
      api('/api/music/ranking?since='+Math.floor(Date.now()/1000-30*DAY)).then(d=>d.tracks?.length?d:api('/api/music/ranking')).then(d=>alive&&setRanking(d)).catch(()=>alive&&setRanking({}));
    };
    load();window.addEventListener('elixir-library-changed',load);
    return()=>{alive=false;window.removeEventListener('elixir-library-changed',load);};
  },[]);
  const layout=LAYOUTS.includes(theme)?theme:'netease',run=actions.current,now=new Date();
  const hero=current||history?.[0],heroNow=!!hero&&hero.id===currentId,recent=(history||[]).filter(t=>t.id!==hero?.id),loading=history===null&&!current;
  const playHero=()=>heroNow?onToggle():run.play(hero,history?.some(t=>t.id===hero.id)?history:[hero]);
  const toggle=(track,list)=>track.id===currentId?onToggle():run.play(track,list);
  const topTracks=(ranking?.tracks||[]).slice(0,12),artists=(ranking?.artists||[]).slice(0,10),albums=(library?.albums||[]).slice(0,16);
  const nav=[
    {key:'likes',icon:Heart,title:labels.likes,detail:liked.size?liked.size+' 首':'还没有喜欢的歌',go:()=>run.navigate('likes')},
    {key:'history',icon:ClockCounterClockwise,title:labels.history,detail:history?.length?history.length+' 首':'',go:()=>run.navigate('history')},
    {key:'ranking',icon:MusicNotes,title:'听歌排行',detail:stats?.plays?'本周 '+stats.plays+' 次':'',go:()=>run.navigate('ranking')},
    {key:'library',icon:FolderSimple,title:labels.library,detail:library?.local_count?library.local_count+' 首':'',go:()=>run.navigate('library')},
  ];
  const lists=(library?.playlists||[]).map(p=>({key:p.id,cover:p.cover,title:p.title,detail:(p.count??p.total??0)+' 首',go:()=>p.kind==='playlist'?run.openEntity(p):run.navigate('playlist',p.id)}));
  const openArtist=artist=>artist.entity?run.openEntity({...artist.entity,cover:artist.cover}):run.search(artist.name,'all','artist');
  const common={history,currentId,playing,onToggle,run};

  const greet=<header className="home-greeting"><h1>{greeting(now.getHours())}</h1><p><span>{now.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}</span>{stats&&<span>{weekSummary(stats)}</span>}</p></header>;
  const heroSection=(count=4)=>loading?<div className="home-hero home-hero-loading" aria-label="正在读取听歌记录"/>
    :hero?<section className="home-hero" style={{'--hero-cover':cssUrl(hero.cover)}} aria-label={heroNow&&playing?'正在播放':'上次听到'}>
      <HeroMain hero={hero} heroNow={heroNow} playing={playing} history={history} run={run} onPlay={playHero}/>
      {recent.length>0&&count>0&&<RecentList tracks={recent.slice(0,count)} {...common}/>}
    </section>
    :<EmptyHero run={run} onImport={onImport}/>;
  const topCards=topTracks.map(track=><CoverCard key={track.id} cover={track.cover} title={track.title} detail={track.artist} badge={track.play_count?track.play_count+' 次':''} playable now={track.id===currentId} playing={playing} label={'播放 '+track.title} onClick={()=>toggle(track,topTracks)}/>);
  const artistCards=artists.map(artist=><CoverCard key={artist.name} round cover={artist.cover} title={artist.name} detail={artist.play_count+' 次'} label={'查看歌手 '+artist.name} onClick={()=>openArtist(artist)}/>);
  const albumCards=list=>list.map(album=><CoverCard key={album.id} cover={album.cover} title={album.title} detail={album.artist} label={'查看专辑 '+album.title} onClick={()=>run.openEntity(album)}/>);
  const rankingLink=<button className="home-text-button" onClick={()=>run.navigate('ranking')}>查看排行<CaretRight size={12}/></button>;
  const musicLink=<button className="home-text-button" onClick={()=>run.navigate('music')}>我的音乐<CaretRight size={12}/></button>;
  const picks=(title,id)=><PlatformPicks id={id} title={title} accounts={accounts} actions={actions} currentId={currentId} playing={playing} onToggle={onToggle} external={external}/>;

  let body;
  if(layout==='netease'){
    // Banner carousel, a square cover grid of the listener's lists, then compact song rows.
    const slides=hero?[hero,...recent.slice(0,4)]:[];
    const tiles=[...nav,...lists].slice(0,10);
    body=<>
      {greet}
      {loading?<div className="home-banner home-hero-loading" aria-label="正在读取听歌记录"/>:hero?<Banner slides={slides} heroNow={heroNow} onPlayHero={playHero} {...common}/>:<EmptyHero run={run} onImport={onImport}/>}
      <Shelf grid title="我的歌单" className="home-netease-lists" action={musicLink}>
        {tiles.map(item=><CoverCard key={item.key} icon={item.icon} cover={item.cover} title={item.title} badge={item.detail} label={'打开 '+item.title} onClick={item.go}/>)}
      </Shelf>
      {topTracks.length>0&&<section className="home-section"><div className="home-section-head"><h2>最近常听</h2>{rankingLink}</div><RankList tracks={topTracks.slice(0,10)} {...common}/></section>}
      {picks('平台推荐')}
      {artists.length>1&&<Shelf title="常听歌手">{artistCards}</Shelf>}
      {albums.length>0&&<Shelf grid title="收藏的专辑" action={musicLink}>{albumCards(albums.slice(0,10))}</Shelf>}
    </>;
  }else if(layout==='qqmusic'){
    // "今日为你推荐": a large continue-listening card beside three entry cards, the playlist supply shelf,
    // a three-column song list, chart cards, then the remaining shelves.
    const qq=accounts?.find(a=>a.source==='qqmusic'&&a.logged_in),rankAlbums=(ranking?.albums||[]).slice(0,3);
    const charts=[
      ['歌曲榜','tone-green',topTracks.map(t=>({key:t.id,title:t.title,sub:t.artist,cover:t.cover}))],
      ['歌手榜','tone-blue',artists.map(a=>({key:a.name,title:a.name,sub:a.play_count+' 次',cover:a.cover}))],
      ['专辑榜','tone-amber',rankAlbums.map(a=>({key:a.id,title:a.title,sub:a.artist||(a.play_count?a.play_count+' 次':''),cover:a.cover}))],
    ].filter(([,,items])=>items.length);
    body=<>
      <header className="qq-hello"><h1>Hi{qq?.nickname?' '+qq.nickname:''}，今日为你推荐</h1><p>{now.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}{stats?' · '+weekSummary(stats):''}</p></header>
      <div className="qq-feature">
        {loading?<div className="qq-feature-main home-hero-loading" aria-label="正在读取听歌记录"/>:hero?<section className={'qq-feature-main'+(heroNow&&playing?' is-playing':'')} style={{'--hero-cover':cssUrl(hero.cover)}} aria-label={heroNow&&playing?'正在播放':'接着听'}>
          <button className="qq-feature-art" onClick={()=>run.openDetail(hero)} aria-label={'查看《'+hero.title+'》的歌词与资料'}><MusicArt src={hero.cover} title={hero.title}/></button>
          <div className="qq-feature-copy">
            <span className="qq-feature-state">{heroNow&&playing?<><NowBars/>正在播放</>:'接着听'}</span>
            <button className="qq-feature-title" onClick={()=>run.openDetail(hero)}>{hero.title}</button>
            <p>{hero.artist}{hero.album?' · '+hero.album:''}</p>
            <button className="qq-play-round" onClick={playHero} aria-label={heroNow&&playing?'暂停':'播放 '+hero.title}>{heroNow&&playing?<Pause size={20} weight="fill"/>:<Play size={20} weight="fill"/>}</button>
          </div>
        </section>:<EmptyHero run={run} onImport={onImport} className="qq-feature-main"/>}
        <button className="qq-feature-card tone-green" onClick={()=>run.navigate('likes')}><Heart size={30} weight="fill"/><strong>{labels.likes}</strong><small>{liked.size?liked.size+' 首':'还没有喜欢的歌'}</small></button>
        <button className="qq-feature-card qq-collage-card" onClick={()=>run.navigate('history')}><span className="qq-collage">{[0,1,2,3].map(i=><MusicArt key={i} src={(history||[])[i]?.cover} title=""/>)}</span><strong>{labels.history}</strong><small>{history?.length?history.length+' 首':'暂无记录'}</small></button>
        <button className="qq-feature-card qq-cover-card" style={{'--card-cover':cssUrl(topTracks[0]?.cover)}} onClick={()=>run.navigate('ranking')}><MusicNotes size={30} weight="fill"/><strong>听歌排行</strong><small>{stats?.plays?'本周 '+stats.plays+' 次':'开始记录'}</small></button>
      </div>
      {lists.length>0&&<Shelf grid title="你的歌单补给站" className="qq-lists" action={musicLink}>{lists.slice(0,10).map(item=><CoverCard key={item.key} cover={item.cover} title={item.title} badge={item.detail} playable label={'打开 '+item.title} onClick={item.go}/>)}</Shelf>}
      {topTracks.length>0&&<section className="home-section qq-songs"><div className="home-section-head"><h2>最近常听</h2>{rankingLink}</div><TrackGrid tracks={topTracks.slice(0,9)} actions={actions} currentId={currentId} playing={playing} onToggle={onToggle}/></section>}
      {charts.length>0&&<section className="home-section"><div className="home-section-head"><h2>排行榜</h2>{rankingLink}</div><div className="qq-charts">{charts.map(([title,tone,items])=><button key={title} className={'qq-chart '+tone} onClick={()=>run.navigate('ranking')} aria-label={'查看'+title}>
        <span className="qq-chart-head"><strong>{title}</strong><small>近 30 天</small></span>
        <span className="qq-chart-cover"><MusicArt src={items[0].cover} title={items[0].title} round={tone==='tone-blue'}/></span>
        <ol>{items.slice(0,3).map((item,i)=><li key={item.key}><b>{i+1}</b><span>{item.title}</span><small>{item.sub}</small></li>)}</ol>
      </button>)}</div></section>}
      {picks('为你推荐')}
      {artists.length>1&&<Shelf title="常听歌手" action={rankingLink}>{artistCards}</Shelf>}
      {albums.length>0&&<Shelf title="收藏的专辑" action={musicLink}>{albumCards(albums)}</Shelf>}
    </>;
  }else if(layout==='spotify'){
    // Filter pills, a 2x4 grid of compact tiles, then shelves with hover play buttons.
    const filters=[['all','全部'],['music','音乐'],artists.length>1&&['artists','歌手'],albums.length&&['albums','专辑']].filter(Boolean);
    const shown=filters.some(([key])=>key===filter)?filter:'all',has=key=>shown==='all'||shown===key;
    const heroTile=hero&&{key:'hero',cover:hero.cover,now:heroNow,eyebrow:heroNow&&playing?'正在播放':'上次听到',title:hero.title,label:'查看《'+hero.title+'》的歌词与资料',go:()=>run.openDetail(hero),play:playHero};
    const tiles=[heroTile,...nav,...lists].filter(Boolean).slice(0,8);
    const recentCards=recent.slice(0,12).map(track=><CoverCard key={track.id} cover={track.cover} title={track.title} detail={track.artist} playable now={track.id===currentId} playing={playing} label={'播放 '+track.title} onClick={()=>toggle(track,history)}/>);
    body=<>
      <nav className="home-filters" aria-label="筛选">{filters.map(([key,label])=><button key={key} className={shown===key?'chosen':undefined} aria-pressed={shown===key} onClick={()=>setFilter(key)}>{label}</button>)}</nav>
      {has('music')&&<>
        {greet}
        {loading?<div className="home-shortcuts home-quick-loading" aria-label="正在读取听歌记录"><i/><i/><i/><i/></div>:<nav className="home-shortcuts" aria-label="快捷入口">{tiles.map(item=><Shortcut key={item.key} item={item} playing={playing}/>)}</nav>}
        {!loading&&!hero&&<EmptyHero run={run} onImport={onImport}/>}
        {recentCards.length>0&&<Shelf title="最近播放" action={<button className="home-text-button" onClick={()=>run.play(history[0],history)}>全部播放</button>}>{recentCards}</Shelf>}
        {topTracks.length>0&&<Shelf title="最近常听" action={rankingLink}>{topCards}</Shelf>}
        {picks('为你打造')}
      </>}
      {artists.length>1&&has('artists')&&<Shelf grid={shown==='artists'} title="常听歌手" action={rankingLink}>{artistCards}</Shelf>}
      {albums.length>0&&has('albums')&&<Shelf grid={shown==='albums'} title="收藏的专辑" action={musicLink}>{albumCards(albums)}</Shelf>}
    </>;
  }else if(layout==='apple'){
    // Large title, tall "Top Picks" cards, then the familiar shelves of square artwork.
    const firstList=lists[0],pickCards=[
      hero&&{key:'hero',eyebrow:heroNow&&playing?'正在播放':'接着听',cover:hero.cover,title:hero.title,detail:hero.artist,now:heroNow,go:playHero,label:(heroNow&&playing?'暂停 ':'播放 ')+hero.title},
      {key:'likes',eyebrow:'你的资料库',icon:Heart,title:labels.likes,detail:liked.size?liked.size+' 首歌曲':'还没有喜爱的歌曲',go:()=>run.navigate('likes')},
      ...lists.slice(0,3).map(item=>({key:item.key,eyebrow:'你的歌单',cover:item.cover,title:item.title,detail:item.detail,go:item.go})),
      topTracks[0]&&{key:'top',eyebrow:'最近常听',cover:topTracks[0].cover,title:topTracks[0].title,detail:topTracks[0].artist,now:topTracks[0].id===currentId,go:()=>toggle(topTracks[0],topTracks)},
    ].filter(Boolean).slice(0,5);
    const recentCards=(history||[]).slice(0,14).map(track=><CoverCard key={track.id} cover={track.cover} title={track.title} detail={track.artist} playable now={track.id===currentId} playing={playing} label={'播放 '+track.title} onClick={()=>toggle(track,history)}/>);
    body=<>
      <header className="apple-title"><h1>{labels.home}</h1><p>{greeting(now.getHours())}{stats?' · '+weekSummary(stats):''}</p></header>
      {loading?<div className="apple-picks home-hero-loading" aria-label="正在读取听歌记录"/>:<Shelf title="置顶精选" className="apple-picks-shelf">{pickCards.map(item=><ApplePick key={item.key} {...item} playing={playing} onClick={item.go}/>)}</Shelf>}
      {!loading&&!hero&&<EmptyHero run={run} onImport={onImport}/>}
      {recentCards.length>0&&<Shelf title="最近播放" action={<button className="home-text-button" onClick={()=>run.navigate('history')}>查看全部<CaretRight size={12}/></button>}>{recentCards}</Shelf>}
      {topTracks.length>0&&<Shelf title="最近常听" action={rankingLink}>{topCards}</Shelf>}
      {picks('为你推荐')}
      {artists.length>1&&<Shelf title="常听艺人" action={rankingLink}>{artistCards}</Shelf>}
      {albums.length>0&&<Shelf title="收藏的专辑" action={musicLink}>{albumCards(albums)}</Shelf>}
      {lists.length>1&&<Shelf title="我的歌单" action={musicLink}>{lists.map(item=><CoverCard key={item.key} cover={item.cover} title={item.title} detail={item.detail} label={'打开 '+item.title} onClick={item.go}/>)}</Shelf>}
    </>;
  }else if(layout==='ink'){
    // A record sleeve and a listening journal; the shelves use the same live data and actions.
    body=<>
      <div className="ink-heading">{greet}<button className="home-text-button" onClick={()=>run.navigate('ranking')}>听歌排行<CaretRight size={14}/></button></div>
      {loading?<div className="ink-session home-hero-loading" aria-label="正在读取听歌记录"/>:hero?<section className={'ink-session'+(heroNow&&playing?' is-playing':'')} aria-label="唱片台">
        <div className="ink-session-copy">
          <span className="ink-session-state">{heroNow&&playing?<><NowBars/>正在播放</>:'接着听'}</span>
          <button className="ink-session-title" onClick={()=>run.openDetail(hero)}><h2>{hero.title}</h2></button>
          <p className="ink-session-artist">{hero.artist}</p>
          {hero.album&&<p className="ink-session-album">{hero.album}</p>}
          <div className="home-hero-actions"><button className="button primary" onClick={playHero}><PlayLabel now={heroNow} playing={playing}/></button><button className="ink-detail-link" onClick={()=>run.openDetail(hero)}>歌词与资料<CaretRight size={15}/></button></div>
        </div>
        <button className="ink-record" onClick={()=>run.openDetail(hero)} aria-label={'查看《'+hero.title+'》的歌词与资料'}>
          <span className="ink-record-disc" aria-hidden="true"><span><MusicArt src={hero.cover} title=""/></span></span>
          <span className="ink-record-sleeve"><MusicArt src={hero.cover} title={hero.title}/></span>
        </button>
        <div className="ink-session-footer"><span>{SOURCE_NAMES[hero.source]||'音乐库'}</span><span>{formatDuration(hero.duration_ms)}</span></div>
      </section>:<EmptyHero run={run} onImport={onImport}/>}
      <nav className="ink-shortcuts" aria-label="快捷入口">{nav.map(item=><button key={item.key} onClick={item.go}><item.icon size={20}/><strong>{item.title}</strong>{item.detail&&<small>{item.detail}</small>}<CaretRight size={14}/></button>)}</nav>
      <div className="ink-journal">
        <div className="ink-collection"><Shelf grid title="我的歌单" action={musicLink}>{lists.length?lists.slice(0,4).map(item=><CoverCard key={item.key} cover={item.cover} title={item.title} detail={item.detail} onClick={item.go}/>):<button className="ink-empty-list" onClick={()=>run.navigate('music')}><MusicNotes size={28}/><span>创建歌单</span></button>}</Shelf></div>
        <div className="ink-recent">{recent.length>0?<RecentList tracks={recent.slice(0,4)} {...common} action={<button className="home-text-button" onClick={()=>run.navigate('history')}>全部<CaretRight size={12}/></button>}/>:<div className="home-section-head"><h2>最近播放</h2><button className="home-text-button" onClick={()=>run.search('')}>搜索音乐<CaretRight size={12}/></button></div>}</div>
      </div>
      {topTracks.length>0&&<section className="home-section ink-heavy-rotation"><div className="home-section-head"><h2>最近常听</h2>{rankingLink}</div><RankList tracks={topTracks.slice(0,8)} {...common}/></section>}
      {artists.length>0&&<Shelf title="常听歌手" action={rankingLink}>{artistCards}</Shelf>}
      {albums.length>0&&<Shelf title="收藏的专辑" action={musicLink}>{albumCards(albums)}</Shelf>}
      {picks('平台推荐')}
    </>;
  }else{
    // Aurora: a bento grid of glass cards, then the longer shelves in glass panels.
    const hours=stats?.listened_ms>=3600000?[(stats.listened_ms/3600000).toFixed(1),'小时']:[Math.round((stats?.listened_ms||0)/60000),'分钟'];
    body=<>
      {greet}
      <div className="home-bento">
        <div className="home-bento-cell home-bento-hero" style={hero?{'--hero-cover':cssUrl(hero.cover)}:undefined}>{loading?<div className="home-hero-loading" aria-label="正在读取听歌记录"/>:hero?<HeroMain hero={hero} heroNow={heroNow} playing={playing} history={history} run={run} onPlay={playHero}/>:<EmptyHero run={run} onImport={onImport}/>}</div>
        <button className="home-bento-cell home-bento-stats" onClick={()=>run.navigate('ranking')} aria-label={'查看听歌排行。'+weekSummary(stats)}>
          <span className="home-bento-label">本周听歌</span>
          {stats?.plays?<><strong className="home-bento-big">{hours[0]}<small>{hours[1]}</small></strong><span className="home-bento-meta">播放 {stats.plays} 次{stats.distinct_tracks?' · '+stats.distinct_tracks+' 首歌':''}</span></>:<span className="home-bento-meta">{stats?'本周还没有听歌记录':'正在统计'}</span>}
        </button>
        <nav className="home-bento-cell home-bento-quick" aria-label="快捷入口">{nav.map(item=><button key={item.key} className={'home-bento-link home-shortcut-'+item.key} onClick={item.go}><item.icon size={20} weight="fill"/><strong>{item.title}</strong>{item.detail&&<small>{item.detail}</small>}</button>)}</nav>
        <div className="home-bento-cell home-bento-recent">{recent.length?<RecentList tracks={recent.slice(0,5)} {...common} action={history?.length>1&&<button className="home-text-button" onClick={()=>run.navigate('history')}>全部<CaretRight size={12}/></button>}/>:<div className="home-recent"><div className="home-recent-head"><h3>最近播放</h3></div><p className="home-bento-meta">{loading?'正在读取':'听过的歌会出现在这里'}</p></div>}</div>
        <div className="home-bento-cell home-bento-artists"><div className="home-recent-head"><h3>常听歌手</h3>{artists.length>0&&rankingLink}</div>
          {artists.length?<div className="home-bento-faces">{artists.slice(0,6).map(artist=><button key={artist.name} onClick={()=>openArtist(artist)} aria-label={'查看歌手 '+artist.name}><MusicArt src={artist.cover} title={artist.name} round/><strong>{artist.name}</strong><small>{artist.play_count} 次</small></button>)}</div>:<p className="home-bento-meta">多听几首，常听的歌手会出现在这里</p>}
        </div>
        <div className="home-bento-cell home-bento-lists"><div className="home-recent-head"><h3>我的歌单</h3>{musicLink}</div>
          {lists.length?<div className="home-bento-rows">{lists.slice(0,4).map(item=><button key={item.key} onClick={item.go}><span className="home-recent-art"><MusicArt src={item.cover} title={item.title}/></span><span><strong>{item.title}</strong><small>{item.detail}</small></span></button>)}</div>:<p className="home-bento-meta">在“我的音乐”里新建歌单</p>}
        </div>
      </div>
      {topTracks.length>0&&<Shelf title="最近常听" action={rankingLink}>{topCards}</Shelf>}
      {picks('平台推荐')}
      {albums.length>0&&<Shelf title="收藏的专辑" action={musicLink}>{albumCards(albums)}</Shelf>}
    </>;
  }
  return <div className={'home home-'+layout}>{body}</div>;
}
