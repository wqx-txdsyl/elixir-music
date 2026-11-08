import React,{memo,useDeferredValue,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowBendDownRight,Check,ClockCounterClockwise,Disc,DotsThree,DownloadSimple,Heart,HeartBreak,ListChecks,MagnifyingGlass,MinusCircle,Play,Queue,Playlist,SortAscending,SortDescending,Trash,X} from '@phosphor-icons/react';
import {SOURCE_NAMES,formatDuration,mediaUrl} from './api';
import SelectMenu from './SelectMenu';
import ActionMenu from './ActionMenu';
import {filterTracks,orderTracks} from './track-order.mjs';
import {listeningTime} from './listening.mjs';
import './track-toolbar.css';

// Rows mounted around the viewport; the rest of the list is represented by spacers.
const WINDOW=60,OVERSCAN=12;

const Art=memo(function Art({src,title}){const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);return <div className="cover">{src&&!failed?<img src={mediaUrl(src)} alt={title+'封面'} loading="lazy" onError={()=>setFailed(true)}/>:<Disc size={28} weight="thin"/>}</div>;});

export const NavigationItem=memo(function NavigationItem({target,icon:Icon,title,count,id,cover,activePage,activePlaylistId,actions}){
  const active=activePage===target&&(target!=='playlist'||activePlaylistId===id);
  return <button className={'nav-item '+(active?'selected':'')} title={title} onClick={()=>actions.current.navigate(target,id)}><Icon size={21} weight={active?'fill':'regular'}/>{cover&&<span className="nav-cover" aria-hidden="true"><img src={mediaUrl(cover)} alt="" loading="lazy"/></span>}<span>{title}</span>{count!==undefined&&<small>{count}</small>}</button>;
});

function TrackFilter({inputRef,value,onChange,placeholder}){
  return <label className={'track-filter'+(value?' has-value':'')}>
    <MagnifyingGlass size={16}/>
    <input ref={inputRef} value={value} placeholder={placeholder} aria-label={placeholder} title="Ctrl+F" onChange={e=>onChange(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'&&value){e.preventDefault();e.stopPropagation();onChange('');}}}/>
    {value&&<button type="button" className="track-filter-clear" aria-label="清除搜索" onClick={()=>{onChange('');inputRef.current?.focus();}}><X size={14}/></button>}
  </label>;
}

export const PlaybackTrackTable=memo(function PlaybackTrackTable({items:sourceItems,currentId,playing,liked=new Set(),actions,playlistId,playlistContext,localEdits=false,controls=false,viewKey,showStats=false,filterable=true}){
  const storageKey='elixir-track-view:'+(viewKey||playlistContext?.id||playlistId||'shared');
  function savedView(){try{return JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{return {};}}
  const [sort,setSort]=useState(()=>savedView().sort||(showStats?'play_count':'original')),[descending,setDescending]=useState(()=>savedView().descending??showStats);
  const storedKey=useRef(storageKey);
  const [query,setQuery]=useState(''),searchText=useDeferredValue(filterable?query:''),filtering=searchText.trim()!=='';
  const ordered=useMemo(()=>orderTracks(sourceItems,sort,descending),[sourceItems,sort,descending]);
  const items=useMemo(()=>filterTracks(ordered,searchText),[ordered,searchText]);
  const [selecting,setSelecting]=useState(false),[selected,setSelected]=useState(new Set()),[working,setWorking]=useState(false);
  const anchor=useRef(null),headerCheck=useRef(null),barCheck=useRef(null),barRef=useRef(null),filterRef=useRef(null),listRef=useRef(null),rowHeight=useRef(64);
  const [range,setRange]=useState({start:0,end:WINDOW});
  useEffect(()=>{setSelected(new Set());setSelecting(false);anchor.current=null;},[sourceItems]);
  useEffect(()=>{anchor.current=null;},[items]);
  useEffect(()=>{if(storedKey.current!==storageKey){storedKey.current=storageKey;const saved=savedView();setSort(saved.sort||(showStats?'play_count':'original'));setDescending(saved.descending??showStats);return;}localStorage.setItem(storageKey,JSON.stringify({sort,descending}));},[storageKey,sort,descending]);
  // The selection bar sticks to the scroll area's edge, not below its top padding, so rows cannot show above it.
  useLayoutEffect(()=>{const bar=barRef.current,scroller=bar?.closest('.main-scroll');if(bar&&scroller)bar.style.top=-(parseFloat(getComputedStyle(scroller).paddingTop)||0)+'px';},[selecting]);
  // Ctrl+F jumps to the in-list search box.
  useEffect(()=>{
    if(!filterable)return;
    const key=e=>{if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='f'&&filterRef.current?.isConnected){e.preventDefault();filterRef.current.focus();filterRef.current.select();}};
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[filterable]);
  useEffect(()=>{
    const list=listRef.current,scroller=list?.closest('.main-scroll');
    if(!list||!scroller){setRange({start:0,end:items.length});return;}
    let raf=0;
    const update=()=>{
      raf=0;const rows=list.querySelectorAll('.track-row');
      if(rows.length)rowHeight.current=rows.length>1?rows[1].offsetTop-rows[0].offsetTop:rows[0].offsetHeight;
      const h=rowHeight.current||64,top=list.getBoundingClientRect().top-scroller.getBoundingClientRect().top+(list.querySelector('.table-header')?.offsetHeight||0);
      // An odd start keeps each row's nth-child parity, so the zebra striping does not flicker while scrolling.
      let start=Math.max(0,Math.floor(-top/h)-OVERSCAN);if(start%2===0&&start>0)start-=1;
      const end=Math.min(items.length,Math.max(start+1,Math.ceil((scroller.clientHeight-top)/h)+OVERSCAN));
      setRange(old=>old.start===start&&old.end===end?old:{start,end});
    };
    const schedule=()=>{if(!raf)raf=requestAnimationFrame(update);};
    update();scroller.addEventListener('scroll',schedule,{passive:true});const observer=new ResizeObserver(schedule);observer.observe(scroller);
    return()=>{cancelAnimationFrame(raf);scroller.removeEventListener('scroll',schedule);observer.disconnect();};
  },[items.length]);
  // Selection survives searching: actions apply to everything selected, the checkboxes act on the visible results.
  const visible=items.slice(range.start,range.end),chosen=ordered.filter(t=>selected.has(t.id));
  const shown=items.filter(t=>selected.has(t.id)).length,allShown=items.length>0&&shown===items.length,hiddenChosen=chosen.length-shown;
  useEffect(()=>{for(const box of [headerCheck.current,barCheck.current])if(box)box.indeterminate=!allShown&&shown>0;},[shown,allShown,selecting]);
  // Shift extends from the last clicked row; read the anchor now, because the state updater may run after it moves.
  function toggle(track,index,event){const from=anchor.current,span=(event.shiftKey||event.nativeEvent?.shiftKey)&&from!==null?items.slice(Math.min(from,index),Math.max(from,index)+1):[track];anchor.current=index;setSelected(old=>{const next=new Set(old),value=!old.has(track.id);span.forEach(t=>value?next.add(t.id):next.delete(t.id));return next;});}
  function toggleShown(){setSelected(old=>{const next=new Set(old);items.forEach(t=>allShown?next.delete(t.id):next.add(t.id));return next;});}
  function setMode(value){setSelecting(value);setSelected(new Set());anchor.current=null;}
  async function run(action){if(!chosen.length||working)return;setWorking(true);try{await actions.current.batch(action,chosen,playlistContext||playlistId);}finally{setWorking(false);}}
  const inPlaylist=!!(playlistId||playlistContext),idle=!chosen.length||working,allLocal=chosen.length>0&&chosen.every(t=>t.source==='local');
  const filterBox=filterable&&<TrackFilter inputRef={filterRef} value={query} onChange={setQuery} placeholder={inPlaylist?'搜索歌单内歌曲':'在列表中搜索'}/>;
  const toolbar=selecting
    ?<div ref={barRef} className="track-toolbar selection-bar" role="toolbar" aria-label="批量操作">
      <label className="selection-check"><input ref={barCheck} type="checkbox" checked={allShown} disabled={!items.length} onChange={toggleShown} aria-label={allShown?'取消全选':filtering?'全选搜索结果':'全选'}/><span className="selection-text"><span role="status">{chosen.length?<>已选 <strong>{chosen.length}</strong> 首</>:'点击歌曲进行选择'}</span>{hiddenChosen>0&&<small title="这些歌曲已选中，但不在当前搜索结果里">含 {hiddenChosen} 首未显示</small>}</span></label>
      <div className="selection-actions">
        <button className="button primary" disabled={idle} onClick={()=>run('play')}><Play size={16} weight="fill"/>播放</button>
        <button className="button quiet" disabled={idle} onClick={()=>run('next')}><ArrowBendDownRight size={16}/>下一首播放</button>
        <button className="button quiet" disabled={idle} onClick={()=>run('queue')}><Queue size={16}/>加入队列</button>
        <button className="button quiet" disabled={idle} onClick={()=>run('playlist')}><Playlist size={16}/>加入歌单</button>
        {inPlaylist&&<button className="button quiet danger" disabled={idle} onClick={()=>run('playlist_remove')}><MinusCircle size={16}/>{playlistContext?.remote_source?'从 Elixir 副本移除':'从歌单移除'}</button>}
        <ActionMenu label="" disabled={idle} items={[{label:'喜欢',icon:Heart,onClick:()=>run('like')},{label:'取消喜欢',icon:HeartBreak,onClick:()=>run('unlike')},{label:'导出所选',icon:DownloadSimple,onClick:()=>run('export')},allLocal&&'divider',allLocal&&{label:'从音乐库移除',icon:Trash,danger:true,onClick:()=>run('local_remove')}]}/>
      </div>
      <div className="track-toolbar-tools">{filterBox}<button className="button quiet selection-done" onClick={()=>setMode(false)}><Check size={16} weight="bold"/>完成</button></div>
    </div>
    :<div className="track-toolbar">
      {controls&&<div className="track-toolbar-primary">
        <button className="button primary" disabled={!items.length} onClick={()=>actions.current.playAll(items)}><Play size={17} weight="fill"/>{filtering?'播放搜索结果':'播放全部'}</button>
        <button className="button quiet" disabled={!items.length} onClick={()=>actions.current.batch('queue',items)}><Queue size={17}/>加入队列</button>
        <button className="button quiet" disabled={!items.length} onClick={()=>actions.current.batch('playlist',items,playlistId)}><Playlist size={17}/>加入歌单</button>
      </div>}
      <div className="track-toolbar-tools">
        {filterBox}
        <div className="track-sort"><SelectMenu aria-label="歌曲排序" value={sort} onChange={e=>{setSort(e.target.value);}}><option value="original">默认顺序</option>{showStats&&<><option value="play_count">按播放次数</option><option value="listened_ms">按听歌时长</option></>}<option value="title">按歌曲名</option><option value="artist">按歌手</option><option value="album">按专辑</option><option value="duration">按时长</option></SelectMenu>{sort!=='original'&&<button className="icon-button" aria-label={descending?'切换升序':'切换降序'} onClick={()=>setDescending(!descending)}>{descending?<SortDescending size={18}/>:<SortAscending size={18}/>}</button>}</div>
        <button className="button quiet" disabled={!sourceItems.length} onClick={()=>setMode(true)}><ListChecks size={17}/>多选</button>
      </div>
    </div>;
  return <>{toolbar}<div className={'track-table '+(showStats?'with-stats ':'')+(selecting?'selecting':'')} ref={listRef}><div className="table-header"><span>{selecting?<input ref={headerCheck} type="checkbox" aria-label={filtering?'全选搜索结果':'全选全部歌曲'} checked={allShown} disabled={!items.length} onChange={toggleShown}/>:"#"}</span><span>歌曲 / 歌手</span><span>专辑</span><span>来源</span>{showStats&&<span>播放 / 听歌时长</span>}<span><ClockCounterClockwise size={16}/></span><span/></div>{range.start>0&&<div className="track-spacer" aria-hidden="true" style={{height:range.start*rowHeight.current}}/>}{visible.map((track,i)=><div className={'track-row '+(track.id===currentId?'current ':'')+(selected.has(track.id)?'row-selected':'')} key={track.id+':'+(range.start+i)} onClick={selecting?e=>{if(!e.target.closest('button,input,a'))toggle(track,range.start+i,e);}:undefined} onDoubleClick={selecting?undefined:()=>actions.current.play(track,items)}><>{selecting?<input type="checkbox" aria-label={"选择 "+track.title} checked={selected.has(track.id)} onChange={e=>toggle(track,range.start+i,e)}/>:<button className="row-number" title="播放" onClick={()=>actions.current.play(track,items)}><span>{track.id===currentId&&playing?<span className="equalizer"><i/><i/><i/></span>:String(range.start+i+1).padStart(2,'0')}</span><Play className="row-play" size={16} weight="fill"/></button>}</><div className="track-name"><button className="cover-button" onClick={()=>actions.current.openDetail(track)}><Art src={track.cover} title={track.title}/></button><div><button className="song-title" onClick={()=>actions.current.openDetail(track)}>{track.metadata_missing?'歌曲资料暂缺 · '+track.source_id:track.title || '未知标题'}{track.availability==='unavailable'&&<span className="unavailable-badge">无音源</span>}</button><button className="artist-name" onClick={()=>actions.current.trackEntity(track,'artist')}>{track.artist || '未知歌手'}</button></div><button className={'icon-button '+(liked.has(track.id)?'active':'')} title={localEdits?(liked.has(track.id)?'取消本应用喜欢':'保存到本应用'):(liked.has(track.id)?'取消喜欢':'喜欢')} aria-label={localEdits?(liked.has(track.id)?'取消本应用喜欢':'保存到本应用'):(liked.has(track.id)?'取消喜欢':'喜欢')} onClick={()=>actions.current.toggleLike(track)}><Heart size={21} weight={liked.has(track.id)?'fill':'regular'}/></button></div><button className="album-cell as-button" title={track.album} disabled={!track.album} onClick={()=>actions.current.trackEntity(track,'album')}>{track.album || '—'}</button><span title={track.collection_origins?.join(' · ')} className={'source-tag source-'+track.source}>{SOURCE_NAMES[track.source] || track.source}</span>{showStats&&<span className="statistics-cell"><strong>{track.play_count||0} 次</strong><span>{listeningTime(track.listened_ms)}</span></span>}<span className="duration-cell">{formatDuration(track.duration_ms)}</span><div className="row-actions"><button className="icon-button" aria-label="更多操作" title="更多操作" onClick={()=>actions.current.more(track)}><DotsThree size={21}/></button></div></div>)}{range.end<items.length&&<div className="track-spacer" aria-hidden="true" style={{height:(items.length-range.end)*rowHeight.current}}/>}{filtering&&!items.length&&<div className="track-filter-empty"><MagnifyingGlass size={28}/><p>没有找到与“{searchText.trim()}”相关的歌曲</p><button className="text-button" onClick={()=>{setQuery('');filterRef.current?.focus();}}>清除搜索</button></div>}</div>{sourceItems.length>0&&<p className="track-total">{filtering?`找到 ${items.length} 首 · 共 ${sourceItems.length} 首`:`共 ${items.length} 首`}</p>}</>;
});
