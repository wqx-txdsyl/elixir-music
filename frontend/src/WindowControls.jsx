import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';

export default function WindowControls(){
  const [maximized,setMaximized]=useState(false);
  useEffect(()=>{
    let active=true;
    window.desktop?.getWindowState?.().then(state=>{if(active)setMaximized(!!state.maximized);}).catch(()=>{});
    const off=window.desktop?.onWindowState?.(state=>setMaximized(!!state.maximized));
    return()=>{active=false;off?.();};
  },[]);
  const action=type=>window.desktop?.window(type).catch(()=>{});
  return <><div className="caption-spacer" aria-hidden="true"/>{createPortal(<div className="window-controls native-window-controls">
    <button type="button" className="window-control" title="最小化" aria-label="最小化" onClick={()=>action('minimize')}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6.5h10"/></svg></button>
    <button type="button" className="window-control" title={maximized?'还原':'最大化'} aria-label={maximized?'还原窗口':'最大化窗口'} onClick={()=>action('maximize')}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">{maximized?<><path d="M3.5 3.5v-2h7v7h-2"/><rect x="1.5" y="3.5" width="7" height="7"/></>:<rect x="1.5" y="1.5" width="9" height="9"/>}</svg></button>
    <button type="button" className="window-control close-window" title="关闭" aria-label="关闭窗口" onClick={()=>action('close')}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m1.5 1.5 9 9m0-9-9 9"/></svg></button>
  </div>,document.body)}</>;
}
