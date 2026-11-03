import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { March } from '../../core/kvk-api';
import { BuildEditor } from './build-editor';

describe('BuildEditor: Načítať z marchu (Gether 3. 11. 2026)', () => {
  it('copies an own march into the draft without saving it', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(BuildEditor);
    const source = {
      id: 9,
      position: 2,
      kind: 'cavalry',
      primary: 'Attila',
      secondary: 'Takeda Shingen',
      gear: { weapon: { item: 'sacred-dominion', crit: true, iconic: 5 } },
      formation: 'wedge',
      inscriptions: ['common-brave'],
      attack: 12,
      defense: 11,
      health: 13,
      damage: 4,
    } as unknown as March;
    fixture.componentRef.setInput('sources', [source]);
    const editor = fixture.componentInstance as unknown as {
      loadFrom(id: string): void;
      sourceLabel(m: March): string;
      draft(): { gear: Record<string, unknown>; formation: string; inscriptions: string[]; stats: Record<string, number | null> };
    };
    expect(editor.sourceLabel(source)).toBe('2. Attila + Takeda Shingen');
    editor.loadFrom('9');
    expect(editor.draft()).toMatchObject({
      formation: 'wedge',
      inscriptions: ['common-brave'],
      stats: { attack: 12, defense: 11, health: 13, damage: 4 },
    });
    expect(editor.draft().gear['weapon']).toEqual({ item: 'sacred-dominion', crit: true, iconic: 5 });
    // an unknown choice leaves the draft as it is
    editor.loadFrom('');
    expect(editor.draft().formation).toBe('wedge');
  });
});
