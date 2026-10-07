import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type IconName =
  | 'arrow-left'
  | 'arrow-right'
  | 'calendar-days'
  | 'chevron-down'
  | 'chevron-right'
  | 'crown'
  | 'discord'
  | 'facebook'
  | 'flag'
  | 'flame'
  | 'gift'
  | 'hand-helping'
  | 'languages'
  | 'map'
  | 'menu'
  | 'shield'
  | 'swords'
  | 'users'
  | 'x';

/** `<svg appIcon="swords" />` – icon from the public/icons.svg sprite, colored by `currentColor`. */
@Component({
  selector: 'svg[appIcon]',
  template: '<svg:use [attr.href]="href()" />',
  host: { class: 'icon', 'aria-hidden': 'true', focusable: 'false' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly appIcon = input.required<IconName>();
  protected readonly href = computed(() => `/icons.svg#${this.appIcon()}`);
}
