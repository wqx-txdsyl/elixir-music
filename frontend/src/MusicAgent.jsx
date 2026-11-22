import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowsClockwise, CaretDown, CaretUp, ClockCounterClockwise, Shuffle, Sparkle, SkipForward, X } from '@phosphor-icons/react';
import { api } from './api';
import { Cover, Note } from './ui';

const MODES = [
  { id: 'continue', label: '接着听', icon: SkipForward, hint: current => current ? '顺着《' + current.title + '》往下排' : '还没在播放，按你常听的排' },
  { id: 'change', label: '换个氛围', icon: Shuffle, hint: () => '换个歌手、换些不常听的，跳出现在这一串' },
  { id: 'rediscover', label: '很久没听', icon: ClockCounterClockwise, hint: () => '一个月以上没听的，和收藏后还没播过的' },
];
const MODE_KEY = 'elixir-music-agent-mode';
const LIMIT = 8;

// 接下来已经会播的歌，不再推荐。
function upcomingIds(queue, upNext, currentId) {
  const index = queue.findIndex(t => t.id === currentId);
  return [...new Set([...upNext, ...queue.slice(index + 1).map(t => t.id)])];
}

// 右侧栏的音乐 Agent：按当前歌曲、点赞、歌单和播放记录，从本地曲库排一段候选。
// 候选可以删、可以调顺序，点按钮才进播放队列，正在播的歌不受影响。
export function AgentPanel({ current, queue, upNext, onAdd }) {
  const [mode, setMode] = useState(() => MODES.some(m => m.id === localStorage.getItem(MODE_KEY)) ? localStorage.getItem(MODE_KEY) : 'continue');
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [edited, setEdited] = useState(false);
  const [basisId, setBasisId] = useState(current?.id);
  const [added, setAdded] = useState(0);
  const request = useRef(null);
  const latest = useRef({ current, queue, upNext });
  latest.current = { current, queue, upNext };

  const load = useCallback(async (nextMode, skip = []) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const { current, queue, upNext } = latest.current;
    setStatus('loading'); setError(''); setAdded(0);
    try {
      const data = await api('/api/music-agent/suggest', { method: 'POST', signal: controller.signal, body: {
        mode: nextMode, current_track_id: current?.id || null, limit: LIMIT,
        exclude_track_ids: [...new Set([...upcomingIds(queue, upNext, current?.id), ...skip])].slice(0, 1000),
      } });
      if (controller.signal.aborted) return;
      setItems(data.candidates || []); setEdited(false); setBasisId(current?.id); setStatus('done');
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e.message || '没排出来'); setStatus('error');
    }
  }, []);

  useEffect(() => { localStorage.setItem(MODE_KEY, mode); load(mode); }, [mode, load]);
  useEffect(() => () => request.current?.abort(), []);
  // 「接着听」跟着当前歌曲走：没动过候选就自动重排，动过就只提示，不冲掉手上的编辑。
  useEffect(() => {
    if (mode !== 'continue' || current?.id === basisId || status === 'loading') return;
    if (!edited && !added) load(mode);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (i, delta) => { setItems(list => { const next = [...list]; const [it] = next.splice(i, 1); next.splice(i + delta, 0, it); return next; }); setEdited(true); };
  const dismiss = item => {
    setItems(list => list.filter(x => x.track.id !== item.track.id)); setEdited(true);
    api('/api/music-agent/feedback', { method: 'POST', body: { track_id: item.track.id, action: 'dismiss' } }).catch(() => {});
  };
  const add = action => {
    const tracks = items.map(x => x.track);
    if (!tracks.length) return;
    onAdd(action, tracks); setAdded(tracks.length); setItems([]); setEdited(false);
  };

  const active = MODES.find(m => m.id === mode);
  const stale = mode === 'continue' && status === 'done' && items.length > 0 && current?.id !== basisId;
  return <aside className="now-panel agent-panel" aria-label="音乐 Agent">
    <div className="now-panel-head"><span className="agent-title"><Sparkle size={16} weight="fill" />音乐 Agent</span></div>
    <div className="agent-modes" role="radiogroup" aria-label="怎么排">
      {MODES.map(m => <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={mode === m.id ? 'selected' : ''} onClick={() => mode === m.id ? load(m.id) : setMode(m.id)}><m.icon size={16} weight={mode === m.id ? 'fill' : 'regular'} />{m.label}</button>)}
    </div>
    <p className="agent-hint">{active.hint(current)}</p>
    {stale && <button type="button" className="agent-stale" onClick={() => load(mode)}><ArrowsClockwise size={14} />换歌了，按《{current?.title}》重排</button>}

    <section className="agent-list" aria-busy={status === 'loading'}>
      {status === 'loading' && !items.length && <div className="agent-skeleton" aria-label="正在排">{Array.from({ length: 5 }, (_, i) => <i key={i} />)}</div>}
      {status === 'error' && <Note className="tight">没排出来：{error}<button type="button" className="text-button" onClick={() => load(mode)}>再试一次</button></Note>}
      {status === 'done' && !items.length && (added
        ? <Note className="tight">已加入 {added} 首。<button type="button" className="text-button" onClick={() => load(mode)}>再排一批</button></Note>
        : <Note className="tight">{edited ? '这一批都移走了。' : '曲库里暂时没有合适的歌。'}<button type="button" className="text-button" onClick={() => load(mode)}>换一批</button></Note>)}
      {items.map((item, i) => <div className="agent-row" key={item.track.id}>
        <Cover src={item.track.cover} title={item.track.title} />
        <span className="agent-row-text"><strong title={item.track.title}>{item.track.title}</strong><small title={item.track.artist}>{item.track.artist}</small><em>{item.reason}</em></span>
        <span className="agent-row-tools">
          <button type="button" title="往前挪" aria-label={'把《' + item.track.title + '》往前挪'} disabled={i === 0} onClick={() => move(i, -1)}><CaretUp size={14} /></button>
          <button type="button" title="往后挪" aria-label={'把《' + item.track.title + '》往后挪'} disabled={i === items.length - 1} onClick={() => move(i, 1)}><CaretDown size={14} /></button>
          <button type="button" title="不想听：移出这一批，以后少推" aria-label={'不想听《' + item.track.title + '》'} onClick={() => dismiss(item)}><X size={14} /></button>
        </span>
      </div>)}
    </section>

    {items.length > 0 && <div className="agent-actions">
      <button type="button" className="button primary" onClick={() => add('next')}>{current ? '接在当前歌曲后' : '设为接下来播放'}（{items.length} 首）</button>
      <div><button type="button" className="text-button" onClick={() => add('queue')}>加到队列末尾</button><button type="button" className="text-button" disabled={status === 'loading'} onClick={() => load(mode, items.map(x => x.track.id))}><ArrowsClockwise size={14} />换一批</button></div>
    </div>}
  </aside>;
}
