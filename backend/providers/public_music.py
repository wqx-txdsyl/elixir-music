"""Public catalog access. Full tracks use the originating platform's player."""
from __future__ import annotations

import ast
import html
import json
import os
import re
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit

import requests
from bs4 import BeautifulSoup
from ytmusicapi import YTMusic


PLATFORMS = json.loads(Path(__file__).with_name('platforms.json').read_text(encoding='utf-8'))
KINDS = {
    'apple': {'track', 'album', 'artist'},
    'deezer': {'track', 'album', 'artist', 'playlist'},
    'ytmusic': {'track', 'album', 'artist', 'playlist', 'mv'},
    'kugou': {'track'},
    'kuwo': {'track'},
    'bandcamp': {'track', 'album', 'artist'},
    'melon': {'track'},
    'migu': {'track'},
}
STOREFRONT = os.environ.get('ELIXIR_APPLE_STOREFRONT', 'us').lower()
if not re.fullmatch('[a-z]{2}', STOREFRONT):
    STOREFRONT = 'us'


def public_track_id(value):
    try:
        url = urlsplit(value)
    except ValueError:
        return None
    if url.scheme != 'https' or url.username or url.password:
        return None
    params = parse_qs(url.query)
    if url.hostname == 'music.apple.com':
        sid = (params.get('i') or [url.path.split('/')[-1] if '/song/' in url.path else ''])[0]
        return 'apple:' + sid if sid.isascii() and sid.isdigit() else None
    if url.hostname in {'deezer.com','www.deezer.com'}:
        found = re.search(r'/track/([0-9]+)/?$', url.path)
        return 'deezer:' + found[1] if found else None
    if url.hostname == 'music.youtube.com' and url.path == '/watch':
        sid = (params.get('v') or [''])[0]
        return 'ytmusic:' + sid if re.fullmatch('[A-Za-z0-9_-]{11}', sid) else None
    return None


class MusicSession(requests.Session):
    def request(self, method, url, **kwargs):
        kwargs.setdefault('timeout', (4, 8))
        return super().request(method, url, **kwargs)


def get(url, params=None, *, literal=False, allow_list=False):
    try:
        with MusicSession() as session:
            session.headers['User-Agent'] = 'Mozilla/5.0'
            response = session.get(url, params=params)
            response.raise_for_status()
            if literal:
                if len(response.content) > 1_000_000:
                    raise ValueError('响应过大')
                return ast.literal_eval(response.text)
            data = response.json()
            if allow_list and isinstance(data, list):
                return data
            if not isinstance(data, dict) or data.get('error'):
                raise RuntimeError('平台没有返回请求的资料')
            return data
    except (requests.RequestException, ValueError, SyntaxError) as exc:
        raise RuntimeError('平台资料暂时无法读取') from exc


def duration_seconds(value):
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str) and re.fullmatch(r'\d+(?::\d\d){0,2}', value):
        seconds = 0
        for part in value.split(':'):
            seconds = seconds * 60 + int(part)
        return seconds
    return 0


def track(source, sid, title, artist='', album='', cover='', duration=0, *, album_id='', artist_id='', url='', artists=None):
    sid = str(sid or '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,160}', sid) or not title:
        return None
    artists = artists or ([{'name': artist, 'id': str(artist_id or '')}] if artist else [])
    return {'id': f'{source}:{sid}', 'source': source, 'source_id': sid, 'title': title, 'artist': artist,
            'artists': artists, 'artist_ids': [a['id'] for a in artists if a.get('id')], 'album': album,
            'album_id': str(album_id or ''), 'cover': cover or '', 'duration_ms': int(duration or 0),
            'source_url': url, 'playable': None}


def item(source, kind, sid, title, *, cover='', artist='', url='', **fields):
    sid = str(sid or '')
    if not title or not re.fullmatch(r'[A-Za-z0-9_-]{1,160}', sid):
        return None
    return {'id': f'{source}:{kind}:{sid}', 'source': source, 'source_id': sid, 'kind': kind,
            'title': title, 'cover': cover or '', 'artist': artist, 'source_url': url, **fields}


def apple_cover(raw):
    return re.sub(r'/\d+x\d+bb\.', '/600x600bb.', raw or '')


def bandcamp_url(value):
    try:
        url = urlsplit(value or '')
        host = url.hostname or ''
        return value if url.scheme == 'https' and host.endswith('.bandcamp.com') and not url.username and not url.password and not url.port else ''
    except (TypeError, ValueError):
        return ''


def melon_tracks(query=None):
    path = 'search/song/index.htm' if query is not None else 'chart/index.htm'
    try:
        with MusicSession() as session:
            session.headers['User-Agent'] = 'Mozilla/5.0'
            response = session.get('https://www.melon.com/' + path, params={'q':query} if query is not None else None)
            response.raise_for_status()
            page = BeautifulSoup(response.content, 'html.parser')
    except requests.RequestException as exc:
        raise RuntimeError('Melon 暂未返回目录') from exc
    results = []
    for row in page.select('tbody tr'):
        sid = row.get('data-song-no')
        title = row.select_one('div.ellipsis a.fc_gray[title], .rank01 a')
        if not sid and (link := row.select_one('a[href*="goSongDetail"]')):
            match = re.search(r"goSongDetail\('([0-9]+)'\)", link.get('href', ''))
            sid = match[1] if match else ''
        if not sid or not title:
            continue
        names = dict.fromkeys(tag.get_text(' ', strip=True) for tag in row.select('#artistName a, .rank02 a'))
        album = row.select_one('a[href*="goAlbumDetail"], .rank03 a')
        cover = row.select_one('a.image_typeAll img')
        entry = track('melon', sid, title.get_text(' ', strip=True).replace('\xa0',' '), ' / '.join(names),
                      album.get_text(' ', strip=True) if album else '', cover.get('src','') if cover else '',
                      url=f'https://www.melon.com/song/detail.htm?songId={sid}')
        if entry:
            results.append(entry)
    return results


class PublicMusicProvider:
    def __init__(self, name, store):
        self.name = name
        self.store = store
        self.kinds = KINDS[name]

    def search(self, query, limit=30):
        return self._search('track', query, limit, 0)[0]

    def search_entities(self, kind, query, limit, offset):
        if kind not in self.kinds:
            return {'items': [], 'has_more': False}
        rows, more = self._search(kind, query, limit, offset)
        return {'items': rows, 'has_more': more, 'offset': offset}

    def _search(self, kind, query, limit, offset):
        if self.name == 'migu':
            rows = []
            first = offset//20+1
            for page in range(first, (offset+limit-1)//20+2):
                data = get('https://app.u.nf.migu.cn/pc/resource/song/item/search/v1.0', {'text':query,'pageNo':page,'pageSize':20}, allow_list=True)
                if not isinstance(data,list):
                    raise RuntimeError('咪咕未返回歌曲目录')
                rows.extend(data)
                if len(data)<20:
                    break
            items = self._normalize_all(rows, kind)
            start = offset%20
            return items[start:start+limit], bool(rows and len(rows)%20==0)
        if self.name == 'melon':
            rows = melon_tracks(query)
            return rows[offset:offset+limit], offset+limit < len(rows)
        if self.name == 'bandcamp':
            code = {'track': 't', 'album': 'a', 'artist': 'b'}[kind]
            try:
                with MusicSession() as session:
                    response = session.post('https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic',
                        json={'search_text': query, 'search_filter': code, 'fan_id': None, 'full_page': True})
                    response.raise_for_status()
                    rows = response.json()['auto']['results']
            except (requests.RequestException, KeyError, ValueError) as exc:
                raise RuntimeError('Bandcamp 暂未返回搜索资料') from exc
            rows = self._normalize_all([x for x in rows if x.get('type') == code], kind)
            return rows[offset:offset+limit], offset+limit < len(rows)
        if self.name == 'apple':
            entity = {'track': 'song', 'album': 'album', 'artist': 'musicArtist'}[kind]
            count = min(200, offset + limit + 1)
            raw = get('https://itunes.apple.com/search', {'term': query, 'country': STOREFRONT, 'media': 'music', 'entity': entity, 'limit': count})
            rows = self._normalize_all(raw.get('results') or [], kind)
            return rows[offset:offset+limit], len(rows) > offset+limit and count < 200
        if self.name == 'deezer':
            path = 'search' if kind == 'track' else f'search/{kind}'
            raw = self._deezer(path, {'q': query, 'limit': limit, 'index': offset})
            return self._normalize_all(raw.get('data') or [], kind), bool(raw.get('next'))
        if self.name == 'ytmusic':
            selector = {'track': 'songs', 'album': 'albums', 'artist': 'artists', 'playlist': 'playlists', 'mv': 'videos'}[kind]
            rows = self._yt(lambda client: client.search(query, filter=selector, limit=min(150, offset+limit+1)))
            if kind == 'album' and not rows:
                rows = self._yt(lambda client: client.search(query, limit=min(150, offset+limit+1)))
                rows = [row for row in rows if row.get('resultType') == 'album']
            if kind == 'track' and not rows:
                rows = self._yt(lambda client: client.search(query, filter='videos', limit=min(150, offset+limit+1)))
                rows = [row for row in rows if row.get('videoType') in {'MUSIC_VIDEO_TYPE_OMV','MUSIC_VIDEO_TYPE_ATV'}]
            rows = self._normalize_all(rows, kind)
            return rows[offset:offset+limit], len(rows) > offset+limit and offset+limit < 150
        if self.name == 'kugou':
            raw = get('https://songsearch.kugou.com/song_search_v2', {'keyword': query, 'page': offset//limit+1, 'pagesize': limit, 'platform': 'WebFilter'})
            if raw.get('status') != 1:
                raise RuntimeError('酷狗未返回搜索结果')
            data = raw.get('data') or {}
            return self._normalize_all(data.get('lists') or [], kind), offset+limit < int(data.get('total') or 0)
        raw = get('https://search.kuwo.cn/r.s', {'all': query, 'ft': 'music', 'itemset': 'web_2013', 'pn': offset//limit, 'rn': limit, 'rformat': 'json', 'encoding': 'utf8'}, literal=True)
        return self._normalize_all(raw.get('abslist') or [], kind), offset+limit < int(raw.get('TOTAL') or 0)

    @staticmethod
    def _deezer(path, params=None):
        return get('https://api.deezer.com/' + path, params)

    @staticmethod
    def _yt(action):
        try:
            with MusicSession() as session:
                return action(YTMusic(requests_session=session))
        except (requests.RequestException, ValueError, KeyError, RuntimeError) as exc:
            raise RuntimeError('YouTube Music 暂未返回可用资料') from exc

    def _normalize_all(self, rows, kind, parent=None):
        return [entry for row in rows if isinstance(row, dict) and (entry := self._normalize(row, kind, parent))]

    def _normalize(self, raw, kind, parent=None):
        parent = parent or {}
        source = self.name
        if source == 'migu':
            sid = raw.get('copyrightId') or raw.get('songId')
            artists = ' / '.join(row.get('name','') for row in raw.get('singerList') or [] if row.get('name'))
            cover = raw.get('img3') or raw.get('img1') or ''
            return track(source, sid, raw.get('songName'), artists, raw.get('album', ''),
                         urljoin('https://d.musicapp.migu.cn/', cover) if cover else '', duration_seconds(raw.get('duration'))*1000,
                         url='https://music.migu.cn/v5/')
        if source == 'bandcamp':
            url = bandcamp_url(raw.get('item_url_path') or raw.get('item_url_root'))
            if not url:
                return None
            if kind == 'track':
                return track(source, raw.get('id'), raw.get('name'), raw.get('band_name', ''), raw.get('album_name', ''),
                             raw.get('img'), raw.get('duration_ms', 0), album_id=raw.get('album_id'), artist_id=raw.get('band_id'), url=url)
            return item(source, kind, raw.get('id'), raw.get('name'), cover=raw.get('img'), artist=raw.get('band_name', ''), url=url)
        if source == 'apple':
            cover = apple_cover(raw.get('artworkUrl100'))
            if kind == 'track':
                sid = raw.get('trackId') or raw.get('id')
                return track(source, sid, raw.get('trackName') or raw.get('name'), raw.get('artistName', ''),
                             raw.get('collectionName', ''), cover, raw.get('trackTimeMillis', 0),
                             album_id=raw.get('collectionId'), artist_id=raw.get('artistId'),
                             url=raw.get('trackViewUrl') or raw.get('url') or f'https://music.apple.com/{STOREFRONT}/song/{sid}')
            sid = raw.get('artistId') if kind == 'artist' else raw.get('collectionId')
            return item(source, kind, sid, raw.get('artistName') if kind == 'artist' else raw.get('collectionName'),
                        cover=cover, artist='' if kind == 'artist' else raw.get('artistName', ''),
                        url=f'https://music.apple.com/{STOREFRONT}/{kind}/{sid}', published_at=raw.get('releaseDate'), count=raw.get('trackCount'))
        if source == 'deezer':
            sid = raw.get('id')
            singer = raw.get('artist') or {}
            if kind == 'track':
                album = raw.get('album') or parent
                singers = [{'id': str(x['id']), 'name': x.get('name', '')} for x in raw.get('contributors', []) if x.get('id')]
                return track(source, sid, raw.get('title'), singer.get('name', ''), album.get('title', ''),
                             album.get('cover_big') or album.get('cover_medium'), duration_seconds(raw.get('duration'))*1000,
                             album_id=album.get('id'), artist_id=singer.get('id'), artists=singers,
                             url=f'https://www.deezer.com/track/{sid}')
            return item(source, kind, sid, raw.get('title') or raw.get('name'), cover=raw.get('cover_big') or raw.get('picture_big'),
                        artist=singer.get('name', ''), url=f'https://www.deezer.com/{kind}/{sid}',
                        published_at=raw.get('release_date'), count=raw.get('nb_tracks'), description=raw.get('description'))
        if source == 'ytmusic':
            sid = raw.get('videoId') if kind in {'track', 'mv'} else raw.get('browseId')
            if kind == 'playlist' and isinstance(sid, str):
                sid = sid.removeprefix('VL')
            artists = [{'name': x.get('name', ''), 'id': x.get('id') or ''} for x in raw.get('artists') or parent.get('artists') or []]
            artist = ' / '.join(x['name'] for x in artists if x.get('name')) or raw.get('author', '')
            thumbs = raw.get('thumbnails') or parent.get('thumbnails') or [{}]
            cover = thumbs[-1].get('url', '')
            if kind in {'track', 'mv'}:
                url = f'https://music.youtube.com/watch?v={sid}'
                seconds = duration_seconds(raw.get('duration_seconds') or raw.get('duration'))
                if kind == 'mv':
                    return item(source, kind, sid, raw.get('title'), cover=cover, artist=artist, url=url, duration_ms=seconds*1000)
                album = raw.get('album')
                album_name = album.get('name') if isinstance(album, dict) else album if isinstance(album, str) else ''
                album_id = album.get('id') if isinstance(album, dict) else ''
                return track(source, sid, raw.get('title'), artist, album_name or parent.get('title', ''), cover,
                             seconds*1000, album_id=album_id or parent.get('browseId'), artists=artists, url=url)
            path = 'playlist?' + urlencode({'list': sid}) if kind == 'playlist' else ('channel/' if kind == 'artist' else 'browse/') + str(sid)
            return item(source, kind, sid, raw.get('title') or raw.get('artist') or raw.get('name'), cover=cover,
                        artist=artist, url='https://music.youtube.com/'+path, published_at=raw.get('year'),
                        description=raw.get('description'), count=raw.get('trackCount'))
        if source == 'kugou':
            sid = raw.get('FileHash')
            return track(source, sid, raw.get('SongName'), raw.get('SingerName', ''), raw.get('AlbumName', ''),
                         duration=duration_seconds(raw.get('Duration'))*1000, url=f'https://www.kugou.com/song/#hash={sid}')
        sid = str(raw.get('MUSICRID') or '').removeprefix('MUSIC_')
        return track(source, sid, html.unescape(raw.get('SONGNAME') or raw.get('NAME') or '').replace('\xa0', ' '), raw.get('ARTIST', ''), raw.get('ALBUM', ''),
                     duration=duration_seconds(raw.get('DURATION'))*1000, url=f'https://www.kuwo.cn/play_detail/{sid}')

    def detail(self, sid):
        if self.name == 'apple':
            rows = get('https://itunes.apple.com/lookup', {'id': sid, 'country': STOREFRONT}).get('results') or []
            data = self._normalize_all(rows, 'track')
            if data and data[0]['source_id'] == sid:
                return data[0]
        if self.name == 'deezer':
            data = self._normalize(self._deezer('track/'+sid), 'track')
            if data:
                return data
        if self.name == 'ytmusic':
            data = self._yt(lambda client: client.get_song(sid)).get('videoDetails') or {}
            raw = {**data, 'duration_seconds': data.get('lengthSeconds'), 'thumbnails': (data.get('thumbnail') or {}).get('thumbnails')}
            entry = self._normalize(raw, 'track')
            if entry:
                return entry
        prior = self.store.get(f'{self.name}:{sid}')
        if prior:
            return prior
        raise RuntimeError('未找到歌曲资料')

    def stream(self, sid, quality):
        entry = self.store.get(f'{self.name}:{sid}') or self.detail(sid)
        result = {'transport': 'official-web', 'source_url': entry['source_url']}
        if self.name == 'migu':
            query=' '.join(filter(None,(entry['title'],entry.get('artist'))))
            result['source_url']='https://music.migu.cn/v5/#/playlist?'+urlencode({'search':query,'playlistType':'ordinary'})
        return result

    def album(self, sid, offset, limit):
        if self.name == 'bandcamp':
            entry = self.store.entity('bandcamp:album:' + sid)
            if not entry or not (url := bandcamp_url(entry.get('source_url'))):
                raise ValueError('请先从 Bandcamp 搜索该专辑')
            try:
                with MusicSession() as session:
                    response = session.get(url, allow_redirects=False)
                    response.raise_for_status()
                    match = re.search(r'\bdata-tralbum="([^"]+)"', response.text)
                    raw = json.loads(html.unescape(match[1])) if match else {}
            except (requests.RequestException, ValueError) as exc:
                raise RuntimeError('Bandcamp 暂未返回专辑详情') from exc
            if str(raw.get('id')) != sid:
                raise RuntimeError('Bandcamp 未确认专辑编号')
            rows = self._normalize_all([
                {'id': song.get('track_id'), 'name': song.get('title'), 'band_name': raw.get('artist') or entry['artist'],
                 'album_name': entry['title'], 'album_id': sid, 'img': entry['cover'],
                 'duration_ms': int((song.get('duration') or 0)*1000), 'item_url_path': urljoin(url, song['title_link'])}
                for song in raw.get('trackinfo') or [] if song.get('title_link')
            ], 'track')
            return dict(entry, tracks=rows[offset:offset+limit], total=len(rows), offset=offset, has_more=offset+limit<len(rows))
        if self.name == 'apple':
            rows = get('https://itunes.apple.com/lookup', {'id': sid, 'entity': 'song', 'country': STOREFRONT, 'limit': 200}).get('results') or []
            raw = next((x for x in rows if x.get('wrapperType') == 'collection'), {})
            tracks = self._normalize_all([x for x in rows if x.get('wrapperType') == 'track'], 'track')
            return self._page('album', raw, tracks, offset, limit)
        if self.name == 'deezer':
            raw = self._deezer('album/'+sid)
            page = self._deezer(f'album/{sid}/tracks', {'index': offset, 'limit': limit})
            result = self._page('album', raw, self._normalize_all(page.get('data') or [], 'track', raw), 0, limit)
            return dict(result, offset=offset, total=page.get('total', result['total']), has_more=bool(page.get('next')))
        if self.name == 'ytmusic':
            raw = self._yt(lambda client: client.get_album(sid))
            raw['browseId'] = sid
            return self._page('album', raw, self._normalize_all(raw.get('tracks') or [], 'track', raw), offset, limit)
        raise ValueError('该平台的专辑请在官方窗口查看')

    def _page(self, kind, raw, tracks, offset, limit, albums=None):
        result = self._normalize(raw, kind)
        if not result:
            raise RuntimeError('平台未返回可用的详情')
        return dict(result, tracks=tracks[offset:offset+limit], albums=albums or [], total=len(tracks), offset=offset, has_more=len(tracks)>offset+limit)

    def artist(self, sid, offset, limit):
        if self.name == 'bandcamp':
            entry = self.store.entity('bandcamp:artist:' + sid)
            if not entry:
                raise ValueError('请先从 Bandcamp 搜索该艺人')
            return dict(entry, tracks=[], albums=[], total=0, has_more=False)
        if self.name == 'apple':
            rows = get('https://itunes.apple.com/lookup', {'id': sid, 'entity': 'album', 'country': STOREFRONT, 'limit': 100}).get('results') or []
            raw = next((x for x in rows if x.get('wrapperType') == 'artist'), {})
            albums = self._normalize_all([x for x in rows if x.get('wrapperType') == 'collection'], 'album')
            return dict(self._page('artist', raw, [], 0, limit, albums[offset:offset+limit]), albums_has_more=len(albums)>offset+limit)
        if self.name == 'deezer':
            raw = self._deezer('artist/'+sid)
            songs = self._deezer(f'artist/{sid}/top', {'index': offset, 'limit': limit})
            releases = self._deezer(f'artist/{sid}/albums', {'index': offset, 'limit': limit})
            result = self._page('artist', raw, self._normalize_all(songs.get('data') or [], 'track'), 0, limit, self._normalize_all(releases.get('data') or [], 'album'))
            return dict(result, offset=offset, total=songs.get('total', result['total']), has_more=bool(songs.get('next')), albums_has_more=bool(releases.get('next')))
        if self.name == 'ytmusic':
            raw = self._yt(lambda client: client.get_artist(sid))
            raw['browseId'] = sid
            songs = self._normalize_all((raw.get('songs') or {}).get('results') or [], 'track')
            albums = self._normalize_all((raw.get('albums') or {}).get('results') or [], 'album')
            return dict(self._page('artist', raw, songs, offset, limit, albums), track_scope='平台展示的热门曲目')
        raise ValueError('该平台的歌手资料请在官方窗口查看')

    def playlist(self, sid):
        if self.name == 'deezer':
            raw = self._deezer('playlist/'+sid)
            rows = (raw.get('tracks') or {}).get('data') or []
        elif self.name == 'ytmusic':
            raw = self._yt(lambda client: client.get_playlist(sid, limit=300))
            raw['browseId'] = sid
            rows = raw.get('tracks') or []
        else:
            raise ValueError('该平台的歌单请在官方窗口查看')
        result = self._normalize(raw, 'playlist')
        if not result:
            raise RuntimeError('平台未返回可用的歌单')
        return dict(result, tracks=self._normalize_all(rows, 'track', raw))

    def discovery(self, mode):
        if mode != 'charts':
            raise ValueError('该推荐需要在平台页面查看')
        if self.name == 'apple':
            raw = get(f'https://rss.marketingtools.apple.com/api/v2/{STOREFRONT}/music/most-played/25/songs.json')
            return {'tracks': self._normalize_all((raw.get('feed') or {}).get('results') or [], 'track')}
        if self.name == 'deezer':
            raw = self._deezer('chart/0/tracks', {'limit': 30})
            return {'tracks': self._normalize_all(raw.get('data') or [], 'track')}
        if self.name == 'melon':
            return {'tracks': melon_tracks()[:30]}
        sections = self._yt(lambda client: client.get_home(limit=12))
        albums = self._normalize_all([row for section in sections for row in section.get('contents', []) if row.get('browseId')], 'album')
        return {'items': [entry for entry in albums if entry['source_id'].startswith('MPRE')]}

    @staticmethod
    def lyrics(sid):
        return {'original': '', 'translated': '', 'reason': '平台未提供歌词'}

    @staticmethod
    def comments(sid, offset, limit):
        return {'items': [], 'total': 0, 'has_more': False, 'reason': '平台未提供评论'}
