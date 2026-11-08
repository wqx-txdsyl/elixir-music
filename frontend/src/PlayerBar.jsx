import React,{useEffect,useMemo,useRef,useState} from 'react';
import {PlayerLyric} from './Parts';
import {CaretDown,Check,CircleNotch,Heart,MicrophoneStage,Pause,Play,Queue,Repeat,RepeatOnce,Shuffle,SkipBack,SkipForward,SpeakerHigh,SpeakerSlash} from '@phosphor-icons/react';
import {formatDuration} from './api';
import {Cover,IconButton} from './ui';
import {usePlaybackPosition} from './usePlaybackPosition';

const modeTitles={list:'列表循环',single:'单曲循环',shuffle:'随机播放',once:'顺序播放'};
const nextMode={list:'single',single:'shuffle',shuffle:'once',once:'list'};
const qualityLabels={standard:'标准',higher:'高品',exhigh:'极高',lossless:'无损'};
const qualityNames={standard:'标准音质',higher:'较高音质',exhigh:'极高音质',lossless:'无损音质'};

// Picks the preferred quality in place instead of sending the listener to the settings page.
function QualityMenu({quality,onChange}){
  const [open,setOpen]=useState(false),root=useRef(null);
  useEffect(()=>{
    if(!open)return;
    const close=e=>{if(!root.current?.contains(e.target))setOpen(false);},key=e=>{if(e.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};
  },[open]);
  return <div className="quality-menu" ref={root}>
    <button className="quality-button" title="优先音质" aria-label={'优先音质：'+(qualityLabels[quality]||'标准')} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(!open)}>{qualityLabels[quality]||'标准'}</button>
    {open&&<div className="quality-popover" role="menu" aria-label="优先音质">
      {Object.entries(qualityNames).map(([value,name])=><button key={value} role="menuitemradio" aria-checked={(quality||'standard')===value} onClick={()=>{onChange(value);setOpen(false);}}>{name}{(quality||'standard')===value&&<Check size={15}/>}</button>)}
      <small>从下一首开始生效，实际音质以平台授权为准</small>
    </div>}
  </div>;
}

// A SoundCloud-like outline drawn from the track id, so the same song always has the same shape.
function waveShape(seed,count=96){
  let h=2166136261;for(const c of String(seed||'elixir'))h=Math.imul(h^c.charCodeAt(0),16777619);
  const rand=()=>{h^=h<<13;h^=h>>>17;h^=h<<5;return ((h>>>0)%1000)/1000;};
  const out=[];let level=.5;
  for(let i=0;i<count;i++){level=Math.min(1,Math.max(.18,level+(rand()-.5)*.42));const envelope=.55+.45*Math.sin(Math.PI*i/count);out.push(Math.max(.14,level*envelope));}
  return out;
}

// The only part of the bar that follows the playback clock.
// One tick per lyric line; lines sung more than once (usually the chorus) stand taller.
function lyricMarks(lines,duration){
  if(!lines?.length||!duration)return [];
  const text=line=>(line.text??line.words?.map(w=>w.text).join('')??'').trim(),seen=new Map();
  lines.forEach(line=>{const t=text(line);if(t&&t!=='♪')seen.set(t,(seen.get(t)||0)+1);});
  return lines.filter(line=>line.time>0&&line.time<duration&&text(line)).map(line=>({at:line.time/duration*100,time:line.time,chorus:seen.get(text(line))>1}));
}
function PlaybackProgress({duration,disabled,onSeek,onSeekEnd,trackId,marks,chorus}){
  const clock=usePlaybackPosition(),shape=useMemo(()=>waveShape(trackId),[trackId]),ticks=useMemo(()=>lyricMarks(marks,duration),[marks,duration]);
  // 拖动期间显示手里的位置，不让播放时钟把滑块拉回去；松手（哪怕松在进度条外）或键盘调整时才真正跳转。
  const [draft,setDraft]=useState(null),dragging=useRef(false);
  useEffect(()=>{setDraft(null);dragging.current=false;},[trackId]);
  const position=draft??clock,done=duration?position/duration:0;
  const commit=value=>{dragging.current=false;setDraft(null);onSeekEnd(value);};
  const release=e=>{if(dragging.current)commit(Number(e.currentTarget.value));};
  return <div className="progress-row"><span>{formatDuration(position*1000)}</span>
    <div className="progress-track">
      {chorus&&duration>0&&chorus.start<duration&&<div className="chorus-marks">
        <i className="chorus-range" style={{left:chorus.start/duration*100+'%',width:(Math.min(chorus.end,duration)-chorus.start)/duration*100+'%'}}/>
        <button type="button" className={'chorus-dot'+(position>=chorus.start?' passed':'')} style={{left:chorus.start/duration*100+'%'}} disabled={disabled} title={'副歌 '+formatDuration(chorus.start*1000)+'，点击跳转'} aria-label="跳到副歌" onClick={()=>{onSeek(chorus.start);onSeekEnd(chorus.start);}}/>
      </div>}
      {ticks.length>0&&<div className="lyric-marks" aria-hidden="true">{ticks.map((m,i)=><i key={i} className={(m.chorus?'chorus':'')+(m.time<=position?' passed':'')} style={{left:m.at+'%'}}/>)}</div>}
      <div className="waveform" aria-hidden="true">{shape.map((h,i)=><i key={i} className={i/shape.length<done?'played':undefined} style={{'--h':h}}/>)}</div>
      <input type="range" aria-label="播放进度" min="0" max={duration||1} step="0.1" value={Math.min(position,duration||1)} disabled={disabled}
        onPointerDown={e=>{dragging.current=true;e.currentTarget.setPointerCapture?.(e.pointerId);}}
        onChange={e=>{const value=Number(e.target.value);setDraft(value);onSeek(value);if(!dragging.current)commit(value);}}
        onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} style={{'--range':done*100+'%'}}/>
    </div>
    <span>{formatDuration(duration*1000)}</span></div>;
}
function ProgressTime({duration}){const position=usePlaybackPosition();return <span className="progress-time">{formatDuration(position*1000)} / {formatDuration(duration*1000)}</span>;}

// Ads and other inserts cannot be skipped, so the bar counts down to the next song instead.
function InterludeHint({interlude,duration}){
  const position=usePlaybackPosition(),left=Math.max(0,Math.ceil(duration-position));
  return <>{(interlude.ad?'广告中':'插播中')+(duration?'，还剩 '+left+' 秒':'')+(interlude.artist?' · '+interlude.artist:'')}</>;
}

export default function PlayerBar({chorus,current,interlude,playHint,liked,playing,buffering,playMode,queueLength,queueOpen,duration,volume,quality,desktopLyrics,onOpenDetail,onToggleLike,onPlayMode,onSkip,onToggle,onSeek,onSeekEnd,onQualityChange,onDesktopLyrics,onVolume,onVolumeEnd,onQueue,lyric,marks,children}){
  return <footer className="player">{children}
    <div className="now-playing"><button className="now-cover" disabled={!!interlude} onClick={()=>current&&onOpenDetail(current)}><Cover src={interlude?interlude.cover:current?.cover} title={interlude?.title||current?.title}/><CaretDown size={16}/></button><div className="now-title"><button disabled={!!interlude} onClick={()=>current&&onOpenDetail(current)}>{interlude?.title||current?.title||'未在播放'}</button>{lyric&&!interlude&&!playHint&&<PlayerLyric lines={lyric}/>}<span title={playHint}>{interlude?<InterludeHint interlude={interlude} duration={duration}/>:playHint||current?.artist||(current?'':'选择一首音乐，开始聆听')}</span></div><IconButton icon={Heart} title="喜欢当前歌曲" active={current&&liked.has(current.id)} disabled={!current||!!interlude} onClick={()=>onToggleLike(current)}/></div>
    <div className="player-center">
      <div className="player-controls"><IconButton icon={playMode==='shuffle'?Shuffle:playMode==='single'?RepeatOnce:Repeat} title={modeTitles[playMode]} active={playMode!=='once'} onClick={()=>onPlayMode(nextMode[playMode])}/><IconButton icon={SkipBack} title="上一首 · Ctrl ←" onClick={()=>onSkip(-1)} disabled={!queueLength||!!interlude}/><button className="play-main" title={playing?'暂停 · 空格':'播放 · 空格'} aria-label={playing?'暂停':'播放'} onClick={onToggle}>{buffering?<CircleNotch className="spin" size={24}/>:playing?<Pause size={23} weight="fill"/>:<Play size={23} weight="fill"/>}</button><IconButton icon={SkipForward} title="下一首 · Ctrl →" onClick={()=>onSkip(1)} disabled={!queueLength||!!interlude}/><IconButton icon={MicrophoneStage} title="歌词" disabled={!current||!!interlude} onClick={()=>onOpenDetail(current)}/></div>
      <PlaybackProgress trackId={current?.id} marks={marks} chorus={chorus} duration={duration} disabled={!duration||!!interlude} onSeek={onSeek} onSeekEnd={onSeekEnd}/>
    </div>
    <div className="player-right"><ProgressTime duration={duration}/><QualityMenu quality={quality} onChange={onQualityChange}/>{onDesktopLyrics&&<button className={'desktop-lyrics-toggle'+(desktopLyrics?' active':'')} title={desktopLyrics?'关闭桌面歌词':'打开桌面歌词'} aria-label="桌面歌词" aria-pressed={!!desktopLyrics} onClick={onDesktopLyrics}>词</button>}<IconButton icon={volume?SpeakerHigh:SpeakerSlash} title="静音 / 恢复音量" onClick={()=>{const value=volume?0:0.7;onVolume(value);onVolumeEnd(value);}}/><input className="volume-slider" aria-label="音量" type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>onVolume(Number(e.target.value))} onPointerUp={e=>onVolumeEnd(Number(e.currentTarget.value))} style={{'--range':volume*100+'%'}}/><span className="player-divider"/><IconButton icon={Queue} title={'播放队列 · '+queueLength} active={queueOpen} onClick={onQueue}/><span className="queue-count">{queueLength}</span></div>
  </footer>;
}
