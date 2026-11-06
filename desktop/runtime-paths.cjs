const fs=require('node:fs');

// Chromium's CDM host verification compares the reported executable/CDM paths
// with the loaded modules. Keep both on the actual filesystem paths when the
// installation is reached through a Windows directory junction.
function canonicalRuntimeExecutable(app){
  const executable=fs.realpathSync.native(app.getPath('exe'));
  app.setPath('exe',executable);
  return executable;
}

function canonicalDataDirectory(directory){
  fs.mkdirSync(directory,{recursive:true});
  return fs.realpathSync.native(directory);
}

module.exports={canonicalRuntimeExecutable,canonicalDataDirectory};
