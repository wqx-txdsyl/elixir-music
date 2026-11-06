// Only the device registered by this application's audio window owns this UI.
export function ownedSpotifySnapshot(state={},fallbackDeviceId=''){
  const deviceId=state.owned_device_id||fallbackDeviceId;
  const owned=!!deviceId&&state.device?.id===deviceId;
  if(!owned)return {owned:false,playing:false,position_ms:0,duration_ms:0,track:null};
  const id=state.track_id||state.track?.source_id;
  const duration=Math.max(0,Number(state.duration_ms)||0);
  let position=Math.max(0,Number(state.position_ms)||0);
  const sample=state.owned_media_sample;
  const local=!!(sample&&sample.device_id===deviceId&&Number.isFinite(sample.observed_at)&&Date.now()-sample.observed_at>=0&&Date.now()-sample.observed_at<5000&&Number.isFinite(sample.position_ms)&&sample.position_ms>=0&&Number.isFinite(sample.duration_ms)&&sample.duration_ms>0&&(!duration||Math.abs(duration-sample.duration_ms)<1500));
  const normalize=value=>String(value||'').normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase();
  const mismatch=local&&sample.title&&state.track?.title&&normalize(sample.title)!==normalize(state.track.title);
  if(mismatch)return {owned:true,playing:false,position_ms:0,duration_ms:duration,track:null,media_mismatch:true};
  if(local)position=sample.position_ms;
  return {
    owned:true,
    playing:!!(state.playing??state.is_playing)&&state.is_paused!==true&&state.owned_media_playing!==false&&!state.owned_license_error&&(!local||!sample.paused&&!sample.ended&&sample.ready_state>=3),
    position_ms:duration?Math.min(position,duration):position,
    duration_ms:duration,
    track:/^[A-Za-z0-9]{22}$/.test(id||'')?{...(state.track||{}),id:'spotify:'+id,source:'spotify',source_id:id,duration_ms:duration}:null,
    local_media:local?sample:null,media:state.now_playing||null,
  };
}

export function spotifyClockPosition(clock,now){
  const elapsed=clock.playing?Math.min(15000,Math.max(0,now-clock.at)):0;
  const position=Math.max(0,(clock.position_ms||0)+elapsed);
  return clock.duration_ms?Math.min(position,clock.duration_ms):position;
}

// Repeated reference-clock samples must not reset the animation to an older
// position. Explicit user seeks and track/pause changes always start a new clock.
export function reconcileSpotifyClock(clock,snapshot,now,discontinuity=false){
  const trackId=snapshot.track?.id||(snapshot.owned?'non-track:'+snapshot.duration_ms:'');
  const continuing=!discontinuity&&snapshot.playing&&clock.playing&&trackId===clock.track_id;
  let position=snapshot.position_ms;
  if(continuing&&!snapshot.local_media){
    if(position===clock.observed_position_ms)return {...clock,duration_ms:snapshot.duration_ms};
    const projected=spotifyClockPosition(clock,now),lag=projected-position;
    if(lag>0&&lag<=4000)position=projected;
  }
  return {position_ms:position,observed_position_ms:snapshot.position_ms,
    duration_ms:snapshot.duration_ms,at:now,playing:snapshot.playing,track_id:trackId};
}

// The queue entry that should follow `currentId` when it ends. Shuffle is drawn at the end, so it is never queued ahead.
export function followingTrack(queue,currentId,mode){
  const index=queue.findIndex(t=>t.id===currentId);
  if(index<0||mode==='shuffle')return null;
  if(mode==='single')return queue[index];
  if(mode==='once'&&index===queue.length-1)return null;
  return queue[(index+1)%queue.length];
}

// What the end of a Spotify song needs from Elixir. `previous` is the last owned sample with its local time `at`;
// 'continued' means Spotify moved on to the track Elixir queued, 'advance' means Elixir must start its next song itself.
export function spotifyHandoff(previous,snapshot,queued,now){
  if(!previous?.id||!previous.duration_ms||!snapshot?.owned)return 'none';
  const projected=previous.position_ms+(previous.playing?Math.max(0,now-previous.at):0);
  if(previous.duration_ms-projected>3000)return 'none';
  const id=snapshot.track?.id;
  if(id&&id!==previous.id)return queued?.after===previous.id&&queued.id===id?'continued':'advance';
  if(id===previous.id&&previous.playing&&!snapshot.playing)return 'advance';
  return 'none';
}
