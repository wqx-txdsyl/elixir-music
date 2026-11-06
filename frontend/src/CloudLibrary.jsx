import React,{memo,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowsClockwise} from '@phosphor-icons/react';
import {api,SOURCE_NAMES} from './api';
import {PlaybackTrackTable} from './TrackTable';

const labels={track:'喜欢的歌曲',album:'专辑',artist:'歌手',playlist:'歌单'};
export function LibraryOrigins({value,onChange}){
 return <div className="source-tabs library-origins" aria-label="收藏来源">{[['local','Elixir'],['all','全部收藏'],['netease','网易云音乐'],['qqmusic','QQ音乐'],['spotify','Spotify']].map(([id,title])=><button key={id} className={value===id?'active':''} onClick={()=>onChange(id)}>{title}</button>)}</div>;
}

export const CloudLibrary=memo(function CloudLibrary({source,localData,liked,currentId,playing,actions,EntityCards,onOpen,onPlaylist,onRemotePlaylist,notify}){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[errors,setErrors]=useState([]),[kind,setKind]=useState('track'),[query,setQuery]=useState('');
 const request=useRef(0);
 async function load(sync=false){const id=++request.current;setBusy(true);setErrors([]);try{
  if(sync&&(source==='all'||source==='spotify')&&window.desktop?.refreshSpotifySession){try{await window.desktop.refreshSpotifySession();}catch{/* The API returns the source-specific login status while other platforms remain usable. */}}
  const result=await api('/api/music/cloud-library'+(sync?'/sync':'?source='+source),sync?{method:'POST',body:{source},timeout:180000}:{});
  if(id===request.current){setData(result);setErrors(result.errors||[]);}
 }catch(e){if(id===request.current)setErrors([{message:e.message}]);}finally{if(id===request.current)setBusy(false);}}
 useEffect(()=>{setData(null);load();return()=>{request.current++;};},[source]);
 const collections=data?.collections||[];
 const merged=useMemo(()=>{
  const groups={track:new Map(),album:new Map(),artist:new Map(),playlist:new Map()};
  function add(k,item,origin){const previous=groups[k].get(item.id);groups[k].set(item.id,previous?{...previous,collection_origins:[...new Set([...previous.collection_origins,origin])]}:{...item,collection_origins:[origin]});}
  if(source==='all'){
   for(const t of localData?.likes||[])add('track',t,'Elixir');
   for(const k of ['album','artist'])for(const e of localData?.[k==='album'?'albums':'artists']||[])add(k,e,'Elixir');
   for(const p of localData?.playlists||[])add('playlist',{...p,kind:'playlist',scope:'local'},'Elixir');
  }
  for(const c of collections)for(const item of c.kind==='track'?c.tracks||[]:c.items||[])add(c.kind,item,(SOURCE_NAMES[c.source]||c.source)+'云端');
  return Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,[...v.values()]]));
 },[data,localData,source]);
 const items=useMemo(()=>merged[kind].filter(t=>[t.title,t.artist,t.album,t.source_id,t.id].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())),[merged,kind,query]);
 const active=collections.filter(c=>c.kind===kind),warnings=[...errors.filter(e=>!e.kind||e.kind===kind).map(e=>(e.source?SOURCE_NAMES[e.source]+'：':'')+e.message),...active.flatMap(c=>(c.warnings||[]).map(w=>SOURCE_NAMES[c.source]+'：'+w))];
 const unread=active.filter(c=>c.status==='not_read'||c.status==='login_required');
 const latest=Math.max(0,...active.map(c=>c.synced_at||0));
 function open(item){if(kind==='playlist'){if(item.kind==='playlist'&&item.source_id)onOpen(item);else if(item.scope==='local')onPlaylist(item.id);else onRemotePlaylist({id:item.source_id,title:item.title},item.source);}else onOpen(item);}
 return <section className="cloud-library"><div className="library-browser-head"><div className="music-type-tabs" role="tablist" aria-label="平台收藏分类">{Object.keys(labels).map(k=><button key={k} role="tab" aria-selected={kind===k} onClick={()=>setKind(k)}>{labels[k]}<small>{merged[k].length}</small></button>)}</div><button className="button quiet" disabled={busy} onClick={()=>load(true)}><ArrowsClockwise size={17} className={busy?'spin':''}/>{busy?'正在读取…':'读取收藏'}</button></div>
  <div className="cloud-library-filter"><input aria-label="筛选平台收藏" placeholder="筛选名称、歌手或专辑" value={query} onChange={e=>setQuery(e.target.value)}/><span title="读取不会修改三家云端收藏">云端只读{latest?' · '+new Date(latest*1000).toLocaleString('zh-CN'):''}</span></div>
  {warnings.map((w,i)=><div className="error-note" role="alert" key={i}>{w}</div>)}
  {unread.length>0&&<div className="cloud-library-unread">{unread.map(c=><span key={c.source}>{SOURCE_NAMES[c.source]} · {c.status==='login_required'?'请先连接账号':'尚未读取'}</span>)}</div>}
  {kind==='track'?<PlaybackTrackTable viewKey={'cloud:'+source} localEdits items={items} currentId={currentId} playing={playing} liked={liked} actions={actions}/>:<EntityCards items={items} onOpen={open}/>}
  {!items.length&&!busy&&<div className="history-empty">{unread.length?'连接账号后读取收藏':warnings.length?'读取未完成':'暂无收藏'}</div>}
 </section>;
});
