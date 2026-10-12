import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Formation } from '../core/armory';

/**
 * A formation as its game icon only, the name in alt and title (Gether 12. 10. 2026: "len samotnú ikonu formácie bez
 * textu"; only formations with an icon are offered). Sized by the host (width/height).
 */
@Component({
  selector: 'app-formation-icon',
  template: `<img [src]="formation().icon" [alt]="formation().name" [title]="formation().name" width="96" height="96" />`,
  styles: `
    :host {
      display: inline-grid;
      flex-shrink: 0;
      width: 40px;
      height: 40px;
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormationIcon {
  readonly formation = input.required<Formation>();
}
