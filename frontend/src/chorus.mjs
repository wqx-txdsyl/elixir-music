// 基于时间轴歌词的副歌检测：找重复出现最多、覆盖最广的连续多行片段，取它第一次完整出现的位置。
// 输入是 parseLrc / parseWordLyrics 的结果 [{time,text,duration?}]，输出 {start,end,index,length,count} 或 null。

const CREDIT=/^(作词|作曲|编曲|词|曲|填词|制作|制作人|监制|出品|发行|混音|母带|录音|和声|配唱|吉他|贝斯|鼓|键盘|弦乐|钢琴|企划|统筹|op|sp|isrc|lyrics?|lyricist|composer|compose[dr]?|arrange[dr]?|arrangement|producer|produced by|written by|music|vocals?)\s*(by)?\s*[:：]/i;
const PURE=/纯音乐|请欣赏|instrumental|no lyrics|暂无歌词|此歌曲为没有填词的纯音乐/i;

// 规范化：全半角统一、小写、去掉空白和标点符号，只留文字本身。
export const normalizeLine=text=>String(text||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');

const bigrams=s=>{const a=[...s],out=new Map();for(let i=0;i<a.length-1;i++){const k=a[i]+a[i+1];out.set(k,(out.get(k)||0)+1);}return out;};
// 相同或高度相似（个别字不同的重复段落）都算同一行。
function similar(a,b,ga,gb){
  if(a===b)return true;
  if(Math.min(a.length,b.length)<4||Math.abs(a.length-b.length)>Math.max(a.length,b.length)*.3)return false;
  let hit=0,total=0;for(const [k,n] of ga){total+=n;hit+=Math.min(n,gb.get(k)||0);}for(const n of gb.values())total+=n;
  return 2*hit/total>=.7;
}

// 去掉制作信息、纯音乐提示和空行；同一时间戳的多行（原文 + 翻译）只保留第一行。
export function chorusLines(lines){
  const out=[];
  for(const line of lines||[]){
    const time=Number(line?.time),raw=String(line?.text??line?.words?.map(w=>w.text).join('')??'').trim();
    if(!Number.isFinite(time)||!raw||raw==='♪'||CREDIT.test(raw)||PURE.test(raw))continue;
    const key=normalizeLine(raw);if(!key)continue;
    const prev=out[out.length-1];
    if(prev&&Math.abs(prev.time-time)<.05)continue;
    out.push({time,duration:Number(line.duration)||0,key});
  }
  return out;
}

export function detectChorus(lines,duration=0){
  const rows=chorusLines(lines),n=rows.length;
  if(n<6)return null;
  const grams=rows.map(r=>bigrams(r.key)),eq=rows.map(()=>new Uint8Array(n));
  for(let a=0;a<n;a++)for(let b=a;b<n;b++)eq[a][b]=eq[b][a]=a===b||similar(rows[a].key,rows[b].key,grams[a],grams[b])?1:0;
  // run[a][b]：从 a、b 两行开始能连续对上的行数。
  const run=rows.map(()=>new Uint16Array(n+1));
  for(let a=n-1;a>=0;a--)for(let b=n-1;b>=0;b--)if(a!==b&&eq[a][b])run[a][b]=1+(a+1<n&&b+1<n?run[a+1][b+1]:0);
  // 片段 (i,len) 在全曲中互不重叠的出现位置。
  const places=(i,len)=>{const out=[];for(let j=0;j+len<=n;j++)if((j===i||run[i][j]>=len)&&(!out.length||j>=out[out.length-1]+len))out.push(j);return out;};
  const span=(i,len)=>{const last=rows[i+len-1],next=rows[i+len];return (next?next.time:last.time+(last.duration||4))-rows[i].time;};
  let best=null;
  for(let i=0;i<n-1;i++){
    let max=0;for(let j=0;j<n;j++)if(j!==i&&run[i][j]>max)max=run[i][j];
    for(let len=2;len<=Math.min(max,16);len++){
      const at=places(i,len);if(at.length<2||at[0]!==i||len*at.length<6||span(i,len)<6)continue;
      const score=len*at.length;
      if(!best||score>best.score||score===best.score&&(at.length>best.at.length||at.length===best.at.length&&len>best.len))best={i,len,at,score};
    }
  }
  if(!best)return null;
  // 导歌 + 副歌整段重复时，从段首往后找第一处「比整段重复得更多」的几行（段内反复的副歌、结尾单独反复的副歌），
  // 起点收到那里；段首本身就是这样的几行时保持不动。
  trim:for(let k=0;k<=best.len-3;k++)for(let sub=best.len-k;sub>=3;sub--){
    const at=places(best.i+k,sub);
    if(at[0]===best.i+k&&at.length>best.at.length&&span(at[0],sub)>=6){if(k)best={i:at[0],len:sub,at,score:sub*at.length};break trim;}
  }
  const start=rows[best.i].time,end=start+span(best.i,best.len);
  if(duration&&(start<=0||start>=duration))return null;
  return {start,end:duration?Math.min(end,duration):end,index:best.i,length:best.len,count:best.at.length};
}
