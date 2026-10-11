import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { I18n } from '../core/i18n/i18n';
import { Icon } from './icon';

/** one screenshot of the viewer: the file, its size and what it shows ("Výbava") */
export interface ViewerImage {
  url: string;
  width: number;
  height: number;
  label: string;
}

let nextId = 0;

/**
 * A screenshot opened from its thumbnail in a dialog on the page, never a new page (Gether 11. 10. 2026: "všade kde
 * kliknem na miniatúru screenshotu nech sa otvára ako popup"). ← → (buttons or keys) between the screenshots of the
 * same march or sign-up; Esc closes it and the focus goes back to the thumbnail.
 */
@Component({
  selector: 'app-image-viewer',
  imports: [Icon],
  template: `
    <dialog #dialog class="modal modal--wide" (close)="closed()" (keydown)="key($event)" [attr.aria-labelledby]="id">
      @if (state(); as v) {
        @let image = v.images[v.index];
        <div class="modal__body">
          <header class="modal__head">
            <div class="modal__heading">
              <h2 class="modal__title" [id]="id">{{ v.title }}</h2>
              <p class="modal__eyebrow">{{ image.label }}</p>
            </div>
            <button type="button" class="modal__close" [attr.aria-label]="t().close" (click)="close()">
              <svg appIcon="x"></svg>
            </button>
          </header>
          <img class="viewer__img" [src]="image.url" [alt]="image.label + ' – ' + v.title" [width]="image.width" [height]="image.height" />
          @if (v.images.length > 1) {
            <div class="viewer__nav">
              <button type="button" class="pill-btn pill-btn--quiet" (click)="step(-1)">
                <svg appIcon="arrow-left"></svg>{{ t().prev }}
              </button>
              <button type="button" class="pill-btn pill-btn--quiet" (click)="step(1)">
                {{ t().next }}<svg appIcon="arrow-right"></svg>
              </button>
            </div>
          }
        </div>
      }
    </dialog>
  `,
  styles: `
    .viewer__img {
      display: block;
      max-width: 100%;
      height: auto;
      max-height: 70dvh;
      margin: 0 auto;
      object-fit: contain;
      border-radius: var(--radius-sm);
    }

    .viewer__nav {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-top: 14px;

      .icon {
        width: 16px;
        height: 16px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageViewer {
  private readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().kvk);
  protected readonly id = `image-viewer-${++nextId}`;
  protected readonly state = signal<{ title: string; images: ViewerImage[]; index: number } | null>(null);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private opener: HTMLElement | null = null;

  /** `event` is the click on the thumbnail – the focus returns there */
  open(title: string, images: ViewerImage[], index: number, event?: Event): void {
    if (!images.length) return;
    this.opener = (event?.currentTarget as HTMLElement | null) ?? null;
    this.state.set({ title, images, index: Math.max(0, index) });
    this.dialog().nativeElement.showModal();
  }

  protected step(by: number): void {
    this.state.update((v) => (v ? { ...v, index: (v.index + by + v.images.length) % v.images.length } : v));
  }

  protected key(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') this.step(1);
    if (event.key === 'ArrowLeft') this.step(-1);
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected closed(): void {
    this.state.set(null);
    this.opener?.focus();
  }
}
