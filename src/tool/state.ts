import type { HistoryEntry } from './types';

export interface ToolState {
  /** Raw cron expression (5 fields). */
  expression: string;
  /** Number of upcoming runs to list. */
  nextCount: number;
  /** Saved estimate history, newest first. */
  history: HistoryEntry[];
}

export const DEFAULT_STATE: ToolState = {
  expression: '*/15 * * * *',
  nextCount: 5,
  history: [],
};

/** Maximum number of upcoming run times kept in the state. */
export const MAX_NEXT_RUNS = 10;

/** Cap for saved history entries. */
export const MAX_HISTORY = 20;
