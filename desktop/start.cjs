const {spawn}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const runtime=fs.realpathSync.native(path.join(root,'.cache/ecs-44.1.0/runtime/electron.exe'));
if(!fs.existsSync(runtime))throw Error('Run npm run prepare:playback before starting Elixir');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(runtime,[root],{cwd:root,env,stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code || 0;});
