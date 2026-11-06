import React,{useEffect,useState} from 'react';
import {Disc} from '@phosphor-icons/react';
import {mediaUrl} from './api';

export const IconButton = ({ icon: Icon, title, active, className = '', ...props }) => <button type="button" title={title} aria-label={title} className={'icon-button ' + (active ? 'active ' : '') + className} {...props}><Icon size={21} weight={active ? 'fill' : 'regular'} /></button>;
export function Cover({ src, title = '', className = '' }) { const [failed, setFailed] = useState(false); useEffect(() => setFailed(false), [src]); return <div className={'cover ' + className}>{src && !failed ? <img src={mediaUrl(src)} alt={title ? title + ' 封面' : ''} onError={() => setFailed(true)} loading="lazy" /> : <Disc size={36} weight="light" />}</div>; }
