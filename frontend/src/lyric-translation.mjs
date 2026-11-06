// Pairs translated LRC lines with the original by timestamp. Both inputs are parsed and sorted by time.
// Returns one string per original line; empty when there is no translation or it repeats the original.
export function pairTranslations(lines,translated,tolerance=.05){
  const pool=translated.filter(line=>line.text&&line.text!=='♪');let j=0;
  return lines.map(line=>{
    while(j<pool.length&&pool[j].time<line.time-tolerance)j++;
    const match=pool[j]&&Math.abs(pool[j].time-line.time)<=tolerance?pool[j].text:'';
    return match&&match!==line.text?match:'';
  });
}
