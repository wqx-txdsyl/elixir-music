import React,{useEffect,useState} from 'react';
import {ImageSquare} from '@phosphor-icons/react';
import {Cover} from './ui';
import './pages.css';

// Shared page header: a tinted art tile (or cover), title, a meta line, optional stats and actions.
// artAction: {label,onClick,busy} turns the art tile into a button (e.g. change a playlist cover).
export default function PageHero({kind,icon:Icon,cover,eyebrow,title,meta,stats,actions,compact,children,artAction}){
  return <header className={'page-hero hero-'+kind+(compact?' compact':'')}>
    <div className={'page-hero-art'+(artAction?' editable':'')}>{cover?<Cover src={cover} title={title}/>:Icon&&<Icon size={compact?40:62} weight="fill"/>}{artAction&&<button type="button" className="page-hero-art-action" disabled={artAction.busy} onClick={artAction.onClick}><ImageSquare size={26}/><span>{artAction.label}</span></button>}</div>
    <div className="page-hero-copy">
      {eyebrow&&<span className="page-hero-eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {meta&&<p className="page-hero-meta">{meta}</p>}
      {stats?.length>0&&<dl className="page-hero-stats">{stats.map(([label,value])=><div key={label}><dd>{value}</dd><dt>{label}</dt></div>)}</dl>}
      {children}
      {actions&&<div className="page-hero-actions">{actions}</div>}
    </div>
  </header>;
}

// Sticky section index for long pages; follows the section nearest the top of the scroll area.
export function SectionNav({sections}){
  const [active,setActive]=useState(sections[0]?.[0]);
  useEffect(()=>{
    const root=document.querySelector('.main-scroll');if(!root)return;
    const update=()=>{const top=root.getBoundingClientRect().top+80;let current=sections[0]?.[0];for(const [id] of sections){const el=document.getElementById(id);if(el&&el.getBoundingClientRect().top<=top)current=id;}if(root.scrollTop+root.clientHeight>=root.scrollHeight-4)current=sections[sections.length-1][0];setActive(current);};
    update();root.addEventListener('scroll',update,{passive:true});return()=>root.removeEventListener('scroll',update);
  },[sections]);
  return <nav className="section-nav" aria-label="页面目录">{sections.map(([id,label])=><button key={id} aria-current={active===id?'true':undefined} onClick={()=>{document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});setActive(id);}}>{label}</button>)}</nav>;
}
