import {useEffect,useRef} from 'react';
import {api} from './api';
import {ListeningMeter} from './listening.mjs';

// Credit only fresh samples from this app's actual media element.
export function useSpotifyListeningHistory(privateSession){
 const record=useRef(null),privacy=useRef(privateSession);privacy.current=privateSession;
 function flush(finished=false){const r=record.current;if(!r||privacy.current)return;const total=Math.floor(r.meter.total);if(!total||total===r.sent&&!finished)return;r.sent=total;api('/api/history/listening',{method:'POST',keepalive:true,body:{session_id:r.sid,track_id:r.id,sequence:++r.sequence,listened_ms:total,finished}}).catch(()=>{r.sent=-1;});}
 useEffect(()=>{if(privateSession)record.current=null;return()=>{flush(true);record.current=null;};},[privateSession]);
 return snapshot=>{
  if(privacy.current)return;const media=snapshot.local_media,id=snapshot.track?.id;
  if(!media||!id)return;
  if(record.current?.id!==id){flush(true);record.current={id,meter:new ListeningMeter(),sid:crypto.randomUUID(),sequence:0,sent:0,lastReport:Date.now()};}
  const r=record.current,active=snapshot.playing&&!media.seeking&&!media.paused&&!media.ended&&media.ready_state>=3;
  r.meter.sample({now:media.observed_at,position:media.position_ms/1000,rate:media.rate||1,active});
  if(!active||Date.now()-r.lastReport>=10000){flush(media.ended);r.lastReport=Date.now();}
 };
}
