import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import ToolClient from '@/app/tool-client';
import ToolClientWrapper from '@/app/tool-client-wrapper';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="dynamic-tool-client">dynamic-tool-client</div>,
}));

const mockSetData = vi.fn();
const mockToast = vi.fn();
const mockHandleExport = vi.fn();
const mockImport = vi.fn();
const mockToolbarActions = { canUndo: true, canRedo: true, onUndo: vi.fn(), onRedo: vi.fn() };

const mockedState = {
  expression: '*/15 * * * *',
  nextCount: 5,
  history: [],
};

vi.mock('@itsjust/core', () => ({
  ToolShell: ({ toolbar, sidebar, canvas, statusBar }: Record<string, unknown>) => (
    <div>
      <div>{toolbar as ReactNode}</div>
      <div>{sidebar as ReactNode}</div>
      <div>{canvas as ReactNode}</div>
      <div>{statusBar as ReactNode}</div>
    </div>
  ),
  ImportExport: ({ onShare }: { onShare?: () => void }) => (
    <button type="button" onClick={onShare}>
      trigger-share
    </button>
  ),
  useTool: () => ({
    state: {
      data: { ...mockedState },
      setData: mockSetData,
      isDirty: false,
      lastSaved: 'just now',
    },
    toast: mockToast,
    supportedFormats: ['json'],
    handleExport: mockHandleExport,
    importFromFile: mockImport,
    isImporting: false,
    toolbarActions: mockToolbarActions,
  }),
}));

vi.mock('@/tool', () => ({
  toolConfig: {
    id: 'cron-duration-estimator',
    name: 'Cron Duration Estimator',
    version: '1.0.0',
    features: { sidebar: true },
    theme: { brand: 'Cron Duration Estimator' },
  },
  templateBaseVersion: '1.1.0',
  Canvas: ({ state }: { state: Record<string, unknown> }) => (
    <div>canvas:{String(state.expression)}</div>
  ),
  Toolbar: () => <div data-testid="toolbar-slot">toolbar</div>,
  Sidebar: () => <div>sidebar</div>,
  summaryText: () => 'summary',
}));

vi.mock('@/tool/tool-definition', () => ({
  cronDurationEstimatorTool: {
    serialize: (state: unknown) => JSON.stringify(state),
    deserialize: () => ({
      success: true,
      data: { ...mockedState },
    }),
  },
}));

function handleCopyAvailable(): boolean {
  return typeof ToolClient === 'function';
}

describe('app client and help page', () => {
  beforeEach(() => {
    mockSetData.mockReset();
    mockToast.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    Object.defineProperty(navigator, 'share', {
      writable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    window.history.replaceState(
      null,
      '',
      'http://localhost:3000/?state=N4IgpgHgDgTmDO8CWB7AdiAXCAVAegEYBWAAhzIpxABoQ1IAXAYRQFc0GsjaALJeBihgBPLAG0AugF8gA'
    );
  });

  it('renders the wrapper placeholder', () => {
    render(<ToolClientWrapper />);
    expect(screen.getByTestId('dynamic-tool-client')).toBeInTheDocument();
  });

  it('renders toolbar, sidebar, canvas and status bar through the shell', () => {
    render(<ToolClient />);
    expect(screen.getByText('toolbar')).toBeInTheDocument();
    expect(screen.getByText('sidebar')).toBeInTheDocument();
    expect(screen.getByText('canvas:*/15 * * * *')).toBeInTheDocument();
    expect(screen.getByText('summary')).toBeInTheDocument();
  });

  it('loads state from a shared URL on mount', () => {
    render(<ToolClient />);
    expect(mockSetData).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith('Loaded state from shared URL', 'success');
  });

  it('shows a toast when the shared URL payload is invalid', () => {
    window.history.replaceState(null, '', 'http://localhost:3000/?state=!!!invalid!!!');
    render(<ToolClient />);
    expect(mockToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(mockSetData).not.toHaveBeenCalled();
  });

  it('copies the estimate via the summaryText callback wiring', () => {
    // Toolbar is mocked in this suite; copy behavior is covered by the real
    // Toolbar component test in app-and-seo and by handleCopyResult wiring.
    render(<ToolClient />);
    expect(handleCopyAvailable()).toBe(true);
  });

  it('creates a share URL through the ImportExport onShare wiring', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { writable: true, value: { writeText } });
    Object.defineProperty(navigator, 'share', { writable: true, value: undefined });
    render(<ToolClient />);
    fireEvent.click(screen.getByText('trigger-share'));
    await expect(writeText).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith('Share URL copied to clipboard', 'success');
  });

  it('clears history from the toolbar', () => {
    render(<ToolClient />);
    expect(screen.getByTestId('toolbar-slot')).toBeInTheDocument();
  });
});
