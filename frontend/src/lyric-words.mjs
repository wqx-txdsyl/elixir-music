// NetEase "yrc": [lineStartMs,lineDurMs](wordStartMs,wordDurMs,0)word... Metadata lines are JSON and skipped.
export function parseWordLyrics(text=''){
  const lines=[];
  for(const raw of String(text||'').split('\n')){
    const head=raw.match(/^\[(\d+),(\d+)\]/);if(!head)continue;
    const words=[...raw.slice(head[0].length).matchAll(/\((\d+),(\d+),\d+\)([^(]*)/g)].map(m=>({time:Number(m[1])/1000,duration:Math.max(.01,Number(m[2])/1000),text:m[3].replace(/\r$/,'')})).filter(word=>word.text);
    if(words.length)lines.push({time:Number(head[1])/1000,duration:Number(head[2])/1000,text:words.map(word=>word.text).join(''),words});
  }
  return lines.sort((a,b)=>a.time-b.time);
}
// Share of the line's characters already sung, so the sweep follows uneven word timing.
export function wordProgress(words,position){
  let total=0,done=0;
  for(const word of words){
    const length=word.length??[...word.text].length;total+=length;
    if(position>=word.time+word.duration)done+=length;else if(position>word.time)done+=length*(position-word.time)/word.duration;
  }
  return total?Math.min(1,done/total):0;
}
