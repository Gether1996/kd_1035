import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';
import { Scroll } from '../core/scroll';

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Exposes scroll progress as the CSS variable `--progress` (0 → 1) for parallax effects.
 *  - `appScrollFx="through"` (default): 0 when the element enters at the bottom, 1 when it leaves at the top.
 *  - `appScrollFx="exit"`: 0 while the element's top is at the viewport top, 1 once it has scrolled fully away.
 */
@Directive({ selector: '[appScrollFx]' })
export class ScrollFx {
  readonly appScrollFx = input<'through' | 'exit' | ''>('');

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const scroll = inject(Scroll);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      if (scroll.reducedMotion) return;
      let last = -1;
      const stop = scroll.onFrame(() => {
        const r = el.getBoundingClientRect();
        const p =
          this.appScrollFx() === 'exit'
            ? clamp(-r.top / r.height)
            : clamp((innerHeight - r.top) / (innerHeight + r.height));
        const value = Math.round(p * 1000) / 1000;
        if (value !== last) {
          last = value;
          el.style.setProperty('--progress', String(value));
        }
      });
      destroyRef.onDestroy(stop);
    });
  }
}
