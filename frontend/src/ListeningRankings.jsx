import React,{useEffect,useRef,useState} from 'react';
import {ArrowsClockwise,Trophy} from '@phosphor-icons/react';
import {api,SOURCE_NAMES} from './api';
import {PlaybackTrackTable} from './TrackTable';
import SelectMenu from './SelectMenu';
import PageHero from './PageHero';
import {Cover} from './ui';
import './rankings.css';
import {listeningTime} from './listening.mjs';

export function ListeningBadge({id,kind='track'}){
 const [data,setData]=useState(null);
 useEffect(()=>{let cancelled=false;const load=()=>api('/api/music/listening/'+(kind==='track'?'tracks/':'entities/')+encodeURIComponent(id)).then(d=>{if(!cancelled)setData(d);}).catch(()=>{});setData(null);load();const timer=setInterval(load,15000);return()=>{cancelled=true;clearInterval(timer);};},[id,kind]);
 return data?<span className="listening-badge" title="Elixir 中的听歌记录">{kind==='track'?`播放 ${data.play_count||0} 次`:`听歌 ${listeningTime(data.listened_ms)}`}</span>:null;
}
export default function ListeningRankings({currentId,playing,liked,actions}){
 const [data,setData]=useState(null),[kind,setKind]=useState('track'),[source,setSource]=useState('all'),[days,setDays]=useState('0'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[order,setOrder]=useState(()=>localStorage.getItem('elixir-artist-ranking-order')||'plays');const request=useRef(0);
 async function load(){const id=++request.current;setBusy(true);setError('');try{const d=await api('/api/music/ranking?'+new URLSearchParams({source,...(days!=='0'?{since:String(Date.now()/1000-Number(days)*86400)}:{})}));if(id===request.current)setData(d);}catch(e){if(id===request.current)setError(e.message);}finally{if(id===request.current)setBusy(false);}}
 useEffect(()=>{load();return()=>{request.current++;};},[source,days]);
 const top=data?.tracks?.[0],plays=(data?.tracks||[]).reduce((sum,t)=>sum+(t.play_count||0),0);
 const artists=[...(data?.artists||[])].sort((a,b)=>order==='time'?b.listened_ms-a.listened_ms||b.play_count-a.play_count:b.play_count-a.play_count||b.listened_ms-a.listened_ms);
 return <section className="listening-ranking"><PageHero kind="ranking" icon={Trophy} eyebrow="Elixir 记录" title="听歌排行" meta={top?`第一名：${top.title} · ${top.artist}`:'播放过的歌会在这里排名'} stats={data?[['首歌曲',data.tracks?.length||0],['位歌手',data.artists?.length||0],['次播放',plays]]:null} actions={<button className="button quiet" disabled={busy} onClick={load}><ArrowsClockwise size={17}/>刷新</button>}/><div className="history-filters"><SelectMenu aria-label="排行来源" value={source} onChange={e=>setSource(e.target.value)}>{['all','local','netease','qqmusic','spotify'].map(s=><option key={s} value={s}>{SOURCE_NAMES[s]}</option>)}</SelectMenu><SelectMenu aria-label="排行时间范围" value={days} onChange={e=>setDays(e.target.value)}>{[['0','全部时间'],['7','最近7天'],['30','最近30天'],['365','最近一年']].map(([id,title])=><option key={id} value={id}>{title}</option>)}</SelectMenu></div><div className="music-type-tabs" role="tablist" aria-label="听歌排行分类"><button role="tab" aria-selected={kind==='track'} onClick={()=>setKind('track')}>歌曲</button><button role="tab" aria-selected={kind==='artist'} onClick={()=>setKind('artist')}>歌手</button></div>{error&&<div className="error-note" role="alert">{error}</div>}
 {kind==='track'?<PlaybackTrackTable viewKey="ranking" showStats items={data?.tracks||[]} currentId={currentId} playing={playing} liked={liked} actions={actions}/>:<><div className="artist-ranking-sort"><SelectMenu aria-label="歌手排行排序" value={order} onChange={e=>{setOrder(e.target.value);localStorage.setItem('elixir-artist-ranking-order',e.target.value);}}><option value="plays">按播放次数</option><option value="time">按听歌时长</option></SelectMenu></div><div className="artist-ranking">{artists.map((artist,i)=><div className="artist-ranking-row ranked" key={artist.name}><span className="rank">{i+1}</span><Cover src={artist.cover} title={artist.name}/><button onClick={()=>artist.entity?actions.current.openEntity(artist.entity):actions.current.search(artist.name,'all','artist')}>{artist.name}</button><span className="artist-ranking-bar"><i style={{'--w':Math.max(4,Math.round((order==='time'?artist.listened_ms/(artists[0].listened_ms||1):artist.play_count/(artists[0].play_count||1))*100))+'%'}}/></span><strong>{artist.play_count} 次</strong><span>{listeningTime(artist.listened_ms)}</span></div>)}</div></>}{!busy&&data&&!(kind==='track'?data.tracks:artists)?.length&&<div className="history-empty">暂无听歌记录</div>}</section>;
}
