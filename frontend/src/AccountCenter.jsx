import { ArrowRight, CheckCircle, Crown, Playlist, SignOut } from '@phosphor-icons/react';
import { SOURCE_NAMES } from './api';
import { PlatformMark } from './PlatformAccounts';

// 三张卡片共用的外壳：品牌色带、图标、名称与状态、接入方式列表、底部操作。
function AccountCard({ source, title, connected, badge, subtitle, detail, children, footer }) {
  return <section className={'account-card account-' + source + (connected ? ' connected-card' : '')}>
    <div className="account-band"><PlatformMark source={source} /></div>
    <div className="account-content">
      <h2>{title}{connected && <span className="connected"><CheckCircle size={14} weight="fill" />{badge || '已连接'}</span>}</h2>
      <p>{subtitle}</p>
      {detail}
      <div className="account-methods">{children}</div>
    </div>
    {footer && <div className="account-actions">{footer}</div>}
  </section>;
}

// 一种接入方式：名称、状态、一句说明，以及按钮或表单。
function Method({ title, state, active, note, children }) {
  return <div className={'account-method' + (active ? ' active' : '')}>
    <div className="account-method-head"><strong>{title}</strong>{state && <span className="account-method-state">{state}</span>}</div>
    {note && <small>{note}</small>}
    {children}
  </div>;
}

function Membership({ account }) {
  if (!account.logged_in) return account.reason ? <small className="account-reason">{account.reason}</small> : null;
  return <div className="membership"><Crown size={16} />{account.membership || '会员状态未返回'}</div>;
}

function NativeFooter({ source, account, onCloud, onLogout }) {
  if (!account.logged_in) return null;
  return <>
    <button className="text-button" onClick={() => onCloud(source)}><Playlist size={16} />云端歌单</button>
    <button className="text-button" onClick={() => onLogout(source)}><SignOut size={16} />退出</button>
  </>;
}

function NeteaseCard({ account, onLogin, ...rest }) {
  return <AccountCard source="netease" title={SOURCE_NAMES.netease} connected={account.logged_in}
    subtitle={account.logged_in ? account.nickname || '已登录账号' : '尚未连接'} detail={<Membership account={account} />}
    footer={<NativeFooter source="netease" account={account} {...rest} />}>
    <Method title="扫码登录" active={account.logged_in} state={account.logged_in ? '正在使用' : ''} note="用网易云音乐 App 扫码，登录后可播放会员歌曲、读取日推和私人 FM。">
      <div className="account-method-actions"><button className={'button ' + (account.logged_in ? 'quiet' : 'primary')} onClick={() => onLogin('netease')}>{account.logged_in ? '重新扫码' : '扫码登录'}<ArrowRight size={16} /></button></div>
    </Method>
  </AccountCard>;
}

function QQCard({ account, onLogin, ...rest }) {
  return <AccountCard source="qqmusic" title={SOURCE_NAMES.qqmusic} connected={account.logged_in}
    subtitle={account.logged_in ? account.nickname || '已登录账号' : '尚未连接'} detail={<Membership account={account} />}
    footer={<NativeFooter source="qqmusic" account={account} {...rest} />}>
    <Method title="官方页面登录" active={account.logged_in} state={account.logged_in ? '正在使用' : ''} note="在 QQ 音乐官方页面用 QQ 或微信登录，登录后可播放会员歌曲、读取雷达和猜你喜欢。">
      <div className="account-method-actions"><button className={'button ' + (account.logged_in ? 'quiet' : 'primary')} onClick={() => onLogin('qqmusic')}>{account.logged_in ? '重新登录' : '打开登录页面'}<ArrowRight size={16} /></button></div>
    </Method>
  </AccountCard>;
}

function SpotifyCard({ account, onLogin, ...rest }) {
  return <AccountCard source="spotify" title="Spotify" connected={account.logged_in}
    subtitle={account.logged_in ? account.nickname || '已登录账号' : '尚未连接'}
    detail={<Membership account={account} />} footer={<NativeFooter source="spotify" account={account} {...rest} />}>
    <Method title="网页登录" active={account.logged_in} state={account.logged_in ? '正在使用' : ''} note="登录 Spotify 网页播放器，在 Elixir 内播放，免费账号和 Premium 都能用。也可以粘贴 sp_dc Cookie。">
      <div className="account-method-actions"><button className={'button ' + (account.logged_in ? 'quiet' : 'primary')} onClick={() => onLogin('spotify')}>{account.logged_in ? '重新登录' : '网页登录'}<ArrowRight size={16} /></button></div>
    </Method>
  </AccountCard>;
}

export function AccountCenter({ accounts, onLogin, onLogout, onCloud }) {
  const find = source => accounts.find(account => account.source === source) || {};
  const shared = { onLogin, onLogout, onCloud };
  return <div className="account-list account-center">
    <NeteaseCard account={find('netease')} {...shared} />
    <QQCard account={find('qqmusic')} {...shared} />
    <SpotifyCard account={find('spotify')} {...shared} />
  </div>;
}

export function connectedCount(accounts) {
  return ['netease', 'qqmusic', 'spotify'].filter(source => accounts.some(account => account.source === source && account.logged_in)).length;
}
