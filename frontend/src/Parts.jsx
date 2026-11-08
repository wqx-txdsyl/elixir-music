import React, { useEffect, useMemo, useState } from 'react';
import { Heart, Queue, MicrophoneStage } from '@phosphor-icons/react';
import { api, mediaUrl } from './api';
import { Cover, IconButton } from './ui';
import { usePlaybackPosition } from './usePlaybackPosition';

// A tiny window drawn from a skin's swatch: sidebar, page, cards and the player.
export function SkinPreview({ skin, className = '' }) {
  const s = skin.swatch;
  const player = skin.defaults?.player, sidebar = skin.defaults?.sidebar;
  return <span className={'skin-preview ' + className + (player === 'top' ? ' player-top' : '') + (player === 'float' ? ' player-float' : '') + (sidebar === 'hidden' ? ' no-side' : '') + (sidebar === 'float' ? ' side-float' : '')} aria-hidden="true"
    style={{ '--p-bg': s.bg, '--p-side': s.side, '--p-panel': s.panel, '--p-accent': s.accent, '--p-text': s.text }}>
    <i className="sp-side"><b /><b /><b /><b /></i>
    <i className="sp-main"><b className="sp-title" /><span><i /><i /><i /></span><b className="sp-line" /><b className="sp-line short" /></i>
    <i className="sp-player"><b /></i>
  </span>;
}

// Spotify's right-hand "now playing" view: artwork, the current lyric and what plays next.
export function NowPanel({ current, queue, upNext, liked, lyric, onOpenDetail, onToggleLike, onPlay, onQueue, onClose }) {
  const index = queue.findIndex(t => t.id === current?.id);
  const pinned = upNext.map(id => queue.find(t => t.id === id)).filter(Boolean);
  const following = [...pinned, ...queue.slice(index + 1).filter(t => !upNext.includes(t.id)), ...(index > 0 ? queue.slice(0, index) : [])].slice(0, 6);
  return <aside className="now-panel" aria-label="正在播放">
    <div className="now-panel-head"><span>正在播放</span><IconButton icon={Queue} title="打开播放队列" onClick={onQueue} /></div>
    {current ? <>
      <button className="now-panel-art" onClick={() => onOpenDetail(current)} aria-label={'查看《' + current.title + '》的歌词与资料'}><Cover src={current.cover} title={current.title} /></button>
      <div className="now-panel-title"><div><strong>{current.title}</strong><span>{[current.artist, current.album].filter(Boolean).join(' · ')}</span></div><IconButton icon={Heart} title="喜欢" active={liked.has(current.id)} onClick={() => onToggleLike(current)} /></div>
      <section className="now-panel-card now-panel-lyric"><h3>歌词<IconButton icon={MicrophoneStage} title="完整歌词" onClick={() => onOpenDetail(current)} /></h3><PanelLyric lines={lyric} /></section>
    </> : <p className="now-panel-empty">还没有在播放的歌。选一首歌开始，这里会显示封面、歌词和接下来要播的歌。</p>}
    <section className="now-panel-card now-panel-queue"><h3>接下来播放</h3>
      {following.length ? following.map((track, i) => <button className="queue-row" key={track.id + ':' + i} onClick={() => onPlay(track)}><Cover src={track.cover} title={track.title} /><span><strong>{track.title}</strong><small>{track.artist}</small></span></button>) : <p className="now-panel-empty">队列里没有更多歌曲。</p>}
    </section>
  </aside>;
}

function currentLine(lines, position) {
  let found = -1;
  for (let i = 0; i < lines.length; i++) { if (lines[i].time <= position + .2) found = i; else break; }
  return found;
}
function PanelLyric({ lines }) {
  const position = usePlaybackPosition();
  const index = currentLine(lines, position);
  if (!lines.length) return <p className="now-panel-empty">这首歌暂时没有时间轴歌词。</p>;
  const start = Math.max(0, index - 1);
  return <div>{lines.slice(start, start + 4).map((line, i) => <p key={start + i} className={start + i === index ? 'current' : ''}>{lineText(line) || '♪'}</p>)}</div>;
}
const lineText = line => line.text ?? line.words?.map(w => w.text).join('') ?? '';

// The current lyric line in the player bar.
export function PlayerLyric({ lines }) {
  const position = usePlaybackPosition();
  const index = currentLine(lines || [], position);
  const text = index >= 0 ? lineText(lines[index]) : '';
  return text && text !== '♪' ? <span className="player-lyric" title={text}>{text}</span> : null;
}

// A cassette whose reels turn while the song plays; the tape winds from left to right.
export function Cassette({ track, duration, spinning }) {
  const position = usePlaybackPosition();
  const done = duration ? Math.min(1, position / duration) : 0;
  const side = useMemo(() => (track?.id?.length || 0) % 2 ? 'A' : 'B', [track?.id]);
  return <div className={'cassette' + (spinning ? ' spinning' : '')} aria-hidden="true">
    <div className="cassette-label"><Cover src={track?.cover} title="" /><div><strong>{track?.title || '空白磁带'}</strong><small>{track?.artist || 'Elixir'}</small></div><i>SIDE {side}</i></div>
    <div className="cassette-window">
      <span className="cassette-reel" style={{ '--tape': .5 + (1 - done) * .48 }}><span /></span>
      <span className="cassette-reel" style={{ '--tape': .5 + done * .48 }}><span /></span>
    </div>
    <div className="cassette-screws"><i /><i /><i /><i /></div>
    <div className="cassette-foot" />
  </div>;
}

const clock = seconds => { const s = Math.max(0, Math.floor(seconds || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// A portable CD player seen from above: the disc turns under a clear lid, the LCD on the front
// shows the track time, and the keys under it really play, pause and skip.
export function CdPlayer({ track, playing, duration, index = 0, onToggle, onSkip }) {
  const position = usePlaybackPosition();
  return <div className={'cd-player' + (playing ? ' spinning' : '')}>
    <div className="cd-lid">
      <div className="cd-disc" aria-hidden="true"><Cover src={track?.cover} title="" /><i className="cd-shine" /><i className="cd-hole" /></div>
      <i className="cd-hinge" aria-hidden="true" />
      <span className="cd-brand" aria-hidden="true">ELIXIR · DIGITAL AUDIO</span>
    </div>
    <div className="cd-front">
      <div className="cd-lcd" aria-label={'第 ' + (index + 1) + ' 首，' + clock(position) + ' / ' + clock(duration)}>
        <b>{String(index + 1).padStart(2, '0')}</b><span>{clock(position)}</span><small>{playing ? '▶' : '❚❚'} {track?.title || 'NO DISC'}</small>
      </div>
      <div className="cd-keys">
        <button type="button" onClick={() => onSkip(-1)} aria-label="上一首" title="上一首">◀◀</button>
        <button type="button" className="cd-play" onClick={onToggle} aria-label={playing ? '暂停' : '播放'} title={playing ? '暂停' : '播放'}>▶ ❚❚</button>
        <button type="button" onClick={() => onSkip(1)} aria-label="下一首" title="下一首">▶▶</button>
      </div>
    </div>
  </div>;
}

// The covers of the play queue, tiled across the window behind everything.
export function CoverMosaic({ tracks, currentId }) {
  const covers = useMemo(() => {
    const unique = tracks.filter((t, i) => t?.cover && tracks.findIndex(x => x?.cover === t.cover) === i).slice(0, 36);
    if (!unique.length) return [];
    return Array.from({ length: 36 }, (_, i) => unique[(i * 7) % unique.length]);
  }, [tracks]);
  if (!covers.length) return <div className="mosaic-empty" />;
  return <div className="cover-mosaic">{covers.map((t, i) => <span key={i} className={t.id === currentId ? 'now' : ''} style={{ '--i': i }}><img src={mediaUrl(t.cover)} alt="" loading="lazy" /></span>)}</div>;
}

// Today's listening time and the clock, for the sidebar.
export function SidebarClock({ currentId }) {
  const [now, setNow] = useState(() => new Date());
  const [today, setToday] = useState(null);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let alive = true;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const load = () => api('/api/music/stats?since=' + Math.floor(start.getTime() / 1000)).then(d => alive && setToday(d)).catch(() => {});
    load(); const timer = setInterval(load, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [currentId]);
  const minutes = Math.round((today?.listened_ms || 0) / 60000), goal = 60;
  return <div className="sidebar-clock" title="今日听歌时长，目标 60 分钟">
    <strong>{now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</strong>
    <span>今天听了 {minutes} 分钟{today?.plays ? ' · ' + today.plays + ' 次' : ''}</span>
    <meter min="0" max={goal} optimum={goal} low={goal * .3} high={goal * .9} value={Math.min(goal, minutes)} />
  </div>;
}

// An iPod Classic: the screen shows the song, the click wheel plays, skips and goes back. Turning the
// wheel (drag around it or scroll over it) changes the volume, the way the real one did.
export function IpodPlayer({ track, playing, duration, volume, onToggle, onSkip, onMenu, onVolume }) {
  const position = usePlaybackPosition();
  const [showVolume, setShowVolume] = useState(false);
  const drag = React.useRef(null), hideTimer = React.useRef(0);
  const nudge = delta => { onVolume(Math.min(1, Math.max(0, Math.round((volume + delta) * 100) / 100))); setShowVolume(true); clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setShowVolume(false), 1200); };
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  const angle = (e, el) => { const r = el.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
  const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const left = duration ? duration - position : 0;
  return <div className="ipod" aria-label="iPod 播放器">
    <div className="ipod-screen">
      <div className="ipod-status"><span>{playing ? '▶' : '❚❚'}</span><strong>正在播放</strong><i className="ipod-battery" /></div>
      {showVolume ? <div className="ipod-volume"><span>音量</span><b><i style={{ width: volume * 100 + '%' }} /></b></div> : <div className="ipod-song">
        <Cover src={track?.cover} title={track?.title} />
        <div><strong>{track?.title || '未在播放'}</strong><span>{track?.artist}</span><small>{track?.album}</small></div>
      </div>}
      <div className="ipod-progress"><b><i style={{ width: (duration ? position / duration * 100 : 0) + '%' }} /></b><span>{fmt(position)}</span><span>-{fmt(left)}</span></div>
    </div>
    <div className="ipod-wheel" role="group" aria-label="转盘：拖动或滚动调节音量"
      onWheel={e => nudge(e.deltaY < 0 ? .04 : -.04)}
      onPointerDown={e => { if (e.target.closest('button')) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = angle(e, e.currentTarget); }}
      onPointerMove={e => { if (drag.current === null) return; const a = angle(e, e.currentTarget); let d = a - drag.current; if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; if (Math.abs(d) > .18) { nudge(d > 0 ? .03 : -.03); drag.current = a; } }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <button className="ipod-menu" onClick={onMenu}>MENU</button>
      <button className="ipod-prev" aria-label="上一首" onClick={() => onSkip(-1)}>◀◀</button>
      <button className="ipod-next" aria-label="下一首" onClick={() => onSkip(1)}>▶▶</button>
      <button className="ipod-play" aria-label={playing ? '暂停' : '播放'} onClick={onToggle}>▶❚❚</button>
      <button className="ipod-center" aria-label={playing ? '暂停' : '播放'} onClick={onToggle} />
    </div>
  </div>;
}

// A big typographic poster for the "poster" now-playing page: index number, year-like stamp and the title.
export function PosterMark({ track, playing }) {
  const no = useMemo(() => String((track?.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 99 + 1).padStart(2, '0'), [track?.id]);
  return <div className="poster-mark" aria-hidden="true">
    <span className="poster-no">No.{no}</span>
    <span className="poster-title">{track?.title}</span>
    <span className="poster-meta">{[track?.artist, track?.album].filter(Boolean).join(' / ')}</span>
    <span className="poster-state">{playing ? 'NOW PLAYING' : 'PAUSED'} · ELIXIR</span>
  </div>;
}
