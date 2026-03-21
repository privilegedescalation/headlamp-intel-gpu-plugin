import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { IntelGpuContextValue, useIntelGpuContext } from '../api/IntelGpuDataContext';
import { IntelGpuPod } from '../api/k8s';
import PodsPage from './PodsPage';

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

function makeRunningPod(name: string): IntelGpuPod {
  return {
    metadata: { name, namespace: 'default', uid: `uid-${name}` },
    spec: {
      nodeName: 'gpu-node-1',
      containers: [
        {
          name: 'main',
          resources: { requests: { 'gpu.intel.com/i915': '1' } },
        },
      ],
    },
    status: { phase: 'Running' },
  };
}

function makePendingPod(name: string): IntelGpuPod {
  return {
    metadata: { name, namespace: 'default', uid: `uid-${name}` },
    spec: {
      containers: [
        {
          name: 'main',
          resources: { requests: { 'gpu.intel.com/i915': '1' } },
        },
      ],
    },
    status: {
      phase: 'Pending',
      containerStatuses: [
        {
          name: 'main',
          ready: false,
          restartCount: 0,
          state: { waiting: { reason: 'Unschedulable' } },
        },
      ],
    },
  };
}

describe('PodsPage', () => {
  it('shows loader when loading=true', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: true }));
    render(<PodsPage />);
    expect(screen.getByTestId('loader')).toHaveTextContent('Loading GPU pod data...');
  });

  it('shows "No GPU Pods Found" when gpuPods is empty', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: false, gpuPods: [] }));
    render(<PodsPage />);
    expect(screen.getByText('No GPU Pods Found')).toBeInTheDocument();
  });

  it('shows summary section with total count when pods present', () => {
    const pods = [makeRunningPod('pod-1'), makeRunningPod('pod-2')];
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, gpuPods: pods })
    );
    render(<PodsPage />);
    expect(screen.getByText('Summary')).toBeInTheDocument();
    // 'Total GPU Pods' label is present; '2' appears in multiple places (row value + status label)
    expect(screen.getByText('Total GPU Pods')).toBeInTheDocument();
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Attention: Pending GPU Pods" section when pending pods exist', () => {
    const pods = [makePendingPod('pending-pod-1')];
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, gpuPods: pods })
    );
    render(<PodsPage />);
    expect(screen.getByText('Attention: Pending GPU Pods')).toBeInTheDocument();
    // Pod name appears in both the main "All GPU Pods" table and the pending attention table
    expect(screen.getAllByText('pending-pod-1').length).toBeGreaterThanOrEqual(1);
  });

  it('shows error section when error is set', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, error: 'pod list failed', gpuPods: [] })
    );
    render(<PodsPage />);
    expect(screen.getByText('pod list failed')).toBeInTheDocument();
  });

  it('shows "All GPU Pods" table with pod name when pods present', () => {
    const pods = [makeRunningPod('my-workload')];
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, gpuPods: pods })
    );
    render(<PodsPage />);
    expect(screen.getByText('All GPU Pods')).toBeInTheDocument();
    expect(screen.getByText('my-workload')).toBeInTheDocument();
  });
});
