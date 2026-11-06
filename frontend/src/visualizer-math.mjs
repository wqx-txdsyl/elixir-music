// Groups FFT bins into log-spaced bands so the bass is not squeezed into a few bars.
export function logBands(count,sampleRate,fftSize,min=40,max=16000){
  const binHz=sampleRate/fftSize,bins=fftSize/2,top=Math.min(max,sampleRate/2),bands=[];
  for(let i=0;i<count;i++){
    const low=min*(top/min)**(i/count),high=min*(top/min)**((i+1)/count);
    const start=Math.min(bins-1,Math.floor(low/binHz)),end=Math.min(bins,Math.max(start+1,Math.ceil(high/binHz)));
    bands.push([start,end]);
  }
  return bands;
}
export function bandLevels(data,bands,out=new Float32Array(bands.length)){
  bands.forEach(([start,end],i)=>{let sum=0;for(let j=start;j<end;j++)sum+=data[j];out[i]=sum/((end-start)*255);});
  return out;
}
// Fast attack and slow release, like a level meter.
export function settle(levels,target,dt){
  const rise=Math.min(1,dt*18),fall=Math.min(1,dt*3.2);
  for(let i=0;i<levels.length;i++){const t=target[i];levels[i]+=(t-levels[i])*(t>levels[i]?rise:fall);}
  return levels;
}
// Spotify audio is DRM-protected, so this is stand-in motion rather than a spectrum.
export function simulatedLevels(count,time,out=new Float32Array(count)){
  const pulse=.55+.45*Math.max(0,Math.sin(time*Math.PI*4))**3;
  for(let i=0;i<count;i++){
    const tilt=1-i/count*.55,wobble=.5+.25*Math.sin(time*2.1+i*.7)+.25*Math.sin(time*3.7-i*1.3);
    out[i]=Math.max(0,Math.min(1,tilt*(.25+.55*wobble)*pulse));
  }
  return out;
}
