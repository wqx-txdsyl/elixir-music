import React,{Children,useEffect,useId,useRef,useState} from 'react';
import {CaretDown,Check} from '@phosphor-icons/react';

export default function SelectMenu({value,onChange,children,className='',disabled=false,...props}){
  const options=Children.toArray(children).filter(x=>x?.type==='option').map(x=>({value:String(x.props.value),label:x.props.children,disabled:!!x.props.disabled}));
  const selected=Math.max(0,options.findIndex(x=>x.value===String(value)));
  const [open,setOpen]=useState(false),[active,setActive]=useState(selected);
  const root=useRef(null),button=useRef(null),search=useRef({text:'',at:0}),id=useId();
  useEffect(()=>{if(!open)return;const close=e=>{if(!root.current?.contains(e.target))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[open]);
  useEffect(()=>{if(open)root.current?.querySelector('[data-active="true"]')?.scrollIntoView({block:'nearest'});},[active,open]);
  function choose(index){const item=options[index];if(!item||item.disabled)return;onChange?.({target:{value:item.value}});setOpen(false);button.current?.focus();}
  function keydown(e){
    if(e.key==='Escape'){setOpen(false);return;}
    if(e.key==='Tab'){setOpen(false);return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
      e.preventDefault();let next=e.key==='Home'?0:e.key==='End'?options.length-1:!open?selected:(active+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;
      for(let i=0;i<options.length&&options[next]?.disabled;i++)next=(next+(e.key==='ArrowUp'?-1:1)+options.length)%options.length;
      setActive(next);setOpen(true);return;
    }
    if(e.key==='Enter'||e.key===' '){e.preventDefault();if(open)choose(active);else{setActive(selected);setOpen(true);}return;}
    if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){const now=Date.now();search.current={text:(now-search.current.at<700?search.current.text:'')+e.key.toLocaleLowerCase(),at:now};const index=options.findIndex(x=>!x.disabled&&String(x.label).toLocaleLowerCase().startsWith(search.current.text));if(index>=0){setActive(index);setOpen(true);}}
  }
  return <div className={'select-menu '+className} ref={root}>
    <button {...props} ref={button} type="button" className="select-trigger" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id:undefined} aria-activedescendant={open?id+'-'+active:undefined} disabled={disabled} onClick={()=>{setActive(selected);setOpen(!open);}} onKeyDown={keydown}><span>{options[selected]?.label}</span><CaretDown size={17}/></button>
    {open&&<div className="select-options" role="listbox" id={id} aria-label={props['aria-label']}>{options.map((item,index)=><button key={item.value} id={id+'-'+index} type="button" role="option" aria-selected={index===selected} disabled={item.disabled} data-active={index===active} onPointerMove={()=>setActive(index)} onPointerDown={e=>e.preventDefault()} onClick={()=>choose(index)}><span>{item.label}</span>{index===selected&&<Check size={16} weight="bold"/>}</button>)}</div>}
  </div>;
}
