import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { I18n } from '../core/i18n/i18n';

/**
 * After signing in with Discord the player agrees to the terms of use once per version (Gether 12. 10. 2026: a
 * recorded agreement instead of a link in the footer only). The server saves the version and the time and refuses
 * marches and KvK sign-ups until then. A modal that only "Súhlasím" or signing out closes; it steps aside on the terms
 * and privacy pages, so the player can read them first. No cookie banner: the site sets only the cookies it needs.
 */
@Component({
  selector: 'app-terms-gate',
  imports: [RouterLink],
  template: `
    @let g = i18n.t().termsGate;
    <dialog #dialog class="modal" autofocus tabindex="-1" aria-labelledby="terms-gate-title" aria-describedby="terms-gate-text" (cancel)="$event.preventDefault()">
      <div class="modal__body">
        <header class="modal__head">
          <div class="modal__heading">
            <h2 class="modal__title" id="terms-gate-title">{{ g.title }}</h2>
            <p class="modal__eyebrow">{{ g.eyebrow }}</p>
          </div>
        </header>
        <div class="gate__text" id="terms-gate-text">
          <p>{{ g.text }}</p>
          <p class="gate__cookies">{{ g.cookies }}</p>
        </div>
        <p class="gate__links">
          <a [routerLink]="i18n.path('terms')">{{ i18n.t().nav.terms }}</a>
          <a [routerLink]="i18n.path('privacy')">{{ i18n.t().nav.privacy }}</a>
        </p>
        <div class="gate__actions">
          <button type="button" class="pill-btn" [attr.aria-disabled]="saving() || null" (click)="accept()">{{ g.accept }}</button>
          <button type="button" class="pill-btn pill-btn--quiet" (click)="logout()">{{ g.logout }}</button>
        </div>
        @if (failed()) {
          <p class="gate__error" role="alert">{{ g.failed }}</p>
        }
      </div>
    </dialog>
  `,
  styles: `
    .gate__text {
      display: grid;
      gap: 10px;
      color: var(--text-dim);
      text-wrap: pretty;
    }

    .gate__cookies {
      font-size: 0.875rem;
      color: var(--text-mute);
    }

    .gate__links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 20px;

      a {
        color: var(--gold-300);
        text-decoration: underline;
        text-underline-offset: 3px;
      }
    }

    .gate__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 12px;
    }

    .gate__error {
      color: var(--red-300);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsGate {
  protected readonly i18n = inject(I18n);
  private readonly auth = inject(Auth);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly saving = signal(false);
  protected readonly failed = signal(false);
  /** a signed-in player without the current terms, outside the pages they may want to read first */
  private readonly asking = computed(() => {
    const user = this.auth.user();
    const page = this.i18n.page();
    return !!user && !user.terms_accepted && page !== 'terms' && page !== 'privacy';
  });

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.asking() && !dialog.open) dialog.showModal();
      else if (!this.asking() && dialog.open) dialog.close();
    });
  }

  protected async accept(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.failed.set(false);
    try {
      await this.auth.acceptTerms();
    } catch {
      this.failed.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  protected async logout(): Promise<void> {
    try {
      await this.auth.logout();
    } catch {
      this.failed.set(true);
    }
  }
}
