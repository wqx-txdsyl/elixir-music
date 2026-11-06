// Spotify audio is decoded in an owned, sandboxed webContents inside this app.
// No external browser or Spotify desktop process is used.
const {BrowserWindow,session,components,Menu}=require('electron');

function spotifyRequest(details){
  try{const u=new URL(details.url);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(u.hostname==='spotify.com'||u.hostname.endsWith('.spotify.com'))?u:null;}catch{return null;}
}
function mediaPermission(permission,url){return permission==='mediaKeySystem'&&!!spotifyRequest({url});}
function uploadJson(details){
  try{return JSON.parse(Buffer.concat((details.uploadData || []).filter(x=>x.bytes).map(x=>Buffer.from(x.bytes))).toString('utf8'));}catch{return null;}
}
function registration(details){
  const url=spotifyRequest(details);if(!url||!(/^[a-z0-9-]+-spclient\.spotify\.com$/.test(url.hostname)||url.hostname==='spclient.wg.spotify.com')||url.pathname!=='/track-playback/v1/devices'||details.method!=='POST')return null;
  const id=uploadJson(details)?.device?.device_id;
  return typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id)&&!id.startsWith('hobs_')?id:null;
}
function observation(details,deviceId){
  const url=spotifyRequest(details),match=url?.pathname.match(/^\/track-playback\/v1\/devices\/([^/]+)\/state$/);
  if(!match||!(/^[a-z0-9-]+-spclient\.spotify\.com$/.test(url.hostname)||url.hostname==='spclient.wg.spotify.com')||details.method!=='PUT'||match[1]!==deviceId)return null;
  const data=uploadJson(details),position=Number(data?.sub_state?.position);
  if(!data||!Number.isFinite(position)||position<0||position>86400000||typeof data.debug_source!=='string')return null;
  return {device_id:deviceId,position_ms:Math.round(position),debug_source:data.debug_source};
}

class SpotifyPlayer{
  constructor({parent,getProxy,onSession,onObservation,onState}){
    Object.assign(this,{parent,getProxy,onSession,onObservation,onState});
    this.win=null;this.deviceId='';this.deviceCandidate=null;this.token='';this.clientToken='';
    this.syncedToken='';this.profile=null;this.pending=null;this.syncing=null;this.retrySyncAfter=0;
    this.closing=false;this.installedHooks=false;
    this.playing=false;this.refreshing=null;this.tokenGeneration=0;
    this.initializing=null;this.componentsReady=null;
    this.licenseError=false;
  }
  async prepareAudio(){
    if(!components)throw Error('当前应用运行时未包含 Spotify 音频组件，请安装支持应用内播放的版本');
    if(!this.componentsReady)this.componentsReady=(async()=>{
      let timeout;
      try{await Promise.race([components.whenReady(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Spotify音频组件准备超时，请检查应用网络设置后重试')),90000);})]);}
      finally{clearTimeout(timeout);}
    })().catch(error=>{this.componentsReady=null;throw error;});
    return this.componentsReady;
  }
  async initialize(){
    if(this.initializing)return this.initializing;
    this.initializing=this.createPlayerWindow().finally(()=>{this.initializing=null;});
    return this.initializing;
  }
  async createPlayerWindow(){
    if(this.win&&!this.win.isDestroyed())return;
    // ECS requires the CDM to be installed before creating the media window,
    // including windows first opened by login rather than by a play command.
    await this.prepareAudio();
    const ownSession=session.fromPartition('persist:musicplatform-spotify');
    const proxy=await this.getProxy();
    await ownSession.setProxy(proxy?{proxyRules:proxy}:{mode:'system'});
    const userAgent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/'+process.versions.chrome+' Safari/537.36';
    ownSession.setUserAgent(userAgent);
    if(!this.installedHooks){
      this.installedHooks=true;
      ownSession.webRequest.onBeforeRequest({urls:['https://*.spotify.com/*']},(details,callback)=>{
        const id=registration(details);if(id)this.deviceCandidate={id,requestId:details.id};
        const report=observation(details,this.deviceId);callback({cancel:false});
        if(report)this.onObservation(report).catch(()=>{});
      });
      ownSession.webRequest.onCompleted({urls:['https://*.spotify.com/*']},details=>{
        if(this.deviceCandidate?.requestId===details.id&&details.statusCode>=200&&details.statusCode<300){this.deviceId=this.deviceCandidate.id;this.onState?.({ready:true,device_id:this.deviceId});}
        const url=spotifyRequest(details);
        if(url?.pathname==='/widevine-license/v1/audio/license'){
          this.licenseError=details.statusCode>=400;
          this.onState?.({license_error:this.licenseError,license_ready:!this.licenseError,status:details.statusCode});
        }
      });
      ownSession.webRequest.onBeforeSendHeaders({urls:['https://*.spotify.com/*']},(details,callback)=>{
        if(spotifyRequest(details))for(const [name,value] of Object.entries(details.requestHeaders)){
          if(name.toLowerCase()==='authorization'&&typeof value==='string'&&value.startsWith('Bearer ')){this.token=value.slice(7);this.tokenGeneration++;}
          if(name.toLowerCase()==='client-token'&&typeof value==='string')this.clientToken=value;
        }
        callback({requestHeaders:details.requestHeaders});
        if(this.token&&this.token!==this.syncedToken&&!this.syncing&&Date.now()>this.retrySyncAfter){clearTimeout(this.syncTimer);this.syncTimer=setTimeout(()=>this.sync().catch(()=>{}),500);}
      });
      ownSession.setPermissionRequestHandler((wc,permission,callback,details)=>callback(mediaPermission(permission,details?.requestingUrl || wc?.getURL())));
      ownSession.setPermissionCheckHandler((wc,permission,origin)=>mediaPermission(permission,origin || wc?.getURL()));
    }
    this.win=new BrowserWindow({width:1080,height:760,minWidth:680,minHeight:560,show:false,parent:this.parent(),title:'Elixir · Spotify 登录',autoHideMenuBar:false,
      webPreferences:{partition:'persist:musicplatform-spotify',nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});
    this.win.webContents.setUserAgent(userAgent);
    this.win.setMenu(Menu.buildFromTemplate([{label:'完成登录，返回 Elixir',click:()=>this.sync().then(()=>this.win?.hide()).catch(e=>this.onState?.({reason:e.message}))},{label:'重新加载',click:()=>this.load()},{label:'返回 Elixir',click:()=>this.win?.hide()}]));
    this.win.webContents.setWindowOpenHandler(({url})=>{if(spotifyRequest({url}))this.win?.loadURL(url).catch(()=>{});return {action:'deny'};});
    this.win.webContents.on('will-navigate',(event,url)=>{if(!spotifyRequest({url}))event.preventDefault();});
    this.win.webContents.on('media-started-playing',()=>{this.playing=true;this.onState?.({media_started:true});});
    this.win.webContents.on('media-paused',()=>{this.playing=false;this.onState?.({media_paused:true});});
    this.win.webContents.on('did-fail-load',(_event,code,_description,url,isMain)=>{if(isMain&&code!==-3)this.onState?.({load_error:code,host:spotifyRequest({url})?.hostname || ''});});
    this.win.webContents.on('did-finish-load',()=>this.onState?.({page_loaded:true}));
    this.win.webContents.on('dom-ready',()=>this.trackMedia().catch(()=>{}));
    this.win.webContents.on('did-frame-finish-load',()=>this.trackMedia().catch(()=>{}));
    this.win.on('close',event=>{if(!this.closing){event.preventDefault();this.win.hide();}});
    this.win.on('closed',()=>{this.win=null;this.deviceId='';this.token='';this.syncedToken='';this.profile=null;this.playing=false;});
    this.load();
  }
  async load(){
    try{await this.win?.loadURL('https://open.spotify.com/');}
    catch(error){this.onState?.({load_error:Number(error.errno)||-1,reason:'Spotify 页面加载失败，请检查应用网络设置后重新加载'});}
  }
  async sync(){
    if(this.syncing)return this.syncing;
    if(this.profile?.logged_in&&this.token&&this.token===this.syncedToken)return this.profile;
    this.syncing=(async()=>{
      if(!this.token)throw Error('请等待 Spotify 官方登录页面加载');
      const cookies=await session.fromPartition('persist:musicplatform-spotify').cookies.get({});
      const own=cookies.filter(c=>spotifyRequest({url:'https://'+c.domain.replace(/^\./,'')}));
      if(!own.some(c=>c.name==='sp_dc'&&c.value))throw Error('请先在应用内完成 Spotify 登录');
      const token=this.token,cookie=[...new Map(own.map(c=>[c.name,c.value])).entries()].map(([k,v])=>k+'='+v).join('; ');
      try{
        this.profile=await this.onSession({access_token:token,client_token:this.clientToken,cookie});this.syncedToken=token;this.retrySyncAfter=0;return this.profile;
      }catch(e){this.retrySyncAfter=Date.now()+60000;throw e;}
    })().finally(()=>{this.syncing=null;});return this.syncing;
  }
  async login(){await this.initialize();this.win.show();this.win.focus();return this.profile?.logged_in?this.profile:{opened:true};}
  async refreshSession(){
    if(this.refreshing)return this.refreshing;
    this.refreshing=(async()=>{
      const cookies=await session.fromPartition('persist:musicplatform-spotify').cookies.get({name:'sp_dc'});
      if(!cookies.some(c=>c.value&&spotifyRequest({url:'https://'+c.domain.replace(/^\./,'')})))throw Error('请先在应用内连接 Spotify 账号');
      const existing=!!this.win&&!this.win.isDestroyed(),previous=this.tokenGeneration;
      if(this.playing){
        const previousToken=this.token;
        for(let i=0;i<100;i++){
          if(this.token&&this.token!==previousToken)return this.sync();
          await new Promise(resolve=>setTimeout(resolve,200));
        }
        throw Error('Spotify 会话续期暂未完成，音乐播放保持不变，请稍后重试');
      }
      await this.initialize();
      if(existing)await this.load();
      for(let i=0;i<100;i++){
        if(this.token&&this.tokenGeneration>previous)return this.sync();
        await new Promise(resolve=>setTimeout(resolve,200));
      }
      throw Error('Spotify 会话暂未刷新，请检查网络或重新连接账号');
    })().finally(()=>{this.refreshing=null;});return this.refreshing;
  }
  async ready(){
    if(this.pending)return this.pending;
    this.pending=(async()=>{
      await this.initialize();
      for(let attempt=0;attempt<120;attempt++){
        if(this.deviceId&&this.token){await this.sync();return {device_id:this.deviceId,playback_mode:'in-app',external_player:false};}
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      this.win.show();throw Error('Spotify 应用内播放器尚未就绪，请在弹出的应用内窗口确认登录状态');
    })().finally(()=>{this.pending=null;});return this.pending;
  }
  mediaFrames(){
    if(!this.win||this.win.isDestroyed()||!spotifyRequest({url:this.win.webContents.getURL()}))return [];
    const contents=this.win.webContents,frames=contents.mainFrame?.framesInSubtree;
    return frames?frames.filter(frame=>!frame.isDestroyed?.()&&spotifyRequest({url:frame.url||frame.origin})):[contents];
  }
  async trackMedia(){
    // Spotify can keep its Audio element detached from the DOM. Register only
    // the element whose standard play() is called; never intercept audio data.
    const script=`(()=>{const key=Symbol.for('elixir.media.elements');if(window[key])return;const elements=new Set();Object.defineProperty(window,key,{value:elements});const original=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){elements.add(this);while(elements.size>32)elements.delete(elements.values().next().value);return Reflect.apply(original,this,args);};})()`;
    await Promise.allSettled(this.mediaFrames().map(frame=>frame.executeJavaScript(script)));
  }
  async sampleMedia(){
    if(!this.deviceId)return null;
    try{
      // Read actual media properties only, including detached Audio elements.
      // No URLs, encrypted bytes, cookies, DOM text or authorization cross IPC.
      const script=`(()=>{const all=[...new Set([...document.querySelectorAll('audio,video'),...(window[Symbol.for('elixir.media.elements')]||[])])].filter(x=>x.readyState>=2);const active=all.filter(x=>!x.paused&&!x.ended);if(active.length>1)return null;const media=active[0]||(all.length===1?all[0]:null);if(!media||!Number.isFinite(media.currentTime)||!Number.isFinite(media.duration)||media.duration<=0)return null;return {position_ms:Math.round(media.currentTime*1000),duration_ms:Math.round(media.duration*1000),paused:media.paused,ended:media.ended,seeking:media.seeking,ready_state:media.readyState,rate:media.playbackRate,observed_at:Date.now(),title:String(navigator.mediaSession?.metadata?.title||'').slice(0,500),artist:String(navigator.mediaSession?.metadata?.artist||'').slice(0,500)};})()`;
      const results=await Promise.allSettled(this.mediaFrames().map(frame=>frame.executeJavaScript(script)));
      const samples=results.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value);
      const active=samples.filter(s=>!s.paused&&!s.ended);
      const sample=active.length===1?active[0]:active.length===0&&samples.length===1?samples[0]:null;
      if(!sample||!Number.isFinite(sample.position_ms)||sample.position_ms<0||!Number.isFinite(sample.duration_ms)||sample.duration_ms<=0||sample.duration_ms>86400000||sample.position_ms>sample.duration_ms+2000)return null;
      return Object.fromEntries([...['position_ms','duration_ms','paused','ended','seeking','ready_state','rate','observed_at','title','artist'].map(key=>[key,sample[key]]),['device_id',this.deviceId]]);
    }catch{return null;}
  }

  reset(){clearTimeout(this.syncTimer);this.closing=true;this.win?.destroy();this.win=null;this.deviceId='';this.token='';this.syncedToken='';this.profile=null;this.playing=false;this.licenseError=false;this.closing=false;}
  close(){clearTimeout(this.syncTimer);this.closing=true;this.win?.destroy();}
}
module.exports={SpotifyPlayer,spotifyRequest,registration,observation,mediaPermission};
