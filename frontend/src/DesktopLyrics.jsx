import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {LockSimple,LockSimpleOpen,Palette,X} from '@phosphor-icons/react';
import './desktop-lyrics.css';
import {wordProgress} from './lyric-words.mjs';

const defaults={foreground:'#b8e2ae',highlight:'#ffd166',background:'#1b2228',opacity:0,fontSize:28,locked:false};
const rgba=(hex,alpha)=>{const n=parseInt(hex.slice(1),16);return `rgb(${n>>16&255} ${n>>8&255} ${n&255} / ${alpha})`;};
// The player only reports line changes and seeks; progress inside a line is extrapolated here.
function lineProgress(data,now){
  if(data.start==null||data.end==null)return null;
  const position=data.position+(data.playing?(now-data.at)/1000*data.rate:0);
  if(data.words?.length)return wordProgress(data.words.map(([time,duration,length])=>({time,duration,length})),position);
  return Math.max(0,Math.min(1,(position-data.start)/(data.end-data.start)));
}

export default function DesktopLyrics(){
  const [data,setData]=useState({title:'Elixir',line:'暂无歌词',next:'',start:null,end:null});
  const [appearance,setAppearance]=useState(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem('desktop-lyrics-appearance')||'{}')};}catch{return defaults;}});
  const [colors,setColors]=useState(false),[hover,setHover]=useState(false),[dragging,setDragging]=useState(false);
  const lineRef=useRef(null),drag=useRef(null),pending=useRef(null),frame=useRef(0);
  useLayoutEffect(()=>{document.documentElement.classList.add('desktop-lyrics-root');},[]);
  useEffect(()=>window.desktop?.onLyrics?.(setData),[]);
  useEffect(()=>{window.desktop?.getLyricsPreferences?.().then(setAppearance).catch(()=>{});return window.desktop?.onLyricsPreferences?.(setAppearance);},[]);
  useEffect(()=>{localStorage.setItem('desktop-lyrics-appearance',JSON.stringify(appearance));if(appearance.locked)setColors(false);},[appearance]);
  useEffect(()=>{
    let raf;
    const paint=()=>{const p=lineProgress(data,Date.now());lineRef.current?.style.setProperty('--p',((p??0)*100).toFixed(2)+'%');if(data.playing&&p!==null&&p<1)raf=requestAnimationFrame(paint);};
    paint();return()=>cancelAnimationFrame(raf);
  },[data]);
  function update(patch){setAppearance(old=>({...old,...patch}));window.desktop?.setLyricsPreferences?.(patch).catch(()=>{});}
  // Native dragging (app-region) would swallow hover events, so moving and resizing go through IPC.
  function startDrag(e,mode){
    if(e.button!==0||appearance.locked)return;
    if(mode==='move'&&e.target.closest('button,input,label,.lyric-colors'))return;
    e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);
    drag.current={mode,sx:e.screenX,sy:e.screenY,x:window.screenX,y:window.screenY,width:window.outerWidth};setDragging(true);
  }
  function moveDrag(e){
    const d=drag.current;if(!d)return;
    const dx=e.screenX-d.sx,dy=e.screenY-d.sy;let {x,y,width}=d;
    if(d.mode==='move'){x+=dx;y+=dy;}
    else{width=Math.max(420,Math.min(1800,d.width+(d.mode==='right'?dx:-dx)));if(d.mode==='left')x=d.x+d.width-width;}
    pending.current={x,y,width};
    if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;const bounds=pending.current;pending.current=null;if(bounds)window.desktop?.moveLyrics?.(bounds).catch(()=>{});});
  }
  function endDrag(){drag.current=null;setDragging(false);}
  const passThrough=value=>window.desktop?.setLyricsMousePassThrough?.(value).catch(()=>{});
  const text=data.line||'暂无同步歌词',active=hover||colors||dragging;
  return <main className={'desktop-lyrics-window'+(active?' active':'')} data-locked={appearance.locked} onMouseMove={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onPointerDown={e=>startDrag(e,'move')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
    style={{'--lyric-fg':appearance.foreground,'--lyric-hl':appearance.highlight,'--lyric-panel':rgba(appearance.background,appearance.opacity),'--lyric-panel-active':rgba(appearance.background,Math.max(appearance.opacity,.6))}}>
    {appearance.locked
      ?<button className="lyric-unlock" aria-label="解锁桌面歌词" title="解锁桌面歌词" onMouseEnter={()=>passThrough(false)} onMouseLeave={()=>passThrough(true)} onClick={()=>update({locked:false})}><LockSimple size={17} weight="fill"/></button>
      :<header><span>{data.title}</span><div>
        <button onClick={()=>update({fontSize:Math.max(18,appearance.fontSize-2)})} aria-label="缩小桌面歌词">A−</button>
        <button onClick={()=>update({fontSize:Math.min(56,appearance.fontSize+2)})} aria-label="放大桌面歌词">A＋</button>
        <button aria-label="歌词颜色" aria-expanded={colors} onClick={()=>setColors(!colors)}><Palette size={18}/></button>
        <button aria-label="锁定桌面歌词" title="锁定后背景透明，鼠标可穿透" onClick={()=>update({locked:true})}><LockSimpleOpen size={18}/></button>
        <button onClick={()=>window.desktop?.closeLyrics?.()} aria-label="关闭桌面歌词"><X size={18}/></button>
      </div></header>}
    {colors&&<div className="lyric-colors">
      <label>文字<input type="color" aria-label="歌词文字颜色" value={appearance.foreground} onChange={e=>update({foreground:e.target.value})}/></label>
      <label>已唱<input type="color" aria-label="已唱歌词颜色" value={appearance.highlight} onChange={e=>update({highlight:e.target.value})}/></label>
      <label>背景<input type="color" aria-label="歌词背景颜色" value={appearance.background} onChange={e=>update({background:e.target.value})}/></label>
      <label className="lyric-opacity">常驻背景<input type="range" aria-label="常驻背景不透明度" min="0" max="90" step="5" value={Math.round(appearance.opacity*100)} onChange={e=>update({opacity:Number(e.target.value)/100})}/></label>
    </div>}
    <p ref={lineRef} className="lyric-line" data-karaoke={data.start!=null} style={{fontSize:appearance.fontSize}}><span className="lyric-text"><span>{text}</span><span className="lyric-sung" aria-hidden="true">{text}</span></span></p>
    <small style={{fontSize:Math.max(14,appearance.fontSize*.5)}}>{data.next}</small>
    {!appearance.locked&&<><i className="lyric-resize" data-edge="left" onPointerDown={e=>startDrag(e,'left')}/><i className="lyric-resize" data-edge="right" onPointerDown={e=>startDrag(e,'right')}/></>}
  </main>;
}
