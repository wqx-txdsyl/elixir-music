"""Resolve MV sources with the same platform sessions used for catalog search."""


def resolve(provider, source, sid):
    if source == 'netease':
        for resolution in (720, 480, 240):
            data = provider._get('/api/song/enhance/play/mv/url', {'id': provider._id(sid), 'r': resolution})
            item = data.get('data') or {}
            if item.get('url'):
                return {'url': item['url']}
    elif source == 'qqmusic':
        data = provider._call('music.stream.MvUrlProxy', 'GetMvUrls', {'vids': [sid], 'request_type': 10001})
        item = data.get(sid) or {}
        for version in reversed(item.get('mp4') or []):
            urls = version.get('freeflow_url') or version.get('url') or []
            for url in [urls] if isinstance(urls, str) else urls:
                if isinstance(url, str) and url.startswith(('https://', 'http://')):
                    return {'url': url}
    return {'reason': '该平台未返回可播放的视频'}
