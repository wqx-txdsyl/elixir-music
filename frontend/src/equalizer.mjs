export const frequencies=[60,150,400,1000,2400,15000];
// Elixir curves, not a claim to reproduce a proprietary DSP.
export const presets={
 '原始音效':[0,0,0,0,0,0],'原声':[4,3,1,2,3,3],'低音增强':[6,4,2,0,0,0],'低音减弱':[-6,-4,-2,0,0,0],
 '古典':[4,3,-2,-1,2,4],'舞曲':[5,4,0,2,3,2],'深沉':[5,3,1,-1,-2,-3],'电子':[5,3,0,-2,3,4],
 '嘻哈':[5,4,1,2,1,3],'爵士':[4,2,-1,1,2,4],'拉丁':[3,2,0,0,2,3],'响度':[5,2,-2,-1,2,5],
 '休闲':[1,3,3,1,0,-2],'钢琴':[0,1,2,3,2,3],'流行':[-1,2,4,4,2,-1],'节奏布鲁斯':[3,5,0,-1,2,3],
 '摇滚':[5,3,-2,-2,3,5],'小型扬声器':[4,3,2,1,-1,-2],'人声':[-3,-2,1,4,3,0],
 '高音增强':[0,0,0,2,4,6],'高音减弱':[0,0,0,-2,-4,-6],'口语':[-3,-2,1,4,3,0],'柔和':[2,1,0,-1,-2,-4],
};
export function equalizerConfig(raw={}){
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));let gains=Array.isArray(raw.gains)?raw.gains:[];
 if(gains.length===10){const old=[31,62,125,250,500,1000,2000,4000,8000,16000];gains=frequencies.map(f=>{const hi=old.findIndex(v=>v>=f);if(hi<1)return gains[Math.max(0,hi)];const lo=hi-1,t=Math.log(f/old[lo])/Math.log(old[hi]/old[lo]);return Math.round((Number(gains[lo])||0)*(1-t)+(Number(gains[hi])||0)*t);});}
 return {enabled:raw.enabled===true,gains:frequencies.map((_,i)=>clamp(gains[i],-12,12)),preamp:clamp(raw.preamp,-18,6)};
}
