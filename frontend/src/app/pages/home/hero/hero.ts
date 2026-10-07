import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n';
import { Scroll } from '../../../core/scroll';
import { Icon } from '../../../shared/icon';
import { ScrollFx } from '../../../shared/scroll-fx';

interface Layer {
  src: string;
  /** scroll parallax: 0 = moves with the page, 1 = fixed */
  speed: number;
  /** mouse parallax strength */
  depth: number;
  cls?: string;
}

@Component({
  selector: 'app-hero',
  imports: [RouterLink, ScrollFx, Icon],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Hero {
  protected readonly i18n = inject(I18n);
  private readonly hero = viewChild.required<ElementRef<HTMLElement>>('hero');

  protected readonly back: Layer[] = [
    { src: 'img/hero/sky.svg', speed: 0.6, depth: 0.15 },
    { src: 'img/hero/clouds.svg', speed: 0.5, depth: 0, cls: 'layer--clouds' },
    { src: 'img/hero/far.svg', speed: 0.42, depth: 0.35 },
    { src: 'img/hero/mid.svg', speed: 0.3, depth: 0.55 },
  ];
  protected readonly castle: Layer = { src: 'img/hero/castle.svg', speed: 0.18, depth: 0.8 };
  protected readonly near: Layer = { src: 'img/hero/near.svg', speed: 0, depth: 1 };

  constructor() {
    const scroll = inject(Scroll);
    const destroyRef = inject(DestroyRef);

    // subtle mouse parallax (desktop only), applied outside change detection
    afterNextRender(() => {
      if (scroll.reducedMotion || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      const el = this.hero().nativeElement;
      let frame = 0;
      let x = 0;
      let y = 0;
      const onMove = (e: PointerEvent) => {
        x = (e.clientX / innerWidth) * 2 - 1;
        y = (e.clientY / innerHeight) * 2 - 1;
        frame ||= requestAnimationFrame(() => {
          frame = 0;
          el.style.setProperty('--mx', x.toFixed(3));
          el.style.setProperty('--my', y.toFixed(3));
        });
      };
      el.addEventListener('pointermove', onMove, { passive: true });
      destroyRef.onDestroy(() => el.removeEventListener('pointermove', onMove));
    });
  }
}
