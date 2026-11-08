const { app, BrowserWindow, ipcMain, dialog, shell, session, Menu, Tray, nativeImage, globalShortcut,screen } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {canonicalRuntimeExecutable,canonicalDataDirectory}=require('./runtime-paths.cjs');
const {SpotifyPlayer}=require('./spotify-player.cjs');
const {createPlatformWindows}=require('./platform-window.cjs');
const {readLyricsPreferences,saveLyricsPreferences,lyricsWindowHeight,normalizeLyricData}=require('./lyrics-preferences.cjs');
const {retainInBackground,showWindow}=require('./background-window.cjs');
canonicalRuntimeExecutable(app);
app.setAppUserModelId('local.musicplatform.desktop');
app.setName('Elixir');
const ORIGIN = 'http://127.0.0.1:18740';
const token = crypto.randomBytes(32).toString('hex');
let mainWindow, service, closing = false;
let lyricWindow, tray;
let lyricData={title:'桌面歌词',line:'播放音乐后显示歌词',next:''};
const loginWindows = new Map();
const platformWindows=createPlatformWindows(()=>mainWindow, async (source, verified) => {
  const result = await backend('/api/accounts/'+source+'/web-status',{verified},'PUT');
  mainWindow?.webContents.send('accounts-updated',source);
  return result;
}, state => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('platform-playback',state);
});
let spotifyHeaders = { access_token: '', client_token: '' };
let spotifyCaptureInstalled = false;
let inAppSpotify;
let spotifyPlaySequence=0;
const spotifyControlTimers=new Map();
const root = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
const brandRoot=app.isPackaged?path.join(process.resourcesPath,'branding'):path.join(__dirname,'branding','runtime');
function brandAsset(kind){
  try{const file=JSON.parse(fs.readFileSync(path.join(brandRoot,'branding.json'),'utf8'))[kind];if(typeof file==='string'&&/^[a-z0-9._-]+$/.test(file)&&fs.existsSync(path.join(brandRoot,file)))return path.join(brandRoot,file);}catch{}
  return path.join(__dirname,kind==='ico'?'icon.ico':'icon.png');
}

const dataRoot = canonicalDataDirectory(process.env.MUSICPLATFORM_DATA_DIR || (app.isPackaged ? path.join(path.dirname(process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe')), 'MusicPlatformData') : path.join(root, 'data')));
const playbackConfig=path.join(dataRoot,'playback-runtime.json');
const lyricsPreferencesFile=path.join(dataRoot,'desktop-lyrics.json');
let lyricsPreferences=readLyricsPreferences(lyricsPreferencesFile),lyricsBoundsTimer;
try{const proxy=JSON.parse(fs.readFileSync(playbackConfig,'utf8')).proxy;if(proxy&&['http:','https:','socks5:'].includes(new URL(proxy).protocol))app.commandLine.appendSwitch('proxy-server',proxy);}catch{}
app.setPath('userData', path.join(dataRoot, 'desktop'));

function trusted(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !event.senderFrame.url.startsWith(ORIGIN + '/')) throw new Error('不允许的窗口调用');
}
async function backend(endpoint, body, method = 'POST', retried=false) {
  const response = await fetch(ORIGIN + endpoint, { method, headers: {'Content-Type':'application/json','X-App-Token':token}, ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
  const result = await response.json();
  if(!response.ok&&result.code==='spotify_session_expired'&&!retried&&endpoint!=='/api/accounts/spotify/web-session'){
    await spotifyPlayer().refreshSession();return backend(endpoint,body,method,true);
  }
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : '服务请求失败');
  return result;
}
function allowedExternal(url) {
  try { const parsed = new URL(url); return ['https:', 'http:', 'spotify:', 'orpheus:', 'qqmusic:'].includes(parsed.protocol); } catch { return false; }
}
async function startBackend() {
  const executable = path.join(root, 'backend', 'MusicPlatformService.exe');
  const args = app.isPackaged ? [] : [path.join(root, 'backend', 'run.py')];
  const binary = app.isPackaged ? executable : (process.env.MUSICPLATFORM_PYTHON || 'python');
  const logfile = fs.openSync(path.join(dataRoot, 'service.log'), 'a');
  service = spawn(binary, args, {cwd:root, windowsHide:true, stdio:['ignore',logfile,logfile], env:{...process.env,MUSICPLATFORM_TOKEN:token,MUSICPLATFORM_PORT:'18740',MUSICPLATFORM_DATA:dataRoot,MUSICPLATFORM_DATA_DIR:dataRoot,MUSICPLATFORM_WEB:app.isPackaged?path.join(root,'web'):path.join(root,'dist','web'),...(app.isPackaged?{ELIXIR_LIBRESPOT_DIR:path.join(root,'backend','librespot')}:{}),PYTHONUTF8:'1'}});
  fs.closeSync(logfile);
  let spawnError;
  service.on('error', error => { spawnError = error; });
  for (let attempt=0; attempt<120; attempt++) {
    if (spawnError) throw spawnError;
    if (service.exitCode !== null) throw new Error('音乐服务未能启动。请检查 MusicPlatformData/service.log。');
    try { const r = await fetch(ORIGIN+'/api/health',{headers:{'X-App-Token':token},signal:AbortSignal.timeout(1000)}); if(r.ok) { const health=await r.json(); if(health.instance===crypto.createHash('sha256').update(token).digest('hex').slice(0,16)) return; } } catch {}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('音乐服务启动超时，请检查端口 18740 或本地服务日志。');
}
function spotifyPlayer(){
  if(!inAppSpotify)inAppSpotify=new SpotifyPlayer({parent:()=>mainWindow,
    getProxy:async()=>{const settings=await backend('/api/settings',undefined,'GET');return settings.proxy || '';},
    onSession:async data=>{const profile=await backend('/api/accounts/spotify/web-session',data);mainWindow?.webContents.send('accounts-updated','spotify');return profile;},
    // Each state report from the web player also wakes the renderer, so progress and pauses show without waiting for a poll.
    onObservation:data=>backend('/api/spotify/player-observation',data).finally(()=>mainWindow?.webContents.send('spotify-player-state',{observation:data.debug_source})),
    onState:state=>{fs.appendFileSync(path.join(dataRoot,'spotify-player-status.jsonl'),JSON.stringify({at:Date.now(),...state})+'\n');
      // 已经切到别的音源，Spotify 却因为晚到的播放命令自己开播了：马上再暂停一次。
      if(state.media_started&&!spotifyWanted)pauseSpotify(spotifyPlaySequence);
      mainWindow?.webContents.send('spotify-player-state',state);}
  });return inAppSpotify;
}
async function syncLogin(source) {
  if(!['netease','qqmusic','spotify'].includes(source)) throw new Error('不支持的登录类型');
  if(source==='spotify')return spotifyPlayer().sync();
  const accountSession = session.fromPartition('persist:musicplatform-'+source);
  const domains = source==='netease' ? ['music.163.com'] : source==='spotify' ? ['spotify.com'] : ['y.qq.com','qq.com'];
  const allCookies = await accountSession.cookies.get({});
  const cookies = allCookies.filter(c=>domains.some(d=>c.domain.replace(/^\./,'')===d||c.domain.endsWith('.'+d)));
  const required = source==='netease' ? ['MUSIC_U'] : source==='spotify' ? ['sp_dc'] : ['qm_keyst','qqmusic_key','musickey','p_skey','skey'];
  if(!cookies.some(c=>required.includes(c.name))) throw new Error('尚未检测到登录，请先在官方页面完成扫码或账号登录。');
  const cookie = [...new Map(cookies.map(c=>[c.name,c.value])).entries()].map(([k,v])=>`${k}=${v}`).join('; ');
  if(source==='spotify'&&!spotifyHeaders.access_token) throw new Error('尚未获取到 Spotify 官方页面的有效会话。请等待页面加载，在页面中打开音乐或刷新页面后重试。');
  const profile = source==='spotify' ? await backend('/api/accounts/spotify/web-session',{...spotifyHeaders,cookie}) : await backend('/api/accounts/'+source+'/cookie',{cookie});
  if(profile.logged_in===false || profile.account?.logged_in===false) throw new Error(profile.reason || '登录状态未被平台确认，请重新登录。');
  const win = loginWindows.get(source); if(win&&!win.isDestroyed()) win.close();
  return profile;
}
async function login(source) {
  if(!['netease','qqmusic','spotify'].includes(source)) throw new Error('未知平台');
  if(source==='spotify')return spotifyPlayer().login();
  const existing = loginWindows.get(source); if(existing&&!existing.isDestroyed()){existing.focus();return {opened:true};}
  const win = new BrowserWindow({width:1080,height:760,minWidth:680,minHeight:560,parent:mainWindow,title:source==='netease'?'网易云音乐 · 官方登录':source==='spotify'?'Spotify · 官方登录':'QQ音乐 · 官方登录',autoHideMenuBar:false,webPreferences:{partition:'persist:musicplatform-'+source,nodeIntegration:false,contextIsolation:true,sandbox:true}});
  loginWindows.set(source,win);
  const complete = async()=>{try{await syncLogin(source);mainWindow?.webContents.send('accounts-updated');}catch(error){dialog.showMessageBox(win,{type:'info',message:error.message});}};
  win.setMenu(Menu.buildFromTemplate([{label:'已完成官方登录，返回聚合音乐',click:complete},{label:'关闭',click:()=>win.close()}]));
  win.webContents.setWindowOpenHandler(({url})=>{
    try { const parsed=new URL(url),host=parsed.hostname; if(parsed.protocol==='https:'&&(source==='qqmusic' && (host==='qq.com'||host.endsWith('.qq.com')) || source==='netease'&&(host==='163.com'||host.endsWith('.163.com')) || source==='spotify'&&(host==='spotify.com'||host.endsWith('.spotify.com')))) { win.loadURL(url).catch(()=>{}); } } catch {}
    return {action:'deny'};
  });
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  win.on('closed',()=>{if(loginWindows.get(source)===win)loginWindows.delete(source);});
  win.loadURL(source==='netease'?'https://music.163.com/#/login':source==='spotify'?'https://open.spotify.com/':'https://y.qq.com/').catch(()=>{if(!win.isDestroyed())dialog.showMessageBox(win,{type:'info',message:'官方登录页面未能加载。请检查网络；Spotify 可在设置中填写网络代理。'});});
  return {opened:true};
}
async function importSpotifyCookie(cookie) {
  if(typeof cookie!=='string'||cookie.length>50000||/[\r\n]/.test(cookie)) throw new Error('Cookie 格式不正确');
  const pairs = cookie.split(';').map(part=>{const i=part.indexOf('=');return i>0?[part.slice(0,i).trim(),part.slice(i+1).trim()]:null;}).filter(Boolean);
  if(!pairs.some(([name,value])=>name==='sp_dc'&&value)) throw new Error('请输入包含 sp_dc 的 Spotify Cookie');
  const isolatedSession=session.fromPartition('persist:musicplatform-spotify');
  spotifyHeaders={access_token:'',client_token:''};spotifyPlaySequence++;inAppSpotify?.reset();
  await isolatedSession.clearStorageData();
  for(const [name,value] of pairs) if(/^[A-Za-z0-9_-]+$/.test(name)&&value) await isolatedSession.cookies.set({url:'https://open.spotify.com/',domain:'.spotify.com',path:'/',name,value,secure:true,httpOnly:name==='sp_dc',sameSite:'no_restriction',expirationDate:Math.floor(Date.now()/1000)+86400*30});
  const old=loginWindows.get('spotify');if(old&&!old.isDestroyed())old.close();
  return login('spotify');
}
function createWindow() {
  mainWindow = new BrowserWindow({width:1400,height:920,minWidth:1000,minHeight:680,show:false,frame:false,backgroundColor:'#f7f9fc',title:'Elixir',icon:brandAsset('ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:false}});
  mainWindow.setMenuBarVisibility(false);
  if(process.platform==='win32'){mainWindow.setIcon(brandAsset('ico'));mainWindow.setAppDetails({appId:'local.musicplatform.desktop',appIconPath:brandAsset('ico'),appIconIndex:0,relaunchCommand:'\"'+app.getPath('exe')+'\"',relaunchDisplayName:'Elixir'});}
  mainWindow.webContents.setWindowOpenHandler(({url})=>{if(allowedExternal(url))shell.openExternal(url);return {action:'deny'};});
  mainWindow.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(ORIGIN+'/')){event.preventDefault();if(allowedExternal(url))shell.openExternal(url);}});
  mainWindow.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  mainWindow.once('ready-to-show',()=>mainWindow.show());
  retainInBackground(mainWindow,{canHide:()=>!!tray&&!tray.isDestroyed(),isQuitting:()=>closing});
  for(const event of ['maximize','unmaximize','minimize','restore'])mainWindow.on(event,()=>mainWindow?.webContents.send('window-state-changed',{maximized:mainWindow.isMaximized(),minimized:mainWindow.isMinimized()}));
  mainWindow.on('closed',()=>{mainWindow=null;app.quit();});
  mainWindow.loadURL(ORIGIN+'/?token='+token);
}
function lyricsWindow() {
  if(lyricWindow&&!lyricWindow.isDestroyed()){lyricWindow.show();return;}
  const saved=lyricsPreferences.bounds,visible=saved&&screen.getAllDisplays().some(({workArea:a})=>saved.x+saved.width>a.x+40&&saved.y+saved.height>a.y+40&&saved.x<a.x+a.width-40&&saved.y<a.y+a.height-40);
  const area=screen.getPrimaryDisplay().workArea,height=lyricsWindowHeight(lyricsPreferences.fontSize),width=saved?.width||Math.round(Math.max(420,Math.min(1100,area.width*.6)));
  // Transparent windows are not natively resizable; the renderer drags and resizes through lyrics-move.
  lyricWindow=new BrowserWindow({width,height,...(visible?{x:saved.x,y:saved.y}:{x:Math.round(area.x+(area.width-width)/2),y:Math.round(area.y+area.height-height-60)}),frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,alwaysOnTop:true,skipTaskbar:true,resizable:false,maximizable:false,minimizable:false,fullscreenable:false,show:false,title:'Elixir · 桌面歌词',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  lyricWindow.setAlwaysOnTop(true,'screen-saver');
  lyricWindow.setMenuBarVisibility(false);
  lyricWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  lyricWindow.webContents.on('will-navigate',event=>event.preventDefault());
  lyricWindow.once('ready-to-show',()=>{applyLyricsLock();lyricWindow?.showInactive();});
  const rememberBounds=()=>{clearTimeout(lyricsBoundsTimer);if(lyricWindow&&!lyricWindow.isDestroyed())lyricsPreferences=saveLyricsPreferences(lyricsPreferencesFile,{...lyricsPreferences,bounds:lyricWindow.getBounds()});};
  for(const event of ['move','resize'])lyricWindow.on(event,()=>{clearTimeout(lyricsBoundsTimer);lyricsBoundsTimer=setTimeout(rememberBounds,200);});
  lyricWindow.on('close',rememberBounds);
  lyricWindow.on('closed',()=>{clearTimeout(lyricsBoundsTimer);lyricWindow=null;mainWindow?.webContents.send('lyrics-closed');});
  lyricWindow.loadURL(ORIGIN+'/?desktopLyrics=1&token='+token);
}
// A locked lyric window lets clicks through; forwarded mouse moves still reveal its unlock button.
function applyLyricsLock(){
  if(!lyricWindow||lyricWindow.isDestroyed())return;
  if(lyricsPreferences.locked)lyricWindow.setIgnoreMouseEvents(true,{forward:true});else lyricWindow.setIgnoreMouseEvents(false);
}
function updateLyricsPreferences(patch){
  const fontSize=lyricsPreferences.fontSize;
  lyricsPreferences=saveLyricsPreferences(lyricsPreferencesFile,{...lyricsPreferences,...patch});
  if(lyricWindow&&!lyricWindow.isDestroyed()){
    applyLyricsLock();
    if(fontSize!==lyricsPreferences.fontSize)lyricWindow.setBounds({...lyricWindow.getBounds(),height:lyricsWindowHeight(lyricsPreferences.fontSize)});
    lyricWindow.webContents.send('lyrics-preferences',lyricsPreferences);
  }
  return lyricsPreferences;
}
function trayAndKeys(){
  tray=new Tray(brandAsset('ico'));tray.setToolTip('Elixir · 纯净听歌');
  const send=action=>mainWindow?.webContents.send('player-action',action);
  const show=()=>showWindow(mainWindow);
  tray.setContextMenu(Menu.buildFromTemplate([{label:'打开音乐',click:show},{label:'播放 / 暂停',click:()=>send('toggle')},{label:'上一首',click:()=>send('previous')},{label:'下一首',click:()=>send('next')},{label:'桌面歌词',click:lyricsWindow},{label:'解锁桌面歌词',click:()=>{lyricsWindow();updateLyricsPreferences({locked:false});}},{type:'separator'},{label:'退出',click:()=>app.quit()}]));
  tray.on('double-click',show);
  tray.on('click',show);
  globalShortcut.register('CommandOrControl+Shift+Space',()=>send('toggle'));
  globalShortcut.register('CommandOrControl+Shift+Right',()=>send('next'));
  globalShortcut.register('CommandOrControl+Shift+Left',()=>send('previous'));
}
function trustedLyric(event){if(!lyricWindow||event.sender!==lyricWindow.webContents||event.senderFrame!==lyricWindow.webContents.mainFrame||!event.senderFrame.url.startsWith(ORIGIN+'/'))throw Error('不允许的歌词窗口调用');}
ipcMain.handle('lyrics-open',event=>{trusted(event);lyricsWindow();return true;});
ipcMain.handle('lyrics-ready',event=>{trustedLyric(event);lyricWindow.webContents.send('lyrics-data',lyricData);return true;});
ipcMain.handle('lyrics-update',(event,data)=>{trusted(event);if(!data||typeof data!=='object')throw Error('无效歌词');lyricData=normalizeLyricData(data);lyricWindow?.webContents.send('lyrics-data',lyricData);return true;});
ipcMain.handle('lyrics-mouse',(event,passThrough)=>{trustedLyric(event);if(!lyricsPreferences.locked)return false;if(passThrough===false)lyricWindow.setIgnoreMouseEvents(false);else lyricWindow.setIgnoreMouseEvents(true,{forward:true});return true;});
ipcMain.handle('lyrics-move',(event,bounds)=>{trustedLyric(event);if(lyricsPreferences.locked||!bounds||!['x','y','width'].every(k=>Number.isFinite(bounds[k])))return false;lyricWindow.setBounds({x:Math.round(bounds.x),y:Math.round(bounds.y),width:Math.round(Math.max(420,Math.min(1800,bounds.width))),height:lyricsWindowHeight(lyricsPreferences.fontSize)});return true;});
ipcMain.handle('lyrics-close',event=>{if(event.sender===mainWindow?.webContents)trusted(event);else trustedLyric(event);lyricWindow?.close();return true;});
ipcMain.handle('lyrics-preferences-get',event=>{if(event.sender===mainWindow?.webContents)trusted(event);else trustedLyric(event);return lyricsPreferences;});
ipcMain.handle('lyrics-preferences-set',(event,data)=>{if(event.sender===mainWindow?.webContents)trusted(event);else trustedLyric(event);if(!data||typeof data!=='object')throw Error('无效的歌词设置');return updateLyricsPreferences(Object.fromEntries(['foreground','highlight','background','opacity','fontSize','locked'].filter(k=>k in data).map(k=>[k,data[k]])));});
ipcMain.handle('pick-folder',async(event)=>{trusted(event);const result=await dialog.showOpenDialog(mainWindow,{title:'选择音乐文件夹',properties:['openDirectory']});return result.canceled?null:result.filePaths[0];});
ipcMain.handle('window',(event,action)=>{trusted(event);if(action==='minimize')mainWindow.minimize();else if(action==='maximize')mainWindow.isMaximized()?mainWindow.unmaximize():mainWindow.maximize();else if(action==='close')mainWindow.close();else if(action==='quit')app.quit();});
ipcMain.handle('window-state',event=>{trusted(event);return {maximized:mainWindow.isMaximized(),minimized:mainWindow.isMinimized()};});
ipcMain.handle('version',event=>{trusted(event);return app.getVersion();});
ipcMain.handle('open-external',(event,url)=>{trusted(event);if(!allowedExternal(url))throw new Error('无效链接');return shell.openExternal(url);});
ipcMain.handle('platform-window',(event,source,url,play,trackId,track)=>{
  trusted(event);
  if(play===true && (typeof trackId!=='string' || !trackId.startsWith(source+':')))throw new Error('歌曲标识无效');
  const match=source==='migu' && track ? {title:String(track.title||'').slice(0,350),artist:String(track.artist||'').slice(0,350),
    album:String(track.album||'').slice(0,350),duration_ms:Number(track.duration_ms)||0} : null;
  return platformWindows.open(source,url,play===true,trackId,match);
});
ipcMain.handle('platform-control',(event,trackId,resume)=>{trusted(event);return platformWindows.control(trackId,resume===true);});
ipcMain.handle('platform-logout',(event,source)=>{trusted(event);return platformWindows.clear(source);});
ipcMain.handle('platform-track-read',async(event,source,url)=>{
  trusted(event);
  const track=await platformWindows.readTrack(source,url);
  return backend('/api/accounts/'+source+'/browser-track',track);
});
ipcMain.handle('platform-search',async(event,source,query)=>{
  trusted(event);
  const rows=await platformWindows.search(source,query);
  return rows.length?backend('/api/accounts/'+source+'/browser-search',{rows}):{tracks:[]};
});
ipcMain.handle('platform-stop',event=>{trusted(event);platformWindows.stop();});
ipcMain.handle('login',(event,source)=>{trusted(event);return login(source);});
ipcMain.handle('finish-login',(event,source)=>{trusted(event);return syncLogin(source);});
ipcMain.handle('refresh-spotify-session',event=>{trusted(event);return spotifyPlayer().refreshSession();});
ipcMain.handle('cookie-login',(event,source,cookie)=>{trusted(event);if(source!=='spotify')throw new Error('该入口仅接受 Spotify Cookie');return importSpotifyCookie(cookie);});
// Spotify 只用应用内网页播放器。每条命令带上递增序号，后端会丢弃比已提交命令更旧的那条：
// 快速切歌时，晚到的旧播放命令不会盖过新的播放或停止。
let spotifyWanted=false;
function submitSpotifyCommand(endpoint,body,sequence){
  return backend(endpoint,sequence===undefined?body:{...body,sequence}).catch(error=>{if(sequence!==undefined&&sequence!==spotifyPlaySequence)return;mainWindow?.webContents.send('spotify-player-state',{command_error:true,reason:error.message});});
}
function pauseSpotify(sequence){
  const deviceId=inAppSpotify?.deviceId;
  if(deviceId)return submitSpotifyCommand('/api/spotify/control',{action:'pause',device_id:deviceId},sequence);
}
ipcMain.handle('spotify-play',async(event,trackId)=>{
  trusted(event);
  if(!/^[A-Za-z0-9]{22}$/.test(trackId))throw Error('无效的 Spotify 歌曲编号');
  const request=++spotifyPlaySequence;spotifyWanted=true;spotifyPlayer().setMuted(false);
  const player=await spotifyPlayer().ready();
  if(request!==spotifyPlaySequence)return {cancelled:true};
  // 播放命令发出期间如果切到了别的音源，命令完成后再补一次暂停，保证不会和别的音源同时出声。
  submitSpotifyCommand('/api/spotify/play',{track_id:trackId,device_id:player.device_id},request).then(()=>{if(!spotifyWanted)pauseSpotify(spotifyPlaySequence);});
  return {pending:true,confirmed:false,...player,transport:'web'};
});
// 切到其他音源时调用：作废还没发出的播放命令，并暂停网页播放器。
ipcMain.handle('spotify-stop',event=>{
  trusted(event);
  const sequence=++spotifyPlaySequence;spotifyWanted=false;inAppSpotify?.setMuted(true);
  for(const timer of spotifyControlTimers.values())clearTimeout(timer);
  spotifyControlTimers.clear();
  pauseSpotify(sequence);
  return {stopped:true};
});
ipcMain.handle('spotify-state',async event=>{trusted(event);const player=spotifyPlayer();const state=await backend('/api/spotify/state',undefined,'GET');const media=await player.sampleMedia();if(media&&state.device?.id===media.device_id&&media.ready_state>=3&&!media.seeking&&Math.abs((state.duration_ms||0)-media.duration_ms)<1500&&(!media.title||!state.track?.title||media.title.normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase()===state.track.title.normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase()))backend('/api/spotify/player-observation',{device_id:media.device_id,position_ms:media.position_ms,debug_source:media.paused||media.ended?'pause':'progress'}).catch(()=>{});return {...state,owned_device_id:player.deviceId,owned_media_playing:player.playing,owned_license_error:player.licenseError,owned_media_sample:media};});
ipcMain.handle('spotify-queue',(event,trackId)=>{
  trusted(event);
  if(!/^[A-Za-z0-9]{22}$/.test(trackId))throw Error('无效的 Spotify 歌曲编号');
  const player=spotifyPlayer();
  if(!player.deviceId)throw Error('Spotify 应用内播放器尚未就绪');
  submitSpotifyCommand('/api/spotify/queue',{track_id:trackId,device_id:player.deviceId});
  return {pending:true};
});
ipcMain.handle('spotify-control',async(event,action,value)=>{
  trusted(event);
  if(!['pause','resume','next','previous','seek','volume'].includes(action))throw Error('不支持此操作');
  const player=spotifyPlayer();
  if(!player.deviceId)throw Error('Spotify 应用内播放器尚未就绪');
  if(action==='resume'){spotifyWanted=true;player.setMuted(false);}
  const sequence=spotifyPlaySequence;
  const send=()=>{if(sequence===spotifyPlaySequence)submitSpotifyCommand('/api/spotify/control',{action,value,device_id:player.deviceId},sequence);};
  if(['seek','volume'].includes(action)){clearTimeout(spotifyControlTimers.get(action));spotifyControlTimers.set(action,setTimeout(send,120));}else send();
  return {pending:true,confirmed:false};
});
ipcMain.handle('configure-playback-proxy',(event,proxy)=>{trusted(event);if(typeof proxy!=='string'||proxy.length>2000||(proxy&&!['http:','https:','socks5:'].includes(new URL(proxy).protocol)))throw Error('代理地址格式无效');fs.writeFileSync(playbackConfig,JSON.stringify({proxy}));return true;});
ipcMain.handle('oauth-login',async(event)=>{trusted(event);const result=await backend('/api/accounts/spotify/login-url',undefined,'GET');if(!result.url||!result.url.startsWith('https://accounts.spotify.com/'))throw new Error('OAuth 地址无效');await shell.openExternal(result.url);return {opened:true};});
ipcMain.handle('clear-login',async(event,source)=>{trusted(event);if(!['netease','qqmusic','spotify'].includes(source))throw new Error('未知平台');await session.fromPartition('persist:musicplatform-'+source).clearStorageData();if(source==='spotify'){spotifyHeaders={access_token:'',client_token:''};spotifyPlaySequence++;inAppSpotify?.reset();}return true;});
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>showWindow(mainWindow));
  app.whenReady().then(async()=>{try{await startBackend();createWindow();trayAndKeys();session.fromPartition('persist:musicplatform-spotify').cookies.get({name:'sp_dc'}).then(c=>{if(c.some(x=>x.value))return spotifyPlayer().refreshSession().then(()=>backend('/api/spotify/state',undefined,'GET'));}).catch(()=>{});}catch(error){dialog.showErrorBox('Elixir 启动失败',error.message);app.quit();}});
  app.on('window-all-closed',()=>{if(!closing)app.quit();});
  app.on('before-quit',event=>{
    if(closing)return;
    event.preventDefault();closing=true;
    for(const timer of spotifyControlTimers.values())clearTimeout(timer);
    inAppSpotify?.close();platformWindows.close();globalShortcut.unregisterAll();tray?.destroy();lyricWindow?.close();
    for(const win of loginWindows.values())if(!win.isDestroyed())win.close();
    Promise.race([backend('/api/spotify/native/stop').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1500))]).finally(()=>{
      if(service&&!service.killed)service.kill();app.quit();
    });
  });
}
