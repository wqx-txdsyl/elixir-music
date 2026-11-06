"""QQ Music adapter. Catalogue IDs and rights are deliberately kept separate.

Only the platform's public responses or the user's supplied QQ Music session
are used. A missing playback URL never erases metadata or historical IDs.
"""
from __future__ import annotations

import base64
import copy
import html
import json
import random
import re
import threading
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import requests
from ..text import normalized
from . import qrc

GATEWAY = "https://u.y.qq.com/cgi-bin/musicu.fcg"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/132.0.0.0 Safari/537.36", "Referer": "https://y.qq.com/", "Origin": "https://y.qq.com"}


class QQMusicError(RuntimeError):
    def __init__(self, message: str, code=None):
        super().__init__(message)
        self.code = code


class QQPlaylistList(list):
    """Keep the list contract while binding completeness to this response."""
    def __init__(self, items, status):
        super().__init__(items)
        self.status = copy.deepcopy(status)


def _plain(value):
    return html.unescape(re.sub(r"<[^>]+>", "", str(value or ""))).strip()


def _key(value):
    return normalized(value)


class QQMusicProvider:
    name = "qqmusic"

    def __init__(self, cookie=""):
        self._cookies = {}
        self._local = threading.local()
        self._cache = {}
        self.playlist_status = {"state": "not_requested"}
        self._lock = threading.RLock()
        self.guid = str(random.SystemRandom().randint(10**9, 10**10 - 1))
        self.set_cookie(cookie)
        path = Path(__file__).with_name("qqmusic_catalog.json")
        self.catalog = json.loads(path.read_text("utf-8")) if path.exists() else []

    def set_cookie(self, cookie):
        if isinstance(cookie, dict):
            self._cookies = {str(k): str(v) for k, v in cookie.items()}
            return
        parsed = SimpleCookie()
        try:
            parsed.load(cookie or "")
            values = {k: v.value for k, v in parsed.items()}
        except Exception as exc:
            raise QQMusicError("QQ 音乐登录信息格式无效") from exc
        self._cookies = values

    def _session(self):
        if not hasattr(self._local, "session"):
            self._local.session = requests.Session()
            self._local.session.headers.update(HEADERS)
        return self._local.session

    def _request(self, method, url, **kwargs):
        try:
            session = self._session()
            session.cookies.clear()
            response = session.request(method, url, cookies=dict(self._cookies), timeout=(5, 14), **kwargs)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            raise QQMusicError("QQ 音乐网络连接失败，请检查网络后重试") from exc
        except (ValueError, TypeError) as exc:
            raise QQMusicError("QQ 音乐返回了无法识别的响应") from exc

    def _uin(self):
        # Music-domain IDs take precedence over a QQ SSO cookie. A present
        # uin=o0000000000 must not hide a valid WeChat music account.
        legacy = ("wxuin", "uin") if self._cookies.get("login_type") == "2" else ("uin", "wxuin")
        for key in ("qqmusic_uin", "musicid", *legacy):
            value = str(self._cookies.get(key) or "").strip()
            if value.startswith("o"):
                value = value[1:]
            if value.isdecimal() and int(value):
                return value.lstrip("0")
        return "0"

    def _music_key(self):
        return next((self._cookies[k] for k in ("qm_keyst", "qqmusic_key", "musickey", "p_skey", "skey") if self._cookies.get(k)), "")

    def _call(self, module, method, param=None, allow_codes=()):
        cookies = dict(self._cookies)
        key = self._music_key()
        token = 5381
        for character in key:
            token += (token << 5) + ord(character)
        comm = {"ct": 19, "cv": 1873, "format": "json", "uin": self._uin(), "authst": key, "g_tk": token & 0x7fffffff}
        if cookies.get("login_type"):
            comm["loginType"] = int(cookies["login_type"]) if cookies["login_type"].isdigit() else 1
        data = self._request("POST", GATEWAY, json={"comm": comm, "req": {"module": module, "method": method, "param": param or {}}})
        if data.get("code", 0) != 0:
            raise QQMusicError(f"QQ 音乐网关请求失败（{data.get('code')}）", data.get("code"))
        response = data.get("req")
        if not isinstance(response, dict):
            raise QQMusicError("QQ 音乐未返回所请求的数据")
        code = response.get("code", 0)
        if code != 0 and code not in allow_codes:
            raise QQMusicError(f"QQ 音乐接口暂不可用（{code}），可能需要重新登录", code)
        body = response.get("data") or {}
        if code:
            body = dict(body, _response_code=code)
        return body

    def normalize(self, song):
        album = song.get("album") or {}
        mid = str(song.get("mid") or song.get("songmid") or "")
        songid = str(song.get("id") or song.get("songid") or "")
        if not mid or mid == "0":
            mid = songid
        album_mid = album.get("mid") or song.get("albummid") or ""
        source_id = mid or songid
        if not source_id:
            raise QQMusicError("QQ 音乐曲目缺少标识")
        rights = song.get("action") or {}
        unavailable = song.get("fnote") in (3015, 3016) or rights.get("msgid") == 1
        result = {
            "id": f"qqmusic:{source_id}", "source": "qqmusic", "source_id": source_id,
            "title": _plain(song.get("title") or song.get("name") or song.get("songname")),
            "artist": " / ".join(_plain(a.get("name") or a.get("title")) for a in song.get("singer") or []),
            "album": _plain(album.get("title") or album.get("name") or song.get("albumname")),
            "album_id": str(album_mid or album.get("id") or song.get("albumid") or ""),
            "cover": f"https://y.gtimg.cn/music/photo_new/T002R500x500M000{album_mid}.jpg" if album_mid else "",
            "duration_ms": int(song.get("interval") or 0) * 1000,
            "availability": "unavailable" if unavailable else "unknown",
            "source_url": f"https://y.qq.com/n/ryqq/songDetail/{source_id}",
            "songid": songid, "songmid": mid,
            "media_mid": (song.get("file") or {}).get("media_mid") or mid,
            "artist_ids": [str(a.get("mid") or a.get("id")) for a in song.get("singer") or []],
            "artists": [{'id':str(a.get('mid') or a.get('id')), 'name':_plain(a.get('name') or a.get('title'))} for a in song.get('singer') or [] if a.get('mid') or a.get('id')],
            "disc_number":song.get('index_cd'),"track_number":song.get('index_album'),
            "published_at": song.get("time_public") or "",
            "requires_membership": bool((song.get("pay") or {}).get("pay_play") or (song.get("pay") or {}).get("payplay")),
        }
        with self._lock:
            self._cache[source_id] = result
            if songid:
                self._cache[songid] = result
        return result

    @staticmethod
    def _source_id(value):
        value = str(value).strip().removeprefix("qqmusic:")
        if value.startswith(("http://", "https://")):
            parsed = urlparse(value)
            if parsed.hostname not in ("y.qq.com", "i.y.qq.com", "c.y.qq.com"):
                raise QQMusicError("请使用 QQ 音乐歌曲链接或歌曲 ID")
            params = parse_qs(parsed.query)
            params.update(parse_qs(parsed.fragment))
            value = (params.get("songmid") or params.get("mid") or params.get("songid") or params.get("id") or [parsed.path.rstrip("/").split("/")[-1]])[0].removesuffix(".html")
        if not re.fullmatch(r"[A-Za-z0-9]{1,32}", value):
            raise QQMusicError("QQ 音乐歌曲 ID 格式无效")
        return value

    def _historical(self, query):
        needle = _key(query)
        words = [_key(x) for x in re.split(r"\s+", query) if x.strip()]
        return [copy.deepcopy(t) for t in self.catalog if needle and (needle in _key(t.get("title", "") + t.get("artist", "")) or all(w in _key(t.get("title", "") + t.get("artist", "") + " ".join(t.get("aliases", []))) for w in words))]

    def search(self, query, limit=30):
        limit = max(1, min(int(limit), 100))
        query = str(query).strip()
        if not query:
            return []
        if re.fullmatch(r"(?:qqmusic:)?(?:[0-9]{4,12}|[0-9]{3}[A-Za-z0-9]{11})", query) or query.startswith("https://y.qq.com/"):
            return [self.detail(query)]
        historical = self._historical(query)
        try:
            data = self._call("music.search.SearchCgiService", "DoSearchForQQMusicDesktop", {"search_type": 0, "query": query, "page_num": 1, "num_per_page": limit})
            songs = ((data.get("body") or {}).get("song") or {}).get("list")
            if songs is None:
                raise QQMusicError("QQ 音乐搜索响应缺少歌曲列表")
            tracks = [self.normalize(s) for s in songs]
        except QQMusicError as exc:
            if not historical:
                raise
            for track in historical:
                track["catalog_warning"] = str(exc)
            tracks = []
        result, seen = [], set()
        for track in historical + tracks:
            if track["id"] not in seen:
                seen.add(track["id"])
                result.append(track)
        return result[:limit]

    def detail(self, source_id):
        source_id = self._source_id(source_id)
        parameter = {"song_id": int(source_id)} if source_id.isdecimal() else {"song_mid": source_id}
        data = self._call("music.pf_song_detail_svr", "get_song_detail_yqq", parameter)
        raw = data.get("track_info") or {}
        if not raw.get("mid") and not raw.get("id"):
            raise QQMusicError("QQ 音乐没有返回该歌曲的资料")
        track = self.normalize(raw)
        info = data.get("info") or {}
        track["credits"] = {k: " / ".join(_plain(a.get("value")) for a in v.get("content", [])) for k, v in info.items() if isinstance(v, dict)}
        historical = next((t for t in self.catalog if t.get("songmid") == track["songmid"] or t.get("songid") == track["songid"]), None)
        if historical:
            for key in ("album", "album_id", "cover"):
                if not track.get(key) and historical.get(key):
                    track[key] = historical[key]
            for key in ("catalog_origin", "sources", "catalog_note", "confirmed_detail", "aliases"):
                if key in historical:
                    track[key] = copy.deepcopy(historical[key])
        with self._lock:
            self._cache[track["source_id"]] = track
            self._cache[track["songid"]] = track
        return track

    def _known(self, source_id):
        source_id = self._source_id(source_id)
        with self._lock:
            found = self._cache.get(source_id)
        return found or self.detail(source_id)

    @staticmethod
    def _lyric_text(value):
        if not value:
            return ""
        try:
            decoded = base64.b64decode(value, validate=True).decode("utf-8")
            return html.unescape(decoded)
        except (ValueError, UnicodeDecodeError):
            return html.unescape(value)

    def lyrics(self, source_id):
        track = self._known(source_id)
        data = self._call("music.musichallSong.PlayLyricInfo", "GetPlayLyricInfo", {"songId": int(track["songid"]), "songMid": track["songmid"], "type": 1, "qrc": 0, "crypt": 0, "trans": 1, "roma": 0, "lrc_t": 0})
        original = self._lyric_text(data.get("lyric"))
        return {"original": original, "translated": self._lyric_text(data.get("trans")), "words": self._words(track) if original else "", "source": "qqmusic", "status": "available" if original else "unavailable", "reason": "" if original else "QQ 音乐当前未提供该版本歌词；可尝试关联其他版本或本地 LRC。"}

    def _words(self, track):
        # Word-timed QRC is optional; any failure leaves the line lyrics untouched.
        try:
            data = self._call("music.musichallSong.PlayLyricInfo", "GetPlayLyricInfo", {"songId": int(track["songid"]), "songMid": track["songmid"], "type": 1, "qrc": 1, "crypt": 1, "trans": 0, "roma": 0, "lrc_t": 0})
            return qrc.to_yrc(qrc.decrypt(data["lyric"])) if data.get("lyric") else ""
        except Exception:
            return ""

    def comments(self, source_id, offset=0, limit=20):
        track = self._known(source_id)
        limit = max(1, min(int(limit), 50))
        offset = max(0, int(offset))
        body = self._call("music.globalComment.CommentRead", "GetNewCommentList", {"BizType": 1, "BizId": track["songid"], "LastCommentSeqNo": "", "PageSize": limit, "PageNum": offset // limit, "PicEnable": 1, "SelfSeeEnable": 1, "AudioEnable": 1, "HashTagID": ""}, allow_codes=(20022,))
        block = body.get("CommentList") or {}
        records = block.get("Comments") or []
        items = []
        for comment in records:
            timestamp = int(comment.get("PubTime") or 0)
            items.append({"id": str(comment.get("CmId") or ""), "user": _plain(comment.get("Nick")), "avatar": comment.get("Avatar") or "", "text": _plain(comment.get("Content")), "time": datetime.fromtimestamp(timestamp, timezone.utc).isoformat() if timestamp else "", "likes": int(comment.get("PraiseNum") or 0)})
        error_code = body.get("SubCode") or body.get("_response_code") or 0
        reason = body.get("Msg") or ("QQ 音乐暂未开放这首歌的历史评论" if error_code else "")
        # Some unavailable records still expose a genuine count; never turn it into invented content.
        total = int(body.get("TotalCmNum") or block.get("Total") or 0)
        if error_code and not total:
            try:
                count = self._call("music.globalComment.CommentCountSrv", "GetCmCount", {"request": {"biz_id": track["songid"], "biz_type": 1, "biz_sub_type": 2}})
                total = int((count.get("response") or {}).get("count") or 0)
            except QQMusicError:
                pass
        return {"items": items, "total": total, "has_more": bool(block.get("HasMore")), "source": "qqmusic", "status": "unavailable" if error_code else "available", "reason": reason, "code": error_code}

    def stream(self, source_id, quality="standard"):
        track = self._known(source_id)
        if track.get("availability") == "unavailable":
            return {"url": "", "quality": quality, "trial": False, "reason": "QQ 音乐已限制该歌曲播放；仍可浏览资料，或关联你拥有的本地音频。"}
        formats = {"standard": ("M500", ".mp3"), "higher": ("M800", ".mp3"), "high": ("M800", ".mp3"), "lossless": ("F000", ".flac"), "flac": ("F000", ".flac")}
        prefix, suffix = formats.get(quality, formats["standard"])
        data = self._call("music.vkey.GetVkey", "UrlGetVkey", {"guid": self.guid, "songmid": [track["songmid"]], "songtype": [0], "uin": self._uin(), "loginflag": int(self._uin() != "0"), "platform": "20", "filename": [f"{prefix}{track['media_mid']}{suffix}"]})
        item = (data.get("midurlinfo") or [{}])[0]
        path = item.get("purl") or ""
        hosts = data.get("sip") or ["https://isure.stream.qqmusic.qq.com/"]
        url = path if path.startswith("https://") else hosts[0].rstrip("/") + "/" + path if path else ""
        if url.startswith("http://"):
            url = "https://" + url[7:]
        return {"url": url, "quality": quality, "trial": bool(item.get("is_buy") == 0 and item.get("trial")), "reason": "" if url else "QQ 音乐未授权本次播放，请登录拥有相应权益的账号。"}

    def profile(self):
        user_id = self._uin()
        if user_id == "0" or not self._music_key():
            return {"logged_in": False, "nickname": "", "avatar": "", "membership": "未登录", "user_id": ""}
        # The VIP endpoint returns an all-zero identity even for invalid cookies.
        # Validate authentication with a login-only operation before trusting it.
        try:
            account = self._call("music.UserInfo.userInfoServer", "GetLoginUserInfo")
        except QQMusicError as exc:
            if exc.code in (1000, 104400, 104401):
                return {"logged_in": False, "nickname": "", "avatar": "", "membership": "登录已失效", "user_id": "", "reason": "请在 QQ 音乐官方登录窗口重新登录"}
            raise
        if not account:
            raise QQMusicError("QQ 音乐未验证登录，请在官方登录窗口重新登录")
        data = self._call("VipLogin.VipLoginInter", "vip_login_base")
        identity = data.get("identity") or {}
        is_vip = identity.get("vip")
        membership = "超级会员" if identity.get("HugeVip") or data.get("svip") else "绿钻会员" if is_vip in (1, True, "1") else "普通账号" if is_vip in (0, False, "0") else "会员权益待平台确认"
        info = account.get("user_info") or account.get("data") or account
        return {"logged_in": True, "nickname": _plain(info.get("nick") or info.get("nickname") or info.get("nickName") or f"QQ {user_id}"), "avatar": info.get("avatar") or info.get("headurl") or "", "membership": membership, "user_id": user_id, "membership_verified": is_vip is not None, "membership_expires": identity.get("overdate") or ""}

    @staticmethod
    def _playlist_entry(row, collection_kind):
        if not isinstance(row, dict):
            raise QQMusicError("QQ 音乐歌单条目格式已变化")
        sid = str(row.get("tid") or row.get("dissid") or "")
        if not sid.isdecimal() or int(sid) <= 0:
            raise QQMusicError("QQ 音乐目录中的歌单缺少可打开的编号")
        count = row.get("songNum", row.get("songnum", row.get("song_cnt")))
        try:
            count = int(count) if count is not None else None
        except (TypeError, ValueError):
            count = None
        return {
            "id": sid, "source": "qqmusic", "source_id": sid,
            "title": _plain(row.get("dirName") or row.get("name") or row.get("diss_name") or row.get("dissname")),
            "cover": row.get("bigpicUrl") or row.get("picUrl") or row.get("logo") or row.get("diss_cover") or row.get("imgurl") or row.get("albumPicUrl") or "",
            "count": count, "collection_kind": collection_kind, "scope": "cloud",
            "source_url": f"https://y.qq.com/n/ryqq/playlist/{sid}",
            "unavailable": bool(row.get("invalid")),
        }

    def playlists(self, user_id=""):
        own_id = self._uin()
        user_id = str(user_id or own_id)
        status = {"state": "loading", "partial": False, "warnings": []}
        self.playlist_status = status
        if user_id == "0" or not user_id.isdecimal() or not self._music_key():
            status["state"] = "login_required"
            raise QQMusicError("请先连接 QQ 音乐账号；尚未验证登录，不能判断云端歌单为空")
        if user_id == own_id and not self.profile().get("logged_in"):
            status["state"] = "login_expired"
            raise QQMusicError("QQ 音乐登录已失效，请重新连接后读取云端歌单")

        # The old fcg_user_created_diss returns a successful empty disslist for
        # current WeChat logins. Use the actual music asset directory instead.
        data = self._call("music.musicasset.PlaylistBaseRead", "GetPlaylistByUin", {"uin": user_id})
        rows = data.get("v_playlist")
        if not isinstance(rows, list):
            status["state"] = "invalid_response"
            raise QQMusicError("QQ 音乐没有返回自建歌单目录，不能将接口错误当作空歌单")
        result = {}
        for row in rows:
            item = self._playlist_entry(row, "created")
            result[item["id"]] = item
        created_count = len(result)
        if data.get("bFinish") is False or int(data.get("total") or 0) > len(rows):
            status["partial"] = True
            status["warnings"].append("自建歌单目录返回不完整，当前只显示已经收到的条目")

        euin = self._cookies.get("euin") or self._cookies.get("encryptUin") or self._cookies.get("encrypt_uin")
        if euin and user_id == own_id:
            offset = 0
            seen_pages = set()
            for _ in range(100):
                try:
                    page = self._call("music.musicasset.PlaylistFavRead", "CgiGetPlaylistFavInfo", {"uin": euin, "offset": offset, "size": 50})
                    favorites = page.get("v_list")
                    if not isinstance(favorites, list):
                        raise QQMusicError("QQ 音乐没有返回收藏歌单目录")
                    page_ids = tuple(sorted(str(x.get("tid") or x.get("dissid") or "") for x in favorites if isinstance(x, dict)))
                    if page_ids in seen_pages and page.get("hasmore"):
                        raise QQMusicError("收藏歌单分页没有前进，已停止重复请求")
                    seen_pages.add(page_ids)
                    for row in favorites:
                        item = self._playlist_entry(row, "saved")
                        # Some accounts include their own playlists in the
                        # favorite directory. Keep one real ID and ownership.
                        result.setdefault(item["id"], item)
                    if not page.get("hasmore"):
                        break
                    if not favorites:
                        raise QQMusicError("收藏歌单分页没有前进，已停止重复请求")
                    offset += len(favorites)
                except QQMusicError:
                    status["partial"] = True
                    status["warnings"].append("收藏歌单读取未完成；已读取的自建及收藏歌单仍保留")
                    break
            else:
                status["partial"] = True
                status["warnings"].append("收藏歌单超过本次5000条读取边界")
        elif user_id == own_id:
            status["partial"] = True
            status["warnings"].append("当前会话未返回收藏歌单所需的账户标识，暂只显示自建歌单")
        status.update(state="partial" if status["partial"] else "available",
                                    created_count=created_count, saved_count=len(result)-created_count,
                                    count=len(result), empty=not result and not status["partial"])
        if not result and status["partial"]:
            raise QQMusicError("自建歌单为空，但收藏歌单尚未读完，暂不能判断整个音乐库为空")
        return QQPlaylistList(result.values(), status)

    def playlist(self, source_id):
        if not str(source_id).isdecimal():
            raise QQMusicError("QQ 歌单 ID 必须为数字")
        data = self._request("GET", "https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg", params={"disstid": str(source_id), "type": 1, "json": 1, "utf8": 1, "onlysong": 0, "format": "json", "platform": "yqq.json", "new_format": 1})
        if data.get("code", 0) != 0 or not data.get("cdlist"):
            raise QQMusicError("QQ 音乐歌单不可访问或需要登录")
        playlist = data["cdlist"][0]
        return {"id": str(source_id), "source": "qqmusic", "title": _plain(playlist.get("dissname")), "cover": playlist.get("logo") or "", "tracks": [self.normalize(s) for s in playlist.get("songlist") or []]}
