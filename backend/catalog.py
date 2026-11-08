"""Music-only entity reads. Platform IDs, versions and partial pages stay explicit."""
from __future__ import annotations
import html
import re
import xml.etree.ElementTree as ET


def plain(value):
    value=re.sub(r'<br\s*/?>|</p\s*>','\n',str(value or ''),flags=re.I)
    return html.unescape(re.sub(r'<[^>]*>', '', value)).strip()


def qq_artist_description(raw):
    """Preserve text from the official ID-bound singer detail and wiki XML."""
    extra=raw.get('ex_info') or {};description=plain(extra.get('desc'))
    fields=[];sections=[];wiki=raw.get('wiki') or ''
    if isinstance(wiki,str) and len(wiki)<=1000000 and not re.search(r'<!DOCTYPE|<!ENTITY',wiki,re.I):
        try:
            tree=ET.fromstring(wiki)
            description=plain(tree.findtext('desc')) or description
            fields=[{'label':plain(x.findtext('key')),'value':plain(x.findtext('value'))} for x in tree.findall('./basic/item') if x.findtext('key') and x.findtext('value')]
            sections=[{'title':plain(x.findtext('key')),'text':plain(x.findtext('value'))} for x in tree.findall('./other/item') if x.findtext('key') and x.findtext('value')]
        except ET.ParseError:pass
    return {'description':description,'information':fields,'description_sections':sections}


def entity(source, kind, sid, title, cover='', **extra):
    sid = str(sid or '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,160}', sid):
        raise ValueError('平台没有返回有效的音乐实体标识')
    paths = {'album': 'album', 'artist': 'artist', 'playlist': 'playlist', 'mv': 'mv'}
    urls = {
        'netease': f'https://music.163.com/#/{paths[kind]}?id={sid}',
        'qqmusic': f'https://y.qq.com/n/ryqq/{"singer" if kind=="artist" else kind}Detail/{sid}',
        'spotify': f'https://open.spotify.com/{kind}/{sid}',
    }
    return {'id': f'{source}:{kind}:{sid}', 'source': source, 'source_id': sid, 'kind': kind,
            'title': plain(title), 'cover': cover or '', 'source_url': urls[source], **extra}


def netease_entity(x, kind):
    artists = x.get('artists') or x.get('artist') or []
    if isinstance(artists,dict):artists=[artists]
    elif isinstance(artists,str):artists=[{'name':artists,'id':x.get('artistId')}]
    artists=[a for a in artists if isinstance(a,dict)]
    if not artists and x.get('artistName'):artists=[{'name':x['artistName'],'id':x.get('artistId')}]
    return entity('netease', kind, x.get('id') or x.get('mvid'), x.get('name'),
                  x.get('picUrl') or x.get('coverImgUrl') or x.get('img1v1Url') or x.get('cover') or x.get('imgurl') or '',
                  artist=' / '.join(a.get('name', '') for a in artists),
                  artist_ids=[str(a['id']) for a in artists if a.get('id')],
                  description=plain(x.get('description') or x.get('briefDesc') or ''),
                  count=x.get('size') or x.get('trackCount') or x.get('musicSize') or 0,
                  published_at=x.get('publishTime') if kind!='artist' else None, company=x.get('company', '') if kind!='artist' else '',
                  aliases=x.get('alias') or [],language=x.get('language') or '',genres=x.get('tags') or [])


def qq_entity(x, kind):
    prefixes = {'album': 'album', 'artist': 'singer', 'playlist': 'diss', 'mv': 'mv'}
    prefix = prefixes[kind]
    sid = (x.get('v_id') or x.get('vid')) if kind == 'mv' else None
    sid = sid or x.get('mid') or x.get(prefix+'MID') or x.get(prefix+'Mid') or x.get(prefix+'mid') or x.get(prefix+'_mid') or x.get('id') or x.get(prefix+'ID') or x.get(prefix+'id') or x.get('dissid') or x.get('mv_id')
    title = x.get('title') or x.get('name') or x.get(prefix+'Name') or x.get(prefix+'name') or x.get(prefix+'_name') or x.get('dissname')
    cover = x.get('picUrl') or x.get('cover_url_big') or x.get('cover') or x.get('imgurl') or x.get('albumPic') or x.get('singerPic') or x.get('mv_pic_url') or ''
    if not cover and kind in ('album', 'artist') and sid and not str(sid).isdigit():
        cover = f'https://y.gtimg.cn/music/photo_new/{"T002" if kind=="album" else "T001"}R500x500M000{sid}.jpg'
    artists = x.get('singer') or x.get('singerList') or x.get('singer_list') or []
    if isinstance(artists, dict): artists = [artists]
    if not artists and kind != 'artist' and (x.get('singerName') or x.get('singer_name')):
        artists = [{'name':x.get('singerName') or x.get('singer_name'), 'mid':x.get('singerMID')}]
    return entity('qqmusic', kind, sid, title, cover,
                  artist=' / '.join(plain(a.get('name') or a.get('singerName') or a.get('singer_name')) for a in artists),
                  artist_ids=[str(a.get('mid') or a.get('singerMid') or a.get('singerMID') or a.get('id')) for a in artists if a.get('mid') or a.get('singerMid') or a.get('singerMID') or a.get('id')],
                  description=plain(x.get('desc') or x.get('description')),
                  count=x.get('song_count') or x.get('songnum') or x.get('songNum') or x.get('total') or 0,
                  source_url=f'https://y.qq.com/n/ryqq/{"singerDetail" if kind=="artist" else "albumDetail" if kind=="album" else kind}/{sid}',
                  published_at=(x.get('public_time') or x.get('publicTime') or x.get('publish_date') or x.get('publishDate') or x.get('time_public')) if kind!='artist' else None,
                  company=plain(x.get('company') or x.get('company_name')),language=plain(x.get('language') or x.get('lan')),genres=x.get('genres') or [])


def spotify_entity(x, kind):
    return entity('spotify', kind, x.get('id'), x.get('name'),
                  (x.get('images') or [{}])[0].get('url', ''),
                  artist=' / '.join(a.get('name', '') for a in x.get('artists', [])),
                  artist_ids=[a['id'] for a in x.get('artists', []) if a.get('id')],
                  description=plain(x.get('description')),
                  count=x.get('total_tracks') or (x.get('tracks') or {}).get('total') or 0,
                  published_at=x.get('release_date'), genres=x.get('genres', []))


def search(provider, source, kind, query, limit=30, offset=0):
    if kind not in ('album', 'artist', 'playlist', 'mv'):
        raise ValueError('只支持音乐实体搜索')
    if source == 'netease':
        data = provider._get('/api/search/get', {'s': query, 'type': {'album': 10, 'artist': 100, 'playlist': 1000, 'mv': 1004}[kind], 'limit': limit, 'offset': offset})
        result = data.get('result') or {}
        key = {'album': 'albums', 'artist': 'artists', 'playlist': 'playlists', 'mv': 'mvs'}[kind]
        items = [netease_entity(x, kind) for x in result.get(key, [])]
        total = result.get({'album':'albumCount','artist':'artistCount','playlist':'playlistCount','mv':'mvCount'}[kind], len(items))
    elif source == 'qqmusic':
        data = provider._call('music.search.SearchCgiService', 'DoSearchForQQMusicDesktop',
                              {'search_type': {'artist':1,'album':2,'playlist':3,'mv':4}[kind], 'query':query, 'page_num':offset//limit+1, 'num_per_page':limit})
        key = {'artist':'singer','album':'album','playlist':'songlist','mv':'mv'}[kind]
        page = (data.get('body') or {}).get(key)
        if not isinstance(page, dict) or not isinstance(page.get('list'), list):
            raise RuntimeError('QQ 音乐没有返回该类型的结果列表')
        items = [qq_entity(x, kind) for x in page['list']]
        meta = data.get('meta') or {}
        try:
            total = int(meta.get('sum', page.get('sum', page.get('totalnum', len(items)))) or 0)
            has_more = bool(items) and (int(meta.get('nextpage') or 0) > int(meta.get('curpage') or offset//limit+1) if 'nextpage' in meta else offset+len(items)<total)
        except (ValueError, TypeError):
            raise RuntimeError('QQ 音乐搜索分页信息格式已变化')
        return {'items':items, 'total':total, 'offset':offset, 'has_more':has_more,
                'estimated_total':meta.get('estimate_sum'), 'filtered':bool(meta.get('is_filter'))}
    else:
        return provider.search_entities(kind,query,limit,offset)
    return {'items':items, 'total':int(total or 0), 'offset':offset, 'has_more':offset+len(items)<int(total or 0)}


def album(provider, source, sid, offset=0, limit=100):
    if source not in ('netease','qqmusic'):return provider.album(sid,offset,limit)
    if source == 'netease':
        data = provider._get('/api/album/'+provider._id(sid))
        raw = data.get('album')
        if not raw: raise RuntimeError('网易云未返回专辑资料')
        tracks = [provider.normalize(x) for x in data.get('songs', raw.get('songs', []))]
        result = netease_entity(raw, 'album')
        total = result['count'] or len(tracks)
        tracks = tracks[offset:offset+limit]
    elif source == 'qqmusic':
        sid = provider._source_id(sid)
        param = {'albumId':int(sid)} if sid.isdecimal() else {'albumMId':sid}
        info = provider._call('music.musichallAlbum.AlbumInfoServer','GetAlbumDetail',param)
        raw = info.get('basicInfo') or info.get('albumInfo') or info.get('data') or info
        raw = dict(raw)
        if not raw.get('singerList'):raw['singerList']=(info.get('singer') or {}).get('singerList') or []
        company=info.get('company') or {}
        if isinstance(company,dict) and not raw.get('company'):raw['company']=company.get('name') or company.get('companyName') or ''
        if not raw.get('albumMid') and not raw.get('mid'): raw['mid'] = sid
        result = qq_entity(raw, 'album')
        if not result['title']: raise RuntimeError('QQ 音乐未返回专辑名称，不能把空资料当成完整专辑')
        param = {'albumId':int(sid)} if sid.isdecimal() else {'albumMid':sid}
        page = provider._call('music.musichallAlbum.AlbumSongList','GetAlbumSongList',{**param,'begin':offset,'num':limit})
        songs = page.get('songList') or page.get('songlist') or []
        tracks = [provider.normalize(x.get('songInfo') or x) for x in songs]
        total = page.get('totalNum', page.get('total', len(tracks)))
        result['description'] = plain(info.get('desc') or info.get('description') or result.get('description'))
    else:
        raw = provider.api('albums/'+sid)
        result = spotify_entity(raw, 'album')
        page = provider.api(f'albums/{sid}/tracks',params={'limit':min(limit,50),'offset':offset})
        tracks = [provider.normalize(dict(x,album=raw)) for x in page.get('items', []) if x.get('type','track')=='track']
        total = page.get('total', len(tracks))
    for i,t in enumerate(tracks):
        # This is the returned page's position, not a manufactured disc/track number.
        t['list_position'] = offset+i+1
        if not t.get('album'): t['album'] = result['title']
        if not t.get('album_id'): t['album_id'] = sid
        if not t.get('cover'): t['cover'] = result['cover']
    return dict(result,tracks=tracks,total=int(total or 0),offset=offset,has_more=offset+len(tracks)<int(total or 0))


def artist_profile(provider, source, sid, name=''):
    """The artist entity with its own picture, from a single light request."""
    if source == 'qqmusic': return qq_entity({'mid':sid,'name':name},'artist')
    if source == 'spotify': return provider.artist_profile(sid)
    raw = provider._get('/api/artist/'+provider._id(sid)).get('artist')
    if not raw: raise RuntimeError('网易云未返回歌手资料')
    return netease_entity(raw,'artist')


def artist(provider, source, sid, offset=0, limit=50):
    if source not in ('netease','qqmusic'):return provider.artist(sid,offset,limit)
    warnings = []
    if source == 'netease':
        data = provider._get('/api/artist/'+provider._id(sid))
        raw = data.get('artist')
        if not raw: raise RuntimeError('网易云未返回歌手资料')
        result = netease_entity(raw,'artist')
        try:
            songs = provider._get('/api/v1/artist/songs', {'id':sid,'limit':limit,'offset':offset,'order':'hot'})
            tracks = [provider.normalize(x) for x in songs.get('songs', [])]
            total = songs.get('total',len(tracks))
            result['has_more'] = bool(songs.get('more'))
            result['track_scope'] = '平台当前作品目录，按热度分页；不保证包含已屏蔽作品'
        except Exception:
            tracks = [provider.normalize(x) for x in data.get('hotSongs', [])][offset:offset+limit]
            total = len(data.get('hotSongs', []))
            result['has_more'] = offset+len(tracks)<total
            result['track_scope'] = '完整曲目接口失败，暂展示热门歌曲子集'
        albums=[]
        try:
            page = provider._get('/api/artist/albums/'+sid,{'limit':limit,'offset':offset})
            albums = [netease_entity(x,'album') for x in page.get('hotAlbums', [])]
            result['albums_has_more'] = bool(page.get('more'))
        except Exception:
            warnings.append('歌手专辑请求失败，歌曲列表仍可查看')
        result['description'] = plain(raw.get('briefDesc'))
        try:
            intro=provider._get('/api/artist/introduction',{'id':sid})
            result['description']=plain(intro.get('briefDesc')) or result['description']
            result['description_sections']=[{'title':plain(x.get('ti')),'text':plain(x.get('txt'))} for x in intro.get('introduction',[]) if isinstance(x,dict) and x.get('txt')]
        except Exception:
            if not result['description']:warnings.append('歌手介绍暂不可用')
    elif source == 'qqmusic':
        page = provider._call('musichall.song_list_server','GetSingerSongList',{'singerMid':sid,'order':1,'number':limit,'num':limit,'begin':offset})
        tracks = [provider.normalize(x.get('songInfo') or x) for x in page.get('songList', [])]
        if not tracks and not page.get('totalNum'):
            raise RuntimeError('QQ 音乐没有返回歌手曲目；不能据此确认该歌手没有作品')
        name = next((a['name'] for t in tracks for a in t.get('artists',[]) if a['id']==sid), '')
        result = qq_entity({'mid':sid,'name':name},'artist')
        total = page.get('totalNum',len(tracks))
        result['track_scope'] = '平台当前返回的曲目；不保证包含被屏蔽作品'
        try:
            info=provider._call('music.musichallSinger.SingerInfoInter','GetSingerDetail',{'singer_mids':[sid],'ex_singer':1,'wiki_singer':1,'group_singer':1,'pic':1,'photos':1})
            match=next((x for x in info.get('singer_list',[]) if str((x.get('basic_info') or {}).get('singer_mid'))==str(sid)),None)
            if match:
                basic=match.get('basic_info') or {};result.update(qq_artist_description(match))
                if basic.get('name'):result['title']=plain(basic['name'])
                result['description_source']='QQ音乐歌手资料'
            if not result.get('description'):warnings.append('歌手介绍暂不可用')
        except Exception:warnings.append('歌手介绍暂不可用')
        albums = []
        try:
            data = provider._call('music.musichallAlbum.AlbumListServer','GetAlbumList',{'singerMid':sid,'order':1,'number':limit,'num':limit,'begin':offset})
            albums = [qq_entity(x,'album') for x in data.get('albumList', [])]
            result['albums_has_more'] = offset+len(albums)<data.get('total',len(albums))
        except RuntimeError:
            warnings.append('歌手专辑请求失败，歌曲列表仍可查看')
    else:
        raw = provider.api('artists/'+sid)
        result = spotify_entity(raw,'artist')
        page = provider.api('artists/'+sid+'/albums', params={'limit':min(limit,50),'offset':offset})
        albums = [spotify_entity(x,'album') for x in page.get('items', []) if x]
        result['albums_has_more'] = bool(page.get('next'))
        tracks = []
        total = 0
        try:
            tracks = [provider.normalize(x) for x in provider.api('artists/'+sid+'/top-tracks').get('tracks', [])]
        except RuntimeError:
            warnings.append('当前 Spotify 会话无法读取热门曲目；专辑仍可浏览')
        result['track_scope'] = '热门曲目，不代表全部作品'
    has_more=result.get('has_more',source=='qqmusic' and offset+len(tracks)<int(total or 0))
    return dict(result,tracks=tracks,albums=albums,total=int(total or 0),offset=offset,
                has_more=has_more,warnings=warnings)


DISCOVERY = [
    {'id':'netease:daily','source':'netease','title':'每日推荐','description':'你的网易云日推','mode':'read','requires_login':True},
    {'id':'netease:fm','source':'netease','title':'私人 FM','description':'连续发现喜欢的音乐','mode':'read','requires_login':True},
    {'id':'netease:playlists','source':'netease','title':'推荐歌单','description':'网易云精选音乐歌单','mode':'read'},
    {'id':'netease:albums','source':'netease','title':'新碟上架','description':'查看新发行的音乐专辑','mode':'read'},
    {'id':'qqmusic:radar','source':'qqmusic','title':'雷达','description':'QQ 音乐雷达推荐','mode':'read','requires_login':True},
    {'id':'qqmusic:guess','source':'qqmusic','title':'猜你喜欢','description':'QQ 音乐个性电台','mode':'read','requires_login':True},
    {'id':'spotify:discover','source':'spotify','title':'每周发现 / Daylist','description':'在官方音乐页查看个性化列表','mode':'official','url':'https://open.spotify.com/genre/made-for-x-page'},
    {'id':'spotify:jam','source':'spotify','title':'Jam 与 Blend','description':'保留官方共同听歌与口味融合体验','mode':'official','url':'https://open.spotify.com/'},
]


def _gather(fetch, want, attempts):
    # Personal radios hand out a few songs per request; keep asking until a full page, dropping repeats.
    seen, out, stale = set(), [], 0
    for i in range(attempts):
        try:
            batch = fetch(i)
        except Exception:
            if out: break
            raise
        fresh = [t for t in batch if t['id'] not in seen]
        seen.update(t['id'] for t in fresh); out += fresh
        # One repeated batch is normal for a radio; two in a row means it has run dry.
        stale = 0 if fresh else stale + 1
        if len(out) >= want or stale >= 2: break
    return out


def _tracks(provider, songs):
    out = []
    for song in songs:
        try: out.append(provider.normalize(song))
        except Exception: pass
    return out


def discovery(provider, source, mode):
    tracks, items = [], []
    if source == 'netease':
        if mode == 'daily':
            data = provider._weapi('/v3/discovery/recommend/songs', {})
            tracks = _tracks(provider, (data.get('data') or {}).get('dailySongs', []))
        elif mode == 'fm':
            tracks = _gather(lambda i: _tracks(provider, provider._weapi('/v1/radio/get', {'limit':3}).get('data', [])), 24, 10)
        elif mode == 'playlists':
            data = provider._get('/api/personalized/playlist', {'limit':30,'total':True,'n':1000})
            items = [netease_entity(x,'playlist') for x in data.get('result', [])]
        elif mode == 'albums':
            data = provider._get('/api/discovery/newAlbum', {'limit':30,'offset':0,'total':True,'area':'ALL'})
            items = [netease_entity(x,'album') for x in data.get('albums', [])]
    elif source == 'qqmusic':
        if mode == 'radar':
            def radar(i):
                data = provider._call('music.recommend.TrackRelationServer','GetRadarSong',{'Page':i+1,'ReqType':0,'FavSongs':[],'EntranceSongs':[]})
                return _tracks(provider, [x.get('Track') or x.get('songInfo') or x for x in data.get('VecSongs', data.get('Songs', data.get('songs', [])))])
            tracks = _gather(radar, 30, 5)
        elif mode == 'guess':
            tracks = _gather(lambda i: _tracks(provider, [x.get('songInfo') or x for x in provider._call('music.radioProxy.MbTrackRadioSvr','get_radio_track',{'id':99,'num':20,'from':0,'scene':0,'song_ids':[]}).get('tracks', [])]), 25, 8)
    else:
        return dict(provider.discovery(mode),source=source,mode=mode)
    return {'tracks':tracks,'items':items,'source':source,'mode':mode}
