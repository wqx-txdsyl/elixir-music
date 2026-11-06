import React,{useEffect,useRef} from 'react';
import {bandLevels,logBands,settle,simulatedLevels} from './visualizer-math.mjs';
import './visualizer.css';

const COUNT={bars:48,wave:48,ring:64};
// Must match the negative inset of .visualizer-ring in visualizer.css.
const RING_MARGIN=44;

// Draws straight to a canvas from requestAnimationFrame; React only mounts it.
export default function Visualizer({mode,getAnalyser,simulated,playing,className=''}){
  const canvas=useRef(null),live=useRef(null),control=useRef(null);
  live.current={playing,simulated,getAnalyser};
  useEffect(()=>{
    const el=canvas.current;if(!el)return;
    const ctx=el.getContext('2d'),count=COUNT[mode]||48,levels=new Float32Array(count),target=new Float32Array(count);
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let bands=null,data=null,raf=0,last=0,color='#888',width=0,height=0,dpr=1;
    function read(now){
      const {playing,simulated,getAnalyser}=live.current;
      if(!playing){target.fill(0);return;}
      if(simulated){simulatedLevels(count,now/1000,target);return;}
      const analyser=getAnalyser?.();if(!analyser){target.fill(0);return;}
      if(!data||data.length!==analyser.frequencyBinCount){data=new Uint8Array(analyser.frequencyBinCount);bands=logBands(count,analyser.context.sampleRate,analyser.fftSize);}
      analyser.getByteFrequencyData(data);bandLevels(data,bands,target);
    }
    function draw(){
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      if(width<4||height<4)return;
      ctx.fillStyle=ctx.strokeStyle=color;
      if(mode==='ring'){
        const cx=width/2,cy=height/2,inner=Math.min(cx,cy)-RING_MARGIN+4,length=RING_MARGIN-10,spokes=count*2;
        ctx.lineCap='round';ctx.lineWidth=Math.max(2,Math.PI*2*inner/spokes*.42);
        for(let i=0;i<spokes;i++){
          const value=levels[i<count?i:spokes-1-i],angle=-Math.PI/2+i/spokes*Math.PI*2,outer=inner+3+value*length;
          ctx.globalAlpha=.3+.7*value;ctx.beginPath();ctx.moveTo(cx+Math.cos(angle)*inner,cy+Math.sin(angle)*inner);ctx.lineTo(cx+Math.cos(angle)*outer,cy+Math.sin(angle)*outer);ctx.stroke();
        }
      }else if(mode==='wave'){
        const mid=height/2,points=Array.from(levels,(value,i)=>[i/(count-1)*width,Math.max(1,value*mid*.92)]);
        ctx.beginPath();ctx.moveTo(0,mid);
        for(let i=0;i<count-1;i++){const [x0,a]=points[i],[x1,b]=points[i+1];ctx.quadraticCurveTo(x0,mid-a,(x0+x1)/2,mid-(a+b)/2);}
        ctx.lineTo(width,mid);
        for(let i=count-1;i>0;i--){const [x0,a]=points[i],[x1,b]=points[i-1];ctx.quadraticCurveTo(x0,mid+a,(x0+x1)/2,mid+(a+b)/2);}
        ctx.closePath();ctx.globalAlpha=.28;ctx.fill();ctx.globalAlpha=.9;ctx.lineWidth=1.5;ctx.stroke();
      }else{
        const gap=Math.min(Math.max(2,width/count*.35),width/count*.5),bar=Math.max(1,(width-gap*(count-1))/count),radius=Math.max(0,Math.min(bar/2,3));
        for(let i=0;i<count;i++){const h=Math.max(2,levels[i]*height);ctx.globalAlpha=.35+.65*levels[i];ctx.beginPath();ctx.roundRect(i*(bar+gap),height-h,bar,h,[radius,radius,0,0]);ctx.fill();}
      }
      ctx.globalAlpha=1;
    }
    function frame(now){
      raf=0;const dt=Math.min(.1,(now-last)/1000);last=now;
      read(now);settle(levels,target,dt);draw();
      if((live.current.playing||levels.some(v=>v>.003))&&!document.hidden)raf=requestAnimationFrame(frame);
    }
    function start(){if(raf||reduced||document.hidden)return;last=performance.now();raf=requestAnimationFrame(frame);}
    function resize(){
      dpr=window.devicePixelRatio||1;const rect=el.getBoundingClientRect();width=rect.width;height=rect.height;
      el.width=Math.max(1,Math.round(width*dpr));el.height=Math.max(1,Math.round(height*dpr));
      color=getComputedStyle(el).getPropertyValue('--accent').trim()||color;draw();start();
    }
    const observer=new ResizeObserver(resize);observer.observe(el);
    document.addEventListener('visibilitychange',start);control.current={start};
    return()=>{observer.disconnect();document.removeEventListener('visibilitychange',start);cancelAnimationFrame(raf);control.current=null;};
  },[mode]);
  useEffect(()=>{control.current?.start();},[playing,simulated]);
  return <canvas ref={canvas} className={'visualizer '+className} aria-hidden="true"/>;
}
