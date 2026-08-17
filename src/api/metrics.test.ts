import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ApiProxy before importing modules that depend on it
vi.mock('@kinvolk/headlamp-plugin/lib', () => ({
  ApiProxy: { request: vi.fn() },
  ConfigStore: vi.fn().mockImplementation(() => ({
    get: vi.fn(() => ({})),
    set: vi.fn(),
    update: vi.fn(),
    useConfig: vi.fn(() => () => ({})),
  })),
}));

import { ApiProxy } from '@kinvolk/headlamp-plugin/lib';
import { fetchGpuMetrics, getCheckedServicesDescription } from './metrics';
import {
  DEFAULT_PROMETHEUS_SERVICES,
  getPrometheusServiceCandidates,
  prometheusConfigStore,
} from './pluginConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRequestFailure(): void {
  vi.mocked(ApiProxy.request).mockRejectedValue(new Error('404 Not Found'));
}

function mockRequestWithChipResults(): void {
  // Call 0: discovery check (findPrometheusPath) — returns success
  // Calls 1-4: actual metric queries (chip, energy rate, power max, uname)
  const calls: Record<number, unknown> = {
    0: {
      // discovery check — just needs status: success
      status: 'success',
      data: { resultType: 'vector', result: [] },
    },
    1: {
      // chip identification query
      status: 'success',
      data: {
        resultType: 'vector',
        result: [
          {
            metric: { chip: '0000:09:01_0', instance: '10.0.0.1:9100', chip_name: 'i915' },
            value: [1234567890, '1'],
          },
        ],
      },
    },
    2: {
      // energy rate query
      status: 'success',
      data: {
        resultType: 'vector',
        result: [
          {
            metric: { chip: '0000:09:01_0', instance: '10.0.0.1:9100' },
            value: [1234567890, '45.3'],
          },
        ],
      },
    },
    3: {
      // power max query
      status: 'success',
      data: {
        resultType: 'vector',
        result: [
          {
            metric: { chip: '0000:09:01_0', instance: '10.0.0.1:9100' },
            value: [1234567890, '120'],
          },
        ],
      },
    },
    4: {
      // uname query
      status: 'success',
      data: {
        resultType: 'vector',
        result: [
          {
            metric: { instance: '10.0.0.1:9100', nodename: 'gpu-node-1' },
            value: [1234567890, '1'],
          },
        ],
      },
    },
  };
  let callIndex = 0;
  vi.mocked(ApiProxy.request).mockImplementation(() => {
    const result =
      calls[callIndex] ?? { status: 'success', data: { resultType: 'vector', result: [] } };
    callIndex++;
    return Promise.resolve(result);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('metrics — pluginConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset config store to empty defaults
    vi.mocked(prometheusConfigStore.get).mockReturnValue({
      prometheusNamespace: '',
      prometheusService: '',
      prometheusPort: '',
    });
  });

  describe('getPrometheusServiceCandidates — default behavior', () => {
    it('returns only the built-in defaults when no config is set', () => {
      const candidates = getPrometheusServiceCandidates();
      // No custom config → only the 3 built-in defaults
      expect(candidates).toHaveLength(3);
      expect(candidates).toEqual([...DEFAULT_PROMETHEUS_SERVICES]);
    });

    it('includes the built-in kube-prometheus-stack-prometheus as first default', () => {
      const candidates = getPrometheusServiceCandidates();
      expect(candidates[0]).toEqual({
        namespace: 'monitoring',
        service: 'kube-prometheus-stack-prometheus',
        port: '9090',
      });
    });

    it('includes prometheus-operated as second default', () => {
      const candidates = getPrometheusServiceCandidates();
      expect(candidates[1]).toEqual({
        namespace: 'monitoring',
        service: 'prometheus-operated',
        port: '9090',
      });
    });

    it('includes prometheus as third default', () => {
      const candidates = getPrometheusServiceCandidates();
      expect(candidates[2]).toEqual({
        namespace: 'monitoring',
        service: 'prometheus',
        port: '9090',
      });
    });
  });

  describe('getPrometheusServiceCandidates — custom config', () => {
    it('prepends custom service when all three fields are configured', () => {
      vi.mocked(prometheusConfigStore.get).mockReturnValue({
        prometheusNamespace: 'observability',
        prometheusService: 'monitoring-kube-prometheus-prometheus',
        prometheusPort: '9090',
      });
      const candidates = getPrometheusServiceCandidates();
      // Custom first, then 3 defaults = 4 total
      expect(candidates).toHaveLength(4);
      expect(candidates[0]).toEqual({
        namespace: 'observability',
        service: 'monitoring-kube-prometheus-prometheus',
        port: '9090',
      });
    });

    it('does not add custom candidate when only namespace is set', () => {
      vi.mocked(prometheusConfigStore.get).mockReturnValue({
        prometheusNamespace: 'observability',
        prometheusService: '',
        prometheusPort: '',
      });
      const candidates = getPrometheusServiceCandidates();
      // Only defaults, since not all three fields are set
      expect(candidates).toHaveLength(3);
      expect(candidates[0].namespace).toBe('monitoring');
    });

    it('does not add custom candidate when only service is set', () => {
      vi.mocked(prometheusConfigStore.get).mockReturnValue({
        prometheusNamespace: '',
        prometheusService: 'my-prometheus',
        prometheusPort: '',
      });
      const candidates = getPrometheusServiceCandidates();
      expect(candidates).toHaveLength(3);
    });

    it('preserves built-in defaults after custom candidate', () => {
      vi.mocked(prometheusConfigStore.get).mockReturnValue({
        prometheusNamespace: 'custom-ns',
        prometheusService: 'custom-prom',
        prometheusPort: '9091',
      });
      const candidates = getPrometheusServiceCandidates();
      expect(candidates[0].namespace).toBe('custom-ns');
      expect(candidates[1]).toEqual(DEFAULT_PROMETHEUS_SERVICES[0]);
      expect(candidates[2]).toEqual(DEFAULT_PROMETHEUS_SERVICES[1]);
      expect(candidates[3]).toEqual(DEFAULT_PROMETHEUS_SERVICES[2]);
    });
  });
});

describe('metrics — getCheckedServicesDescription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prometheusConfigStore.get).mockReturnValue({
      prometheusNamespace: '',
      prometheusService: '',
      prometheusPort: '',
    });
  });

  it('describes default services when no config is set', () => {
    const desc = getCheckedServicesDescription();
    expect(desc).toContain('kube-prometheus-stack-prometheus:9090');
    expect(desc).toContain('monitoring namespace');
  });

  it('includes custom service in description when configured', () => {
    vi.mocked(prometheusConfigStore.get).mockReturnValue({
      prometheusNamespace: 'observability',
      prometheusService: 'monitoring-kube-prometheus-prometheus',
      prometheusPort: '9090',
    });
    const desc = getCheckedServicesDescription();
    expect(desc).toContain('monitoring-kube-prometheus-prometheus:9090');
    expect(desc).toContain('observability namespace');
    // Still includes defaults
    expect(desc).toContain('kube-prometheus-stack-prometheus:9090');
  });
});

describe('metrics — fetchGpuMetrics discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prometheusConfigStore.get).mockReturnValue({
      prometheusNamespace: '',
      prometheusService: '',
      prometheusPort: '',
    });
  });

  it('returns null when no Prometheus service is reachable (all defaults fail)', async () => {
    mockRequestFailure();
    const result = await fetchGpuMetrics();
    expect(result).toBeNull();
  });

  it('queries default service candidates when no custom config is set', async () => {
    mockRequestFailure();
    await fetchGpuMetrics();
    const calls = vi.mocked(ApiProxy.request).mock.calls;
    // First call should be to the first default service (kube-prometheus-stack-prometheus)
    const firstPath = calls[0][0] as string;
    expect(firstPath).toContain('monitoring');
    expect(firstPath).toContain('kube-prometheus-stack-prometheus');
    expect(firstPath).toContain('9090');
  });

  it('queries custom service first when config is set', async () => {
    vi.mocked(prometheusConfigStore.get).mockReturnValue({
      prometheusNamespace: 'observability',
      prometheusService: 'monitoring-kube-prometheus-prometheus',
      prometheusPort: '9090',
    });
    mockRequestFailure();
    await fetchGpuMetrics();
    const calls = vi.mocked(ApiProxy.request).mock.calls;
    // First call should be to the custom service
    const firstPath = calls[0][0] as string;
    expect(firstPath).toContain('observability');
    expect(firstPath).toContain('monitoring-kube-prometheus-prometheus');
  });

  it('succeeds when custom service is reachable', async () => {
    vi.mocked(prometheusConfigStore.get).mockReturnValue({
      prometheusNamespace: 'observability',
      prometheusService: 'monitoring-kube-prometheus-prometheus',
      prometheusPort: '9090',
    });
    mockRequestWithChipResults();
    const result = await fetchGpuMetrics();
    expect(result).not.toBeNull();
    expect(result!.chips).toHaveLength(1);
    expect(result!.chips[0].nodeName).toBe('gpu-node-1');
    expect(result!.chips[0].powerWatts).toBe(45.3);
    expect(result!.chips[0].powerMaxWatts).toBe(120);
  });

  it('falls back to defaults when custom service fails', async () => {
    vi.mocked(prometheusConfigStore.get).mockReturnValue({
      prometheusNamespace: 'observability',
      prometheusService: 'monitoring-kube-prometheus-prometheus',
      prometheusPort: '9090',
    });

    // First call (custom service) fails, subsequent calls (defaults) succeed
    let callCount = 0;
    vi.mocked(ApiProxy.request).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Custom service discovery check fails
        return Promise.reject(new Error('404'));
      }
      // Default service discovery check succeeds, then return chip data
      if (callCount === 2) {
        return Promise.resolve({
          status: 'success',
          data: { resultType: 'vector', result: [] },
        });
      }
      // Subsequent calls for actual metric queries
      return Promise.resolve({
        status: 'success',
        data: { resultType: 'vector', result: [] },
      });
    });

    const result = await fetchGpuMetrics();
    expect(result).not.toBeNull();
    // Should have tried custom first, then default
    const calls = vi.mocked(ApiProxy.request).mock.calls;
    const firstPath = calls[0][0] as string;
    expect(firstPath).toContain('observability');
    const secondPath = calls[1][0] as string;
    expect(secondPath).toContain('monitoring');
    expect(secondPath).toContain('kube-prometheus-stack-prometheus');
  });

  it('succeeds with default services when no custom config is set', async () => {
    mockRequestWithChipResults();
    const result = await fetchGpuMetrics();
    expect(result).not.toBeNull();
    expect(result!.chips).toHaveLength(1);
  });
});
