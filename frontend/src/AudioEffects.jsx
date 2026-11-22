import React, { useEffect, useRef, useState } from 'react';

import {frequencies,equalizerConfig} from './equalizer.mjs';
export {default as AudioEffects} from './EqualizerPanel';


export function useAudioEffects(audioRef){
  const [config,setConfig]=useState(()=>{try{return equalizerConfig(JSON.parse(localStorage.getItem('musicplatform-eq')||'{}'));}catch{return equalizerConfig();}});
  const graph=useRef(null),[error,setError]=useState('');
  function updateGraph(value){const g=graph.current;if(!g)return;g.filters.forEach((node,i)=>node.gain.setTargetAtTime(value.enabled?Number(value.gains[i] || 0):0,g.context.currentTime,.03));g.gain.gain.setTargetAtTime(value.enabled?10**(value.preamp/20):1,g.context.currentTime,.03);}
  async function prepare(){
    try{
      if(!graph.current){const Context=window.AudioContext || window.webkitAudioContext;if(!Context)throw Error('当前播放环境不支持音效处理');const context=new Context(),input=context.createMediaElementSource(audioRef.current),gain=context.createGain();const filters=frequencies.map((frequency,i)=>{const node=context.createBiquadFilter();node.type=i===0?'lowshelf':i===frequencies.length-1?'highshelf':'peaking';node.frequency.value=frequency;node.Q.value=1;return node;});let previous=input;for(const filter of filters){previous.connect(filter);previous=filter;}previous.connect(gain);const analyser=context.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.8;gain.connect(analyser);const fader=context.createGain();analyser.connect(fader);fader.connect(context.destination);graph.current={context,input,filters,gain,analyser,fader};updateGraph(config);}
      if(graph.current.context.state==='suspended')await graph.current.context.resume();setError('');
    }catch(e){setError(e.message);}
  }
  useEffect(()=>{localStorage.setItem('musicplatform-eq',JSON.stringify(config));updateGraph(config);},[config]);
  // 暂停、继续时把音量在 seconds 秒内渐变到 level（0 静音，1 原音量），返回渐变结束的 Promise。
  // 音频链路还没建立时直接返回，调用方照常暂停或播放。
  function fade(level,seconds=0){
    const g=graph.current;if(!g)return Promise.resolve();
    const param=g.fader.gain,now=g.context.currentTime;
    param.cancelScheduledValues(now);param.setValueAtTime(param.value,now);
    if(seconds<=0||g.context.state!=='running'){param.setValueAtTime(level,now);return Promise.resolve();}
    param.linearRampToValueAtTime(level,now+seconds);
    return new Promise(resolve=>setTimeout(resolve,seconds*1000));
  }
  // The analyser sits after the equalizer, so the spectrum shows what is actually heard; the fader comes after it,
  // so fading out does not flatten the visualizer before the pause.
  return {config,setConfig,prepare,fade,error,analyser:()=>graph.current?.analyser||null};
}

