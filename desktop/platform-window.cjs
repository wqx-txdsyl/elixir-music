const { BrowserWindow, Menu, dialog, session, shell } = require('electron');
const platforms = require('../backend/providers/platforms.json');

function trustedUrl(value, hosts, subdomains = true) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      hosts.some(host => url.hostname === host || (subdomains && url.hostname.endsWith('.' + host)));
  } catch { return false; }
}

const accountSignal = `(() => {
  const action = /^(log\\s*out|sign\\s*out|log\\s*off|退出登录|登出|退出賬號|登出帳號|退出帳號|로그아웃|サインアウト|ログアウト)$/iu;
  return [...document.querySelectorAll('a,button,[role="button"],[role="menuitem"]')].some(element => {
    if (!element.getClientRects().length) return false;
    return action.test((element.getAttribute('aria-label') || element.innerText || '').trim());
  });
})()`;

const trackSignal = `(() => {
  const content = name => document.querySelector('meta[property="'+name+'"]')?.content || '';
  const primary = document.querySelector('[data-testid="track-title"], [itemprop="name"], main h1, h1');
  const title = primary?.textContent?.trim() || (content('og:type') === 'music.song' ? content('og:title') : '');
  const artist = document.querySelector('[data-testid="track-artist"], [itemprop="byArtist"]')?.textContent?.trim() || '';
  return title ? { title, artist, cover: content('og:image'), loaded: location.href } : null;
})()`;

const searchSignal = `(() => [...document.querySelectorAll('main a[href], [role="main"] a[href], .searchResults a[href], #content a[href]')].slice(0,350).map(link => {
  const title=link.querySelector('[data-testid="track-title"]')?.textContent || link.getAttribute('aria-label') || link.innerText || link.title;
  return { url:link.href, loaded:link.href, title:title?.trim(), artist:'', cover:link.querySelector('img')?.currentSrc || '' };
}).filter(row => row.title && row.title.length<=350 && row.url.length<=2048))()`;

const searchableTrackPaths = {
  tidal: /^\/(?:browse\/)?track\/\d+\/?$/,
  soundcloud: /^\/(?!search\/|discover\/|pages\/|settings\/)[\w-]+\/[\w-]+\/?$/,
  amazon: /^\/(?:tracks|albums)\/[A-Z0-9]{10}\/?$/i,
  pandora: /^\/artist\/(?:[^/]+\/)+TR[A-Za-z0-9]+\/?$/,
  kkbox: /^\/(?:[a-z]{2}\/[a-z]{2}\/)?(?:song|track)\/[\w-]+\/?$/i,
  audiomack: /^\/[\w-]+\/song\/[\w-]+\/?$/,
  anghami: /^\/song\/\d+\/?$/,
};

const additionalPlaybackPaths = {
  apple: /^\/[^/]+\/(?:album|song)\//,
  ytmusic: /^\/watch$/,
  deezer: /\/track\/\d+\/?$/,
  kugou: /^\/song\/?$/,
  kuwo: /^\/play_detail\/\d+\/?$/,
  migu: /^\/v5\/$/,
  melon: /^\/song\/detail\.htm$/,
  bandcamp: /^\/track\/[\w-]+\/?$/,
  qobuz: /^\/track\/\d+\/?$/,
  qishui: /^\/qishui\/(?:share\/track|song\/\d+)$/,
  bodian: /^\/m\/bodian\/playMusic\.html$/,
};

function playbackKey(source,value) {
  const pattern=additionalPlaybackPaths[source] || searchableTrackPaths[source];
  if(!pattern || !trustedUrl(value,platforms[source].hosts))return '';
  const url=new URL(value);
  if(!pattern.test(url.pathname))return '';
  if(source==='ytmusic')return url.searchParams.get('v') || '';
  if(source==='apple')return url.searchParams.get('i') || (url.pathname.includes('/song/') ? url.pathname.split('/').pop() : '');
  if(source==='amazon')return url.searchParams.get('trackAsin') || (url.pathname.startsWith('/tracks/') ? url.pathname.split('/').filter(Boolean).pop() : '');
  if(source==='kugou')return new URLSearchParams(url.hash.slice(1)).get('hash')?.toLowerCase() || '';
  if(source==='migu')return url.hash.startsWith('#/playlist?') ? new URLSearchParams(url.hash.slice(11)).get('search') || '' : '';
  if(source==='melon')return url.searchParams.get('songId') || '';
  if(source==='qishui')return url.searchParams.get('track_id') || (url.pathname.includes('/song/')?url.pathname.split('/').pop():'');
  if(source==='bodian')return url.searchParams.get('musicId') || '';
  const path=url.pathname.replace(/\/$/,'');
  if(source==='tidal')return path.split('/').pop();
  return path;
}

const controlSignal = (resume) => `(async () => {
  const resume=${JSON.stringify(resume)};
  const media=[...document.querySelectorAll('audio,video')].find(element=>!element.ended && element.readyState>0 && !element.muted && element.volume>0 && element.paused===resume);
  if(media){if(resume)await media.play();else media.pause();return true;}
  const labels=resume?/^(play|播放|立即播放|播放歌曲|再生|재생)$/iu:/^(pause|暂停|暫停|一時停止|일시정지)$/iu;
  const selector='main button, main [role="button"], [role="main"] button, button.play.bg_primary, .play-box .custom-icon[title], .soundActions .sc-button-play, .inline_player .playbutton, #trackInfo .playbutton, [data-testid="play-button"], [data-testid="pause-button"]';
  const button=[...document.querySelectorAll(selector)].find(element=>!element.disabled && element.getAttribute('aria-disabled')!=='true' && element.getClientRects().length && labels.test((element.getAttribute('aria-label') || element.title || element.innerText || '').trim()));
  if(!button)return false;
  button.click();return true;
})()`;

const miguSignal = (track, start) => `(() => {
  const expected=${JSON.stringify(track)};
  const normalize=text=>String(text||'').normalize('NFKC').replace(/\\s+/g,'').toLowerCase();
  const rows=[...document.querySelectorAll(${JSON.stringify(start?'tr.el-table__row':'tr.playing-row, tr.selected-playing-row')})];
  const matches=rows.filter(row=>{
    const title=row.querySelector('.song-name');
    const artists=[...row.querySelectorAll('.singers-content .singer')].map(element=>element.textContent).join('/');
    const time=row.cells[3]?.innerText.trim().match(/^(\\d+):(\\d{2})$/);
    return title && expected.title && expected.artist && expected.album && expected.duration_ms>0
      && normalize(title.textContent)===normalize(expected.title)
      && normalize(artists)===normalize(expected.artist)
      && normalize(row.cells[2]?.innerText)===normalize(expected.album)
      && time && Math.abs((Number(time[1])*60+Number(time[2]))*1000-expected.duration_ms)<1500;
  });
  if(matches.length!==1)return false;
  if(${JSON.stringify(start)})matches[0].querySelector('.song-name').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
  return true;
})()`;

function createPlatformWindows(parent, reportAccount, reportPlayback = () => {}) {
  const windows = new Map();
  const checked = new Map();
  const searches = new Map();
  let playing = null;
  let playback = null;
  let playGeneration = 0;
  function stop() {
    playGeneration++;
    if(playback)reportPlayback({track_id:playback.trackId,playing:false,closed:true});
    playback=null;
    if (playing && !playing.isDestroyed()) playing.close();
    playing = null;
  }
  async function open(source, value, play = false, trackId = '', track = null) {
    const platform = Object.hasOwn(platforms, source) && platforms[source];
    if (!platform) throw new Error('未知音乐平台');
    const url = value || platform.url;
    if (!trustedUrl(url, platform.hosts)) throw new Error('平台链接无法识别');
    let win = windows.get(source);
    if (play && playing !== win) stop();
    const generation=play?++playGeneration:playGeneration;
    if (!win || win.isDestroyed()) {
      win = new BrowserWindow({ width: 1120, height: 780, minWidth: 700, minHeight: 520, parent: parent(),
        title: platform.name + ' · Elixir', webPreferences: { partition: 'persist:elixir-platform-' + source,
          contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, autoplayPolicy:'no-user-gesture-required' } });
      windows.set(source, win);
      const allowed = target => trustedUrl(target, platform.hosts) || trustedUrl(target, platform.auth || [], false);
      const guard = (event, target) => { if (!allowed(event.url || target)) event.preventDefault(); };
      win.webContents.on('will-navigate', guard);
      win.webContents.on('will-redirect', guard);
      const mediaPermission = (permission, origin) => permission === 'mediaKeySystem' && trustedUrl(origin, platform.hosts);
      win.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => callback(mediaPermission(permission, details?.requestingUrl || contents?.getURL())));
      win.webContents.session.setPermissionCheckHandler((contents, permission, origin) => mediaPermission(permission, origin || contents?.getURL()));
      win.webContents.setWindowOpenHandler(({ url: target }) => {
        if (allowed(target)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } } };
        return { action: 'deny' };
      });
      win.webContents.on('did-create-window', child => {
        child.webContents.on('will-navigate', guard);
        child.webContents.on('will-redirect', guard);
        child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      });
      async function verifyAccount() {
        const contents = win.webContents;
        if (!trustedUrl(contents.getURL(), platform.hosts) || !await contents.executeJavaScript(accountSignal)) {
          await dialog.showMessageBox(win, { type: 'info', message: '请登录后展开平台的账号菜单，再点「验证登录」' });
          return;
        }
        await reportAccount(source, true);
        checked.set(source,Date.now()+12*60*60*1000);
        win.hide();
      }
      if (!platform.siteOnly && !platform.companion) {
        const urls=platform.hosts.flatMap(host=>['https://'+host+'/*','https://*.'+host+'/*']);
        if(source==='apple')urls.push('https://amp-api.music.apple.com/v1/me/*','https://api.music.apple.com/v1/me/*');
        win.webContents.session.webRequest.onCompleted({ urls }, event => {
          const current=new URL(event.url);
          if (/\/(?:logout|log-out|signout|sign-out)(?:\/|$)/i.test(current.pathname) && event.statusCode>=200 && event.statusCode<400 && checked.delete(source)) {
            reportAccount(source,false).catch(()=>{});
          }
          if(source!=='apple' || !['amp-api.music.apple.com','api.music.apple.com'].includes(current.hostname) || !current.pathname.startsWith('/v1/me/'))return;
          const type=Object.entries(event.responseHeaders || {}).find(([name])=>name.toLowerCase()==='content-type')?.[1]?.join(' ') || '';
          if (event.method === 'GET' && event.statusCode === 200 && /json/i.test(type) && !(checked.get(source)>Date.now())) {
            checked.set(source,Date.now()+12*60*60*1000);
            reportAccount(source, true).catch(() => checked.delete(source));
          }
        });
      }
      win.setMenu(Menu.buildFromTemplate([...(!platform.siteOnly && !platform.companion ? [{ label: '验证登录', click: () => {
        verifyAccount().catch(error => dialog.showMessageBox(win, { type: 'info', message: error.message }));
      } }] : []), { label: '在系统浏览器打开', click: () => {
        const target = win.webContents.getURL();
        if (trustedUrl(target, platform.hosts)) shell.openExternal(target);
      } }, { label: '关闭', click: () => win.close() }]));
      win.on('closed', () => {
        if (windows.get(source) === win) windows.delete(source);
        if (playing === win){playing=null;if(playback)reportPlayback({track_id:playback.trackId,playing:false,closed:true});playback=null;}
      });
      win.webContents.on('audio-state-changed',()=>publish(win));
      win.webContents.on('did-navigate',()=>publish(win));
      win.webContents.on('did-navigate-in-page',()=>publish(win));
    }
    if (play){playing=win;playback={source,url,trackId,generation,track};}
    win.show(); win.focus();
    if (value || !win.webContents.getURL()) {
      try { await win.loadURL(url); }
      catch (error) { if (error.code !== 'ERR_ABORTED') throw new Error(platform.name + ' 页面未能加载'); }
    }
    const key=play && playbackKey(source,url);
    if(key && playback?.generation===generation){
      const signal=source==='migu' && track ? miguSignal(track,true) : controlSignal(true);
      for(let attempt=0;attempt<8;attempt++){
        if(win.isDestroyed() || playback?.generation!==generation)break;
        const contents=win.webContents;
        if(contents.isCurrentlyAudible())break;
        if(playbackKey(source,contents.getURL())===key && await contents.executeJavaScript(signal,true).catch(()=>false))break;
        await new Promise(resolve=>setTimeout(resolve,300));
      }
    }
    return { opened: true, playing: await publish(win) };
  }
  async function publish(win) {
    if(playing!==win || win.isDestroyed() || !playback)return false;
    const active=playback;
    const key=playbackKey(active.source,active.url);
    const contents=win.webContents;
    let audible=!!key && playbackKey(active.source,contents.getURL())===key && contents.isCurrentlyAudible();
    if(audible && active.source==='migu'){
      audible=!!active.track && await contents.executeJavaScript(miguSignal(active.track,false)).catch(()=>false);
      if(playback!==active || win.isDestroyed())return false;
      audible=audible && contents.isCurrentlyAudible();
    }
    reportPlayback({track_id:active.trackId,playing:audible});
    return audible;
  }
  async function control(trackId,resume) {
    if(!playback || playback.trackId!==trackId || !playing || playing.isDestroyed())return {accepted:false};
    const win=playing;
    const key=playbackKey(playback.source,playback.url);
    if(!key || playbackKey(playback.source,win.webContents.getURL())!==key)return {accepted:false};
    const accepted=await win.webContents.executeJavaScript(controlSignal(resume===true),true).catch(()=>false);
    return {accepted,playing:await publish(win)};
  }
  function close() {
    for (const win of windows.values()) if (!win.isDestroyed()) win.close();
    for (const win of searches.values()) if (!win.isDestroyed()) win.destroy();
  }
  async function clear(source) {
    if (!Object.hasOwn(platforms, source) || platforms[source].companion) throw new Error('未知音乐平台');
    const win = windows.get(source);
    if (win && !win.isDestroyed()) win.destroy();
    const search=searches.get(source);
    if(search&&!search.isDestroyed())search.destroy();
    checked.delete(source);
    await session.fromPartition('persist:elixir-platform-' + source).clearStorageData();
    return reportAccount(source, false);
  }
  async function readTrack(source,url) {
    if (!Object.hasOwn(platforms, source) || !platforms[source].links || !trustedUrl(url,platforms[source].hosts)) throw new Error('单曲链接无效');
    await open(source,url);
    const win=windows.get(source);
    for (let attempt=0;attempt<9;attempt++) {
      if (!win || win.isDestroyed() || !trustedUrl(win.webContents.getURL(),platforms[source].hosts)) break;
      const result=await win.webContents.executeJavaScript(trackSignal);
      if (result) return { ...result, url };
      await new Promise(resolve=>setTimeout(resolve,350));
    }
    throw new Error('请在打开的官方窗口确认歌曲可见，再重试导入');
  }
  async function search(source,query) {
    const platform=Object.hasOwn(platforms,source)&&platforms[source];
    if (!platform?.search || !searchableTrackPaths[source] || !(checked.get(source)>Date.now())) return [];
    if (typeof query!=='string' || !query.trim() || query.length>200) return [];
    const url=platform.search.replace('{q}',encodeURIComponent(query));
    if (!trustedUrl(url,platform.hosts)) return [];
    const previous=searches.get(source);
    if(previous&&!previous.isDestroyed())previous.destroy();
    const win=new BrowserWindow({show:false,skipTaskbar:true,webPreferences:{partition:'persist:elixir-platform-'+source,
      contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:false}});
    searches.set(source,win);
    const contents=win.webContents;
    const guard=(event,target)=>{if(!trustedUrl(event.url||target,platform.hosts))event.preventDefault();};
    contents.on('will-navigate',guard);contents.on('will-redirect',guard);
    contents.setWindowOpenHandler(()=>({action:'deny'}));
    let timer;
    try {
      await Promise.race([win.loadURL(url),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('search timeout')),4500);})]);
      for(let attempt=0;attempt<5;attempt++){
        if(win.isDestroyed() || !trustedUrl(contents.getURL(),platform.hosts))return [];
        const candidates=await contents.executeJavaScript(searchSignal);
        const rows=candidates.filter(row=>trustedUrl(row.url,platform.hosts)&&searchableTrackPaths[source].test(new URL(row.url).pathname));
        if(rows.length)return [...new Map(rows.map(row=>[row.url,row])).values()].slice(0,30);
        await new Promise(resolve=>setTimeout(resolve,300));
      }
    }catch{return [];}
    finally{
      clearTimeout(timer);
      if(searches.get(source)===win)searches.delete(source);
      if(!win.isDestroyed())win.destroy();
    }
    return [];
  }
  return { open, stop, close, clear, readTrack, search, control };
}

module.exports = { createPlatformWindows, trustedUrl };
