import React,{useEffect,useRef,useState} from 'react';
import {Check,SlidersHorizontal} from '@phosphor-icons/react';
import {THEME_NAMES} from './api';

const hints={netease:'浅色 · 红',qqmusic:'深蓝 · 绿',spotify:'纯黑 · 绿',aurora:'毛玻璃 · 渐变',ink:'纸白 · 墨黑 · 朱红',apple:'玫红 · 随系统明暗'};

// Switches the interface style in place from the sidebar.
export default function ThemeMenu({theme,themes,onChange}){
  const [open,setOpen]=useState(false),root=useRef(null);
  useEffect(()=>{
    if(!open)return;
    const close=e=>{if(!root.current?.contains(e.target))setOpen(false);},key=e=>{if(e.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};
  },[open]);
  return <div className="theme-menu" ref={root}>
    {open&&<div className="theme-popover" role="menu" aria-label="界面风格">{themes.map(provider=><button key={provider} role="menuitemradio" aria-checked={theme===provider} onClick={()=>{onChange(provider);setOpen(false);}}><span className={'theme-dot dot-'+provider}/><span className="theme-choice"><strong>{THEME_NAMES[provider]}</strong><small>{hints[provider]}</small></span>{theme===provider&&<Check size={15}/>}</button>)}</div>}
    <button className="appearance-button" aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(!open)}><SlidersHorizontal size={18}/><span>切换界面</span><span className={'theme-dot dot-'+theme}/></button>
  </div>;
}
