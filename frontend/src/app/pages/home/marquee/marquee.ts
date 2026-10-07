import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ScrollFx } from '../../../shared/scroll-fx';

/** Two oversized rows of text sliding in opposite directions while the page scrolls. */
@Component({
  selector: 'app-marquee',
  imports: [ScrollFx],
  template: `
    <div class="marquee" appScrollFx aria-hidden="true">
      @for (row of rows; track $index) {
        <div class="row" [class.row--alt]="$odd">
          @for (word of row; track $index) {
            <span>{{ word }}</span><i></i>
          }
        </div>
      }
    </div>
  `,
  styleUrl: './marquee.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Marquee {
  private readonly words = ['Kingdom 1035', 'CZ', 'SK', 'Rise of Kingdoms'];
  protected readonly rows = [
    [...this.words, ...this.words, ...this.words],
    [...this.words, ...this.words, ...this.words].reverse(),
  ];
}
