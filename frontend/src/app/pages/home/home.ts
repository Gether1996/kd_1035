import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AllianceSection } from './alliance/alliance';
import { Community } from './community/community';
import { Guides } from './guides/guides';
import { HallTeaser } from './hall-teaser/hall-teaser';
import { Hero } from './hero/hero';
import { Intro } from './intro/intro';
import { Marquee } from './marquee/marquee';
import { Notify } from './notify/notify';
import { Upcoming } from './upcoming/upcoming';

@Component({
  selector: 'app-home',
  imports: [Hero, Intro, Marquee, Notify, Upcoming, AllianceSection, HallTeaser, Guides, Community],
  template: `
    <app-hero />
    <app-intro />
    <app-marquee />
    <app-notify />
    <app-upcoming />
    <app-alliance />
    <!-- approved players only, further down the page (Gether 28. 10. 2026) -->
    <app-hall-teaser />
    <app-guides />
    <app-community />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {}
