import React,{useId,useRef,useState} from 'react';
import SelectMenu from './SelectMenu';
import {frequencies,presets} from './equalizer.mjs';
import './equalizer.css';

export default function EqualizerPanel({effects,remote}){
 const {config,setConfig,error}=effects,id=useId().replace(/:/g,''),drag=useRef(null);
 const [custom,setCustom]=useState(()=>{try{return JSON.parse(localStorage.getItem('elixir-eq-presets')||'{}');}catch{return {};}});
 const all={...presets,...custom},selected=Object.keys(all).find(name=>all[name].every((v,i)=>v===config.gains[i]))||'自定义';
 const points=config.gains.map((gain,i)=>[140+i*140,150-gain*10]);
 function change(i,value){setConfig(c=>({...c,gains:c.gains.map((v,j)=>j===i?Math.max(-12,Math.min(12,Math.round(value))):v)}));}
 function move(e){if(drag.current===null)return;const rect=e.currentTarget.getBoundingClientRect();change(drag.current,(150-(e.clientY-rect.top)*340/rect.height)/10);}
 function choose(e){const gains=all[e.target.value];if(gains)setConfig(c=>({...c,gains:[...gains],preamp:Math.min(0,-Math.max(...gains))}));}
 return <section className="settings-section eq-section eq-curve-section"><div className="eq-heading"><h2>均衡器</h2><button role="switch" aria-label="启用均衡器" aria-checked={config.enabled} className={'eq-switch '+(config.enabled?'on':'')} onClick={()=>setConfig(c=>({...c,enabled:!c.enabled}))}><span/></button></div>
 {remote&&<p className="workspace-note">Spotify 音频暂不支持均衡器</p>}{error&&<p role="alert" className="workspace-note">{error}</p>}
 <div className={'eq-curve-panel '+(!config.enabled?'eq-off':'')}><div className="eq-preset-picker"><label htmlFor={id}>预设</label><SelectMenu id={id} aria-label="均衡器预设" value={selected} onChange={choose}>{!all[selected]&&<option value="自定义">自定义</option>}{Object.keys(all).map(name=><option key={name} value={name}>{name}</option>)}</SelectMenu></div>
 <svg viewBox="0 0 900 340" className="eq-curve" onPointerMove={move} onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=null;}} aria-label="六段均衡器">
 <defs><linearGradient id={'eq-fill-'+id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".5"/><stop offset="1" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs>
 <text x="0" y="35">+12dB</text><text x="0" y="278">−12dB</text><path className="eq-grid" d="M70 150H900"/>{points.map(([x],i)=><path className="eq-grid" key={i} d={`M${x} 30V270`}/>)}
 <path fill={`url(#eq-fill-${id})`} d={`M140 270 L${points.map(p=>p.join(' ')).join(' L')} L840 270Z`}/><polyline className="eq-line" points={points.map(p=>p.join(',')).join(' ')}/>
 {points.map(([x,y],i)=><g key={i}><circle className="eq-point" cx={x} cy={y} r="5"/><circle className="eq-handle" cx={x} cy={y} r="14" role="slider" tabIndex="0" aria-label={`${frequencies[i]}Hz 增益`} aria-valuemin={-12} aria-valuemax={12} aria-valuenow={config.gains[i]} aria-valuetext={config.gains[i]+' dB'} onPointerDown={e=>{e.preventDefault();drag.current=i;e.currentTarget.ownerSVGElement.setPointerCapture(e.pointerId);}} onDoubleClick={()=>change(i,0)} onKeyDown={e=>{const delta={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1,PageUp:3,PageDown:-3}[e.key];if(delta||e.key==='Home'||e.key==='End'){e.preventDefault();change(i,e.key==='Home'?-12:e.key==='End'?12:config.gains[i]+delta);}}}><title>{frequencies[i]} Hz · {config.gains[i]} dB</title></circle><text x={x} y="313" textAnchor="middle">{frequencies[i]>=1000?frequencies[i]/1000+'KHz':frequencies[i]+'Hz'}</text></g>)}
 </svg><div className="eq-bottom"><details><summary>前级增益</summary><label className="eq-preamp"><output>{config.preamp} dB</output><input type="range" aria-label="前级增益" min="-18" max="6" step="1" value={config.preamp} onChange={e=>setConfig(c=>({...c,preamp:Number(e.target.value)}))}/></label></details><div><button className="button quiet" onClick={()=>{const name='自定义 '+(Object.keys(custom).length+1),next={...custom,[name]:[...config.gains]};setCustom(next);localStorage.setItem('elixir-eq-presets',JSON.stringify(next));}}>保存预设</button><button className="button quiet" onClick={()=>setConfig(c=>({...c,gains:frequencies.map(()=>0),preamp:0}))}>重置</button></div></div></div></section>;
}
