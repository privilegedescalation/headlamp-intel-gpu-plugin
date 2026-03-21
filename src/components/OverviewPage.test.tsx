import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { IntelGpuContextValue, useIntelGpuContext } from '../api/IntelGpuDataContext';
import { GpuDevicePlugin, IntelGpuNode, IntelGpuPod } from '../api/k8s';
import OverviewPage from './OverviewPage';

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

describe('OverviewPage', () => {
  it('shows loader when loading=true', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: true }));
    render(<OverviewPage />);
    expect(screen.getByTestId('loader')).toHaveTextContent('Loading Intel GPU data...');
  });

  it('shows "Plugin Not Detected" when not loading, no plugin installed, no nodes', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, pluginInstalled: false, gpuNodes: [] })
    );
    render(<OverviewPage />);
    expect(screen.getByText('Plugin Not Detected')).toBeInTheDocument();
  });

  it('shows error content when error is set', () => {
    const errorMsg = 'something went wrong';
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, error: errorMsg, pluginInstalled: true })
    );
    render(<OverviewPage />);
    expect(screen.getByText(errorMsg)).toBeInTheDocument();
  });

  it('shows "Intel GPU — Overview" heading when gpuNodes present and pluginInstalled', () => {
    const node: IntelGpuNode = {
      metadata: {
        name: 'gpu-node-1',
        labels: { 'intel.feature.node.kubernetes.io/gpu': 'true' },
      },
      status: {
        capacity: { 'gpu.intel.com/i915': '1' },
        allocatable: { 'gpu.intel.com/i915': '1' },
      },
    };
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, pluginInstalled: true, gpuNodes: [node] })
    );
    render(<OverviewPage />);
    expect(screen.getByText('Intel GPU — Overview')).toBeInTheDocument();
  });

  it('calls refresh() when refresh button is clicked', () => {
    const refresh = vi.fn();
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, pluginInstalled: true, refresh })
    );
    render(<OverviewPage />);
    fireEvent.click(screen.getByRole('button', { name: /refresh intel gpu data/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('shows CRD notice when crdAvailable=false and pluginInstalled=true', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, pluginInstalled: true, crdAvailable: false })
    );
    render(<OverviewPage />);
    expect(screen.getByText('Notice')).toBeInTheDocument();
    expect(screen.getByText(/GpuDevicePlugin CRD not found/)).toBeInTheDocument();
  });

  it('shows "Device Plugin Status" table when crdAvailable=true and devicePlugins present', () => {
    const plugin: GpuDevicePlugin = {
      kind: 'GpuDevicePlugin',
      metadata: { name: 'my-plugin', uid: 'uid-1' },
      spec: { enableMonitoring: true, sharedDevNum: 2 },
      status: { desiredNumberScheduled: 1, numberReady: 1 },
    };
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({
        loading: false,
        pluginInstalled: true,
        crdAvailable: true,
        devicePlugins: [plugin],
      })
    );
    render(<OverviewPage />);
    expect(screen.getByText('Device Plugin Status')).toBeInTheDocument();
    expect(screen.getByText('my-plugin')).toBeInTheDocument();
  });

  it('shows "Plugin Daemon Pods" table when pluginPods present', () => {
    const pod: IntelGpuPod = {
      metadata: { name: 'plugin-pod-1', namespace: 'kube-system', uid: 'uid-pp-1' },
      spec: { nodeName: 'node-1' },
      status: { phase: 'Running' },
    };
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, pluginInstalled: true, pluginPods: [pod] })
    );
    render(<OverviewPage />);
    expect(screen.getByText('Plugin Daemon Pods')).toBeInTheDocument();
    expect(screen.getByText('plugin-pod-1')).toBeInTheDocument();
  });

  it('shows "Active GPU Pods" table when running GPU pods exist', () => {
    const pod: IntelGpuPod = {
      metadata: { name: 'workload-pod-1', namespace: 'default', uid: 'uid-wp-1' },
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
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, pluginInstalled: true, gpuPods: [pod] })
    );
    render(<OverviewPage />);
    expect(screen.getByText('Active GPU Pods')).toBeInTheDocument();
    expect(screen.getByText('workload-pod-1')).toBeInTheDocument();
  });
});
