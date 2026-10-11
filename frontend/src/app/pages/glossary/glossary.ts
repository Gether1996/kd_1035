import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { fold } from '../../shared/search';
import { TERMS, Term, TermGroup } from './terms';

const GROUPS: TermGroup[] = ['kingdom', 'battle', 'account', 'alliance'];

/** /slovnik – abbreviations and slang of Rise of Kingdoms in Slovak and Czech, prerendered for search engines; the
 * filter runs in the browser. Each term has an anchor (/slovnik#kvk) and a link to its guide when there is one. */
@Component({
  selector: 'app-glossary',
  imports: [RouterLink, Icon, PageHeader],
  templateUrl: './glossary.html',
  styleUrl: './glossary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Glossary {
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().glossary);
  protected readonly query = signal('');

  protected readonly crumbs = computed(() => [
    { label: this.i18n.t().nav.home, link: this.i18n.path('home') },
    { label: this.i18n.t().nav.guides, link: this.i18n.path('guideHub') },
    { label: this.t().title, link: this.i18n.path('glossary') },
  ]);

  /** the groups with the terms matching the filter (term, its full name or the text, without diacritics) */
  protected readonly groups = computed(() => {
    const query = fold(this.query().trim());
    const cs = this.i18n.lang() === 'cs';
    return GROUPS.map((group) => ({
      group,
      terms: TERMS.filter((term) => term.group === group).filter(
        (term) =>
          !query ||
          [this.name(term), term.full ?? '', cs ? term.cs : term.sk].some((text) => fold(text).includes(query)),
      ),
    })).filter((g) => g.terms.length);
  });

  protected name(term: Term): string {
    return (this.i18n.lang() === 'cs' && term.termCs) || term.term;
  }

  protected text(term: Term): string {
    return this.i18n.lang() === 'cs' ? term.cs : term.sk;
  }
}
