import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { IntelGpuContextValue, useIntelGpuContext } from '../api/IntelGpuDataContext';
import { GpuChipMetrics, GpuMetrics, fetchGpuMetrics } from '../api/metrics';
import MetricsPage from './MetricsPage';

vi.mock('@kinvolk/headlamp-plugin/lib/CommonComponents', () => ({
  Loader: ({ title }: { title: string }) => <div data-testid="loader">{title}</div>,
  SectionBox: ({ title, children }: { title: string; children?: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  SectionHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  NameValueTable: ({
    rows,
  }: {
    rows: Array<{ name: React.ReactNode; value: React.ReactNode }>;
  }) => (
    <dl>
      {rows.map((r, i) => (
        <div key={i}>
          <dt>{r.name}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  ),
  SimpleTable: ({
    columns,
    data,
  }: {
    columns: Array<{ label: string; getter: (item: unknown) => React.ReactNode }>;
    data: unknown[];
  }) => (
    <table>
      <thead>
        <tr>
          {columns.map(c => (
            <th key={c.label}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((item, i) => (
          <tr key={i}>
            {columns.map(c => (
              <td key={c.label}>{c.getter(item)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
  StatusLabel: ({ status, children }: { status: string; children?: React.ReactNode }) => (
    <span data-status={status}>{children}</span>
  ),
  PercentageBar: () => <div data-testid="percentage-bar" />,
}));

vi.mock('../api/IntelGpuDataContext', () => ({
  useIntelGpuContext: vi.fn(),
}));

vi.mock('../api/metrics', () => ({
  fetchGpuMetrics: vi.fn(),
  formatWatts: (w: number) => `${w.toFixed(1)} W`,
  formatPercent: (used: number, max: number) =>
    max <= 0 ? '—' : `${Math.round((used / max) * 100)}%`,
}));

function makeContext(overrides: Partial<IntelGpuContextValue> = {}): IntelGpuContextValue {
  return {
    devicePlugins: [],
    pluginInstalled: false,
    gpuNodes: [],
    gpuPods: [],
    pluginPods: [],
    crdAvailable: false,
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  };
}

function makeMetrics(chips: GpuChipMetrics[]): GpuMetrics {
  return {
    chips,
    fetchedAt: new Date('2025-03-21T10:00:00Z').toISOString(),
  };
}

const sampleChip: GpuChipMetrics = {
  nodeName: 'gpu-node-1',
  chip: '0000:09:01_0',
  instance: '192.168.1.10:9100',
  powerWatts: 45.3,
  powerMaxWatts: 120.0,
};

describe('MetricsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loader when ctxLoading=true', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: true }));
    // fetchGpuMetrics should never be called in loading state
    vi.mocked(fetchGpuMetrics).mockResolvedValue(null);
    render(<MetricsPage />);
    expect(screen.getByTestId('loader')).toHaveTextContent('Loading Intel GPU data...');
  });

  it('shows "Prometheus Unreachable" section when fetchGpuMetrics returns null', async () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: false }));
    vi.mocked(fetchGpuMetrics).mockResolvedValue(null);

    render(<MetricsPage />);

    await waitFor(() => {
      expect(screen.getByText('Prometheus Unreachable')).toBeInTheDocument();
    });
  });

  it('shows "No i915 Metrics in Prometheus" when fetchGpuMetrics returns empty chips', async () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: false }));
    vi.mocked(fetchGpuMetrics).mockResolvedValue(makeMetrics([]));

    render(<MetricsPage />);

    await waitFor(() => {
      expect(screen.getByText('No i915 Metrics in Prometheus')).toBeInTheDocument();
    });
  });

  it('shows chip cards with node name when fetchGpuMetrics returns chips', async () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: false }));
    vi.mocked(fetchGpuMetrics).mockResolvedValue(makeMetrics([sampleChip]));

    render(<MetricsPage />);

    await waitFor(() => {
      // GpuChipCard title format: "{nodeName} — {chip}"
      expect(screen.getByText('gpu-node-1 — 0000:09:01_0')).toBeInTheDocument();
    });
  });

  it('always renders MetricRequirements section', async () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: false }));
    vi.mocked(fetchGpuMetrics).mockResolvedValue(makeMetrics([]));

    render(<MetricsPage />);

    // The MetricRequirements section box is titled "Metric Availability"
    expect(screen.getByText('Metric Availability')).toBeInTheDocument();
  });

  it('shows GPU Power Summary section when chips are present', async () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: false }));
    vi.mocked(fetchGpuMetrics).mockResolvedValue(makeMetrics([sampleChip]));

    render(<MetricsPage />);

    await waitFor(() => {
      expect(screen.getByText('GPU Power Summary')).toBeInTheDocument();
    });
  });

  it('re-triggers fetch when refresh button is clicked', async () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: false }));
    vi.mocked(fetchGpuMetrics).mockResolvedValue(makeMetrics([]));

    render(<MetricsPage />);

    // Wait for initial fetch to complete
    await waitFor(() => {
      expect(vi.mocked(fetchGpuMetrics)).toHaveBeenCalled();
    });

    const callsBefore = vi.mocked(fetchGpuMetrics).mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /refresh metrics/i }));

    await waitFor(() => {
      expect(vi.mocked(fetchGpuMetrics).mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('shows "Intel GPU — Metrics" heading', async () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: false }));
    vi.mocked(fetchGpuMetrics).mockResolvedValue(makeMetrics([]));

    render(<MetricsPage />);

    expect(screen.getByText('Intel GPU — Metrics')).toBeInTheDocument();
  });

  it('shows power values for chip cards', async () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: false }));
    vi.mocked(fetchGpuMetrics).mockResolvedValue(makeMetrics([sampleChip]));

    render(<MetricsPage />);

    await waitFor(() => {
      // formatWatts mock: "45.3 W" and "120.0 W"
      expect(screen.getAllByText(/45\.3 W/).length).toBeGreaterThan(0);
    });
  });
});
