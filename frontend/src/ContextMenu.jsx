import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';

// 右键菜单：出现在鼠标位置（键盘打开时贴着触发元素），超出窗口时往回收。
// items 与 ActionMenu 相同：[{label, icon, onClick, danger, disabled}]，可夹 'divider' 和假值。
// 方向键 / Home / End 移动，Enter 或空格执行；Esc、点外面、在外面滚动滚轮、窗口失焦都会关闭。
// 不监听 scroll：播放时歌词等区域会自己滚动，不能因此把菜单关掉。
export default function ContextMenu({x,y,items,label='操作',onClose}){
  const box=useRef(null),close=useRef(onClose),[place,setPlace]=useState({left:x,top:y,ready:false});
  close.current=onClose;
  const list=items.filter(Boolean).filter((item,i,all)=>item!=='divider'||(i>0&&i<all.length-1&&all[i-1]!=='divider'));
  useLayoutEffect(()=>{
    const node=box.current;if(!node)return;
    const {width,height}=node.getBoundingClientRect(),margin=8;
    const left=x+width>innerWidth-margin?Math.max(margin,x-width):x;
    const top=y+height>innerHeight-margin?Math.max(margin,innerHeight-margin-height):y;
    setPlace({left,top,ready:true});
  },[x,y]);
  useEffect(()=>{
    const previous=document.activeElement;
    const dismiss=()=>close.current();
    const outside=e=>{if(!box.current?.contains(e.target))dismiss();};
    const key=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismiss();previous?.focus?.({preventScroll:true});return;}
      if(e.key==='Tab'){e.preventDefault();dismiss();return;}
      const entries=[...(box.current?.querySelectorAll('[role=menuitem]:not(:disabled)')||[])];if(!entries.length)return;
      const at=entries.indexOf(document.activeElement);
      const move={ArrowDown:at+1,ArrowUp:at-1,Home:0,End:entries.length-1}[e.key];
      if(move===undefined)return;
      e.preventDefault();e.stopPropagation();entries[(move+entries.length)%entries.length].focus();
    };
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);
    window.addEventListener('blur',dismiss);window.addEventListener('resize',dismiss);document.addEventListener('wheel',outside,{capture:true,passive:true});
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',dismiss);window.removeEventListener('resize',dismiss);document.removeEventListener('wheel',outside,{capture:true});};
  },[]);
  // 定位完成、菜单可见后再把焦点移到第一项（隐藏的元素拿不到焦点）
  useEffect(()=>{if(place.ready)box.current?.querySelector('[role=menuitem]:not(:disabled)')?.focus({preventScroll:true});},[place.ready]);
  return <div ref={box} className="context-menu more-menu-popover" role="menu" aria-label={label} style={{left:place.left,top:place.top,visibility:place.ready?'visible':'hidden'}} onContextMenu={e=>e.preventDefault()}>
    {list.map((item,i)=>item==='divider'?<hr key={'d'+i}/>:<button key={item.label+i} type="button" role="menuitem" tabIndex={-1} className={item.danger?'danger':''} disabled={item.disabled} onClick={()=>{close.current();item.onClick();}}>{item.icon&&<item.icon size={16}/>}<span>{item.label}</span></button>)}
  </div>;
}

// 键盘（菜单键、Shift+F10）触发时没有鼠标坐标，改用元素自身的位置。
export function menuPoint(event){
  if(event.clientX||event.clientY)return {x:event.clientX,y:event.clientY};
  const r=event.currentTarget?.getBoundingClientRect?.();
  return r?{x:r.left+Math.min(24,r.width/2),y:r.bottom}:{x:innerWidth/2,y:innerHeight/2};
}
