import React,{useEffect,useRef,useState} from 'react';
import {usePlaybackPosition} from './usePlaybackPosition';

// The fill is a CSS animation started once with the word's elapsed time, so it stays smooth between clock ticks.
function SingingWord({word,position,playing}){
  const [delay]=useState(()=>Math.min(0,word.time-position));
  return <span className="lyric-word singing" style={{'--word-duration':word.duration+'s','--word-delay':delay+'s',animationPlayState:playing?'running':'paused'}}>{word.text}</span>;
}
function WordLine({words,position,playing}){
  return words.map((word,k)=>position>=word.time+word.duration?<span key={'d'+k} className="lyric-word sung">{word.text}</span>:position>=word.time?<SingingWord key={'s'+k} word={word} position={position} playing={playing}/>:<span key={'w'+k} className="lyric-word">{word.text}</span>);
}

// Follows the playing line by scrolling only the lyric pane, and stays put for a few seconds after the listener scrolls.
export default function LyricLines({lines,active,playing,onSeek,children}){
  const position=usePlaybackPosition(),root=useRef(null),currentLine=useRef(null),heldUntil=useRef(0);
  let index=-1;
  if(active)for(let i=0;i<lines.length;i++){if(lines[i].time<=position)index=i;else break;}
  useEffect(()=>{
    const pane=root.current?.closest('.lyrics-scroll');if(!pane)return;
    const hold=e=>{if(e.type==='pointerdown'&&e.target.closest('button'))return;heldUntil.current=Date.now()+3000;};
    pane.addEventListener('wheel',hold,{passive:true});pane.addEventListener('pointerdown',hold);pane.addEventListener('keydown',hold);
    return()=>{pane.removeEventListener('wheel',hold);pane.removeEventListener('pointerdown',hold);pane.removeEventListener('keydown',hold);};
  },[]);
  useEffect(()=>{
    const pane=root.current?.closest('.lyrics-scroll'),line=currentLine.current;
    if(!pane||!line||!playing||Date.now()<heldUntil.current)return;
    const box=pane.getBoundingClientRect(),rect=line.getBoundingClientRect(),behavior=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
    // Vertical lyrics run right to left, so the pane scrolls sideways instead.
    if(getComputedStyle(root.current).writingMode.startsWith('vertical'))pane.scrollTo({left:pane.scrollLeft+rect.left-box.left-(box.width-rect.width)/2,behavior});
    else pane.scrollTo({top:pane.scrollTop+rect.top-box.top-(box.height-rect.height)/2,behavior});
  },[index]);
  return <div className="lyric-lines" ref={root}>{children}{lines.map((line,i)=><button key={i} className={i===index?(line.words?'current has-words':'current'):''} ref={i===index?currentLine:undefined} onClick={()=>onSeek(line)} title="点击跳转到该歌词">{i===index&&line.words?<WordLine words={line.words} position={position} playing={playing}/>:line.text}{line.translation&&<small className="lyric-translation">{line.translation}</small>}</button>)}</div>;
}
