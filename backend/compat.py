"""让请求模型同时兼容 pydantic 2（桌面版）和纯 Python 的 pydantic 1（安卓版）。"""
from __future__ import annotations

import pydantic
from pydantic import Field as _Field

PYDANTIC_V1 = pydantic.VERSION.startswith('1.')


def Field(*args, **kwargs):
    """字符串和数值约束：pydantic 1 把 pattern 叫 regex。"""
    if PYDANTIC_V1 and 'pattern' in kwargs:
        kwargs['regex'] = kwargs.pop('pattern')
    return _Field(*args, **kwargs)


def ItemsField(*args, min_items=None, max_items=None, mapping=False, **kwargs):
    """列表或字典的元素个数约束。

    pydantic 1 只支持列表的 min_items/max_items，字典不支持，调用方需要自行检查个数。
    """
    if PYDANTIC_V1:
        if not mapping:
            if min_items is not None: kwargs['min_items'] = min_items
            if max_items is not None: kwargs['max_items'] = max_items
    else:
        if min_items is not None: kwargs['min_length'] = min_items
        if max_items is not None: kwargs['max_length'] = max_items
    return _Field(*args, **kwargs)
