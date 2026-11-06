import {useEffect,useRef} from 'react';
import {usePlaybackPosition} from './usePlaybackPosition';

// Desktop lyrics animate the current line themselves; only line changes, play state and seeks are sent.
export default function DesktopLyricSync({current,lyric,interlude,playing,buffering,speed,duration,lyricOffset}){
  const position=usePlaybackPosition(),last=useRef(null);
  useEffect(()=>{
    if(!window.desktop?.updateLyrics)return;const offset=Number(localStorage.getItem('lyric-offset:'+current?.id) || 0);let index=-1;for(let i=0;i<lyric.length;i++){if(lyric[i].time+offset<=position)index=i;else break;}
    const line=interlude?null:lyric[index],following=lyric[index+1],start=line?line.time+offset:null;
    const end=line?(following?following.time+offset:Math.max(start+1,duration||start+5)):null;
    const payload={title:interlude?.title||(current?current.title+' · '+current.artist:'桌面歌词'),line:interlude?(interlude.ad?'广告中':'插播中')+(duration?'，还剩 '+Math.max(0,Math.ceil(duration-position))+' 秒':''):index>=0?lyric[index].text:lyric[0]?.text || (current?'暂无同步歌词':'播放音乐后显示歌词'),next:interlude?'':lyric[index+1]?.text || '',start,end,words:line?.words?line.words.map(word=>[word.time+offset,word.duration,[...word.text].length]):null,position,playing:playing&&!buffering,rate:current?.source==='spotify'?1:speed,at:Date.now()};
    const previous=last.current,expected=previous?previous.position+(previous.playing?(payload.at-previous.at)/1000*previous.rate:0):0;
    if(previous&&['title','line','next','start','end','playing','rate'].every(k=>previous[k]===payload[k])&&Math.abs(expected-position)<.75)return;
    last.current=payload;window.desktop.updateLyrics(payload).catch(()=>{});
  },[current?.id,position,lyric,lyricOffset,interlude,playing,buffering,speed,duration]);
  return null;
}
