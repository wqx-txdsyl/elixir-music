import React,{useEffect,useRef,useState} from 'react';
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

// The only part of the bar that follows the playback clock.
function PlaybackProgress({duration,disabled,onSeek,onSeekEnd}){
  const position=usePlaybackPosition();
  return <div className="progress-row"><span>{formatDuration(position*1000)}</span><input type="range" aria-label="播放进度" min="0" max={duration||1} step="0.1" value={Math.min(position,duration||1)} disabled={disabled} onChange={e=>onSeek(Number(e.target.value))} onPointerUp={e=>onSeekEnd(Number(e.currentTarget.value))} style={{'--range':(duration?position/duration*100:0)+'%'}}/><span>{formatDuration(duration*1000)}</span></div>;
}

// Ads and other inserts cannot be skipped, so the bar counts down to the next song instead.
function InterludeHint({interlude,duration}){
  const position=usePlaybackPosition(),left=Math.max(0,Math.ceil(duration-position));
  return <>{(interlude.ad?'广告中':'插播中')+(duration?'，还剩 '+left+' 秒':'')+(interlude.artist?' · '+interlude.artist:'')}</>;
}

export default function PlayerBar({current,interlude,playHint,liked,playing,buffering,playMode,queueLength,queueOpen,duration,volume,quality,desktopLyrics,onOpenDetail,onToggleLike,onPlayMode,onSkip,onToggle,onSeek,onSeekEnd,onQualityChange,onDesktopLyrics,onVolume,onVolumeEnd,onQueue}){
  return <footer className="player">
    <div className="now-playing"><button className="now-cover" disabled={!!interlude} onClick={()=>current&&onOpenDetail(current)}><Cover src={interlude?interlude.cover:current?.cover} title={interlude?.title||current?.title}/><CaretDown size={16}/></button><div className="now-title"><button disabled={!!interlude} onClick={()=>current&&onOpenDetail(current)}>{interlude?.title||current?.title||'未在播放'}</button><span title={playHint}>{interlude?<InterludeHint interlude={interlude} duration={duration}/>:playHint||current?.artist||(current?'':'选择一首音乐，开始聆听')}</span></div><IconButton icon={Heart} title="喜欢当前歌曲" active={current&&liked.has(current.id)} disabled={!current||!!interlude} onClick={()=>onToggleLike(current)}/></div>
    <div className="player-center">
      <div className="player-controls"><IconButton icon={playMode==='shuffle'?Shuffle:playMode==='single'?RepeatOnce:Repeat} title={modeTitles[playMode]} active={playMode!=='once'} onClick={()=>onPlayMode(nextMode[playMode])}/><IconButton icon={SkipBack} title="上一首 · Ctrl ←" onClick={()=>onSkip(-1)} disabled={!queueLength||!!interlude}/><button className="play-main" title={playing?'暂停 · 空格':'播放 · 空格'} aria-label={playing?'暂停':'播放'} onClick={onToggle}>{buffering?<CircleNotch className="spin" size={24}/>:playing?<Pause size={23} weight="fill"/>:<Play size={23} weight="fill"/>}</button><IconButton icon={SkipForward} title="下一首 · Ctrl →" onClick={()=>onSkip(1)} disabled={!queueLength||!!interlude}/><IconButton icon={MicrophoneStage} title="歌词" disabled={!current||!!interlude} onClick={()=>onOpenDetail(current)}/></div>
      <PlaybackProgress duration={duration} disabled={!duration||!!interlude} onSeek={onSeek} onSeekEnd={onSeekEnd}/>
    </div>
    <div className="player-right"><QualityMenu quality={quality} onChange={onQualityChange}/>{onDesktopLyrics&&<button className={'desktop-lyrics-toggle'+(desktopLyrics?' active':'')} title={desktopLyrics?'关闭桌面歌词':'打开桌面歌词'} aria-label="桌面歌词" aria-pressed={!!desktopLyrics} onClick={onDesktopLyrics}>词</button>}<IconButton icon={volume?SpeakerHigh:SpeakerSlash} title="静音 / 恢复音量" onClick={()=>{const value=volume?0:0.7;onVolume(value);onVolumeEnd(value);}}/><input className="volume-slider" aria-label="音量" type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>onVolume(Number(e.target.value))} onPointerUp={e=>onVolumeEnd(Number(e.currentTarget.value))} style={{'--range':volume*100+'%'}}/><span className="player-divider"/><IconButton icon={Queue} title={'播放队列 · '+queueLength} active={queueOpen} onClick={onQueue}/><span className="queue-count">{queueLength}</span></div>
  </footer>;
}
