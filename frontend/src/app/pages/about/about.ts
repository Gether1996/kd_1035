import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/icon';
import { Reveal } from '../../shared/reveal';
import { ScrollFx } from '../../shared/scroll-fx';

/** "O nás" – the long-form SEO page about the only CZ/SK kingdom in Rise of Kingdoms. */
@Component({
  selector: 'app-about',
  imports: [RouterLink, Icon, Reveal, ScrollFx],
  templateUrl: './about.html',
  styleUrl: './about.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class About {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
}
