"""SQLite music library and Windows-encrypted account secrets."""
from __future__ import annotations
import base64
import hashlib
import re
import ctypes
import json
import os
import sqlite3
import threading
import time
import uuid
from pathlib import Path

def system_proxy():
    if os.name!='nt': return ''
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,r'Software\Microsoft\Windows\CurrentVersion\Internet Settings') as key:
            if not winreg.QueryValueEx(key,'ProxyEnable')[0]: return ''
            value=winreg.QueryValueEx(key,'ProxyServer')[0]
            if '=' in value:
                parts=dict(x.split('=',1) for x in value.split(';') if '=' in x)
                value=parts.get('https',parts.get('http',''))
            return ('http://'+value if '://' not in value else value) if value else ''
    except OSError: return ''

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get('MUSICPLATFORM_DATA', str(ROOT / 'data')))
DATA.mkdir(parents=True, exist_ok=True)

def protect(text: str, decrypt=False) -> str:
    if os.name != 'nt':
        raise RuntimeError('账号安全存储需要 Windows DPAPI')
    class BLOB(ctypes.Structure):
        _fields_ = [('cbData', ctypes.c_ulong), ('pbData', ctypes.POINTER(ctypes.c_ubyte))]
    raw = base64.b64decode(text) if decrypt else text.encode('utf-8')
    buf = ctypes.create_string_buffer(raw)
    incoming = BLOB(len(raw), ctypes.cast(buf, ctypes.POINTER(ctypes.c_ubyte)))
    outgoing = BLOB()
    fn = ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    if not fn(ctypes.byref(incoming), None, None, None, None, 1, ctypes.byref(outgoing)):
        raise ctypes.WinError()
    try:
        out = ctypes.string_at(outgoing.pbData, outgoing.cbData)
        return out.decode('utf-8') if decrypt else base64.b64encode(out).decode('ascii')
    finally:
        ctypes.windll.kernel32.LocalFree(outgoing.pbData)

class Store:
    def __init__(self, path=None):
        self.lock = threading.RLock()
        self.db_path = Path(path or DATA / 'library.sqlite3')
        self.covers = self.db_path.parent / 'playlist-covers'
        self.db = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS tracks(id TEXT PRIMARY KEY, source TEXT NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, payload TEXT NOT NULL, path TEXT, updated REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS likes(track_id TEXT PRIMARY KEY REFERENCES tracks(id), created REAL);
        CREATE TABLE IF NOT EXISTS history(track_id TEXT PRIMARY KEY REFERENCES tracks(id), played REAL, count INTEGER DEFAULT 1);
        CREATE TABLE IF NOT EXISTS listening_sessions(id TEXT PRIMARY KEY,track_id TEXT NOT NULL REFERENCES tracks(id),started REAL NOT NULL,updated REAL NOT NULL,listened_ms INTEGER NOT NULL,sequence INTEGER NOT NULL,finished INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS listening_started ON listening_sessions(started,track_id);
        CREATE TABLE IF NOT EXISTS playlists(id TEXT PRIMARY KEY, title TEXT NOT NULL, created REAL);
        CREATE TABLE IF NOT EXISTS playlist_tracks(playlist_id TEXT REFERENCES playlists(id) ON DELETE CASCADE,track_id TEXT REFERENCES tracks(id), position INTEGER, PRIMARY KEY(playlist_id,track_id));
        CREATE INDEX IF NOT EXISTS playlist_position ON playlist_tracks(playlist_id,position);
        CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY,payload TEXT NOT NULL,updated REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS secrets(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS links(local_id TEXT PRIMARY KEY REFERENCES tracks(id),remote_id TEXT REFERENCES tracks(id));
        CREATE TABLE IF NOT EXISTS entities(id TEXT PRIMARY KEY, kind TEXT NOT NULL, source TEXT NOT NULL, payload TEXT NOT NULL, saved REAL);
        CREATE TABLE IF NOT EXISTS playlist_meta(playlist_id TEXT PRIMARY KEY REFERENCES playlists(id) ON DELETE CASCADE, description TEXT NOT NULL DEFAULT '', folder TEXT NOT NULL DEFAULT '', cover TEXT NOT NULL DEFAULT '', deleted_at REAL);
        CREATE TABLE IF NOT EXISTS search_history(query TEXT PRIMARY KEY, searched REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS music_folders(path TEXT PRIMARY KEY, watched INTEGER NOT NULL DEFAULT 0, last_scan REAL);
        CREATE TABLE IF NOT EXISTS removed_local_tracks(id TEXT PRIMARY KEY, removed REAL NOT NULL);
        ''')
        if 'added' not in {r[1] for r in self.db.execute('PRAGMA table_info(playlist_tracks)')}:
            self.db.execute('ALTER TABLE playlist_tracks ADD COLUMN added REAL')
        self.db.commit()

    def upsert(self, track, path=None):
        track = dict(track); track.pop('local_path', None)
        with self.lock, self.db:
            self.db.execute('''INSERT INTO tracks VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,artist=excluded.artist,payload=excluded.payload,path=COALESCE(excluded.path,tracks.path),updated=excluded.updated''',
                (track['id'],track['source'],track['title'],track.get('artist',''),json.dumps(track,ensure_ascii=False),path,time.time()))
        return track

    def get(self, track_id):
        with self.lock:
            row = self.db.execute('SELECT payload FROM tracks WHERE id=?',(track_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def local_removed(self, track_id):
        with self.lock:
            return self.db.execute('SELECT 1 FROM removed_local_tracks WHERE id=?',(track_id,)).fetchone() is not None

    def restore_local(self, track_id):
        with self.lock,self.db:self.db.execute('DELETE FROM removed_local_tracks WHERE id=?',(track_id,))

    def remove_local(self, ids):
        ids=list(dict.fromkeys(ids))
        with self.lock,self.db:
            for tid in ids:
                row=self.db.execute('SELECT source FROM tracks WHERE id=?',(tid,)).fetchone()
                if not row or row[0]!='local':raise ValueError('只能从音乐库移除本地歌曲')
            for tid in ids:
                self.db.execute('INSERT OR REPLACE INTO removed_local_tracks VALUES(?,?)',(tid,time.time()))
                for table in ('likes','history','listening_sessions','playlist_tracks'):
                    self.db.execute(f'DELETE FROM {table} WHERE track_id=?',(tid,))
                self.db.execute('DELETE FROM links WHERE local_id=? OR remote_id=?',(tid,tid))
                self.db.execute('DELETE FROM tracks WHERE id=?',(tid,))
        return len(ids)

    def upsert_many(self,tracks):
        now=time.time();rows=[]
        for original in tracks:
            track=dict(original);track.pop('local_path',None)
            rows.append((track['id'],track['source'],track['title'],track.get('artist',''),json.dumps(track,ensure_ascii=False),None,now))
        with self.lock,self.db:
            self.db.executemany('''INSERT INTO tracks VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,artist=excluded.artist,payload=excluded.payload,updated=excluded.updated''',rows)

    def path(self, track_id):
        with self.lock:
            row = self.db.execute('SELECT path FROM tracks WHERE id=?',(track_id,)).fetchone()
        return row[0] if row else None

    def tracks(self, source=None, query='', limit=1000):
        from .text import matches
        sql, params = 'SELECT payload FROM tracks WHERE 1=1', []
        if source: sql += ' AND source=?'; params.append(source)
        sql += ' ORDER BY updated DESC'
        if not query: sql += ' LIMIT ?'; params.append(limit)
        with self.lock: rows = self.db.execute(sql,params).fetchall()
        tracks=[json.loads(r[0]) for r in rows]
        return [t for t in tracks if not query or matches(query,t.get('title'),t.get('artist'),t.get('album'))][:limit]

    def cache_get(self, key, max_age=None):
        with self.lock: row = self.db.execute('SELECT payload,updated FROM cache WHERE key=?',(key,)).fetchone()
        if row and (max_age is None or time.time()-row[1] <= max_age): return json.loads(row[0])

    def cache_put(self, key, value):
        with self.lock, self.db:
            self.db.execute('INSERT OR REPLACE INTO cache VALUES(?,?,?)',(key,json.dumps(value,ensure_ascii=False),time.time()))

    def settings(self):
        defaults = {'theme':'netease','quality':'standard','proxy':system_proxy(),'spotify_client_id':'','auto_match':False,'private_session':False}
        with self.lock: defaults.update({r[0]:json.loads(r[1]) for r in self.db.execute('SELECT key,value FROM settings')})
        return defaults

    def set_settings(self, values):
        allowed = set(self.settings())
        with self.lock, self.db:
            for k,v in values.items():
                if k in allowed: self.db.execute('INSERT OR REPLACE INTO settings VALUES(?,?)',(k,json.dumps(v)))
        return self.settings()

    def secret(self,key):
        with self.lock: row=self.db.execute('SELECT value FROM secrets WHERE key=?',(key,)).fetchone()
        return protect(row[0],True) if row else ''

    def set_secret(self,key,value):
        enc=protect(value) if value else None
        with self.lock,self.db:
            if enc: self.db.execute('INSERT OR REPLACE INTO secrets VALUES(?,?)',(key,enc))
            else: self.db.execute('DELETE FROM secrets WHERE key=?',(key,))

    def toggle_like(self,track_id):
        with self.lock,self.db:
            row=self.db.execute('SELECT 1 FROM likes WHERE track_id=?',(track_id,)).fetchone()
            if row: self.db.execute('DELETE FROM likes WHERE track_id=?',(track_id,))
            else: self.db.execute('INSERT INTO likes VALUES(?,?)',(track_id,time.time()))
        return not bool(row)

    def liked_ids(self):
        with self.lock: return {r[0] for r in self.db.execute('SELECT track_id FROM likes')}

    def batch_tracks(self,ids,action,pid=''):
        """One transaction; explicit intent makes retries safe for mixed selections."""
        with self.lock,self.db:
            if action=='like':
                self.db.executemany('INSERT OR IGNORE INTO likes VALUES(?,?)',[(tid,time.time()) for tid in ids])
            elif action=='unlike':
                self.db.executemany('DELETE FROM likes WHERE track_id=?',[(tid,) for tid in ids])
            elif action=='playlist_add':
                position=self.db.execute('SELECT COALESCE(MAX(position),0) FROM playlist_tracks WHERE playlist_id=?',(pid,)).fetchone()[0]
                now=time.time();self.db.executemany('INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position,added) VALUES(?,?,?,?)',[(pid,tid,position+i+1,now) for i,tid in enumerate(ids)])
            elif action=='playlist_remove':
                self.db.executemany('DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?',[(pid,tid) for tid in ids])
            else: raise ValueError('不支持的批量操作')

    def likes(self):
        with self.lock: rows=self.db.execute('SELECT t.payload FROM tracks t JOIN likes l ON t.id=l.track_id ORDER BY l.created DESC').fetchall()
        return [dict(json.loads(r[0]),liked=True) for r in rows]

    def record_play(self,track_id):
        with self.lock,self.db:
            if self.settings().get('private_session'):return False
            self.db.execute('INSERT INTO history VALUES(?,?,1) ON CONFLICT(track_id) DO UPDATE SET played=excluded.played,count=history.count+1',(track_id,time.time()))
        return True

    @staticmethod
    def history_scope(source,since,until):
        import math
        if source not in ('all','local','netease','qqmusic','spotify'):raise ValueError('未知的历史来源')
        if not all(math.isfinite(x) and x>=0 for x in (since,until)) or until and until<=since:raise ValueError('请选择有效的时间范围')

    def history(self,source='all',since=0,until=0):
        self.history_scope(source,since,until)
        where=['1=1'];params=[]
        if source!='all':where.append('t.source=?');params.append(source)
        if since:where.append('h.played>=?');params.append(since)
        if until:where.append('h.played<?');params.append(until)
        with self.lock: rows=self.db.execute('SELECT t.payload,h.played,h.count FROM history h JOIN tracks t ON t.id=h.track_id WHERE '+' AND '.join(where)+' ORDER BY played DESC',params).fetchall()
        return [dict(json.loads(r[0]),played_at=r[1],play_count=r[2]) for r in rows]

    def record_listening(self,sid,track_id,sequence,listened_ms,finished=False,now=None):
        """Idempotent cumulative reports from actual audio progress, never seek distance."""
        now=time.time() if now is None else now
        with self.lock,self.db:
            if self.settings().get('private_session'):return {'recorded':False,'private':True}
            previous=self.db.execute('SELECT * FROM listening_sessions WHERE id=?',(sid,)).fetchone()
            if previous:
                if previous['track_id']!=track_id:raise ValueError('播放记录不能更换歌曲')
                if sequence<=previous['sequence'] or previous['finished']:return {'recorded':False,'listened_ms':previous['listened_ms']}
                # Bound a report by elapsed wall time; suspend, retries and jumps
                # cannot turn a seek or a stale heartbeat into hours of listening.
                credit=min(max(0,listened_ms-previous['listened_ms']),max(0,int((now-previous['updated'])*1000))+2000)
                total=previous['listened_ms']+credit
                self.db.execute('UPDATE listening_sessions SET updated=?,listened_ms=?,sequence=?,finished=? WHERE id=?',(now,total,sequence,int(finished),sid))
                if credit:self.db.execute('UPDATE history SET played=? WHERE track_id=?',(now,track_id))
            else:
                total=min(listened_ms,15000)
                if total<=0:return {'recorded':False,'listened_ms':0}
                self.db.execute('INSERT INTO listening_sessions VALUES(?,?,?,?,?,?,?)',(sid,track_id,now-total/1000,now,total,sequence,int(finished)))
                self.db.execute('INSERT INTO history VALUES(?,?,1) ON CONFLICT(track_id) DO UPDATE SET played=excluded.played,count=history.count+1',(track_id,now))
        return {'recorded':True,'listened_ms':total}

    def listening_stats(self,source='all',since=0,until=0):
        self.history_scope(source,since,until)
        conditions=['1=1'];params=[]
        if source!='all':conditions.append('t.source=?');params.append(source)
        if since:conditions.append('s.started>=?');params.append(since)
        if until:conditions.append('s.started<?');params.append(until)
        where=' AND '.join(conditions)
        with self.lock:
            sessions=self.db.execute('SELECT s.*,t.payload,t.source,t.artist FROM listening_sessions s JOIN tracks t ON s.track_id=t.id WHERE '+where,params).fetchall()
            legacy=self.db.execute('SELECT h.count,t.source,t.artist,t.id FROM history h JOIN tracks t ON h.track_id=t.id'+(' WHERE t.source=?' if source!='all' else ''),[source] if source!='all' else []).fetchall()
            all_timed=self.db.execute('SELECT COUNT(*) FROM listening_sessions s JOIN tracks t ON t.id=s.track_id'+(' WHERE t.source=?' if source!='all' else ''),[source] if source!='all' else []).fetchone()[0]
        from collections import Counter
        artists=Counter();sources=Counter()
        for row in sessions if since or until else legacy:
            count=1 if since or until else row['count'];artists[row['artist'] or '未知歌手']+=count;sources[row['source']]+=count
        return {'plays':len(sessions) if since or until else sum(r['count'] for r in legacy),
            'distinct_tracks':len({r['track_id'] for r in sessions}) if since or until else len(legacy),
            'listened_ms':sum(r['listened_ms'] for r in sessions),'timed_plays':len(sessions),
            'untimed_plays':max(0,sum(r['count'] for r in legacy)-all_timed) if not since and not until else 0,
            'top_artists':[{'name':name,'plays':count} for name,count in artists.most_common(10)],'sources':dict(sources),
            'scope':'本应用记录；时长仅计算实际观察到的播放进度，旧记录不补造时长',
            'period_scope':'会话开始时间' if since or until else '全部记录'}

    def listening_calendar(self,days=182,now=None):
        """Minutes listened and plays per local calendar day, oldest first, for the last `days` days."""
        import datetime
        days=max(7,min(371,int(days)))
        today=datetime.date.fromtimestamp(time.time() if now is None else now)
        first=today-datetime.timedelta(days=days-1)
        since=time.mktime(first.timetuple())
        with self.lock:rows=self.db.execute('SELECT started,listened_ms FROM listening_sessions WHERE started>=?',(since,)).fetchall()
        totals={}
        for row in rows:
            key=datetime.date.fromtimestamp(row['started']).isoformat()
            item=totals.setdefault(key,[0,0]);item[0]+=row['listened_ms'];item[1]+=1
        return {'days':[{'day':(first+datetime.timedelta(days=i)).isoformat(),'listened_ms':totals.get((first+datetime.timedelta(days=i)).isoformat(),[0,0])[0],'plays':totals.get((first+datetime.timedelta(days=i)).isoformat(),[0,0])[1]} for i in range(days)],
            'scope':'本应用记录的实际播放时长'}

    def export_listening(self,source='all',since=0,until=0):
        self.history_scope(source,since,until)
        where=['1=1'];params=[]
        if source!='all':where.append('t.source=?');params.append(source)
        if since:where.append('s.started>=?');params.append(since)
        if until:where.append('s.started<?');params.append(until)
        with self.lock:rows=self.db.execute('SELECT s.*,t.payload FROM listening_sessions s JOIN tracks t ON t.id=s.track_id WHERE '+' AND '.join(where)+' ORDER BY s.started DESC',params).fetchall()
        allowed={'id','source','source_id','title','artist','album','duration_ms'}
        return {'format':'elixir-listening-history','version':1,'scope':'本应用观察记录',
            'stats':self.listening_stats(source,since,until),
            'sessions':[{'track':{k:v for k,v in json.loads(r['payload']).items() if k in allowed},'started_at':r['started'],'updated_at':r['updated'],'listened_ms':r['listened_ms']} for r in rows],
            'recent_tracks':[{k:v for k,v in t.items() if k in allowed|{'played_at','play_count'}} for t in self.history(source,since,until)]}

    def listening_ranking(self,source='all',since=0,until=0):
        self.history_scope(source,since,until)
        from .text import normalized
        where=['1=1'];params=[]
        if source!='all':where.append('t.source=?');params.append(source)
        if since:where.append('s.started>=?');params.append(since)
        if until:where.append('s.started<?');params.append(until)
        with self.lock:
            sessions=self.db.execute('SELECT s.track_id,s.listened_ms,t.payload FROM listening_sessions s JOIN tracks t ON t.id=s.track_id WHERE '+' AND '.join(where),params).fetchall()
            legacy=[] if since or until else self.db.execute('SELECT h.track_id,h.count,t.payload FROM history h JOIN tracks t ON t.id=h.track_id'+(' WHERE t.source=?' if source!='all' else ''),[source] if source!='all' else []).fetchall()
            links={r[0]:json.loads(r[1]) for r in self.db.execute('SELECT l.local_id,t.payload FROM links l JOIN tracks t ON t.id=l.remote_id')}
        tracks={}
        for row in legacy:
            tracks[row['track_id']]=dict(json.loads(row['payload']),play_count=row['count'],listened_ms=0)
        for row in sessions:
            track=tracks.setdefault(row['track_id'],dict(json.loads(row['payload']),play_count=0,listened_ms=0))
            track['listened_ms']+=row['listened_ms']
            if since or until:track['play_count']+=1
        artists={};albums={}
        for track in tracks.values():
            meta=links.get(track['id'],track);name=meta.get('artist') or track.get('artist') or '未知歌手'
            credited=meta.get('artists') or [{'name':name,'id':(meta.get('artist_ids') or [''])[0]}]
            for artist in {normalized(a.get('name')):a for a in credited if isinstance(a,dict) and a.get('name')}.values():
                key=normalized(artist['name']);item=artists.setdefault(key,{'name':artist['name'],'play_count':0,'listened_ms':0,'cover':'','entity_ids':set()})
                item['play_count']+=track['play_count'];item['listened_ms']+=track['listened_ms']
                if artist.get('id'):
                    eid=f"{meta['source']}:artist:{artist['id']}";item['entity_ids'].add(eid)
                    item.setdefault('entity',{'id':eid,'kind':'artist','source':meta['source'],'source_id':str(artist['id']),'title':artist['name']})
            album=meta.get('album') or track.get('album')
            if album:
                key=(normalized(album),normalized(name));item=albums.setdefault(key,{'name':album,'artist':name,'play_count':0,'listened_ms':0,'entity_ids':set()})
                item['play_count']+=track['play_count'];item['listened_ms']+=track['listened_ms']
                if meta.get('album_id'):item['entity_ids'].add(f"{meta['source']}:album:{meta['album_id']}")
        # Artist pictures come from saved artist entities (by id, then by name); a song's album cover is not the artist.
        with self.lock:known=[json.loads(r[0]) for r in self.db.execute("SELECT payload FROM entities WHERE kind='artist'")]
        by_id={e['id']:e.get('cover') for e in known if e.get('cover')};by_name={}
        for e in known:
            if e.get('cover'):by_name.setdefault(normalized(e.get('title')),e['cover'])
        for item in artists.values():
            item['cover']=next((by_id[e] for e in sorted(item['entity_ids']) if by_id.get(e)),'') or by_name.get(normalized(item['name']),'')
        def finish(items):
            return sorted([dict(x,entity_ids=sorted(x['entity_ids'])) for x in items],key=lambda x:(-x['play_count'],-x['listened_ms'],x['name']))
        return {'tracks':sorted(tracks.values(),key=lambda t:(-t['play_count'],-t['listened_ms'],t['title'])), 'artists':finish(artists.values()),'albums':finish(albums.values()),'scope':'Elixir 实际记录'}

    def track_listening(self,tid):
        with self.lock:
            count=self.db.execute('SELECT count FROM history WHERE track_id=?',(tid,)).fetchone()
            duration=self.db.execute('SELECT COALESCE(SUM(listened_ms),0) FROM listening_sessions WHERE track_id=?',(tid,)).fetchone()[0]
        return {'play_count':count[0] if count else 0,'listened_ms':duration,'scope':'Elixir 实际记录'}

    def entity_listening(self,eid):
        entity=self.entity(eid) or {};kind=entity.get('kind') or eid.split(':')[1]
        if kind not in ('artist','album'):raise ValueError('请选择歌手或专辑')
        from .text import normalized
        rows=self.listening_ranking()['artists' if kind=='artist' else 'albums']
        chosen=[row for row in rows if eid in row['entity_ids'] or normalized(entity.get('title')) and normalized(entity.get('title'))==normalized(row['name']) and (kind=='artist' or normalized(entity.get('artist')) and normalized(entity.get('artist'))==normalized(row.get('artist')))]
        return {'play_count':sum(x['play_count'] for x in chosen),'listened_ms':sum(x['listened_ms'] for x in chosen),'scope':'Elixir 实际记录'}

    def create_playlist(self,title):
        pid=uuid.uuid4().hex
        with self.lock,self.db: self.db.execute('INSERT INTO playlists VALUES(?,?,?)',(pid,title,time.time()))
        return {'id':pid,'title':title,'tracks':[],'count':0,'cover':''}

    def playlists(self, trash=False):
        with self.lock:
            rows=self.db.execute('''SELECT p.id,p.title,m.description,m.folder,m.cover,m.deleted_at,
              (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id=p.id) AS count,
              (SELECT json_extract(t.payload,'$.cover') FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=p.id AND COALESCE(json_extract(t.payload,'$.cover'),'')!='' ORDER BY pt.added DESC,pt.rowid DESC LIMIT 1) AS latest_cover
              FROM playlists p LEFT JOIN playlist_meta m ON m.playlist_id=p.id WHERE '''+
              ('m.deleted_at IS NOT NULL' if trash else 'm.deleted_at IS NULL')+' ORDER BY p.created DESC').fetchall()
        return [{'id':r['id'],'title':r['title'],'description':r['description'] or '',
                 'folder':r['folder'] or '', 'cover':r['cover'] or r['latest_cover'] or '','cover_custom':bool(r['cover']),
                 'count':r['count'],'deleted_at':r['deleted_at'],'scope':'local'} for r in rows]

    def playlist(self,pid,include_deleted=False):
        with self.lock:
            row=self.db.execute('SELECT title FROM playlists WHERE id=?',(pid,)).fetchone()
            if not row: return None
            metadata=self.db.execute('SELECT description,folder,cover,deleted_at FROM playlist_meta WHERE playlist_id=?',(pid,)).fetchone()
            if metadata and metadata['deleted_at'] and not include_deleted: return None
            rows=self.db.execute('SELECT t.payload,pt.added,pt.rowid FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE playlist_id=? ORDER BY position',(pid,)).fetchall()
        tracks=[json.loads(r[0]) for r in rows]
        latest=next((t.get('cover') for t,_ in sorted(zip(tracks,rows),key=lambda x:(x[1][1] or 0,x[1][2]),reverse=True) if t.get('cover')),'')
        return {'id':pid,'title':row[0],'tracks':tracks,'count':len(tracks),
                'cover':(metadata['cover'] if metadata else '') or latest,'cover_custom':bool(metadata and metadata['cover']),
                'description':metadata['description'] if metadata else '', 'folder':metadata['folder'] if metadata else '',
                'deleted_at':metadata['deleted_at'] if metadata else None,'scope':'local'}

    def playlist_add(self,pid,tid):
        with self.lock,self.db:
            self.db.execute('INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position,added) VALUES(?,?,(SELECT COALESCE(MAX(position),0)+1 FROM playlist_tracks WHERE playlist_id=?),?)',(pid,tid,pid,time.time()))

    def playlist_remove(self,pid,tid):
        with self.lock,self.db: self.db.execute('DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?',(pid,tid))

    def playlist_delete(self,pid):
        with self.lock,self.db:
            self.db.execute('INSERT INTO playlist_meta(playlist_id,deleted_at) VALUES(?,?) ON CONFLICT(playlist_id) DO UPDATE SET deleted_at=excluded.deleted_at',(pid,time.time()))

    def playlist_update(self,pid,values):
        if not self.playlist(pid,include_deleted=True): raise ValueError('歌单不存在')
        with self.lock,self.db:
            if 'title' in values:
                title=str(values['title']).strip()[:100]
                if not title: raise ValueError('歌单名称不能为空')
                self.db.execute('UPDATE playlists SET title=? WHERE id=?',(title,pid))
            self.db.execute('INSERT OR IGNORE INTO playlist_meta(playlist_id) VALUES(?)',(pid,))
            for key in ('description','folder','cover'):
                if key in values:
                    limit={'description':4000,'folder':100,'cover':2000}[key]
                    self.db.execute(f'UPDATE playlist_meta SET {key}=? WHERE playlist_id=?',(str(values[key])[:limit],pid))
            if values.get('restore'): self.db.execute('UPDATE playlist_meta SET deleted_at=NULL WHERE playlist_id=?',(pid,))
        return self.playlist(pid,include_deleted=True)

    # Uploaded playlist covers live next to the database; the playlist stores their /api URL.
    COVER_TYPES={b'\xff\xd8\xff':'jpg',b'\x89PNG':'png'}
    def playlist_set_cover(self,pid,data:bytes):
        if not self.playlist(pid): raise ValueError('歌单不存在')
        ext=next((v for k,v in self.COVER_TYPES.items() if data.startswith(k)),'webp' if data[:4]==b'RIFF' and data[8:12]==b'WEBP' else '')
        if not ext: raise ValueError('封面只支持 JPG、PNG 或 WebP 图片')
        if len(data)>5*1024*1024: raise ValueError('封面图片不能超过 5MB')
        self.covers.mkdir(parents=True,exist_ok=True)
        name=f'{pid}-{hashlib.sha1(data).hexdigest()[:12]}.{ext}'
        (self.covers/name).write_bytes(data)
        self.playlist_update(pid,{'cover':'/api/playlist-covers/'+name})
        for old in self.covers.glob(pid+'-*'):
            if old.name!=name: old.unlink(missing_ok=True)
        return self.playlist(pid)

    def playlist_clear_cover(self,pid):
        if not self.playlist(pid): raise ValueError('歌单不存在')
        self.playlist_update(pid,{'cover':''})
        for old in self.covers.glob(pid+'-*'): old.unlink(missing_ok=True)
        return self.playlist(pid)

    def playlist_cover_file(self,name):
        if not re.fullmatch(r'[a-f0-9]{32}-[a-f0-9]{12}\.(jpg|png|webp)',name): return None
        path=self.covers/name
        return path if path.is_file() else None

    def playlist_reorder(self,pid,ids):
        with self.lock,self.db:
            current=[r[0] for r in self.db.execute('SELECT track_id FROM playlist_tracks WHERE playlist_id=?',(pid,))]
            if len(ids)!=len(set(ids)) or set(current)!=set(ids): raise ValueError('曲目已变化，请刷新歌单后重试；排序不能增删曲目')
            for position,tid in enumerate(ids): self.db.execute('UPDATE playlist_tracks SET position=? WHERE playlist_id=? AND track_id=?',(position,pid,tid))
        return self.playlist(pid)

    def entity_put(self,entity):
        with self.lock,self.db:
            self.db.execute('INSERT INTO entities(id,kind,source,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
                            (entity['id'],entity['kind'],entity['source'],json.dumps(entity,ensure_ascii=False)))
        return entity

    def entity(self,eid):
        with self.lock: row=self.db.execute('SELECT payload,saved FROM entities WHERE id=?',(eid,)).fetchone()
        return dict(json.loads(row[0]),saved=bool(row[1])) if row else None

    def entity_save(self,eid,saved):
        with self.lock,self.db: self.db.execute('UPDATE entities SET saved=? WHERE id=?',(time.time() if saved else None,eid))
        return self.entity(eid)

    def saved_ids(self,ids):
        ids=list(dict.fromkeys(ids))
        if not ids: return set()
        with self.lock: rows=self.db.execute(f'SELECT id FROM entities WHERE saved IS NOT NULL AND id IN ({",".join("?"*len(ids))})',ids).fetchall()
        return {r[0] for r in rows}

    def saved_entities(self,kind=None):
        with self.lock:
            rows=self.db.execute('SELECT payload FROM entities WHERE saved IS NOT NULL'+(' AND kind=?' if kind else '')+' ORDER BY saved DESC', (kind,) if kind else ()).fetchall()
        return [dict(json.loads(r[0]),saved=True) for r in rows]

    def search_record(self,query):
        if self.settings().get('private_session'):return
        with self.lock,self.db:
            self.db.execute('INSERT OR REPLACE INTO search_history VALUES(?,?)',(query,time.time()))
            self.db.execute('DELETE FROM search_history WHERE query NOT IN (SELECT query FROM search_history ORDER BY searched DESC LIMIT 50)')

    def searches(self):
        with self.lock: return [r[0] for r in self.db.execute('SELECT query FROM search_history ORDER BY searched DESC')]

    def clear_history(self):
        with self.lock,self.db:
            self.db.execute('DELETE FROM listening_sessions');self.db.execute('DELETE FROM history')

    def clear_searches(self):
        with self.lock,self.db: self.db.execute('DELETE FROM search_history')

    def unlink(self,lid):
        with self.lock,self.db: self.db.execute('DELETE FROM links WHERE local_id=?',(lid,))

    def folders(self):
        with self.lock:return [dict(r) for r in self.db.execute('SELECT * FROM music_folders ORDER BY path')]

    def folder_update(self,path,watched=None,scanned=False):
        with self.lock,self.db:
            self.db.execute('INSERT OR IGNORE INTO music_folders(path) VALUES(?)',(path,))
            if watched is not None:self.db.execute('UPDATE music_folders SET watched=? WHERE path=?',(int(bool(watched)),path))
            if scanned:self.db.execute('UPDATE music_folders SET last_scan=? WHERE path=?',(time.time(),path))

    def folder_forget(self,path):
        with self.lock,self.db:self.db.execute('DELETE FROM music_folders WHERE path=?',(path,))

    def link(self,lid,rid):
        with self.lock,self.db: self.db.execute('INSERT OR REPLACE INTO links VALUES(?,?)',(lid,rid))

    def linked(self,lid):
        with self.lock: row=self.db.execute('SELECT remote_id FROM links WHERE local_id=?',(lid,)).fetchone()
        return row[0] if row else None

    def linked_tracks(self):
        with self.lock:rows=self.db.execute('SELECT l.local_id,t.payload FROM links l JOIN tracks t ON t.id=l.remote_id').fetchall()
        return {r[0]:json.loads(r[1]) for r in rows}
