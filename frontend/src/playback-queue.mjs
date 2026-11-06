export function insertNext(queue,currentId,items){
 const incoming=[...new Map(items.map(t=>[t.id,t])).values()].filter(t=>t.id!==currentId);
 const ids=new Set(incoming.map(t=>t.id)),remaining=queue.filter(t=>!ids.has(t.id));
 const index=remaining.findIndex(t=>t.id===currentId);
 return [...remaining.slice(0,index+1),...incoming,...remaining.slice(index+1)];
}
// Drag-and-drop reorder: the dragged song takes the drop target's slot.
export function moveItem(list,from,to){
 if(!Number.isInteger(from)||!Number.isInteger(to)||from===to||from<0||to<0||from>=list.length||to>=list.length)return list;
 const next=[...list],[item]=next.splice(from,1);next.splice(to,0,item);return next;
}
// "Play next" requests are remembered by id so they win over shuffle, repeat-one and the end of the queue.
// Newer requests go first, matching where insertNext puts them in the queue.
export function pinNext(upNext,items,currentId){
 const ids=[...new Set(items.map(t=>t.id))].filter(id=>id!==currentId);
 return [...ids,...upNext.filter(id=>!ids.includes(id))];
}
export function pinnedNext(queue,upNext,currentId){
 for(const id of upNext){if(id===currentId)continue;const track=queue.find(t=>t.id===id);if(track)return track;}
 return null;
}
