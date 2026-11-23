/**
 * Core logic for the Cron Duration Estimator.
 *
 * Pure helpers: cron parsing, validation, schedule estimation, next-run
 * computation and the bar-chart aggregation used by the canvas.
 */

import type { ToolState } from './state';

export interface HistoryEntry {
  /** Short human readable description of the saved estimate. */
  text: string;
  /** ISO timestamp when the entry was saved. */
  createdAt: string;
}

/** Field indices for a standard 5-field cron expression. */
export const CRON_MINUTE = 0;
export const CRON_HOUR = 1;
export const CRON_DOM = 2;
export const CRON_MONTH = 3;
export const CRON_DOW = 4;

/** Cron uses 0/7 for Sunday; both map to 0 internally. */
export const SUNDAY = 0;

export interface CronFields {
  /** minute 0-59 (sorted unique). */
  minute: number[];
  /** hour 0-23 (sorted unique). */
  hour: number[];
  /** day of month 1-31 (sorted unique); null means wildcard (any day). */
  dom: number[] | null;
  /** month 1-12 (sorted unique). */
  month: number[];
  /** day of week 0-6 where 0=Sunday (sorted unique); null means wildcard. */
  dow: number[] | null;
}

/** Maximum supported year for next-run iteration. */
export const MAX_SCAN_YEARS = 4;

/** Deduplicate and sort a list of field values. */
function dedupeSort(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/** Parse a single cron field expression into its matching values. */
export function parseField(
  field: string,
  min: number,
  max: number,
  dowAliases = false
): number[] | null {
  const text = field.trim();
  if (!text) return null;
  const values = new Set<number>();
  for (const part of text.split(',')) {
    const token = part.trim();
    if (!token) return null;
    // step support: base/step where base is *, ? or a list/range
    const slash = token.indexOf('/');
    let base = token;
    let step = 1;
    if (slash >= 0) {
      base = token.slice(0, slash);
      const stepText = token.slice(slash + 1);
      if (!/^\d+$/.test(stepText)) return null;
      step = Number(stepText);
      if (step < 1) return null;
    }
    let start: number;
    let end: number;
    if (base === '*' || base === '?') {
      start = min;
      end = max;
    } else if (base.includes('-')) {
      const rangeParts = base.split('-');
      if (rangeParts.length !== 2) return null;
      const loText = rangeParts[0];
      const hiText = rangeParts[1];
      if (loText === undefined || hiText === undefined) return null;
      const lo = resolveFieldNumber(loText, min, max, dowAliases);
      const hi = resolveFieldNumber(hiText, min, max, dowAliases);
      if (lo === null || hi === null || lo > hi) return null;
      start = lo;
      end = hi;
    } else {
      const single = resolveFieldNumber(base, min, max, dowAliases);
      if (single === null) return null;
      if (slash < 0) {
        values.add(single);
        continue;
      }
      // single value with step: treat as start..max like vixie cron
      start = single;
      end = max;
    }
    for (let v = start; v <= end; v += step) values.add(v);
  }
  if (values.size === 0) return null;
  // day-of-week: map 7 -> 0 (Sunday) and dedupe
  const list = dedupeSort(dowAliases ? [...values].map((v) => (v === 7 ? 0 : v)) : [...values]);
  return list;
}

function resolveFieldNumber(
  text: string,
  min: number,
  max: number,
  dowAliases: boolean
): number | null {
  const trimmed = text.trim().toUpperCase();
  if (dowAliases) {
    const names = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const index = names.indexOf(trimmed);
    if (index >= 0) return index;
    if (trimmed === 'SEV' || trimmed === '7D') return 0;
  }
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (value < min || value > max) return null;
  return value;
}

export interface ParsedCron {
  ok: boolean;
  error?: string;
  fields?: CronFields;
}

/** Parse and validate a standard 5-field cron expression (no seconds). */
export function parseCron(expression: string): ParsedCron {
  const raw = expression.trim().replace(/\s+/g, ' ');
  if (!raw) return { ok: false, error: 'Cron expression is empty.' };
  const parts = raw.split(' ');
  if (parts.length !== 5) {
    return {
      ok: false,
      error: `Expected 5 fields (minute hour dom month dow), got ${parts.length}.`,
    };
  }
  const minuteText = parts[0];
  const hourText = parts[1];
  const domText = parts[2];
  const monthText = parts[3];
  const dowText = parts[4];
  if (
    minuteText === undefined ||
    hourText === undefined ||
    domText === undefined ||
    monthText === undefined ||
    dowText === undefined
  ) {
    return { ok: false, error: 'Expected 5 fields (minute hour dom month dow).' };
  }
  const minute = parseField(minuteText, 0, 59);
  if (minute === null) return { ok: false, error: `Invalid minute field: "${minuteText}".` };
  const hour = parseField(hourText, 0, 23);
  if (hour === null) return { ok: false, error: `Invalid hour field: "${hourText}".` };
  const dom = parseField(domText, 1, 31);
  if (dom === null) return { ok: false, error: `Invalid day-of-month field: "${domText}".` };
  const month = parseField(monthText, 1, 12);
  if (month === null) return { ok: false, error: `Invalid month field: "${monthText}".` };
  const dow = parseField(dowText, 0, 7, true);
  if (dow === null) return { ok: false, error: `Invalid day-of-week field: "${dowText}".` };
  return {
    ok: true,
    fields: {
      minute,
      hour,
      dom: domText.trim() === '*' || domText.trim() === '?' ? null : dom,
      month,
      dow: dowText.trim() === '*' || dowText.trim() === '?' ? null : dow,
    },
  };
}

/** Days in a month (1-based month). */
export function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Days of month (1-31) that can never trigger because every month in the
 * schedule runs out of days before reaching them (e.g. Feb 30).
 */
export function unreachableDomDays(fields: CronFields): number[] {
  if (fields.dom === null) return [];
  return fields.dom.filter((day) => {
    for (const month of fields.month) {
      for (let year = 2020; year <= 2031; year++) {
        if (day <= daysInMonth(month, year)) return false;
      }
    }
    return true;
  });
}

export interface ScheduleCounts {
  /** Runs per hour for a reference hour where all minutes trigger. */
  perHour: number;
  /** Runs per day for a reference day that matches dom/dow constraints. */
  perDay: number;
  /** Runs in a busy (non-leap) reference week. */
  perWeek: number;
  /** Runs per month for a reference month in a common year. */
  perMonth: number;
  /** Runs per year in a common (non-leap) year. */
  perYear: number;
}

/**
 * Estimate runs per hour/day/week/month/year for a parsed schedule.
 * Estimation uses a common (non-leap) year reference and assumes the schedule
 * fires on matching day-of-month/day-of-week intersections.
 */
export function estimateCounts(fields: CronFields): ScheduleCounts {
  const perHour = fields.minute.length;
  const perDay = perHour * fields.hour.length;
  const perWeek = perDay * 7;
  const perYearCommon = 365;
  const domActive = fields.dom !== null;
  const dowActive = fields.dow !== null;

  if (!domActive && !dowActive) {
    // Every day matches
    const perMonth = (365 / 12) * perDay;
    const perYear = 365 * perDay;
    return { perHour, perDay, perWeek, perMonth, perYear };
  }
  if (domActive && dowActive) {
    // Intersection: count exact matches across one non-leap year (2023-like)
    const days = matchingDaysInYear(fields, 2023);
    const perMonth = (days.length / 12) * perDay;
    const perYear = days.length * perDay;
    return { perHour, perDay, perWeek: perDay * Math.min(7, days.length), perMonth, perYear };
  }
  if (domActive) {
    let yearDays = 0;
    for (let m = 1; m <= 12; m++) {
      for (const d of fields.dom ?? []) {
        if (d <= daysInMonth(m, 2023)) yearDays++;
      }
    }
    const perMonth = (yearDays / 12) * perDay;
    const perYear = yearDays * perDay;
    return { perHour, perDay, perWeek, perMonth, perYear };
  }
  // dow active only: 52 occurrences of each weekday per common year
  const yearDays = 52 * (fields.dow?.length ?? 0);
  const perMonth = (yearDays / 12) * perDay;
  const perYear = yearDays * perDay;
  return { perHour, perDay, perWeek, perMonth, perYear };
}

/** All (year, month, day) triples matching dom/dow constraints; dow 6 & dom set => OR semantics not applied (intersection). */
export function matchingDaysInYear(fields: CronFields, year: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const month of fields.month) {
    for (let day = 1; day <= daysInMonth(month, year); day++) {
      const date = new Date(Date.UTC(year, month - 1, day));
      const dowJs = date.getUTCDay();
      const domMatch = fields.dom === null || fields.dom.includes(day);
      const dowMatch = fields.dow === null || fields.dow.includes(dowJs);
      if (domMatch && dowMatch) out.push([month, day]);
    }
  }
  return out;
}

/** Runs distribution per hour of the day (24 buckets) for bar chart display. */
export function runsPerHour(fields: CronFields): number[] {
  const buckets = new Array<number>(24).fill(0);
  for (const hour of fields.hour) {
    buckets[hour] = fields.minute.length;
  }
  return buckets;
}

/**
 * Compute the next `count` run times from `from` (inclusive), in the timezone
 * implied by the Date object (local time is used; pass a Date already adjusted
 * for the caller's timezone).
 */
export function nextRuns(fields: CronFields, from: Date, count: number): Date[] {
  const results: Date[] = [];
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  const limit = new Date(from.getTime());
  limit.setFullYear(limit.getFullYear() + MAX_SCAN_YEARS);

  while (results.length < count && cursor <= limit) {
    if (!fields.month.includes(cursor.getMonth() + 1)) {
      // jump to the first of the next month
      cursor.setMonth(cursor.getMonth() + 1, 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    const p = {
      m: cursor.getMinutes(),
      h: cursor.getHours(),
      dom: cursor.getDate(),
      mon: cursor.getMonth() + 1,
      dow: cursor.getDay(),
    };
    if (!fields.hour.includes(p.h)) {
      // jump to next hour boundary
      cursor.setMinutes(0, 0, 0);
      cursor.setHours(cursor.getHours() + 1);
      continue;
    }
    const domMatch = fields.dom === null || fields.dom.includes(p.dom);
    const dowMatch = fields.dow === null || fields.dow.includes(p.dow);
    const dayMatch =
      fields.dom !== null && fields.dow !== null ? domMatch || dowMatch : domMatch && dowMatch;
    if (!dayMatch) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    if (!fields.minute.includes(p.m)) {
      // advance to the next matching minute or to the top of the next minute
      const remaining = fields.minute.filter((v) => v > p.m);
      const nextMinute = remaining[0];
      if (nextMinute !== undefined) {
        cursor.setMinutes(nextMinute, 0, 0);
      } else {
        cursor.setMinutes(0, 0, 0);
        cursor.setHours(cursor.getHours() + 1);
      }
      continue;
    }
    results.push(new Date(cursor.getTime()));
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return results;
}

/** Human readable offset label, e.g. "UTC+01:00". */
export function timezoneLabel(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

/** Human readable cron field name list used in the sidebar breakdown. */
export const FIELD_NAMES = [
  'minute (0-59)',
  'hour (0-23)',
  'day of month (1-31)',
  'month (1-12)',
  'day of week (0-6, Sun=0)',
] as const;

/** Human readable result for the current estimator state, or null when invalid. */
export function resultText(state: ToolState): string | null {
  const parsed = parseCron(state.expression);
  if (!parsed.ok || !parsed.fields) return null;
  const counts = estimateCounts(parsed.fields);
  return `${formatCount(counts.perDay)}/day · ${formatCount(counts.perYear)}/year`;
}

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

/** Compact summary used by the status bar and copy actions. */
export function summaryText(state: ToolState): string {
  const parsed = parseCron(state.expression);
  if (!parsed.ok || !parsed.fields) {
    const error = parsed.error ?? 'invalid expression';
    return `Cron: ${error}`;
  }
  const counts = estimateCounts(parsed.fields);
  return `Cron ${state.expression.trim()}: ${formatCount(counts.perDay)}/day, ${formatCount(counts.perYear)}/year`;
}

/** Build a history entry text for the current state. */
export function historyText(state: ToolState): string {
  return summaryText(state);
}
