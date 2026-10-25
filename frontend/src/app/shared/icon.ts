import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ICONS_VERSION } from './icons-version';

export type IconName =
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up-right'
  | 'bell'
  | 'bell-off'
  | 'calendar-days'
  | 'calendar-off'
  | 'calendar-plus'
  | 'check'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-up'
  | 'clock'
  | 'copy'
  | 'crown'
  | 'discord'
  | 'download'
  | 'eye'
  | 'eye-off'
  | 'facebook'
  | 'flag'
  | 'flame'
  | 'gift'
  | 'hand-helping'
  | 'heart'
  | 'info'
  | 'key-round'
  | 'languages'
  | 'lightbulb'
  | 'link'
  | 'log-in'
  | 'log-out'
  | 'map'
  | 'menu'
  | 'messages-square'
  | 'pencil'
  | 'pin'
  | 'plus'
  | 'repeat'
  | 'reply'
  | 'scale'
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
  // ?v= changes with the sprite, so a cached old icons.svg never hides a new icon
  protected readonly href = computed(() => `/icons.svg?v=${ICONS_VERSION}#${this.appIcon()}`);
}
