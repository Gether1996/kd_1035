"""The Hall of Fame as a knights' tournament (/sien-slavy, Gether 28. 10. 2026: chosen from ten designs, "toto je
fajn"): the page's background – a row of striped pavilions on the horizon, a green tilting field with its wooden
barrier – and the decor behind the zero shields (broken lances in the ground) and behind the clowns (a jester's
pavilion). Written to frontend/public/img/hall/. Run in the artgen image (tools/background):
docker run --rm -v "$PWD:/work" -w /work --entrypoint python kd1035-artgen tools/hall/tournament.py"""

import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'frontend' / 'public' / 'img' / 'hall'
GOLD, RED, CREAM = '#ffc56b', '#b0342b', '#ece6da'


def f(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def svg(w, h, body, defs='', aspect='xMidYMid slice'):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="{aspect}">'
        f'<defs>{defs}</defs>{body}</svg>'
    )


def lin(gid, stops, x2=0, y2=1):
    s = ''.join(f'<stop offset="{o}" stop-color="{c}"' + (f' stop-opacity="{a}"' if a is not None else '') + '/>' for o, c, a in stops)
    return f'<linearGradient id="{gid}" x1="0" y1="0" x2="{x2}" y2="{y2}">{s}</linearGradient>'


def ridge(rng, x0, x1, base, amp, n=24):
    pts = []
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        pts.append((x, base + rng.uniform(-amp, amp) * math.sin(math.pi * i / n) ** 0.3))
    return pts


def poly(pts, bottom):
    return 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + f' L{f(pts[-1][0])},{bottom} L{f(pts[0][0])},{bottom} Z'


def tent(cx, base, w, h, a=RED, b=CREAM, lights=True):
    """a striped circus tent: a cone roof over a drum, a flag on top, a dark entrance"""
    roof_top = base - h
    drum_top = base - h * 0.42
    out = ''
    # drum (walls) – vertical stripes
    stripes = 8
    for i in range(stripes):
        x0 = cx - w / 2 + w * i / stripes
        out += f'<rect x="{f(x0)}" y="{f(drum_top)}" width="{f(w / stripes + 0.5)}" height="{f(base - drum_top)}" fill="{a if i % 2 else b}"/>'
    # roof – stripes converging to the top
    for i in range(stripes):
        xa = cx - w * 0.56 + w * 1.12 * i / stripes
        xb = cx - w * 0.56 + w * 1.12 * (i + 1) / stripes
        out += f'<path d="M{f(cx)},{f(roof_top)} L{f(xa)},{f(drum_top + 6)} L{f(xb)},{f(drum_top + 6)} Z" fill="{b if i % 2 else a}"/>'
    # scalloped edge of the roof
    sc = ''.join(
        f'<path d="M{f(cx - w * 0.56 + w * 1.12 * i / stripes)},{f(drum_top + 4)} q{f(w * 1.12 / stripes / 2)},{f(h * 0.12)} {f(w * 1.12 / stripes)},0" fill="{a if i % 2 == 0 else b}"/>'
        for i in range(stripes)
    )
    out += sc
    out += f'<path d="M{f(cx - w * 0.12)},{f(base)} V{f(base - h * 0.3)} Q{f(cx)},{f(base - h * 0.4)} {f(cx + w * 0.12)},{f(base - h * 0.3)} V{f(base)} Z" fill="#1a1208"/>'
    out += f'<path d="M{f(cx)},{f(roof_top)} V{f(roof_top - h * 0.22)}" stroke="#3a2a14" stroke-width="2.5"/>'
    out += f'<path d="M{f(cx)},{f(roof_top - h * 0.22)} l{f(h * 0.16)},{f(h * 0.05)} l{f(-h * 0.16)},{f(h * 0.05)} Z" fill="{GOLD}"/>'
    if lights:
        # a string of bulbs from the top to both sides
        for side in (-1, 1):
            x1, y1 = cx + side * w * 0.75, drum_top + h * 0.05
            for k in range(1, 7):
                t = k / 7
                x = cx + (x1 - cx) * t
                y = roof_top + (y1 - roof_top) * t + 10 * math.sin(math.pi * t)
                out += f'<circle cx="{f(x)}" cy="{f(y)}" r="2.6" fill="#ffe08a"/>'
            out += f'<path d="M{f(cx)},{f(roof_top)} Q{f((cx + x1) / 2)},{f((roof_top + y1) / 2 + 14)} {f(x1)},{f(y1)}" stroke="#3a2a14" stroke-width="1" fill="none"/>'
    return out


def tournament():
    rng = random.Random(6)
    W, H = 1600, 1000
    defs = lin('sky', [(0, '#3a5a8c', None), (0.6, '#7f9cc4', None), (1, '#e8c79a', None)])
    defs += lin('field', [(0, '#4f7a4a', None), (1, '#24402a', None)])
    body = f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
    body += f'<path d="{poly(ridge(rng, -40, W + 40, 520, 40), H)}" fill="#55708f"/>'
    body += f'<path d="{poly(ridge(rng, -40, W + 40, 560, 26), H)}" fill="#40597a"/>'
    # a row of pavilions along the horizon
    colours = [('#b0342b', '#ece6da'), ('#24407a', '#ffc56b'), ('#ece6da', '#24407a'), ('#b0342b', '#ffc56b')]
    for i, x in enumerate(range(40, W, 150)):
        a, b = colours[i % 4]
        body += tent(x, 600, 90 + (i % 3) * 14, 110 + (i % 2) * 20, a, b, lights=False)
    body += f'<rect y="598" width="{W}" height="{H - 598}" fill="url(#field)"/>'
    # the tilt: a wooden barrier across the field
    for y in (640, 662):
        body += f'<rect y="{y}" width="{W}" height="8" fill="#7a5530"/>'
    body += ''.join(f'<rect x="{x}" y="632" width="10" height="48" fill="#5e3f22"/>' for x in range(20, W, 120))
    grave = '<path d="M0,300 L0,262 Q300,244 600,262 L600,300 Z" fill="#2c4a30"/>'
    for x, ang in ((90, -12), (170, 8), (470, -6), (540, 14)):
        grave += f'<path d="M{x},270 l{f(70 * math.sin(math.radians(ang)))},-160" stroke="#c9b48a" stroke-width="7" stroke-linecap="round"/>'
        grave += f'<path d="M{x + 70 * math.sin(math.radians(ang)) - 2},110 l8,-30 l8,30 Z" fill="#9aa3b4" transform="rotate({ang} {x} 270)"/>'
    circus = '<path d="M0,360 L0,330 Q300,312 600,330 L600,360 Z" fill="#2c4a30"/>' + tent(300, 336, 340, 310, '#24407a', '#ffc56b')
    return {
        'tournament.svg': svg(W, H, body, defs, 'xMidYMin slice'),
        'tournament-grave.svg': svg(600, 300, grave, aspect='xMidYMax meet'),
        'tournament-circus.svg': svg(600, 360, circus, aspect='xMidYMax meet'),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, doc in tournament().items():
        (OUT / name).write_text(doc, encoding='utf-8')
        print(f'hall/{name}  {len(doc) / 1024:.1f} kB')


if __name__ == '__main__':
    main()
