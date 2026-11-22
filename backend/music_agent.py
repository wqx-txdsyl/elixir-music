"""Local music suggestions based on library and listening facts."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import time
import unicodedata

DAY = 86400
MAX_PER_ARTIST = 2
UNKNOWN_ARTISTS = {"", "未知歌手", "unknown", "unknown artist", "various artists"}
UNKNOWN_ALBUMS = {"", "本地音乐", "未知专辑", "unknown", "unknown album"}


@dataclass
class Candidate:
    track: dict
    artist: str
    recording: tuple[str, str]
    dismissed: bool
    familiar: bool
    score: tuple
    reason: str


def normalized(text):
    return ' '.join(unicodedata.normalize('NFKC', text or '').casefold().split())


def recording(track):
    artist = normalized(track.get('artist'))
    return normalized(track.get('title')), '' if artist in UNKNOWN_ARTISTS else artist


def artists(track):
    names = tuple(
        name for credit in track.get('artists') or ()
        if (name := normalized(credit.get('name'))) not in UNKNOWN_ARTISTS
    )
    fallback = recording(track)[1]
    return names or ((fallback,) if fallback else ())


def same_album(left, right):
    if left['source'] == right['source'] and left.get('album_id') and right.get('album_id'):
        return left['album_id'] == right['album_id']
    title = normalized(left.get('album'))
    return title not in UNKNOWN_ALBUMS and title == normalized(right.get('album'))


def candidate_for(row, mode, current, current_artists, now):
    track = row['track']
    title, recording_artist = recording(track)
    names = artists(track)
    if not title or track.get('metadata_missing') or track.get('availability') == 'unavailable':
        return None

    same_artist = not current_artists.isdisjoint(names)
    if mode == 'change' and current and (same_artist or same_album(track, current)):
        return None

    last_played = row['last_played']
    days_ago = max(0, int((now - last_played) / DAY)) if last_played else None
    familiar = days_ago is not None and days_ago < 30
    if mode == 'rediscover' and familiar:
        return None

    liked = bool(row['liked'])
    finished = row['finished_recent']
    shared_playlist = bool(row['shared_playlist'])

    if mode == 'continue':
        score = (shared_playlist, same_artist, finished, liked, familiar, last_played)
    elif mode == 'change':
        score = (not familiar, liked, row['in_playlist'], finished, last_played)
    else:
        score = (days_ago is not None, days_ago or 0, liked, row['in_playlist'])

    if mode == 'rediscover':
        if days_ago is not None:
            reason = f'{days_ago} 天没听过这首'
        elif liked:
            reason = '点过赞，还没在 Elixir 里播过'
        elif row['in_playlist']:
            reason = '在你的歌单里，还没在 Elixir 里播过'
        else:
            reason = '本地曲库里还没在 Elixir 播过的歌'
    elif mode == 'continue' and shared_playlist:
        reason = '和当前歌曲在同一张歌单'
    elif mode == 'continue' and same_artist:
        reason = '和当前歌曲的歌手相同'
    elif finished:
        reason = f'近 7 天完整听过 {finished} 次'
    elif liked:
        reason = '你点过赞'
    elif row['in_playlist']:
        reason = '已在你的歌单里'
    elif days_ago is not None:
        reason = '过去 24 小时听过这首' if days_ago == 0 else f'上次听这首在 {days_ago} 天前'
    else:
        reason = '来自本地曲库，暂无播放记录'

    return Candidate(
        track, names[0] if names else '', (title, recording_artist),
        bool(row['dismissed']), familiar, score, reason,
    )


def suggest(store, mode, current_track_id, exclude_track_ids, limit, *, now=None):
    now = time.time() if now is None else now
    rows = store.music_agent_facts(current_track_id, now - 7 * DAY)
    excluded_ids = set(exclude_track_ids)
    excluded_ids.add(current_track_id)
    current = store.get(current_track_id) if current_track_id else None
    current_artists = set(artists(current)) if current else set()
    seen_recordings = {
        identity
        for row in rows if row['track']['id'] in excluded_ids
        if (identity := recording(row['track']))[1]
    }
    if current and (identity := recording(current))[1]:
        seen_recordings.add(identity)

    pool = []
    for row in rows:
        if row['track']['id'] not in excluded_ids:
            candidate = candidate_for(row, mode, current, current_artists, now)
            if candidate:
                pool.append(candidate)
    pool.sort(key=lambda candidate: candidate.track['id'])
    pool.sort(key=lambda candidate: (not candidate.dismissed, candidate.score), reverse=True)

    selected = []
    artist_counts = Counter()
    while pool and len(selected) < limit:
        previous = selected[-1] if selected else None
        next_candidate = None
        best_preference = None
        for candidate in pool:
            if candidate.recording[1] and candidate.recording in seen_recordings:
                continue
            if candidate.artist and artist_counts[candidate.artist] >= MAX_PER_ARTIST:
                continue
            preference = (
                not candidate.dismissed,
                mode == 'rediscover' and candidate.score[0],
                not previous or not candidate.artist or candidate.artist != previous.artist,
                not previous or candidate.familiar != previous.familiar,
            )
            if best_preference is None or preference > best_preference:
                best_preference = preference
                next_candidate = candidate
        if next_candidate is None:
            break
        pool.remove(next_candidate)
        selected.append(next_candidate)
        if next_candidate.artist:
            artist_counts[next_candidate.artist] += 1
        if next_candidate.recording[1]:
            seen_recordings.add(next_candidate.recording)

    return [{'track': item.track, 'reason': item.reason} for item in selected]
