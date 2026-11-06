import React,{useEffect,useRef,useState} from 'react';
import {DotsThree} from '@phosphor-icons/react';

// "More" button with a small popover menu. items: [{label, icon, onClick, danger, disabled}] (falsy entries and 'divider' allowed).
export default function ActionMenu({label='更多',icon:Icon=DotsThree,items,className='',buttonClass='button quiet',disabled=false,align='right'}){
  const [open,setOpen]=useState(false),root=useRef(null),button=useRef(null);
  const list=items.filter(Boolean).filter((x,i,all)=>x!=='divider'||(i>0&&i<all.length-1&&all[i-1]!=='divider'));
  useEffect(()=>{
    if(!open)return;
    const close=e=>{if(!root.current?.contains(e.target))setOpen(false);};
    const key=e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);button.current?.focus();}};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key,true);};
  },[open]);
  if(!list.some(x=>x!=='divider'))return null;
  return <div className={'more-menu '+className} ref={root}>
    <button ref={button} type="button" className={buttonClass+(label?"":" icon-only")} aria-label={label||"更多操作"} title={label?undefined:"更多操作"} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(!open)}><Icon size={17} weight="bold"/>{label&&<span>{label}</span>}</button>
    {open&&<div className={'more-menu-popover align-'+align} role="menu">{list.map((item,i)=>item==='divider'?<hr key={'d'+i}/>:<button key={item.label} type="button" role="menuitem" className={item.danger?'danger':''} disabled={item.disabled} onClick={()=>{setOpen(false);item.onClick();}}>{item.icon&&<item.icon size={16}/>}<span>{item.label}</span></button>)}</div>}
  </div>;
}
