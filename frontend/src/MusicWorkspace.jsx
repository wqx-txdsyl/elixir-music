import React, { memo, useEffect, useRef, useState } from 'react';
import { Disc, Play, Heart, Plus, ArrowSquareOut, ArrowsClockwise, FolderSimple, Trash, DownloadSimple, ArrowUp, ArrowDown, Playlist, UserCircle, MagnifyingGlass, Check, X, CaretDown, PencilSimple, Copy, ArrowsDownUp, ImageSquare, ArrowCounterClockwise } from '@phosphor-icons/react';
import { api, mediaUrl, SOURCE_NAMES, formatDuration, formatSourceError } from './api';
import './workspace.css';
import {PlaybackTrackTable} from './TrackTable';
import {CloudLibrary,LibraryOrigins} from './CloudLibrary';
import './cloud-library.css';
import {ListeningBadge} from './ListeningRankings';
import PageHero from './PageHero';
import ActionMenu from './ActionMenu';

const kinds = { track: '歌曲', album: '专辑', artist: '歌手', playlist: '歌单', mv: 'MV' };
export function MusicArt({ src, title, round = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <div className={'music-art ' + (round ? 'round' : '')}>{src && !failed ? <img src={mediaUrl(src)} alt={title ? `${title}封面` : ''} onError={() => setFailed(true)} /> : <Disc size={42} weight="thin" />}</div>;
}
function Notice({ children }) { return <p className="workspace-note" role="status">{children}</p>; }
function Failure({ error, retry }) { return <div className="workspace-failure"><p>{error}</p>{retry && <button className="button quiet" onClick={retry}><ArrowsClockwise size={16} />重试</button>}</div>; }
function Pending() { return <div className="workspace-skeleton" aria-label="正在加载"><i /><i /><i /><i /></div>; }
export function EntityCards({ items, onOpen, selection, onSelect, onToggleSave }) {
  return <div className="music-entity-grid">{items.map(item => <article className={'music-entity ' + item.kind+(selection?.has(item.id)?' entity-selected':'')} key={item.id}>{onSelect&&<label className="entity-select"><input type="checkbox" aria-label={'选择 '+item.title} checked={selection.has(item.id)} onChange={()=>onSelect(item)}/></label>}{onToggleSave&&!onSelect&&<button type="button" className={'entity-save'+(item.saved?' saved':'')} aria-pressed={!!item.saved} title={item.saved?'取消收藏':'收藏'} aria-label={(item.saved?'取消收藏 ':'收藏 ')+(item.title||'')} onClick={()=>onToggleSave(item)}><Heart size={17} weight={item.saved?'fill':'regular'}/></button>}<button onClick={() => onOpen(item)} aria-label={item.kind==='mv'?`播放 MV ${item.title}`:`查看${kinds[item.kind] || ''} ${item.title}`}><MusicArt src={item.cover} title={item.title} round={item.kind === 'artist'} />{item.kind==='mv'&&<span className="entity-mv-play" aria-hidden="true"><Play size={18} weight="fill"/></span>}<strong>{item.title || '未命名'}</strong></button><p>{item.artist || ''}</p><span className={'source-tag source-' + item.source}>{SOURCE_NAMES[item.source]}</span></article>)}</div>;
}
export function MusicSearchTypes({ value, onChange, local }) {
  return <div className="music-type-tabs" role="tablist" aria-label="搜索内容类型">{Object.entries(kinds).filter(([id])=>!local||id==='track').map(([id, name]) => <button key={id} role="tab" aria-selected={value === id} onClick={() => onChange(id)}>{name}</button>)}</div>;
}
const notifyChange=()=>window.dispatchEvent(new Event('elixir-library-changed'));
export function EntitySearch({ query, kind, source, onOpen }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [offset, setOffset] = useState(0), [selecting,setSelecting]=useState(false),[selected,setSelected]=useState(new Set()),[saving,setSaving]=useState(false),request = useRef(0);
  async function load(start = 0) {
    const id = ++request.current; setBusy(true); setError('');
    try {
      const result = await api(`/api/music/search?q=${encodeURIComponent(query)}&kind=${kind}&source=${source}&offset=${start}`, { timeout: 75000 });
      if (id !== request.current) return;
      setData(previous => start ? { ...result, items: [...(previous?.items || []), ...result.items.filter(x => !(previous?.items || []).some(y => y.id === x.id))] } : result); setOffset(start);
    } catch (e) { if (id === request.current) setError(e.message); }
    finally { if (id === request.current) setBusy(false); }
  }
  useEffect(() => { setData(null); setOffset(0);setSelected(new Set());setSelecting(false); if (query) load(); return () => { request.current++; }; }, [query, kind, source]);
  async function toggleSave(item){try{const updated=await api('/api/music/entities/'+encodeURIComponent(item.id)+'/save',{method:'POST'});setData(old=>old&&{...old,items:old.items.map(x=>x.id===item.id?{...x,saved:updated.saved}:x)});notifyChange();}catch(e){setError(e.message);}}
  async function batch(action){setSaving(true);setError('');try{if(action==='export'){const chosen=data.items.filter(x=>selected.has(x.id));const url=URL.createObjectURL(new Blob([JSON.stringify({items:chosen},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='Elixir-search.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}else{await api('/api/music/batch-entities',{method:'POST',body:{ids:[...selected],saved:action==='save'}});setData(old=>old&&{...old,items:old.items.map(x=>selected.has(x.id)?{...x,saved:action==='save'}:x)});notifyChange();}setSelecting(false);setSelected(new Set());}catch(e){setError(e.message);}finally{setSaving(false);}}
  if (!query) return <Notice>搜索{kinds[kind]}</Notice>;
  return <section className="entity-search-results">{error && <Failure error={error} retry={() => load(offset)} />}{data?.errors?.map(e => <Failure key={e.source} error={formatSourceError(e.source,e.message)} retry={()=>load(0)} />)}{busy && !data ? <Pending /> : data?.items?.length ? <><div className="batch-toolbar"><button className="button quiet" aria-pressed={selecting} onClick={()=>{setSelecting(!selecting);setSelected(new Set());}}>批量操作</button>{selecting&&<><button onClick={()=>setSelected(new Set(data.items.map(x=>x.id)))}>全选 {data.items.length} 项</button><button onClick={()=>setSelected(new Set())}>清空选择</button><span role="status">已选 {selected.size}</span><div className="batch-actions"><button disabled={!selected.size||saving} onClick={()=>batch('save')}>{kind==='mv'?'收藏 MV':'保存到音乐库'}</button><button disabled={!selected.size||saving} onClick={()=>batch('unsave')}>{kind==='mv'?'取消收藏':'移出音乐库'}</button><button disabled={!selected.size||saving} onClick={()=>batch('export')}>导出</button></div></>}</div><EntityCards items={data.items} onOpen={onOpen} onToggleSave={kind==='mv'?toggleSave:undefined} selection={selected} onSelect={selecting?item=>setSelected(old=>{const next=new Set(old);next.has(item.id)?next.delete(item.id):next.add(item.id);return next;}):undefined} />{data.has_more && <button disabled={busy} className="button quiet load-more" onClick={() => load(data.next_offset)}>{busy ? '加载中…' : '加载更多'}</button>}</> : !busy && !error && <Notice>{data?.errors?.length ? '部分平台暂不可用' : `没有找到相关${kinds[kind]}`}</Notice>}</section>;
}

export function SearchHistory({ onSearch }) {
  const [queries, setQueries] = useState([]);
  useEffect(() => { api('/api/music/search-history').then(d => setQueries(d.queries)).catch(() => {}); }, []);
  if (!queries.length) return null;
  return <section className="search-history"><div className="section-title"><h2>最近搜索</h2><button onClick={async () => { await api('/api/music/search-history', { method: 'DELETE' }); setQueries([]); }}>清除</button></div><div className="history-chips">{queries.slice(0, 15).map(q => <button key={q} onClick={() => onSearch(q)}><MagnifyingGlass size={14} />{q}</button>)}</div></section>;
}

export function TrackInformation({track,onEntity,onMatch,onUnlink}){
  const rows=[['平台标识',track.source_id],['曲目版本',track.version || track.subtitle],['时长',formatDuration(track.duration_ms)],['发行时间',track.published_at],['ISRC',track.isrc],['碟号',track.disc_number],['曲号',track.track_number],['文件格式',track.format],['码率',track.bitrate?Math.round(track.bitrate/1000)+' kbps':null],['资料来源',track.catalog_origin==='historical'?'历史记录':track.metadata_source || SOURCE_NAMES[track.source]]];
  return <div className="track-information"><dl className="track-info-grid"><dt>歌曲</dt><dd>{track.title}</dd><dt>歌手</dt><dd><button onClick={()=>onEntity(track,'artist')}>{track.artist}</button></dd><dt>专辑</dt><dd><button disabled={!track.album} onClick={()=>onEntity(track,'album')}>{track.album || '暂无专辑'}</button></dd>{rows.filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=><React.Fragment key={k}><dt>{k}</dt><dd>{String(v)}</dd></React.Fragment>)}{Object.entries(track.credits || {}).filter(([,v])=>v).map(([k,v])=><React.Fragment key={k}><dt>{k}</dt><dd>{String(v)}</dd></React.Fragment>)}</dl>{track.catalog_note&&<Notice>{track.catalog_note}</Notice>}{track.sources?.length>0&&<details><summary>查看资料出处</summary>{track.sources.map((s,i)=><p className="workspace-note" key={i}>{typeof s==='string'?s:JSON.stringify(s)}</p>)}</details>}{track.source==='local'&&<div className="entity-actions"><button className="button primary" onClick={()=>onMatch(track)}>匹配平台资料</button>{track.matched_track_id&&<button className="button quiet" onClick={()=>onUnlink(track)}>取消资料关联</button>}</div>}</div>;
}

export const MusicTrackList=memo(function MusicTrackList({tracks,onPlay,onTrack,batchActions,liked,currentId,playing,playlistContext,viewKey='recommendations'}){
  const fallback=useRef(null);fallback.current={play:onPlay,playAll:list=>list?.length&&onPlay(list[0],list),openDetail:onTrack,trackEntity:onTrack,more:onTrack,toggleLike:()=>{}};
  return <PlaybackTrackTable liked={liked} currentId={currentId} playing={playing} items={tracks} viewKey={viewKey} playlistContext={playlistContext} actions={batchActions || fallback}/>;
});

function EntityInformation({data}){
  const asText=value=>Array.isArray(value)?value.map(x=>typeof x==='string'?x:x?.name||x?.text||'').filter(Boolean).join('、'):String(value||'');
  const published=data.published_at?(typeof data.published_at==='number'?new Date(data.published_at).toLocaleDateString('zh-CN'):String(data.published_at).split('T')[0]):'';
  const fields=[['平台',SOURCE_NAMES[data.source]],['编号',data.source_id],['发行时间',published],['发行公司',data.company],['语种',data.language],['风格',asText(data.genres)],['别名',asText(data.aliases)],...(data.information||[]).map(x=>[x.label,x.value])].filter(([,value])=>value);
  return <section className="entity-information"><dl>{fields.map(([label,value],i)=><div key={label+':'+i}><dt>{label}</dt><dd>{String(value)}</dd></div>)}</dl>{data.description?<div className="entity-biography"><h2>介绍</h2><p>{data.description}</p></div>:<Notice>暂无介绍</Notice>}{data.description_sections?.map((section,i)=><details className="entity-biography" key={i}><summary>{section.title||'更多资料'}</summary><p>{section.text}</p></details>)}{data.copyrights?.length>0&&<div className="entity-copyright">{data.copyrights.map((x,i)=><p key={i}>{typeof x==='string'?x:x.text||x.label||''}</p>)}</div>}</section>;
}

export function EntityDetail({ liked,currentId,playing,batchActions, item, onOpen, onTrack, onPlay, onPlayAll, onSaved, notify, external }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [offset, setOffset] = useState(0), [saving, setSaving] = useState(false),[tab,setTab]=useState('tracks');
  const req = useRef(0);
  async function load(start = 0) {
    const id = ++req.current;setBusy(true);setError('');
    try {
      const result = await api('/api/music/entities/' + encodeURIComponent(item.id) + '?offset=' + start, { timeout: 75000 });
      if (id !== req.current) return;
      setData(previous => start ? { ...result, tracks: [...(previous?.tracks || []), ...result.tracks.filter(x => !(previous?.tracks || []).some(y => y.id === x.id))], albums: [...(previous?.albums || []), ...(result.albums || []).filter(x => !(previous?.albums || []).some(y => y.id === x.id))] } : result);setOffset(start);
    } catch (e) { if (id === req.current) setError(e.message); }
    finally { if (id === req.current) setBusy(false); }
  }
  useEffect(() => {setData(null);setTab('tracks');setOffset(0);load();return () => {req.current++;};}, [item.id]);
  const shown = data || item;
  async function toggleSave() {setSaving(true);try {const updated = await api('/api/music/entities/' + encodeURIComponent(item.id) + '/save', { method: 'POST' });setData(previous => ({...previous,saved:updated.saved}));onSaved?.();notify(updated.saved ? '已保存' : '已移除');}catch(e){notify(e.message);}finally{setSaving(false);}}
  return <section className="entity-detail"><header className="entity-hero"><MusicArt src={shown.cover} title={shown.title} round={item.kind === 'artist'} /><div><span className="eyebrow">{kinds[item.kind]} · {SOURCE_NAMES[item.source]}</span><h1>{shown.title || item.source_id}</h1>{item.kind!=='playlist'&&<ListeningBadge kind={item.kind} id={item.id}/>}<p>{shown.artist}</p><div className="entity-meta">{shown.published_at && <span>{typeof shown.published_at === 'number' ? new Date(shown.published_at).toLocaleDateString('zh-CN') : shown.published_at}</span>}{shown.company && <span>{shown.company}</span>}<code>{shown.source_id}</code></div><div className="entity-actions"><button className="button primary" disabled={!data?.tracks?.length} onClick={() => onPlayAll ? onPlayAll(data.tracks) : onPlay(data.tracks[0], data.tracks)}><Play size={17} weight="fill" />播放全部</button><button className="button quiet" disabled={!data || saving} onClick={toggleSave}><Heart size={17} weight={data?.saved ? 'fill' : 'regular'} />{data?.saved ? (item.kind==='playlist'?'已收藏':'已保存') : item.kind === 'artist' ? '关注歌手' : item.kind==='playlist'?'收藏歌单':'保存到音乐库'}</button><button className="text-button" onClick={() => external(shown.source_url)}><ArrowSquareOut size={16} />原平台</button></div></div></header>
    {error && <Failure error={error} retry={() => load(offset)} />}{busy && !data && <Pending />}{data?.warning && <Notice>{data.warning}</Notice>}{data?.warnings?.map((w,i) => <Notice key={i}>{w}</Notice>)}
    {data&&<div className="music-type-tabs entity-tabs" role="tablist" aria-label="详情分类"><button role="tab" aria-selected={tab==='tracks'} onClick={()=>setTab('tracks')}>{item.kind==='artist'?'热门歌曲':'歌曲'}</button>{item.kind==='artist'&&<button role="tab" aria-selected={tab==='albums'} onClick={()=>setTab('albums')}>专辑</button>}<button role="tab" aria-selected={tab==='info'} onClick={()=>setTab('info')}>{item.kind==='artist'?'歌手资料':item.kind==='playlist'?'歌单资料':'专辑资料'}</button></div>}
    {tab==='info'&&data&&<EntityInformation data={data}/>}
    {tab==='tracks'&&data?.track_scope&&<Notice>{data.track_scope}</Notice>}
    {tab==='tracks'&&data?.tracks?.length>0&&<MusicTrackList liked={liked} currentId={currentId} playing={playing} batchActions={batchActions} tracks={data.tracks} viewKey={item.id} playlistContext={item.kind==='playlist'?{...shown,remote_source:item.source}:undefined} onPlay={onPlay} onTrack={onTrack}/>}
    {tab==='albums'&&data?.albums?.length>0&&<EntityCards items={data.albums} onOpen={onOpen}/>}
    {((tab==='tracks'&&data?.has_more)||(tab==='albums'&&data?.albums_has_more)) && <button disabled={busy} className="button quiet load-more" onClick={() => load(offset + 50)}>{busy ? '加载中…' : '加载下一页'}</button>}
    {data&&tab==='tracks'&&!data.tracks?.length&&<Notice>暂无曲目</Notice>}{data&&tab==='albums'&&!data.albums?.length&&<Notice>暂无专辑</Notice>}
  </section>;
}

function downloadJson(data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
  const link = document.createElement('a');link.href=url;link.download=(data.title || '歌单').replace(/[\\/:*?"<>|]/g,'_')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
// Uploaded covers are centre-cropped to a square JPEG so every view shows the same picture.
async function squareCover(file){
  if(!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type))throw new Error('请选择 JPG、PNG 或 WebP 图片');
  if(file.size>30*1024*1024)throw new Error('图片不能超过 30MB');
  let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw new Error('无法读取这张图片');}
  const side=Math.min(bitmap.width,bitmap.height),size=Math.min(800,side),canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.imageSmoothingQuality='high';
  ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,size,size);bitmap.close?.();
  return canvas.toDataURL('image/jpeg',0.9);
}
// Playlist header: cover, title and description with the playlist's own actions; the edit form and track order open below it.
export function PlaylistTools({ playlist, tracks, meta, onChange, onExit, onRefresh, notify }) {
  const coverInput=useRef(null);
  const [panel,setPanel]=useState(''),[title,setTitle]=useState(playlist?.title || ''),[description,setDescription]=useState(playlist?.description || ''),[folder,setFolder]=useState(playlist?.folder || ''),[busy,setBusy]=useState(false);
  useEffect(()=>{setTitle(playlist?.title || '');setDescription(playlist?.description || '');setFolder(playlist?.folder || '');setPanel('');},[playlist?.id]);
  if (!playlist) return null;
  async function run(fn) {setBusy(true);try {await fn();}catch(e){notify(e.message);}finally{setBusy(false);}}
  const pid=encodeURIComponent(playlist.id);
  async function move(index,direction) {const ids=tracks.map(x=>x.id),to=index+direction;if(to<0||to>=ids.length)return;[ids[index],ids[to]]=[ids[to],ids[index]];await run(async()=>onChange(await api('/api/playlists/'+pid+'/order',{method:'PUT',body:{track_ids:ids}})));}
  async function changeCover(file){if(!file)return;await run(async()=>{const image=await squareCover(file);const result=await api('/api/playlists/'+pid+'/cover',{method:'PUT',body:{image},timeout:60000});onChange({...playlist,tracks,...result});onRefresh();notify('已更换歌单封面');});if(coverInput.current)coverInput.current.value='';}
  function resetCover(){run(async()=>{const result=await api('/api/playlists/'+pid+'/cover',{method:'DELETE'});onChange({...playlist,tracks,...result});onRefresh();notify('已恢复默认封面（最新添加的歌曲）');});}
  const eyebrow=(playlist.remote_source?SOURCE_NAMES[playlist.remote_source]+' 歌单':'Elixir 歌单')+(playlist.folder?' · '+playlist.folder:'');
  const hero=(actions,artAction)=><PageHero artAction={artAction} kind="playlist" icon={Playlist} cover={playlist.cover || tracks[0]?.cover} eyebrow={eyebrow} title={playlist.title || '歌单'} meta={meta} actions={actions}>{playlist.description && panel!=='edit' && <p className="playlist-description" title={playlist.description}>{playlist.description}</p>}</PageHero>;
  if (playlist.remote_source) return hero(<>
    <button className="button quiet" disabled={busy} onClick={()=>run(async()=>{const eid=playlist.remote_source+':playlist:'+(playlist.source_id||playlist.id.split(':').pop());const saved=await api('/api/music/entities/'+encodeURIComponent(eid)+'/save',{method:'POST'});onChange({...playlist,saved:saved.saved});onRefresh();notify(saved.saved?'已收藏歌单':'已取消收藏');})}><Heart size={17} weight={playlist.saved?'fill':'regular'}/>{playlist.saved?'已收藏':'收藏歌单'}</button>
    <button className="button quiet" disabled={busy} onClick={()=>run(async()=>{const result=await api('/api/music/import-remote',{method:'POST',body:{source:playlist.remote_source,source_id:playlist.id.split(':').pop()},timeout:90000});onChange(result);onRefresh();notify('已复制到本应用歌单');})}><Plus size={16}/>导入本应用</button>
  </>);
  return <>
    {hero(<>
      <button className={'button quiet '+(panel==='edit'?'chosen':'')} aria-pressed={panel==='edit'} disabled={busy} onClick={()=>setPanel(panel==='edit'?'':'edit')}><PencilSimple size={16}/>编辑资料</button>
      <ActionMenu align="left" disabled={busy} items={[
        {label:'更换封面',icon:ImageSquare,onClick:()=>coverInput.current?.click()},
        playlist.cover_custom&&{label:'恢复默认封面',icon:ArrowCounterClockwise,onClick:resetCover},
        tracks.length>1&&{label:'调整曲序',icon:ArrowsDownUp,onClick:()=>setPanel('order')},
        {label:'复制歌单',icon:Copy,onClick:()=>run(async()=>{const result=await api('/api/playlists/'+pid+'/copy',{method:'POST',body:{}});onRefresh();notify('已创建「'+result.title+'」');})},
        {label:'导出歌单',icon:DownloadSimple,onClick:()=>run(async()=>downloadJson(await api('/api/playlists/'+pid+'/export')))},
        'divider',
        {label:'移入回收站',icon:Trash,danger:true,onClick:()=>run(async()=>{await api('/api/playlists/'+pid,{method:'DELETE'});onRefresh();onExit();notify('歌单已移入回收站，可在我的音乐恢复');})},
      ]}/>
    </>,{label:'更换封面',busy,onClick:()=>coverInput.current?.click()})}
    <input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>changeCover(e.target.files?.[0])}/>
    {panel==='edit' && <section className="playlist-panel"><form className="playlist-edit-form" onSubmit={e=>{e.preventDefault();run(async()=>{const updated=await api('/api/playlists/'+pid,{method:'PUT',body:{title,description,folder}});onChange(updated);onRefresh();setPanel('');});}}><label>歌单名称<input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>文件夹<input maxLength={100} value={folder} onChange={e=>setFolder(e.target.value)} placeholder="例如 通勤 / 粤语"/></label><label className="wide">说明<textarea maxLength={4000} value={description} onChange={e=>setDescription(e.target.value)}/></label><div className="playlist-panel-actions"><button className="button primary" disabled={busy}><Check size={16}/>保存</button><button type="button" className="button quiet" onClick={()=>{setTitle(playlist.title || '');setDescription(playlist.description || '');setFolder(playlist.folder || '');setPanel('');}}>取消</button></div></form></section>}
    {panel==='order' && tracks.length>1 && <section className="playlist-panel playlist-order-panel"><header><div><strong>调整曲序</strong><small>移动后立即保存，作为歌单的默认顺序</small></div><button className="button quiet" onClick={()=>setPanel('')}><Check size={16}/>完成</button></header><div className="playlist-order-list">{tracks.map((t,i)=><div className="order-row" key={t.id}><span>{i+1}. {t.title} <small>{t.artist}</small></span><button aria-label={'上移 '+t.title} disabled={busy||i===0} onClick={()=>move(i,-1)}><ArrowUp size={16}/></button><button aria-label={'下移 '+t.title} disabled={busy||i===tracks.length-1} onClick={()=>move(i,1)}><ArrowDown size={16}/></button></div>)}</div></section>}
  </>;
}

export function LocalFolders({onScan,jobStatus,notify}){
  const [folders,setFolders]=useState([]),[error,setError]=useState('');
  async function load(){try{const data=await api('/api/music/folders');setFolders(data.folders || []);setError('');}catch(e){setError(e.message);}}
  useEffect(()=>{load();},[jobStatus]);
  async function watch(folder,value){try{await api('/api/music/folders',{method:'PUT',body:{path:folder.path,watched:value}});await load();notify(value?'已开启每5分钟自动扫描':'已关闭自动扫描');}catch(e){notify(e.message);}}
  if(error)return <Failure error={error} retry={load}/>;
  if(!folders.length)return null;
  return <details className="local-folders"><summary><FolderSimple size={17}/>音乐目录<span>{folders.length}</span><CaretDown size={14}/></summary>{folders.map(folder=><div className="local-folder" key={folder.path}><div><strong>{folder.path}</strong><small>{folder.last_scan?'最近扫描 '+new Date(folder.last_scan*1000).toLocaleString('zh-CN'):'尚未完成扫描'}</small></div><label><input type="checkbox" checked={!!folder.watched} onChange={e=>watch(folder,e.target.checked)}/>自动扫描</label><button className="text-button" onClick={()=>onScan(folder.path)}>重新扫描</button><button className="text-button" onClick={async()=>{try{await api('/api/music/folders',{method:'DELETE',body:{path:folder.path}});await load();notify('已停止管理目录，音乐文件和已导入歌曲保留');}catch(e){notify(e.message);}}}>停止管理</button></div>)}</details>;
}

export function MusicLibrary({ onOpen, onPlaylist, onTracks, onImport, onRefresh, notify, liked,currentId,playing,actions,onRemotePlaylist }) {
  const [origin,setOrigin]=useState('local');
  const [localTracks,setLocalTracks]=useState([]),[localBusy,setLocalBusy]=useState(false);
  async function loadLocal(){setLocalBusy(true);try{const result=await api('/api/library');setLocalTracks(result.tracks||[]);}catch(e){setError(e.message);}finally{setLocalBusy(false);}}
  const [data,setData]=useState(null),[trash,setTrash]=useState([]),[error,setError]=useState(''),[tab,setTab]=useState('playlist'),[query,setQuery]=useState(''),[busy,setBusy]=useState(false);const input=useRef(null);
  async function load(){try{setError('');const [a,b]=await Promise.all([api('/api/music/library'),api('/api/music/trash')]);setData(a);setTrash(b.playlists);}catch(e){setError(e.message);}}
  useEffect(()=>{load();},[]);
  useEffect(()=>{if(tab==='track')loadLocal();},[tab]);
  useEffect(()=>{const changed=()=>{load();loadLocal();};window.addEventListener('elixir-library-changed',changed);return()=>window.removeEventListener('elixir-library-changed',changed);},[]);
  const lists = {track:localTracks,playlist:data?.playlists || [],album:data?.albums || [],artist:data?.artists || [],mv:data?.mvs || [],trash};
  const filtered=lists[tab].filter(x=>(x.title+' '+(x.folder||'')+' '+(x.artist||'')).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  async function importFile(file){if(!file)return;if(file.size>8*1024*1024){notify('歌单文件超过8MB');return;}setBusy(true);try{const body=JSON.parse(await file.text());const result=await api('/api/music/import-playlist',{method:'POST',body,timeout:180000});await load();onRefresh();notify(`已导入 ${result.imported} 首，${result.failures.length} 首未导入`);if(result.failures.length)setError(result.failures.slice(0,10).map(x=>`${x.title}：${x.reason}`).join('；'));}catch(e){notify(e.message);}finally{setBusy(false);if(input.current)input.current.value='';}}
  if(origin!=='local')return <><PageHero kind="music" icon={Disc} eyebrow="云端收藏" title="我的音乐" meta="账号里收藏的歌单、专辑和歌手"/><LibraryOrigins value={origin} onChange={setOrigin}/><CloudLibrary source={origin} localData={data} liked={liked} currentId={currentId} playing={playing} actions={actions} EntityCards={EntityCards} onOpen={onOpen} onPlaylist={onPlaylist} onRemotePlaylist={onRemotePlaylist} notify={notify}/></>;
  return <><PageHero kind="music" icon={Disc} eyebrow="音乐库" title="我的音乐" stats={data?[['个歌单',data.playlists?.length||0],['张专辑',data.albums?.length||0],['位歌手',data.artists?.length||0],...(data.mvs?.length?[['支 MV',data.mvs.length]]:[]),['首本地歌曲',data.local_count||0]]:null} actions={<button className="button quiet" onClick={()=>{load();if(tab==='track')loadLocal();}}><ArrowsClockwise size={17}/>刷新</button>}/><LibraryOrigins value={origin} onChange={setOrigin}/><div className="library-summary"><button onClick={()=>onTracks('likes')}><Heart size={22}/><strong>喜欢的歌曲</strong><span>{data?.likes?.length || 0} 首</span></button><button onClick={()=>setTab('track')}><FolderSimple size={22}/><strong>本地音乐</strong><span>{data?.local_count || 0} 首</span></button><button onClick={()=>onTracks('history')}><Disc size={22}/><strong>最近播放</strong></button></div><div className="library-browser-head"><div className="music-type-tabs" role="tablist" aria-label="音乐库分类">{[['playlist','个人歌单'],['track','本地歌曲'],['album','专辑'],['artist','歌手'],['mv','MV'],['trash','回收站']].map(([id,name])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{name}<small>{lists[id].length}</small></button>)}</div><input className="library-filter" aria-label="筛选音乐库" value={query} onChange={e=>setQuery(e.target.value)} placeholder="筛选名称、歌手或文件夹"/></div>{error&&<Failure error={error} retry={load}/>}
    {(!data||localBusy)&&!error?<Pending/>:tab==='track'?<PlaybackTrackTable controls filterable={false} viewKey="music-local" items={filtered} currentId={currentId} playing={playing} liked={liked} actions={actions}/>:tab==='album'||tab==='artist'?<EntityCards items={filtered} onOpen={onOpen}/>:tab==='mv'?(filtered.length?<EntityCards items={filtered} onOpen={onOpen} onToggleSave={async item=>{try{await api('/api/music/entities/'+encodeURIComponent(item.id)+'/save',{method:'POST'});await load();notify('已取消收藏 MV');}catch(e){notify(e.message);}}}/>:<Notice>{query?'没有匹配的 MV':'还没有收藏 MV。搜索时切到“MV”，点卡片上的心形即可收藏。'}</Notice>):<div className="library-playlists">{filtered.map(p=><div key={p.id}><button onClick={()=>tab!=='trash'&&(p.kind==='playlist'?onOpen(p):onPlaylist(p.id))} disabled={tab==='trash'}><MusicArt src={p.cover} title={p.title}/><span><strong>{p.title}</strong><small>{p.folder ? p.folder+' · ' : ''}{p.count??p.total??0} 首</small></span></button>{tab==='trash'&&<button className="button quiet" onClick={async()=>{try{await api('/api/playlists/'+encodeURIComponent(p.id),{method:'PUT',body:{restore:true}});await load();onRefresh();notify('已恢复歌单');}catch(e){notify(e.message);}}}>恢复</button>}</div>)}</div>}
    {data&&!localBusy&&!filtered.length&&<Notice>{tab==='trash'?'回收站为空。':'暂无内容'}</Notice>}
    {tab==='playlist'&&<div className="library-import"><input ref={input} type="file" accept=".json,application/json" hidden onChange={e=>importFile(e.target.files?.[0])}/><button disabled={busy} className="button quiet" onClick={()=>input.current?.click()}><Playlist size={17}/>{busy?'正在核验并导入…':'导入歌单 JSON'}</button></div>}
  </>;
}
