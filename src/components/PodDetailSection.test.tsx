import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import PodDetailSection from './PodDetailSection';

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

// PodDetailSection does NOT use the context — no need to mock IntelGpuDataContext

// A non-GPU pod (no gpu.intel.com resources)
const nonGpuPodRaw = {
  kind: 'Pod',
  metadata: { name: 'plain-pod', namespace: 'default' },
  spec: {
    containers: [{ name: 'main', resources: { requests: { cpu: '100m', memory: '128Mi' } } }],
  },
  status: { phase: 'Running' },
};

// A GPU-requesting pod
const gpuPodRaw = {
  kind: 'Pod',
  metadata: { name: 'gpu-workload', namespace: 'default' },
  spec: {
    nodeName: 'gpu-node-1',
    containers: [
      {
        name: 'trainer',
        resources: {
          requests: { 'gpu.intel.com/i915': '1', cpu: '2' },
          limits: { 'gpu.intel.com/i915': '1', cpu: '2' },
        },
      },
    ],
  },
  status: { phase: 'Running' },
};

// A pod with limits only (no requests)
const gpuPodLimitsOnly = {
  kind: 'Pod',
  metadata: { name: 'limits-only-pod', namespace: 'default' },
  spec: {
    containers: [
      {
        name: 'app',
        resources: {
          limits: { 'gpu.intel.com/i915': '1' },
        },
      },
    ],
  },
  status: { phase: 'Pending' },
};

describe('PodDetailSection', () => {
  it('renders nothing for a non-GPU pod', () => {
    const { container } = render(<PodDetailSection resource={nonGpuPodRaw} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a non-GPU pod passed via jsonData', () => {
    const { container } = render(<PodDetailSection resource={{ jsonData: nonGpuPodRaw }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders "Intel GPU Resources" section for a GPU-requesting pod via jsonData', () => {
    render(<PodDetailSection resource={{ jsonData: gpuPodRaw }} />);
    expect(screen.getByText('Intel GPU Resources')).toBeInTheDocument();
  });

  it('renders "Intel GPU Resources" section for a GPU-requesting pod provided directly', () => {
    render(<PodDetailSection resource={gpuPodRaw} />);
    expect(screen.getByText('Intel GPU Resources')).toBeInTheDocument();
  });

  it('shows container GPU resource request rows', () => {
    render(<PodDetailSection resource={gpuPodRaw} />);
    // Row label: "{containerName} → {resourceName} request"
    expect(screen.getByText('trainer → GPU (i915) request')).toBeInTheDocument();
  });

  it('shows phase status label for Running phase', () => {
    render(<PodDetailSection resource={gpuPodRaw} />);
    const statusEl = screen.getByText('Running');
    expect(statusEl).toHaveAttribute('data-status', 'success');
  });

  it('shows phase status label for Pending phase', () => {
    render(<PodDetailSection resource={gpuPodLimitsOnly} />);
    const statusEl = screen.getByText('Pending');
    expect(statusEl).toHaveAttribute('data-status', 'warning');
  });

  it('still renders when a container has limits only and no requests', () => {
    render(<PodDetailSection resource={gpuPodLimitsOnly} />);
    expect(screen.getByText('Intel GPU Resources')).toBeInTheDocument();
    // limits-only pod: the request row should show '—' since requests key is absent
    expect(screen.getByText('app → GPU (i915) request')).toBeInTheDocument();
  });

  it('shows scheduled node name', () => {
    render(<PodDetailSection resource={gpuPodRaw} />);
    expect(screen.getByText('gpu-node-1')).toBeInTheDocument();
  });

  it('shows GPU container count', () => {
    render(<PodDetailSection resource={gpuPodRaw} />);
    const label = screen.getByText('GPU Containers');
    expect(label).toBeInTheDocument();
    // The value '1' is rendered in the sibling <dd>; verify via parent row
    expect(label.closest('div')).toHaveTextContent('1');
  });
});
