// 跨平台合并测试：node frontend/src/search-merge.test.mjs
import assert from 'node:assert/strict';
import {mergeSearchResults,sameSong,normalizeText} from './search-merge.mjs';

const t=(source,i,title,artist,sec,extra={})=>({id:source+':'+i,source,title,artist,duration_ms:sec*1000,...extra});

// 归一化：全角、大小写、空格与常见标点
assert.equal(normalizeText('晴天（Live）'),normalizeText('晴天 (live)'));
assert.equal(normalizeText('Love Story'),normalizeText('love  story'));
assert.notEqual(normalizeText('晴天'),normalizeText('晴天 (Live)'));

// 同一首歌：歌名相同、歌手有交集、时长接近
assert.ok(sameSong(t('qqmusic',1,'晴天','周杰伦',269),t('netease',1,'晴天','周杰伦',270)));
assert.ok(sameSong(t('qqmusic',1,'稻香','周杰伦',223),t('netease',1,'稻香','周杰伦 / 宋健彰',224)));
// 不同版本、不同歌手、时长差太多、未知歌手、同平台：都不合并
assert.ok(!sameSong(t('qqmusic',1,'晴天','周杰伦',269),t('netease',1,'晴天 (Live)','周杰伦',312)));
assert.ok(!sameSong(t('qqmusic',1,'晴天','周杰伦',269),t('netease',1,'晴天','刘瑞琦',281)));
assert.ok(!sameSong(t('qqmusic',1,'晴天','周杰伦',269),t('netease',1,'晴天','周杰伦',312)));
assert.ok(!sameSong(t('local',1,'晴天','未知歌手',269),t('netease',1,'晴天','未知歌手',269)));
assert.ok(!sameSong(t('qqmusic',1,'晴天','周杰伦',269),t('qqmusic',2,'晴天','周杰伦',269)));
// 一边没有时长时只看歌名和歌手
assert.ok(sameSong(t('qqmusic',1,'七里香','周杰伦',0),t('netease',1,'七里香','周杰伦',299)));

// 合并：按名次交错，同名次按平台优先级；每组每个平台最多一首
{
  const qq=[t('qqmusic',0,'晴天','周杰伦',269),t('qqmusic',1,'七里香','周杰伦',299),t('qqmusic',2,'晴天 (Live)','周杰伦',312)];
  const ne=[t('netease',0,'晴天','周杰伦',270),t('netease',1,'晴天','刘瑞琦',281),t('netease',2,'七里香','周杰伦',300)];
  const bd=[t('bodian',0,'晴天','周杰伦',269,{availability:'unavailable'})];
  const merged=mergeSearchResults([{source:'qqmusic',tracks:qq},{source:'netease',tracks:ne},{source:'bodian',tracks:bd}]);
  assert.deepEqual(merged.map(x=>x.id),['qqmusic:0','qqmusic:1','netease:1','qqmusic:2']);
  assert.deepEqual(merged[0].alternatives.map(x=>x.id),['netease:0','bodian:0']);
  assert.deepEqual(merged[1].alternatives.map(x=>x.id),['netease:2']);
  assert.equal(merged[2].alternatives,undefined);
  assert.equal(merged.length+merged.reduce((n,x)=>n+(x.alternatives?.length||0),0),7);
}

// 排在前面的那首放不了时，换成能放的当主行
{
  const merged=mergeSearchResults([{source:'qqmusic',tracks:[t('qqmusic',0,'夜曲','周杰伦',226,{availability:'unavailable'})]},{source:'netease',tracks:[t('netease',0,'夜曲','周杰伦',226)]}]);
  assert.equal(merged.length,1);assert.equal(merged[0].id,'netease:0');assert.deepEqual(merged[0].alternatives.map(x=>x.id),['qqmusic:0']);
}

// 本地曲库优先；重复的 id 只保留一次；旧的 alternatives 不会层层嵌套
{
  const local=t('local',0,'晴天','周杰伦',269);
  const online=t('netease',0,'晴天','周杰伦',269,{alternatives:[t('qqmusic',9,'x','y',1)]});
  const merged=mergeSearchResults([{source:'local',tracks:[local,local]},{source:'netease',tracks:[online]}]);
  assert.equal(merged.length,1);assert.equal(merged[0].id,'local:0');
  assert.deepEqual(merged[0].alternatives.map(x=>x.id),['netease:0']);assert.equal(merged[0].alternatives[0].alternatives,undefined);
}
console.log('search-merge: all passed');
