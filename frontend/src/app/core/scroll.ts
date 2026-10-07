import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

/** One rAF-throttled scroll/resize loop shared by every scroll effect on the page. */
@Injectable({ providedIn: 'root' })
export class Scroll {
  private readonly listeners = new Set<() => void>();
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private frame = 0;

  readonly scrolled = signal(false);
  readonly reducedMotion = this.isBrowser && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    if (!this.isBrowser) return;
    const schedule = () => {
      this.frame ||= requestAnimationFrame(this.flush);
    };
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule, { passive: true });
    schedule();
  }

  /** Runs `fn` on every animation frame in which the page scrolled or resized (browser only). */
  onFrame(fn: () => void): () => void {
    if (!this.isBrowser) return () => {};
    this.listeners.add(fn);
    fn();
    return () => this.listeners.delete(fn);
  }

  private readonly flush = () => {
    this.frame = 0;
    this.scrolled.set(scrollY > 16);
    this.listeners.forEach((fn) => fn());
  };
}
