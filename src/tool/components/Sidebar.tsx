'use client';

import React from 'react';
import { parseCron, FIELD_NAMES } from '../types';
import type { ToolState } from '../state';
import { PRESETS } from '../ui-shared';

interface SidebarProps {
  state: ToolState;
  onChange: (next: ToolState) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ state, onChange }) => {
  const parsed = parseCron(state.expression);
  const values =
    parsed.ok && parsed.fields
      ? [
          parsed.fields.minute.join(', ') || '—',
          parsed.fields.hour.join(', ') || '—',
          parsed.fields.dom === null ? 'any' : parsed.fields.dom.join(', '),
          parsed.fields.month.join(', ') || '—',
          parsed.fields.dow === null ? 'any' : parsed.fields.dow.join(', '),
        ]
      : null;

  return (
    <div className="p-4 space-y-6 text-sm overflow-y-auto h-full" data-testid="cron-sidebar">
      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Schedule presets</h3>
        <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
          {PRESETS.slice(0, 5).map((preset) => (
            <li key={preset.value} className="flex justify-between gap-2">
              <span>{preset.label}</span>
              <span className="font-mono text-gray-500 dark:text-gray-400">{preset.value}</span>
            </li>
          ))}
        </ul>
      </div>

      {values ? (
        <div>
          <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Field breakdown</h3>
          <ul
            className="space-y-1 text-xs text-gray-600 dark:text-gray-300"
            data-testid="field-breakdown"
          >
            {FIELD_NAMES.map((name, i) => (
              <li key={name} className="flex justify-between gap-2">
                <span>{name.split(' (')[0]}</span>
                <span className="font-mono text-gray-500 dark:text-gray-400">{values[i]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Saved estimates</h3>
        <p className="text-xs text-gray-600 dark:text-gray-300" data-testid="sidebar-history-count">
          {state.history.length} entr{state.history.length === 1 ? 'y' : 'ies'} in history
          {state.history.length > 0 ? ' (newest first)' : ''}
        </p>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Upcoming runs shown</h3>
        <label className="block text-xs text-gray-600 dark:text-gray-300" htmlFor="next-count">
          Next runs to list
          <input
            id="next-count"
            type="number"
            min={1}
            max={10}
            value={state.nextCount}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isFinite(value)) {
                onChange({ ...state, nextCount: Math.min(10, Math.max(1, Math.round(value))) });
              }
            }}
            data-testid="input-next-count"
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Share</h3>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          Use the toolbar share button to create a URL containing the current schedule; open it to
          restore this estimate.
        </p>
      </div>
    </div>
  );
};
