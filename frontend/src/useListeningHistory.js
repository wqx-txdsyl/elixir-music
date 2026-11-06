import {useEffect} from 'react';
import {api} from './api';
import {ListeningMeter} from './listening.mjs';

export function useListeningHistory(audioRef,trackId,requestId,privateSession){
  useEffect(()=>{
    const audio=audioRef.current;
    // Spotify's Connect reference clock is not proof of decoded local audio.
    if(!audio||!trackId||trackId.startsWith('spotify:')||privateSession)return;
    let meter=new ListeningMeter(),sessionId=crypto.randomUUID(),sequence=0,lastSent=0;
    function sample(){meter.sample({now:performance.now(),position:audio.currentTime,rate:audio.playbackRate,active:!audio.paused&&!audio.ended&&!audio.seeking&&audio.readyState>=3});}
    function flush(finished=false){
      sample();const total=Math.floor(meter.total);
      if(total<=0||total===lastSent&&!finished)return;
      lastSent=total;
      api('/api/history/listening',{method:'POST',keepalive:true,body:{session_id:sessionId,track_id:trackId,sequence:++sequence,listened_ms:total,finished}}).catch(()=>{lastSent=-1;});
    }
    const pulse=setInterval(sample,1000),report=setInterval(()=>flush(),10000);
    const pause=()=>flush(),end=()=>{flush(true);meter=new ListeningMeter();sessionId=crypto.randomUUID();sequence=0;lastSent=0;};
    const leave=()=>flush(true);
    audio.addEventListener('pause',pause);audio.addEventListener('ended',end);window.addEventListener('beforeunload',leave);
    return()=>{flush(true);clearInterval(pulse);clearInterval(report);audio.removeEventListener('pause',pause);audio.removeEventListener('ended',end);window.removeEventListener('beforeunload',leave);};
  },[audioRef,trackId,requestId,privateSession]);
}
