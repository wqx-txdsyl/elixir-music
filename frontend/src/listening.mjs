// Count elapsed listening, not song position. Seeking, buffering, suspended
// timers and playback speed must not inflate listening duration.
export class ListeningMeter {
  constructor(){this.total=0;this.previous=null;}
  sample({now,position,rate=1,active}){
    const before=this.previous;this.previous={now,position,rate,active};
    if(!before?.active||!active)return this.total;
    const wall=now-before.now,movement=(position-before.position)*1000;
    if(wall<=0||wall>5000||rate<=0||rate!==before.rate||movement<=0||movement>wall*rate+750)return this.total;
    this.total+=Math.min(wall,movement/rate);
    return this.total;
  }
}

export function listeningTime(ms){const seconds=Math.max(0,Math.floor((Number(ms)||0)/1000));return seconds>=3600?`${Math.floor(seconds/3600)}小时${Math.floor(seconds%3600/60)}分`:seconds>=60?`${Math.floor(seconds/60)}分${seconds%60}秒`:`${seconds}秒`;}
