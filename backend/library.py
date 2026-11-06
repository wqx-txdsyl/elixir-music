from __future__ import annotations
import hashlib
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
import mutagen
from .store import DATA
from .text import normalized

EXTENSIONS = {'.mp3','.flac','.m4a','.aac','.ogg','.opus','.wav','.aiff','.aif','.wma','.ape'}
ART = DATA / 'artwork'
ART.mkdir(exist_ok=True)

def normalize(s):
    return normalized(s)

def match_score(local, remote):
    title=SequenceMatcher(None,normalize(local['title']),normalize(remote['title'])).ratio()
    artist=SequenceMatcher(None,normalize(local.get('artist','')),normalize(remote.get('artist',''))).ratio()
    if local.get('artist') in ('','未知歌手'): artist=0.0
    ld,rd=local.get('duration_ms',0),remote.get('duration_ms',0)
    duration=max(0,1-abs(ld-rd)/20000) if ld and rd else .4
    score=.58*title+.32*artist+.1*duration
    # A live/remix/instrumental version must not silently replace a studio recording.
    for marker in ('live','remix','伴奏','现场','instrumental','翻唱'):
        if (marker in local['title'].lower()) != (marker in remote['title'].lower()): score-=.2
    return round(max(0,score),3)

def _tag(audio, keys, default=''):
    for key in keys:
        # Keys of other formats (e.g. MP4 '\xa9alb') are invalid Vorbis names and raise instead of returning None.
        try:val=(audio.tags or {}).get(key)
        except (ValueError,KeyError):continue
        if val:
            if isinstance(val,(list,tuple)): val=val[0]
            if hasattr(val,'text'): val=val.text[0] if val.text else ''
            if str(val).strip(): return str(val).strip()
    return default

def read_track(path:Path):
    path=path.resolve()
    audio=mutagen.File(path)
    if audio is None: raise ValueError('文件格式无法识别')
    stat=path.stat()
    tid=hashlib.sha256(str(path).casefold().encode()).hexdigest()[:24]
    title=_tag(audio,('title','TIT2','\xa9nam','Title'))
    artist=_tag(audio,('artist','TPE1','\xa9ART','Author'))
    if not title:
        parts=re.split(r'\s+-\s+',path.stem,maxsplit=1)
        if len(parts)==2:
            artist=artist or parts[0]; title=parts[1]
        else: title=path.stem
    artist=artist or '未知歌手'
    album=_tag(audio,('album','TALB','\xa9alb','WM/AlbumTitle'),'本地音乐')
    cover=''
    art=None
    if getattr(audio,'pictures',None): art=audio.pictures[0].data
    elif audio.tags:
        for k,v in audio.tags.items():
            if str(k).startswith('APIC'): art=v.data; break
        if not art and 'covr' in audio.tags: art=bytes(audio.tags['covr'][0])
    if art and len(art) <= 15*1024*1024:
        from PIL import Image
        from io import BytesIO
        try:
            im=Image.open(BytesIO(art)); im.thumbnail((800,800)); im.convert('RGB').save(ART/f'{tid}.jpg',quality=90)
            cover=f'/api/artwork/{tid}.jpg'
        except Exception: pass
    track={'id':f'local:{tid}','source':'local','source_id':tid,'title':title,'artist':artist,'album':album,'album_id':'','cover':cover,
           'duration_ms':int(getattr(audio.info,'length',0)*1000),'availability':'local','source_url':'',
           'format':path.suffix[1:].upper(),'bitrate':int(getattr(audio.info,'bitrate',0) or 0),'size':stat.st_size,'mtime_ns':stat.st_mtime_ns,'filename':path.name}
    return track

def local_lyrics(path):
    lyrics=Path(path).with_suffix('.lrc')
    if lyrics.is_file() and lyrics.stat().st_size<4*1024*1024:
        raw=lyrics.read_bytes()
        for encoding in ('utf-8-sig','utf-16','gb18030'):
            try: return {'original':raw.decode(encoding),'translated':'','source':'local'}
            except UnicodeError: pass
    return None

def iter_music(root):
    root=Path(root).expanduser().resolve()
    if root.is_file():
        if root.suffix.lower() in EXTENSIONS: yield root
        return
    if not root.is_dir(): raise FileNotFoundError('请选择存在的音乐文件夹')
    import os
    for parent,dirs,files in os.walk(root,followlinks=False):
        dirs[:]=[d for d in dirs if not d.startswith('.') and not (Path(parent)/d).is_symlink()]
        for f in files:
            p=Path(parent)/f
            if p.suffix.lower() in EXTENSIONS and not p.is_symlink(): yield p
