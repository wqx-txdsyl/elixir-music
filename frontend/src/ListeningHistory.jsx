import React,{memo,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowsClockwise,DownloadSimple,Trash,CaretDown,Info,ClockCounterClockwise} from '@phosphor-icons/react';
import {api,SOURCE_NAMES} from './api';
import {PlaybackTrackTable} from './TrackTable';
import SelectMenu from './SelectMenu';
import PageHero from './PageHero';
import './listening-history.css';

export const ListeningHistory=memo(function ListeningHistory({currentId,playing,liked,actions,privateSession,onPrivacy,notify}){
  const [source,setSource]=useState('all'),[days,setDays]=useState('0'),[query,setQuery]=useState('');
  const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmClear,setConfirmClear]=useState(false);
  const [privacyPending,setPrivacyPending]=useState(null);
  const request=useRef(0);
  const params=()=>new URLSearchParams({source,...(Number(days)?{since:String(Date.now()/1000-Number(days)*86400)}:{})}).toString();
  async function load(){const id=++request.current;setBusy(true);setError('');const query=params();try{const [a,b]=await Promise.all([api('/api/history?'+query),api('/api/music/stats?'+query)]);if(id===request.current)setData({tracks:a.tracks,stats:b});}catch(e){if(id===request.current)setError(e.message);}finally{if(id===request.current)setBusy(false);}}
  useEffect(()=>{load();return()=>{request.current++;};},[source,days]);
  useEffect(()=>{
    let cancelled=false;
    const update=()=>api('/api/music/stats?'+params()).then(stats=>{if(!cancelled)setData(old=>old?{...old,stats}:old);}).catch(()=>{});
    // Refresh metrics without replacing the table's items: playback must not
    // reset a user's current page or batch selection.
    const timer=playing?setInterval(update,15000):setTimeout(update,800);
    return()=>{cancelled=true;if(playing)clearInterval(timer);else clearTimeout(timer);};
  },[playing,source,days]);
  const tracks=useMemo(()=>(data?.tracks||[]).filter(t=>[t.title,t.artist,t.album].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())),[data?.tracks,query]);
  const seconds=Math.floor((data?.stats.listened_ms||0)/1000),minutes=Math.floor(seconds/60);
  const listeningTime=seconds>=3600?`${Math.floor(minutes/60)}小时${minutes%60}分`:seconds>=60?`${minutes}分${seconds%60}秒`:`${seconds}秒`;
  async function exportHistory(){try{const result=await api('/api/history/export?'+params());const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='Elixir-history.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){notify(e.message);}}
  return <section className="listening-history"><PageHero kind="history" icon={ClockCounterClockwise} eyebrow="听歌记录" title="最近播放" meta={privateSession?'私密收听已开启，不记录播放和搜索历史。':'只统计在 Elixir 中的播放'} stats={data?[['次播放',data.stats.plays],['首歌曲',data.stats.distinct_tracks],['已记录时长',listeningTime]]:null} actions={<label className="private-listening"><input type="checkbox" checked={privacyPending??!!privateSession} disabled={privacyPending!==null} onChange={async e=>{const value=e.target.checked;setPrivacyPending(value);try{await onPrivacy(value);}finally{setPrivacyPending(null);}}}/>私密收听</label>}/>
    <div className="history-filters"><SelectMenu aria-label="播放历史来源" value={source} onChange={e=>setSource(e.target.value)}>{['all','local','netease','qqmusic','spotify'].map(s=><option key={s} value={s}>{SOURCE_NAMES[s]}</option>)}</SelectMenu><SelectMenu aria-label="播放历史时间范围" value={days} onChange={e=>setDays(e.target.value)}>{[['0','全部时间'],['7','最近7天'],['30','最近30天'],['365','最近一年']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</SelectMenu><input aria-label="筛选播放历史" placeholder="搜索播放历史" value={query} onChange={e=>setQuery(e.target.value)}/><button className="icon-button" aria-label="刷新播放历史" disabled={busy} onClick={load}><ArrowsClockwise size={19}/></button><button className="button quiet" onClick={exportHistory}><DownloadSimple size={17}/>导出</button><button className="icon-button" aria-label="清除播放历史" onClick={()=>setConfirmClear(true)}><Trash size={19}/></button></div>
    {privateSession&&<div className="history-notice" role="status">私密收听已开启，不记录播放和搜索历史。</div>}
    {error&&<div className="error-note" role="alert">{error}</div>}
    {data&&<><details className="history-scope"><summary><Info size={15}/>记录范围<CaretDown size={14}/></summary><p>仅统计在 Elixir 中的播放，旧记录不计时长。{Number(days)?'时长按收听开始时间筛选。':''}</p></details>
    
    <PlaybackTrackTable viewKey="history" items={tracks} currentId={currentId} playing={playing} liked={liked} actions={actions}/>{!tracks.length&&!busy&&<div className="history-empty">没有播放记录</div>}</>}
    {!data&&busy&&<div role="status">正在读取…</div>}
    {confirmClear&&<div className="history-clear" role="alertdialog" aria-label="清除本应用播放历史"><p>清除全部播放历史和听歌时长？</p><button className="button quiet" onClick={()=>setConfirmClear(false)}>取消</button><button className="button primary" onClick={async()=>{try{await api('/api/history',{method:'DELETE'});setConfirmClear(false);await load();}catch(e){notify(e.message);}}}>清除记录</button></div>}
  </section>;
});
