"""Conservative exact-title/artist/duration matching against the public LRCLIB API."""
import requests
from .library import normalize

def lookup(track,proxy=''):
    title,artist=track.get('title',''),track.get('artist','')
    duration=track.get('duration_ms',0)/1000
    if not title or not artist or artist=='未知歌手' or duration<=0: return None
    with requests.Session() as s:
        s.headers['User-Agent']='MusicPlatform/0.1.0 (local desktop music library)'
        if proxy: s.proxies={'http':proxy,'https':proxy}
        r=s.get('https://lrclib.net/api/search',params={'track_name':title,'artist_name':artist},timeout=12)
        r.raise_for_status()
        rows=r.json()
    matches=[x for x in rows if normalize(x.get('trackName',''))==normalize(title)
        and normalize(x.get('artistName',''))==normalize(artist)
        and abs(float(x.get('duration') or 0)-duration)<=2
        and (x.get('syncedLyrics') or x.get('plainLyrics'))]
    if not matches: return None
    matches.sort(key=lambda x:(normalize(x.get('albumName',''))!=normalize(track.get('album','')),not bool(x.get('syncedLyrics')),abs(float(x['duration'])-duration)))
    row=matches[0]
    return {'original':row.get('syncedLyrics') or row.get('plainLyrics') or '', 'translated':'','source':'lrclib','source_id':str(row['id']),
            'source_url':'https://lrclib.net/api/get/'+str(row['id']), 'matched_title':row['trackName'],'matched_artist':row['artistName'],
            'matched_duration':row['duration'],'attribution':'LRCLIB 社区歌词库','reason':'原平台未提供歌词，已按歌名、歌手和时长匹配 LRCLIB 社区记录'}
