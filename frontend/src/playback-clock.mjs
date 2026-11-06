// Playback position changes several times a second; keeping it outside React state
// lets only the progress bar and lyric views re-render instead of the whole app.
export function createClock(initial=0){
  let position=Math.max(0,Number(initial)||0);
  const listeners=new Set();
  return {
    get:()=>position,
    set(value){const next=Math.max(0,Number(value)||0);if(next===position)return;position=next;for(const listener of listeners)listener();},
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
  };
}
export const playbackClock=createClock();
