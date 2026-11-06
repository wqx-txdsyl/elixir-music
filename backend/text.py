"""General text matching, shared by local and provider catalogues."""
import re
import unicodedata
from opencc import OpenCC

_simplified = OpenCC('t2s')


def fold(value):
    return _simplified.convert(unicodedata.normalize('NFKC', str(value or '')).casefold())


def normalized(value):
    return re.sub(r'[^\w\u4e00-\u9fff]', '', fold(value))


def matches(query, *fields):
    haystack = normalized(' '.join(str(x or '') for x in fields))
    return all(normalized(word) in haystack for word in fold(query).split())
