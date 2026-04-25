// Smoke tests for the streaksService runtime-validation guard.
//
// Deliberately narrow: only tests the pure function `isValidTickRow`.
// The RPC call itself (`tickStreak`) is an integration concern that
// requires mocking Supabase — out of scope for the phase-2 scaffold.
//
// What regressions this catches:
//   - Someone "tidies up" the guard and accidentally widens the type,
//     e.g. drops a required field check.
//   - Someone adds a new StreakType on the server and forgets to update
//     the enum here.

import { isValidTickRow } from '../streaksService';

describe('isValidTickRow', () => {
  const valid = {
    streak_type: 'scan',
    current_streak: 3,
    best_streak: 10,
    did_increment: true,
    last_activity_date: '2026-04-24',
  };

  it('accepts a well-formed row', () => {
    expect(isValidTickRow(valid)).toBe(true);
  });

  it('accepts null last_activity_date (never-activity case)', () => {
    expect(isValidTickRow({ ...valid, last_activity_date: null })).toBe(true);
  });

  it('rejects unknown streak_type', () => {
    expect(isValidTickRow({ ...valid, streak_type: 'login' })).toBe(false);
  });

  it('rejects string where number expected', () => {
    expect(isValidTickRow({ ...valid, current_streak: '3' })).toBe(false);
  });

  it('rejects missing fields', () => {
    const { did_increment, ...missing } = valid;
    expect(isValidTickRow(missing)).toBe(false);
  });

  it('rejects non-object inputs', () => {
    expect(isValidTickRow(null)).toBe(false);
    expect(isValidTickRow(undefined)).toBe(false);
    expect(isValidTickRow('scan')).toBe(false);
    expect(isValidTickRow(42)).toBe(false);
  });
});
