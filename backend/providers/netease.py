"""NetEase metadata and account adapter with an explicitly sourced historical index.

Only caller-supplied cookies or the user's own QR authorization are used. No
client credentials, device fingerprints, or paid audio are bundled.
"""
from __future__ import annotations

import base64
import io
import json
import re
import time
from http.cookies import SimpleCookie
from pathlib import Path

import requests

from .netease_crypto import weapi_payload
from ..text import normalized, matches

BASE = "https://music.163.com"


class NeteaseError(RuntimeError):
    pass


class NeteaseProvider:
    name = "netease"

    def __init__(self, cookie: str = ""):
        self._authorized_qr = {}
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36", "Referer": BASE + "/", "Origin": BASE})
        self.set_cookie(cookie)
        file = Path(__file__).with_name("netease_catalog.json")
        self.catalog = json.loads(file.read_text(encoding="utf-8")) if file.exists() else []
        if isinstance(self.catalog, dict):
            self.catalog = self.catalog.get("tracks", [])

    def set_cookie(self, cookie: str | dict):
        self.session.cookies.clear()
        if isinstance(cookie, dict):
            values = cookie
        else:
            jar = SimpleCookie()
            try:
                jar.load(cookie or "")
                values = {name: part.value for name, part in jar.items()}
            except Exception as exc:
                raise ValueError("Cookie 格式不正确") from exc
        for name, value in values.items():
            self.session.cookies.set(str(name), str(value), domain=".music.163.com", path="/")

    def get_cookie(self) -> str:
        return "; ".join(f"{c.name}={c.value}" for c in self.session.cookies)

    @staticmethod
    def _id(value) -> str:
        value = str(value)
        if value.startswith("netease:"):
            value = value.split(":", 1)[1]
        if not value.isdecimal():
            raise ValueError("网易云歌曲、歌手或歌单 ID 必须为数字")
        return value

    @staticmethod
    def _check(data: dict, allowed=(200,)) -> dict:
        if not isinstance(data, dict):
            raise NeteaseError("网易云返回了无法识别的数据")
        if data.get("code", 200) not in allowed:
            message = data.get("message") or data.get("msg") or f"错误码 {data.get('code')}"
            raise NeteaseError(f"网易云：{message}")
        return data

    def _get(self, path, params=None):
        r = self.session.get(BASE + path, params=params, timeout=(5, 12))
        r.raise_for_status()
        r.encoding = "utf-8"
        return self._check(r.json())

    def _weapi(self, path, payload, allowed=(200,)):
        payload = dict(payload)
        payload.setdefault("csrf_token", next((c.value for c in self.session.cookies if c.name == "__csrf"), ""))
        r = self.session.post(BASE + "/weapi" + path, data=weapi_payload(payload), timeout=(5, 12))
        r.raise_for_status()
        r.encoding = "utf-8"
        return self._check(r.json(), allowed)

    @staticmethod
    def normalize(song, privilege=None):
        album = song.get("al") or song.get("album") or {}
        artists = song.get("ar") or song.get("artists") or []
        sid = str(song["id"])
        privilege = privilege or song.get("privilege") or {}
        unavailable = int(privilege.get("st") or 0) < 0
        return {"id": "netease:" + sid, "source": "netease", "source_id": sid,
                "title": song.get("name") or "未知歌曲", "artist": " / ".join(a.get("name", "") for a in artists),
                "artist_ids": [str(a["id"]) for a in artists if a.get("id")],
                "artists": [{'id':str(a['id']), 'name':a.get('name','')} for a in artists if a.get('id')],
                "album": album.get("name") or "", "album_id": str(album.get("id") or ""),
                "cover": album.get("picUrl") or album.get("blurPicUrl") or "",
                "duration_ms": int(song.get("dt") or song.get("duration") or 0),
                "availability": "unavailable" if unavailable else "unknown",
                "disc_number":song.get('cd'),"track_number":song.get('no'),
                "fee": song.get("fee", 0), "source_url": BASE + "/#/song?id=" + sid}

    def _details(self, ids):
        ids = [int(self._id(x)) for x in ids]
        if not ids:
            return []
        d = self._get("/api/v3/song/detail", {"c": json.dumps([{"id": i} for i in ids]), "ids": json.dumps(ids)})
        priv = {int(p["id"]): p for p in d.get("privileges", [])}
        return [self.normalize(x, priv.get(int(x["id"]))) for x in d.get("songs", [])]

    @staticmethod
    def _fold(text):
        return normalized(text)

    def search(self, query: str, limit: int = 30):
        limit = max(1, min(int(limit), 100))
        query = query.strip()
        if query.startswith("netease:") or query.isdecimal():
            return [self.detail(query)]
        if "music.163.com" in query:
            match = re.search(r"(?:[?&]id=|/song/)(\d+)", query)
            if match:
                return [self.detail(match.group(1))]
        if not query:
            return []
        historical = [dict(t) for t in self.catalog if matches(query,t.get('artist'),t.get('title'),*t.get('aliases',[])) or matches(query,t.get('title'),t.get('artist'),*t.get('aliases',[]))]
        try:
            data = self._get("/api/search/get", {"s": query, "type": 1, "limit": limit, "offset": 0})
            songs = data.get("result", {}).get("songs", [])
            live = [self.normalize(s) for s in songs]
            # These historical searches currently get unrelated fallback results
            # from the server. Keep their real artist/title; never turn a cover
            # or a fuzzy recommendation into a claimed historical match.
            if any(self._fold(query)==self._fold(t['artist']) for t in historical):
                live = [t for t in live if self._fold(query) in self._fold(t['artist'])]
            if live:
                try:
                    enriched = {t["id"]: t for t in self._details([t["source_id"] for t in live])}
                    live = [enriched.get(t["id"], t) for t in live]
                except (requests.RequestException, NeteaseError, ValueError):
                    pass  # Original successful search remains useful without cover enrichment.
        except (requests.RequestException, NeteaseError, ValueError) as exc:
            if not historical:
                raise
            live = []
            for track in historical:
                track["retrieval_error"] = str(exc)
        result = {}
        for t in historical + live:
            result.setdefault(t["id"], t)
        return list(result.values())[:limit]

    def detail(self, source_id):
        sid = self._id(source_id)
        historical = next((dict(t) for t in self.catalog if str(t["source_id"]) == sid), None)
        try:
            result = self._details([sid])
        except (requests.RequestException, NeteaseError, ValueError) as exc:
            if historical:
                historical["retrieval_error"] = str(exc)
                return historical
            raise
        if result:
            return result[0]
        if historical:
            return historical
        raise NeteaseError("官方当前不返回这首歌的详情，且本地尚无已核实的历史记录")

    def lyrics(self, source_id):
        sid = self._id(source_id)
        # The v1 endpoint also carries word-timed "yrc" lyrics when NetEase has them; the old one is the fallback.
        try:
            d = self._weapi("/song/lyric/v1", {"id": sid, "cp": False, "tv": 0, "lv": 0, "rv": 0, "kv": 0, "yv": 0, "ytv": 0, "yrv": 0})
            if not isinstance(d.get("lrc"), dict) and not d.get("nolyric") and not d.get("uncollected"):
                raise NeteaseError("v1 lyrics incomplete")
        except Exception:
            d = self._get("/api/song/lyric", {"id": sid, "lv": -1, "kv": -1, "tv": -1, "rv": -1})
        original = (d.get("lrc") or {}).get("lyric") or ""
        if d.get("uncollected") or d.get("nolyric"):
            original = ""
        return {"original": original, "translated": (d.get("tlyric") or {}).get("lyric") or "", "source": "netease", "source_id": sid,
                "words": (d.get("yrc") or {}).get("lyric") or "" if original else "",
                "reason": "纯音乐" if d.get("nolyric") else ("平台当前未提供歌词" if not original else "")}

    def comments(self, source_id, offset=0, limit=20):
        sid = self._id(source_id)
        offset, limit = max(0, int(offset)), max(1, min(100, int(limit)))
        d = self._get("/api/v1/resource/comments/R_SO_4_" + sid, {"offset": offset, "limit": limit})
        def normal(c, hot=False):
            u = c.get("user") or {}
            return {"id": str(c.get("commentId", "")), "user": u.get("nickname") or "用户", "avatar": u.get("avatarUrl") or "",
                    "text": c.get("content") or "", "time": c.get("timeStr") or str(c.get("time", "")),
                    "timestamp": c.get("time", 0), "likes": c.get("likedCount", 0), "hot": hot}
        hot = [normal(c, True) for c in d.get("hotComments", [])] if not offset else []
        latest = [normal(c) for c in d.get("comments", [])]
        ids = {c["id"] for c in hot}
        return {"items": hot + [c for c in latest if c["id"] not in ids], "total": d.get("total", 0),
                "has_more": bool(d.get("more", offset + limit < d.get("total", 0))), "next_offset": offset + limit,
                "source": "netease", "source_id": sid, "source_url": BASE + "/#/song?id=" + sid}

    def stream(self, source_id, quality="standard"):
        sid = self._id(source_id)
        levels = {"standard", "higher", "exhigh", "lossless", "hires", "jyeffect", "sky", "jymaster"}
        quality = quality if quality in levels else "standard"
        d = self._weapi("/song/enhance/player/url/v1", {"ids": json.dumps([int(sid)]), "level": quality, "encodeType": "flac"})
        rows = d.get("data") or []
        if not rows:
            raise NeteaseError("平台未返回播放授权信息")
        row = rows[0]
        trial = bool(row.get("freeTrialInfo"))
        return {"url": row.get("url") or "", "quality": row.get("level") or quality, "trial": trial,
                "reason": "当前账号仅获试听授权" if trial else ("" if row.get("url") else "当前账号或所在地区未获该歌曲播放授权"),
                "type": row.get("type") or "", "code": row.get("code"), "expires_in": row.get("expi", 0)}

    def profile(self):
        d = self._weapi("/nuser/account/get", {}, allowed=(200, 301))
        p = d.get("profile") or {}
        if not p:
            return {"logged_in": False, "nickname": "", "avatar": "", "membership": "未登录", "user_id": ""}
        vip = int(p.get("vipType") or 0)
        label = {0: "普通账号", 10: "音乐包", 11: "黑胶 VIP"}.get(vip, f"平台会员（vipType={vip}）")
        return {"logged_in": True, "nickname": p.get("nickname", ""), "avatar": p.get("avatarUrl", ""), "membership": label,
                "user_id": str(p.get("userId") or ""), "vip_type": vip, "membership_note": "身份以官方返回为准，逐曲播放权限单独校验"}

    def playlists(self, user_id=""):
        if not user_id:
            p = self.profile()
            if not p["logged_in"]:
                return []
            user_id = p["user_id"]
        d = self._get("/api/user/playlist", {"uid": self._id(user_id), "offset": 0, "limit": 100})
        return [{"id": str(x["id"]), "title": x.get("name", ""), "cover": x.get("coverImgUrl", ""),
                 "count": x.get("trackCount", 0), "source": "netease"} for x in d.get("playlist", [])]

    def playlist(self, source_id):
        sid = self._id(source_id)
        d = self._get("/api/v6/playlist/detail", {"id": sid, "n": 1000, "s": 0})
        p = d.get("playlist") or d.get("result") or {}
        if not p:
            raise NeteaseError("歌单不存在或当前账号无权查看")
        tracks = [self.normalize(t) for t in p.get("tracks", [])]
        return {"id": sid, "title": p.get("name", ""), "cover": p.get("coverImgUrl", ""), "tracks": tracks,
                "count": p.get("trackCount", len(tracks)), "partial": len(tracks) < p.get("trackCount", 0), "source": "netease"}

    def login_qr(self):
        import qrcode
        d = self._weapi("/login/qrcode/unikey", {"type": 3})
        key = d.get("unikey") or (d.get("data") or {}).get("unikey")
        if not key:
            raise NeteaseError("平台未返回二维码登录凭证")
        url = BASE + "/login?codekey=" + key
        buffer = io.BytesIO()
        qrcode.make(url).save(buffer, format="PNG")
        return {"key": key, "url": url, "qr_png": "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()}

    def login_check(self, key):
        if not isinstance(key, str) or not key or len(key) > 512:
            raise ValueError("二维码凭证无效")
        self._authorized_qr={k:v for k,v in self._authorized_qr.items() if time.time()-v<300}
        d = {"code":803} if key in self._authorized_qr else self._weapi("/login/qrcode/client/login", {"key": key, "type": 3}, allowed=(200, 800, 801, 802, 803))
        code = d.get("code")
        if code==200 and isinstance(d.get('data'),dict):code=d['data'].get('code')
        if code not in (800,801,802,803):raise NeteaseError('网易云没有返回可识别的二维码状态，请刷新后重试')
        out = {"code": code, "status": {800: "expired", 801: "waiting", 802: "scanned", 803: "authorized"}[code]}
        if code == 803:
            self._authorized_qr[key]=time.time()
            out["cookie"] = self.get_cookie()
            try:out['profile']=self.profile()
            except (requests.RequestException,NeteaseError,ValueError):out['profile']={'logged_in':False}
            if not out['profile'].get('logged_in'):
                out['status']='verifying'
                out['reason']='已收到扫码确认，正在核实账号资料；尚未确认会员状态'
        return out


# Compatibility with code using the conventional camel-case spelling.
NetEaseProvider = NeteaseProvider
