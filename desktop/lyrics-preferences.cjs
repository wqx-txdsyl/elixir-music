const fs=require('node:fs');
// opacity is the resting panel alpha; 0 keeps the window fully transparent until hovered.
const defaults={foreground:'#b8e2ae',highlight:'#ffd166',background:'#1b2228',opacity:0,fontSize:28,locked:false};
function normalizeLyricsPreferences(value={}){
  const color=(x,fallback)=>typeof x==='string'&&/^#[0-9a-f]{6}$/i.test(x)?x:fallback;
  const result={foreground:color(value.foreground,defaults.foreground),highlight:color(value.highlight,defaults.highlight),background:color(value.background,defaults.background),opacity:Number.isFinite(value.opacity)?Math.max(0,Math.min(.9,Math.round(value.opacity*100)/100)):defaults.opacity,fontSize:Number.isFinite(value.fontSize)?Math.max(18,Math.min(56,Math.round(value.fontSize))):defaults.fontSize,locked:value.locked===true};
  const b=value.bounds;if(b&&['x','y','width','height'].every(k=>Number.isFinite(b[k])))result.bounds={x:Math.max(-30000,Math.min(30000,Math.round(b.x))),y:Math.max(-30000,Math.min(30000,Math.round(b.y))),width:Math.max(420,Math.min(1800,Math.round(b.width))),height:Math.max(80,Math.min(700,Math.round(b.height)))};
  return result;
}
// Transparent windows cannot be resized natively on Windows, so height follows the font size.
function lyricsWindowHeight(fontSize){return Math.round(52+fontSize*1.4+Math.max(14,fontSize*.5)*1.5);}
// Timing lets the lyrics window animate the current line itself instead of receiving every tick.
function normalizeLyricData(value={}){
  const number=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
  const result=Object.fromEntries(['title','line','next'].map(k=>[k,String(value[k]||'').slice(0,2000)]));
  const start=number(value.start),end=number(value.end);
  // Optional word timing for the current line: [start seconds, duration seconds, character count].
  const words=Array.isArray(value.words)?value.words.slice(0,300).filter(w=>Array.isArray(w)&&w.length===3&&w.every(n=>typeof n==='number'&&Number.isFinite(n))&&w[1]>0&&w[2]>0).map(([t,d,l])=>[t,d,Math.min(200,Math.round(l))]):[];
  return {...result,start:start!==null&&end!==null&&end>start?start:null,end:start!==null&&end!==null&&end>start?end:null,words:words.length?words:null,position:number(value.position)??0,rate:number(value.rate)>0&&value.rate<=4?value.rate:1,playing:value.playing===true,at:number(value.at)??Date.now()};
}
function readLyricsPreferences(file){try{return normalizeLyricsPreferences(JSON.parse(fs.readFileSync(file,'utf8')));}catch{return {...defaults};}}
function saveLyricsPreferences(file,value){const result=normalizeLyricsPreferences(value);fs.writeFileSync(file+'.tmp',JSON.stringify(result));fs.renameSync(file+'.tmp',file);return result;}
module.exports={normalizeLyricsPreferences,readLyricsPreferences,saveLyricsPreferences,lyricsWindowHeight,normalizeLyricData};
