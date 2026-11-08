"""Track links and authorized catalog access for additional music services."""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
from urllib.parse import parse_qs, quote, urljoin, urlsplit

import requests
from bs4 import BeautifulSoup

from .bodian_login import BodianLogin
from .public_music import MusicSession, PLATFORMS, duration_seconds, track


SOURCES = ('qishui', 'bodian', 'tidal', 'soundcloud', 'amazon', 'pandora', 'qobuz', 'kkbox', 'audiomack', 'anghami')
TRACK_PATHS = {
    'qishui': r'/(?:qishui/)?(?:song|track)/[0-9]+/?',
    'bodian': r'/m/bodian/playMusic\.html',
    'tidal': r'/(?:browse/)?track/[0-9]+/?',
    'soundcloud': r'/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/?',
    'amazon': r'/(?:tracks|albums)/[A-Z0-9]{10}/?',
    'pandora': r'/artist/(?:[^/]+/)+TR[A-Za-z0-9]+/?',
    'qobuz': r'/track/[0-9]+/?',
    'kkbox': r'/(?:[a-z]{2}/[a-z]{2}/)?(?:song|track)/[A-Za-z0-9_-]+/?',
    'audiomack': r'/[A-Za-z0-9_-]+/song/[A-Za-z0-9_-]+/?',
    'anghami': r'/song/[0-9]+/?',
}
PARTNER_ENDPOINTS = {
    'tidal': ('https://auth.tidal.com/v1/oauth2/token', 'Bearer'),
    'soundcloud': ('https://secure.soundcloud.com/oauth/token', 'OAuth'),
    'kkbox': ('https://account.kkbox.com/oauth2/token', 'Bearer'),
}
CATALOG_AUTH = {source: platform['catalogAuth'] for source, platform in PLATFORMS.items() if 'catalogAuth' in platform}
BODIAN_WEB = 'https://h5app.kuwo.cn'
BODIAN_HEADERS = {'plat':'h5','ver':'','channel':'','uid':'','sid':'','token':'','Origin':BODIAN_WEB,'Referer':BODIAN_WEB+'/'}
QISHUI_API = 'https://api.qishui.com'
QISHUI_PC = {'aid':386088,'app_name':'luna_pc','region':'cn','geo_region':'cn','os_region':'cn',
             'device_platform':'windows','version_code':30070000,'version_name':'3.7.0','channel':'official'}
QISHUI_SEARCH = {'aid':386088,'app_name':'luna','channel':'google_play','device_platform':'android','os_version':'14','version_code':8986}


def catalog_credentials(source, credentials):
    config=CATALOG_AUTH[source]
    fields={key:value.strip() for key,value in credentials.items()}
    region=fields.pop('COUNTRY','') if config.get('region') else ''
    if not any(set(fields)==set(method) for method in config['methods']):
        raise ValueError('请填写该平台所需的授权字段')
    if any(not value or len(value)>8192 or not value.isascii() or re.search(r'[\x00-\x20\x7f]',value) for value in fields.values()):
        raise ValueError('授权字段格式无效')
    if region:
        if not re.fullmatch('[A-Za-z]{2}',region):
            raise ValueError('请输入两位地区代码')
        fields['COUNTRY']=region.upper()
    return fields


def safe_url(source, value):
    try:
        url = urlsplit(value)
        return url.scheme == 'https' and not url.username and not url.password and not url.port and any(
            url.hostname == host or (url.hostname or '').endswith('.' + host) for host in PLATFORMS[source]['hosts'])
    except (TypeError, ValueError):
        return False


def canonical_track_link(source, value):
    if not safe_url(source, value):
        return ''
    url = urlsplit(value)
    params = parse_qs(url.query)
    match = re.fullmatch(TRACK_PATHS[source], url.path, re.I)
    if source == 'qishui':
        sid = url.path.rstrip('/').split('/')[-1] if match else (params.get('track_id') or [''])[0] if url.path == '/qishui/share/track' else ''
        return f'https://music.douyin.com/qishui/share/track?track_id={sid}' if re.fullmatch('[0-9]{5,25}',sid) else ''
    if source == 'bodian' and match:
        sid=next((v[0] for k,v in params.items() if k.lower() in {'musicid','songid','id','rid'} and re.fullmatch('[0-9]{1,20}',v[0])),'')
        return 'https://h5app.kuwo.cn/m/bodian/playMusic.html?musicId='+sid if sid else ''
    if source == 'amazon' and match:
        sid=(params.get('trackAsin') or [url.path.strip('/').split('/')[-1] if url.path.startswith('/tracks/') else ''])[0]
        return f'https://music.amazon.com/tracks/{sid.upper()}' if re.fullmatch('[A-Z0-9]{10}',sid,re.I) else ''
    if not match:
        return ''
    if source == 'tidal':return 'https://tidal.com/track/'+url.path.rstrip('/').split('/')[-1]
    if source == 'qobuz':return 'https://open.qobuz.com/track/'+url.path.rstrip('/').split('/')[-1]
    if source == 'anghami':return 'https://play.anghami.com'+url.path.rstrip('/')
    if source == 'soundcloud':
        owner,slug=url.path.strip('/').split('/')
        if owner in {'search','discover','pages','settings','you'} or slug in {'sets','tracks','likes','followers','following','reposts','albums','popular-tracks'}:
            return ''
    return 'https://'+url.hostname+url.path.rstrip('/')


def link_identity(source,value):
    url=canonical_track_link(source,value)
    if not url:return None
    path=urlsplit(url).path
    if source=='qishui':sid=parse_qs(urlsplit(url).query)['track_id'][0]
    elif source=='bodian':sid=parse_qs(urlsplit(url).query)['musicId'][0]
    elif source in {'tidal','amazon','pandora','qobuz','kkbox','anghami'}:sid=path.split('/')[-1]
    else:sid='url-'+hashlib.sha256(url.encode()).hexdigest()[:24]
    return sid,url


def short_track_link(source,value):
    if not safe_url(source,value):return False
    url=urlsplit(value)
    return (source=='qishui' and url.hostname=='qishui.douyin.com' and re.fullmatch(r'/s/[A-Za-z0-9_-]+/?',url.path)
            or source=='soundcloud' and url.hostname=='on.soundcloud.com' and re.fullmatch(r'/[A-Za-z0-9_-]+/?',url.path))


def resolve_short_link(source,url):
    try:
        with MusicSession() as client:
            for _ in range(4):
                if not safe_url(source,url):break
                if identity:=link_identity(source,url):return identity
                with client.get(url,allow_redirects=False,stream=True) as response:
                    if not response.is_redirect:break
                    url=urljoin(url,response.headers.get('Location',''))
    except requests.RequestException as exc:
        raise RuntimeError('原平台短链接暂时无法访问') from exc
    return None


def page_soup(source,url):
    with MusicSession() as client:
        client.headers['User-Agent']='Mozilla/5.0'
        for _ in range(4):
            if not safe_url(source,url):raise ValueError('平台跳转地址无效')
            with client.get(url,allow_redirects=False,stream=True) as response:
                if response.is_redirect:
                    url=urljoin(url,response.headers.get('Location',''));continue
                response.raise_for_status()
                body=bytearray()
                for chunk in response.iter_content(65536):
                    body.extend(chunk)
                    if len(body)>2_500_000:raise RuntimeError('歌曲页面过大')
                return BeautifulSoup(body.decode(response.encoding or 'utf-8',errors='replace') if response.encoding and response.encoding.lower()!='iso-8859-1' else bytes(body),'html.parser')
    raise RuntimeError('歌曲链接重定向过多')


def metadata(soup,key):
    tag=soup.find('meta',attrs={'property':key}) or soup.find('meta',attrs={'name':key})
    return str(tag.get('content','')).strip() if tag else ''


def qishui_metadata(soup,sid,url):
    for script in soup.select('script[data-script-src="modern-inline"]'):
        value=script.string or ''
        start=value.find('{')
        if start<0:continue
        try:
            data,_=json.JSONDecoder().raw_decode(value[start:])
            audio=data['loaderData']['track_page']['audioWithLyricsOption']
            info=audio['trackInfo']
        except (KeyError, TypeError, ValueError):continue
        if str(info.get('id'))!=sid:continue
        album=info.get('album') or {}
        cover=album.get('url_cover') or {}
        images=cover.get('url_list',[]) if isinstance(cover,dict) else []
        return track('qishui',sid,audio.get('trackName'),audio.get('artistName',''),album.get('name',''),images[0] if images else '',url=url)
    return None


def bodian_track(data):
    sid=str(data.get('id') or '')
    if not re.fullmatch('[0-9]{1,20}',sid):
        return None
    return track('bodian',sid,data.get('name'),data.get('artist',''),data.get('album',''),data.get('albumPic',''),
                 duration_seconds(data.get('duration'))*1000,url=BODIAN_WEB+'/m/bodian/playMusic.html?musicId='+sid)


def qishui_search_track(entity):
    data=entity.get('track') or (entity.get('track_wrapper') or {}).get('track') or {}
    sid=str(data.get('id') or '')
    if not re.fullmatch('[0-9]{5,25}',sid):
        return None
    album=data.get('album') or {}
    cover=album.get('url_cover') or {}
    images=cover.get('url_list') or []
    if not images and cover.get('urls') and cover.get('uri'):
        images=[urljoin(cover['urls'][0],cover['uri'])]
    artists=[{'name':row['name'],'id':str(row.get('id') or '')} for row in data.get('artists') or [] if row.get('name')]
    return track('qishui',sid,data.get('name'),' / '.join(row['name'] for row in artists),album.get('name',''),
                 images[0] if images else '',duration_seconds(data.get('duration')),album_id=album.get('id'),artists=artists,
                 url='https://music.douyin.com/qishui/share/track?track_id='+sid)


def page_track(source,sid,url):
    if source=='bodian':
        try:
            with MusicSession() as client:
                response=client.get('https://bd-api.kuwo.cn/api/music/info',allow_redirects=False,
                                    params={'uid':'','sid':'','token':'','musicId':sid},
                                    headers=BODIAN_HEADERS)
                response.raise_for_status()
                data=response.json().get('data') or {}
        except (requests.RequestException,ValueError) as exc:
            raise RuntimeError('波点未返回单曲资料') from exc
        if str(data.get('id'))!=sid or not (entry:=bodian_track(data)):raise RuntimeError('波点未确认该歌曲编号')
        return entry
    try:soup=page_soup(source,url)
    except requests.RequestException as exc:raise RuntimeError('原平台未开放该链接，无法读取歌曲资料') from exc
    if source=='qishui':
        result=qishui_metadata(soup,sid,url)
        if result:return result
        raise RuntimeError('汽水分享页没有返回该歌曲资料')
    title=metadata(soup,'og:title')
    artist=metadata(soup,'music:musician:name') or metadata(soup,'music:artist')
    if artist.startswith(('http://','https://')):artist=''
    og_url=metadata(soup,'og:url')
    if og_url and not canonical_track_link(source,og_url):raise RuntimeError('平台没有返回单曲页面')
    album=''
    for script in soup.select('script[type="application/ld+json"]'):
        try:node=json.loads(script.string or '')
        except ValueError:continue
        for candidate in (node.get('@graph',[node]) if isinstance(node,dict) else node if isinstance(node,list) else []):
            if not isinstance(candidate,dict) or candidate.get('@type')!='MusicRecording':continue
            title=candidate.get('name') or title
            credit=candidate.get('byArtist') or []
            artist=' / '.join(x['name'] for x in (credit if isinstance(credit,list) else [credit]) if isinstance(x,dict) and x.get('name')) or artist
            record=candidate.get('inAlbum')
            if isinstance(record,dict):album=record.get('name','')
    title=re.split(r'\s+\|\s+(?:Play on |Listen on )?(?:TIDAL|Anghami|Audiomack|Pandora|SoundCloud|KKBOX|Qobuz|Amazon Music).*$',title,flags=re.I)[0]
    if source in {'anghami','tidal'} and not artist and ' - ' in title:artist,title=title.split(' - ',1)
    if source=='audiomack' and not artist:
        if match:=re.fullmatch(r'(.+) by (.+): Listen on Audiomack',title):title,artist=match.groups()
    if source=='soundcloud' and not artist:
        artist=metadata(soup,'author') or metadata(soup,'soundcloud:user')
        if artist.startswith(('http://','https://')):artist=urlsplit(artist).path.strip('/').split('/')[0]
    if not title or title.casefold() in {'pandora','open qobuz','tidal','soundcloud','波点音乐','amazon music','kkbox'} or 'not found' in title.casefold():
        raise RuntimeError('平台没有返回可核验的单曲资料')
    duration=duration_seconds(metadata(soup,'music:duration'))*1000
    return track(source,sid,title,artist,album,metadata(soup,'og:image'),duration,url=url)


def observed_track(source,requested,loaded,title,artist,cover):
    initial=link_identity(source,requested)
    final=link_identity(source,loaded)
    if not final or (initial and initial[0]!=final[0]) or (not initial and not short_track_link(source,requested)):
        raise ValueError('官方窗口没有打开请求的单曲')
    name=PLATFORMS[source]['name']
    title=re.split(r'\s*[|–]\s*(?:Play on |Listen on )?'+re.escape(name)+r'\s*$',title,flags=re.I)[0].strip()
    if not title or title.casefold()==name.casefold() or re.search(r'^(not found|open qobuz|loading|request blocked)$',title,re.I):
        raise ValueError('原平台页面没有提供歌曲名称')
    sid,url=final
    return track(source,sid,title,artist,cover=cover if cover.startswith('https://') else '',url=url)


class LinkedMusicProvider:
    kinds={'track'}

    def __init__(self,name,store,credentials=None):
        self.name=name
        self.store=store
        self.lock=threading.Lock()
        self.cached_token=('',0)
        self.credentials={}
        self.catalog_revision=''
        if name=='bodian':
            self.bodian=BodianLogin(store,self.request)
        if name in CATALOG_AUTH:
            try:
                saved=json.loads(store.secret('catalog:'+name) or '{}') if credentials is None else credentials
                if isinstance(saved,dict) and all(isinstance(value,str) for value in saved.values()):
                    self.credentials=catalog_credentials(name,saved)
                    self.catalog_revision=str(time.time_ns())
            except (ValueError, OSError, RuntimeError):
                pass

    def secret(self,key):
        if self.credentials:
            return self.credentials.get(key,'')
        return os.environ.get('ELIXIR_'+self.name.upper()+'_'+key,'').strip()

    def configure_catalog(self,credentials):
        values=catalog_credentials(self.name,credentials)
        candidate=LinkedMusicProvider(self.name,self.store,values)
        if not candidate.search('love',3):raise RuntimeError('目录验证未返回歌曲，请核对 API 权限和地区')
        with self.lock:
            self.store.set_secret('catalog:'+self.name,json.dumps(values))
            self.credentials=values
            self.cached_token=candidate.cached_token
            self.catalog_revision=candidate.catalog_revision

    def clear_catalog(self):
        with self.lock:
            self.store.set_secret('catalog:'+self.name,'')
            self.credentials={}
            self.cached_token=('',0)
            self.catalog_revision=str(time.time_ns())

    def has_catalog(self):
        if self.name in {'bodian','qishui'}:return True
        if self.name=='amazon':return bool(self.secret('ACCESS_TOKEN') and self.secret('DEVICE_ID'))
        if self.name=='qobuz':return bool(self.secret('ACCESS_TOKEN') and self.secret('CLIENT_ID'))
        pair=bool(self.secret('CLIENT_ID') and self.secret('CLIENT_SECRET'))
        if self.name=='audiomack':return pair
        return self.name in PARTNER_ENDPOINTS and bool(self.secret('ACCESS_TOKEN') or pair)

    def token(self):
        token=self.secret('ACCESS_TOKEN')
        if token:return token
        endpoint,_=PARTNER_ENDPOINTS[self.name]
        with self.lock:
            token,until=self.cached_token
            if token and time.monotonic()<until:return token
            credentials=(self.secret('CLIENT_ID'),self.secret('CLIENT_SECRET'))
            form={'grant_type':'client_credentials'}
            auth=credentials if self.name in {'tidal','soundcloud'} else None
            if auth is None:form.update(client_id=credentials[0],client_secret=credentials[1])
            payload=self.request('POST',endpoint,data=form,auth=auth)
            token=payload.get('access_token')
            if not token:raise RuntimeError('平台未签发目录访问凭证')
            self.cached_token=(token,time.monotonic()+max(1,int(payload.get('expires_in',3600))-60))
            return token

    @staticmethod
    def request(method,url,**kwargs):
        try:
            with MusicSession() as client:
                response=client.request(method,url,allow_redirects=False,**kwargs)
                response.raise_for_status()
                return response.json()
        except (requests.RequestException,ValueError) as exc:
            raise RuntimeError('平台目录授权或网络请求失败') from exc

    def qishui_profile(self,cookie):
        if not cookie:
            return {'logged_in':False}
        data=self.request('GET',QISHUI_API+'/luna/pc/me',params=QISHUI_PC,headers={'Cookie':cookie})
        profile=data.get('my_info') or {}
        if data.get('status_code')!=0 or not isinstance(profile,dict) or not profile:
            return {'logged_in':False,'reason':'汽水会话已失效或未完成验证'}
        return {'logged_in':True,'nickname':profile.get('nickname') or '汽水音乐',
                'membership':profile.get('vip_stage') or ('VIP' if profile.get('is_vip') else '')}

    def qishui_stream(self,sid,quality):
        headers={}
        if cookie:=self.store.secret('qishui'):headers['Cookie']=cookie
        data=self.request('GET',QISHUI_API+'/luna/h5/track_v2',headers=headers,
                          params={'track_id':sid,'device_platform':'web','media_type':'track'})
        song=data.get('track') or {}
        expected=duration_seconds(song.get('duration'))
        address=(data.get('track_player') or {}).get('url_player_info') or ''
        target=urlsplit(address)
        if str(song.get('id'))!=sid or expected<=0 or target.scheme!='https' or target.netloc!='vod-luna.douyin.com':
            return None
        info=self.request('GET',address)
        variants=(info.get('Result') or {}).get('Data',{}).get('PlayInfoList',[])
        variants=[row for row in variants if isinstance(row,dict) and not row.get('EncryptionMethod') and not row.get('PlayAuth')
                  and isinstance(row.get('Duration'),(int,float)) and abs(row['Duration']*1000-expected)<=1500
                  and isinstance(row.get('MainPlayUrl'),str) and row['MainPlayUrl'].startswith('https://')]
        if not variants:
            return None
        desired={'low':64000,'standard':128000}.get(quality,256000)
        best=min(variants,key=lambda row:abs(duration_seconds(row.get('Bitrate'))-desired))
        return {'url':best['MainPlayUrl'],'quality':quality if quality in {'low','standard','high'} else 'high','trial':False}

    def search(self,query,limit=30):
        if not self.has_catalog():return self.store.tracks(self.name,query,limit)
        if self.name=='qishui':
            headers={'User-Agent':'com.luna.music/8986 (Linux; U; Android 14)'}
            if cookie:=self.store.secret('qishui'):headers['Cookie']=cookie
            data=self.request('GET',QISHUI_API+'/luna/search/track',headers=headers,
                              params={**QISHUI_SEARCH,'q':query,'cursor':0,'count':min(limit,50)})
            if data.get('status_code',0)!=0:
                raise RuntimeError('汽水曲库请求失败，请检查会话')
            tracks={}
            for group in data.get('result_groups') or []:
                for row in group.get('data') or []:
                    if entry:=qishui_search_track(row.get('entity') or {}):tracks.setdefault(entry['id'],entry)
            return list(tracks.values())[:limit]
        if self.name=='bodian':
            params={'keyword':query,'pn':0,'rn':min(limit,50),'correct':1}
            if session:=self.bodian.session():
                data=self.bodian.call('/api/search/music/list',query=params,session=session)
            else:
                data=self.request('GET','https://bd-api.kuwo.cn/api/search/music/list',headers=BODIAN_HEADERS,
                                  params={**params,'uid':'','token':''})
            if data.get('code')==11012:
                raise RuntimeError('波点会话已失效，请重新扫码登录')
            if data.get('code')!=200:
                raise RuntimeError('波点曲库暂未返回搜索结果')
            return [entry for row in (data.get('data') or {}).get('resultList',[])
                    if isinstance(row,dict) and (entry:=bodian_track(row))][:limit]
        if self.name=='tidal':
            data=self.request('GET','https://openapi.tidal.com/v2/searchResults/'+quote(query,safe=''),
                              headers={'Authorization':'Bearer '+self.token(),'Accept':'application/vnd.api+json'},
                              params={'countryCode':self.secret('COUNTRY') or 'US','include':'tracks'})
            rows=[entry for entry in data.get('included',[]) if entry.get('type')=='tracks']
        elif self.name=='soundcloud':
            data=self.request('GET','https://api.soundcloud.com/tracks',headers={'Authorization':'OAuth '+self.token()},
                              params={'q':query,'limit':min(limit,50),'linked_partitioning':'true'})
            rows=data.get('collection',[]) if isinstance(data,dict) else data
        elif self.name=='kkbox':
            data=self.request('GET','https://api.kkbox.com/v1.1/search',headers={'Authorization':'Bearer '+self.token()},
                              params={'q':query,'type':'track','limit':min(limit,50),'territory':self.secret('COUNTRY') or 'TW'})
            rows=(data.get('tracks') or {}).get('data',[])
        elif self.name=='amazon':
            headers={'Authorization':'Bearer '+self.secret('ACCESS_TOKEN'),'X-Amzn-Device-Id':self.secret('DEVICE_ID')}
            data=self.request('POST','https://api.music.amazon.com/v2/search/tracks',headers=headers,
                              params={'first':min(limit,50)},json={'searchFilters':[{'query':query}]})
            rows=data.get('items',[])
        elif self.name=='audiomack':
            from requests_oauthlib import OAuth1
            auth=OAuth1(self.secret('CLIENT_ID'),self.secret('CLIENT_SECRET'))
            data=self.request('GET','https://api.audiomack.com/v1/search',auth=auth,params={'q':query,'show':'songs','limit':min(limit,50)})
            rows=data.get('results',[])
        elif self.name=='qobuz':
            data=self.request('GET','https://www.qobuz.com/api.json/0.2/track/search',
                              headers={'X-App-Id':self.secret('CLIENT_ID'),'X-User-Auth-Token':self.secret('ACCESS_TOKEN')},
                              params={'query':query,'limit':min(limit,50)})
            rows=(data.get('tracks') or {}).get('items',[])
        else:return self.store.tracks(self.name,query,limit)
        return [entry for raw in rows if isinstance(raw,dict) and (entry:=self.normalize(raw))][:limit]

    def normalize(self,raw):
        sid=str(raw.get('id') or '')
        title=raw.get('title') or raw.get('name')
        artist=raw.get('artist') or raw.get('performer') or {}
        artist=artist.get('name','') if isinstance(artist,dict) else artist
        album=raw.get('album') or {}
        album_name=(album.get('name') or album.get('title') or '') if isinstance(album,dict) else str(album)
        cover=''
        duration=duration_seconds(raw.get('duration'))*1000
        url=raw.get('url','')
        if self.name=='tidal':
            info=raw.get('attributes') or {}
            title=info.get('title')
            url='https://tidal.com/track/'+sid
        elif self.name=='soundcloud':
            url=raw.get('permalink_url','')
            artist=(raw.get('user') or {}).get('username','')
            cover=raw.get('artwork_url','')
            duration=int(raw.get('duration') or 0)
        elif self.name=='kkbox':
            artist=(album.get('artist') or {}).get('name','') if isinstance(album,dict) else artist
            images=album.get('images') or [] if isinstance(album,dict) else []
            cover=images[-1].get('url','') if images else ''
            duration=int(raw.get('duration') or 0)
            url=url or 'https://www.kkbox.com/tw/tc/song/'+sid
        elif self.name=='amazon':
            artists=raw.get('artists') or []
            artist=' / '.join((value.get('name') or value.get('title') or '') for value in artists if isinstance(value,dict)) or artist
            url='https://music.amazon.com/tracks/'+sid
        elif self.name=='audiomack':
            uploader=raw.get('uploader') or {}
            url='https://audiomack.com/'+str(uploader.get('url_slug',''))+'/song/'+str(raw.get('url_slug',''))
            cover=raw.get('image','')
        elif self.name=='qobuz':
            url='https://open.qobuz.com/track/'+sid
            cover=(album.get('image') or {}).get('large','') if isinstance(album,dict) else ''
        identity=link_identity(self.name,url)
        return track(self.name,identity[0],title,artist,album_name,cover,duration,url=identity[1]) if identity else None

    def from_link(self,url):
        identity=resolve_short_link(self.name,url) if short_track_link(self.name,url) else link_identity(self.name,url)
        if not identity:raise ValueError('请输入该平台的单曲分享链接')
        sid,url=identity
        old=self.store.get(f'{self.name}:{sid}')
        return old or page_track(self.name,sid,url)

    def detail(self,sid):
        entry=self.store.get(f'{self.name}:{sid}')
        if entry:return entry
        raise ValueError('请先搜索或导入这首歌曲的官方链接')

    def stream(self,sid,quality):
        entry=self.detail(sid)
        url=entry['source_url']
        if self.name=='qishui':
            if stream:=self.qishui_stream(sid,quality):
                return stream
            return {'transport':'official-web','source_url':url,'reason':'当前未取得整首音频，官方分享页可能仅提供试听'}
        if self.name=='bodian':
            data=self.request('GET','https://bd-api.kuwo.cn/api/playbasic/music/v2/audioUrl',headers=BODIAN_HEADERS,
                              params={'uid':'','sid':'','token':'','musicId':sid,'format':'mp3','br':'320kmp3'})
            audio=data.get('data') or {}
            stream_url=audio.get('audioHttpsUrl') or ''
            expected=entry.get('duration_ms') or 0
            actual=duration_seconds(audio.get('duration'))*1000
            if data.get('code')==200 and expected>0 and abs(actual-expected)<=4000 and stream_url.startswith('https://'):
                return {'url':stream_url,'quality':'high','trial':False}
            if (session:=self.bodian.session()) and (stream:=self.bodian_account_stream(sid,quality,session)):
                return stream
            if data.get('code')==20018:
                return {'transport':'official-web','source_url':url,'reason':'该版本需要在波点解锁'}
        if self.name=='tidal':url='https://listen.tidal.com/track/'+sid
        return {'transport':'official-web','source_url':url}

    def bodian_account_stream(self,sid,quality,session):
        detail=self.bodian.call('/api/service/music/info',query={'musicId':sid},session=session).get('data') or {}
        context=detail.get('freeSign') or detail.get('fsig') or ''
        right={'musicId':int(sid),'freeSign':context if isinstance(context,str) and len(context)<=4096 else ''}
        result=self.bodian.call('/api/play/music/v2/checkRight',query=right,body=right,signed=True,session=session)
        status=(result.get('data') or {}).get('status')
        if result.get('code')!=200 or status is None or str(status) in {'3','7'}:
            return None
        use_lossless=quality=='lossless'
        bitrate='2000kflac' if use_lossless else '128kmp3' if quality=='standard' else '320kmp3'
        body={**right,'devId':self.bodian.device(),'format':'flac' if use_lossless else 'mp3','br':bitrate}
        result=self.bodian.call('/api/play/music/v2/audioUrl',query=body,body=body,signed=True,session=session)
        url=(result.get('data') or {}).get('audioHttpsUrl')
        if result.get('code')==200 and isinstance(url,str) and url.startswith('https://'):
            return {'url':url,'quality':quality,'trial':False}
        return None

    def search_entities(self,kind,query,limit,offset):
        return {'items':[],'has_more':False}

    @staticmethod
    def lyrics(sid):
        return {'original':'','translated':'','reason':'请在原平台查看歌词'}

    @staticmethod
    def comments(sid,offset,limit):
        return {'items':[],'total':0,'has_more':False,'reason':'请在原平台查看评论'}
