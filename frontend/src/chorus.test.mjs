// 副歌检测测试：node frontend/src/chorus.test.mjs
import assert from 'node:assert/strict';
import {detectChorus,normalizeLine} from './chorus.mjs';

// 按顺序给每行排上时间，每行 4 秒。
const timed=(texts,start=10,step=4)=>texts.map((text,i)=>({time:start+i*step,text}));
const verse1=['清晨的街道还没有醒来','路灯一盏一盏慢慢熄灭','我把昨天折好放进口袋','沿着河岸走到很远的地方'];
const verse2=['午后的风吹过旧的站台','列车带走一些没说的话','我在窗边数着经过的云','等一封不会再来的信'];
const chorus=['唱吧 让声音飞过山岗','唱吧 让心跳追上月光','就算明天下着大雨','我也会在这里歌唱'];

// 典型流行歌：主歌 1 → 副歌 → 主歌 2 → 副歌 → 副歌
{
  const lines=timed([...verse1,...chorus,...verse2,...chorus,...chorus]);
  const r=detectChorus(lines,240);
  assert.ok(r,'应检测到副歌');
  assert.equal(r.start,10+4*4,'副歌起点应是第一次出现的位置');
  assert.equal(r.length,4);
  assert.equal(r.count,3);
  assert.equal(r.end,r.start+16);
}

// 副歌个别字有出入、标点和空格不同，仍算同一段。
{
  const variant=['唱吧，让声音飞过山岗！','唱吧 让心跳追上月光','就算明天下着小雨','我也会在这里歌唱'];
  const r=detectChorus(timed([...verse1,...chorus,...verse2,...variant]),200);
  assert.ok(r);
  assert.equal(r.start,26);
}

// 带制作信息开头：不影响结果。
{
  const lines=[{time:0,text:'作词：某人'},{time:1,text:'作曲：某人'},...timed([...verse1,...chorus,...verse2,...chorus])];
  const r=detectChorus(lines,200);
  assert.equal(r?.start,26);
}

// 带翻译行（同一时间戳的第二行）：只看原文。
{
  const base=timed([...verse1,...chorus,...verse2,...chorus]);
  const lines=base.flatMap((l,i)=>[l,{time:l.time,text:'translation line '+i}]);
  const r=detectChorus(lines,200);
  assert.equal(r?.start,26);
}

// 逐字歌词：没有 text 字段，从 words 拼出来。
{
  const lines=timed([...verse1,...chorus,...verse2,...chorus]).map(l=>({time:l.time,words:[...l.text].map(ch=>({text:ch}))}));
  assert.equal(detectChorus(lines,200)?.start,26);
}

// 导歌 + 副歌整段重复两次，结尾只重复副歌：起点应落在副歌而不是导歌。
{
  const pre=['走过熟悉的转角','听见远处的钟声'];
  const r=detectChorus(timed([...verse1,...pre,...chorus,...verse2,...pre,...chorus,'间奏过后',...chorus]),300);
  assert.equal(r?.start,10+6*4);
  assert.equal(r.count,3);
}

// 没有重复：不显示。
assert.equal(detectChorus(timed([...verse1,...verse2,...chorus]),200),null);
// 空歌词、纯音乐提示：不显示。
assert.equal(detectChorus([],200),null);
assert.equal(detectChorus(null,200),null);
assert.equal(detectChorus([{time:0,text:'纯音乐，请欣赏'}],200),null);
// 副歌起点超出时长：不显示。
assert.equal(detectChorus(timed([...verse1,...chorus,...verse2,...chorus]),20),null);

assert.equal(normalizeLine(' Hello, World！ '),'helloworld');
console.log('chorus tests ok');
