import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type IconName =
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up-right'
  | 'bell'
  | 'bell-off'
  | 'calendar-days'
  | 'calendar-plus'
  | 'check'
  | 'chevron-down'
  | 'chevron-right'
  | 'clock'
  | 'crown'
  | 'discord'
  | 'download'
  | 'eye-off'
  | 'facebook'
  | 'flag'
  | 'flame'
  | 'gift'
  | 'hand-helping'
  | 'languages'
  | 'log-out'
  | 'map'
  | 'menu'
  | 'pencil'
  | 'plus'
  | 'repeat'
  | 'search'
  | 'send'
  | 'shield'
  | 'swords'
  | 'trash-2'
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
