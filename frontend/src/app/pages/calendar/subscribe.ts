import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { copyLink } from '../../shared/copy-link';
import { Icon } from '../../shared/icon';

/**
 * "Odber kalendára" under the calendar: every public event in the visitor's own calendar app, refreshed by the app
 * itself – GET /api/calendar.ics (backend kingdom/views.py calendar_feed) in the page's language.
 */
@Component({
  selector: 'app-calendar-subscribe',
  imports: [Icon],
  templateUrl: './subscribe.html',
  styleUrl: './subscribe.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Subscribe {
  protected readonly i18n = inject(I18n);
  private readonly injector = inject(Injector);

  /** '' in the prerendered page – the links stay relative (https on the site) until the browser knows its host */
  private readonly origin = signal('');
  private readonly feedUrl = computed(
    () => `${this.origin()}/api/calendar.ics?lang=${this.i18n.lang()}`,
  );
  /** webcal:// opens the subscription in the calendar app (iPhone, Mac, Outlook); Android has no handler for it */
  protected readonly subscribeUrl = computed(() =>
    this.origin() ? this.feedUrl().replace(/^https?:/, 'webcal:') : this.feedUrl(),
  );

  /** "Kopírovať odkaz": 'copied' for a moment, or the URL to copy by hand when neither clipboard nor share worked */
  protected readonly copied = signal(false);
  protected readonly manualUrl = signal('');
  private readonly manualInput = viewChild<ElementRef<HTMLInputElement>>('manual');
  private copiedTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    afterNextRender(() => this.origin.set(location.origin));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
  }

  /** No `await` before copyLink(): the clipboard needs the click's user activation. */
  protected copy(): void {
    if (!this.origin()) return; // not running in the browser yet
    const url = this.feedUrl();
    copyLink(url, this.i18n.t().calendar.subscribe.title).then((result) => {
      clearTimeout(this.copiedTimer);
      this.copied.set(result === 'copied');
      this.manualUrl.set(result === 'failed' ? url : '');
      if (result === 'copied') this.copiedTimer = setTimeout(() => this.copied.set(false), 2500);
      if (result === 'failed') {
        afterNextRender(
          () => {
            const input = this.manualInput()?.nativeElement;
            input?.focus();
            input?.select();
          },
          { injector: this.injector },
        );
      }
    });
  }
}
