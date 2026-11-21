import React,{useEffect,useRef} from 'react';

// 应用内统一的确认框，代替原生 confirm()：样式与其它弹层一致，Esc、点遮罩或「取消」都关闭，打开时焦点落在「取消」上。
export default function ConfirmDialog({title,children,confirmText='确定',danger=true,busy,onConfirm,onCancel}){
  const cancelRef=useRef(null),cancel=useRef(onCancel);cancel.current=onCancel;
  useEffect(()=>{
    cancelRef.current?.focus();
    const key=e=>{if(e.key==='Escape'){e.stopPropagation();cancel.current();}};
    window.addEventListener('keydown',key,true);
    return()=>window.removeEventListener('keydown',key,true);
  },[]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onCancel();}}>
    <section className="modal modal-confirm" role="alertdialog" aria-modal="true" aria-label={title}>
      <h2>{title}</h2>{children&&<p>{children}</p>}
      <div className="modal-actions">
        <button ref={cancelRef} className="button quiet" onClick={onCancel} disabled={busy}>取消</button>
        <button className={'button '+(danger?'danger':'primary')} onClick={onConfirm} disabled={busy}>{confirmText}</button>
      </div>
    </section>
  </div>;
}
