const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
export function orderTracks(items,key='original',descending=false){
  if(key==='original')return items;
  return items.map((track,index)=>({track,index})).sort((a,b)=>{
    const value=['duration','play_count','listened_ms'].includes(key)?(Number(a.track[key==='duration'?'duration_ms':key])||0)-(Number(b.track[key==='duration'?'duration_ms':key])||0):collator.compare(String(a.track[key]||''),String(b.track[key]||''));
    return (descending?-value:value)||a.index-b.index;
  }).map(row=>row.track);
}
// In-list search: every space-separated word must appear in the title, artist(s) or album (case- and width-insensitive).
const fold=value=>String(value||'').normalize('NFKC').toLocaleLowerCase();
export function filterTracks(items,query=''){
  const words=fold(query).split(/\s+/).filter(Boolean);
  if(!words.length)return items;
  return items.filter(track=>{
    const text=fold([track.title,track.artist,...(track.artists||[]).map(a=>a?.name||a),track.album].join('\n'));
    return words.every(word=>text.includes(word));
  });
}
