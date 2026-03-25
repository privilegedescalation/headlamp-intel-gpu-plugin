import { ApiProxy, K8s } from '@kinvolk/headlamp-plugin/lib';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { IntelGpuDataProvider, useIntelGpuContext } from './IntelGpuDataContext';

vi.mock('@kinvolk/headlamp-plugin/lib', () => ({
  K8s: {
    ResourceClasses: {
      Node: { useList: vi.fn() },
      Pod: { useList: vi.fn() },
    },
  },
  ApiProxy: { request: vi.fn() },
}));

// Minimal GPU node fixture
const gpuNodeRaw = {
  metadata: {
    name: 'gpu-node-1',
    uid: 'uid-001',
    labels: { 'intel.feature.node.kubernetes.io/gpu': 'true' },
  },
  status: {
    capacity: { 'gpu.intel.com/i915': '1' },
    allocatable: { 'gpu.intel.com/i915': '1' },
  },
};

// Minimal GPU plugin CRD fixture
const gpuDevicePluginRaw = {
  kind: 'GpuDevicePlugin',
  metadata: { name: 'gpu-plugin-default', uid: 'uid-dp-001' },
  spec: {},
};

function makeNodeWrapper(raw: unknown) {
  return { jsonData: raw };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <IntelGpuDataProvider>{children}</IntelGpuDataProvider>;
}

describe('useIntelGpuContext', () => {
  it('throws when used outside provider', () => {
    // Suppress React error boundary output
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useIntelGpuContext())).toThrow(
      'useIntelGpuContext must be used within an IntelGpuDataProvider'
    );

    consoleError.mockRestore();
  });
});

describe('IntelGpuDataProvider', () => {
  it('renders children', async () => {
    vi.mocked(K8s.ResourceClasses.Node.useList).mockReturnValue([[], null] as any);
    vi.mocked(K8s.ResourceClasses.Pod.useList).mockReturnValue([[], null] as any);
    vi.mocked(ApiProxy.request).mockResolvedValue({ items: [] });

    render(
      <IntelGpuDataProvider>
        <div data-testid="child">hello</div>
      </IntelGpuDataProvider>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('exposes loading=true while nodes/pods are null', async () => {
    vi.mocked(K8s.ResourceClasses.Node.useList).mockReturnValue([null, null] as any);
    vi.mocked(K8s.ResourceClasses.Pod.useList).mockReturnValue([null, null] as any);
    // Keep async request pending forever
    vi.mocked(ApiProxy.request).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useIntelGpuContext(), { wrapper: Wrapper });

    expect(result.current.loading).toBe(true);
  });

  it('exposes loaded state with GPU nodes once data arrives', async () => {
    vi.mocked(K8s.ResourceClasses.Node.useList).mockReturnValue([
      [makeNodeWrapper(gpuNodeRaw)] as any,
      null,
    ] as any);
    vi.mocked(K8s.ResourceClasses.Pod.useList).mockReturnValue([[], null] as any);
    vi.mocked(ApiProxy.request).mockResolvedValue({ items: [] });

    const { result } = renderHook(() => useIntelGpuContext(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.gpuNodes).toHaveLength(1);
    expect(result.current.gpuNodes[0].metadata.name).toBe('gpu-node-1');
  });

  it('sets crdAvailable=true and populates devicePlugins when ApiProxy returns plugin list', async () => {
    vi.mocked(K8s.ResourceClasses.Node.useList).mockReturnValue([[], null] as any);
    vi.mocked(K8s.ResourceClasses.Pod.useList).mockReturnValue([[], null] as any);

    // First call = CRD list, subsequent calls = plugin pod selectors (empty)
    vi.mocked(ApiProxy.request)
      .mockResolvedValueOnce({ items: [gpuDevicePluginRaw] })
      .mockResolvedValue({ items: [] });

    const { result } = renderHook(() => useIntelGpuContext(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.crdAvailable).toBe(true);
    expect(result.current.devicePlugins).toHaveLength(1);
    expect(result.current.devicePlugins[0].metadata.name).toBe('gpu-plugin-default');
  });

  it('sets crdAvailable=false and does not surface error when ApiProxy throws on CRD request', async () => {
    vi.mocked(K8s.ResourceClasses.Node.useList).mockReturnValue([[], null] as any);
    vi.mocked(K8s.ResourceClasses.Pod.useList).mockReturnValue([[], null] as any);

    // First call (CRD endpoint) throws, plugin pod selectors resolve empty
    vi.mocked(ApiProxy.request)
      .mockRejectedValueOnce(new Error('CRD not found'))
      .mockResolvedValue({ items: [] });

    const { result } = renderHook(() => useIntelGpuContext(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.crdAvailable).toBe(false);
    expect(result.current.devicePlugins).toHaveLength(0);
    // Inner CRD error should NOT be bubbled up to the top-level error field
    expect(result.current.error).toBeNull();
  });

  it('increments refreshKey and re-runs the effect when refresh() is called', async () => {
    vi.mocked(K8s.ResourceClasses.Node.useList).mockReturnValue([[], null] as any);
    vi.mocked(K8s.ResourceClasses.Pod.useList).mockReturnValue([[], null] as any);
    vi.mocked(ApiProxy.request).mockResolvedValue({ items: [] });

    const { result } = renderHook(() => useIntelGpuContext(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const callCountBefore = vi.mocked(ApiProxy.request).mock.calls.length;

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => {
      const callCountAfter = vi.mocked(ApiProxy.request).mock.calls.length;
      expect(callCountAfter).toBeGreaterThan(callCountBefore);
    });
  });

  it('treats a hanging CRD request as unavailable after 2s timeout', async () => {
    vi.useFakeTimers();
    vi.mocked(K8s.ResourceClasses.Node.useList).mockReturnValue([[], null] as any);
    vi.mocked(K8s.ResourceClasses.Pod.useList).mockReturnValue([[], null] as any);
    vi.mocked(ApiProxy.request).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useIntelGpuContext(), { wrapper: Wrapper });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.crdAvailable).toBe(false);
    vi.useRealTimers();
  });
});
