import React,{useEffect,useRef} from 'react';
import {bandLevels,logBands,settle,simulatedLevels} from './visualizer-math.mjs';
import './visualizer.css';

const COUNT={bars:48,wave:48,ring:64,mirror:40,dots:32};
// Must match the negative inset of .visualizer-ring in visualizer.css.
const RING_MARGIN=44;

// Point and outward normal at fraction t of a rounded square's perimeter (half size `half`, corner radius `r`), clockwise from the top centre.
function roundedSquare(half,r){
  r=Math.max(.01,Math.min(r,half));
  const straight=half-r,arc=Math.PI*r/2,corner=(cx,cy,a)=>[cx+Math.cos(a)*r,cy+Math.sin(a)*r,Math.cos(a),Math.sin(a)];
  const segments=[
    [straight,d=>[d,-half,0,-1]],
    [arc,d=>corner(straight,-straight,-Math.PI/2+d/r)],
    [2*straight,d=>[half,-straight+d,1,0]],
    [arc,d=>corner(straight,straight,d/r)],
    [2*straight,d=>[straight-d,half,0,1]],
    [arc,d=>corner(-straight,straight,Math.PI/2+d/r)],
    [2*straight,d=>[-half,straight-d,-1,0]],
    [arc,d=>corner(-straight,-straight,Math.PI+d/r)],
    [straight,d=>[-straight+d,-half,0,-1]],
  ];
  const perimeter=8*straight+4*arc;
  return {perimeter,at(t){let s=t*perimeter;for(const [len,point] of segments){if(s<=len)return point(s);s-=len;}return [0,-half,0,-1];}};
}

const WAVE_POINTS = 40;

function sampleWave(samples, sampleRate, trace, out) {
  const half = Math.floor(samples.length / 2);
  const stride = Math.min(half - 1, Math.floor(sampleRate * .016));
  const first = trace * half;
  const last = first + half - stride;
  // Anchor each short window to a rising zero crossing so steady sounds do not flicker with FFT frame timing.
  let start = last;
  for (let index = last; index > first; index--) {
    if (samples[index - 1] <= 0 && samples[index] > 0) { start = index; break; }
  }
  for (let point = 0; point < WAVE_POINTS; point++) {
    const from = start + Math.floor(point * stride / WAVE_POINTS);
    const to = start + Math.floor((point + 1) * stride / WAVE_POINTS);
    let sum = 0;
    for (let index = from; index < to; index++) sum += samples[index];
    out[point] = Math.max(-.94, Math.min(.94, 2.1 * sum / Math.max(1, to - from)));
  }
}

function drawWaveLines(ctx, traces, width, height, color) {
  const mid = height / 2;
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, 'transparent');
  gradient.addColorStop(.16, color);
  gradient.addColorStop(.84, color);
  gradient.addColorStop(1, 'transparent');
  ctx.strokeStyle = gradient;
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.75;
  for (const [index, trace] of traces.entries()) {
    const points = Array.from(trace, (level, i) => {
      const x = i / (WAVE_POINTS - 1);
      const edge = Math.sin(Math.PI * x);
      return [x * width, mid - level * mid * edge * (index ? .72 : 1)];
    });
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (let i = 1; i < points.length - 1; i++) {
      const [x, y] = points[i], [nextX, nextY] = points[i + 1];
      ctx.quadraticCurveTo(x, y, (x + nextX) / 2, (y + nextY) / 2);
    }
    ctx.lineTo(...points[points.length - 1]);
    ctx.globalAlpha = index ? .4 : .92;
    ctx.stroke();
  }
}

// Draws straight to a canvas from requestAnimationFrame; React only mounts it.
// `shape` only matters for the ring: 'circle' hugs a round cover, 'rounded' follows a square cover's corners,
// 'auto' measures the cover's real border radius so a skin that rounds it fully still gets a circle.
export default function Visualizer({mode,getAnalyser,simulated,playing,className='',shape='auto',lineWave=false,reduceMotion=false}){
  const canvas=useRef(null),live=useRef(null),control=useRef(null);
  live.current={playing,simulated,getAnalyser};
  useEffect(()=>{
    const el=canvas.current;if(!el)return;
    const ctx=el.getContext('2d'),count=COUNT[mode]||48,levels=new Float32Array(count),target=new Float32Array(count);
    const reduced=reduceMotion||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const waveform = mode === 'wave' && lineWave;
    const traces = waveform ? [new Float32Array(WAVE_POINTS), new Float32Array(WAVE_POINTS)] : [];
    const waveTargets = traces.map(() => new Float32Array(WAVE_POINTS));
    let waveSamples = null;
    let bands=null,data=null,raf=0,last=0,lastColorRead=0,color='#888',width=0,height=0,dpr=1,radius=12,round=shape==='circle';
    function read(now){
      const {playing,simulated,getAnalyser}=live.current;
      if (waveform) {
        const analyser = playing && !simulated ? getAnalyser?.() : null;
        if (!analyser?.getFloatTimeDomainData) {
          waveTargets.forEach(trace => trace.fill(0));
          return;
        }
        if (waveSamples?.length !== analyser.fftSize) waveSamples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(waveSamples);
        waveTargets.forEach((trace, index) => sampleWave(waveSamples, analyser.context.sampleRate, index, trace));
        return;
      }
      if(!playing){target.fill(0);return;}
      if(simulated){simulatedLevels(count,now/1000,target);return;}
      const analyser=getAnalyser?.();if(!analyser){target.fill(0);return;}
      if(!data||data.length!==analyser.frequencyBinCount){data=new Uint8Array(analyser.frequencyBinCount);bands=logBands(count,analyser.context.sampleRate,analyser.fftSize);}
      analyser.getByteFrequencyData(data);bandLevels(data,bands,target);
    }
    function draw(now = performance.now()){
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      if(width<4||height<4)return;
      if(waveform && now - lastColorRead >= 120) {
        color = getComputedStyle(el).color;
        lastColorRead = now;
      }
      ctx.fillStyle=ctx.strokeStyle=color;
      if(waveform) {
        drawWaveLines(ctx, traces, width, height, color);
      }else if(mode==='ring'){
        const cx=width/2,cy=height/2,inner=Math.min(cx,cy)-RING_MARGIN+4,length=RING_MARGIN-10,spokes=count*2;
        // Square covers get a ring that follows their rounded corners; round covers keep the circle.
        const square=round?null:roundedSquare(inner,radius+4),perimeter=square?square.perimeter:Math.PI*2*inner;
        ctx.lineCap='round';ctx.lineWidth=Math.max(2,perimeter/spokes*.42);
        for(let i=0;i<spokes;i++){
          const value=levels[i<count?i:spokes-1-i],t=i/spokes,reach=3+value*length;
          let x,y,nx,ny;
          if(square)[x,y,nx,ny]=square.at(t);
          else{const angle=-Math.PI/2+t*Math.PI*2;nx=Math.cos(angle);ny=Math.sin(angle);x=nx*inner;y=ny*inner;}
          ctx.globalAlpha=.3+.7*value;ctx.beginPath();ctx.moveTo(cx+x,cy+y);ctx.lineTo(cx+x+nx*reach,cy+y+ny*reach);ctx.stroke();
        }
      }else if(mode==='wave'){
        const mid=height/2,points=Array.from(levels,(value,i)=>[i/(count-1)*width,Math.max(1,value*mid*.92)]);
        ctx.beginPath();ctx.moveTo(0,mid);
        for(let i=0;i<count-1;i++){const [x0,a]=points[i],[x1,b]=points[i+1];ctx.quadraticCurveTo(x0,mid-a,(x0+x1)/2,mid-(a+b)/2);}
        ctx.lineTo(width,mid);
        for(let i=count-1;i>0;i--){const [x0,a]=points[i],[x1,b]=points[i-1];ctx.quadraticCurveTo(x0,mid+a,(x0+x1)/2,mid+(a+b)/2);}
        ctx.closePath();ctx.globalAlpha=.28;ctx.fill();ctx.globalAlpha=.9;ctx.lineWidth=1.5;ctx.stroke();
      }else if(mode==='mirror'){
        // Media Player style: bars grow up and down from the middle line, with a faint reflection.
        const mid=height/2,gap=Math.max(2,width/count*.3),bar=Math.max(1,(width-gap*(count-1))/count);
        for(let i=0;i<count;i++){const h=Math.max(1.5,levels[i]*mid*.95),x=i*(bar+gap);ctx.globalAlpha=.45+.55*levels[i];ctx.fillRect(x,mid-h,bar,h);ctx.globalAlpha=.18+.3*levels[i];ctx.fillRect(x,mid+1,bar,h*.8);}
      }else if(mode==='dots'){
        // A dot-matrix meter like Winamp and 千千静听: lit cells stack up, the top one holds a little longer.
        const rows=Math.max(4,Math.floor(height/7)),cell=Math.min(width/count,height/rows),size=Math.max(1.5,cell*.62),offsetX=(width-cell*count)/2;
        for(let i=0;i<count;i++){const lit=Math.round(levels[i]*rows);for(let r=0;r<rows;r++){const on=r<lit;ctx.globalAlpha=on?(r===lit-1?1:.55+.4*r/rows):.08;ctx.fillRect(offsetX+i*cell+(cell-size)/2,height-(r+1)*cell+(cell-size)/2,size,size);}}
      }else{
        const gap=Math.min(Math.max(2,width/count*.35),width/count*.5),bar=Math.max(1,(width-gap*(count-1))/count),radius=Math.max(0,Math.min(bar/2,3));
        for(let i=0;i<count;i++){const h=Math.max(2,levels[i]*height);ctx.globalAlpha=.35+.65*levels[i];ctx.beginPath();ctx.roundRect(i*(bar+gap),height-h,bar,h,[radius,radius,0,0]);ctx.fill();}
      }
      ctx.globalAlpha=1;
    }
    function frame(now){
      raf=0;const dt=Math.min(.1,(now-last)/1000);last=now;
      read(now);
      if (waveform) {
        const blend = 1 - Math.exp(-dt / .105);
        traces.forEach((trace, index) => {
          for (let i = 0; i < trace.length; i++) {
            const sample = waveTargets[index][i];
            const next = trace[i] + (sample - trace[i]) * blend;
            trace[i] = sample === 0 && Math.abs(next) < .008 ? 0 : next;
          }
        });
      } else settle(levels,target,dt);
      draw(now);
      const visible = waveform ? traces.some(trace => trace.some(value => Math.abs(value) > 0)) : levels.some(value => value > .003);
      if((live.current.playing||visible)&&!document.hidden)raf=requestAnimationFrame(frame);
    }
    function start(){if(raf||reduced||document.hidden)return;last=performance.now();raf=requestAnimationFrame(frame);}
    function resize(){
      dpr=window.devicePixelRatio||1;const rect=el.getBoundingClientRect();width=rect.width;height=rect.height;
      el.width=Math.max(1,Math.round(width*dpr));el.height=Math.max(1,Math.round(height*dpr));
      const style = getComputedStyle(el);
      color = waveform ? style.color : style.getPropertyValue('--accent').trim() || color;
      if(shape!=='circle'){
        const cover=el.parentElement?.querySelector('.large-cover'),size=cover?cover.getBoundingClientRect().width:0,raw=cover?getComputedStyle(cover).borderRadius.split(' ')[0]:'';
        radius=parseFloat(raw)||0;if(raw.endsWith('%'))radius=radius/100*size;
        round=shape==='auto'&&size>0&&radius>=size/2-1;if(!cover)radius=12;
      }
      draw();start();
    }
    const observer=new ResizeObserver(resize);observer.observe(el);
    document.addEventListener('visibilitychange',start);control.current={start};
    return()=>{observer.disconnect();document.removeEventListener('visibilitychange',start);cancelAnimationFrame(raf);control.current=null;};
  },[mode,shape,lineWave,reduceMotion]);
  useEffect(()=>{control.current?.start();},[playing,simulated]);
  return <canvas ref={canvas} className={'visualizer '+className} aria-hidden="true"/>;
}
