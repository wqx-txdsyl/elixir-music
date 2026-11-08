import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { ArrowSquareOut } from '@phosphor-icons/react';

const MEMBERSHIP_TEXT = {
  premium: 'Premium',
  free: 'Free 账号请用网页登录',
  '': '会员状态未读取',
};

// 应用内 Spotify 播放引擎（go-librespot 组件）的配对状态与会员检查。音频在本机解码，不转到其他设备。
export function useSpotifyPremium(onChanged) {
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

  const paired = !!status?.logged_in;
  const label = status?.available === false ? '未安装组件' : paired ? (status.membership === 'premium' ? '已配对' : MEMBERSHIP_TEXT[status.membership || '']) : status?.running ? '等待配对' : '';
  return { status, busy, error, start, paired, label };
}

export function SpotifyPremiumBody({ premium }) {
  const { status, busy, error, start, paired } = premium;
  const pairing = status?.pairing;
  const open = url => { if (window.desktop?.openExternal) window.desktop.openExternal(url); else window.open(url, '_blank'); };
  return <>
    {error && <small className="account-method-error">{error}</small>}
    {status?.username && paired && <small>{status.username} · {MEMBERSHIP_TEXT[status.membership || ''] || status.membership}</small>}
    {pairing && <ol className="bridge-pairing">
      <li>打开 <button className="text-button" onClick={() => open(pairing.url)}>spotify.com/pair<ArrowSquareOut size={14} /></button></li>
      <li>输入配对码 <code className="pairing-code">{pairing.code}</code>，用开通会员的账号批准</li>
    </ol>}
    {!paired && status?.available !== false && <div className="account-method-actions">
      <button className="button quiet" disabled={busy} onClick={start}>{busy ? '正在启动…' : status?.running ? '刷新配对码' : '启动并配对'}</button>
    </div>}
  </>;
}
