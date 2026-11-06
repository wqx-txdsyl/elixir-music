from __future__ import annotations
import asyncio
import hashlib
import hmac
import html
import json
import os
import re
import secrets
import sys
import time
from pathlib import Path
from urllib.parse import quote, urlparse
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from .store import Store, DATA
from .library import read_track, iter_music, local_lyrics, match_score, ART
from .lyrics_db import lookup as lyrics_lookup
from .providers.netease import NeteaseProvider
from .providers.qqmusic import QQMusicProvider
from .providers.spotify import SpotifyProvider

VERSION='0.2.6'
TOKEN=os.environ.get('MUSICPLATFORM_TOKEN') or secrets.token_urlsafe(32)
store=Store()

def saved_cookie(source):
    try: return store.secret(source)
    except Exception: return ''

providers={'netease':NeteaseProvider(saved_cookie('netease')),'qqmusic':QQMusicProvider(saved_cookie('qqmusic')),'spotify':SpotifyProvider(store)}
jobs={}
media_tickets={}
app=FastAPI(title='Elixir',version=VERSION,docs_url=None,redoc_url=None,openapi_url=None)

@app.middleware('http')
async def local_only(request:Request,call_next):
    host=request.headers.get('host','').split(':')[0]
    if host not in {'127.0.0.1','localhost','testserver'}:
        return JSONResponse({'detail':'仅允许本机访问'},status_code=403)
    origin=request.headers.get('origin')
    if origin and urlparse(origin).hostname not in {'127.0.0.1','localhost'}:
        return JSONResponse({'detail':'来源校验失败'},status_code=403)
    path=request.url.path
    public={'/api/health','/api/accounts/spotify/callback'}
    if path.startswith('/api/') and path not in public:
        supplied=request.headers.get('x-app-token') or request.query_params.get('token','')
        if not hmac.compare_digest(supplied,TOKEN):
            return JSONResponse({'detail':'请从桌面应用访问'},status_code=401)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='no-referrer'
    if path.startswith('/api/'): response.headers['Cache-Control']='no-store'
    return response

@app.exception_handler(ValueError)
async def value_error(request,exc): return JSONResponse({'detail':str(exc)},status_code=400)

@app.exception_handler(RuntimeError)
async def runtime_error(request,exc): return JSONResponse({'detail':str(exc),'code':getattr(exc,'code','')},status_code=502)

@app.exception_handler(NotImplementedError)
async def unimplemented(request,exc):return JSONResponse({'detail':str(exc)},status_code=501)

@app.exception_handler(Exception)
async def unexpected_error(request,exc):
    # Network exception strings may contain signed URLs/cookies; do not expose them.
    return JSONResponse({'detail':'请求未完成，请检查网络后重试','error_type':type(exc).__name__},status_code=502)

def source_of(track_id):
    if ':' not in track_id: raise ValueError('歌曲标识需要带平台前缀')
    source,sid=track_id.split(':',1)
    if source not in {*providers,'local'} or not re.fullmatch(r'[A-Za-z0-9_-]{1,160}',sid): raise ValueError('无效的歌曲标识')
    return source,sid

def public_track(track,liked_ids=None,linked_tracks=None):
    t=dict(track)
    t.pop('local_path',None)
    if t.get('cover','').startswith('/api/') and '?token=' not in t['cover']: t['cover']+='?token='+TOKEN
    t['liked']=t['id'] in (store.liked_ids() if liked_ids is None else liked_ids)
    if t['source']=='local':
        if linked_tracks is None:
            linked=store.linked(t['id']);r=store.get(linked) if linked else None
        else:r=linked_tracks.get(t['id'])
        if r:
            t['matched_track_id']=r['id']
            for key in ('cover','album','album_id','artist_ids','artists','credits','isrc'):
                if r.get(key): t[key]=r[key]
            t['metadata_source']=r['source']
    return t

def public_tracks(tracks):
    liked=store.liked_ids();linked=store.linked_tracks()
    return [public_track(t,liked,linked) for t in tracks]

async def track_get(track_id,refresh=False):
    source,sid=source_of(track_id)
    track=store.get(track_id)
    if track and not refresh and not track.get('metadata_missing'): return track
    if source=='local':
        if not track: raise HTTPException(404,'未导入该本地歌曲')
        return track
    track=await asyncio.to_thread(providers[source].detail,sid)
    store.upsert(track)
    return track

async def cached_remote(key,fn,*args,max_age=3600):
    cached=store.cache_get(key,max_age)
    if cached is not None: return cached
    try:
        data=await asyncio.to_thread(fn,*args)
        if isinstance(data,dict): data=dict(data,fetched_at=time.time())
        store.cache_put(key,data)
        return data
    except Exception:
        prior=store.cache_get(key)
        if prior is not None:
            return dict(prior,cached=True,stale=True,warning='当前平台请求失败，正在展示之前保存的资料') if isinstance(prior,dict) else prior
        raise

async def search_sources(q,source='all',limit=30):
    names=list(providers) if source=='all' else [source]
    if source=='local': return store.tracks('local',q,10000),[]
    if any(n not in providers for n in names): raise ValueError('未知平台')
    async def one(name):
        catalog=Path(__file__).parent/'providers'/(name+'_catalog.json')
        version=str(catalog.stat().st_mtime_ns) if catalog.is_file() else 'none'
        key='search:'+name+':'+version+':'+q+':'+str(limit)
        try:
            result=await cached_remote(key,providers[name].search,q,limit,max_age=300)
            store.upsert_many(result)
            return result,None
        except Exception as e:
            message=str(e) if isinstance(e,(RuntimeError,ValueError)) else '网络请求失败，请稍后重试'
            return [],{'source':name,'message':message}
    results=await asyncio.gather(*(one(n) for n in names))
    # Local files participate in the unified search, independently of cloud failures.
    seen=set(); tracks=store.tracks('local',q,10000) if source=='all' else []
    seen.update(t['id'] for t in tracks)
    for result,_ in results:
        for t in result:
            if t['id'] not in seen: tracks.append(t); seen.add(t['id'])
    return tracks,[error for _,error in results if error]

@app.get('/api/health')
def health(): return {'ok':True,'version':VERSION,'build':'20261101.5','name':'Elixir','instance':hashlib.sha256(TOKEN.encode()).hexdigest()[:16]}

@app.get('/api/search')
async def search(q:str='',source:str='all',limit:int=30):
    q=q.strip()[:200]
    if not q: return {'tracks':[],'errors':[]}
    store.search_record(q)
    limit=max(1,min(limit,100))
    # Exact IDs / official links are useful when an item is absent from search.
    direct=None
    if re.fullmatch(r'(netease|qqmusic|spotify):[A-Za-z0-9_-]+',q): direct=q
    elif 'music.163.com' in q:
        m=re.search(r'(?:id=|/song/)(\d+)',q)
        if m: direct='netease:'+m[1]
    elif 'y.qq.com' in q:
        m=re.search(r'(?:songDetail/|songmid=)([A-Za-z0-9]+)',q)
        if m: direct='qqmusic:'+m[1]
    elif 'open.spotify.com/track/' in q:
        m=re.search(r'/track/([A-Za-z0-9]+)',q)
        if m: direct='spotify:'+m[1]
    if direct: return {'tracks':[public_track(await track_get(direct,True))],'errors':[]}
    tracks,errors=await search_sources(q,source,limit)
    return {'tracks':public_tracks(tracks),'errors':errors}

@app.get('/api/home')
async def home():
    tracks=store.history() or store.likes() or store.tracks('local',limit=24)
    return {'tracks':public_tracks(tracks[:24]),'collections':[], 'origin':'personal_library'}

@app.get('/api/tracks/{track_id}')
async def track(track_id:str,refresh:bool=False): return public_track(await track_get(track_id,refresh))

@app.get('/api/tracks/{track_id}/lyrics')
async def lyrics(track_id:str):
    source,sid=source_of(track_id)
    lookup_id=track_id
    if source=='local':
        path=store.path(track_id)
        if not path: raise HTTPException(404,'本地歌曲不存在')
        own=local_lyrics(path)
        if own: return own
        linked=store.linked(track_id)
        if linked:
            source,sid=source_of(linked); lookup_id=linked
    data={'original':'','translated':'','reason':'暂无本地 LRC，请匹配歌曲资料后查看在线歌词'}
    if source!='local':
        try:
            key='lyrics:v3:'+source+':'+sid
            prior=store.cache_get(key,max_age=86400)
            # QQ entries cached before word-timed lyrics lack the key and are refetched once.
            if prior and prior.get('original') and (source!='qqmusic' or 'words' in prior):data=prior
            else:
                data=await asyncio.to_thread(providers[source].lyrics,sid)
                if data.get('original'):store.cache_put(key,data)
        except Exception: data={'original':'','translated':'','reason':'原平台歌词请求失败'}
    if data.get('original'): return data
    track=await track_get(lookup_id)
    try:
        fallback=await cached_remote('lrclib:'+lookup_id,lyrics_lookup,track,store.settings().get('proxy',''),max_age=86400)
        if fallback: return fallback
    except Exception: pass
    return data

@app.get('/api/tracks/{track_id}/comments')
async def comments(track_id:str,offset:int=0,limit:int=20):
    source,sid=source_of(track_id)
    if source=='local':
        linked=store.linked(track_id)
        if not linked: return {'items':[],'total':0,'has_more':False,'reason':'请先匹配网易云或 QQ 音乐歌曲资料'}
        source,sid=source_of(linked)
    offset=max(0,min(offset,100000)); limit=max(1,min(limit,50))
    data=await cached_remote(f'comments:{source}:{sid}:{offset}:{limit}',providers[source].comments,sid,offset,limit,max_age=1800)
    return dict(data,source=source,source_id=sid)

@app.get('/api/tracks/{track_id}/stream')
async def stream(track_id:str,quality:str='standard'):
    source,sid=source_of(track_id)
    if source=='local':
        path=store.path(track_id)
        if not path or not Path(path).is_file(): raise HTTPException(404,'文件已移动或不存在，请重新导入')
        return {'url':f'/api/local/{quote(track_id)}/audio?token={TOKEN}','quality':'original','trial':False,'reason':''}
    result=await asyncio.to_thread(providers[source].stream,sid,quality)
    if result.get('url'):
        ticket=secrets.token_urlsafe(24)
        now=time.time()
        for k in list(media_tickets):
            if now-media_tickets[k]['time']>3600: media_tickets.pop(k,None)
        media_tickets[ticket]={'url':result['url'],'source':source,'time':now}
        result=dict(result,url=f'/api/media/{ticket}?token={TOKEN}')
    return result

@app.get('/api/local/{track_id}/audio')
def local_audio(track_id:str):
    source_of(track_id)
    path=store.path(track_id)
    if not track_id.startswith('local:') or not path or not Path(path).is_file(): raise HTTPException(404,'文件不存在')
    return FileResponse(path,content_disposition_type='inline')

def allowed_media(url):
    p=urlparse(url)
    host=(p.hostname or '').lower()
    suffixes=('music.126.net','music.163.com','qqmusic.qq.com','music.tc.qq.com','aqqmusic.tc.qq.com','stream.qqmusic.qq.com','isure.stream.qqmusic.qq.com','scdn.co','spotifycdn.com','audio-ak-spotify-com.akamaized.net')
    return p.scheme in {'http','https'} and not p.username and not p.password and p.port in {None,80,443} and any(host==s or host.endswith('.'+s) for s in suffixes)

@app.get('/api/media/{ticket}')
async def media(ticket:str,request:Request):
    item=media_tickets.get(ticket)
    if not item or time.time()-item['time']>3600: raise HTTPException(410,'播放地址已过期，请重新播放')
    url=item['url']
    headers={'User-Agent':'Mozilla/5.0','Referer':'https://y.qq.com/' if item['source']=='qqmusic' else 'https://music.163.com/'}
    if request.headers.get('range'): headers['Range']=request.headers['range']
    proxy=store.settings().get('proxy') if item['source']=='spotify' else None
    client=httpx.AsyncClient(timeout=httpx.Timeout(25,read=90),proxy=proxy or None)
    try:
        for _ in range(5):
            if not allowed_media(url): raise HTTPException(400,'平台返回了未识别的音频地址')
            response=await client.send(client.build_request('GET',url,headers=headers),stream=True)
            if response.is_redirect:
                from urllib.parse import urljoin
                url=urljoin(url,response.headers.get('location','')); await response.aclose(); continue
            break
        else: raise HTTPException(502,'音频地址重定向过多')
        if response.status_code not in (200,206):
            await response.aclose(); raise HTTPException(502,'音频服务拒绝了播放请求')
    except Exception:
        await client.aclose(); raise
    async def chunks():
        try:
            async for chunk in response.aiter_bytes(): yield chunk
        finally:
            await response.aclose(); await client.aclose()
    kept={k:v for k,v in response.headers.items() if k.lower() in {'content-length','content-range','accept-ranges'}}
    return StreamingResponse(chunks(),status_code=response.status_code,media_type=response.headers.get('content-type','audio/mpeg'),headers=kept)

@app.get('/api/artwork/{filename}')
def artwork(filename:str):
    if not re.fullmatch(r'[a-f0-9]{24}\.jpg',filename): raise HTTPException(404)
    path=ART/filename
    if not path.is_file(): raise HTTPException(404)
    return FileResponse(path)

class ImportRequest(BaseModel): path:str=Field(min_length=1,max_length=32760); restore:bool=True
class TrackRequest(BaseModel): track_id:str

class ListeningReport(BaseModel):
    session_id:str=Field(pattern=r'^[a-fA-F0-9-]{32,36}$')
    track_id:str
    sequence:int=Field(ge=1,le=10000000)
    listened_ms:int=Field(ge=0,le=86400000)
    finished:bool=False
class BatchTrackRequest(BaseModel):
    track_ids:list[str]=Field(min_length=1,max_length=10000)
    action:str
    playlist_id:str=''
class PlaylistRequest(BaseModel): title:str=Field(min_length=1,max_length=100)
class CookieRequest(BaseModel): cookie:str=Field(max_length=50000)
class WebSessionRequest(BaseModel):
    access_token:str=Field(min_length=1,max_length=20000)
    client_token:str=Field(default='',max_length=20000)
    cookie:str=Field(default='',max_length=50000)

@app.get('/api/library')
def library(): return {'tracks':public_tracks(store.tracks('local',limit=100000))}

async def match_track(track_id):
    local=await track_get(track_id)
    query=local['title']+' '+('' if local['artist']=='未知歌手' else local['artist'])
    results,errors=await search_sources(query,'all',12)
    matches=sorted([dict(t,score=match_score(local,t)) for t in results],key=lambda t:t['score'],reverse=True)
    store.cache_put('matches:'+track_id,{'matches':matches,'errors':errors})
    return {'matches':[public_track(t) for t in matches],'errors':errors}

async def import_worker(job_id,path,restore=True):
    # Choosing a folder again brings back songs removed from it earlier; background rescans keep them removed.
    job=jobs[job_id]
    try:
        paths=await asyncio.to_thread(lambda:list(iter_music(path)))
        job['total']=len(paths); job['status']='running'
        for p in paths:
            try:
                tid='local:'+hashlib.sha256(str(p.resolve()).casefold().encode()).hexdigest()[:24]
                if store.local_removed(tid):
                    if restore or Path(path).is_file():store.restore_local(tid);job['restored']+=1
                    else:
                        job['done']+=1;job['removed']+=1
                        continue
                prior=store.get(tid);stat=p.stat()
                if prior and prior.get('mtime_ns')==stat.st_mtime_ns and prior.get('size')==stat.st_size:
                    job['done']+=1;job['unchanged']+=1
                    continue
                t=await asyncio.to_thread(read_track,p)
                store.upsert(t,str(p.resolve()))
                job['imported']+=1
            except Exception as e:
                job['errors'].append({'file':p.name,'message':'文件无法读取或格式不支持','error_type':type(e).__name__})
            job['done']+=1
            await asyncio.sleep(0)
        job['status']='completed'
        if Path(path).is_dir():store.folder_update(str(Path(path).resolve()),scanned=True)
    except Exception as e:
        job.update(status='failed',message=str(e) if isinstance(e,(FileNotFoundError,ValueError)) else '导入失败')

@app.post('/api/library/import')
async def import_folder(body:ImportRequest):
    path=Path(body.path).expanduser().resolve()
    if not path.exists(): raise HTTPException(404,'音乐文件夹不存在')
    if str(path).startswith('\\\\'): raise ValueError('首版仅支持本机磁盘路径')
    if path.is_dir():store.folder_update(str(path))
    jid=secrets.token_hex(12)
    jobs[jid]={'id':jid,'status':'queued','done':0,'total':0,'imported':0,'restored':0,'unchanged':0,'removed':0,'errors':[]}
    asyncio.create_task(import_worker(jid,path,body.restore))
    return {'job_id':jid}

@app.get('/api/jobs/{job_id}')
def get_job(job_id:str):
    if job_id not in jobs: raise HTTPException(404,'任务不存在')
    return jobs[job_id]

@app.get('/api/music/folders')
def music_folders():return {'folders':store.folders()}

@app.put('/api/music/folders')
def update_folder(body:dict):
    path=str(Path(str(body.get('path',''))).expanduser().resolve())
    if not any(x['path']==path for x in store.folders()):raise ValueError('请先导入这个音乐目录')
    watched=body.get('watched')
    if not isinstance(watched,bool):raise ValueError('请选择是否自动扫描')
    store.folder_update(path,watched=watched);return {'ok':True}

@app.delete('/api/music/folders')
def forget_folder(body:dict):
    store.folder_forget(str(body.get('path','')));return {'ok':True}

@app.on_event('startup')
async def watch_music_folders():
    async def monitor():
        while True:
            await asyncio.sleep(60)
            for folder in store.folders():
                if folder['watched'] and time.time()-(folder['last_scan'] or 0)>300 and Path(folder['path']).is_dir():
                    if any(j.get('path')==folder['path'] and j['status'] in ('queued','running') for j in jobs.values()):continue
                    result=await import_folder(ImportRequest(path=folder['path'],restore=False));jobs[result['job_id']]['path']=folder['path']
    app.state.folder_monitor=asyncio.create_task(monitor())

@app.on_event('shutdown')
async def stop_folder_monitor():
    task=getattr(app.state,'folder_monitor',None)
    if task:task.cancel()

@app.post('/api/library/{track_id}/match')
async def match_local(track_id:str):
    if not track_id.startswith('local:'): raise ValueError('仅匹配本地歌曲')
    return await match_track(track_id)

@app.post('/api/library/{track_id}/link')
async def link_local(track_id:str,body:TrackRequest):
    local=await track_get(track_id); remote=await track_get(body.track_id)
    if local['source']!='local' or remote['source']=='local': raise ValueError('请选择在线平台歌曲资料')
    store.link(track_id,body.track_id)
    await asyncio.gather(lyrics(track_id),comments(track_id),return_exceptions=True)
    return public_track(local)

@app.get('/api/likes')
def likes(): return {'tracks':public_tracks(store.likes())}

@app.post('/api/tracks/batch')
def batch_tracks(body:BatchTrackRequest):
    ids=list(dict.fromkeys(body.track_ids))
    if body.action=='local_remove':return {'ok':True,'count':store.remove_local(ids)}
    if body.action not in ('like','unlike','playlist_add','playlist_remove'):
        raise ValueError('不支持的批量操作')
    if any(not store.get(tid) for tid in ids): raise HTTPException(404,'部分歌曲不存在，请刷新列表')
    if body.action.startswith('playlist_') and not store.playlist(body.playlist_id):
        raise HTTPException(404,'歌单不存在')
    store.batch_tracks(ids,body.action,body.playlist_id)
    return {'ok':True,'count':len(ids)}

@app.post('/api/likes/{track_id}')
async def toggle_like(track_id:str):
    await track_get(track_id)
    return {'liked':store.toggle_like(track_id)}

@app.get('/api/history')
def history(source:str='all',since:float=0,until:float=0):
    return {'tracks':public_tracks(store.history(source,since,until))}

@app.post('/api/history/listening')
def record_listening(body:ListeningReport):
    import uuid
    try:uuid.UUID(body.session_id)
    except ValueError:raise ValueError('无效的播放会话编号')
    if not store.get(body.track_id):raise HTTPException(404,'歌曲尚未加入音乐库')
    return store.record_listening(body.session_id,body.track_id,body.sequence,body.listened_ms,body.finished)

@app.get('/api/history/export')
def export_history(source:str='all',since:float=0,until:float=0):
    return store.export_listening(source,since,until)

@app.post('/api/history')
async def record_history(body:TrackRequest):
    await track_get(body.track_id)
    return {'ok':True,'recorded':store.record_play(body.track_id)}

@app.get('/api/playlists')
def playlists(): return {'playlists':store.playlists()}

@app.post('/api/playlists')
def create_playlist(body:PlaylistRequest):
    title=body.title.strip()
    if not title: raise ValueError('歌单名称不能为空')
    return store.create_playlist(title)

@app.get('/api/playlists/{pid}')
def playlist(pid:str):
    data=store.playlist(pid)
    if not data: raise HTTPException(404,'歌单不存在')
    data['tracks']=public_tracks(data['tracks'])
    return data

@app.delete('/api/playlists/{pid}')
def delete_playlist(pid:str):
    if not store.playlist(pid): raise HTTPException(404,'歌单不存在')
    store.playlist_delete(pid); return {'ok':True}

@app.post('/api/playlists/{pid}/tracks')
async def playlist_add(pid:str,body:TrackRequest):
    if not store.playlist(pid): raise HTTPException(404,'歌单不存在')
    await track_get(body.track_id); store.playlist_add(pid,body.track_id)
    return {'ok':True}

@app.delete('/api/playlists/{pid}/tracks/{track_id}')
def playlist_remove(pid:str,track_id:str): store.playlist_remove(pid,track_id); return {'ok':True}

async def account(source):
    try:
        p=await asyncio.to_thread(providers[source].profile)
        return dict(p,source=source)
    except Exception as e:
        return {'source':source,'logged_in':False,'nickname':{'netease':'网易云音乐','qqmusic':'QQ音乐','spotify':'Spotify'}[source],'membership':'待验证','reason':str(e) if isinstance(e,RuntimeError) else '网络不可用，无法验证登录状态','can_refresh':getattr(e,'code','')=='spotify_session_expired'}

@app.get('/api/accounts')
async def accounts(): return {'accounts':await asyncio.gather(*(account(s) for s in providers))}

@app.post('/api/accounts/{source}/cookie')
async def set_cookie(source:str,body:CookieRequest):
    if source not in {'netease','qqmusic'}: raise HTTPException(400,'该平台使用 OAuth 登录')
    if '\r' in body.cookie or '\n' in body.cookie: raise ValueError('登录状态格式不正确')
    providers[source].set_cookie(body.cookie)
    profile=await account(source)
    if not profile.get('logged_in'):
        providers[source].set_cookie(saved_cookie(source))
        raise HTTPException(400,profile.get('reason') or '登录尚未完成，请在官方窗口登录后重试')
    store.set_secret(source,body.cookie)
    return profile

@app.delete('/api/accounts/{source}')
def logout(source:str):
    if source not in providers: raise HTTPException(404)
    if source=='spotify': providers[source].logout()
    else: providers[source].set_cookie(''); store.set_secret(source,'')
    return {'ok':True}

@app.get('/api/accounts/spotify/login-url')
def spotify_login(): return providers['spotify'].login_url()

@app.post('/api/accounts/spotify/web-session')
async def spotify_web_session(body:WebSessionRequest):
    profile=await asyncio.to_thread(providers['spotify'].set_web_session,body.access_token,body.client_token,body.cookie)
    return dict(profile,source='spotify')

@app.get('/api/accounts/netease/qr')
async def netease_qr():
    return await asyncio.to_thread(providers['netease'].login_qr)

@app.get('/api/accounts/netease/check')
async def netease_check(key:str):
    result=await asyncio.to_thread(providers['netease'].login_check,key)
    cookie=result.pop('cookie',None)
    if result.get('code')==803 and cookie:
        store.set_secret('netease',cookie)
    return result

@app.get('/api/accounts/spotify/callback')
async def spotify_callback(code:str='',state:str='',error:str=''):
    if error: return HTMLResponse('<h2>你已取消 Spotify 授权，可以关闭此页。</h2>',status_code=400)
    try:
        await asyncio.to_thread(providers['spotify'].callback,code,state)
        return HTMLResponse('<meta charset="utf-8"><h2>Spotify 登录成功</h2><p>请返回声屿 MusicPlatform，刷新账号状态。</p>')
    except Exception as e:
        message=str(e) if isinstance(e,(RuntimeError,ValueError)) else '网络请求失败'
        return HTMLResponse('<meta charset="utf-8"><h2>授权未完成</h2><p>'+html.escape(message)+'</p>',status_code=400)

@app.get('/api/accounts/{source}/playlists')
async def account_playlists(source:str):
    if source not in providers: raise HTTPException(404)
    if source=='netease':
        profile=await asyncio.to_thread(providers[source].profile)
        if not profile.get('logged_in'):raise RuntimeError('网易云登录尚未验证，不能判断云端歌单是否为空，请重新连接账号')
    rows=await asyncio.to_thread(providers[source].playlists)
    status=getattr(rows,'status',None) or {'state':'available','count':len(rows),'empty':len(rows)==0,'partial':False,'warnings':[]}
    return {'playlists':rows,'status':status}

@app.get('/api/remote-playlists/{source}/{pid}')
async def remote_playlist(source:str,pid:str):
    if source not in providers: raise HTTPException(404)
    result=await asyncio.to_thread(providers[source].playlist,pid)
    sid=pid.split(':')[-1]
    result.update(id=f'{source}:playlist:{sid}',source=source,source_id=sid,kind='playlist')
    store.entity_put({k:v for k,v in result.items() if k!='tracks'})
    result['saved']=bool(store.entity(result['id']).get('saved'))
    store.upsert_many(result.get('tracks',[]))
    result['tracks']=public_tracks(result.get('tracks',[]))
    return result

@app.get('/api/spotify/devices')
async def spotify_devices(): return {'devices':await asyncio.to_thread(providers['spotify'].devices)}

class SpotifyPlay(BaseModel): track_id:str; device_id:str=''
class SpotifyControl(BaseModel): action:str; value:int|None=None; device_id:str=''
class SpotifyObservation(BaseModel):
    device_id:str=Field(min_length=1,max_length=160,pattern=r'^[A-Za-z0-9_-]+$')
    position_ms:int=Field(ge=0,le=86400000)
    debug_source:str=Field(min_length=1,max_length=80)

@app.post('/api/spotify/player-observation')
def spotify_observation(body:SpotifyObservation):
    return providers['spotify'].observe_player(body.device_id,body.position_ms,body.debug_source)

@app.post('/api/spotify/play')
async def spotify_play(body:SpotifyPlay):
    tid=body.track_id.removeprefix('spotify:')
    if not re.fullmatch(r'[A-Za-z0-9]{22}',tid): raise ValueError('无效的 Spotify ID')
    result=await asyncio.to_thread(providers['spotify'].play,tid,body.device_id)
    return dict(result or {},ok=True)

@app.post('/api/spotify/queue')
async def spotify_queue(body:SpotifyPlay):
    tid=body.track_id.removeprefix('spotify:')
    if not re.fullmatch(r'[A-Za-z0-9]{22}',tid): raise ValueError('无效的 Spotify ID')
    result=await asyncio.to_thread(providers['spotify'].queue,tid,body.device_id)
    return dict(result or {},ok=True)

@app.post('/api/spotify/control')
async def spotify_control(body:SpotifyControl):
    if body.action not in {'pause','resume','next','previous','seek','volume'}: raise ValueError('不支持该播放操作')
    result=await asyncio.to_thread(providers['spotify'].control,body.action,body.value,body.device_id)
    return dict(result or {},ok=True)

@app.get('/api/settings')
def settings(): return store.settings()

@app.put('/api/settings')
def save_settings(body:dict):
    if 'private_session' in body and not isinstance(body['private_session'],bool):raise ValueError('私密收听状态必须为开或关')
    if 'theme' in body and body['theme'] not in ('netease','qqmusic','spotify','aurora','ink','apple'): raise ValueError('未知界面')
    if 'proxy' in body and body['proxy']:
        p=urlparse(body['proxy'])
        if p.scheme not in {'http','https'} or not p.hostname: raise ValueError('代理地址示例：http://127.0.0.1:7890')
    if 'spotify_client_id' in body and body['spotify_client_id'] and not re.fullmatch(r'[a-fA-F0-9]{32}',body['spotify_client_id']): raise ValueError('Spotify Client ID 应为 32 位字符')
    return store.set_settings(body)

from .music_routes import install as install_music_routes
install_music_routes(app,lambda:store,lambda:providers,public_track,track_get,public_tracks)

WEB=Path(os.environ.get('MUSICPLATFORM_WEB',str(Path(__file__).resolve().parents[1]/'dist'/'web')))
if WEB.is_dir(): app.mount('/',StaticFiles(directory=WEB,html=True),name='web')
else:
    @app.get('/')
    def building(): return HTMLResponse('<meta charset="utf-8"><h2>声屿 MusicPlatform</h2><p>前端尚未构建，请先运行 npm run build。</p>')
