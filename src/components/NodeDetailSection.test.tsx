import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { IntelGpuContextValue, useIntelGpuContext } from '../api/IntelGpuDataContext';
import { IntelGpuPod } from '../api/k8s';
import NodeDetailSection from './NodeDetailSection';

vi.mock('@kinvolk/headlamp-plugin/lib/CommonComponents', () => ({
  SectionBox: ({ title, children }: { title: string; children?: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
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
  StatusLabel: ({ status, children }: { status: string; children?: React.ReactNode }) => (
    <span data-status={status}>{children}</span>
  ),
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

// A raw GPU node (matches IntelGpuNode shape) with capacity/allocatable
const gpuNodeRaw = {
  kind: 'Node',
  metadata: {
    name: 'gpu-node-1',
    labels: { 'intel.feature.node.kubernetes.io/gpu': 'true' },
  },
  status: {
    capacity: { 'gpu.intel.com/i915': '2', cpu: '8' },
    allocatable: { 'gpu.intel.com/i915': '2', cpu: '8' },
    nodeInfo: {
      kernelVersion: '5.15.0-generic',
      osImage: 'Ubuntu 22.04.3 LTS',
    },
  },
};

// A non-GPU node — no labels, no gpu.intel.com capacity
const nonGpuNodeRaw = {
  kind: 'Node',
  metadata: {
    name: 'plain-node-1',
    labels: {},
  },
  status: {
    capacity: { cpu: '4', memory: '8Gi' },
    allocatable: { cpu: '4', memory: '8Gi' },
  },
};

describe('NodeDetailSection', () => {
  it('renders nothing for a non-GPU node (no Intel GPU labels or capacity)', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext());
    const { container } = render(<NodeDetailSection resource={nonGpuNodeRaw} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a non-GPU node passed via jsonData wrapper', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext());
    const { container } = render(<NodeDetailSection resource={{ jsonData: nonGpuNodeRaw }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders "Intel GPU" section for a GPU node provided via jsonData', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: false, gpuPods: [] }));
    render(<NodeDetailSection resource={{ jsonData: gpuNodeRaw }} />);
    expect(screen.getByText('Intel GPU')).toBeInTheDocument();
  });

  it('renders "Intel GPU" section for a GPU node provided directly', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: false, gpuPods: [] }));
    render(<NodeDetailSection resource={gpuNodeRaw} />);
    expect(screen.getByText('Intel GPU')).toBeInTheDocument();
  });

  it('renders capacity and allocatable rows', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: false, gpuPods: [] }));
    render(<NodeDetailSection resource={gpuNodeRaw} />);
    // GPU (i915) capacity and allocatable rows
    expect(screen.getByText('GPU (i915) (capacity)')).toBeInTheDocument();
    expect(screen.getByText('GPU (i915) (allocatable)')).toBeInTheDocument();
  });

  it('shows "None" for GPU Workload Pods when no pods are on the node and not loading', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: false, gpuPods: [] }));
    render(<NodeDetailSection resource={gpuNodeRaw} />);
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('shows "Loading…" for GPU Workload Pods when context is loading', () => {
    vi.mocked(useIntelGpuContext).mockReturnValue(makeContext({ loading: true, gpuPods: [] }));
    render(<NodeDetailSection resource={gpuNodeRaw} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('lists pod names when GPU pods are scheduled on the node', () => {
    const gpuPod: IntelGpuPod = {
      metadata: { name: 'my-gpu-pod', namespace: 'default', uid: 'uid-pod-1' },
      spec: {
        nodeName: 'gpu-node-1',
        containers: [{ name: 'main', resources: { requests: { 'gpu.intel.com/i915': '1' } } }],
      },
      status: { phase: 'Running' },
    };
    vi.mocked(useIntelGpuContext).mockReturnValue(
      makeContext({ loading: false, gpuPods: [gpuPod] })
    );
    render(<NodeDetailSection resource={gpuNodeRaw} />);
    expect(screen.getByText('my-gpu-pod')).toBeInTheDocument();
  });
});
