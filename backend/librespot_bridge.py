"""go-librespot sidecar bridge: real in-app Spotify audio playback.

Runs the pinned go-librespot executable as a child process of this service.
The sidecar authenticates with the user's own Spotify account over the native
protocol (device pairing once, credentials persisted locally), receives play
commands over a localhost REST API and decodes the audio stream locally —
no Widevine, no external browser, no playback transfer to another device.

Nothing here fabricates credentials or works around account restrictions:
playback requires the account's own Premium entitlement, and a Free account
produces an explicit, honest error.
"""
from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
import websocket

BRIDGE_PORT = 18743
VOLUME_STEPS = 100


class BridgeError(RuntimeError):
    """User-facing bridge failure; message is safe to display."""


class LibrespotBridge:
    def __init__(self, data_dir: Path, proxy: str = '', exe_dir: Path | None = None):
        # Absolute paths are required: the sidecar is spawned with its own cwd,
        # so a relative data dir would silently resolve elsewhere.
        self.data_dir = Path(data_dir).resolve()
        self.config_dir = self.data_dir / 'spotify-bridge'
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.proxy, self.http_proxy = self._normalize_proxy(proxy)
        self.base = f'http://127.0.0.1:{BRIDGE_PORT}'
        self.lock = threading.RLock()
        self.process: subprocess.Popen | None = None
        self.events_thread: threading.Thread | None = None
        self.stop_event = threading.Event()
        self.logged_in = False
        # Latest player state from events, with monotonic timestamp for
        # real local position extrapolation.
        self.player = {'uri': '', 'track_id': '', 'position_ms': 0, 'duration_ms': 0,
                       'playing': False, 'at': 0.0, 'device_id': '', 'device_name': '',
                       'username': '', 'volume': 100, 'buffering': False}
        self.membership = ''
        self.membership_checked = 0.0
        self.last_error = ''
        if exe_dir is None:
            exe_dir = self._default_exe_dir()
        self.exe = exe_dir / 'go-librespot.exe'

    def _default_exe_dir(self) -> Path:
        packaged = Path(os.environ['ELIXIR_LIBRESPOT_DIR']) if 'ELIXIR_LIBRESPOT_DIR' in os.environ else None
        if packaged is not None and (packaged / 'go-librespot.exe').is_file():
            return packaged
        packaged = Path(__file__).resolve().parents[1] / 'resources' / 'backend' / 'librespot'
        if (packaged / 'go-librespot.exe').exists():
            return packaged
        return Path(__file__).resolve().parents[1] / '.cache' / 'librespot' / 'runtime'

    @staticmethod
    def _normalize_proxy(proxy: str) -> tuple[str, str]:
        """Returns (sidecar_proxy, http_proxy).

        go-librespot dials raw TCP, which only a SOCKS5 proxy can carry; common
        local mixed-port proxies (Clash, v2ray) speak SOCKS5 on the same port,
        so localhost HTTP proxies are upgraded for the sidecar. HTTP(S) API
        calls keep the original proxy, which requests handles natively.
        """
        proxy = str(proxy or '').strip()
        if not proxy:
            return '', ''
        if proxy.startswith('socks5:'):
            return proxy, proxy
        if proxy.startswith(('http:', 'https:')):
            try:
                parsed = urlparse(proxy)
                if parsed.hostname in ('127.0.0.1', 'localhost', '::1'):
                    return f'socks5://{parsed.hostname}:{parsed.port or 8080}', proxy
            except ValueError:
                pass
            return '', proxy
        return '', ''

    @property
    def state_path(self) -> Path:
        return self.config_dir / 'state.json'

    def _write_config(self) -> None:
        config = {
            'log_level': 'warn',
            'device_name': 'Elixir Music',
            'device_type': 'COMPUTER',
            'bitrate': 320,
            'volume_steps': VOLUME_STEPS,
            'prefer_firewall_friendly_ports': True,
            'server': {'enabled': True, 'address': '127.0.0.1', 'port': BRIDGE_PORT},
            # One-time device pairing; go-librespot persists its own credentials
            # in state.json next to this file, so later runs skip pairing.
            'credentials': {'type': 'device_auth', 'device_auth': {}},
        }
        (self.config_dir / 'config.yml').write_text(json.dumps(config), encoding='utf-8')

    def _spawn_env(self) -> dict:
        env = dict(os.environ)
        env.pop('ELECTRON_RUN_AS_NODE', None)
        if self.proxy:
            env['ALL_PROXY'] = self.proxy
        return env

    def start(self, timeout: float = 25.0) -> None:
        with self.lock:
            if self.is_running():
                return
            if not self.exe.exists():
                raise BridgeError('此版本未安装 Spotify Premium 本地播放组件')
            self.stop_event.clear()
            self._write_config()
            logfile = open(self.data_dir / 'spotify-bridge.log', 'ab')
            try:
                creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                self.process = subprocess.Popen(
                    [str(self.exe), '--config_dir', str(self.config_dir)],
                    cwd=str(self.config_dir), stdout=logfile, stderr=subprocess.STDOUT,
                    env=self._spawn_env(), creationflags=creationflags)
            finally:
                logfile.close()
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                if self.process.poll() is not None:
                    message = self._recent_error()
                    raise BridgeError(message or 'Spotify 播放组件启动失败')
                if self._api_reachable():
                    self._start_events()
                    self._refresh_login_state()
                    return
                time.sleep(0.25)
            self.stop()
            raise BridgeError('Spotify 播放组件启动超时')

    def _recent_error(self) -> str:
        try:
            text = (self.data_dir / 'spotify-bridge.log').read_text('utf-8', 'ignore')[-2000:]
        except OSError:
            return ''
        for line in reversed(text.splitlines()):
            if 'level=fatal' in line or 'level=error' in line:
                if 'TravelRestriction' in line:
                    return 'Spotify 拒绝了该账号在当前网络地区的登录（TravelRestriction）；请让代理出口与账号地区一致后重试'
                return line.split('msg="', 1)[-1].rstrip('"')[:160]
        return ''

    def _api_reachable(self) -> bool:
        try:
            response = requests.get(self.base + '/', timeout=1)
            return response.ok and isinstance(response.json().get('playback_ready'), bool)
        except (requests.RequestException, ValueError):
            return False

    def is_running(self) -> bool:
        return self.process is not None and self.process.poll() is None and self._api_reachable()

    def ensure(self) -> 'LibrespotBridge':
        with self.lock:
            if not self.is_running():
                self.start()
            return self

    def stop(self) -> None:
        with self.lock:
            self.stop_event.set()
            if self.process is not None and self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.process.kill()
            self.process = None

    def forget_credentials(self) -> None:
        """Remove the persisted device credentials (used on logout)."""
        try:
            self.state_path.unlink()
        except OSError:
            pass
        self.logged_in = False
        self.membership = ''

    def _refresh_login_state(self) -> None:
        try:
            status = self._request('GET', '/status')
            if self.player['username'] != str(status.get('username') or ''):
                self.membership = ''
                self.membership_checked = 0.0
            self.logged_in = bool(status.get('username'))
            self.player['device_id'] = str(status.get('device_id') or '')
            self.player['device_name'] = str(status.get('device_name') or 'Elixir Music')
            self.player['username'] = str(status.get('username') or '')
            volume = status.get('volume')
            self.player['volume'] = int(volume) if isinstance(volume, (int, float)) else VOLUME_STEPS
            track = status.get('track') or {}
            if track.get('uri'):
                self._absorb_track(track, playing=not status.get('paused') and not status.get('stopped'))
            elif status.get('stopped'):
                self.player.update(playing=False, buffering=False, uri='', track_id='', position_ms=0)
        except BridgeError:
            self.logged_in = False

    def refresh_login_state(self) -> None:
        with self.lock:
            self._refresh_login_state()

    def _request(self, method: str, path: str, payload=None, timeout: float = 8) -> dict:
        try:
            response = requests.request(method, self.base + path, json=payload, timeout=timeout)
        except requests.RequestException as exc:
            raise BridgeError('Spotify 播放组件未响应，请重试') from exc
        if response.status_code == 400:
            raise BridgeError('Spotify 播放请求无效')
        if response.status_code >= 400:
            raise BridgeError(f'Spotify 播放组件返回 {response.status_code}')
        if not response.content:
            return {}
        try:
            return response.json()
        except ValueError as exc:
            raise BridgeError('Spotify 播放组件返回异常数据') from exc

    # ---- authentication -------------------------------------------------

    def pairing(self) -> dict | None:
        """Returns {url, code, expires_at} while waiting for device pairing."""
        self.ensure()
        try:
            data = self._request('GET', '/auth/code')
        except BridgeError:
            return None
        return data or None

    def _fetch_product(self, token: str) -> str:
        proxies = {'http': self.http_proxy, 'https': self.http_proxy} if self.http_proxy else None
        response = requests.get(
            'https://spclient.wg.spotify.com/melody/v1/product_state',
            headers={'Authorization': f'Bearer {token}', 'App-Platform': 'WebPlayer'},
            proxies=proxies, timeout=10)
        return str(response.json().get('product', '')).lower() if response.ok else ''

    def membership_state(self) -> str:
        """'premium' | 'free' | '' (unknown), cached briefly."""
        if self.membership and time.monotonic() - self.membership_checked < 300:
            return self.membership
        try:
            token = self._request('POST', '/token').get('token', '')
            if not token:
                return self.membership
            product = self._fetch_product(token)
            if product in ('premium', 'free'):
                self.membership = product
                self.membership_checked = time.monotonic()
        except (requests.RequestException, ValueError, BridgeError):
            pass
        return self.membership

    # ---- events ---------------------------------------------------------

    def _start_events(self) -> None:
        if self.events_thread and self.events_thread.is_alive():
            return
        self.events_thread = threading.Thread(
            target=self._events_loop, name='librespot-events', daemon=True)
        self.events_thread.start()

    def _events_loop(self) -> None:
        while not self.stop_event.is_set():
            try:
                connection = websocket.create_connection(
                    f'ws://127.0.0.1:{BRIDGE_PORT}/events', timeout=5)
            except OSError:
                if not self.stop_event.wait(timeout=3):
                    continue
                return
            try:
                connection.settimeout(None)
                while not self.stop_event.is_set():
                    frame = connection.recv()
                    if isinstance(frame, bytes):
                        frame = frame.decode('utf-8', 'ignore')
                    if frame:
                        self._handle_event(json.loads(frame))
            except (OSError, ValueError, json.JSONDecodeError):
                pass
            finally:
                try:
                    connection.close()
                except OSError:
                    pass
            if not self.stop_event.is_set():
                self.stop_event.wait(timeout=2)

    def _handle_event(self, data: dict) -> None:
        kind = data.get('type')
        with self.lock:
            if kind == 'metadata':
                self._absorb_track(data, playing=self.player['playing'])
            elif kind == 'will_play':
                self._absorb_track(data, playing=False)
                self.player['buffering'] = True
                self.last_error = ''
            elif kind == 'playing':
                self._absorb_track(data, playing=True)
            elif kind == 'paused':
                self._absorb_track(data, playing=False)
            elif kind == 'stopped':
                self.player.update(playing=False, buffering=False, position_ms=self.player['duration_ms'])
            elif kind == 'seek':
                self._absorb_track(data, playing=self.player['playing'])
            elif kind == 'volume':
                maximum = int(data.get('max') or VOLUME_STEPS)
                value = int(data.get('value') or 0)
                self.player['volume'] = int(round(value * VOLUME_STEPS / maximum))
            elif kind == 'playback_error':
                self.last_error = str(data.get('message') or '播放失败')
                stage = data.get('stage')
                if data.get('unplayable') or stage == 'load':
                    self.player.update(playing=False, buffering=False)

    def _absorb_track(self, data: dict, playing: bool) -> None:
        uri = str(data.get('uri') or self.player['uri'] or '')
        track_id = uri.rsplit(':', 1)[-1] if 'track:' in uri else self.player['track_id']
        position = data.get('position')
        duration = data.get('duration')
        self.player.update(
            uri=uri or self.player['uri'], track_id=track_id,
            position_ms=int(position) if isinstance(position, (int, float)) else self.player['position_ms'],
            duration_ms=int(duration) if isinstance(duration, (int, float)) else self.player['duration_ms'],
            playing=playing, buffering=False, at=time.monotonic())

    # ---- public control -------------------------------------------------

    def position_now(self) -> int:
        with self.lock:
            if not self.player['playing']:
                return int(self.player['position_ms'])
            elapsed = (time.monotonic() - self.player['at']) * 1000
            return int(min(self.player['position_ms'] + elapsed,
                           self.player['duration_ms'] or float('inf')))

    def play(self, track_id: str, position_ms: int = 0, *, membership_verified: bool = False) -> dict:
        self.ensure()
        with self.lock:
            if not self.player['username']:
                self._refresh_login_state()
            logged_in = self.logged_in
        if not logged_in:
            raise BridgeError('Spotify 应用内播放器尚未登录：请在账号页完成设备配对（spotify.com/pair）')
        if not membership_verified and self.membership_state() != 'premium':
            raise BridgeError('本地播放器需要已验证的 Spotify Premium 账号')
        payload = {'uri': 'spotify:track:' + track_id, 'position': int(position_ms)}
        if position_ms:
            payload['skip_to_uri'] = payload['uri']
        with self.lock:
            self.last_error = ''
            self.player.update(uri=payload['uri'], track_id=track_id,
                position_ms=int(position_ms), duration_ms=0, playing=False, buffering=True, at=time.monotonic())
        self._request('POST', '/player/play', payload, timeout=15)
        return self.play_state()

    def queue(self, track_id: str) -> None:
        self._request('POST', '/player/add_to_queue', {'uri': 'spotify:track:' + track_id}, timeout=8)

    def play_state(self) -> dict:
        state = self.state()
        confirmed = bool(state.get('is_playing')) and bool(state.get('track_id')) and not state.get('buffering')
        return {'confirmed': confirmed, 'state': state, 'device_id': self.player['device_id'],
                'device_name': self.player['device_name'], 'reason': self.last_error or ''}

    def control(self, action: str, value=None) -> dict:
        self.ensure()
        paths = {'pause': ('POST', '/player/pause', None), 'resume': ('POST', '/player/resume', None),
                 'next': ('POST', '/player/next', None), 'previous': ('POST', '/player/prev', None)}
        if action in paths:
            method, path, payload = paths[action]
        elif action == 'seek':
            method, path, payload = 'POST', '/player/seek', {'position': int(value or 0)}
        elif action == 'volume':
            # The app's player volume convention is percent 0..100.
            method, path, payload = 'POST', '/player/volume', {'volume': max(0, min(VOLUME_STEPS, int(value or 0)))}
        else:
            raise BridgeError('不支持该播放操作')
        self._request(method, path, payload, timeout=8)
        with self.lock:
            if action == 'pause':
                self.player.update(position_ms=self.position_now(), playing=False, at=time.monotonic())
            elif action == 'resume':
                self.player.update(playing=True, at=time.monotonic())
            elif action == 'seek' and payload is not None:
                self.player.update(position_ms=int(payload['position']), at=time.monotonic())
            elif action in ('next', 'previous'):
                self.player.update(uri='', track_id='', position_ms=0, buffering=True)
        state = self.state()
        return {'confirmed': True, 'state': state, 'reason': self.last_error or ''}

    def state(self) -> dict:
        """Snapshot for /api/spotify/state: real local player position."""
        with self.lock:
            track_id = self.player['track_id']
            position = self.position_now()
            duration = int(self.player['duration_ms'] or 0)
            playing = bool(self.player['playing'])
            return {
                'is_playing': playing,
                'position_ms': position,
                'duration_ms': duration,
                'track_id': track_id,
                'device': {'id': self.player['device_id'], 'name': self.player['device_name'] or 'Elixir Music'},
                'device_id': self.player['device_id'],
                'username': self.player['username'],
                'volume': self.player['volume'],
                'buffering': bool(self.player['buffering']),
                # With the sidecar these are direct local measurements, not
                # inferred from Connect reference clocks.
                'local_playback_observed': playing,
                'progress_observed': playing and duration > 0,
                'track_finished': bool(duration and not playing and position >= duration - 400),
                'logged_in': self.logged_in,
                'transport': 'librespot-bridge',
                'reason': self.last_error or '',
            }

    def devices(self) -> list:
        if not self.is_running():
            return []
        return [{'id': self.player['device_id'], 'name': self.player['device_name'] or 'Elixir Music',
                 'type': 'COMPUTER', 'is_active': bool(self.player['playing'])}]
