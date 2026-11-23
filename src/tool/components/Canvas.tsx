'use client';

import React from 'react';
import {
  estimateCounts,
  nextRuns,
  parseCron,
  runsPerHour,
  timezoneLabel,
  unreachableDomDays,
} from '../types';
import type { ToolState } from '../state';
import { PRESETS } from '../ui-shared';

interface CanvasProps {
  state: ToolState;
  onChange?: (state: ToolState) => void;
  onSaveHistory?: (text: string) => void;
}

const MAX_BAR_HEIGHT_PX = 120;

function CopyButton({ value, testid }: { value: string; testid?: string }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }, [value]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      data-testid={testid}
      className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
      aria-label="Copy"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export const Canvas: React.FC<CanvasProps> = ({ state, onChange, onSaveHistory }) => {
  const update = (patch: Partial<ToolState>) => onChange?.({ ...state, ...patch });
  const parsed = parseCron(state.expression);
  const counts = parsed.ok && parsed.fields ? estimateCounts(parsed.fields) : null;
  const perHour = parsed.ok && parsed.fields ? runsPerHour(parsed.fields) : null;
  const maxHourValue = perHour ? Math.max(...perHour, 1) : 1;
  const unreachable = parsed.ok && parsed.fields ? unreachableDomDays(parsed.fields) : [];
  // Recomputed on each render; cheap for the field sets this tool handles.
  const nextList =
    parsed.ok && parsed.fields ? nextRuns(parsed.fields, new Date(), state.nextCount) : [];

  return (
    <div className="p-4 space-y-6 overflow-y-auto h-full" data-testid="cron-canvas">
      <div>
        <label
          className="block text-xs font-medium text-gray-700 dark:text-gray-300"
          htmlFor="cron-expression"
        >
          Cron expression (minute hour dom month dow)
        </label>
        <input
          id="cron-expression"
          type="text"
          value={state.expression}
          onChange={(e) => update({ expression: e.target.value })}
          data-testid="input-cron-expression"
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          placeholder="*/15 * * * *"
          spellCheck={false}
        />
        {!parsed.ok && state.expression.trim().length > 0 ? (
          <p
            className="mt-1 text-xs text-red-600 dark:text-red-400"
            data-testid="cron-error"
            role="alert"
          >
            {parsed.error}
          </p>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Presets
        </h3>
        <div className="flex flex-wrap gap-2" data-testid="preset-grid">
          {PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => update({ expression: preset.value })}
              title={preset.value}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                state.expression.trim() === preset.value
                  ? 'border-cyan-500 bg-cyan-50 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-100'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="rounded-lg border border-gray-200 bg-white p-4 text-center dark:border-gray-800 dark:bg-gray-900"
        data-testid="result-card"
        role="status"
      >
        <span className="mb-1 block text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400">
          Estimated schedule
        </span>
        {counts ? (
          <span className="block font-mono text-2xl font-bold" data-testid="result-main">
            {counts.perDay}/day · {counts.perYear}/year
          </span>
        ) : (
          <span
            className="block font-mono text-2xl font-bold text-gray-400"
            data-testid="result-main"
          >
            —
          </span>
        )}
        <span
          className="mt-2 block text-xs text-gray-600 dark:text-gray-300"
          data-testid="result-summary"
        >
          All times use your local timezone ({timezoneLabel(new Date())}); nothing is uploaded.
        </span>
      </div>

      {counts ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="counts-grid">
          {(
            [
              ['perHour', 'per hour'],
              ['perDay', 'per day'],
              ['perWeek', 'per week'],
              ['perMonth', 'per month'],
              ['perYear', 'per year'],
            ] as const
          ).map(([key, label]) => (
            <div
              key={key}
              className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-800 dark:bg-gray-900/50"
              data-testid={`count-${key}`}
            >
              <div className="font-mono text-lg font-bold">
                {Number.isInteger(counts[key]) ? counts[key] : counts[key].toFixed(1)}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {label}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {perHour ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Runs by hour of day
          </h3>
          <div
            className="flex items-end gap-[2px]"
            data-testid="hour-chart"
            role="img"
            aria-label="Bar chart of runs per hour of day"
          >
            {perHour.map((value, hour) => (
              <div key={hour} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t ${value > 0 ? 'bg-cyan-500' : 'bg-gray-200 dark:bg-gray-800'}`}
                  style={{
                    height: `${Math.max((value / maxHourValue) * MAX_BAR_HEIGHT_PX, value > 0 ? 4 : 2)}px`,
                  }}
                  title={`${String(hour).padStart(2, '0')}:00 — ${value} runs`}
                  data-testid={`hour-bar-${hour}`}
                />
                <span className="text-[9px] text-gray-400">{hour}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {unreachable.length > 0 ? (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
          data-testid="unreachable-warning"
        >
          ⚠️ Day(s) of month {unreachable.join(', ')} will never trigger: no month in the schedule
          has that many days.
        </div>
      ) : null}

      {nextList.length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Next {nextList.length} runs
            </h3>
            <CopyButton
              value={nextList.map((d) => d.toLocaleString()).join('\n')}
              testid="copy-next-runs"
            />
          </div>
          <ol className="space-y-1 text-xs" data-testid="next-runs-list">
            {nextList.map((run, i) => (
              <li
                key={run.toISOString()}
                className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-1.5 font-mono dark:border-gray-800"
              >
                <span className="text-gray-700 dark:text-gray-300">
                  {run.toLocaleString(undefined, {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="text-gray-400">#{i + 1}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          History
        </h3>
        {state.history.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400" data-testid="history-empty">
            No saved estimates yet.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="history-list">
            {state.history.map((entry, i) => (
              <li
                key={`${entry.createdAt}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-xs dark:border-gray-800"
              >
                <span className="text-gray-700 dark:text-gray-300">{entry.text}</span>
                <CopyButton value={entry.text} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {counts ? (
        <div className="text-center">
          <button
            type="button"
            data-testid="btn-save-history"
            onClick={() => onSaveHistory?.(state.expression.trim())}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Save estimate to history
          </button>
        </div>
      ) : null}
    </div>
  );
};
