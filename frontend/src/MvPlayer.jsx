import { useEffect, useState } from 'react';
import { api, mediaUrl } from './api';

export function MvPlayer({ item, external }) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    api(`/api/music/mv/${encodeURIComponent(item.source)}/${encodeURIComponent(item.source_id)}/play`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch(error => { if (!controller.signal.aborted) setResult({ reason: error.message }); });
    return () => controller.abort();
  }, [item.source, item.source_id]);
  const failed = () => setResult({ reason: '视频未能加载' });
  return <div className="mv-player">
    {result?.url && <video src={mediaUrl(result.url)} poster={item.cover || undefined} onError={failed} autoPlay controls playsInline />}
    {result?.embed && <iframe title={item.title} src={result.embed} referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />}
    {!result && <p role="status">正在加载 MV…</p>}
    {result?.reason && <p role="status">{result.reason}</p>}
    {item.source_url && <button className="button quiet" onClick={() => external(item.source_url)}>在原平台打开</button>}
  </div>;
}
