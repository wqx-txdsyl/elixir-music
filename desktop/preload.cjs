const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  login: source => ipcRenderer.invoke('login', source),
  finishLogin: source => ipcRenderer.invoke('finish-login', source),
  refreshSpotifySession: () => ipcRenderer.invoke('refresh-spotify-session'),
  cookieLogin: (source, cookie) => ipcRenderer.invoke('cookie-login', source, cookie),
  onAccountsUpdated: callback => {const handler=(_event,source)=>callback(source);ipcRenderer.on('accounts-updated',handler);return ()=>ipcRenderer.removeListener('accounts-updated',handler);},
  spotifyPlay: trackId => ipcRenderer.invoke('spotify-play',trackId),
  spotifyControl: (action,value) => ipcRenderer.invoke('spotify-control',action,value),
  spotifyState: () => ipcRenderer.invoke('spotify-state'),
  spotifyQueue: trackId => ipcRenderer.invoke('spotify-queue',trackId),
  configurePlaybackProxy: proxy => ipcRenderer.invoke('configure-playback-proxy',proxy),
  onSpotifyState: callback => {const handler=(_event,state)=>callback(state);ipcRenderer.on('spotify-player-state',handler);return ()=>ipcRenderer.removeListener('spotify-player-state',handler);},
  oauthLogin: () => ipcRenderer.invoke('oauth-login'),
  clearLogin: source => ipcRenderer.invoke('clear-login', source),
  window: action => ipcRenderer.invoke('window', action),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  getVersion: () => ipcRenderer.invoke('version')
  ,getWindowState: () => ipcRenderer.invoke('window-state')
  ,onWindowState: callback => { const handler=(_event,state)=>callback(state);ipcRenderer.on('window-state-changed',handler);return ()=>ipcRenderer.removeListener('window-state-changed',handler); }
  ,openLyrics: () => ipcRenderer.invoke('lyrics-open')
  ,closeLyrics: () => ipcRenderer.invoke('lyrics-close')
  ,getLyricsPreferences: () => ipcRenderer.invoke('lyrics-preferences-get')
  ,setLyricsPreferences: value => ipcRenderer.invoke('lyrics-preferences-set',value)
  ,updateLyrics: data => ipcRenderer.invoke('lyrics-update',data)
  ,onLyrics: callback => { const handler=(_event,data)=>callback(data);ipcRenderer.on('lyrics-data',handler);ipcRenderer.invoke('lyrics-ready');return ()=>ipcRenderer.removeListener('lyrics-data',handler); }
  ,onLyricsPreferences: callback => { const handler=(_event,value)=>callback(value);ipcRenderer.on('lyrics-preferences',handler);return ()=>ipcRenderer.removeListener('lyrics-preferences',handler); }
  ,setLyricsMousePassThrough: passThrough => ipcRenderer.invoke('lyrics-mouse',passThrough)
  ,moveLyrics: bounds => ipcRenderer.invoke('lyrics-move',bounds)
  ,onLyricsClosed: callback => { const handler=()=>callback();ipcRenderer.on('lyrics-closed',handler);return ()=>ipcRenderer.removeListener('lyrics-closed',handler); }
  ,onPlayerAction: callback => { const handler=(_event,action)=>callback(action);ipcRenderer.on('player-action',handler);return ()=>ipcRenderer.removeListener('player-action',handler); }
});
