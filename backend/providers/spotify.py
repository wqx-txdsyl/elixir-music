"""Spotify: user-provided browser sessions or optional official OAuth PKCE."""
from __future__ import annotations
import base64
import hashlib
import json
import secrets
import threading
import time
from urllib.parse import urlencode
import requests
from .spotify_web import SpotifyWeb, SpotifyCooldowns, normalize_entity, SpotifySessionExpired

class SpotifyProvider:
    name='spotify'
    def __init__(self,store):
        self.store=store; self.pending={}; self.lock=threading.RLock()
        self.cooldowns=SpotifyCooldowns();self._web_client=None;self._web_context=None
        self._bridge=None
        try: self.tokens=json.loads(store.secret('spotify') or '{}')
        except Exception: self.tokens={}

    def bridge(self):
        """go-librespot sidecar: real in-app audio, created on first use."""
        with self.lock:
            if self._bridge is None:
                from ..librespot_bridge import LibrespotBridge
                from ..store import DATA
                self._bridge=LibrespotBridge(DATA,proxy=self.store.settings().get('proxy',''))
            return self._bridge

    @property
    def redirect_uri(self): return 'http://127.0.0.1:18740/api/accounts/spotify/callback'

    def session(self):
        s=requests.Session()
        proxy=self.store.settings().get('proxy','')
        if proxy: s.proxies={'http':proxy,'https':proxy}
        return s

    def login_url(self):
        client_id=self.store.settings().get('spotify_client_id','').strip()
        if not client_id: raise ValueError('请在设置填写你在 Spotify Developer Dashboard 注册的 Client ID，并登记回调地址 '+self.redirect_uri)
        verifier=secrets.token_urlsafe(64)
        state=secrets.token_urlsafe(32)
        with self.lock:
            self.pending={k:v for k,v in self.pending.items() if time.time()-v['time']<600}
            self.pending[state]={'verifier':verifier,'client_id':client_id,'time':time.time()}
        challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
        scopes='user-read-private user-read-email user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative user-library-read'
        return {'url':'https://accounts.spotify.com/authorize?'+urlencode({'response_type':'code','client_id':client_id,'scope':scopes,'redirect_uri':self.redirect_uri,'state':state,'code_challenge_method':'S256','code_challenge':challenge}),'redirect_uri':self.redirect_uri}

    def callback(self,code,state):
        with self.lock: flow=self.pending.pop(state,None)
        if not flow or time.time()-flow['time']>600: raise ValueError('授权会话已失效，请重新登录')
        r=self.session().post('https://accounts.spotify.com/api/token',data={'client_id':flow['client_id'],'grant_type':'authorization_code','code':code,'redirect_uri':self.redirect_uri,'code_verifier':flow['verifier']},timeout=20)
        if r.status_code!=200: raise RuntimeError(f'Spotify 授权失败 HTTP {r.status_code}')
        self.save_tokens(r.json(),flow['client_id'])
        return self.profile()

    def save_tokens(self,data,client_id=None):
        with self.lock:
            self.tokens.update(data); self.tokens['expires_at']=time.time()+data.get('expires_in',3600)
            if client_id: self.tokens['client_id']=client_id
            self.store.set_secret('spotify',json.dumps(self.tokens))

    def token(self):
        with self.lock:
            if not self.tokens.get('access_token'): raise RuntimeError('Spotify 尚未登录，请在账号页完成官方授权')
            if self.tokens.get('mode')=='web':
                if time.time()>self.tokens.get('expires_at',0):
                    raise SpotifySessionExpired('Spotify 会话需要刷新')
                return self.tokens['access_token']
            if time.time()>self.tokens.get('expires_at',0)-60:
                r=self.session().post('https://accounts.spotify.com/api/token',data={'grant_type':'refresh_token','refresh_token':self.tokens.get('refresh_token',''),'client_id':self.tokens.get('client_id','')},timeout=20)
                if r.status_code!=200: raise RuntimeError('Spotify 授权已过期，请重新登录')
                self.save_tokens(r.json())
            return self.tokens['access_token']

    def api(self,path,method='GET',**kwargs):
        if not isinstance(path,str) or path.startswith('/') or '://' in path or any(c in path for c in ('\r','\n')):
            raise ValueError('无效的 Spotify API 路径')
        self.cooldowns.check('api.spotify.com')
        headers={'Authorization':'Bearer '+self.token()}
        if self.tokens.get('client_token'): headers['Client-Token']=self.tokens['client_token']
        r=self.session().request(method,'https://api.spotify.com/v1/'+path,headers=headers,timeout=20,allow_redirects=False,**kwargs)
        if r.status_code==429:self.cooldowns.limit('api.spotify.com',r.headers.get('Retry-After'))
        if r.status_code==204: return {}
        if not r.ok:
            if r.status_code==401 and self.tokens.get('mode')=='web':raise SpotifySessionExpired('Spotify 会话需要刷新')
            messages={401:'登录已过期',403:'账号、应用权限或会员不满足此操作',404:'没有可用播放设备或资源不存在',429:'请求过于频繁，请稍后再试'}
            raise RuntimeError(messages.get(r.status_code,f'请求失败 HTTP {r.status_code}'))
        return r.json()

    def normalize(self,x):
        album=x.get('album') or {}; imgs=album.get('images') or []
        return {'id':'spotify:'+x['id'],'source':'spotify','source_id':x['id'],'title':x['name'],'artist':' / '.join(a['name'] for a in x.get('artists',[])),
                'artist_ids':[a['id'] for a in x.get('artists',[]) if a.get('id')],
                'artists':[{'id':a['id'],'name':a.get('name','')} for a in x.get('artists',[]) if a.get('id')],
                'disc_number':x.get('disc_number'),'track_number':x.get('track_number'),
                'album':album.get('name',''),'album_id':album.get('id',''),'cover':imgs[0]['url'] if imgs else '', 'duration_ms':x.get('duration_ms',0),
                'availability':'available' if x.get('is_playable') else ('unavailable' if x.get('restrictions') else 'unknown'),
                'source_url':x.get('external_urls',{}).get('spotify','https://open.spotify.com/track/'+x['id']),
                'isrc':x.get('external_ids',{}).get('isrc',''),'preview_url':x.get('preview_url'),'linked_from':x.get('linked_from')}

    def search(self,query,limit=30):
        if self.tokens.get('mode')=='web': return self.web().search(query,limit)
        # Current development-mode Spotify API caps the search page at 10.
        data=self.api('search',params={'q':query,'type':'track','limit':min(limit,10)})
        return [self.normalize(x) for x in data.get('tracks',{}).get('items',[]) if x and x.get('id')]

    def detail(self,id):
        if self.tokens.get('mode')=='web': return self.web().detail(id)
        return self.normalize(self.api('tracks/'+id))

    def web(self):
        context=(self.token(),self.tokens.get('client_token',''),self.tokens.get('cookie',''),self.store.settings().get('proxy',''))
        with self.lock:
            if self._web_client is None or self._web_context!=context:
                if self._web_client is not None:self._web_client.close()
                self._web_client=SpotifyWeb(*context,cooldowns=self.cooldowns);self._web_context=context
            return self._web_client

    def search_entities(self,kind,query,limit=30,offset=0):
        if self.tokens.get('mode')=='web':return self.web().search_entities(kind,query,limit,offset)
        if kind not in ('album','artist','playlist'):raise ValueError('Spotify 当前仅支持歌曲、专辑、歌手及音乐歌单搜索')
        data=self.api('search',params={'q':query,'type':kind,'limit':min(max(1,int(limit)),10),'offset':max(0,int(offset))})
        page=data.get({'album':'albums','artist':'artists','playlist':'playlists'}[kind])
        if not isinstance(page,dict) or not isinstance(page.get('items'),list):raise RuntimeError('Spotify 未返回对应类型的搜索列表')
        items=[normalize_entity(x,kind) for x in page['items'] if x and x.get('id')]
        total=int(page.get('total') or 0)
        return {'items':items,'total':total,'offset':offset,'has_more':offset+len(page['items'])<total}

    def album(self,source_id,offset=0,limit=50):
        if self.tokens.get('mode')=='web':return self.web().album(source_id,offset,limit)
        raw=self.api('albums/'+source_id);result=normalize_entity(raw,'album')
        page=self.api('albums/'+source_id+'/tracks',params={'offset':offset,'limit':min(limit,50)})
        tracks=[self.normalize(dict(x,album=raw)) for x in page.get('items',[]) if x and x.get('id')]
        return dict(result,tracks=tracks,total=page.get('total',len(tracks)),offset=offset,has_more=bool(page.get('next')))

    def artist_profile(self,source_id):
        if self.tokens.get('mode')=='web':return self.web().artist_profile(source_id)
        return normalize_entity(self.api('artists/'+source_id),'artist')
    def artist(self,source_id,offset=0,limit=50):
        if self.tokens.get('mode')=='web':return self.web().artist(source_id,offset,limit)
        raw=self.api('artists/'+source_id);result=normalize_entity(raw,'artist')
        page=self.api('artists/'+source_id+'/albums',params={'offset':offset,'limit':min(limit,50)})
        albums=[normalize_entity(x,'album') for x in page.get('items',[]) if x]
        tracks=[];warnings=[]
        try:tracks=[self.normalize(x) for x in self.api('artists/'+source_id+'/top-tracks').get('tracks',[])]
        except RuntimeError:warnings.append('当前授权无法读取热门曲目；专辑仍可浏览')
        return dict(result,tracks=tracks,albums=albums,total=len(tracks),offset=offset,has_more=False,
                    albums_has_more=bool(page.get('next')),track_scope='热门曲目，不代表全部作品',warnings=warnings)

    def lyrics(self,id):
        if self.tokens.get('mode')=='web':
            sid=str(id).removeprefix('spotify:track:').removeprefix('spotify:')
            cached=self.store.get('spotify:'+sid)
            image=cached.get('cover','') if isinstance(cached,dict) else ''
            return self.web().lyrics(sid,image)
        return {'original':'','translated':'','source':'spotify','status':'unsupported',
                'reason':'Spotify 开发者 OAuth 接口不提供歌词；请使用本人官方网页会话连接 Spotify 歌词服务'}

    def comments(self,id,offset=0,limit=20):
        return {'items':[],'total':0,'has_more':False,'reason':'当前未取得 Spotify 歌曲公开评论的可靠接入证据；不会用播客评论或其他平台评论冒充'}

    def stream(self,id,quality='standard'):
        track=self.detail(id)
        if track.get('preview_url'): return {'url':track['preview_url'],'quality':'preview','trial':True,'reason':'Spotify 官方试听片段'}
        return {'url':None,'quality':quality,'trial':False,'reason':'请使用 Spotify Connect 在已登录的 Premium 设备播放','connect':True,'source_url':track['source_url']}

    def profile(self):
        if not self.tokens.get('access_token'): return {'logged_in':False,'nickname':'Spotify','avatar':'','membership':'未登录','user_id':'','reason':'可在账号页导入你自己的 Cookie 或打开官方网页登录'}
        if self.tokens.get('mode')=='web': return self.web().profile()
        p=self.api('me'); imgs=p.get('images') or []
        return {'logged_in':True,'nickname':p.get('display_name') or p.get('id','Spotify'),'avatar':imgs[0]['url'] if imgs else '', 'membership':p.get('product','未知'),'user_id':p.get('id','')}

    def playlists(self,user_id=''):
        if self.tokens.get('mode')=='web':return self.web().playlists(user_id)
        items=[];path='me/playlists?limit=50'
        while path:
            data=self.api(path)
            if not isinstance(data.get('items'),list):raise RuntimeError('Spotify 未返回本人歌单列表')
            items.extend({'id':'spotify:'+p['id'],'title':p.get('name',''),'cover':(p.get('images') or [{}])[0].get('url',''),'count':(p.get('items') or p.get('tracks') or {}).get('total',0),'source':'spotify'} for p in data['items'] if p)
            nxt=data.get('next');path=nxt.split('/v1/',1)[1] if isinstance(nxt,str) and nxt.startswith('https://api.spotify.com/v1/') else None
            if len(items)>=10000 and path:raise RuntimeError('Spotify 歌单超过单次读取上限')
        return items

    def playlist(self,id):
        id=str(id).removeprefix('spotify:playlist:').removeprefix('spotify:')
        if self.tokens.get('mode')=='web':return self.web().playlist(id)
        data=self.api('playlists/'+id)
        tracks=[]
        # July 2026 API uses items/item; older authorized applications may still return tracks/track.
        page=data.get('items') or data.get('tracks') or {}
        while True:
            for x in page.get('items',[]):
                item=x.get('item') or x.get('track') or {}
                if item.get('id') and item.get('type','track')=='track': tracks.append(self.normalize(item))
            nxt=page.get('next')
            if not nxt or not nxt.startswith('https://api.spotify.com/v1/') or len(tracks)>=3000: break
            page=self.api(nxt.split('/v1/',1)[1])
        return {'id':'spotify:'+id,'title':data.get('name',''),'cover':(data.get('images') or [{}])[0].get('url',''),'tracks':tracks}

    def devices(self):
        if self.tokens.get('mode')=='web':
            return self.web().devices()
        return self.api('me/player/devices').get('devices',[])
    def state(self):
        if self.tokens.get('mode')=='web':
            return self.web().state()
        return self.api('me/player')
    def observe_player(self,device_id,position_ms,debug_source):
        if self.tokens.get('mode')!='web':raise ValueError('本地播放器观察仅适用于 Spotify 官方网页会话')
        return self.web().observe_player(device_id,position_ms,debug_source)
    def play(self,id,device_id=''):
        if self.tokens.get('mode')=='web':
            return self.web().play(id,device_id)
        return self.api('me/player/play',method='PUT',params={'device_id':device_id} if device_id else {},json={'uris':['spotify:track:'+id]})
    def queue(self,id,device_id=''):
        if self.tokens.get('mode')=='web':return self.web().queue(id,device_id)
        return self.api('me/player/queue',method='POST',params=dict({'uri':'spotify:track:'+id},**({'device_id':device_id} if device_id else {})))
    def control(self,action,value=None,device_id=''):
        if self.tokens.get('mode')=='web':return self.web().control(action,value,device_id)
        paths={'pause':('PUT','pause',{}),'resume':('PUT','play',{}),'next':('POST','next',{}),'previous':('POST','previous',{}),'seek':('PUT','seek',{'position_ms':int(value or 0)}),'volume':('PUT','volume',{'volume_percent':min(100,max(0,int(value or 0)))})}
        method,path,params=paths[action]
        return self.api('me/player/'+path,method=method,params=dict(params,**({'device_id':device_id} if device_id else {})))
    def logout(self):
        if self._web_client is not None:self._web_client.close()
        self._web_client=None;self._web_context=None
        if self._bridge is not None:
            self._bridge.stop();self._bridge.forget_credentials()
        self.tokens={}; self.store.set_secret('spotify','')

    def set_web_session(self,access_token,client_token='',cookie=''):
        if not access_token or len(access_token)>20000 or '\n' in access_token or '\r' in access_token:
            raise ValueError('无效的 Spotify 网页登录凭证')
        if any(c in client_token+cookie for c in ('\r','\n')): raise ValueError('登录状态格式不正确')
        previous=dict(self.tokens)
        with self.lock:
            self.tokens={'access_token':access_token,'client_token':client_token,'cookie':cookie,'mode':'web','expires_at':time.time()+3500}
            try:
                profile=self.profile()
                if not profile.get('logged_in'): raise RuntimeError('Spotify 尚未确认登录，请在官方窗口完成登录后重试')
                self.store.set_secret('spotify',json.dumps(self.tokens))
                return profile
            except Exception:
                self.tokens=previous
                raise
