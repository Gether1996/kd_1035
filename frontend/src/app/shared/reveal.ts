import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input, signal } from '@angular/core';

const callbacks = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | undefined;

/** Calls `fn` once, the first time `el` scrolls into view. Returns a cleanup function. */
export function onceVisible(el: Element, fn: () => void): () => void {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        callbacks.get(entry.target)?.();
        callbacks.delete(entry.target);
        observer?.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  callbacks.set(el, fn);
  observer.observe(el);
  return () => {
    callbacks.delete(el);
    observer?.unobserve(el);
  };
}

/** Fades + slides the element in when it enters the viewport. `appReveal="120"` = delay in ms. */
@Directive({
  selector: '[appReveal]',
  host: {
    class: 'reveal',
    '[class.is-visible]': 'visible()',
    '[style.--reveal-delay]': "(appReveal() || 0) + 'ms'",
  },
})
export class Reveal {
  readonly appReveal = input<number | ''>('');
  protected readonly visible = signal(false);

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => destroyRef.onDestroy(onceVisible(el, () => this.visible.set(true))));
  }
}
