import React, { useEffect, useRef, useState } from 'react';

import {frequencies,equalizerConfig} from './equalizer.mjs';
export {default as AudioEffects} from './EqualizerPanel';


export function useAudioEffects(audioRef){
  const [config,setConfig]=useState(()=>{try{return equalizerConfig(JSON.parse(localStorage.getItem('musicplatform-eq')||'{}'));}catch{return equalizerConfig();}});
  const graph=useRef(null),[error,setError]=useState('');
  function updateGraph(value){const g=graph.current;if(!g)return;g.filters.forEach((node,i)=>node.gain.setTargetAtTime(value.enabled?Number(value.gains[i] || 0):0,g.context.currentTime,.03));g.gain.gain.setTargetAtTime(value.enabled?10**(value.preamp/20):1,g.context.currentTime,.03);}
  async function prepare(){
    try{
      if(!graph.current){const Context=window.AudioContext || window.webkitAudioContext;if(!Context)throw Error('当前播放环境不支持音效处理');const context=new Context(),input=context.createMediaElementSource(audioRef.current),gain=context.createGain();const filters=frequencies.map((frequency,i)=>{const node=context.createBiquadFilter();node.type=i===0?'lowshelf':i===frequencies.length-1?'highshelf':'peaking';node.frequency.value=frequency;node.Q.value=1;return node;});let previous=input;for(const filter of filters){previous.connect(filter);previous=filter;}previous.connect(gain);const analyser=context.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.8;gain.connect(analyser);analyser.connect(context.destination);graph.current={context,input,filters,gain,analyser};updateGraph(config);}
      if(graph.current.context.state==='suspended')await graph.current.context.resume();setError('');
    }catch(e){setError(e.message);}
  }
  useEffect(()=>{localStorage.setItem('musicplatform-eq',JSON.stringify(config));updateGraph(config);},[config]);
  // The analyser sits after the equalizer, so the spectrum shows what is actually heard.
  return {config,setConfig,prepare,error,analyser:()=>graph.current?.analyser||null};
}

