import { describe, it, expect } from 'vitest';
import {
  parseCron,
  parseField,
  estimateCounts,
  nextRuns,
  runsPerHour,
  unreachableDomDays,
  daysInMonth,
  matchingDaysInYear,
  timezoneLabel,
} from '@/tool/types';
import { deserializeState, serializeState, withHistory, roundTrips } from '@/tool/tool-definition';
import { cronDurationEstimatorTool } from '@/tool/tool-definition';
import { DEFAULT_STATE, MAX_HISTORY, MAX_NEXT_RUNS, type ToolState } from '@/tool/state';

const state = (patch: Partial<ToolState> = {}): ToolState => ({ ...DEFAULT_STATE, ...patch });

describe('parseCron - validation', () => {
  it('parses the common schedules', () => {
    expect(parseCron('* * * * *').ok).toBe(true);
    expect(parseCron('*/5 * * * *').ok).toBe(true);
    expect(parseCron('0 9 * * 1-5').ok).toBe(true);
    expect(parseCron('30 2 1,15 * 0').ok).toBe(true);
  });

  it('rejects wrong field counts', () => {
    expect(parseCron('* * * *').ok).toBe(false);
    expect(parseCron('* * * * * *').ok).toBe(false);
    expect(parseCron('').ok).toBe(false);
  });

  it('rejects out-of-range values', () => {
    expect(parseCron('60 * * * *').ok).toBe(false);
    expect(parseCron('* 24 * * *').ok).toBe(false);
    expect(parseCron('* * 32 * *').ok).toBe(false);
    expect(parseCron('* * * 13 *').ok).toBe(false);
    expect(parseCron('* * * * 8').ok).toBe(false);
  });

  it('rejects malformed syntax', () => {
    expect(parseCron('a * * * *').ok).toBe(false);
    expect(parseCron('*/0 * * * *').ok).toBe(false);
    expect(parseCron('5-1 * * * *').ok).toBe(false);
    expect(parseCron('1-2-3 * * * *').ok).toBe(false);
  });
});

describe('parseField - step, range and list expansion', () => {
  it('expands star/5 steps', () => {
    expect(parseField('*/5', 0, 59)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });

  it('expands 1-15/2 ranges with steps', () => {
    expect(parseField('1-15/2', 1, 31)).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
  });

  it('expands comma lists', () => {
    expect(parseField('1,5,9', 0, 59)).toEqual([1, 5, 9]);
  });

  it('combines lists, ranges and steps', () => {
    expect(parseField('0,10-12,30/10', 0, 59)).toEqual([0, 10, 11, 12, 30, 40, 50]);
  });

  it('treats step on a single value as start..max', () => {
    expect(parseField('10/20', 0, 59)).toEqual([10, 30, 50]);
  });

  it('honors min/max bounds', () => {
    expect(parseField('0', 1, 12)).toBeNull();
    expect(parseField('13', 1, 12)).toBeNull();
  });

  it('maps dow 7 to 0 (Sunday)', () => {
    expect(parseField('0,7', 0, 7, true)).toEqual([0]);
    expect(parseField('7', 0, 7, true)).toEqual([0]);
  });
});

describe('estimateCounts - common schedules', () => {
  it('every minute = 1440/day and 60/hour', () => {
    const parsed = parseCron('* * * * *');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    const counts = estimateCounts(parsed.fields);
    expect(counts.perHour).toBe(60);
    expect(counts.perDay).toBe(1440);
    expect(counts.perWeek).toBe(10080);
    expect(counts.perYear).toBe(525600);
  });

  it('hourly = 24/day, minute-level hourly field', () => {
    const parsed = parseCron('0 * * * *');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    const counts = estimateCounts(parsed.fields);
    expect(counts.perHour).toBe(1);
    expect(counts.perDay).toBe(24);
    expect(counts.perWeek).toBe(168);
    expect(counts.perYear).toBe(8760);
  });

  it('daily at midnight = 1/day, 365/year', () => {
    const parsed = parseCron('0 0 * * *');
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    const counts = estimateCounts(parsed.fields);
    expect(counts.perDay).toBe(1);
    expect(counts.perYear).toBe(365);
  });

  it('*/15 = 96/day', () => {
    const parsed = parseCron('*/15 * * * *');
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    const counts = estimateCounts(parsed.fields);
    expect(counts.perHour).toBe(4);
    expect(counts.perDay).toBe(96);
  });

  it('weekdays 09:00 = 5/day-week, 260/year', () => {
    const parsed = parseCron('0 9 * * 1-5');
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    const counts = estimateCounts(parsed.fields);
    expect(counts.perDay).toBe(1);
    expect(counts.perWeek).toBe(7);
    expect(counts.perYear).toBe(52 * 5);
  });

  it('monthly on the 1st = 12/year', () => {
    const parsed = parseCron('0 0 1 * *');
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    const counts = estimateCounts(parsed.fields);
    expect(counts.perYear).toBe(12);
  });
});

describe('unreachableDomDays - never-triggering dates', () => {
  it('flags Feb 30 and friends via day 30-31 month filters', () => {
    const parsed = parseCron('0 0 30,31 2 *');
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    // February never has 30 or 31 days
    expect(unreachableDomDays(parsed.fields)).toEqual([30, 31]);
  });

  it('flags day 31 when only February is selected', () => {
    const parsed = parseCron('0 0 31 2 *');
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    expect(unreachableDomDays(parsed.fields)).toEqual([31]);
  });

  it('day 31 in all months is reachable', () => {
    const parsed = parseCron('0 0 31 * *');
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    expect(unreachableDomDays(parsed.fields)).toEqual([]);
  });

  it('no unreachable days for wildcard dom', () => {
    const parsed = parseCron('* * * * *');
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    expect(unreachableDomDays(parsed.fields)).toEqual([]);
  });
});

describe('nextRuns - deterministic from a fixed start', () => {
  it('is sorted and correct for */15 starting 2026-01-01 00:00', () => {
    const parsed = parseCron('*/15 * * * *');
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    const from = new Date(2026, 0, 1, 0, 0, 0);
    const runs = nextRuns(parsed.fields, from, 5);
    expect(runs.map((d) => d.getTime())).toEqual(
      [...runs.map((d) => d.getTime())].sort((a, b) => a - b)
    );
    expect(runs[0]?.getMinutes()).toBe(0);
    expect(runs[1]?.getMinutes()).toBe(15);
    expect(runs[2]?.getMinutes()).toBe(30);
    expect(runs[3]?.getMinutes()).toBe(45);
    expect(runs[4]?.getHours()).toBe(1);
  });

  it('daily midnight list crosses days correctly', () => {
    const parsed = parseCron('0 0 * * *');
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    const from = new Date(2026, 0, 1, 12, 0, 0);
    const runs = nextRuns(parsed.fields, from, 3);
    expect(runs.map((d) => d.getDate())).toEqual([2, 3, 4]);
    for (const run of runs) {
      expect(run.getHours()).toBe(0);
      expect(run.getMinutes()).toBe(0);
    }
  });

  it('respects day-of-week constraints (weekdays only)', () => {
    const parsed = parseCron('0 9 * * 1-5');
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    // 2026-01-03 is a Saturday
    const from = new Date(2026, 0, 3, 0, 0, 0);
    const runs = nextRuns(parsed.fields, from, 2);
    for (const run of runs) {
      expect([1, 2, 3, 4, 5]).toContain(run.getDay());
      expect(run.getHours()).toBe(9);
    }
    expect(runs[0]?.getTime()).toBeLessThan(runs[1]?.getTime() ?? Infinity);
  });

  it('honors month restrictions', () => {
    const parsed = parseCron('0 0 1 1 *');
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    const from = new Date(2026, 5, 1, 0, 0, 0);
    const runs = nextRuns(parsed.fields, from, 1);
    expect(runs[0]?.getMonth()).toBe(0);
    expect(runs[0]?.getFullYear()).toBe(2027);
    expect(runs[0]?.getDate()).toBe(1);
  });

  it('returns at most count results', () => {
    const parsed = parseCron('* * * * *');
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    const runs = nextRuns(parsed.fields, new Date(2026, 0, 1), 7);
    expect(runs).toHaveLength(7);
  });
});

describe('runsPerHour - chart buckets', () => {
  it('maps minute counts onto the scheduled hours', () => {
    const parsed = parseCron('0,30 9,17 * * *');
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    const buckets = runsPerHour(parsed.fields);
    expect(buckets.filter((v) => v > 0)).toEqual([2, 2]);
    expect(buckets[9]).toBe(2);
    expect(buckets[17]).toBe(2);
    expect(buckets[0]).toBe(0);
  });
});

describe('helpers', () => {
  it('daysInMonth handles leap years', () => {
    expect(daysInMonth(2, 2024)).toBe(29);
    expect(daysInMonth(2, 2026)).toBe(28);
    expect(daysInMonth(1, 2026)).toBe(31);
  });

  it('matchingDaysInYear intersects dom and month filters', () => {
    const parsed = parseCron('0 0 1 1,2 *');
    if (!parsed.ok || !parsed.fields) throw new Error('unreachable');
    const days = matchingDaysInYear(parsed.fields, 2026);
    expect(days).toHaveLength(2);
  });

  it('timezoneLabel formats offsets', () => {
    const utcDate = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
    const label = timezoneLabel(utcDate);
    expect(label).toMatch(/^UTC[+-]\d{2}:\d{2}$/);
  });
});

describe('serialize/deserialize round-trip', () => {
  const full: ToolState = {
    ...DEFAULT_STATE,
    expression: '0 9 * * 1-5',
    nextCount: 3,
    history: [{ text: '0 9 * * 1-5', createdAt: '2026-11-21T10:00:00.000Z' }],
  };

  it('round-trips all fields through serializeState/deserializeState', () => {
    const restored = deserializeState(JSON.parse(serializeState(full)));
    expect(restored.success).toBe(true);
    if (restored.success) {
      expect(restored.data).toEqual(full);
    }
    expect(serializeState(full)).toContain('"expression":"0 9 * * 1-5"');
  });

  it('round-trips via the Tool object', () => {
    const serialized = cronDurationEstimatorTool.serialize(full);
    const restored = cronDurationEstimatorTool.deserialize(JSON.parse(serialized));
    expect(restored.success).toBe(true);
    if (restored.success) {
      expect(restored.data).toEqual(full);
    }
  });

  it('keeps URL share state round-trip safe', () => {
    expect(roundTrips(full)).toBe(true);
    expect(roundTrips(DEFAULT_STATE)).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(deserializeState(null).success).toBe(false);
    expect(deserializeState('string').success).toBe(false);
    expect(deserializeState([1, 2]).success).toBe(false);
    expect(deserializeState(undefined).success).toBe(false);
  });

  it('falls back to defaults for missing fields', () => {
    const restored = deserializeState({});
    expect(restored.success).toBe(true);
    if (restored.success) {
      expect(restored.data.expression).toBe(DEFAULT_STATE.expression);
      expect(restored.data.nextCount).toBe(DEFAULT_STATE.nextCount);
      expect(restored.data.history).toEqual([]);
    }
  });

  it('clamps nextCount into the valid range', () => {
    const tooSmall = deserializeState({ nextCount: 0 });
    if (tooSmall.success) expect(tooSmall.data.nextCount).toBe(1);
    const tooBig = deserializeState({ nextCount: 999 });
    if (tooBig.success) expect(tooBig.data.nextCount).toBe(MAX_NEXT_RUNS);
    const valid = deserializeState({ nextCount: 7 });
    if (valid.success) expect(valid.data.nextCount).toBe(7);
  });

  it('filters invalid history entries and caps length', () => {
    const entries = Array.from({ length: MAX_HISTORY + 5 }, (_, i) => ({
      text: `entry ${i}`,
      createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
    }));
    const restored = deserializeState({ history: [...entries, 'bad', { text: 'x' }] });
    expect(restored.success).toBe(true);
    if (restored.success) {
      expect(restored.data.history.length).toBe(MAX_HISTORY);
      expect(restored.data.history[0]?.text).toBe('entry 0');
    }
  });
});

describe('withHistory', () => {
  it('prepends newest entries first', () => {
    const now = new Date('2026-11-21T12:00:00Z');
    let s = state();
    s = withHistory(s, 'one', now);
    s = withHistory(s, 'two', now);
    expect(s.history[0]?.text).toBe('two');
    expect(s.history[1]?.text).toBe('one');
    expect(s.history[0]?.createdAt).toBe('2026-11-21T12:00:00.000Z');
  });

  it('caps the history at MAX_HISTORY', () => {
    const now = new Date('2026-11-21T12:00:00Z');
    let s = state();
    for (let i = 0; i < MAX_HISTORY + 10; i++) {
      s = withHistory(s, `entry ${i}`, now);
    }
    expect(s.history.length).toBe(MAX_HISTORY);
    expect(s.history[0]?.text).toBe(`entry ${MAX_HISTORY + 9}`);
  });
});
