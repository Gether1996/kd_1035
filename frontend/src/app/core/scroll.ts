import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

/** Reads the layout; the returned function (if any) writes styles after every effect has read. */
export type FrameFn = () => (() => void) | void;

/** One rAF-throttled scroll/resize loop shared by every scroll effect on the page. */
@Injectable({ providedIn: 'root' })
export class Scroll {
  private readonly listeners = new Set<FrameFn>();
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

  /**
   * Runs `measure` on every animation frame in which the page scrolled or resized (browser only). `measure` only
   * reads the layout and may return a function that writes styles: all reads of the frame run before all writes,
   * so the browser lays the page out once per frame instead of once per effect.
   */
  onFrame(measure: FrameFn): () => void {
    if (!this.isBrowser) return () => {};
    this.listeners.add(measure);
    measure()?.();
    return () => this.listeners.delete(measure);
  }

  private readonly flush = () => {
    this.frame = 0;
    this.scrolled.set(scrollY > 16);
    const writes = [...this.listeners].map((measure) => measure());
    for (const write of writes) write?.();
  };
}
