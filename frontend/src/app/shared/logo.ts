import { ChangeDetectionStrategy, Component } from '@angular/core';

let nextId = 0;

/** Kingdom mark: golden shield with a crown (same artwork as favicon.svg). */
@Component({
  selector: 'svg[appLogo]',
  template: `
    <svg:defs>
      <svg:linearGradient [attr.id]="id" x1="0" y1="0" x2="0" y2="1">
        <svg:stop offset="0" stop-color="#ffe39a" />
        <svg:stop offset=".55" stop-color="#f2b84b" />
        <svg:stop offset="1" stop-color="#b9802a" />
      </svg:linearGradient>
    </svg:defs>
    <svg:path [attr.fill]="fill" d="M32 3 L57 11 V30 C57 45.5 46.5 55.5 32 61 C17.5 55.5 7 45.5 7 30 V11 Z" />
    <svg:path fill="#0c1f3d" d="M32 8.5 L52 15 V30 C52 42.5 43.6 50.8 32 55.4 C20.4 50.8 12 42.5 12 30 V15 Z" />
    <svg:path [attr.fill]="fill" d="M18.5 25 L25 32 L32 20.5 L39 32 L45.5 25 L43.2 40 H20.8 Z M20.8 42.5 H43.2 V46 H20.8 Z" />
  `,
  host: { viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Logo {
  protected readonly id = `logo-gold-${nextId++}`;
  protected readonly fill = `url(#${this.id})`;
}
