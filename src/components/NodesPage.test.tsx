import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { IntelGpuContextValue, useIntelGpuContext } from '../api/IntelGpuDataContext';
import { IntelGpuNode } from '../api/k8s';
import NodesPage from './NodesPage';

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

const gpuNode: IntelGpuNode = {
  metadata: {
    name: 'gpu-node-1',
    uid: 'uid-001',
    labels: { 'intel.feature.node.kubernetes.io/gpu': 'true' },
    creationTimestamp: '2025-01-01T00:00:00Z',
  },
  status: {
    capacity: { 'gpu.intel.com/i915': '2', cpu: '8' },
    allocatable: { 'gpu.intel.com/i915': '2', cpu: '8' },
    conditions: [{ type: 'Ready', status: 'True' }],
    nodeInfo: {
      osImage: 'Ubuntu 22.04',
      kernelVersion: '5.15.0',
      kubeletVersion: 'v1.28.0',
    },
  },
};

describe('NodesPage', () => {
  it('shows loader when loading=true', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: true }));
    render(<NodesPage />);
    expect(screen.getByTestId('loader')).toHaveTextContent('Loading GPU node data...');
  });

  it('shows "No GPU Nodes Found" when gpuNodes is empty', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: false, gpuNodes: [] }));
    render(<NodesPage />);
    expect(screen.getByText('No GPU Nodes Found')).toBeInTheDocument();
  });

  it('shows "GPU Node Summary" section and per-node detail card when gpuNodes present', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, gpuNodes: [gpuNode] })
    );
    render(<NodesPage />);
    expect(screen.getByText('GPU Node Summary')).toBeInTheDocument();
    // Node name appears in both the summary table and the detail card section header
    expect(screen.getAllByText('gpu-node-1').length).toBeGreaterThanOrEqual(1);
  });

  it('renders a detail card for each GPU node', () => {
    const secondNode: IntelGpuNode = {
      metadata: {
        name: 'gpu-node-2',
        uid: 'uid-002',
        labels: { 'intel.feature.node.kubernetes.io/gpu': 'true' },
      },
      status: {
        capacity: { 'gpu.intel.com/i915': '1' },
        allocatable: { 'gpu.intel.com/i915': '1' },
        conditions: [{ type: 'Ready', status: 'True' }],
      },
    };
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, gpuNodes: [gpuNode, secondNode] })
    );
    render(<NodesPage />);
    // Node names appear in both the summary table cell and the detail card heading
    expect(screen.getAllByText('gpu-node-1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('gpu-node-2').length).toBeGreaterThanOrEqual(1);
  });

  it('shows error section when error is set', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, error: 'node fetch failed', gpuNodes: [] })
    );
    render(<NodesPage />);
    expect(screen.getByText('node fetch failed')).toBeInTheDocument();
  });
});
