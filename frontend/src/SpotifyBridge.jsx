import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { CheckCircle, WarningCircle, ArrowSquareOut, Play } from '@phosphor-icons/react';

const MEMBERSHIP_TEXT = {
  premium: '备用引擎：Premium',
  free: '此备用引擎不支持免费账号',
  '': '会员状态未读取',
};

// In-app Spotify playback engine (go-librespot sidecar): pairing status and
// membership check. Real audio decodes locally; nothing transfers to a device.
export function SpotifyBridgeCard({ onChanged }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try { setStatus(await api('/api/spotify/bridge')); setError(''); }
    catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { refresh(); const timer = setInterval(refresh, 10000); return () => clearInterval(timer); }, [refresh]);

  async function start() {
    setBusy(true);
    try {
      const data = await api('/api/spotify/bridge/start', { method: 'POST', timeout: 60000 });
      setStatus(data); setError('');
      if (data.logged_in && onChanged) onChanged();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const pairing = status?.pairing;
  return <section className="account-card bridge-card">
    <div className="account-content">
      <h2>Spotify 备用引擎
        {status?.logged_in && <span className="connected"><CheckCircle size={14} weight="fill" />已就绪</span>}
        {status && !status.logged_in && <span className="connected bridge-offline"><WarningCircle size={14} />未登录</span>}
      </h2>
      <p>{status?.logged_in ? '登录账号 ' + (status.username || '').slice(0, 4) + '···' : '首次使用需要一次性设备配对'}</p>
      <div className="membership"><WarningCircle size={17} />{MEMBERSHIP_TEXT[status?.membership || ''] || MEMBERSHIP_TEXT['']}</div>
      {error && <small>{error}</small>}
      {pairing && <div className="bridge-pairing">
        <p>1. 打开 <button className="text-button" onClick={() => { if (window.desktop?.openExternal) window.desktop.openExternal(pairing.url); else window.open(pairing.url, '_blank'); }}>spotify.com/pair<ArrowSquareOut size={14} /></button></p>
        <p>2. 输入配对码 <code className="pairing-code">{pairing.code}</code>，并用与会员绑定的 Spotify 账号批准</p>
      </div>}
    </div>
    <div className="account-actions">
      <button className="button primary" disabled={busy} onClick={start}><Play size={17} weight="fill" />{busy ? '正在启动…' : status?.logged_in ? '重启引擎' : '启动并配对'}</button>
    </div>
  </section>;
}
