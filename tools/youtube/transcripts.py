"""Transcripts of the latest guide videos of RoK YouTube channels – research input for the monthly meta update.

The auto-generated English captions become plain text, one line per minute ("[07m] …"), in tools/youtube/out/
(git-ignored – the transcripts are the creators' words, never copied to the website). index.tsv lists every video
with its upload date, so a guide can cite "WarDaddyChadski: New Cavalry Guide (10/2026)".

Run in Docker (no local Python needed), from the repository root:
    docker run --rm -v "$PWD/tools/youtube:/work" -w /work python:3.13-slim sh -c \
      "pip install -q yt-dlp && python transcripts.py [--days 120] [--channel @WarDaddyChadski]"

Auto captions misspell names ("Gang Gang" = Gang Gamchan, "Ailla" = Attila, "Versie" = Vercingetorix): whoever
reads them checks every name against the game, and every fact against the video before it goes into a guide.
"""

import argparse
import re
import sys
from datetime import date, timedelta
from pathlib import Path

import yt_dlp

OUT = Path(__file__).resolve().parent / 'out'
# titles of videos with pairings, line-ups and tier lists; news, events and shorts are skipped
GUIDE = re.compile(r'guide|line ?ups?|pairing|tier list|best marches|meta|rally|garrison|infantry|archer|cavalr|commander', re.I)
SKIP = re.compile(r'#shorts|city skin|armament|gem training|spectating', re.I)
CUE = re.compile(r'^(\d\d):(\d\d):\d\d\.\d+ -->', re.M)


def latest(channel: str, count: int) -> list[dict]:
    with yt_dlp.YoutubeDL({'extract_flat': True, 'playlistend': count, 'quiet': True}) as ydl:
        info = ydl.extract_info(f'https://www.youtube.com/{channel}/videos', download=False)
    return [e for e in info['entries'] if GUIDE.search(e['title']) and not SKIP.search(e['title'])]


def to_text(vtt: str) -> str:
    """Rolling auto captions → one line per minute, every caption once."""
    minutes, last = {}, ''
    for block in re.split(r'\n\n+', vtt):
        cue = CUE.search(block)
        if not cue:
            continue
        lines = [re.sub(r'<[^>]+>', '', line).strip() for line in block.splitlines() if '-->' not in line]
        text = next((line for line in reversed(lines) if line), '')
        if text and text != last:
            minute = int(cue.group(1)) * 60 + int(cue.group(2))
            minutes.setdefault(minute, []).append(text)
            last = text
    return '\n'.join(f'[{m:02d}m] {" ".join(parts)}' for m, parts in sorted(minutes.items()))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--channel', default='@WarDaddyChadski')
    parser.add_argument('--days', type=int, default=120, help='only videos uploaded in the last N days')
    parser.add_argument('--scan', type=int, default=80, help='how many of the latest videos to look through')
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    since = date.today() - timedelta(days=args.days)
    rows = []
    options = {
        'skip_download': True,
        'writeautomaticsub': True,
        'subtitleslangs': ['en-orig'],  # one language only: YouTube answers more caption requests with 429
        'subtitlesformat': 'vtt',
        'outtmpl': str(OUT / '%(id)s.%(ext)s'),
        'quiet': True,
        'no_warnings': True,
        'noprogress': True,
    }
    for entry in latest(args.channel, args.scan):
        with yt_dlp.YoutubeDL(options) as ydl:
            try:
                info = ydl.extract_info(f'https://www.youtube.com/watch?v={entry["id"]}', download=False)
            except yt_dlp.utils.DownloadError as exc:
                print(f'skip {entry["id"]}: {exc}', file=sys.stderr)
                continue
            uploaded = date.fromisoformat(f'{info["upload_date"][:4]}-{info["upload_date"][4:6]}-{info["upload_date"][6:]}')
            if uploaded < since:
                continue
            vtt = OUT / f'{entry["id"]}.en-orig.vtt'
            if not vtt.exists():
                ydl.process_info(info)
        if not vtt.exists():
            print(f'no captions for {entry["id"]} {entry["title"]}', file=sys.stderr)
            continue
        (OUT / f'{entry["id"]}.txt').write_text(to_text(vtt.read_text(encoding='utf-8')), encoding='utf-8')
        rows.append(f'{uploaded}\t{entry["id"]}\thttps://www.youtube.com/watch?v={entry["id"]}\t{info["title"]}')
        print(rows[-1])
    (OUT / 'index.tsv').write_text('\n'.join(['date\tid\turl\ttitle', *rows]) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
