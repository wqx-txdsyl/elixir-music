"""Bodian's account QR exchange for the desktop client."""

import base64
import hashlib
import io
import json
import re
import threading
import time
import uuid
from urllib.parse import urlencode

import qrcode


class BodianLogin:
    origin = 'https://bd-api.kuwo.cn'

    def __init__(self, store, request):
        self.store = store
        self.request = request
        self.lock = threading.Lock()
        self.pending = None
        self.last_check = 0

    def device(self):
        with self.lock:
            device = self.store.secret('bodian:device')
            if not device:
                device = uuid.uuid4().hex
                self.store.set_secret('bodian:device', device)
        return device

    def session(self):
        try:
            session = json.loads(self.store.secret('bodian:session') or '{}')
            return session if session.get('uid') and session.get('token') else {}
        except (ValueError, OSError, RuntimeError, AttributeError):
            return {}

    def call(self, path, *, query=None, body=None, method='GET', signed=False, session=None):
        device = self.device()
        session = session or {}
        fields = {**(query or {}), 'uid': session.get('uid', '-1'), 'token': session.get('token', '')}
        payload = json.dumps(body, ensure_ascii=False, separators=(',', ':')) if body is not None else ''
        if signed:
            fields['timestamp'] = str(time.time_ns() // 1_000_000)
            encoded = urlencode(fields).replace('~', '%7E').replace('%2A', '*')
            letters = ''.join(sorted(re.findall(r'[a-zA-Z0-9]', encoded)))
            body_signature = hashlib.md5((payload + 'kuwotest').encode()).hexdigest() if payload else ''
            fields['sign'] = hashlib.md5(('kuwotest' + letters + body_signature + path).encode()).hexdigest()
        headers = {
            'User-Agent': 'Dart/3.3 (dart:io)', 'plat': 'win', 'channel': 'W1', 'ver': '1.1.7',
            'svrver': '13', 'api-ver': 'application/json', 'brand': 'Windows', 'net': 'wifi',
            'devid': device, 'qimei36': device, 'Content-Type': 'application/json',
        }
        if session:
            headers.update(uid=session['uid'], token=session['token'])
        return self.request(method, self.origin + path, headers=headers, params=fields, data=payload.encode() if payload else None)

    def start(self):
        response = self.call('/api/ucenter/login/qrCode', signed=True)
        key = (response.get('data') or {}).get('qrCode')
        if response.get('code') != 200 or not isinstance(key, str) or not key or len(key) > 512:
            raise RuntimeError('波点未返回登录二维码')
        ticket = uuid.uuid4().hex
        url = 'https://bodian-oia.kuwo.cn/bodian/download.html?' + urlencode({'pageName':'login_pc','pt':'3','id':key})
        image = io.BytesIO()
        qrcode.make(url).save(image, format='PNG')
        with self.lock:
            self.pending = (ticket, key, time.monotonic() + 300)
            self.last_check = 0
        return {'key':ticket, 'qr_png':'data:image/png;base64,' + base64.b64encode(image.getvalue()).decode('ascii')}

    def check(self, ticket):
        with self.lock:
            pending = self.pending
            now = time.monotonic()
            if not pending or pending[0] != ticket or pending[2] <= now:
                return {'status':'expired'}
            if now - self.last_check < 2:
                return {'status':'waiting'}
            self.last_check = now
        key = pending[1]
        state = self.call('/api/ucenter/login/qrCodeStatus', query={'qrCode':key}, signed=True)
        if state.get('code') != 200:
            raise RuntimeError('波点未返回扫码状态')
        status = str((state.get('data') or {}).get('status'))
        if status in {'1','2'}:
            return {'status':'waiting' if status == '1' else 'expired'}
        if status != '3':
            raise RuntimeError('波点返回了未识别的扫码状态')
        result = self.call('/api/ucenter/users/login', method='POST', body={'authType':10,'qrCode':key}, signed=True)
        if result.get('code') == 11027:
            return {'status':'scanned'}
        data = result.get('data') or {}
        user = data.get('userInfo') or data.get('user') or {}
        ids = {str(value) for value in (data.get('uid'),data.get('id'),user.get('uid'),user.get('id')) if value is not None}
        token = data.get('token')
        if result.get('code') != 200 or len(ids) != 1 or not isinstance(token,str) or not re.fullmatch(r'[!-~]{1,4096}',token):
            raise RuntimeError('波点没有确认登录或账号身份')
        uid = ids.pop()
        if not re.fullmatch('[1-9][0-9]{0,19}',uid):
            raise RuntimeError('波点没有确认账号身份')
        session = {'uid':uid, 'token':token, 'nickname':user.get('nickname') or '波点音乐'}
        with self.lock:
            if self.pending != pending or pending[2] <= time.monotonic():
                return {'status':'expired'}
            self.store.set_secret('bodian:session', json.dumps(session))
            self.pending = None
        return {'status':'authorized', 'profile':{'logged_in':True,'nickname':session['nickname']}}

    def cancel(self, ticket):
        with self.lock:
            if self.pending and self.pending[0] == ticket:
                self.pending = None

    def logout(self):
        with self.lock:
            self.pending = None
            self.store.set_secret('bodian:session','')
