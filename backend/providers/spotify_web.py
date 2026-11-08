"""Official Spotify web-session metadata; no token generation or credential discovery.

Persisted queries are pinned to the public WebPlayer bundles captured 2026-10-31.
The caller supplies tokens captured from its own official login window.
"""
from __future__ import annotations

import base64
import html
import json
import re
import math
import threading
import time
import secrets
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse, quote, unquote

import requests
import websocket


PARTNER_URL = 'https://api-partner.spotify.com/pathfinder/v2/query'

class SpotifySessionExpired(RuntimeError):
    code='spotify_session_expired'
PRODUCT_URL = 'https://spclient.wg.spotify.com/melody/v1/product_state'
CONNECT_URL = 'https://spclient.wg.spotify.com/connect-state/v1'
LYRICS_URL = 'https://spclient.wg.spotify.com/color-lyrics/v2'
QUERIES = {
    'findTracks': '903df2a65d8121e27d73a2be03c01e88ebe6021bb6d4eb82a389e35d87e51d27',
    'queryTrack': '00cbe89de90be30c57c5a4c3ce9e3b759c843d9d3324374aacc13d4845ea36ff',
    'searchTracks': 'b02683192a98dde7966b5e6655a79eeb62713eab703eda9902c932818dd52751',
    'searchAlbums': '202cb3305e31e5a0767ba7925f28bd728cf8f8b0217e6da43909056071cd70e9',
    'searchArtists': '7bf95d754fdbe32c8b161fbbe54d1ae50974900df4dce4c8f1afcbcad153224d',
    'searchPlaylists': 'd520014e748f9ea44f7707d8df1819867ac1205e8b7f3e28f22fe5fc858921b1',
    'libraryV3': '390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455',
    'fetchLibraryTracks': '087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240',
    'fetchPlaylist': '21ea11a6ac75a5f3e01fd365d29c18e0a4a8b7dc09f89bbb5d73910190c6acaf',
    'getAlbum': '0b6ce3511e1b02e4a40fa95440f992acbe85080eb308af9194322d708fc1914f',
    'queryArtistOverview': '9f8134ef565e78621f1e1793555bd6633c5ac144ae0f89604ed3ae3f80b3c8e6',
    'queryArtistDiscographyAll': '5e07d323febb57b4a56a42abbf781490e58764aa45feb6e3dc0591564fc56599',
}
MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36'


class SpotifyRateLimitError(RuntimeError):
    status_code = 429

    def __init__(self, seconds):
        self.retry_after_seconds = max(1, math.ceil(seconds))
        self.retry_at = time.time() + self.retry_after_seconds
        super().__init__(f'平台正在限流，请等待约 {self.retry_after_seconds} 秒后重试；应用已暂停重复请求')


class SpotifyHttpError(RuntimeError):
    def __init__(self,status_code,message):
        self.status_code=status_code
        super().__init__(message)


def retry_after_seconds(value, now=None):
    now = time.time() if now is None else now
    try:
        seconds = float(value)
        if math.isfinite(seconds) and seconds >= 0:
            return max(1, seconds)
    except (TypeError, ValueError):
        pass
    try:
        return max(1, parsedate_to_datetime(str(value)).timestamp()-now)
    except (TypeError, ValueError, OverflowError):
        return 60


class SpotifyCooldowns:
    """Shared across short-lived provider clients; never sleeps a UI/request thread."""
    def __init__(self):
        self.lock = threading.RLock()
        self.deadlines = {}

    def check(self, host):
        with self.lock:
            remaining = self.deadlines.get(host, 0)-time.time()
        if remaining > 0:
            raise SpotifyRateLimitError(remaining)

    def limit(self, host, retry_after=None):
        seconds = retry_after_seconds(retry_after)
        with self.lock:
            self.deadlines[host] = max(self.deadlines.get(host, 0), time.time()+seconds)
        raise SpotifyRateLimitError(seconds)


def initial_state(document: str) -> dict:
    """Decode the public server-rendered state without executing any script."""
    for attrs, content in re.findall(r'<script\b([^>]*)>(.*?)</script\s*>', document, re.S | re.I):
        if not re.search(r'\bid\s*=\s*[\"\']initialState[\"\']', attrs, re.I):
            continue
        content = html.unescape(content.strip())
        try:
            data = json.loads(content)
        except (ValueError, TypeError):
            try:
                data = json.loads(base64.b64decode(content, validate=True).decode('utf8'))
            except (ValueError, UnicodeError) as exc:
                raise RuntimeError('Spotify 网页资料格式已变化') from exc
        if isinstance(data, dict):
            return data
    raise RuntimeError('Spotify 网页没有返回可验证的账号资料')


def _image(value) -> str:
    if isinstance(value, str):
        return value if value.startswith('https://') else ''
    if isinstance(value, list):
        return _image(value[0]) if value else ''
    if isinstance(value, dict):
        return value.get('url', '') or _image(value.get('sources') or value.get('items') or [])
    return ''


def _unwrap(value):
    for _ in range(5):
        if not isinstance(value, dict): return {}
        child = value.get('itemV2') or value.get('item') or value.get('track')
        if isinstance(child, dict): value = child; continue
        if isinstance(value.get('data'), dict): value = value['data']; continue
        return value
    return value if isinstance(value, dict) else {}


def _source_id(value, kind):
    value = str(value).removeprefix('spotify:'+kind+':').removeprefix('spotify:')
    if not re.fullmatch(r'[A-Za-z0-9]{22}', value):
        raise ValueError('Spotify 音乐实体 ID 应为22位字母数字')
    return value


def _is_kind(raw, kind):
    """Some official selections omit __typename, but still include typed URIs."""
    return (isinstance(raw, dict) and raw.get('__typename', kind.capitalize()) == kind.capitalize()
            and str(raw.get('uri', '')).startswith('spotify:'+kind+':'))


def _total(page):
    value = page.get('totalCount')
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise RuntimeError('Spotify 分页没有返回可验证的总数，不能确认列表完整性')
    return value


def normalize_entity(raw, kind):
    raw = _unwrap(raw)
    uri = raw.get('uri', '')
    sid = _source_id(uri or raw.get('id', ''), kind)
    profile = raw.get('profile') or {}
    biography = profile.get('biography') or {}
    if isinstance(biography, dict): biography = biography.get('text', '')
    name = raw.get('name') or profile.get('name')
    if not name:
        raise RuntimeError('Spotify 返回的音乐实体缺少名称')
    artists = raw.get('artists') or []
    if isinstance(artists, dict): artists = artists.get('items') or []
    cover = (_image(raw.get('coverArt')) or _image(raw.get('images'))
             or _image((raw.get('visuals') or {}).get('avatarImage')))
    return {'id':f'spotify:{kind}:{sid}', 'source':'spotify', 'source_id':sid, 'kind':kind,
            'title':html.unescape(str(name)), 'cover':cover,
            'artist':' / '.join((a.get('profile') or {}).get('name') or a.get('name','') for a in artists),
            'artist_ids':[str(a.get('uri','')).removeprefix('spotify:artist:') or a.get('id','') for a in artists],
            'description':html.unescape(re.sub(r'<[^>]+>', '', str(raw.get('description') or biography or ''))),
            'published_at':(raw.get('date') or {}).get('isoString') or raw.get('release_date') or (raw.get('date') or {}).get('year'),
            'count':raw.get('total_tracks') or (raw.get('tracks') or {}).get('total') or (raw.get('tracks') or {}).get('totalCount') or 0,
            'source_url':f'https://open.spotify.com/{kind}/{sid}', 'metadata_source':'spotify-web',
            'company':html.unescape(str(raw.get('label') or '')),
            'genres':raw.get('genres') or [],'copyrights':raw.get('copyrights') or [],
            'information':([{'label':'月听众','value':str((raw.get('stats') or {}).get('monthlyListeners'))}] if (raw.get('stats') or {}).get('monthlyListeners') is not None else [])}


def normalize_track(track: dict) -> dict:
    uri = track.get('uri', '')
    track_id = uri.removeprefix('spotify:track:') if uri.startswith('spotify:track:') else track.get('id', '')
    if not track_id or track.get('__typename', 'Track') != 'Track' or not track.get('name'):
        raise RuntimeError('Spotify 没有返回有效的歌曲资料')
    album = track.get('albumOfTrack') or {}
    playable = (track.get('playability') or {}).get('playable')
    artists=[]
    seen=set()
    # Search and detail persisted queries use different artist selections.
    for field in ('artists','firstArtist','otherArtists'):
        group=track.get(field) or []
        items=group.get('items',[]) if isinstance(group,dict) else group if isinstance(group,list) else []
        for raw in items:
            artist=_unwrap(raw)
            name=(artist.get('profile') or {}).get('name') or artist.get('name','')
            identity=artist.get('uri') or artist.get('id') or name
            if identity and identity not in seen:
                seen.add(identity);artists.append(artist)
    return {
        'id': 'spotify:' + track_id, 'source': 'spotify', 'source_id': track_id,
        'title': track['name'], 'artist': ' / '.join(name for a in artists if (name:=(a.get('profile') or {}).get('name') or a.get('name',''))),
        'artist_ids':[a.get('uri','').removeprefix('spotify:artist:') for a in artists if a.get('uri','').startswith('spotify:artist:')],
        'artists':[{'id':a['uri'].removeprefix('spotify:artist:'),'name':(a.get('profile') or {}).get('name') or a.get('name','')} for a in artists if a.get('uri','').startswith('spotify:artist:')],
        'album': album.get('name', ''), 'album_id': album.get('uri', '').removeprefix('spotify:album:'),
        'cover': _image(album.get('coverArt')), 'duration_ms': int((track.get('duration') or track.get('trackDuration') or {}).get('totalMilliseconds') or 0),
        'availability': 'available' if playable is True else 'unavailable' if playable is False else 'unknown',
        'source_url': 'https://open.spotify.com/track/' + track_id,
        'linked_from': (track.get('relinkingInformation') or {}).get('linkedTrack'),
        'metadata_source': 'spotify-web',
        'disc_number':track.get('discNumber'), 'track_number':track.get('trackNumber'),
    }


class SpotifyWeb:
    def __init__(self, access_token, client_token='', cookie='', proxy='', cooldowns=None):
        for value in (access_token, client_token, cookie):
            if any(c in value for c in ('\r', '\n')) or len(value) > 65536:
                raise ValueError('Spotify 登录状态格式不正确')
        self.access_token = access_token
        self.client_token = client_token
        self.cookie = cookie
        self.cooldowns = cooldowns or SpotifyCooldowns()
        self._session_lock = threading.RLock()
        self._connect_lock = threading.RLock()
        self._connect_condition = threading.Condition()
        self._connect_socket = None
        self._connect_cluster = None
        self._connect_revision = 0
        self._connect_retry_at = 0
        self._connect_error = ''
        self._connect_local_id = secrets.token_hex(20)
        self._connect_base = CONNECT_URL
        self._player_observations = {}
        self._player_observation_sequence = 0
        self._proxy = proxy
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': MOBILE_UA})
        if proxy:
            self.session.proxies = {'http': proxy, 'https': proxy}

    def _json(self, method, url, connection_id='', **kwargs):
        if not self.access_token:
            raise RuntimeError('请先在应用内完成 Spotify 官方网页登录')
        parsed = urlparse(url)
        regional=bool(re.fullmatch(r'[a-z0-9-]+-spclient\.spotify\.com',parsed.hostname or ''))
        if (parsed.scheme!='https' or not (regional or parsed.hostname in {'api.spotify.com','api-partner.spotify.com','spclient.wg.spotify.com'})
                or parsed.username or parsed.password or parsed.port not in (None,443)):
            raise ValueError('不允许将 Spotify 会话发送到该地址')
        cooldown_host='spclient.wg.spotify.com' if regional else parsed.hostname
        self.cooldowns.check(cooldown_host)
        headers = {'Authorization': 'Bearer ' + self.access_token, 'Accept': 'application/json', 'App-Platform':'WebPlayer'}
        if self.client_token:
            headers['Client-Token'] = self.client_token
        if connection_id:
            if len(connection_id)>65536 or any(c in connection_id for c in ('\r','\n')):
                raise ValueError('Spotify 连接状态格式不正确')
            headers['X-Spotify-Connection-Id'] = connection_id
        # 空闲的长连接可能已被对方关闭，读取类请求遇到断连时重试一次；播放控制不重试，免得重复执行。
        attempts=2 if method.upper()=='GET' or parsed.hostname=='api-partner.spotify.com' else 1
        for attempt in range(attempts):
            try:
                with self._session_lock:
                    self.session.cookies.clear()
                    response = self.session.request(method, url, headers=headers, timeout=20, verify=True, allow_redirects=False, **kwargs)
                break
            except requests.ConnectionError:
                if attempt+1<attempts:continue
                raise RuntimeError('Spotify 网络连接失败，请检查网络或代理后重试') from None
            except requests.RequestException:
                raise RuntimeError('Spotify 网络连接失败，请检查网络或代理后重试') from None
        if response.status_code == 429:
            self.cooldowns.limit(cooldown_host, response.headers.get('Retry-After'))
        if not response.ok:
            if response.status_code==401:raise SpotifySessionExpired('Spotify 会话需要刷新')
            reasons={401:'登录凭证已过期，请刷新官方网页登录状态',403:'当前网页会话无权读取该资源',404:'资源不存在或当前账号不可见'}
            raise SpotifyHttpError(response.status_code,reasons.get(response.status_code, f'网页接口请求失败（HTTP {response.status_code}）'))
        if response.status_code == 204:
            return {}
        try:
            result = response.json()
        except ValueError as exc:
            raise RuntimeError('Spotify 网页接口返回了无法读取的数据') from exc
        if not isinstance(result, dict):
            raise RuntimeError('Spotify 网页接口数据格式已变化')
        return result

    def _state(self, path='/'):
        # Only the user-supplied cookie is sent, and only to Spotify's own page.
        if not path.startswith('/') or path.startswith('//') or any(x in path for x in ('\r','\n')):
            raise ValueError('无效的 Spotify 页面路径')
        self.cooldowns.check('open.spotify.com')
        headers = {'Cookie': self.cookie} if self.cookie else {}
        for attempt in range(2):
            try:
                with self._session_lock:
                    self.session.cookies.clear()
                    response = self.session.get('https://open.spotify.com' + path, headers=headers, timeout=20, verify=True, allow_redirects=False)
                break
            except requests.ConnectionError:
                if attempt:raise RuntimeError('Spotify 网络连接失败，请检查网络或代理后重试') from None
        if response.status_code == 429:
            self.cooldowns.limit('open.spotify.com',response.headers.get('Retry-After'))
        if not response.ok:
            raise RuntimeError(f'Spotify 官方网页 HTTP {response.status_code}')
        return initial_state(response.text)

    def _query(self, operation, variables):
        data = self._json('POST', PARTNER_URL, json={
            'operationName': operation, 'variables': variables,
            'extensions': {'persistedQuery': {'version': 1, 'sha256Hash': QUERIES[operation]}},
        })
        if data.get('errors'):
            if any((e.get('extensions') or {}).get('code') in ('RATE_LIMITED','TOO_MANY_REQUESTS') for e in data['errors']):
                self.cooldowns.limit('api-partner.spotify.com')
            # Do not echo arbitrary upstream text that may contain request details.
            raise RuntimeError('Spotify 网页查询被拒绝或查询版本已变化，请刷新登录或更新应用')
        if not isinstance(data.get('data'), dict):
            raise RuntimeError('Spotify 网页查询没有返回资料')
        return data['data']

    def search(self, query, limit=30):
        result = self._query('searchTracks', self._search_variables(query,limit,0))
        page = (result.get('searchV2') or {}).get('tracksV2')
        if not isinstance(page, dict) or not isinstance(page.get('items'), list):
            raise RuntimeError('Spotify 搜索结果格式已变化')
        return [normalize_track(t) for x in page['items'] if _is_kind(t:=_unwrap(x),'track')]

    @staticmethod
    def _search_variables(query,limit,offset):
        return {'searchTerm':query, 'limit':max(1,min(int(limit),100)), 'offset':max(0,int(offset)),
                'includePreReleases':False,'includeAlbumPreReleases':False,'numberOfTopResults':20,
                'includeAudiobooks':False,'includeAuthors':False,'includeEpisodeContentRatingsV2':False}

    def search_entities(self,kind,query,limit=30,offset=0):
        operations={'album':('searchAlbums','albumsV2'),'artist':('searchArtists','artists'),'playlist':('searchPlaylists','playlists')}
        if kind not in operations:raise ValueError('Spotify 当前仅支持歌曲、专辑、歌手及音乐歌单搜索')
        operation,key=operations[kind]
        result=self._query(operation,self._search_variables(query,limit,offset))
        page=(result.get('searchV2') or {}).get(key)
        if not isinstance(page,dict) or not isinstance(page.get('items'),list):raise RuntimeError('Spotify 网页实体搜索结果格式已变化')
        items=[normalize_entity(t,kind) for x in page['items'] if _is_kind(t:=_unwrap(x),kind)]
        total=_total(page)
        return {'items':items,'total':total,'offset':offset,'has_more':offset+len(page['items'])<total}

    @staticmethod
    def _lyric_lines(lines,sync_type):
        if not isinstance(lines,list) or any(not isinstance(x,dict) or not isinstance(x.get('words'),str) for x in lines):
            raise RuntimeError('Spotify 歌词行格式已变化')
        text=[html.unescape(x['words']).replace('\r','').replace('\n',' ') for x in lines]
        starts=[]
        for line in lines:
            value=line.get('startTimeMs')
            try:
                number=float(value)
                starts.append(int(number) if not isinstance(value,bool) and math.isfinite(number) and number>=0 else None)
            except (TypeError,ValueError,OverflowError):starts.append(None)
        timed=bool(sync_type in ('LINE_SYNCED','SYLLABLE_SYNCED') and starts and all(x is not None for x in starts)
                   and (len(starts)==1 or any(x>0 for x in starts)))
        if timed:
            return '\n'.join(f'[{ms//60000:02d}:{(ms//1000)%60:02d}.{(ms%1000)//10:02d}]{words}' for ms,words in zip(starts,text)),True,starts
        return '\n'.join(text),False,starts

    def lyrics(self,source_id,image_url=''):
        sid=_source_id(source_id,'track')
        base={'original':'','translated':'','source':'spotify','source_id':sid,'provider':'',
            'provider_display_name':'','metadata_source':'spotify-color-lyrics-v2',
            'source_url':'https://open.spotify.com/track/'+sid,'status':'unavailable','partial':False}
        path=LYRICS_URL+'/track/'+sid
        # Current official WebPlayer includes its own cover URL for lyric colors.
        # The URL is encoded as a path component; no credential is sent to the image host.
        parsed=urlparse(image_url) if isinstance(image_url,str) else None
        if (parsed and len(image_url)<=4096 and parsed.scheme=='https' and not parsed.username and not parsed.password
                and (parsed.hostname=='i.scdn.co' or (parsed.hostname or '').endswith('.spotifycdn.com'))
                and not any(c in image_url for c in ('\r','\n'))):
            path+='/image/'+quote(image_url,safe='')
        try:
            data=self._json('GET',path,params={'format':'json','vocalRemoval':'false','market':'from_token'})
        except SpotifyRateLimitError as exc:
            return dict(base,status='rate_limited',http_status=429,reason=str(exc),
                retry_after_seconds=exc.retry_after_seconds,retry_at=exc.retry_at)
        except SpotifyHttpError as exc:
            states={401:('authentication_required','Spotify 网页登录凭证已过期，请在官方登录窗口刷新登录状态'),
                    403:('forbidden','Spotify 当前账号或所在地区没有获得此歌曲的歌词访问权限'),
                    404:('unavailable','Spotify 当前未提供该版本歌词，或当前账号不可见')}
            if exc.status_code not in states:raise
            status,reason=states[exc.status_code]
            return dict(base,status=status,http_status=exc.status_code,reason=reason)
        raw=data.get('lyrics')
        if not isinstance(raw,dict) or not isinstance(raw.get('lines'),list):
            raise RuntimeError('Spotify 未返回可验证的歌词数据')
        partial=raw.get('capStatus')=='CAPPED'
        lines=raw.get('previewLines',[]) if partial else raw['lines']
        original,timed,starts=self._lyric_lines(lines,raw.get('syncType'))
        translated='';translated_language=''
        alternatives=raw.get('alternatives') or []
        if not isinstance(alternatives,list):raise RuntimeError('Spotify 歌词翻译格式已变化')
        for alternative in alternatives:
            if not isinstance(alternative,dict) or not str(alternative.get('language','')).lower().startswith('zh'):continue
            alt=alternative.get('lines')
            if not isinstance(alt,list) or len(alt)!=len(lines) or any(not isinstance(x,str) for x in alt):continue
            translated_language=alternative.get('language','')
            translated=self._lyric_lines([{'words':v,'startTimeMs':starts[i]} for i,v in enumerate(alt)],raw.get('syncType') if timed else 'UNSYNCED')[0]
            break
        available=any(x['words'].strip() for x in lines)
        reason=('Spotify 当前账号仅提供歌词预览' if partial else '') if available else 'Spotify 当前没有返回可显示的歌词'
        return dict(base,original=original,translated=translated,provider=str(raw.get('provider') or ''),
            provider_display_name=str(raw.get('providerDisplayName') or raw.get('provider') or ''),
            sync_type=raw.get('syncType'),format='lrc' if timed else 'text',timed=timed,
            language=raw.get('language') or '',translated_language=translated_language,line_count=len(lines),
            status=('partial' if partial else 'available') if available else 'unavailable',partial=partial,reason=reason)

    def detail(self, source_id):
        track_id = source_id.removeprefix('spotify:track:').removeprefix('spotify:')
        if not re.fullmatch(r'[A-Za-z0-9]{22}', track_id):
            raise ValueError('Spotify 歌曲 ID 应为 22 位字母数字')
        result = self._query('queryTrack', {'uri': 'spotify:track:' + track_id, 'includeVideoAssociations': True})
        item = result.get('trackUnion') or {}
        if item.get('__typename') != 'Track':
            raise RuntimeError('Spotify 没有返回这首歌曲，可能已下架或地区不可见')
        return normalize_track(item)

    def profile(self):
        """Require a real current-user ID; anonymous SSR also says PREMIUM."""
        account = None
        source = ''
        membership = '未知'
        membership_source = 'unknown'
        if self.cookie:
            state = self._state()
            session = state.get('session') or {}
            profile = (session.get('me') or {}).get('profile') or {}
            if session.get('isAnonymous') is not False or not profile.get('id'):
                raise RuntimeError('Spotify 尚未返回已登录用户 ID；请在官方窗口完成登录后重试')
            product=session.get('product') or {}
            return {'logged_in':True,'user_id':str(profile['id']),'nickname':profile.get('name') or profile['id'],
                    'avatar':_image(profile.get('images') or profile.get('image') or profile.get('avatar')),
                    'membership':product.get('product') or product.get('catalogue') or '未知',
                    'verification_source':'official-page-session','membership_source':'https://open.spotify.com/ initialState.session.product'}
        try:
            me = self._json('GET', 'https://api.spotify.com/v1/me')
            if me.get('id') and me.get('type', 'user') == 'user':
                account = {'user_id': str(me['id']), 'nickname': me.get('display_name') or me['id'],
                           'avatar': _image(me.get('images'))}
                membership = me.get('product') or '未知'
                membership_source = 'https://api.spotify.com/v1/me' if me.get('product') else 'unknown'
                source = 'web-api-me'
        except (RuntimeError, requests.RequestException):
            pass
        if account is None:
            raise RuntimeError('Spotify 尚未返回已登录用户 ID；匿名网页凭证不能登录，请在官方窗口完成登录后重试')
        # A cookie can be logged in while the separately captured token is still
        # anonymous. Only a token whose /me identity was verified may override
        # membership from the independently verified cookie session.
        if source == 'web-api-me':
            try:
                product = self._json('GET', PRODUCT_URL)
                membership = product.get('product') or product.get('catalogue') or membership
                if product.get('product') or product.get('catalogue'):
                    membership_source = PRODUCT_URL
            except (RuntimeError, requests.RequestException):
                pass
        return {'logged_in': True, **account, 'membership': membership,
                'verification_source': source, 'membership_source': membership_source}

    def playlists(self, user_id=''):
        items=[];seen=set();offset=0
        while offset<10000:
            data=self._query('libraryV3',{'filters':['Playlists'],'order':None,'textFilter':None,'features':[],
                'limit':100,'offset':offset,'flatten':True,'expandedFolders':[],'folderUri':None,'includeFoldersWhenFlattening':False})
            page=(data.get('me') or {}).get('libraryV3')
            if not isinstance(page,dict) or page.get('__typename')!='LibraryPage' or not isinstance(page.get('items'),list):
                raise RuntimeError('Spotify 未返回本人音乐歌单列表，请刷新官方网页登录状态')
            rows=page['items'];total=_total(page)
            for x in rows:
                raw=_unwrap(x)
                if raw.get('__typename')!='Playlist':continue
                item=normalize_entity(raw,'playlist')
                if item['source_id'] not in seen:
                    seen.add(item['source_id']);items.append(dict(item,id='spotify:'+item['source_id'],count=None,count_known=False))
            offset+=len(rows)
            if offset>=total:return items
            if not rows:raise RuntimeError('Spotify 歌单分页提前结束，不能将不完整结果当成空歌单')
        raise RuntimeError('Spotify 歌单超过单次读取上限，未将截断结果当成完整资料库')

    def playlist(self, source_id):
        sid=_source_id(source_id,'playlist');tracks=[];offset=0;filtered=0;total=0;metadata=None
        while offset<10000:
            data=self._query('fetchPlaylist',{'uri':'spotify:playlist:'+sid,'offset':offset,'limit':100,
                'enableWatchFeedEntrypoint':False,'includeEpisodeContentRatingsV2':False})
            raw=data.get('playlistV2')
            if not isinstance(raw,dict) or raw.get('__typename')!='Playlist':raise RuntimeError('Spotify 歌单不存在或当前账号无权查看')
            page=raw.get('content')
            if not isinstance(page,dict) or page.get('__typename')!='PlaylistItemsPage' or not isinstance(page.get('items'),list):raise RuntimeError('Spotify 歌单曲目格式已变化')
            if metadata is None:metadata=normalize_entity(raw,'playlist')
            rows=page['items'];total=_total(page)
            for index,x in enumerate(rows):
                item=_unwrap(x)
                if _is_kind(item,'track'):
                    track=normalize_track(item);track['list_position']=offset+index+1;tracks.append(track)
                else:filtered+=1
            offset+=len(rows)
            if offset>=total:break
            if not rows:raise RuntimeError('Spotify 歌单分页提前结束，不能把部分曲目当作完整歌单')
        return {**metadata,'id':'spotify:'+sid,'tracks':tracks,'count':len(tracks),'total':total,
                'partial':offset<total,'filtered_nonmusic_count':filtered,'scope':'music_only',
                'warning':'歌单超过单次读取上限，当前只显示部分曲目' if offset<total else ''}

    def album(self,source_id,offset=0,limit=50):
        sid=_source_id(source_id,'album');limit=max(1,min(int(limit),100));offset=max(0,int(offset))
        data=self._query('getAlbum',{'uri':'spotify:album:'+sid,'locale':'','offset':offset,'limit':limit})
        raw=data.get('albumUnion')
        if not isinstance(raw,dict) or raw.get('__typename')!='Album':raise RuntimeError('Spotify 未返回该专辑，可能不存在或地区不可见')
        page=raw.get('tracksV2')
        if not isinstance(page,dict) or not isinstance(page.get('items'),list):raise RuntimeError('Spotify 专辑曲目格式已变化')
        result=normalize_entity(raw,'album');tracks=[]
        for index,x in enumerate(page['items']):
            t=_unwrap(x)
            if not _is_kind(t,'track'):continue
            t={**t,'albumOfTrack':t.get('albumOfTrack') or raw}
            track=normalize_track(t);track['list_position']=offset+index+1;tracks.append(track)
        total=_total(page)
        return dict(result,tracks=tracks,total=total,offset=offset,has_more=offset+len(page['items'])<total)

    def artist_profile(self,source_id):
        sid=_source_id(source_id,'artist')
        raw=self._query('queryArtistOverview',{'uri':'spotify:artist:'+sid,'locale':'','preReleaseV2':False}).get('artistUnion')
        if not isinstance(raw,dict) or raw.get('__typename')!='Artist':raise RuntimeError('Spotify 未返回该艺人，可能不存在或地区不可见')
        return normalize_entity(raw,'artist')

    def artist(self,source_id,offset=0,limit=50):
        sid=_source_id(source_id,'artist');limit=max(1,min(int(limit),100));offset=max(0,int(offset))
        data=self._query('queryArtistOverview',{'uri':'spotify:artist:'+sid,'locale':'','preReleaseV2':False})
        raw=data.get('artistUnion')
        if not isinstance(raw,dict) or raw.get('__typename')!='Artist':raise RuntimeError('Spotify 未返回该艺人，可能不存在或地区不可见')
        result=normalize_entity(raw,'artist')
        songs=(raw.get('discography') or {}).get('topTracks') or {}
        tracks=[normalize_track(t) for x in songs.get('items',[]) if _is_kind(t:=_unwrap(x),'track')]
        releases=self._query('queryArtistDiscographyAll',{'uri':'spotify:artist:'+sid,'offset':offset,'limit':limit,'order':'DATE_DESC'})
        page=((releases.get('artistUnion') or {}).get('discography') or {}).get('all')
        if not isinstance(page,dict) or not isinstance(page.get('items'),list):raise RuntimeError('Spotify 艺人发行列表格式已变化')
        total=_total(page);albums=[];seen=set()
        for group in page['items']:
            versions=(group.get('releases') or {}).get('items')
            if not isinstance(versions,list):raise RuntimeError('Spotify 艺人发行版本格式已变化')
            for release in versions:
                t=_unwrap(release)
                if not _is_kind(t,'album'):continue
                e=normalize_entity(t,'album')
                if e['id'] not in seen:seen.add(e['id']);albums.append(e)
        return dict(result,tracks=tracks,albums=albums,total=len(tracks),offset=offset,has_more=False,
                    albums_total=total,albums_has_more=offset+len(page['items'])<total,
                    track_scope='Spotify 官方艺人概览中的热门歌曲，不代表全部作品',warnings=[])

    def _accept_cluster(self, cluster):
        if not isinstance(cluster,dict) or not ('player_state' in cluster or 'devices' in cluster):
            raise RuntimeError('Spotify 未返回可验证的 Connect 播放状态')
        # 本机时钟可能和 Spotify 服务器差几秒（系统未对时）。用集群里的服务器时间估出时差，
        # 网络延迟只会让估计偏小，所以取最近几次里最大的那个。
        try:server_ms=int(cluster.get('server_timestamp_ms') or 0)
        except (TypeError,ValueError):server_ms=0
        with self._connect_condition:
            if server_ms:
                samples=[x for x in self.__dict__.get('_clock_samples',[]) if time.monotonic()-x[0]<600][-9:]
                samples.append((time.monotonic(),server_ms-time.time()*1000))
                self._clock_samples=samples
                self._server_clock_offset_ms=max(offset for _,offset in samples)
            self._connect_cluster=cluster
            self._connect_revision+=1
            self._connect_condition.notify_all()

    def _dealer_message(self, message):
        if not isinstance(message,dict) or message.get('type')!='message':return
        if not str(message.get('uri','')).endswith('/connect-state/v1/cluster'):return
        for payload in message.get('payloads') or []:
            if isinstance(payload,dict) and isinstance(payload.get('cluster'),dict):
                self._accept_cluster(payload['cluster'])

    def _dealer_loop(self, sock):
        last_ping=time.monotonic()
        try:
            while self._connect_socket is sock:
                if time.monotonic()-last_ping>=25:
                    sock.send(json.dumps({'type':'ping'}));last_ping=time.monotonic()
                try:
                    raw=sock.recv()
                    if not raw:break
                    self._dealer_message(json.loads(raw))
                except websocket.WebSocketTimeoutException:continue
                except (ValueError,TypeError):continue
        except (websocket.WebSocketException,OSError,RuntimeError):
            pass
        finally:
            with self._connect_condition:
                if self._connect_socket is sock:
                    self._connect_socket=None
                    self._connect_error='Spotify 播放连接已断开，请稍后重试或打开官方播放器'
                    self._connect_retry_at=time.monotonic()+30
                self._connect_condition.notify_all()
            try:sock.close()
            except (websocket.WebSocketException,OSError):pass

    def _connect(self):
        """Register only a hidden controller, never a player or DRM implementation."""
        with self._connect_lock:
            self.cooldowns.check('spclient.wg.spotify.com')
            self.cooldowns.check('dealer.spotify.com')
            if self._connect_socket is not None:return
            if self._connect_retry_at>time.monotonic():raise RuntimeError(self._connect_error)
            sock=None
            try:
                self.cooldowns.check('apresolve.spotify.com')
                with self._session_lock:
                    self.session.cookies.clear()
                    resolved=self.session.get('https://apresolve.spotify.com/',params={'type':['dealer-g2','spclient']},
                        timeout=10,verify=True,allow_redirects=False)
                if resolved.status_code==429:self.cooldowns.limit('apresolve.spotify.com',resolved.headers.get('Retry-After'))
                if not resolved.ok:raise RuntimeError('Spotify 播放连接服务暂不可用')
                addresses=resolved.json()
                address=addresses['dealer-g2'][0]
                parsed=urlparse('wss://'+address)
                if (not parsed.hostname or not parsed.hostname.endswith('.spotify.com') or parsed.port not in (None,443)
                        or parsed.username or parsed.password or parsed.path not in ('','/') or parsed.query or parsed.fragment):
                    raise RuntimeError('Spotify 返回了无法验证的播放服务地址')
                regional=urlparse('https://'+addresses['spclient'][0])
                if (not re.fullmatch(r'[a-z0-9-]+-spclient\.spotify\.com',regional.hostname or '')
                        or regional.port not in (None,443) or regional.username or regional.password
                        or regional.path not in ('','/') or regional.query or regional.fragment):
                    raise RuntimeError('Spotify 返回了无法验证的地区播放服务地址')
                self._connect_base='https://'+regional.netloc+'/connect-state/v1'
                options={}
                if self._proxy:
                    proxy=urlparse(self._proxy)
                    if proxy.scheme not in ('http','socks4','socks5','socks5h') or not proxy.hostname:
                        raise RuntimeError('Spotify 播放连接不支持当前代理格式')
                    options={'http_proxy_host':proxy.hostname,'http_proxy_port':proxy.port or 8080,
                             'proxy_type':'socks5' if proxy.scheme=='socks5h' else proxy.scheme}
                    if proxy.username:options['http_proxy_auth']=(unquote(proxy.username),unquote(proxy.password or ''))
                sock=websocket.create_connection('wss://'+address.rstrip('/')+'/?access_token='+quote(self.access_token,safe=''),
                    timeout=8,origin='https://open.spotify.com',**options)
                connection_id=''
                for _ in range(4):
                    message=json.loads(sock.recv())
                    connection_id=(message.get('headers') or {}).get('Spotify-Connection-Id','')
                    if connection_id:break
                if not connection_id:raise RuntimeError('Spotify 没有建立有效的播放控制连接')
                observer='hobs_'+self._connect_local_id[:35]
                cluster=self._json('PUT',self._connect_base+'/devices/'+observer,connection_id=connection_id,json={
                    'member_type':'CONNECT_STATE','device':{'device_info':{'capabilities':{
                        'can_be_player':False,'hidden':True,'needs_full_player_state':True}}}})
                self._accept_cluster(cluster)
                sock.settimeout(1)
                self._connect_socket=sock
                threading.Thread(target=self._dealer_loop,args=(sock,),name='spotify-connect-observer',daemon=True).start()
            except Exception as exc:
                if sock is not None:
                    try:sock.close()
                    except (websocket.WebSocketException,OSError):pass
                if isinstance(exc,SpotifyRateLimitError):raise
                if getattr(exc,'status_code',None)==401:
                    self._connect_error='Spotify 网页登录凭证已过期，请在官方登录窗口刷新登录状态'
                    self._connect_retry_at=time.monotonic()+30
                    raise RuntimeError(self._connect_error) from None
                if getattr(exc,'status_code',None)==429:
                    headers=getattr(exc,'resp_headers',{}) or {}
                    self.cooldowns.limit('dealer.spotify.com',headers.get('retry-after') or headers.get('Retry-After'))
                # WebSocket exceptions may embed the bearer-token URL. Never echo them.
                self._connect_error=(str(exc) if isinstance(exc,RuntimeError) else
                    'Spotify 官方播放连接未能建立，请检查网络或打开官方播放器后重试')
                self._connect_retry_at=time.monotonic()+30
                raise RuntimeError(self._connect_error) from None

    def close(self):
        with self._connect_condition:
            sock=self._connect_socket;self._connect_socket=None;self._connect_cluster=None
            self._player_observations.clear()
            self._connect_condition.notify_all()
        if sock is not None:
            try:sock.close()
            except (websocket.WebSocketException,OSError):pass

    def _devices_from_cluster(self,cluster):
        result=[]
        for key,raw in (cluster.get('devices') or {}).items():
            caps=raw.get('capabilities') or {}
            if caps.get('hidden') or caps.get('can_be_player') is False:continue
            sid=str(raw.get('device_id') or key)
            volume=None if caps.get('disable_volume') else round(max(0,min(float(raw.get('volume',0))/65535,1))*100)
            result.append({'id':sid,'name':raw.get('name') or 'Spotify 播放器','type':str(raw.get('device_type') or 'unknown').lower(),
                'is_active':sid==cluster.get('active_device_id'),'is_restricted':not bool(caps.get('is_controllable')),
                'supports_volume':not bool(caps.get('disable_volume')),'volume_percent':volume,
                'can_play':raw.get('can_play') is not False})
        return result

    def devices(self):
        self._connect()
        with self._connect_condition:return self._devices_from_cluster(self._connect_cluster or {})

    def observe_player(self,device_id,position_ms,debug_source):
        """Trusted desktop bridge only: reports from its dedicated official CDP target.

        The private API must verify the target, HTTPS Spotify host and track-playback
        path. This method never reads a browser profile or invents a player event.
        """
        if (not isinstance(device_id,str) or device_id.startswith('hobs_')
                or not re.fullmatch(r'[A-Za-z0-9_%:-]{1,128}',device_id)):
            raise ValueError('无效的 Spotify 本地播放器 ID')
        if isinstance(position_ms,bool) or not isinstance(position_ms,(int,float)) or not math.isfinite(position_ms) or not 0<=position_ms<=604800000:
            raise ValueError('无效的 Spotify 本地播放位置')
        sources={'started_playing','progress','position_changed','ping','seek','pause','resume','error',
                 'before_track_load','state_clear','capped','deregister','register','speed_changed',
                 'played_threshold_reached','track_data_finalized','modify_current_state',
                 'video_surface_changed','is_video_on_changed','media_playback_mode_changed','video_visibility_changed'}
        if not isinstance(debug_source,str) or debug_source not in sources:raise ValueError('未知的 Spotify 本地播放器事件')
        now=time.monotonic();wall=time.time();position=int(position_ms)
        moving={'started_playing','progress','position_changed','ping','played_threshold_reached'}
        with self._connect_condition:
            previous=self._player_observations.get(device_id) or {}
            self._player_observation_sequence+=1;sequence=self._player_observation_sequence
            positive=(debug_source=='started_playing' or (debug_source in moving and previous.get('debug_source') in moving
                and 0<now-previous.get('monotonic',now)<=15 and position-previous.get('position_ms',position)>=100))
            evidence_start=now if debug_source=='started_playing' else previous.get('monotonic',now)
            record={'position_ms':position,'debug_source':debug_source,'monotonic':now,'observed_at':wall,
                'sequence':sequence,'evidence_started':evidence_start if positive else None,'progress_observed':positive,
                'evidence_sequence':(sequence if debug_source=='started_playing' else previous.get('sequence',sequence)) if positive else None}
            self._player_observations[device_id]=record
            if len(self._player_observations)>32:
                oldest=min(self._player_observations,key=lambda key:self._player_observations[key]['monotonic'])
                del self._player_observations[oldest]
            self._connect_condition.notify_all()
        return {'accepted':True,'observed_at':wall,'expires_at':wall+15,'progress_observed':positive}

    def _local_observation(self,device_id,after=None,after_sequence=None):
        with self._connect_condition:record=dict(self._player_observations.get(device_id) or {})
        fresh=bool(record and 0<=time.monotonic()-record['monotonic']<=15)
        progress=bool(fresh and record.get('progress_observed') and
            (after is None or (record.get('evidence_started',-1)>=after if after_sequence is not None else record.get('evidence_started',-1)>after))
            and (after_sequence is None or record.get('evidence_sequence',-1)>after_sequence))
        return {'local_playback_observed':fresh,'progress_observed':progress,
            'local_observed_at':record.get('observed_at'),'local_observation_expires_at':record.get('observed_at',0)+15 if record else None,
            'local_reported_position_ms':record.get('position_ms'),'local_debug_source':record.get('debug_source')}

    def state(self):
        self._connect()
        with self._connect_condition:cluster=dict(self._connect_cluster or {})
        devices=self._devices_from_cluster(cluster)
        active=next((d for d in devices if d['is_active']),None)
        state=cluster.get('player_state') or {};raw=state.get('track') or {};meta=raw.get('metadata') or {}
        uri=raw.get('uri','');track=None
        if re.fullmatch(r'spotify:track:[A-Za-z0-9]{22}',uri):
            sid=uri.rsplit(':',1)[1]
            track={'id':'spotify:'+sid,'source':'spotify','source_id':sid,'title':meta.get('title',''),
                'artist':meta.get('artist_name',''),'album':meta.get('album_title',''),
                'source_url':'https://open.spotify.com/track/'+sid,'metadata_source':'spotify-web-connect'}
        try:
            duration=max(0,int(state.get('duration') or 0));position=max(0,int(state.get('position_as_of_timestamp') or 0))
            reported_position=position;reported_timestamp=int(state.get('timestamp') or 0);estimated=False
            if active and state.get('is_playing') and not state.get('is_paused'):
                server_now=int(time.time()*1000+self.__dict__.get('_server_clock_offset_ms',0))
                position+=max(0,server_now-int(state.get('timestamp') or server_now))
                estimated=True
            if duration:position=min(position,duration)
        except (TypeError,ValueError,OverflowError):duration=position=reported_position=reported_timestamp=0;estimated=False
        return {'source':'spotify','transport':'spotify-web-connect','available':bool(active),'device':active,
            'has_active_device':bool(active),'is_playing':bool(active and state.get('is_playing') and not state.get('is_paused')),
            'is_paused':bool(state.get('is_paused')) if active else True,'position_ms':position,'duration_ms':duration,
            'reported_position_ms':reported_position,'reported_timestamp_ms':reported_timestamp,'position_estimated':estimated,
            'remote_position_semantics':'reference-clock',
            **self._local_observation(active['id'] if active else ''),
            'track':track,'historical_state':bool(track and not active),
            'now_playing':{'kind':'track' if track else 'interlude' if active and raw else 'none',
                'ad':bool(active and raw and not track and (uri.startswith('spotify:ad:') or meta.get('advertiser') or meta.get('ad_id')
                    or str(meta.get('is_advertisement','')).lower()=='true')),
                'title':meta.get('title') or ('Spotify 插播' if raw else ''),
                'artist':meta.get('artist_name') or meta.get('advertiser') or '',
                'cover':meta.get('image_url') if str(meta.get('image_url','')).startswith('https://') else ''},
            'reason':'' if active else '没有在线的 Spotify 播放设备，请打开并登录官方 Spotify 播放器'}

    def _target(self,device_id=''):
        devices=self.devices()
        target=next((d for d in devices if d['id']==device_id),None) if device_id else next((d for d in devices if d['is_active']),None)
        if target is None:
            if not device_id and len(devices)==1:target=devices[0]
            else:raise RuntimeError('没有可用的 Spotify 播放设备，请打开官方播放器并选择在线设备')
        if target['is_restricted'] or not target['can_play']:raise RuntimeError('当前 Spotify 设备不允许远程播放控制，请在官方播放器检查账号与设备状态')
        return target

    def _command(self,endpoint,payload=None,device_id='',confirm=None,connect_command=False,on_submitted=None,sequence=None):
        target=self._target(device_id)
        kind='connect/'+endpoint if connect_command else 'player/command'
        # Device IDs are path components, never host names or arbitrary URLs.
        path=self._connect_base+'/'+kind+'/from/'+quote(self._connect_local_id,safe='')+'/to/'+quote(target['id'],safe='')
        command_id=secrets.token_hex(16)
        body=dict(payload or {})
        if connect_command:body['command_id']=command_id
        else:body={'command':dict(body,endpoint=endpoint,logging_params={'command_id':command_id})}
        # 桌面端给每条命令带序号：快速切歌时，比已提交命令更旧的播放命令直接丢弃，免得晚到的旧歌盖过新操作。
        stale=False
        with self.__dict__.setdefault('_order_lock',threading.Lock()):
            if sequence is not None and sequence<self.__dict__.get('_latest_sequence',-1):stale=True
            else:
                if sequence is not None:self._latest_sequence=sequence
                if on_submitted is not None:on_submitted(target['id'],time.monotonic())
                self._json('PUT' if connect_command and endpoint=='volume' else 'POST',path,json=body)
        if stale:return {'accepted':False,'cancelled':True,'confirmed':False,'state':self.state(),'transport':'spotify-web-connect','reason':''}
        # Successful HTTP submission is not evidence that sound started playing.
        deadline=time.monotonic()+3;confirmed=False;current=self.state()
        while confirm is not None and not (confirmed:=bool(confirm(current))) and time.monotonic()<deadline:
            with self._connect_condition:
                self._connect_condition.wait(timeout=min(.3,max(0,deadline-time.monotonic())))
            current=self.state()
        return {'accepted':True,'confirmed':confirmed,'state':current,'transport':'spotify-web-connect',
            'reason':'' if confirmed else '指令已提交，但尚未从 Spotify 设备确认状态变化'}

    def play(self,source_id,device_id='',sequence=None):
        sid=_source_id(source_id,'track');uri='spotify:track:'+sid
        try:self._drop_queued(device_id)
        except (RuntimeError,ValueError,TypeError):pass
        submitted={}
        def mark_submission(target,when):
            with self._connect_condition:
                submitted.update(device_id=target,monotonic=when,sequence=self._player_observation_sequence)
        result=self._command('play',{'context':{'uri':uri,'url':'context://'+uri,'metadata':{}},
            'play_origin':{'feature_identifier':'music-platform'},'options':{'initially_paused':False}},device_id,sequence=sequence,
            confirm=lambda s:s['is_playing'] and (s.get('track') or {}).get('source_id')==sid
                and (s.get('device') or {}).get('id')==submitted.get('device_id'),on_submitted=mark_submission)
        if result.get('cancelled'):return result
        result['state_confirmed']=result['confirmed']
        result['confirmed']=False;result['progress_confirmed']=False
        result['verification_status']='pending';result['remote_position_semantics']='reference-clock'
        result['confirmation_source']='independent-raw-connect-state'
        if not result['state_confirmed']:return result
        def local_confirmed():
            state=self.state()
            return bool(submitted and self._local_observation(submitted['device_id'],submitted['monotonic'],submitted['sequence'])['progress_observed']
                and (state.get('device') or {}).get('id')==submitted['device_id'] and state['is_playing']
                and (state.get('track') or {}).get('source_id')==sid)
        def finish_local():
            result.update(confirmed=True,progress_confirmed=True,verification_status='confirmed',
                confirmation_source='official-window-local-progress',state=self.state(),reason='')
            return result
        if local_confirmed():return finish_local()
        try:
            first=self._json('GET',self._connect_base+'/cluster')
            # Observe only: never submit a second play command to force progress.
            start=time.monotonic()
            second=self._progress_sample_after(start,local_check=local_confirmed)
            if second is None:return finish_local()
            before=first.get('player_state') or {};after=second.get('player_state') or {}
            delta=int(after.get('position_as_of_timestamp') or 0)-int(before.get('position_as_of_timestamp') or 0)
            result['reported_progress_delta_ms']=delta
            result['progress_confirmed']=bool(first.get('active_device_id')==submitted.get('device_id')
                and first.get('active_device_id')==second.get('active_device_id')
                and (before.get('track') or {}).get('uri')==uri==(after.get('track') or {}).get('uri')
                and before.get('is_paused') is False and after.get('is_paused') is False
                and before.get('is_playing') is True and after.get('is_playing') is True and delta>=1000)
            self._accept_cluster(second)
            result['state']=self.state();result['confirmed']=result['progress_confirmed']
            if local_confirmed():return finish_local()
            result['verification_status']='confirmed' if result['confirmed'] else 'pending'
            result['reason']=('' if result['confirmed'] else
                '播放指令已提交；Connect 使用参考时钟，当前仍在等待播放器独立进度证据，尚不能确认实际播放')
        except (RuntimeError,ValueError,TypeError) as exc:
            result['reason']=str(exc) if isinstance(exc,RuntimeError) else 'Spotify 原始播放进度暂无法验证'
        return result

    def queue(self,source_id,device_id=''):
        # Spotify continues into a queued track by itself, so the next song starts without a new play command.
        uri='spotify:track:'+_source_id(source_id,'track')
        return self._command('add_to_queue',{'track':{'uri':uri,'metadata':{'is_queued':'true'},'provider':'queue'}},device_id)

    def _drop_queued(self,device_id=''):
        # A manual pick must not be followed by a song queued for the previous one; only queue entries are removed.
        with self._connect_condition:state=dict((self._connect_cluster or {}).get('player_state') or {})
        following=[t for t in state.get('next_tracks') or [] if isinstance(t,dict)]
        kept=[t for t in following if t.get('provider')!='queue']
        if len(kept)==len(following):return False
        self._command('set_queue',{'next_tracks':kept,'prev_tracks':state.get('prev_tracks') or [],
            'queue_revision':str(state.get('queue_revision') or '')},device_id)
        return True

    def _progress_sample_after(self, started,local_check=None):
        # Separate server reads, not locally extrapolated time, prove reported progression.
        deadline=started+4
        while (remaining:=deadline-time.monotonic())>0:
            if local_check is not None and local_check():return None
            with self._connect_condition:self._connect_condition.wait(timeout=remaining)
        return self._json('GET',self._connect_base+'/cluster')

    def control(self,action,value=None,device_id='',sequence=None):
        endpoints={'pause':'pause','resume':'resume','next':'skip_next','previous':'skip_prev','seek':'seek_to','volume':'volume'}
        if action not in endpoints:raise ValueError('不支持的 Spotify 播放操作')
        before=self.state();payload={};connect=False
        if action=='volume':
            number=max(0,min(100,int(value)));payload={'volume':round(number/100*65535)};connect=True
            confirm=lambda s:bool(s.get('device')) and abs((s['device'].get('volume_percent') or 0)-number)<=2
        elif action=='seek':
            number=max(0,int(value));payload={'value':number}
            confirm=lambda s:s['has_active_device'] and abs(s['position_ms']-number)<2000
        elif action in ('pause','resume'):
            confirm=(lambda s:s['has_active_device'] and s['is_paused']) if action=='pause' else (lambda s:s['is_playing'])
        else:
            old=(before.get('track') or {}).get('source_id')
            confirm=lambda s:s['has_active_device'] and ((s.get('track') or {}).get('source_id')!=old or s['position_ms']<before['position_ms']-1000)
        return self._command(endpoints[action],payload,device_id=device_id,confirm=confirm,connect_command=connect,sequence=sequence)
