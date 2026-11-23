import type { ToolConfig } from '@itsjust/core';

export const templateBaseVersion = '1.4.1';

export const toolConfig = {
  id: 'cron-duration-estimator',
  name: 'Cron Duration Estimator',
  description:
    'Converts cron schedules into estimated executions per hour, day, month and year to visualize job frequency and server load. All client-side, privacy-first.',
  version: '1.0.0',
  category: 'Developer',
  exportFormats: ['json', 'pdf'],
  features: {
    export: true,
    autoSave: true,
    undoRedo: true,
    sidebar: true,
    statusBar: true,
    darkMode: true,
  },
  theme: {
    accent: '#22d3ee',
    accentHover: '#0891b2',
    accentSubtle: 'rgba(34, 211, 238, 0.08)',
    brand: 'Cron Duration Estimator',
    icon: '⏱️',
  },
  shortcuts: [
    {
      title: 'Cron Duration Estimator',
      shortcuts: [
        {
          keys: 'Ctrl+Shift+C',
          label: 'Copy Estimate',
          description: 'copy the estimate summary to the clipboard',
        },
        {
          keys: 'Ctrl+Shift+X',
          label: 'Clear Expression',
          description: 'clear the cron expression and results',
        },
      ],
    },
  ],
} as unknown as ToolConfig;

export default toolConfig;
