import {useSyncExternalStore} from 'react';
import {playbackClock} from './playback-clock.mjs';

export function usePlaybackPosition(){return useSyncExternalStore(playbackClock.subscribe,playbackClock.get);}
