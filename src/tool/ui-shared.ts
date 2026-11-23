import type { ToolState } from './state';

export interface HistoryEntry {
  text: string;
  createdAt: string;
}

export const MAX_NEXT_RUNS = 10;

export const MAX_HISTORY = 20;

export interface ToolStateShape {
  expression: string;
  nextCount: number;
  history: HistoryEntry[];
}

import { DEFAULT_STATE as _DEFAULT_STATE } from './state';

export type { ToolState };

export const DEFAULT_STATE = _DEFAULT_STATE;

export const PRESETS: { label: string; value: string }[] = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at noon', value: '0 12 * * *' },
  { label: 'Weekly (Sun 00:00)', value: '0 0 * * 0' },
  { label: 'Monthly (1st 00:00)', value: '0 0 1 * *' },
  { label: 'Yearly (Jan 1)', value: '0 0 1 1 *' },
  { label: 'Weekdays at 09:00', value: '0 9 * * 1-5' },
];
