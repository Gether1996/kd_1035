import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n';
import { Icon } from '../../../shared/icon';
import { ScrollFx } from '../../../shared/scroll-fx';

interface Layer {
  src: string;
  /** scroll parallax: 0 = moves with the page, 1 = fixed */
  speed: number;
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

  protected readonly back: Layer[] = [
    { src: 'img/hero/sky.svg', speed: 0.6 },
    { src: 'img/hero/clouds.svg', speed: 0.5, cls: 'layer--clouds' },
    { src: 'img/hero/far.svg', speed: 0.42 },
    { src: 'img/hero/mid.svg', speed: 0.3 },
  ];
  protected readonly castle: Layer = { src: 'img/hero/castle.svg', speed: 0.18 };
  protected readonly near: Layer = { src: 'img/hero/near.svg', speed: 0 };
}
