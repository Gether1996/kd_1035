"""The background of "Prehľad účtu" on /marche (Gether 10. 11. 2026: "pekné pozadie … nie moc distracting"): a war map
on the commander's table – faint contour lines of hills, the map's squares, a river, dotted roads between small forts
and a compass rose, all in the site's navy and a whisper of gold, darker at the edges so the cards stay readable.
Written to frontend/public/img/overview/war-map.svg. Run in the artgen image (tools/background):
docker run --rm -v "$PWD:/work" -w /work --entrypoint python kd1035-artgen tools/overview/war_map.py"""

import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'frontend' / 'public' / 'img' / 'overview'
W, H = 1920, 1080
GOLD, NAVY, DEEP, WATER = '#f5c451', '#0b1730', '#070f1f', '#0f2244'


def f(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def closed_curve(points):
    """a smooth closed path through the points (Catmull-Rom as cubic Béziers)"""
    n = len(points)
    d = f'M{f(points[0][0])},{f(points[0][1])}'
    for i in range(n):
        p0, p1, p2, p3 = points[i - 1], points[i], points[(i + 1) % n], points[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}'
    return d + ' Z'


def open_curve(points):
    d = f'M{f(points[0][0])},{f(points[0][1])}'
    for i in range(len(points) - 1):
        p0 = points[max(i - 1, 0)]
        p1, p2 = points[i], points[i + 1]
        p3 = points[min(i + 2, len(points) - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}'
    return d


def hill(rng, cx, cy, radius, rings):
    """concentric, slightly wobbly contour lines; the shape keeps its wobble ring to ring like a real hill"""
    k = 18
    phases = [rng.uniform(0, math.tau) for _ in range(3)]
    amps = [rng.uniform(0.06, 0.14), rng.uniform(0.04, 0.09), rng.uniform(0.02, 0.05)]
    stretch = rng.uniform(0.7, 1.0)
    turn = rng.uniform(0, math.pi)
    out = ''
    for r in range(rings):
        scale = radius * (1 - r / rings * 0.85)
        pts = []
        for i in range(k):
            a = math.tau * i / k
            wob = 1 + sum(amp * math.sin((j + 2) * a + ph + r * 0.25) for j, (amp, ph) in enumerate(zip(amps, phases)))
            x, y = math.cos(a) * scale * wob, math.sin(a) * scale * wob * stretch
            pts.append((cx + x * math.cos(turn) - y * math.sin(turn), cy + x * math.sin(turn) + y * math.cos(turn)))
        # the inner rings a touch brighter – the summit
        op = 0.07 + 0.07 * r / max(rings - 1, 1)
        out += f'<path d="{closed_curve(pts)}" stroke-opacity="{op:.3f}"/>'
    return out


def fort(x, y, s=1.0):
    """a tiny map sign of a fort: a square keep with three merlons"""
    w, h = 14 * s, 11 * s
    m = w / 5
    d = (
        f'M{f(x - w / 2)},{f(y + h / 2)} V{f(y - h / 2)} h{f(m)} v{f(-m)} h{f(m)} v{f(m)} h{f(m)} v{f(-m)} '
        f'h{f(m)} v{f(m)} h{f(m)} V{f(y + h / 2)} Z'
    )
    return f'<path d="{d}"/>'


def compass(cx, cy, r):
    out = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none"/><circle cx="{cx}" cy="{cy}" r="{f(r * 0.82)}" fill="none"/>'
    for i in range(8):
        a = math.tau * i / 8 - math.pi / 2
        long = r * (1.0 if i % 2 == 0 else 0.6)
        side = r * 0.13
        tip = (cx + math.cos(a) * long, cy + math.sin(a) * long)
        left = (cx + math.cos(a - math.pi / 2) * side, cy + math.sin(a - math.pi / 2) * side)
        right = (cx + math.cos(a + math.pi / 2) * side, cy + math.sin(a + math.pi / 2) * side)
        out += f'<path d="M{f(left[0])},{f(left[1])} L{f(tip[0])},{f(tip[1])} L{f(right[0])},{f(right[1])} Z"/>'
    # N on top
    nx, ny = cx, cy - r * 1.28
    out += f'<path d="M{f(nx - 6)},{f(ny + 8)} V{f(ny - 8)} L{f(nx + 6)},{f(ny + 8)} V{f(ny - 8)}" fill="none"/>'
    return out


def main():
    rng = random.Random(1035)
    defs = (
        f'<linearGradient id="base" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{NAVY}"/><stop offset="1" stop-color="{DEEP}"/></linearGradient>'
        # darker towards the edges and under the account's header, so the map stays behind the cards
        f'<radialGradient id="vignette" cx="0.5" cy="0.55" r="0.75">'
        f'<stop offset="0.45" stop-color="{DEEP}" stop-opacity="0"/>'
        f'<stop offset="1" stop-color="{DEEP}" stop-opacity="0.85"/></radialGradient>'
        f'<linearGradient id="top" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{DEEP}" stop-opacity="0.9"/>'
        f'<stop offset="0.22" stop-color="{DEEP}" stop-opacity="0"/></linearGradient>'
    )
    body = f'<rect width="{W}" height="{H}" fill="url(#base)"/>'

    # the map's squares
    grid = ''.join(f'<path d="M{x},0 V{H}"/>' for x in range(0, W + 1, 160))
    grid += ''.join(f'<path d="M0,{y} H{W}"/>' for y in range(40, H + 1, 160))
    body += f'<g stroke="{GOLD}" stroke-opacity="0.045" stroke-width="1">{grid}</g>'

    # the river: a wide dark band with a faint bank line on both sides
    river = [(-40, 760), (220, 700), (430, 760), (640, 690), (820, 560), (1010, 520), (1220, 590), (1430, 520),
             (1640, 380), (1800, 330), (1980, 250)]
    river_d = open_curve(river)
    body += (
        f'<path d="{river_d}" fill="none" stroke="{GOLD}" stroke-opacity="0.045" stroke-width="31" stroke-linecap="round"/>'
        f'<path d="{river_d}" fill="none" stroke="{WATER}" stroke-width="27" stroke-linecap="round"/>'
    )

    # hills – away from the river, more of them at the sides than in the middle
    hills = [(190, 260, 170, 6), (560, 330, 120, 5), (1500, 760, 190, 7), (1760, 640, 110, 4), (300, 960, 150, 5),
             (980, 860, 120, 5), (1180, 230, 140, 6), (1650, 120, 100, 4), (760, 980, 90, 3)]
    body += f'<g fill="none" stroke="{GOLD}" stroke-width="1.3">'
    body += ''.join(hill(rng, *h) for h in hills)
    body += '</g>'

    # dotted roads between forts, one bridge over the river
    forts = [(380, 560), (900, 330), (1330, 400), (1210, 800), (640, 880), (1720, 900)]
    roads = [
        [(380, 560), (520, 500), (700, 440), (900, 330)],
        [(900, 330), (1100, 380), (1330, 400)],
        [(900, 330), (960, 470), (1040, 640), (1210, 800)],
        [(380, 560), (470, 720), (640, 880)],
        [(640, 880), (900, 910), (1210, 800)],
        [(1210, 800), (1460, 860), (1720, 900)],
    ]
    body += (
        f'<g fill="none" stroke="{GOLD}" stroke-opacity="0.09" stroke-width="2" stroke-dasharray="2 9" '
        f'stroke-linecap="round">' + ''.join(f'<path d="{open_curve(r)}"/>' for r in roads) + '</g>'
    )
    body += f'<g fill="{GOLD}" fill-opacity="0.08">' + ''.join(fort(x, y, 1.1) for x, y in forts) + '</g>'

    # the compass rose, bottom left, out of the cards' way
    body += (
        f'<g fill="{GOLD}" fill-opacity="0.07" stroke="{GOLD}" stroke-opacity="0.1" stroke-width="1.5">'
        f'{compass(140, 880, 62)}</g>'
    )

    body += f'<rect width="{W}" height="{H}" fill="url(#vignette)"/><rect width="{W}" height="{H}" fill="url(#top)"/>'
    out = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">'
        f'<defs>{defs}</defs>{body}</svg>'
    )
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'war-map.svg').write_text(out, encoding='utf-8', newline='\n')
    print(f'war-map.svg: {len(out)} bytes')


if __name__ == '__main__':
    main()
