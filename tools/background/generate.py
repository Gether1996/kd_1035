"""Generates the layered hero artwork for KD 1035.

Outputs (into frontend/public):
  img/hero/{sky,clouds,far,mid,castle,near}.svg   parallax layers, 2560x1440 viewBox
  img/scenery/{far,near}.svg                         night landscape behind every page, 2560x720 viewBox
  favicon.svg                                       logo mark
  og-image.jpg, icons/icon-{180,192,512}.png         raster versions (--raster, needs cairosvg)
  tools/background/discord/{banner,avatar}.png       Discord bot / app profile (--discord, needs cairosvg)

Run from the repo root (Docker, no local Python needed):
  docker run --rm -v "$PWD:/work" -w /work python:3.13-slim sh -c \
    "apt-get update -qq && apt-get install -y -qq libcairo2 >/dev/null && \
     pip install -q cairosvg fonttools brotli && python tools/background/generate.py --raster"
"""

import argparse
import math
import random
import urllib.request
from pathlib import Path

W, H = 2560, 1440
CX = W / 2
ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'frontend' / 'public'
CACHE = Path(__file__).resolve().parent / '.cache'

# Palette – dusk over the kingdom, Rise of Kingdoms navy + gold
SKY = [
    (0.00, '#060f22'),
    (0.22, '#0b1f3f'),
    (0.36, '#173563'),
    (0.45, '#33507e'),
    (0.51, '#646683'),
    (0.56, '#c48a63'),
    (0.60, '#f0b467'),
    (0.66, '#ffd994'),
    (1.00, '#ffe6b0'),
]
RIM = '#ffd08a'
GOLD = '#ffc56b'
BANNER = '#b0342b'
PAGE_BG = '#070f1f'


def f(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def svg(body, defs='', view=f'0 0 {W} {H}', aspect='xMidYMax slice'):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" preserveAspectRatio="{aspect}">'
        f'<defs>{defs}</defs>{body}</svg>'
    )


def vgrad(gid, y1, y2, stops):
    s = ''.join(
        f'<stop offset="{o}" stop-color="{c}"' + (f' stop-opacity="{a}"' if a is not None else '') + '/>'
        for o, c, a in ((st + (None,))[:3] for st in stops)
    )
    return f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="0" y1="{f(y1)}" x2="0" y2="{f(y2)}">{s}</linearGradient>'


def rgrad(gid, cx, cy, r, stops, sy=1.0):
    s = ''.join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    tr = f' gradientTransform="translate({f(cx)} {f(cy)}) scale(1 {sy}) translate({f(-cx)} {f(-cy)})"' if sy != 1 else ''
    return f'<radialGradient id="{gid}" gradientUnits="userSpaceOnUse" cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"{tr}>{s}</radialGradient>'


def ridge(rng, base, amp, rough, steps=8, x0=-60, x1=W + 60):
    """Midpoint-displacement mountain ridge."""
    n = 2**steps
    ys = [0.0] * (n + 1)
    ys[0] = base + rng.uniform(-amp, amp) * 0.4
    ys[n] = base + rng.uniform(-amp, amp) * 0.4
    step, scale = n, amp
    while step > 1:
        half = step // 2
        for i in range(half, n, step):
            ys[i] = (ys[i - half] + ys[i + half]) / 2 + rng.uniform(-scale, scale)
        scale *= rough
        step = half
    return [(x0 + (x1 - x0) * i / n, ys[i]) for i in range(n + 1)]


def dip(points, depth, width):
    """Push the ridge down around the center so the castle stays against the glow."""
    return [(x, y + depth * math.exp(-(((x - CX) / width) ** 2))) for x, y in points]


def poly(points):
    return 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in points)


def smooth(points):
    """Catmull-Rom spline through points as cubic Béziers."""
    d = f'M{f(points[0][0])},{f(points[0][1])}'
    for i in range(len(points) - 1):
        p0 = points[max(i - 1, 0)]
        p1, p2 = points[i], points[i + 1]
        p3 = points[min(i + 2, len(points) - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}'
    return d


def close_down(d, x0=-60, x1=W + 60):
    return f'{d} L{f(x1)},{H + 2} L{f(x0)},{H + 2} Z'


def rim(d, opacity):
    """Back-lit edge along a ridge line (soft halo + crisp line)."""
    return (
        f'<path d="{d}" fill="none" stroke="{RIM}" stroke-opacity="{opacity * 0.3}" stroke-width="7" stroke-linejoin="round"/>'
        f'<path d="{d}" fill="none" stroke="{RIM}" stroke-opacity="{opacity}" stroke-width="2" stroke-linejoin="round"/>'
    )


# ---------------------------------------------------------------- layers


def layer_sky(rng):
    defs = vgrad('sky', 0, H, SKY)
    defs += rgrad('glow', CX, 900, 1250, [(0, '#fff1c9', 0.9), (0.2, '#ffd27f', 0.55), (0.5, '#f0a35c', 0.18), (1, '#f0a35c', 0)], sy=0.5)
    mx, my, mr = 1890, 250, 40
    defs += rgrad('halo', mx, my, 170, [(0, '#fbeac2', 0.2), (1, '#fbeac2', 0)])

    stars = []
    for _ in range(260):
        x = rng.uniform(0, W)
        y = 800 * rng.random() ** 1.7
        if math.hypot(x - mx, y - my) < 120:
            continue
        r = rng.choice([0.7, 0.9, 1.1, 1.3, 1.6, 2.2]) if rng.random() > 0.04 else 2.8
        a = max(0.0, rng.uniform(0.35, 0.95) * (1 - y / 820))
        stars.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{r}" fill="#fff6dc" fill-opacity="{a:.2f}"/>')

    body = (
        f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
        f'<rect width="{W}" height="{H}" fill="url(#glow)"/>'
        + ''.join(stars)
        + f'<circle cx="{mx}" cy="{my}" r="170" fill="url(#halo)"/>'
        f'<path d="{crescent(mx, my, mr, 17, -11, mr - 3)}" fill="#fbeac2"/>'
    )
    return svg(body, defs)


def crescent(cx, cy, R, dx, dy, r):
    """Moon disc of radius R minus a disc of radius r offset by (dx, dy)."""
    d = math.hypot(dx, dy)
    ux, uy = dx / d, dy / d
    a = (R * R - r * r + d * d) / (2 * d)
    h = math.sqrt(R * R - a * a)
    px, py = cx + a * ux, cy + a * uy
    x1, y1 = px - h * uy, py + h * ux
    x2, y2 = px + h * uy, py - h * ux
    return f'M{f(x1)},{f(y1)} A{R},{R} 0 1 1 {f(x2)},{f(y2)} A{r},{r} 0 0 0 {f(x1)},{f(y1)} Z'


def cloud(rng, cx, cy, length, thick, gid):
    n = int(length / 55) + 4
    parts = []
    for i in range(n):
        t = i / (n - 1)
        env = math.sin(math.pi * t) ** 0.8
        rx = rng.uniform(35, 75) + 40 * env
        ry = thick * (0.3 + 1.05 * env) * rng.uniform(0.7, 1.25)
        x = cx - length / 2 + length * t + rng.uniform(-12, 12)
        parts.append(f'<ellipse cx="{f(x)}" cy="{f(cy - ry * 0.45)}" rx="{f(rx)}" ry="{f(ry)}"/>')
    defs = vgrad(gid, cy - thick * 1.4, cy + thick * 0.35, [(0, '#2c4068'), (0.55, '#7d7189'), (1, '#ffc983')])
    defs += f'<clipPath id="{gid}c"><rect x="0" y="0" width="{W}" height="{f(cy + thick * 0.3)}"/></clipPath>'
    return defs, f'<g fill="url(#{gid})" clip-path="url(#{gid}c)">{"".join(parts)}</g>'


def layer_clouds(rng):
    specs = [(600, 540, 640, 30), (1560, 615, 760, 26), (2200, 465, 520, 24), (960, 712, 420, 16), (1760, 395, 380, 18)]
    defs, body = '', ''
    for i, (cx, cy, length, thick) in enumerate(specs):
        d, b = cloud(rng, cx, cy, length, thick, f'c{i}')
        defs += d
        body += b
    return svg(f'<g opacity="0.75">{body}</g>', defs)


def layer_far(rng):
    pts = dip(ridge(rng, 760, 125, 0.52), 110, 430)
    line = poly(pts)
    defs = vgrad('far', 600, 1050, [(0, '#5a6d96'), (1, '#34496f')])
    return svg(f'<path d="{close_down(line)}" fill="url(#far)"/>{rim(line, 0.45)}', defs)


def layer_mid(rng):
    pts = dip(ridge(rng, 885, 95, 0.5), 70, 520)
    line = poly(pts)
    defs = vgrad('mid', 760, 1150, [(0, '#2d4167'), (1, '#1b2b4a')])
    return svg(f'<path d="{close_down(line)}" fill="url(#mid)"/>{rim(line, 0.24)}', defs)


# ---------------------------------------------------------------- castle

CASTLE = '#162543'


def rect(x, y, w, h):
    return f'M{f(x)},{f(y)}h{f(w)}v{f(h)}h{f(-w)}Z'


def merlons(x, y, w, mw=13, gap=10, mh=13):
    n = max(2, round((w + gap) / (mw + gap)))
    gap = (w - n * mw) / (n - 1)
    return ''.join(rect(x + i * (mw + gap), y - mh, mw, mh + 1) for i in range(n))


def cone(x, y, w, h, over=7):
    return f'M{f(x - over)},{f(y)} L{f(x + w / 2)},{f(y - h)} L{f(x + w + over)},{f(y)} Z'


def window(x, y, w=7, h=15):
    r = w / 2
    return f'M{f(x)},{f(y + h)} V{f(y + r)} A{f(r)},{f(r)} 0 0 1 {f(x + w)},{f(y + r)} V{f(y + h)} Z'


def pennant(px, py, length=36):
    return (
        f'<path d="M{f(px)},{f(py)} V{f(py - 30)}" stroke="{CASTLE}" stroke-width="3"/>'
        f'<path d="M{f(px)},{f(py - 30)} Q{f(px + length / 2)},{f(py - 28)} {f(px + length)},{f(py - 21)} '
        f'Q{f(px + length / 2)},{f(py - 18)} {f(px)},{f(py - 14)} Z" fill="{BANNER}"/>'
    )


def layer_castle(rng):
    g = 890  # ground level at the hilltop
    shapes, lit = [], []

    # hill with a flat top for the castle
    hill = []
    for x in range(-60, W + 121, 120):
        t = (x - CX) / 560
        y = 1095 - 205 * math.exp(-(t**4)) + rng.uniform(-10, 10) * (1 - math.exp(-(t**4)))
        hill.append((x, y))
    hill_line = smooth(hill)

    # keep + main tower (behind the curtain wall)
    shapes.append(rect(CX - 80, g - 210, 160, 220) + merlons(CX - 80, g - 210, 160))
    shapes.append(rect(CX - 30, g - 330, 60, 130) + cone(CX - 30, g - 330, 60, 96, over=9))
    # small gabled roofs peeking over the wall
    for s in (-1, 1):
        shapes.append(cone(CX + s * 185 - 26, g - 92, 52, 34, over=3))
    # mid towers
    for s in (-1, 1):
        x = CX + s * 130 - 24
        shapes.append(rect(x, g - 185, 48, 195) + cone(x, g - 185, 48, 70))
    # curtain wall + gatehouse
    shapes.append(rect(CX - 235, g - 78, 470, 90) + merlons(CX - 235, g - 78, 470, mw=14))
    shapes.append(rect(CX - 44, g - 122, 88, 132) + merlons(CX - 44, g - 122, 88, mw=12, gap=9))
    # corner towers – square, crenellated, with an overhanging parapet
    for s in (-1, 1):
        x = CX + s * 235 - 32
        shapes.append(rect(x, g - 160, 64, 170) + rect(x - 6, g - 172, 76, 14) + merlons(x - 6, g - 172, 76, mw=12, gap=8, mh=14))

    flags = pennant(CX + 235, g - 186) + pennant(CX - 235, g - 186) + pennant(CX + 130, g - 255, 30) + pennant(CX - 130, g - 255, 30)
    # main banner (swallowtail) on the keep tower
    px, py = CX, g - 426
    flags += (
        f'<path d="M{f(px)},{f(py + 4)} V{f(py - 44)}" stroke="{CASTLE}" stroke-width="4"/>'
        f'<path d="M{f(px)},{f(py - 44)} C{f(px + 20)},{f(py - 50)} {f(px + 38)},{f(py - 38)} {f(px + 58)},{f(py - 44)} '
        f'L{f(px + 46)},{f(py - 31)} L{f(px + 60)},{f(py - 18)} C{f(px + 40)},{f(py - 13)} {f(px + 20)},{f(py - 24)} {f(px)},{f(py - 18)} Z" fill="{BANNER}"/>'
    )

    # lit windows (some stay dark)
    spots = [(CX - 4, g - 300), (CX - 4, g - 262), (CX - 52, g - 175), (CX - 4, g - 180), (CX + 44, g - 175),
             (CX - 134, g - 150), (CX + 126, g - 150), (CX - 238, g - 118), (CX + 230, g - 118),
             (CX - 30, g - 102), (CX + 23, g - 102), (CX - 185, g - 62), (CX + 175, g - 62)]
    for x, y in spots:
        if rng.random() < 0.82:
            lit.append((x, y))
    glows = ''.join(f'<circle cx="{f(x + 3.5)}" cy="{f(y + 8)}" r="22" fill="url(#wglow)"/>' for x, y in lit)
    windows = ''.join(window(x, y) for x, y in lit)

    # gate + torch-lit road down the hill
    gate = f'M{f(CX - 17)},{g + 4} V{g - 28} A17,17 0 0 1 {f(CX + 17)},{g - 28} V{g + 4} Z'
    road_c = [(CX, g + 6), (CX - 40, g + 50), (CX - 105, g + 95), (CX - 60, g + 150), (CX + 60, g + 200), (CX + 150, g + 270), (CX + 120, g + 380)]
    left, right = [], []
    for i, (x, y) in enumerate(road_c):
        w = 9 + i * 7
        left.append((x - w, y))
        right.append((x + w, y))
    road = smooth(left) + ' L' + smooth(list(reversed(right)))[1:] + ' Z'
    torches = [(CX - 52, g + 58), (CX - 112, g + 112), (CX - 2, g + 168), (CX + 118, g + 228), (CX + 172, g + 300)]
    torch_svg = ''.join(
        f'<circle cx="{x}" cy="{y}" r="26" fill="url(#wglow)"/><circle cx="{x}" cy="{y}" r="3" fill="#ffe2a6"/>' for x, y in torches
    )

    defs = vgrad('hill', 860, 1250, [(0, '#1b2c4c'), (1, '#111d36')])
    defs += f'<radialGradient id="wglow"><stop offset="0" stop-color="{GOLD}" stop-opacity="0.5"/><stop offset="1" stop-color="{GOLD}" stop-opacity="0"/></radialGradient>'
    defs += rgrad('gateglow', CX, g - 12, 120, [(0, '#ffcf7a', 0.55), (1, '#ffcf7a', 0)])
    defs += vgrad('gatefill', g - 45, g + 4, [(0, '#ffe3a3'), (1, '#f39a3c')])
    defs += rgrad('aura', CX, g - 160, 520, [(0, '#ffd994', 0.22), (1, '#ffd994', 0)], sy=0.6)

    body = (
        f'<ellipse cx="{CX}" cy="{g - 160}" rx="520" ry="312" fill="url(#aura)"/>'
        f'<path d="{"".join(shapes)}" fill="{CASTLE}"/>'
        f'{flags}'
        f'<path d="{close_down(hill_line)}" fill="url(#hill)"/>'
        f'{rim(hill_line, 0.18)}'
        f'<path d="{road}" fill="#253a5e" fill-opacity="0.75"/>'
        f'<circle cx="{CX}" cy="{g - 12}" r="120" fill="url(#gateglow)"/>'
        f'<path d="{gate}" fill="url(#gatefill)"/>'
        f'<path d="{windows}" fill="{GOLD}"/>{glows}{torch_svg}'
    )
    return svg(body, defs)


# ---------------------------------------------------------------- foreground


def pine(rng, x, y, h):
    w = h * rng.uniform(0.36, 0.46)
    tiers = rng.randint(4, 6)
    right, left = [], []
    for i in range(1, tiers + 1):
        ty = y - h + h * 0.88 * i / tiers
        tw = w / 2 * (i / tiers) ** 0.85
        jit = rng.uniform(-0.06, 0.06) * w
        right += [(x + tw + jit, ty), (x + tw * 0.42, ty - h * 0.045)] if i < tiers else [(x + tw + jit, ty)]
        left += [(x - tw - jit, ty), (x - tw * 0.42, ty - h * 0.045)] if i < tiers else [(x - tw - jit, ty)]
    tw = max(2.5, h * 0.025)
    pts = [(x, y - h)] + right + [(x + tw, y - h * 0.12), (x + tw, y + 6), (x - tw, y + 6), (x - tw, y - h * 0.12)] + list(reversed(left))
    return poly(pts) + 'Z'


def layer_near(rng):
    def ground(x):
        t = min(1.0, max(0.0, (abs(x - CX) - 260) / (CX - 260)))
        s = t * t * (3 - 2 * t)
        side = 1 if x > CX else -1
        return 1330 - (340 if side < 0 else 300) * s

    pts = [(x, ground(x) + rng.uniform(-14, 14)) for x in range(-60, W + 121, 110)]
    line = smooth(pts)

    trees = []
    for x0, x1 in ((-40, 900), (1680, W + 40)):
        x = x0
        while x < x1:
            gy = ground(x)
            t = min(1.0, max(0.0, (abs(x - CX) - 260) / (CX - 260)))
            if t > 0.2 and rng.random() < 0.85:
                trees.append(pine(rng, x, gy + 10, rng.uniform(70, 110) + 190 * t * rng.uniform(0.55, 1.0)))
            x += rng.uniform(26, 58)

    defs = vgrad('near', 980, H, [(0, '#0e1b35'), (0.55, '#0a1428'), (1, PAGE_BG)])
    body = f'<path d="{"".join(trees)}" fill="#081226"/><path d="{close_down(line)}" fill="url(#near)"/>{rim(line, 0.08)}'
    return svg(body, defs)


# ---------------------------------------------------------------- logo / raster


# ---------------------------------------------------------------- night scenery
# The hero shows dusk; the rest of the site sits at night. A very dark, low-contrast landscape fixed to the
# bottom of the viewport behind the content: distant moonlit ridges, a watchtower with a few lit windows
# and pines at the edges. It must stay calm – contrast against PAGE_BG is kept deliberately tiny.

NW, NH = 2560, 720
MOON = '#8fa6d6'
TOWER_X = 2150  # outside the content column on desktop; phones crop at object-position 90% (see app.scss)


def nsvg(body, defs=''):
    return svg(body, defs, view=f'0 0 {NW} {NH}')


def close_night(d, x0=-60, x1=NW + 60):
    return f'{d} L{f(x1)},{NH + 2} L{f(x0)},{NH + 2} Z'


def moon_rim(d, opacity):
    return (
        f'<path d="{d}" fill="none" stroke="{MOON}" stroke-opacity="{opacity * 0.35:.3f}" stroke-width="6" stroke-linejoin="round"/>'
        f'<path d="{d}" fill="none" stroke="{MOON}" stroke-opacity="{opacity}" stroke-width="1.6" stroke-linejoin="round"/>'
    )


def layer_night_far(rng):
    far_line = poly(ridge(rng, 400, 70, 0.52, x1=NW + 60))

    def hill(x):
        t = (x - TOWER_X) / 280
        bump = math.exp(-(t**4))
        return 560 - 90 * bump + rng.uniform(-8, 8) * (1 - bump)

    hill_line = smooth([(x, hill(x)) for x in range(-60, NW + 121, 110)])
    # small and low: a distant watchtower that survives the crop of wide screens (top of the flag ≈ y 312)
    g = 470

    tower = rect(TOWER_X - 18, g - 112, 36, 116) + rect(TOWER_X - 23, g - 122, 46, 11) + merlons(TOWER_X - 23, g - 122, 46, mw=9, gap=6, mh=10)
    wall = rect(TOWER_X - 110, g - 30, 94, 34) + merlons(TOWER_X - 110, g - 30, 94, mw=9, gap=7, mh=8)
    turret = rect(TOWER_X - 128, g - 60, 26, 64) + cone(TOWER_X - 128, g - 60, 26, 30, over=4)
    flag = (
        f'<path d="M{f(TOWER_X)},{g - 132} V{g - 158}" stroke="#0c1830" stroke-width="2.5"/>'
        f'<path d="M{f(TOWER_X)},{g - 158} Q{f(TOWER_X + 11)},{g - 156} {f(TOWER_X + 22)},{g - 152} '
        f'Q{f(TOWER_X + 11)},{g - 149} {f(TOWER_X)},{g - 146} Z" fill="{BANNER}" fill-opacity="0.55"/>'
    )
    lit = [(TOWER_X - 3, g - 92), (TOWER_X - 3, g - 60), (TOWER_X - 118, g - 42)]
    windows = ''.join(window(x, y, w=6, h=11) for x, y in lit)
    glows = ''.join(f'<circle cx="{f(x + 3)}" cy="{f(y + 6)}" r="15" fill="url(#nglow)"/>' for x, y in lit)

    defs = vgrad('nfar', 320, NH, [(0, '#101f3d'), (1, '#0c1830')])
    defs += vgrad('nhill', 450, NH, [(0, '#0d1934'), (1, '#0a152b')])
    defs += f'<radialGradient id="nglow"><stop offset="0" stop-color="{GOLD}" stop-opacity="0.32"/><stop offset="1" stop-color="{GOLD}" stop-opacity="0"/></radialGradient>'
    defs += rgrad('nhaze', TOWER_X, 480, 900, [(0, MOON, 0.05), (1, MOON, 0)], sy=0.18)

    body = (
        f'<path d="{close_night(far_line)}" fill="url(#nfar)"/>{moon_rim(far_line, 0.16)}'
        f'<ellipse cx="{TOWER_X}" cy="480" rx="900" ry="162" fill="url(#nhaze)"/>'
        f'<path d="{tower}{wall}{turret}" fill="#0b162d"/>{flag}'
        f'<path d="{close_night(hill_line)}" fill="url(#nhill)"/>{moon_rim(hill_line, 0.07)}'
        f'<path d="{windows}" fill="{GOLD}" fill-opacity="0.8"/>{glows}'
    )
    return nsvg(body, defs)


def layer_night_near(rng):
    pts = [(x, 628 - 34 * math.sin(x / 410) + rng.uniform(-8, 8)) for x in range(-60, NW + 121, 110)]
    line = smooth(pts)

    def ground(x):
        return 628 - 34 * math.sin(x / 410)

    trees = []
    for lo, hi, n, edge in ((-20, 640, 10, 0), (2290, NW + 20, 6, NW)):
        for _ in range(n):
            x = rng.uniform(lo, hi)
            near_edge = 1 - min(1.0, abs(x - edge) / (hi - lo))
            trees.append(pine(rng, x, ground(x) + 10, 70 + 130 * near_edge * rng.uniform(0.75, 1.0)))

    defs = vgrad('nnear', 560, NH, [(0, '#091327'), (1, '#0b1730')])  # bottom = --bg-raised, the footer starts with it
    body = f'<path d="{"".join(trees)}" fill="#08112a"/><path d="{close_night(line)}" fill="url(#nnear)"/>{moon_rim(line, 0.05)}'
    return nsvg(body, defs)


def write_night_previews(layers):
    """Composite on the page background for checking (git-ignored)."""
    import io

    import cairosvg
    from PIL import Image

    merged = ''.join(doc[doc.index('>') + 1 : doc.rindex('</svg>')] for doc in layers)
    CACHE.mkdir(exist_ok=True)
    for name, w, h in (('night-desktop.png', 1600, 420), ('night-mobile.png', 390, 220)):
        doc = nsvg(f'<rect x="-2000" width="{NW + 4000}" height="{NH}" fill="{PAGE_BG}"/>' + merged)
        doc = doc.replace('<svg ', f'<svg width="{w}" height="{h}" ', 1)
        png = cairosvg.svg2png(bytestring=doc.encode(), output_width=w, output_height=h)
        Image.open(io.BytesIO(png)).convert('RGB').save(CACHE / name)


def logo_mark(size=64, bg=None):
    """Shield + crown mark on a 64x64 grid."""
    defs = (
        '<linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#ffe39a"/><stop offset=".55" stop-color="#f2b84b"/><stop offset="1" stop-color="#b9802a"/></linearGradient>'
    )
    shield = 'M32 3 L57 11 V30 C57 45.5 46.5 55.5 32 61 C17.5 55.5 7 45.5 7 30 V11 Z'
    inner = 'M32 8.5 L52 15 V30 C52 42.5 43.6 50.8 32 55.4 C20.4 50.8 12 42.5 12 30 V15 Z'
    crown = 'M18.5 25 L25 32 L32 20.5 L39 32 L45.5 25 L43.2 40 H20.8 Z M20.8 42.5 H43.2 V46 H20.8 Z'
    body = (f'<rect width="64" height="64" fill="{bg}"/>' if bg else '') + (
        f'<path d="{shield}" fill="url(#lg)"/><path d="{inner}" fill="#0c1f3d"/><path d="{crown}" fill="url(#lg)"/>'
    )
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="{size}" height="{size}"><defs>{defs}</defs>{body}</svg>'


def font_file(name, url):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if not path.exists():
        urllib.request.urlretrieve(url, path)
    return path


def text_path(text, font_path, size, x, y, tracking=0.0):
    """Centred outline of the text; font_path may be a list – fontsource splits latin and latin-ext (č, ľ…) into files."""
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.ttLib import TTFont

    fonts = [TTFont(p) for p in (font_path if isinstance(font_path, list) else [font_path])]
    scale = size / fonts[0]['head'].unitsPerEm

    def glyph(c):
        for font in fonts:
            name = font.getBestCmap().get(ord(c))
            if name:
                glyph_set = font.getGlyphSet()
                return glyph_set, glyph_set[name]  # composite glyphs (č = c + ˇ) need their own set
        raise KeyError(f'no glyph for {c!r}')

    glyphs = [glyph(c) for c in text]
    width = sum(g.width for _, g in glyphs) * scale + tracking * (len(text) - 1)
    commands, cursor = [], x - width / 2
    for glyph_set, g in glyphs:
        pen = SVGPathPen(glyph_set)
        g.draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, y)))
        commands.append(pen.getCommands())
        cursor += g.width * scale + tracking
    return ' '.join(commands)


def write_raster(layers):
    import io

    import cairosvg
    from PIL import Image

    def inner(doc):
        return doc[doc.index('>') + 1 : doc.rindex('</svg>')]

    # ids are unique per layer except the shared names below, so prefix each layer
    merged = ''.join(inner(doc).replace('id="', f'id="L{i}').replace('url(#', f'url(#L{i}') for i, doc in enumerate(layers))

    # og-image 1200x630: crop the composite keeping the bottom, add the wordmark
    vh = W * 630 / 1200
    title = ''
    try:
        cinzel = font_file('cinzel-700.woff2', 'https://cdn.jsdelivr.net/fontsource/fonts/cinzel@latest/latin-700-normal.woff2')
        barlow = font_file('barlow-600.woff2', 'https://cdn.jsdelivr.net/fontsource/fonts/barlow@latest/latin-600-normal.woff2')
        title = (
            f'<path d="{text_path("KINGDOM", cinzel, 74, CX, 330, tracking=26)}" fill="#ffe7ad"/>'
            f'<path d="{text_path("1035", cinzel, 260, CX, 560, tracking=10)}" fill="url(#og-gold)"/>'
            f'<path d="{text_path("CZ · SK · RISE OF KINGDOMS", barlow, 44, CX, 650, tracking=9)}" fill="#e9eefb" fill-opacity="0.85"/>'
        )
    except Exception as exc:  # fonts are optional – keep the artwork without text
        print('og-image text skipped:', exc)

    og_defs = (
        '<linearGradient id="og-gold" x1="0" y1="330" x2="0" y2="560" gradientUnits="userSpaceOnUse">'
        '<stop offset="0" stop-color="#fff0c4"/><stop offset=".5" stop-color="#f5c451"/><stop offset="1" stop-color="#c8902a"/></linearGradient>'
        f'<linearGradient id="og-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{PAGE_BG}" stop-opacity=".55"/>'
        f'<stop offset=".6" stop-color="{PAGE_BG}" stop-opacity=".05"/><stop offset="1" stop-color="{PAGE_BG}" stop-opacity=".5"/></linearGradient>'
    )
    og = svg(
        merged + f'<rect y="{f(H - vh)}" width="{W}" height="{f(vh)}" fill="url(#og-shade)"/>'
        + f'<g transform="translate(0 {f(H - vh - 60)})">{title}</g>',
        og_defs,
        view=f'0 {f(H - vh)} {W} {f(vh)}',
        aspect='xMidYMid slice',
    )
    png = cairosvg.svg2png(bytestring=og.encode(), output_width=1200, output_height=630)
    Image.open(io.BytesIO(png)).convert('RGB').save(PUBLIC / 'og-image.jpg', quality=86, optimize=True, progressive=True)

    # previews for checking the composition (git-ignored)
    CACHE.mkdir(exist_ok=True)
    for name, w, h in (('preview-desktop.jpg', 1600, 900), ('preview-mobile.jpg', 390, 844)):
        doc = svg(merged, aspect='xMidYMax slice').replace('<svg ', f'<svg width="{w}" height="{h}" ', 1)
        png = cairosvg.svg2png(bytestring=doc.encode(), output_width=w, output_height=h)
        Image.open(io.BytesIO(png)).convert('RGB').save(CACHE / name, quality=85)

    icons = PUBLIC / 'icons'
    icons.mkdir(exist_ok=True)
    for size in (180, 192, 512):
        mark = logo_mark(64, bg=PAGE_BG).replace('viewBox="0 0 64 64"', 'viewBox="-10 -10 84 84"')
        mark = mark.replace('<rect width="64" height="64"', '<rect x="-10" y="-10" width="84" height="84"')
        cairosvg.svg2png(bytestring=mark.encode(), write_to=str(icons / f'icon-{size}.png'), output_width=size, output_height=size)


def write_discord(layers):
    """Discord app / bot profile: banner 1500x600 (5:2) and avatar 1024x1024 → tools/background/discord/."""
    import io

    import cairosvg
    from PIL import Image

    out = Path(__file__).resolve().parent / 'discord'
    out.mkdir(exist_ok=True)

    def inner(doc):
        return doc[doc.index('>') + 1 : doc.rindex('</svg>')]

    merged = ''.join(inner(doc).replace('id="', f'id="L{i}').replace('url(#', f'url(#L{i}') for i, doc in enumerate(layers))

    # banner: a 5:2 window with the castle (x 1280) right of centre and the wordmark in the sky on the left – Discord
    # puts the avatar over the bottom-left corner, so the text stays in the upper part
    vw, vh = 1800, 720
    x0, y0 = 56, 330
    cinzel = font_file('cinzel-700.woff2', 'https://cdn.jsdelivr.net/fontsource/fonts/cinzel@latest/latin-700-normal.woff2')
    barlow = [
        font_file('barlow-600.woff2', 'https://cdn.jsdelivr.net/fontsource/fonts/barlow@latest/latin-600-normal.woff2'),
        font_file('barlow-600-ext.woff2', 'https://cdn.jsdelivr.net/fontsource/fonts/barlow@latest/latin-ext-600-normal.woff2'),
    ]
    tx = x0 + 0.3 * vw  # centre of the wordmark
    title = (
        f'<path d="{text_path("KINGDOM", cinzel, 52, tx, y0 + 150, tracking=20)}" fill="#ffe7ad"/>'
        f'<path d="{text_path("1035", cinzel, 190, tx, y0 + 322, tracking=8)}" fill="url(#dc-gold)"/>'
        f'<path d="{text_path("SLOVENSKÉ A ČESKÉ KRÁĽOVSTVO", barlow, 34, tx, y0 + 392, tracking=5)}" fill="#e9eefb" fill-opacity="0.92"/>'
    )
    defs = (
        f'<linearGradient id="dc-gold" x1="0" y1="{y0 + 185}" x2="0" y2="{y0 + 322}" gradientUnits="userSpaceOnUse">'
        '<stop offset="0" stop-color="#fff0c4"/><stop offset=".5" stop-color="#f5c451"/><stop offset="1" stop-color="#c8902a"/></linearGradient>'
        f'<linearGradient id="dc-shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{PAGE_BG}" stop-opacity=".55"/>'
        f'<stop offset=".5" stop-color="{PAGE_BG}" stop-opacity=".15"/><stop offset=".7" stop-color="{PAGE_BG}" stop-opacity="0"/></linearGradient>'
    )
    doc = svg(
        merged + f'<rect x="{x0}" y="{y0}" width="{vw}" height="{vh}" fill="url(#dc-shade)"/>' + title,
        defs,
        view=f'{x0} {y0} {vw} {vh}',
        aspect='xMidYMid slice',
    )
    png = cairosvg.svg2png(bytestring=doc.encode(), output_width=1500, output_height=600)
    Image.open(io.BytesIO(png)).convert('RGB').save(out / 'banner.png', optimize=True)

    # avatar: the logo mark, padded so Discord's round crop keeps the whole shield
    mark = logo_mark(64, bg=PAGE_BG).replace('viewBox="0 0 64 64"', 'viewBox="-14 -14 92 92"')
    mark = mark.replace('<rect width="64" height="64"', '<rect x="-14" y="-14" width="92" height="92"')
    cairosvg.svg2png(bytestring=mark.encode(), write_to=str(out / 'avatar.png'), output_width=1024, output_height=1024)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seed', type=int, default=1035)
    parser.add_argument('--raster', action='store_true', help='also render og-image.jpg and PNG icons')
    parser.add_argument('--preview', action='store_true', help='render PNG previews of the night scenery into .cache')
    parser.add_argument('--discord', action='store_true', help='render the Discord banner and avatar into tools/background/discord')
    args = parser.parse_args()

    out = PUBLIC / 'img' / 'hero'
    out.mkdir(parents=True, exist_ok=True)
    builders = [('sky', layer_sky), ('clouds', layer_clouds), ('far', layer_far), ('mid', layer_mid), ('castle', layer_castle), ('near', layer_near)]
    layers = []
    for i, (name, build) in enumerate(builders):
        doc = build(random.Random(args.seed * 31 + i))
        (out / f'{name}.svg').write_text(doc, encoding='utf-8')
        layers.append(doc)
        print(f'{name}.svg  {len(doc) / 1024:.1f} kB')

    night_out = PUBLIC / 'img' / 'scenery'
    night_out.mkdir(parents=True, exist_ok=True)
    night = []
    for i, (name, build) in enumerate([('far', layer_night_far), ('near', layer_night_near)]):
        doc = build(random.Random(args.seed * 31 + 100 + i))
        (night_out / f'{name}.svg').write_text(doc, encoding='utf-8')
        night.append(doc)
        print(f'scenery/{name}.svg  {len(doc) / 1024:.1f} kB')

    (PUBLIC / 'favicon.svg').write_text(logo_mark(), encoding='utf-8')
    if args.preview:
        write_night_previews(night)
    if args.raster:
        write_raster(layers)
        print('og-image.jpg + icons written')
    if args.discord:
        write_discord(layers)
        print('discord/banner.png + discord/avatar.png written')


if __name__ == '__main__':
    main()
