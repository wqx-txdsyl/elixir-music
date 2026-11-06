"""QQ Music QRC (word-timed lyrics) decoding.

QRC is zlib-compressed XML encrypted with QQ's own Triple-DES variant: every
32-bit word is read little-endian, two S-box entries differ from FIPS 46 and
the key schedule reads the D half one bit late. Standard DES libraries
therefore cannot decrypt it.
"""
from __future__ import annotations

import html
import re
import zlib
from functools import lru_cache

KEY = b"!@#)(*$%123ZXC!@!@#)(NHL"

_IP = [58 + 2 * r - 8 * c if r < 4 else 57 + 2 * (r - 4) - 8 * c for r in range(8) for c in range(8)]
_FP = [_IP.index(p) + 1 for p in range(1, 65)]
_PC1 = [57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36,
        63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4]
_PC2 = [14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2,
        41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32]
_SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1]
_P = [16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25]
# Rows of 16 nibbles. QQ changes S2[1][7] (14 -> 15) and S4[3][5] (1 -> 10).
_SBOX = [[int(c, 16) for c in row] for row in (
    "e4d12fb83a6c5907" "0f74e2d1a6cb9538" "41e8d62bfc973a50" "fc8249175b3ea06d",
    "f18e6b34972dc05a" "3d47f28fc01a69b5" "0e7ba4d158c6932f" "d8a13f42b67c05e9",
    "a09e63f51dc7b428" "d709346a285ecbf1" "d6498f30b12c5ae7" "1ad069874fe3b52c",
    "7de3069a1285bc4f" "d8b56f03472c1ae9" "a690cb7df13e5284" "3f06aad8945bc72e",
    "2c417ab6853fd0e9" "eb2c47d150fa3986" "421bad78f9c5630e" "b8c71e2d6f09a453",
    "c1af92680d34e75b" "af427c9561de0b38" "9ef528c3704a1db6" "432c95fabe17608d",
    "4b2ef08d3c975a61" "d0b7491ae35c2f86" "14bdc37eaf680592" "6bd814a7950fe23c",
    "d2846fb1a93e50c7" "1fd8a374c56b0e92" "7b419ce206adf358" "21e74a8dfc90356b")]


def _bits(x, table, width):
    r = 0
    for p in table:
        r = (r << 1) | (x >> (width - p) & 1)
    return r


def _byte_table(table):
    # One lookup per input byte instead of one step per bit.
    return [[_bits(v << (56 - 8 * j), table, 64) for v in range(256)] for j in range(8)]


_IPT, _FPT = _byte_table(_IP), _byte_table(_FP)
# S-box output already passed through P, indexed by the raw 6-bit group.
_SP = [[_bits(_SBOX[i][(b >> 4 & 2 | b & 1) * 16 + (b >> 1 & 15)] << (28 - 4 * i), _P, 32) for b in range(64)] for i in range(8)]


def _permute(table, x):
    return table[0][x >> 56] | table[1][x >> 48 & 255] | table[2][x >> 40 & 255] | table[3][x >> 32 & 255] | \
        table[4][x >> 24 & 255] | table[5][x >> 16 & 255] | table[6][x >> 8 & 255] | table[7][x & 255]


def _swap(block):
    return block[3::-1] + block[7:3:-1]


@lru_cache(maxsize=8)
def _subkeys(key, decrypt):
    cd = _bits(int.from_bytes(_swap(key), "big"), _PC1, 64)
    c, d = [cd >> (55 - i) & 1 for i in range(28)], [cd >> (27 - i) & 1 for i in range(28)]
    keys = []
    for shift in _SHIFTS:
        c, d = c[shift:] + c[:shift], d[shift:] + d[:shift]
        # QQ reads D one bit late, so the last selectable bit is always zero.
        bits = c + d[1:] + [0]
        k = sum(bits[p - 1] << (47 - i) for i, p in enumerate(_PC2))
        keys.append(tuple(k >> (42 - 6 * i) & 63 for i in range(8)))
    return tuple(reversed(keys)) if decrypt else tuple(keys)


def _crypt(data, schedules):
    sp0, sp1, sp2, sp3, sp4, sp5, sp6, sp7 = _SP
    out = bytearray()
    for n in range(0, len(data) - 7, 8):
        x = _permute(_IPT, int.from_bytes(_swap(data[n:n + 8]), "big"))
        left, right = x >> 32, x & 0xffffffff
        # IP/FP between passes cancel out, so the three passes run back to back.
        for keys in schedules:
            for k in keys:
                e = (right & 1) << 33 | right << 1 | right >> 31
                left, right = right, left ^ (sp0[e >> 28 & 63 ^ k[0]] | sp1[e >> 24 & 63 ^ k[1]] | sp2[e >> 20 & 63 ^ k[2]] | sp3[e >> 16 & 63 ^ k[3]]
                                            | sp4[e >> 12 & 63 ^ k[4]] | sp5[e >> 8 & 63 ^ k[5]] | sp6[e >> 4 & 63 ^ k[6]] | sp7[e & 63 ^ k[7]])
            left, right = right, left
        out += _swap(_permute(_FPT, left << 32 | right).to_bytes(8, "big"))
    return bytes(out)


def encrypt(data, key=KEY):
    return _crypt(data, (_subkeys(key[:8], False), _subkeys(key[8:16], True), _subkeys(key[16:24], False)))


def decrypt_bytes(data, key=KEY):
    return _crypt(data, (_subkeys(key[16:24], True), _subkeys(key[8:16], False), _subkeys(key[:8], True)))


def decrypt(value, key=KEY):
    """Hex QRC payload -> lyric text inside the XML wrapper."""
    text = zlib.decompress(decrypt_bytes(bytes.fromhex(value), key)).decode("utf-8-sig")
    found = re.search(r'LyricContent="(.*?)"\s*/>', text, re.S)
    return html.unescape(found[1]) if found else text


_LINE = re.compile(r"\[(\d+),(\d+)\](.*)")
_WORD = re.compile(r"(.*?)\((\d+),(\d+)\)")


def to_yrc(text):
    """QRC `word(start,dur)` lines -> NetEase yrc `(start,dur,0)word` lines; tag lines are dropped."""
    lines = []
    for raw in str(text or "").splitlines():
        head = _LINE.fullmatch(raw.strip())
        if not head:
            continue
        # Parentheses inside a word would break the yrc word pattern.
        words = "".join(f"({s},{d},0){w.replace('(', '（').replace(')', '）')}" for w, s, d in _WORD.findall(head[3]) if w)
        if words:
            lines.append(f"[{head[1]},{head[2]}]{words}")
    return "\n".join(lines)
