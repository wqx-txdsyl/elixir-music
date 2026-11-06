"""Read-only account collections. No cloud mutation or inferred membership.

QQ/NCM request contracts were checked against their current client responses;
Spotify query hashes come from the official WebPlayer bundle retained in checks.
Every complete snapshot must exhaust the provider's pagination.
"""
import hashlib
import json
from http.cookies import SimpleCookie
from .catalog import entity,netease_entity,qq_entity
from .providers.spotify_web import normalize_entity,normalize_track

SOURCES=('netease','qqmusic','spotify')
KINDS=('track','album','artist','playlist')


def owner_key(store,source):
    secret=store.secret(source)
    if not secret:return ''
    if source=='spotify':
        token=json.loads(secret);secret=token.get('cookie','')
        if not secret:return hashlib.sha256(str(token.get('refresh_token') or token.get('access_token') or '').encode()).hexdigest()
    cookies=SimpleCookie();cookies.load(secret)
    names={'netease':['MUSIC_U'],'qqmusic':['euin','encryptUin','encrypt_uin','uin'],'spotify':['sp_dc']}[source]
    key=next((cookies[n].value for n in names if n in cookies and cookies[n].value),'')
    return hashlib.sha256(key.encode()).hexdigest() if key else ''


def cache_key(source,owner,kind):return f'cloud-library:v1:{source}:{owner}:{kind}'


def unwrap(raw):
    uri=''
    for _ in range(7):
        if not isinstance(raw,dict):return {}
        uri=raw.get('uri') or raw.get('_uri') or uri
        child=next((raw[k] for k in ('itemV2','item','track','data') if isinstance(raw.get(k),dict)),None)
        if child is None:return dict(raw,uri=raw.get('uri') or uri)
        raw=child
    raise RuntimeError('平台收藏条目的嵌套格式已变化')


def paged(load,convert,rows_key,total_key,more_key):
    items={};offset=0;pages=set();filtered=0
    while offset<10000:
        data=load(offset)
        rows=data.get(rows_key)
        if not isinstance(rows,list):raise RuntimeError('平台没有返回收藏列表；不能将格式错误当作空音乐库')
        total=data.get(total_key) if total_key else None
        if total is not None and (isinstance(total,bool) or not isinstance(total,int) or total<0):raise RuntimeError('平台收藏总数格式已变化')
        more=data.get(more_key) if more_key else None
        fingerprint=hashlib.sha256(json.dumps(rows,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        if rows and fingerprint in pages:raise RuntimeError('平台收藏分页重复，已停止读取；旧列表保留')
        pages.add(fingerprint)
        for row in rows:
            item=convert(row)
            if item is None:filtered+=1
            else:items.setdefault(item['id'],item)
        offset+=len(rows)
        if total is not None and offset>=total:
            if more:raise RuntimeError('平台收藏总数与分页状态不一致')
            return list(items.values()),total,filtered
        if more is not None and not more:
            if total is not None and offset<total:raise RuntimeError('平台收藏分页提前结束，旧列表保留')
            return list(items.values()),offset,filtered
        if not rows or total is None and more is None:raise RuntimeError('平台没有返回可验证的完整收藏分页')
    raise RuntimeError('收藏超过本次10000条读取上限，未用截断结果替换原列表')


def spotify_items(provider,kind):
    if provider.tokens.get('mode')!='web':
        if kind=='track':
            load=lambda offset:provider.api('me/tracks',params={'offset':offset,'limit':50})
            convert=lambda row:provider.normalize(row.get('track') or row.get('item') or {})
        elif kind=='album':
            load=lambda offset:provider.api('me/albums',params={'offset':offset,'limit':50})
            from .catalog import spotify_entity
            convert=lambda row:spotify_entity(row.get('album') or {},'album')
        else:raise RuntimeError('当前 OAuth 关注歌手读取尚未验证，请使用本人官方网页会话')
        return paged(load,convert,'items','total',None)
    web=provider.web()
    if kind=='track':
        def load(offset):
            page=(web._query('fetchLibraryTracks',{'offset':offset,'limit':100}).get('me') or {}).get('library',{}).get('tracks')
            if not isinstance(page,dict) or page.get('__typename')!='UserLibraryTrackPage':raise RuntimeError('Spotify 没有返回本人喜欢的歌曲列表')
            return page
        def convert(row):
            raw=unwrap(row)
            return normalize_track(raw) if raw.get('__typename')=='Track' else None
    else:
        def load(offset):
            data=web._query('libraryV3',{'filters':['Albums' if kind=='album' else 'Artists'],'order':None,'textFilter':None,'features':[],
                'limit':100,'offset':offset,'flatten':True,'expandedFolders':[],'folderUri':None,'includeFoldersWhenFlattening':False})
            page=(data.get('me') or {}).get('libraryV3')
            if not isinstance(page,dict) or page.get('__typename')!='LibraryPage':raise RuntimeError('Spotify 没有返回本人收藏列表')
            return page
        def convert(row):
            raw=unwrap(row)
            return normalize_entity(raw,kind) if raw.get('__typename')==kind.capitalize() else None
    return paged(load,convert,'items','totalCount',None)


def fetch_collection(provider,source,kind,profile):
    warnings=[];partial=False;metadata_partial=False
    if kind=='playlist':
        if source=='netease':
            items,total,filtered=paged(lambda offset:provider._get('/api/user/playlist',{'uid':profile['user_id'],'offset':offset,'limit':100}),lambda row:netease_entity(row,'playlist'),'playlist',None,'more')
            return {'source':source,'kind':kind,'tracks':[],'items':items,'count':len(items),'total':total,'filtered_nonmusic_count':filtered,'partial':False,'warnings':[],'scope':'cloud-read-only'}
        rows=provider.playlists(profile.get('user_id',''))
        status=getattr(rows,'status',{})
        partial=bool(status.get('partial'));warnings=status.get('warnings',[])
        items=[]
        for row in rows:
            sid=str(row.get('source_id') or row['id']).removeprefix(source+':')
            items.append(entity(source,'playlist',sid,row.get('title',''),row.get('cover',''),count=row.get('count'),collection_kind=row.get('collection_kind')))
        total=len(items);filtered=0
    elif source=='spotify':items,total,filtered=spotify_items(provider,kind)
    elif source=='netease':
        if kind=='track':
            data=provider._weapi('/song/like/get',{'uid':profile['user_id']});ids=data.get('ids')
            if not isinstance(ids,list):raise RuntimeError('网易云未返回本人喜欢的歌曲标识')
            if len(ids)>10000:raise RuntimeError('喜欢歌曲超过本次10000条读取上限')
            items=[];total=len(ids);filtered=0
            for start in range(0,len(ids),100):
                rows=provider._details(ids[start:start+100]);by_id={r['source_id']:r for r in rows}
                for sid in ids[start:start+100]:
                    item=by_id.get(str(sid))
                    if item:items.append(item)
                    else:
                        metadata_partial=True;items.append({'id':'netease:'+str(sid),'source':'netease','source_id':str(sid),'title':'','artist':'','metadata_missing':True,'availability':'unknown','source_url':'https://music.163.com/#/song?id='+str(sid)})
            if metadata_partial:warnings.append('部分原始歌曲编号未返回资料，未猜测标题或移除编号')
        else:
            load=lambda offset:provider._weapi('/'+kind+'/sublist',{'limit':100,'offset':offset,'total':True})
            items,total,filtered=paged(load,lambda x:netease_entity(x,kind),'data','count','hasMore')
    elif source=='qqmusic':
        euin=next((provider._cookies.get(k) for k in ('euin','encryptUin','encrypt_uin') if provider._cookies.get(k)),None)
        if not euin:raise RuntimeError('QQ 会话缺少收藏所需账户标识，请在官方窗口重新连接')
        if kind=='track':
            def load(offset):
                page=provider._call('music.srfDissInfo.DissInfo','CgiGetDiss',{'disstid':0,'dirid':201,'tag':True,'song_begin':offset,'song_num':100,'userinfo':True,'orderlist':True,'enc_host_uin':euin})
                if not isinstance(page.get('songlist'),list):raise RuntimeError('QQ 未返回喜欢的歌曲列表')
                # total_song_num includes filtered slots. Do not drop their
                # original IDs or advance only by the visible rows.
                page['entries']=page['songlist']+[dict(x,_filtered=True) for x in page.get('filtered_song',[])]
                return page
            def convert(row):
                if not row.get('_filtered'):return provider.normalize(row)
                sid=str(row.get('songid') or '')
                if not sid.isdecimal() or int(sid)<=0:raise RuntimeError('QQ 屏蔽条目未返回有效原始编号')
                return {'id':'qqmusic:'+sid,'source':'qqmusic','source_id':sid,'songid':sid,'title':'','artist':'','metadata_missing':True,'visibility':'filtered','availability':'unknown','source_url':'https://y.qq.com/n/ryqq/songDetail/'+sid}
            items,total,filtered=paged(load,convert,'entries','total_song_num','hasmore')
            metadata_partial=any(t.get('metadata_missing') for t in items)
            if metadata_partial:warnings.append('QQ 返回了部分屏蔽歌曲的原始编号；资料缺失项保留编号，未猜测标题')
        elif kind=='album':
            load=lambda offset:provider._call('music.musicasset.AlbumFavRead','CgiGetAlbumFavInfo',{'euin':euin,'offset':offset,'size':100})
            items,total,filtered=paged(load,lambda row:qq_entity(dict(row,singer=row.get('v_singer') or [],cover=row.get('logo',''),public_time=(row.get('pubtime') or 0)*1000),'album'),'v_list','total','hasmore')
        else:
            load=lambda offset:provider._call('music.concern.RelationList','GetFollowSingerList',{'HostUin':euin,'From':offset,'Size':100})
            def convert(row):
                sid=row.get('MID') or (row.get('OtherInfo') or {}).get('SingerID')
                return entity('qqmusic','artist',sid,row.get('Name',''),row.get('AvatarUrl',''),description=row.get('Desc','')) if sid else None
            items,total,filtered=paged(load,convert,'List','Total','HasMore')
    else:raise ValueError('未知音乐平台')
    return {'source':source,'kind':kind,'tracks':items if kind=='track' else [],'items':items if kind!='track' else [],
        'count':len(items),'total':total,'filtered_nonmusic_count':filtered,'partial':partial,'metadata_partial':metadata_partial,'warnings':warnings,'scope':'cloud-read-only'}
