import { useState } from 'react';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { api } from './api';

// Spotify 开发者应用：用自己的 Client ID 走官方 Web API 授权。
export function SpotifyDeveloperLogin({ clientId, onSaved, external, notify, active }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const id = (draft ?? clientId ?? '').trim();
  async function authorize(event) {
    event.preventDefault();
    if (!/^[a-f0-9]{32}$/i.test(id)) { notify('请输入有效的 Spotify Client ID'); return; }
    setBusy(true);
    try {
      const result = await api('/api/settings', { method: 'PUT', body: { spotify_client_id: id } });
      onSaved(result);
      if (window.desktop?.oauthLogin) await window.desktop.oauthLogin();
      else external((await api('/api/accounts/spotify/login-url')).url);
    } catch (error) { notify(error.message); }
    finally { setBusy(false); }
  }
  return <form className="account-method-form" onSubmit={authorize}>
    <input aria-label="Spotify Client ID" placeholder="Client ID" autoComplete="off" spellCheck={false} maxLength={64}
      value={draft ?? clientId ?? ''} onChange={event => setDraft(event.target.value)} disabled={busy} />
    <button className="button quiet" disabled={busy || !id}>{busy ? '正在授权…' : active ? '重新授权' : '授权登录'}</button>
    <p className="field-help">回调地址 <code>http://127.0.0.1:18740/api/accounts/spotify/callback</code>
      <button className="text-button" type="button" onClick={() => external('https://developer.spotify.com/dashboard')}>开发者控制台<ArrowSquareOut size={14} /></button></p>
  </form>;
}
