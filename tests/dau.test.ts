import { describe, expect, it } from 'vitest';
import { SNAPS, dauLift, formatDauK, formatLift } from '../src/analytics/dau';

describe('DAU calculator', () => {
  it('base 34% × 2.26 / 7.5 = +10.2%, about +153K on 1.5M DAU; snaps 5.1% and 16.9%', () => {
    const base = dauLift(SNAPS.base);
    expect(formatLift(base.lift)).toBe('+10.2%');
    expect(formatDauK(base.extraDau)).toBe('+153K');
    expect(formatLift(dauLift(SNAPS.low).lift)).toBe('+5.1%');
    expect(formatLift(dauLift(SNAPS.high).lift)).toBe('+16.9%');
  });
});
