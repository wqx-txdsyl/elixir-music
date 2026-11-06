"""Install the unified music workspace routes with live store dependencies."""
import asyncio
import base64
import binascii
import re
import time
from collections import Counter
from fastapi import HTTPException
from fastapi.responses import FileResponse
from . import catalog
from . import cloud_library
from pydantic import BaseModel, Field

class BatchEntities(BaseModel):
    ids:list[str]=Field(min_length=1,max_length=1000)
    saved:bool

class SyncCloudLibrary(BaseModel):
    source:str='all'
    kinds:list[str]=Field(default_factory=lambda:list(cloud_library.KINDS),min_length=1,max_length=4)


def install(app, get_store, get_providers, public_track, track_get, public_tracks):
    searches_in_flight={}
    cloud_in_flight={}

    def cloud_view(source='all'):
        if source not in (*cloud_library.SOURCES,'all'):raise ValueError('未知音乐平台')
        db=get_store();collections=[]
        for name in cloud_library.SOURCES if source=='all' else [source]:
            owner=cloud_library.owner_key(db,name)
            for kind in cloud_library.KINDS:
                snapshot=db.cache_get(cloud_library.cache_key(name,owner,kind)) if owner else None
                item=snapshot or {'source':name,'kind':kind,'tracks':[],'items':[],'count':0,'status':'not_read' if owner else 'login_required','scope':'cloud-read-only'}
                collections.append(dict(item,tracks=public_tracks(item.get('tracks',[]))))
        return {'collections':collections,'cloud_mutations':False}

    @app.get('/api/music/cloud-library')
    def read_cloud_library(source:str='all'):return cloud_view(source)

    @app.post('/api/music/cloud-library/sync')
    async def sync_cloud_library(body:SyncCloudLibrary):
        if body.source not in (*cloud_library.SOURCES,'all') or any(k not in cloud_library.KINDS for k in body.kinds):raise ValueError('请选择有效的平台和收藏类型')
        db=get_store();kinds=list(dict.fromkeys(body.kinds));names=cloud_library.SOURCES if body.source=='all' else [body.source]
        async def refresh(name):
            owner=cloud_library.owner_key(db,name)
            if not owner:return [{'source':name,'kind':k,'message':'请先连接本人平台账号'} for k in kinds]
            key=(id(asyncio.get_running_loop()),id(db),name,owner,tuple(kinds))
            async def run():
                errors=[];provider=get_providers()[name]
                try:
                    profile=await asyncio.to_thread(provider.profile)
                    if not profile.get('logged_in') or not profile.get('user_id'):raise RuntimeError('登录尚未验证，请先连接本人平台账号')
                except Exception as e:return [{'source':name,'kind':k,'message':str(e) if isinstance(e,RuntimeError) else '平台账号验证请求失败'} for k in kinds]
                for kind in kinds:
                    try:
                        snapshot=await asyncio.to_thread(cloud_library.fetch_collection,provider,name,kind,profile)
                        if cloud_library.owner_key(db,name)!=owner:raise RuntimeError('读取期间账号已变化，请重新读取收藏')
                        previous=db.cache_get(cloud_library.cache_key(name,owner,kind))
                        if snapshot.get('partial') and previous and not previous.get('partial'):raise RuntimeError('平台本次只返回部分收藏，已保留上次完整列表')
                        db.upsert_many(snapshot.get('tracks',[]))
                        for item in snapshot.get('items',[]):db.entity_put(item)
                        snapshot.update(synced_at=time.time(),status='partial' if snapshot.get('partial') else 'available')
                        db.cache_put(cloud_library.cache_key(name,owner,kind),snapshot)
                    except Exception as e:errors.append({'source':name,'kind':kind,'message':str(e) if isinstance(e,(RuntimeError,ValueError)) else '平台收藏读取失败；上次读取的列表保留'})
                return errors
            task=cloud_in_flight.get(key)
            if task is None:task=asyncio.create_task(run());cloud_in_flight[key]=task
            try:return await asyncio.shield(task)
            finally:
                if task.done():cloud_in_flight.pop(key,None)
        results=await asyncio.gather(*(refresh(n) for n in names))
        return dict(cloud_view(body.source),errors=[e for group in results for e in group])
    def identity(eid):
        match = re.fullmatch(r'(netease|qqmusic|spotify):(album|artist|playlist|mv):([A-Za-z0-9_-]{1,160})', eid)
        if not match: raise ValueError('无效的音乐实体标识')
        return match.groups()

    def save_result(result):
        db = get_store()
        db.upsert_many(result.get('tracks', []))
        for item in result.get('items', []) + result.get('albums', []): db.entity_put(item)
        if result.get('kind'): db.entity_put({k:v for k,v in result.items() if k not in ('tracks','albums')})
        return dict(result, tracks=public_tracks(result.get('tracks', [])))

    @app.get('/api/music/search')
    async def search(q:str='',kind:str='album',source:str='all',offset:int=0,limit:int=30):
        q=q.strip()[:200]; limit=max(1,min(limit,50));offset=max(0,min(offset,10000))
        if kind not in ('album','artist','playlist','mv'): raise ValueError('请选择歌曲、专辑、歌手、歌单或MV')
        providers=get_providers(); names=list(providers) if source=='all' else [source]
        if any(n not in providers for n in names): raise ValueError('未知平台')
        if not q: return {'items':[],'errors':[],'has_more':False}
        get_store().search_record(q)
        direct=re.fullmatch(r'(netease|qqmusic|spotify):(album|artist|playlist|mv):([A-Za-z0-9_-]{1,160})',q)
        if direct and direct[2]==kind:
            result=await detail(q)
            return {'items':[result],'errors':[],'has_more':False,'offset':0}
        async def one(name):
            try:
                db=get_store();key=f'entity-search:v3:{name}:{kind}:{q}:{offset}:{limit}'
                result=db.cache_get(key,max_age=180)
                if result is None:
                    pending_key=(id(asyncio.get_running_loop()),id(db),key)
                    task=searches_in_flight.get(pending_key)
                    if task is None:
                        task=asyncio.create_task(asyncio.to_thread(catalog.search,providers[name],name,kind,q,limit,offset));searches_in_flight[pending_key]=task
                    try:result=await asyncio.shield(task)
                    finally:
                        if task.done():searches_in_flight.pop(pending_key,None)
                    db.cache_put(key,result)
                save_result(result)
                return dict(result,source=name),None
            except Exception as e:
                message=str(e) if isinstance(e,(RuntimeError,ValueError)) else '该平台请求失败，请稍后重试'
                return {'items':[],'has_more':False},{'source':name,'message':message,'code':getattr(e,'code','')}
        results=await asyncio.gather(*(one(n) for n in names))
        items=[i for r,_ in results for i in r['items']];saved=get_store().saved_ids([i['id'] for i in items])
        return {'items':[dict(i,saved=i['id'] in saved) for i in items], 'errors':[e for _,e in results if e],
                'has_more':any(r.get('has_more') for r,_ in results),'offset':offset,'next_offset':offset+limit}

    @app.get('/api/music/entities/{eid}')
    async def detail(eid:str,offset:int=0,limit:int=50):
        source,kind,sid=identity(eid)
        if kind not in ('album','artist','playlist'): raise ValueError('MV暂请打开官方音乐页面查看')
        provider=get_providers()[source];offset=max(0,offset);limit=max(1,min(limit,100))
        key=f'entity:{eid}:{offset}:{limit}'
        try:
            if kind=='playlist':
                result=await asyncio.to_thread(provider.playlist,sid)
                result={**result,'id':eid,'source_id':sid,'source':source,'kind':kind}
            else:
                result=await asyncio.to_thread(getattr(catalog,kind),provider,source,sid,offset,limit)
            get_store().cache_put(key,result)
        except Exception:
            result=get_store().cache_get(key)
            if result is None: raise
            result=dict(result,stale=True,warning='平台请求失败，正在显示已缓存的资料')
        result=save_result(result)
        saved=get_store().entity(eid)
        return dict(result,saved=bool(saved and saved.get('saved')))

    @app.post('/api/music/entities/{eid}/save')
    async def save_entity(eid:str):
        identity(eid); current=get_store().entity(eid)
        if not current:
            await detail(eid);current=get_store().entity(eid)
        return get_store().entity_save(eid,not current.get('saved'))

    @app.post('/api/music/batch-entities')
    def batch_entities(body:BatchEntities):
        db=get_store();ids=list(dict.fromkeys(body.ids))
        for eid in ids:
            _,kind,_=identity(eid)
            if not db.entity(eid):raise HTTPException(404,'部分资料不存在，请重新搜索')
        with db.lock,db.db:
            db.db.executemany('UPDATE entities SET saved=? WHERE id=?',[( time.time() if body.saved else None,eid) for eid in ids])
        return {'ok':True,'count':len(ids)}

    @app.get('/api/music/library')
    def music_library():
        db=get_store()
        return {'albums':db.saved_entities('album'),'artists':db.saved_entities('artist'),'mvs':db.saved_entities('mv'),
                'playlists':db.playlists()+db.saved_entities('playlist'),'likes':public_tracks(db.likes()),
                'local_count':len(db.tracks('local',limit=100000)),'scope':'local',
                'notice':'本应用音乐库；操作不会自动修改三家云端收藏'}

    @app.get('/api/music/search-history')
    def search_history(): return {'queries':get_store().searches()}

    @app.delete('/api/music/search-history')
    def clear_search_history(): get_store().clear_searches();return {'ok':True}

    @app.delete('/api/history')
    def clear_history(): get_store().clear_history();return {'ok':True}

    @app.get('/api/music/stats')
    def stats(source:str='all',since:float=0,until:float=0):
        return get_store().listening_stats(source,since,until)

    artist_lookup_failed={}
    async def fill_artist_pictures(artists):
        db=get_store();now=time.monotonic()
        missing=[a for a in artists[:12] if not a['cover'] and a.get('entity') and now>artist_lookup_failed.get(a['entity']['id'],0)]
        async def one(item):
            e=item['entity']
            try:
                found=await asyncio.wait_for(asyncio.to_thread(catalog.artist_profile,get_providers()[e['source']],e['source'],e['source_id'],item['name']),8)
            except Exception:found=None
            if not found or not found.get('cover'):artist_lookup_failed[e['id']]=now+600;return
            old={k:v for k,v in (db.entity(e['id']) or {}).items() if v and k!='saved'}
            db.entity_put({**found,**old,'cover':found['cover']});item['cover']=found['cover']
        await asyncio.gather(*(one(a) for a in missing))

    @app.get('/api/music/ranking')
    async def ranking(source:str='all',since:float=0,until:float=0):
        result=await asyncio.to_thread(get_store().listening_ranking,source,since,until)
        await fill_artist_pictures(result['artists'])
        return dict(result,tracks=public_tracks(result['tracks']))

    @app.get('/api/music/listening/tracks/{tid}')
    def track_listening(tid:str):
        if not get_store().get(tid):raise HTTPException(404,'歌曲不存在')
        return get_store().track_listening(tid)

    @app.get('/api/music/listening/entities/{eid}')
    def entity_listening(eid:str):
        identity(eid);return get_store().entity_listening(eid)

    @app.put('/api/playlists/{pid}')
    def edit_playlist(pid:str,body:dict): return get_store().playlist_update(pid,body)

    @app.put('/api/playlists/{pid}/cover')
    def upload_playlist_cover(pid:str,body:dict):
        image=body.get('image')
        if not isinstance(image,str) or not image: raise ValueError('请选择封面图片')
        if image.startswith('data:'): image=image.split(',',1)[-1]
        if len(image)>7_500_000: raise ValueError('封面图片不能超过 5MB')
        try: data=base64.b64decode(image,validate=True)
        except (ValueError,binascii.Error): raise ValueError('封面图片数据无效') from None
        cover=get_store().playlist_set_cover(pid,data)['cover']
        return {'cover':cover,'cover_custom':True}

    @app.delete('/api/playlists/{pid}/cover')
    def reset_playlist_cover(pid:str):
        data=get_store().playlist_clear_cover(pid)
        return {'cover':data['cover'],'cover_custom':False}

    @app.get('/api/playlist-covers/{name}')
    def playlist_cover(name:str):
        path=get_store().playlist_cover_file(name)
        if not path: raise HTTPException(404)
        return FileResponse(path)

    @app.put('/api/playlists/{pid}/order')
    def reorder_playlist(pid:str,body:dict):
        if not get_store().playlist(pid): raise HTTPException(404,'歌单不存在')
        ids=body.get('track_ids')
        if not isinstance(ids,list) or any(not isinstance(x,str) for x in ids): raise ValueError('请选择完整曲序')
        return get_store().playlist_reorder(pid,ids)

    @app.post('/api/playlists/{pid}/copy')
    def copy_playlist(pid:str,body:dict):
        db=get_store();data=db.playlist(pid)
        if not data: raise HTTPException(404,'歌单不存在')
        target=db.create_playlist(str(body.get('title') or data['title']+' · 副本')[:100])
        for t in data['tracks']:db.playlist_add(target['id'],t['id'])
        db.playlist_update(target['id'],{'description':data['description'],'folder':data['folder']})
        return db.playlist(target['id'])

    @app.get('/api/music/trash')
    def trash(): return {'playlists':get_store().playlists(trash=True)}

    @app.get('/api/playlists/{pid}/export')
    def export_playlist(pid:str):
        data=get_store().playlist(pid)
        if not data: raise HTTPException(404,'歌单不存在')
        # Paths, credentials, transient playback URLs and cached API tokens never leave the app.
        allowed={'id','source','source_id','title','artist','album','album_id','cover','duration_ms','source_url','isrc','artist_ids'}
        tracks=[]
        for t in data['tracks']:
            item={k:v for k,v in t.items() if k in allowed}
            if str(item.get('cover','')).startswith('/api/'):item['cover']=''
            tracks.append(item)
        return {'format':'musicplatform-playlist','version':1,'title':data['title'],
                'description':data['description'],'tracks':tracks}

    @app.post('/api/music/import-playlist')
    async def import_playlist(body:dict):
        if body.get('format')!='musicplatform-playlist' or not isinstance(body.get('tracks'),list):
            raise ValueError('请选择本应用导出的歌单JSON')
        entries=body['tracks']
        if len(entries)>10000: raise ValueError('一次最多导入10000条曲目')
        db=get_store();target=db.create_playlist(str(body.get('title') or '导入的歌单')[:100]);failures=[]
        for index,t in enumerate(entries):
            tid=t.get('id','') if isinstance(t,dict) else ''
            if not re.fullmatch(r'(netease|qqmusic|spotify|local):[A-Za-z0-9_-]{1,160}',tid):
                failures.append({'index':index,'title':str(t.get('title','')) if isinstance(t,dict) else '', 'reason':'无效歌曲标识'});continue
            if not db.get(tid):
                if tid.startswith('local:'):
                    failures.append({'index':index,'title':t.get('title',''),'reason':'本机未导入该文件'});continue
                try: await track_get(tid)
                except Exception:
                    failures.append({'index':index,'title':t.get('title',''),'reason':'无法从原平台确认歌曲资料'});continue
            db.playlist_add(target['id'],tid)
        db.playlist_update(target['id'],{'description':str(body.get('description',''))[:4000]})
        return {'playlist':db.playlist(target['id']),'failures':failures,'imported':db.playlist(target['id'])['count']}

    @app.post('/api/music/import-remote')
    async def import_remote(body:dict):
        source=body.get('source');sid=str(body.get('source_id','')).removeprefix(str(source)+':')
        if source not in get_providers() or not re.fullmatch(r'[A-Za-z0-9_-]{1,160}',sid): raise ValueError('请选择有效的云端音乐歌单')
        result=await asyncio.to_thread(get_providers()[source].playlist,sid)
        save_result(result);db=get_store();target=db.create_playlist(str(result.get('title') or '导入歌单')[:100])
        for t in result.get('tracks',[]):db.playlist_add(target['id'],t['id'])
        db.playlist_update(target['id'],{'description':f'从{source}歌单 {sid} 导入；原云端歌单保持原样'})
        return db.playlist(target['id'])

    @app.delete('/api/library/{track_id}/link')
    def unlink(track_id:str):
        if not track_id.startswith('local:'):raise ValueError('仅支持取消本地音乐关联')
        get_store().unlink(track_id);return {'ok':True}

    @app.get('/api/music/discovery')
    def discovery_modes():return {'modes':catalog.DISCOVERY}

    @app.get('/api/spotify/state')
    async def spotify_state():
        data=await asyncio.to_thread(get_providers()['spotify'].state)
        if data.get('transport')=='librespot-bridge':
            return dict(data,playing=bool(data.get('is_playing')))
        if data.get('transport')=='spotify-web-connect':
            return dict(data,playing=bool(data.get('is_playing')),
                track_id=(data.get('track') or {}).get('source_id'))
        return {'playing':bool(data.get('is_playing')),'position_ms':data.get('progress_ms',0),
                'track_id':(data.get('item') or {}).get('id'),'duration_ms':(data.get('item') or {}).get('duration_ms',0),
                'device':{k:v for k,v in (data.get('device') or {}).items() if k in ('id','name','type','volume_percent','is_active')}}

    @app.get('/api/spotify/bridge')
    async def spotify_bridge_status():
        # Status only: must not spawn the sidecar just for a poll.
        bridge=get_providers()['spotify'].bridge()
        info={'running':bridge.is_running(),'logged_in':False,'username':'','membership':'',
              'pairing':None,'device_name':'Elixir Music'}
        if bridge.is_running():
            state=bridge.state()
            info.update(logged_in=bool(state.get('logged_in')),username=state.get('username',''),
                        device_id=state.get('device_id',''))
            info['membership']=await asyncio.to_thread(bridge.membership_state)
            if not info['logged_in']:
                info['pairing']=await asyncio.to_thread(bridge.pairing)
        return info

    @app.post('/api/spotify/bridge/start')
    async def spotify_bridge_start():
        bridge=get_providers()['spotify'].bridge()
        await asyncio.to_thread(bridge.ensure)
        state=bridge.state()
        pairing=None
        if not state.get('logged_in'):
            pairing=await asyncio.to_thread(bridge.pairing)
        return {'running':True,'logged_in':bool(state.get('logged_in')),'username':state.get('username',''),
                'membership':await asyncio.to_thread(bridge.membership_state),'pairing':pairing}

    @app.get('/api/music/discovery/{source}/{mode}')
    async def read_discovery(source:str,mode:str):
        if not any(x['id']==source+':'+mode and x['mode']=='read' for x in catalog.DISCOVERY):raise ValueError('此特色能力尚未接入')
        definition=next(x for x in catalog.DISCOVERY if x['id']==source+':'+mode)
        if definition.get('requires_login'):
            profile=await asyncio.to_thread(get_providers()[source].profile)
            if not profile.get('logged_in'):raise RuntimeError('请先连接该平台账号；匿名默认列表不能当作你的个性化推荐')
        result=await asyncio.to_thread(catalog.discovery,get_providers()[source],source,mode)
        return save_result(result)
