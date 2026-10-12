import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { I18n } from '../core/i18n/i18n';
import { March } from '../core/kvk-api';
import { MarchBuild } from './march-build';
import { Icon } from './icon';

let nextId = 0;

/** The build of someone's march (MarchBuild) in a dialog, opened from its tile in the march row; Esc closes it. */
@Component({
  selector: 'app-build-dialog',
  imports: [Icon, MarchBuild],
  template: `
    <dialog #dialog class="modal build-dialog" (close)="closed()" [attr.aria-labelledby]="id">
      @if (state(); as s) {
        <div class="modal__body">
          <header class="modal__head">
            <div class="modal__heading">
              <h2 class="modal__title" [id]="id">{{ t().title }}</h2>
              @if (s.title) {
                <p class="modal__eyebrow">{{ s.title }}</p>
              }
            </div>
            <button type="button" class="modal__close" [attr.aria-label]="i18n.t().kvk.close" (click)="close()">
              <svg appIcon="x"></svg>
            </button>
          </header>
          <app-march-build [march]="s.march" [portraits]="s.portraits" [numbered]="s.numbered" />
        </div>
      }
    </dialog>
  `,
  styles: `
    .build-dialog {
      width: min(900px, 100% - 32px);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuildDialog {
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches.build);
  protected readonly id = `build-dialog-${++nextId}`;
  protected readonly state = signal<{
    march: March;
    portraits: ReadonlyMap<string, string>;
    title: string;
    numbered: boolean;
  } | null>(null);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private opener: HTMLElement | null = null;

  /** `event` is the click on the tile – the focus returns there */
  open(march: March, portraits: ReadonlyMap<string, string>, title: string, numbered: boolean, event?: Event): void {
    this.opener = (event?.currentTarget as HTMLElement | null) ?? null;
    this.state.set({ march, portraits, title, numbered });
    this.dialog().nativeElement.showModal();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected closed(): void {
    this.state.set(null);
    this.opener?.focus();
  }
}
