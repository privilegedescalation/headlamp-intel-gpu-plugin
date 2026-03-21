import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { IntelGpuContextValue, useIntelGpuContext } from '../api/IntelGpuDataContext';
import { GpuDevicePlugin, IntelGpuPod } from '../api/k8s';
import DevicePluginsPage from './DevicePluginsPage';

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

const samplePlugin: GpuDevicePlugin = {
  kind: 'GpuDevicePlugin',
  metadata: {
    name: 'intel-gpu-plugin',
    uid: 'uid-dp-1',
    creationTimestamp: '2025-01-01T00:00:00Z',
  },
  spec: {
    image: 'intel/intel-gpu-plugin:latest',
    sharedDevNum: 4,
    enableMonitoring: true,
    preferredAllocationPolicy: 'balanced',
  },
  status: {
    desiredNumberScheduled: 3,
    numberReady: 3,
  },
};

const pluginPod: IntelGpuPod = {
  metadata: {
    name: 'intel-gpu-plugin-abc12',
    namespace: 'kube-system',
    uid: 'uid-pp-1',
  },
  spec: { nodeName: 'worker-1' },
  status: {
    phase: 'Running',
    conditions: [{ type: 'Ready', status: 'True' }],
  },
};

describe('DevicePluginsPage', () => {
  it('shows loader when loading=true', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: true }));
    render(<DevicePluginsPage />);
    expect(screen.getByTestId('loader')).toHaveTextContent('Loading device plugin data...');
  });

  it('shows "CRD Not Available" section when crdAvailable=false', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, crdAvailable: false })
    );
    render(<DevicePluginsPage />);
    expect(screen.getByText('CRD Not Available')).toBeInTheDocument();
    expect(screen.getByText(/GpuDevicePlugin CRD.*is not installed/)).toBeInTheDocument();
  });

  it('shows "No Device Plugins" section when crdAvailable=true but devicePlugins empty', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, crdAvailable: true, devicePlugins: [] })
    );
    render(<DevicePluginsPage />);
    expect(screen.getByText('No Device Plugins')).toBeInTheDocument();
    expect(screen.getByText(/No GpuDevicePlugin resources found/)).toBeInTheDocument();
  });

  it('shows plugin detail section when crdAvailable=true and devicePlugins present', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({
        loading: false,
        crdAvailable: true,
        devicePlugins: [samplePlugin],
      })
    );
    render(<DevicePluginsPage />);
    expect(screen.getByText('GpuDevicePlugin: intel-gpu-plugin')).toBeInTheDocument();
    expect(screen.getByText('intel/intel-gpu-plugin:latest')).toBeInTheDocument();
  });

  it('shows "Plugin Daemon Pods" table when pluginPods present', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({
        loading: false,
        crdAvailable: true,
        devicePlugins: [samplePlugin],
        pluginPods: [pluginPod],
      })
    );
    render(<DevicePluginsPage />);
    expect(screen.getByText('Plugin Daemon Pods')).toBeInTheDocument();
    expect(screen.getByText('intel-gpu-plugin-abc12')).toBeInTheDocument();
  });

  it('shows error section when error is set', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, crdAvailable: true, error: 'fetch error' })
    );
    render(<DevicePluginsPage />);
    expect(screen.getByText('fetch error')).toBeInTheDocument();
  });
});
