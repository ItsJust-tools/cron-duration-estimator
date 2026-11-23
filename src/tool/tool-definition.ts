import type { Tool, DeserializeResult } from '@itsjust/core';
import toolConfig from './tool.config';
import { DEFAULT_STATE, MAX_HISTORY, MAX_NEXT_RUNS, type ToolState } from './state';
import { historyText, resultText, summaryText, type HistoryEntry } from './types';

/** Serialize tool state into a compact JSON string for share/import. */
export function serializeState(state: ToolState): string {
  return JSON.stringify({
    expression: state.expression,
    nextCount: state.nextCount,
    history: state.history,
  });
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function clampNumberOr(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value);
    return Math.min(max, Math.max(min, rounded));
  }
  return fallback;
}

function validHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is HistoryEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as HistoryEntry).text === 'string' &&
        typeof (entry as HistoryEntry).createdAt === 'string'
    )
    .slice(0, MAX_HISTORY);
}

/** Validate and recover tool state from an arbitrary payload. */
export function deserializeState(data: unknown): DeserializeResult<ToolState> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      success: false,
      error: 'Invalid data format: expected cron duration estimator state object',
    };
  }
  const v = data as Record<string, unknown>;
  const state: ToolState = {
    expression: stringOr(v.expression, DEFAULT_STATE.expression),
    nextCount: clampNumberOr(v.nextCount, DEFAULT_STATE.nextCount, 1, MAX_NEXT_RUNS),
    history: validHistory(v.history),
  };
  return { success: true, data: state };
}

/** Append a history entry to state, capped at MAX_HISTORY, newest first. */
export function withHistory(state: ToolState, text: string, now = new Date()): ToolState {
  const entry: HistoryEntry = { text, createdAt: now.toISOString() };
  return { ...state, history: [entry, ...state.history].slice(0, MAX_HISTORY) };
}

/** True when a serialized string round-trips back to the same state. */
export function roundTrips(state: ToolState): boolean {
  try {
    const restored = deserializeState(JSON.parse(serializeState(state)));
    return restored.success && JSON.stringify(restored.data) === JSON.stringify(state);
  } catch {
    return false;
  }
}

export const cronDurationEstimatorTool: Tool<ToolState> = {
  id: toolConfig.id,
  name: toolConfig.name,
  version: toolConfig.version,
  config: toolConfig,
  initialState: { ...DEFAULT_STATE },
  serialize: serializeState,
  deserialize: deserializeState,
  exporters: [
    { format: 'png', loader: () => import('./exporters/png') },
    { format: 'jpeg', loader: () => import('./exporters/jpeg') },
    { format: 'webp', loader: () => import('./exporters/webp') },
    { format: 'pdf', loader: () => import('./exporters/pdf') },
  ],
};

export { resultText, summaryText, historyText };
