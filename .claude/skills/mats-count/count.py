"""How many legendary (gold) materials Gether's Rise of Kingdoms materials make – /mats-count (Gether 9. 11. 2026).

4 of a tier make 1 of the next: white → green → blue → purple → gold. Bones are left out. A material crafts only into
the same type (leather, stone = iron ore, wood = ebony); the unmarked material chests ("neutral") can become any type of
their tier.

Usage – the counts of each tier, white,green,blue,purple,gold (missing tiers = 0):
    python -I count.py --leather 857,40,23,2,23 --stone 99,40,18,4,34 --wood 122,34,20,7,25 --neutral 300,405,153,67,27
"""

import argparse
import sys
from itertools import combinations

TIERS = ['biele', 'zelené', 'modré', 'fialové', 'zlaté']
TYPES = {'leather': 'Koža', 'stone': 'Kameň', 'wood': 'Drevo'}


def counts(text: str) -> list[int]:
    values = [int(v.replace(' ', '').replace('.', '') or 0) for v in text.split(',')] if text else []
    if len(values) > 5 or any(v < 0 for v in values):
        raise SystemExit(f'Päť počtov (biele,zelené,modré,fialové,zlaté), dostal som: {text!r}')
    return values + [0] * (5 - len(values))


def craft(tiers: list[int]) -> tuple[int, list[int]]:
    """crafted up tier by tier: the gold made and what is left on each lower tier"""
    tiers = list(tiers)
    left = []
    for tier in range(4):
        tiers[tier + 1] += tiers[tier] // 4
        left.append(tiers[tier] % 4)
    return tiers[4], left


def white(tiers: list[int]) -> int:
    """everything in white materials (4^tier each)"""
    return sum(n * 4**tier for tier, n in enumerate(tiers))


def together(types: dict[str, list[int]], neutral: list[int]) -> dict[str, int]:
    """The most gold with the neutral chests filling up the types: tier by tier, the neutral ones complete the fours of
    the types left over where that makes more of the next tier (fewest neutral used on a tie); the rest stay neutral and
    craft among themselves. Returns the gold of each type and of the neutral ones."""
    types = {name: list(tiers) for name, tiers in types.items()}
    neutral = list(neutral)
    for tier in range(4):
        rests = {name: tiers[tier] % 4 for name, tiers in types.items()}
        best = (sum(t[tier] // 4 for t in types.values()) + neutral[tier] // 4, 0, ())
        for size in range(1, len(types) + 1):
            for chosen in combinations([n for n, r in rests.items() if r], size):
                used = sum(4 - rests[n] for n in chosen)
                if used > neutral[tier]:
                    continue
                carried = sum(t[tier] // 4 for t in types.values()) + len(chosen) + (neutral[tier] - used) // 4
                if carried > best[0] or (carried == best[0] and used < best[1]):
                    best = (carried, used, chosen)
        for name in best[2]:
            types[name][tier] += 4 - rests[name]
        neutral[tier] -= best[1]
        for tiers in [*types.values(), neutral]:
            tiers[tier + 1] += tiers[tier] // 4
            tiers[tier] %= 4
    return {**{name: tiers[4] for name, tiers in types.items()}, 'neutral': neutral[4]}


def main() -> None:
    # Slovak letters also in a Windows console (python -I ignores PYTHONIOENCODING)
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for name in [*TYPES, 'neutral']:
        parser.add_argument(f'--{name}', default='', help='biele,zelené,modré,fialové,zlaté')
    args = parser.parse_args()
    types = {name: counts(getattr(args, name)) for name in TYPES}
    neutral = counts(args.neutral)

    print('Zvlášť (každý typ sám, neutrálne samy):')
    total = 0
    for name, tiers in [*types.items(), ('neutral', neutral)]:
        gold, left = craft(tiers)
        total += gold
        label = TYPES.get(name, 'Neutrálne')
        rest = ', '.join(f'{n} {TIERS[i]}' for i, n in enumerate(left) if n) or 'nič'
        print(f'  {label:<10} {gold:>4} zlatých   (zvyšok: {rest}; spolu ≈ {white(tiers) / 256:.2f} zlatých)')
    print(f'  {"Spolu":<10} {total:>4} zlatých')

    best = together(types, neutral)
    extra = sum(best.values()) - total
    if extra:
        print(f'\nS neutrálnymi na doplnenie zvyškov: {sum(best.values())} zlatých (+{extra}):')
        for name, gold in best.items():
            print(f'  {TYPES.get(name, "Neutrálne"):<10} {gold:>4}')


if __name__ == '__main__':
    main()
