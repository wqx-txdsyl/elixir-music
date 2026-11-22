"""后端文件日志：按大小滚动，写入前去掉 token、cookie 与链接参数。"""
from __future__ import annotations
import logging
import re
from logging.handlers import RotatingFileHandler
from .store import DATA

LOG_DIR = DATA / 'logs'
log = logging.getLogger('elixir')

# 平台签名地址、cookie、各类密钥一律不落盘
_COOKIE = re.compile(r'(?i)(cookie["\']?\s*[:=]\s*)[^\r\n]*')
_AUTHORIZATION = re.compile(
    r'(?i)(\b(?:proxy-)?authorization["\']?\s*[:=]\s*["\']?)'
    r'(?:(?:bearer|basic)\s+)?[^\s;&,"\'}]+'
)
_SECRET = re.compile(r'(?i)\b(token|access_token|refresh_token|client_token|vkey|musickey|qm_keyst|music_u|__csrf|sp_dc|password|secret|ticket)(["\']?\s*[=:]\s*["\']?)[^\s;&,"\'}]+')
_QUERY = re.compile(r'(https?://[^\s?#"\']+)\?[^\s"\']*')
_MEDIA = re.compile(r'(/api/media/)[A-Za-z0-9_-]+')


def redact(text: str) -> str:
    text = _COOKIE.sub(r'\1***', text)
    text = _AUTHORIZATION.sub(r'\1***', text)
    text = _QUERY.sub(r'\1?***', text)
    text = _MEDIA.sub(r'\1***', text)
    return _SECRET.sub(lambda m: m.group(1) + m.group(2) + '***', text)


class RedactingFormatter(logging.Formatter):
    def format(self, record):
        return redact(super().format(record))


_handler: logging.Handler | None = None


def setup() -> logging.Logger:
    """建立 logs/backend.log（1 MB × 4 份）；目录不可写时静默退化为不记录。"""
    global _handler
    if _handler is not None:
        return log
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        handler = RotatingFileHandler(LOG_DIR / 'backend.log', maxBytes=1_000_000, backupCount=3, encoding='utf-8', delay=True)
    except OSError:
        handler = logging.NullHandler()
    handler.setFormatter(RedactingFormatter('%(asctime)s %(levelname)s %(name)s: %(message)s'))
    _handler = handler
    log.setLevel(logging.INFO)
    log.addHandler(handler)
    log.propagate = False
    return log


def attach(name: str) -> None:
    """把第三方 logger（如 uvicorn.error）的告警也写进同一个文件；须在其自身配置完成后调用。"""
    if _handler is None:
        setup()
    target = logging.getLogger(name)
    if _handler not in target.handlers:
        target.addHandler(_handler)
