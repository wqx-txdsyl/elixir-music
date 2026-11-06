// Closing the player keeps its media process alive; only an explicit quit exits.
function retainInBackground(window,{canHide,isQuitting}){
  window.on('close',event=>{
    if(isQuitting()||!canHide())return;
    event.preventDefault();window.hide();
  });
}
function showWindow(window){
  if(!window||window.isDestroyed())return;
  if(window.isMinimized())window.restore();
  window.show();window.focus();
}
module.exports={retainInBackground,showWindow};
