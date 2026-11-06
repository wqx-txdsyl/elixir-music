"""NetEase web request envelope. This is transport encoding, not entitlement logic."""
from __future__ import annotations

import base64
import json
import secrets
import string

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

PRESET_KEY = b"0CoJUm6Qyw8W8jud"
IV = b"0102030405060708"
RSA_PUB_N = int(
    "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876"
    "aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d0"
    "5c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e2"
    "89dc6935b3ece0462db0a22b8e7", 16
)


def weapi_payload(payload: dict) -> dict:
    key = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16))
    def encrypt(text: str, secret: bytes) -> str:
        return base64.b64encode(AES.new(secret, AES.MODE_CBC, IV).encrypt(pad(text.encode(), 16))).decode()
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    params = encrypt(encrypt(body, PRESET_KEY), key.encode())
    rsa = pow(int.from_bytes(key[::-1].encode(), "big"), 65537, RSA_PUB_N)
    return {"params": params, "encSecKey": format(rsa, "0256x")}
