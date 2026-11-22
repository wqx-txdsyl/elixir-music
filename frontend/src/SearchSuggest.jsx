import React,{useEffect,useId,useRef,useState} from 'react';
import {ClockCounterClockwise,Heart,MagnifyingGlass,MusicNote,X} from '@phosphor-icons/react';
import {api} from './api';
import {Cover} from './ui';

// 顶栏搜索框：输入时下拉给出最近搜索、本机曲库与收藏里的匹配歌曲，以及「在全部平台搜索」。
// 只查本机数据，不请求平台；↑↓ 选择，Enter 执行，Esc 收起。
export default function SearchSuggest({inputRef,value,onChange,onSearch,onPlay,placeholder,kbd}){
  const [open,setOpen]=useState(false),[data,setData]=useState({queries:[],tracks:[]}),[active,setActive]=useState(-1);
  const request=useRef(0),root=useRef(null),listId=useId();
  const text=value.trim();
  useEffect(()=>{
    if(!open)return;
    // 关键词一变就清掉旧选项的选中，新结果回来之前按 Enter 搜的是新词，不会播放上一次结果里的歌。
    setActive(-1);
    const id=++request.current;
    const timer=setTimeout(()=>{api('/api/search/suggest?q='+encodeURIComponent(text)).then(result=>{if(id===request.current){setData({queries:result.queries||[],tracks:result.tracks||[],text});setActive(-1);}}).catch(()=>{});},text?140:0);
    return()=>clearTimeout(timer);
  },[text,open]);
  const options=[
    ...data.queries.map(q=>({kind:'query',key:'q:'+q,label:q})),
    ...(text&&data.text===text?data.tracks:[]).map(t=>({kind:'track',key:'t:'+t.id,track:t})),
    ...(text?[{kind:'all',key:'all',label:text}]:[]),
  ];
  const shown=open&&options.length>0;
  function close(){setOpen(false);setActive(-1);}
  function choose(option){
    close();
    if(option.kind==='track'){onPlay(option.track);inputRef.current?.blur();return;}
    const q=option.kind==='query'?option.label:text;
    onChange(q);onSearch(q);inputRef.current?.blur();
  }
  function key(e){
    if(e.nativeEvent.isComposing||e.keyCode===229)return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      if(!shown){setOpen(true);return;}
      e.preventDefault();const step=e.key==='ArrowDown'?1:-1;
      setActive(old=>{const next=old+step;return next<-1?options.length-1:next>=options.length?-1:next;});
      return;
    }
    if(e.key==='Escape'&&shown){e.preventDefault();e.stopPropagation();close();return;}
    if(e.key==='Enter'&&shown&&active>=0){e.preventDefault();choose(options[active]);}
    if(e.key==='Tab')close();
  }
  const groupStart=(option,i)=>i===0||options[i-1].kind!==option.kind;
  const optionId=i=>listId+'-'+i;
  return <form ref={root} className={'search-box'+(shown?' suggest-open':'')} role="search" onSubmit={e=>{e.preventDefault();close();onSearch(value);inputRef.current?.blur();}} onBlur={e=>{if(!root.current?.contains(e.relatedTarget))close();}}>
    <MagnifyingGlass size={21}/>
    <input ref={inputRef} placeholder={placeholder} value={value} aria-label="搜索音乐" role="combobox" aria-expanded={shown} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={shown&&active>=0?optionId(active):undefined} autoComplete="off" spellCheck={false}
      onChange={e=>{onChange(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} onClick={()=>setOpen(true)} onKeyDown={key}/>
    {value?<button type="button" aria-label="清空搜索" onClick={()=>{onChange('');inputRef.current?.focus();setOpen(true);}}><X size={15}/></button>:kbd&&<kbd title={'快捷键 '+kbd}>{kbd}</kbd>}
    {shown&&<div className="search-suggest" id={listId} role="listbox" aria-label="搜索建议" onMouseDown={e=>e.preventDefault()}>
      {options.map((option,i)=><React.Fragment key={option.key}>
        {groupStart(option,i)&&option.kind!=='all'&&<div className="search-suggest-group" role="presentation">{option.kind==='query'?(text?'搜索历史':'最近搜索'):'我的音乐'}</div>}
        <div id={optionId(i)} role="option" aria-selected={active===i} className={'search-suggest-option kind-'+option.kind} onMouseEnter={()=>setActive(i)} onClick={()=>choose(option)}>
          {option.kind==='query'&&<><ClockCounterClockwise size={16}/><span className="search-suggest-text">{option.label}</span></>}
          {option.kind==='track'&&<><Cover src={option.track.cover}/><span className="search-suggest-text"><strong>{option.track.title}</strong><small>{option.track.artist}</small></span><span className="search-suggest-tag">{option.track.source==='local'?<><MusicNote size={12}/>本地</>:<><Heart size={12}/>喜欢</>}</span></>}
          {option.kind==='all'&&<><MagnifyingGlass size={16}/><span className="search-suggest-text">搜索“<strong>{option.label}</strong>”</span><kbd>Enter</kbd></>}
        </div>
      </React.Fragment>)}
    </div>}
  </form>;
}
