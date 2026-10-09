import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AllianceSection } from './alliance/alliance';
import { Community } from './community/community';
import { Guides } from './guides/guides';
import { Hero } from './hero/hero';
import { Intro } from './intro/intro';
import { Marquee } from './marquee/marquee';
import { Notify } from './notify/notify';

@Component({
  selector: 'app-home',
  imports: [Hero, Intro, Marquee, Notify, AllianceSection, Guides, Community],
  template: `
    <app-hero />
    <app-intro />
    <app-marquee />
    <app-notify />
    <app-alliance />
    <app-guides />
    <app-community />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {}
