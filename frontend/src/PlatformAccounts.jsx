import { useState } from 'react';
import { ArrowSquareOut, Play } from '@phosphor-icons/react';
import { api, SOURCE_NAMES } from './api';
import platforms from '../../backend/providers/platforms.json';

const fieldLabels={ACCESS_TOKEN:'Access Token',DEVICE_ID:'设备 ID',CLIENT_ID:'Client ID',CLIENT_SECRET:'Client Secret'};

export function PlatformMark({ source }) {
  const [failed, setFailed] = useState(false);
  return <div className={'platform-avatar platform-' + source}>
    {failed ? <span aria-hidden="true">{SOURCE_NAMES[source]?.slice(0, 1)}</span> :
      <img src={'/platforms/' + source + '.webp'} onError={() => setFailed(true)} alt="" />}
  </div>;
}

export async function openPlatform(source, url, play = false, track) {
  if (window.desktop?.platformWindow) return window.desktop.platformWindow(source,url,play,track?.id,
    source==='migu' && track ? {title:track.title,artist:track.artist,album:track.album,duration_ms:track.duration_ms} : undefined);
  const platform = platforms[source];
  if (!platform) throw new Error('未知音乐平台');
  const target = new URL(url || platform.url);
  if (target.protocol !== 'https:' || target.username || target.password || target.port ||
      !platform.hosts.some(host => target.hostname === host || target.hostname.endsWith('.' + host))) throw new Error('平台链接无法识别');
  window.open(target.href, '_blank', 'noopener,noreferrer');
}

// 其他平台的账号卡片。这些平台目前暂停接入（platforms.json 里标了 paused），账号页暂不使用。
export function PlatformAccounts({ accounts, notify, onPlay, onAccountsChanged, onLogin }) {
  return <div className="account-list additional-platforms">
    {Object.entries(platforms).filter(([, platform]) => !platform.companion).map(([source, platform]) => {
      const account=accounts.find(account => account.source===source);
      const connected=account?.logged_in;
      const qishui=source==='qishui';
      return <section className="account-card" key={source}>
        <div className="account-band"><PlatformMark source={source} /></div>
        <div className="account-content"><h2>{platform.name}</h2>
          {(!platform.siteOnly || qishui || platform.accountQr) && <p>{connected ? ((qishui || platform.accountQr) && account.nickname || '已登录') : '尚未登录'}</p>}
          {platform.catalogAuth && <CatalogAuthorization source={source} config={platform.catalogAuth} saved={account?.catalog_saved} notify={notify} />}
          {qishui && <QishuiSession connected={connected} notify={notify} onChanged={onAccountsChanged} />}
          {platform.links && <TrackLinkImport source={source} notify={notify} onPlay={onPlay} />}
        </div>
        <div className="account-actions">
          {platform.accountQr ? <button className="button quiet" onClick={()=>onLogin(source)}>{connected?'重新扫码':'扫码登录'}</button> :
            <button className="button quiet" onClick={() => openPlatform(source).catch(e => notify(e.message))}>
              {platform.siteOnly ? '打开官网' : connected ? '打开官方窗口' : '登录 / 验证'} <ArrowSquareOut size={16} />
            </button>}
          {connected && !qishui && (platform.accountQr || window.desktop?.platformLogout) && <button className="text-button" onClick={async()=>{
            try {
              if(platform.accountQr){await api('/api/accounts/'+source,{method:'DELETE'});await onAccountsChanged?.();}
              else await window.desktop.platformLogout(source);
            }catch(error){notify(error.message);}
          }}>退出</button>}
        </div>
      </section>
    })}
  </div>;
}

function QishuiSession({connected,notify,onChanged}) {
  const [cookie,setCookie]=useState('');
  const [busy,setBusy]=useState(false);
  async function update(remove) {
    setBusy(true);
    try {
      await api('/api/accounts/qishui'+(remove?'':'/cookie'),remove?{method:'DELETE'}:{method:'POST',body:{cookie}});
      setCookie('');
      await onChanged?.();
      notify(remove?'已退出汽水音乐':'已验证汽水音乐会话');
    } catch(error){notify(error.message);}
    finally{setBusy(false);}
  }
  return <details className="advanced-connection">
    <summary>使用已有汽水会话</summary>
    <form onSubmit={event=>{event.preventDefault();update(false);}} className="lx-search">
      <input type="password" aria-label="汽水音乐 Cookie" placeholder="汽水音乐 Cookie" autoComplete="off"
        spellCheck={false} maxLength={50000} value={cookie} onChange={event=>setCookie(event.target.value)} disabled={busy} required />
      <button className="button quiet" disabled={busy||!cookie.trim()}>验证并连接</button>
      {connected && <button type="button" className="text-button" onClick={()=>update(true)} disabled={busy}>退出</button>}
    </form>
  </details>;
}

function CatalogAuthorization({source,config,saved,notify}) {
  const [fields,setFields]=useState({});
  const [method,setMethod]=useState(0);
  const [pending,setPending]=useState(false);
  const [result,setResult]=useState(null);
  const configured=result??saved;
  const required=config.methods[method];
  const keys=config.region?[...required,'COUNTRY']:required;
  async function update(remove) {
    setPending(true);
    try {
      const data=await api('/api/accounts/'+source+'/catalog-authorization',remove?{method:'DELETE'}:{method:'PUT',body:{fields}});
      setResult(data.catalog_saved);setFields({});
      notify(remove?'已移除本机目录授权':'目录授权已验证');
    } catch(error){notify(error.message);}
    finally{setPending(false);}
  }
  return <details className="advanced-connection platform-catalog-authorization">
    <summary>{configured?'目录授权 · 已验证':'开发者目录授权'}</summary>
    <form onSubmit={event=>{event.preventDefault();update(false);}} className="lx-search">
      {config.methods.length>1 && <div role="group" aria-label="授权方式">
        {config.methods.map((option,index)=><button key={option.join('/')} type="button" className={'button '+(method===index?'primary':'quiet')} aria-pressed={method===index}
          disabled={pending} onClick={()=>{if(index!==method){setMethod(index);setFields(old=>old.COUNTRY?{COUNTRY:old.COUNTRY}:{});}}}>{option.length===1?'Access Token':'Client ID + Secret'}</button>)}
      </div>}
      {keys.map(key=>{
        const label=key==='COUNTRY'?'地区代码（默认 '+config.region+'）':config.labels?.[key]||fieldLabels[key];
        return <input key={key} value={fields[key]||''} onChange={event=>setFields({...fields,[key]:event.target.value})}
          aria-label={label} placeholder={label} type={['ACCESS_TOKEN','CLIENT_SECRET'].includes(key)?'password':'text'}
          autoComplete="off" spellCheck={false} maxLength={key==='COUNTRY'?2:8192} required={key!=='COUNTRY'} disabled={pending} />;
      })}
      <button className="button quiet" disabled={pending || !required.every(key=>fields[key]?.trim())}>验证并保存</button>
      {configured&&<button type="button" className="text-button" disabled={pending} onClick={()=>update(true)}>移除授权</button>}
    </form>
  </details>;
}

function TrackLinkImport({ source, notify, onPlay }) {
  const [url,setUrl]=useState('');
  const [entry,setEntry]=useState(null);
  const [busy,setBusy]=useState(false);
  async function importTrack(event) {
    event.preventDefault();
    const link=url.trim().match(/https:\/\/[^\s，。]+/)?.[0];
    if(!link){notify('请粘贴单曲分享链接');return;}
    setBusy(true);setEntry(null);
    try{setEntry(await api('/api/accounts/'+source+'/import-track',{method:'POST',body:{url:link}}));}
    catch(error){
      if(!window.desktop?.platformReadTrack){notify(error.message);return;}
      try{setEntry(await window.desktop.platformReadTrack(source,link));}
      catch(browserError){notify(browserError.message);}
    }
    finally{setBusy(false);}
  }
  return <details className="advanced-connection platform-track-import">
    <summary>导入单曲链接</summary>
    <form onSubmit={importTrack} className="lx-search">
      <input value={url} onChange={event=>setUrl(event.target.value)} aria-label={SOURCE_NAMES[source]+' 单曲链接'} placeholder="粘贴分享链接" maxLength={2048} required />
      <button className="button quiet" disabled={busy || !url.trim()}>{busy?'读取中…':'导入'}</button>
    </form>
    {entry && <button className="text-button" onClick={()=>onPlay(entry)}><Play size={15} weight="fill" />{entry.title}{entry.artist?' · '+entry.artist:''}</button>}
  </details>;
}

export function PlatformSearchLink({ source, query, connected, notify }) {
  const template=connected && platforms[source]?.search;
  if(!template || !query.trim())return null;
  return <button className="text-button" onClick={()=>openPlatform(source,template.replace('{q}',encodeURIComponent(query))).catch(e=>notify(e.message))}>
    在 {SOURCE_NAMES[source]} 搜索 <ArrowSquareOut size={15} />
  </button>;
}
