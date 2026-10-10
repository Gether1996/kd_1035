import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { KingdomApi, Officer } from '../../../core/api';
import { I18n } from '../../../core/i18n/i18n';
import { Icon } from '../../../shared/icon';
import { Reveal } from '../../../shared/reveal';
import { ScrollFx } from '../../../shared/scroll-fx';

@Component({
  selector: 'app-alliance',
  imports: [Icon, Reveal, ScrollFx],
  templateUrl: './alliance.html',
  styleUrl: './alliance.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllianceSection {
  protected readonly i18n = inject(I18n);
  protected readonly api = inject(KingdomApi);
  /** Discord name that was just copied (shows a short confirmation). */
  protected readonly copied = signal('');

  protected title(officer: Officer): string {
    return this.i18n.lang() === 'cs' ? officer.title_cs : officer.title_sk;
  }

  /** What to contact the officer about (empty = no line); Czech falls back to the Slovak text. */
  protected focus(officer: Officer): string {
    return ((this.i18n.lang() === 'cs' && officer.focus_cs) || officer.focus_sk).trim();
  }

  protected async copy(username: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(username);
    } catch {
      return; // clipboard blocked – the name stays visible in the button label
    }
    this.copied.set(username);
    setTimeout(() => this.copied.set(''), 2500);
  }
}
