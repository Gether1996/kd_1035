import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, linkedSignal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { March } from '../../core/kvk-api';
import { MarchCommander, MarchesApi, marchCommandersUrl } from '../../core/marches-api';
import { Icon } from '../../shared/icon';
import { MarchBuild } from '../../shared/march-build';
import { BuildEditor } from './build-editor';

/**
 * "Prehľad marchov" on /marche?tab=prehlad (Gether 12. 10. 2026): the player's marches as cards with the equipment and
 * armaments clicked together (BuildEditor). The marches themselves – commanders, type, screenshot, typed bonuses –
 * are still added and edited on "Moje marche".
 */
@Component({
  selector: 'app-march-builds',
  imports: [BuildEditor, Icon, MarchBuild],
  template: `
    @let b = t().build;
    @if (data.error()) {
      <p class="state">{{ t().loadError }}</p>
    } @else if (data.hasValue()) {
      @if (marches().length) {
        <p class="builds__intro">{{ b.intro }}</p>
        <ol class="builds">
          @for (march of marches(); track march.id) {
            <li>
              <app-march-build [march]="march" [portraits]="portraits()" [own]="true">
                <button type="button" class="pill-btn pill-btn--quiet" (click)="editor.open(march, $event)">
                  <svg appIcon="pencil"></svg>{{ b.edit }}
                </button>
              </app-march-build>
            </li>
          }
        </ol>
      } @else {
        <p class="state">{{ b.noMarches }}</p>
      }
    } @else {
      <div class="placeholder" aria-hidden="true"></div>
    }
    <app-build-editor #editor (saved)="store($event)" />
  `,
  styles: `
    .state {
      margin: 0;
      padding: 40px 20px;
      border: 1px dashed var(--line-strong);
      border-radius: var(--radius);
      text-align: center;
      color: var(--text-dim);
    }

    .placeholder {
      min-height: 320px;
    }

    :host {
      display: grid;
      gap: 16px;
    }

    .builds__intro {
      margin: 0;
      color: var(--text-dim);
    }

    .builds {
      display: grid;
      gap: 14px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .pill-btn .icon {
      width: 15px;
      height: 15px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarchBuilds {
  protected readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.t().marches);
  protected readonly data = inject(MarchesApi).list();
  protected readonly marches = linkedSignal<March[]>(() => (this.data.hasValue() ? this.data.value().marches : []));

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly commanderData = httpResource<MarchCommander[]>(() => (this.isBrowser ? marchCommandersUrl : undefined));
  protected readonly portraits = computed(
    () => new Map((this.commanderData.hasValue() ? this.commanderData.value() : []).map((c) => [c.name, c.icon])),
  );

  protected store(march: March): void {
    this.marches.update((list) => list.map((m) => (m.id === march.id ? march : m)));
  }
}
