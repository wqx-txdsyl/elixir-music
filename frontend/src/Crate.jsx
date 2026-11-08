import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CaretLeft, CaretRight, MicrophoneStage, Pause, Play, Shuffle } from '@phosphor-icons/react';
import { api, formatDuration, SOURCE_NAMES } from './api';
import { MusicArt } from './MusicWorkspace';
import './crate.css';

const SHOWN_BEHIND = 7;

// Where one record sits relative to the one being looked at: the ones already flipped through lean
// towards the listener, the ones still to come stand behind it, each a little higher and farther.
function recordStyle(offset) {
  if (offset < 0) return { transform: `translateX(-50%) translateY(${12 - offset * 6}px) rotateX(${-62 + offset * 6}deg)`, opacity: offset < -2 ? 0 : .55 + offset * .2, zIndex: 40 + offset };
  if (offset === 0) return { transform: 'translateX(-50%) translateY(-34px) rotateX(-4deg) scale(1.02)', opacity: 1, zIndex: 40 };
  return { transform: `translateX(-50%) translateY(${-34 - offset * 24}px) translateZ(${-offset * 40}px) rotateX(8deg)`, opacity: offset > SHOWN_BEHIND ? 0 : 1 - offset * .07, zIndex: 40 - offset };
}

// A record crate: flip through recent and favourite songs one sleeve at a time, like in a record shop.
export function RecordCrate({ tracks, currentId, playing, onToggle, onOpen, title = '唱片箱' }) {
  const records = useMemo(() => tracks.filter((t, i) => t && tracks.findIndex(x => x?.id === t.id) === i).slice(0, 40), [tracks]);
  const [index, setIndex] = useState(0);
  const wheelAt = useRef(0);
  useEffect(() => { setIndex(i => Math.min(i, Math.max(0, records.length - 1))); }, [records.length]);
  if (!records.length) return null;
  const focused = records[index], now = focused.id === currentId;
  const go = step => setIndex(i => Math.min(records.length - 1, Math.max(0, i + step)));
  const onWheel = e => {
    if (Math.abs(e.deltaY) < 4 || Date.now() - wheelAt.current < 140) return;
    wheelAt.current = Date.now(); go(e.deltaY > 0 ? 1 : -1);
  };
  const onKey = e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(-1); }
    if (e.key === 'Enter') { e.preventDefault(); onToggle(focused, records); }
  };
  return <section className="record-crate" aria-label={title}>
    <div className="crate-stage" onWheel={onWheel} onKeyDown={onKey} tabIndex={0} aria-label={'用滚轮或方向键翻唱片，回车播放。当前第 ' + (index + 1) + ' 张，共 ' + records.length + ' 张'}>
      <div className="crate-records">
        {records.map((track, i) => {
          const offset = i - index;
          if (offset < -3 || offset > SHOWN_BEHIND + 1) return null;
          return <button type="button" key={track.id} className={'crate-record' + (offset === 0 ? ' focused' : '') + (track.id === currentId && playing ? ' spinning' : '')} style={recordStyle(offset)}
            tabIndex={-1} aria-hidden={offset !== 0} onClick={() => offset === 0 ? onOpen(track) : setIndex(i)} title={offset === 0 ? '查看歌词与资料' : track.title}>
            <span className="crate-disc" aria-hidden="true"><span><MusicArt src={track.cover} title="" /></span></span>
            <span className="crate-sleeve"><MusicArt src={track.cover} title={track.title} /></span>
          </button>;
        })}
      </div>
      <div className="crate-box" aria-hidden="true"><span>{title}</span><b>{index + 1} / {records.length}</b></div>
    </div>
    <div className="crate-info">
      <span className="crate-eyebrow">{now && playing ? '正在唱机上' : '翻到这一张'}</span>
      <h2 title={focused.title}>{focused.title}</h2>
      <p className="crate-artist">{focused.artist}</p>
      <p className="crate-meta">{[focused.album, SOURCE_NAMES[focused.source], focused.duration_ms ? formatDuration(focused.duration_ms) : '', focused.play_count ? '听过 ' + focused.play_count + ' 次' : ''].filter(Boolean).join(' · ')}</p>
      <div className="crate-actions">
        <button type="button" className="button primary" onClick={() => onToggle(focused, records)}>{now && playing ? <><Pause size={17} weight="fill" />暂停</> : <><Play size={17} weight="fill" />放上唱机</>}</button>
        <button type="button" className="button quiet" onClick={() => onOpen(focused)}><MicrophoneStage size={17} />歌词与资料</button>
      </div>
      <div className="crate-nav">
        <button type="button" className="icon-button" aria-label="上一张" title="上一张" disabled={index === 0} onClick={() => go(-1)}><CaretLeft size={18} /></button>
        <button type="button" className="icon-button" aria-label="随便抽一张" title="随便抽一张" onClick={() => setIndex(Math.floor(Math.random() * records.length))}><Shuffle size={18} /></button>
        <button type="button" className="icon-button" aria-label="下一张" title="下一张" disabled={index === records.length - 1} onClick={() => go(1)}><CaretRight size={18} /></button>
        <small>滚轮或方向键翻唱片</small>
      </div>
    </div>
  </section>;
}

const WEEKDAYS = ['一', '', '三', '', '五', '', '日'];
const dayLabel = iso => { const [, m, d] = iso.split('-').map(Number); return m + '月' + d + '日'; };
const minutesText = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + ' 分钟' : (m / 60).toFixed(1).replace(/\.0$/, '') + ' 小时'; };

// Half a year of listening, one square per day, darker for longer days.
export function ListeningCalendar({ days: span = 182 }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => api('/api/music/calendar?days=' + span).then(d => alive && setData(d.days || [])).catch(() => alive && setData([]));
    load(); window.addEventListener('elixir-library-changed', load);
    return () => { alive = false; window.removeEventListener('elixir-library-changed', load); };
  }, [span]);
  const view = useMemo(() => {
    if (!data?.length) return null;
    const first = new Date(data[0].day + 'T00:00:00'), lead = (first.getDay() + 6) % 7;
    const cells = [...Array(lead).fill(null), ...data];
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const peak = Math.max(...data.map(d => d.listened_ms), 1);
    const level = ms => !ms ? 0 : ms < peak * .2 ? 1 : ms < peak * .45 ? 2 : ms < peak * .75 ? 3 : 4;
    let streak = 0;
    for (let i = data.length - 1; i >= 0; i--) { if (data[i].listened_ms > 0) streak++; else if (i === data.length - 1) continue; else break; }
    const total = data.reduce((sum, d) => sum + d.listened_ms, 0), active = data.filter(d => d.listened_ms > 0).length;
    const best = data.reduce((a, b) => b.listened_ms > a.listened_ms ? b : a, data[0]);
    const months = weeks.map((week, i) => { const day = week.find(Boolean); if (!day) return ''; const m = Number(day.day.slice(5, 7)); const prev = weeks[i - 1]?.find(Boolean); return !prev || Number(prev.day.slice(5, 7)) !== m ? m + '月' : ''; });
    return { weeks, level, streak, total, active, best, months };
  }, [data]);
  return <section className="home-section listening-calendar">
    <div className="home-section-head"><h2>听歌日历</h2>{view && <span className="calendar-legend" aria-hidden="true">少<i data-level="0" /><i data-level="1" /><i data-level="2" /><i data-level="3" /><i data-level="4" />多</span>}</div>
    {data === null ? <div className="calendar-loading" aria-label="正在统计" /> : !view ? <p className="calendar-empty">暂时读不到听歌记录。</p> : <div className="calendar-body">
      <div className="calendar-grid-wrap" style={{ '--weeks': view.weeks.length }}>
        <div className="calendar-months">{view.months.map((m, i) => <span key={i}>{m}</span>)}</div>
        <div className="calendar-grid">
          <div className="calendar-weekdays" aria-hidden="true">{WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}</div>
          {view.weeks.map((week, w) => <div className="calendar-week" key={w}>{week.map((day, i) => day ? <i key={i} data-level={view.level(day.listened_ms)} title={dayLabel(day.day) + (day.listened_ms ? ' · 听了 ' + minutesText(day.listened_ms) + ' · ' + day.plays + ' 首' : ' · 没有听歌')} /> : <i key={i} className="blank" />)}</div>)}
        </div>
      </div>
      <dl className="calendar-stats">
        <div><dt>连续听歌</dt><dd>{view.streak}<small>天</small></dd></div>
        <div><dt>听歌的日子</dt><dd>{view.active}<small>天</small></dd></div>
        <div><dt>半年共听</dt><dd>{minutesText(view.total)}</dd></div>
        <div><dt>听得最久的一天</dt><dd>{view.best.listened_ms ? dayLabel(view.best.day) : '—'}{view.best.listened_ms > 0 && <small>{minutesText(view.best.listened_ms)}</small>}</dd></div>
      </dl>
    </div>}
  </section>;
}
