"""The two clowns of the Hall of Fame's mascots' corner (/sien-slavy, Gether 28. 10. 2026: "len png klaunov bez
pozadia a bez menoviek, tie budú dynamické"): cut out of Gether's picture (clowns-source.png, not in git) – inside the
gold frame and above its name plates – without the background, saved as a WebP with transparency.
Run in Docker: see the Dockerfile next to this file."""

import os
from pathlib import Path

from PIL import Image
from rembg import new_session, remove

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'clowns-source.png'
OUT = HERE.parents[1] / 'frontend' / 'public' / 'img' / 'hall' / 'clowns.webp'
# inside the frame, above the name plates of the picture (x0, y0, x1, y1 of the 1402 × 1122 source)
BOX = (72, 66, 1338, 730)
WIDTH = 1000


def main():
    with Image.open(SOURCE) as source:
        image = source.convert('RGB').crop(BOX)
    # the model made for people follows their shape, not the colours (the blue curls next to the dark blue background)
    model = os.environ.get('MODEL', 'u2net_human_seg')
    cut = remove(image, session=new_session(model), alpha_matting=os.environ.get('MATTING') == '1')
    cut = cut.crop(cut.getbbox())
    if cut.width > WIDTH:
        cut = cut.resize((WIDTH, round(cut.height * WIDTH / cut.width)), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    cut.save(OUT, 'WEBP', quality=86, method=6)
    print(f'{OUT.name}: {cut.width} × {cut.height}, {OUT.stat().st_size / 1024:.0f} kB')


if __name__ == '__main__':
    main()
