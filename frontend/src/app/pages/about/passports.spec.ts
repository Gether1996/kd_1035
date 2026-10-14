import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PAGE_PRICE, Passports, passportsFor } from './passports';

describe('passports', () => {
  it('gives the pages of the bracket; a limit belongs to the lower row; troops in the hospital do not count', () => {
    expect(passportsFor(9_000_000).pages).toBe(1);
    expect(passportsFor(10_000_000).pages).toBe(1);
    expect(passportsFor(10_000_001).pages).toBe(2);
    expect(passportsFor(42_500_000)).toEqual({ power: 42_500_000, pages: 15, credits: 15 * PAGE_PRICE, row: 7 });
    expect(passportsFor(250_000_000).pages).toBe(75);
    // 42.5 M − 400 000 T4 × 4 − 100 000 T5 × 10 = 39.9 M → 12 pages
    expect(passportsFor(42_500_000, { t4: 400_000, t5: 100_000 }).pages).toBe(12);
  });

  it('shows the pages, the credits and what a little less power would cost', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Passports);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('tbody tr').length).toBe(20);

    const input = el.querySelector<HTMLInputElement>('#passports-power')!;
    input.value = '42,5';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const result = el.querySelector('.calc__result')!.textContent!.replace(/\s+/g, ' ');
    expect(result).toContain('15 pasov');
    expect(result).toMatch(/9\s000\s000 aliančných kreditov/);
    expect(result).toContain('Pri sile do 40 mil. by stačilo 12 pasov.');
    expect(el.querySelector('.is-current td')?.textContent).toContain('40');
  });
});
