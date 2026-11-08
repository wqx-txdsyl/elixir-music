import React,{useEffect,useRef,useState} from 'react';
import {Check,PaintBrush,PuzzlePiece,SlidersHorizontal} from '@phosphor-icons/react';
import {SKINS,SKIN_GROUPS} from './skins.mjs';

// Quick skin switcher in the sidebar; the full workshop is one click away.
export default function ThemeMenu({skin,onChange,onStudio,onEdit}){
  const [open,setOpen]=useState(false),root=useRef(null);
  useEffect(()=>{
    if(!open)return;
    const close=e=>{if(!root.current?.contains(e.target))setOpen(false);},key=e=>{if(e.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};
  },[open]);
  useEffect(()=>{if(open)root.current?.querySelector('[aria-checked=true]')?.scrollIntoView({block:'nearest'});},[open]);
  return <div className="theme-menu" ref={root}>
    {open&&<div className="theme-popover" role="menu" aria-label="皮肤">
      <div className="theme-popover-list">{SKIN_GROUPS.map(group=><div key={group} className="theme-group"><span className="theme-group-title">{group}</span>
        {SKINS.filter(s=>s.group===group).map(s=><button key={s.id} role="menuitemradio" aria-checked={skin.id===s.id} onClick={()=>{setOpen(false);onChange(s.id);}}>
          <span className="theme-dot" style={{background:s.swatch.accent,boxShadow:'0 0 0 3px '+s.swatch.bg+', 0 0 0 4px #8884'}}/><span className="theme-choice"><strong>{s.name}</strong><small>{s.hint}</small></span>{skin.id===s.id&&<Check size={15}/>}
        </button>)}
      </div>)}</div>
      <div className="theme-popover-foot"><button onClick={()=>{setOpen(false);onEdit();}}><PuzzlePiece size={16}/>拆装组件</button><button onClick={()=>{setOpen(false);onStudio();}}><PaintBrush size={16}/>个性化工坊</button></div>
    </div>}
    <button className="appearance-button" aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(!open)}><SlidersHorizontal size={18}/><span>{skin.name}</span><span className="theme-dot" style={{background:skin.swatch.accent}}/></button>
  </div>;
}
