/**
 * Unit tests for Intel GPU k8s helper functions.
 */

import { describe, expect, it } from 'vitest';
import {
  filterGpuRequestingPods,
  filterIntelGpuNodes,
  formatAge,
  formatGpuResourceName,
  formatGpuType,
  getNodeGpuCount,
  getNodeGpuType,
  getPodGpuRequests,
  INTEL_GPU_NODE_LABEL,
  INTEL_GPU_RESOURCE,
  INTEL_GPU_XE_RESOURCE,
  isGpuRequestingPod,
  isIntelGpuNode,
  isKubeList,
  isNodeReady,
  pluginStatusText,
  pluginStatusToStatus,
  type GpuDevicePlugin,
  type IntelGpuNode,
  type IntelGpuPod,
} from './k8s';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Record<string, unknown> = {}): IntelGpuNode {
  return {
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { name: 'test-node' },
    status: {},
    ...overrides,
  };
}

function makeGpuNode(type: 'discrete' | 'integrated' | 'generic' = 'discrete'): IntelGpuNode {
  const labels: Record<string, string> = {};
  if (type === 'discrete') labels['node-role.kubernetes.io/gpu'] = 'true';
  if (type === 'integrated') labels['node-role.kubernetes.io/igpu'] = 'true';
  if (type === 'generic') labels[INTEL_GPU_NODE_LABEL] = 'true';

  return {
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { name: 'gpu-node', labels },
    status: {
      capacity: { [INTEL_GPU_RESOURCE]: '2' },
      allocatable: { [INTEL_GPU_RESOURCE]: '2' },
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  };
}

function makeGpuPod(gpuResourceKey: string = INTEL_GPU_RESOURCE, amount = '1'): IntelGpuPod {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'gpu-pod', namespace: 'default' },
    spec: {
      nodeName: 'gpu-node',
      containers: [
        {
          name: 'workload',
          resources: {
            requests: { [gpuResourceKey]: amount },
            limits: { [gpuResourceKey]: amount },
          },
        },
      ],
    },
    status: { phase: 'Running' },
  };
}

// ---------------------------------------------------------------------------
// isIntelGpuNode
// ---------------------------------------------------------------------------

describe('isIntelGpuNode', () => {
  it('returns true for nodes with discrete GPU label', () => {
    const node = makeGpuNode('discrete');
    expect(isIntelGpuNode(node)).toBe(true);
  });

  it('returns true for nodes with integrated GPU label', () => {
    const node = makeGpuNode('integrated');
    expect(isIntelGpuNode(node)).toBe(true);
  });

  it('returns true for nodes with generic Intel GPU label', () => {
    const node = makeGpuNode('generic');
    expect(isIntelGpuNode(node)).toBe(true);
  });

  it('returns true for nodes with gpu.intel.com/* in capacity', () => {
    const node = makeNode({
      status: { capacity: { 'gpu.intel.com/i915': '1' } },
    });
    expect(isIntelGpuNode(node)).toBe(true);
  });

  it('returns false for nodes with no GPU labels or resources', () => {
    const node = makeNode({
      metadata: { name: 'regular-node', labels: {} },
      status: { capacity: { cpu: '8', memory: '16Gi' } },
    });
    expect(isIntelGpuNode(node)).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isIntelGpuNode(null)).toBe(false);
    expect(isIntelGpuNode(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterIntelGpuNodes
// ---------------------------------------------------------------------------

describe('filterIntelGpuNodes', () => {
  it('filters out non-GPU nodes', () => {
    const gpuNode = makeGpuNode('discrete');
    const regularNode = makeNode({ metadata: { name: 'regular' } });
    const result = filterIntelGpuNodes([gpuNode, regularNode]);
    expect(result).toHaveLength(1);
    expect(result[0].metadata.name).toBe('gpu-node');
  });

  it('handles empty array', () => {
    expect(filterIntelGpuNodes([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getNodeGpuType
// ---------------------------------------------------------------------------

describe('getNodeGpuType', () => {
  it('returns discrete for GPU node role label', () => {
    expect(getNodeGpuType(makeGpuNode('discrete'))).toBe('discrete');
  });

  it('returns integrated for iGPU node role label', () => {
    expect(getNodeGpuType(makeGpuNode('integrated'))).toBe('integrated');
  });

  it('returns unknown for generic Intel GPU label', () => {
    expect(getNodeGpuType(makeGpuNode('generic'))).toBe('unknown');
  });

  it('returns unknown for nodes with no labels', () => {
    const node = makeNode({ status: { capacity: { [INTEL_GPU_RESOURCE]: '1' } } });
    expect(getNodeGpuType(node)).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// getNodeGpuCount
// ---------------------------------------------------------------------------

describe('getNodeGpuCount', () => {
  it('returns count from i915 resource', () => {
    const node = makeNode({
      status: { capacity: { [INTEL_GPU_RESOURCE]: '4' } },
    });
    expect(getNodeGpuCount(node)).toBe(4);
  });

  it('returns count from xe resource', () => {
    const node = makeNode({
      status: { capacity: { [INTEL_GPU_XE_RESOURCE]: '2' } },
    });
    expect(getNodeGpuCount(node)).toBe(2);
  });

  it('returns sum of i915 and xe resources', () => {
    const node = makeNode({
      status: {
        capacity: {
          [INTEL_GPU_RESOURCE]: '2',
          [INTEL_GPU_XE_RESOURCE]: '1',
        },
      },
    });
    expect(getNodeGpuCount(node)).toBe(3);
  });

  it('returns 0 for nodes with no GPU capacity', () => {
    const node = makeNode({ status: { capacity: { cpu: '8' } } });
    expect(getNodeGpuCount(node)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isNodeReady
// ---------------------------------------------------------------------------

describe('isNodeReady', () => {
  it('returns true when Ready condition is True', () => {
    const node = makeNode({
      status: { conditions: [{ type: 'Ready', status: 'True' }] },
    });
    expect(isNodeReady(node)).toBe(true);
  });

  it('returns false when Ready condition is False', () => {
    const node = makeNode({
      status: { conditions: [{ type: 'Ready', status: 'False' }] },
    });
    expect(isNodeReady(node)).toBe(false);
  });

  it('returns false when no conditions', () => {
    const node = makeNode({ status: {} });
    expect(isNodeReady(node)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isGpuRequestingPod
// ---------------------------------------------------------------------------

describe('isGpuRequestingPod', () => {
  it('returns true for pods requesting i915 GPU', () => {
    expect(isGpuRequestingPod(makeGpuPod(INTEL_GPU_RESOURCE))).toBe(true);
  });

  it('returns true for pods requesting xe GPU', () => {
    expect(isGpuRequestingPod(makeGpuPod(INTEL_GPU_XE_RESOURCE))).toBe(true);
  });

  it('returns true for pods requesting millicores', () => {
    expect(isGpuRequestingPod(makeGpuPod('gpu.intel.com/millicores', '500'))).toBe(true);
  });

  it('returns false for pods with no GPU resources', () => {
    const pod: IntelGpuPod = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'no-gpu-pod' },
      spec: {
        containers: [
          {
            name: 'app',
            resources: {
              requests: { cpu: '1', memory: '1Gi' },
            },
          },
        ],
      },
    };
    expect(isGpuRequestingPod(pod)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isGpuRequestingPod(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterGpuRequestingPods
// ---------------------------------------------------------------------------

describe('filterGpuRequestingPods', () => {
  it('filters out non-GPU pods', () => {
    const gpuPod = makeGpuPod();
    const regularPod: IntelGpuPod = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'regular' },
      spec: { containers: [{ name: 'app' }] },
    };
    const result = filterGpuRequestingPods([gpuPod, regularPod]);
    expect(result).toHaveLength(1);
    expect(result[0].metadata.name).toBe('gpu-pod');
  });
});

// ---------------------------------------------------------------------------
// getPodGpuRequests
// ---------------------------------------------------------------------------

describe('getPodGpuRequests', () => {
  it('returns GPU resource requests from containers', () => {
    const pod = makeGpuPod(INTEL_GPU_RESOURCE, '2');
    const requests = getPodGpuRequests(pod);
    expect(requests[INTEL_GPU_RESOURCE]).toBe('2');
  });

  it('returns empty object for non-GPU pods', () => {
    const pod: IntelGpuPod = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'regular' },
      spec: { containers: [{ name: 'app', resources: { requests: { cpu: '1' } } }] },
    };
    expect(getPodGpuRequests(pod)).toEqual({});
  });

  it('sums requests across multiple containers', () => {
    const pod: IntelGpuPod = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'multi' },
      spec: {
        containers: [
          { name: 'a', resources: { requests: { [INTEL_GPU_RESOURCE]: '1' } } },
          { name: 'b', resources: { requests: { [INTEL_GPU_RESOURCE]: '2' } } },
        ],
      },
    };
    const requests = getPodGpuRequests(pod);
    expect(requests[INTEL_GPU_RESOURCE]).toBe('3');
  });
});

// ---------------------------------------------------------------------------
// isKubeList
// ---------------------------------------------------------------------------

describe('isKubeList', () => {
  it('returns true for objects with items array', () => {
    expect(isKubeList({ items: [] })).toBe(true);
    expect(isKubeList({ items: [1, 2, 3] })).toBe(true);
  });

  it('returns false for objects without items', () => {
    expect(isKubeList({ data: [] })).toBe(false);
    expect(isKubeList(null)).toBe(false);
    expect(isKubeList('string')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatAge
// ---------------------------------------------------------------------------

describe('formatAge', () => {
  it('returns unknown for undefined', () => {
    expect(formatAge(undefined)).toBe('unknown');
  });

  it('formats seconds', () => {
    const ts = new Date(Date.now() - 30 * 1000).toISOString();
    expect(formatAge(ts)).toBe('30s');
  });

  it('formats minutes', () => {
    const ts = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatAge(ts)).toBe('5m');
  });

  it('formats hours', () => {
    const ts = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatAge(ts)).toBe('3h');
  });

  it('formats days', () => {
    const ts = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatAge(ts)).toBe('2d');
  });
});

// ---------------------------------------------------------------------------
// formatGpuResourceName
// ---------------------------------------------------------------------------

describe('formatGpuResourceName', () => {
  it('formats i915 resource', () => {
    expect(formatGpuResourceName('gpu.intel.com/i915')).toBe('GPU (i915)');
  });

  it('formats xe resource', () => {
    expect(formatGpuResourceName('gpu.intel.com/xe')).toBe('GPU (Xe)');
  });

  it('formats millicores resource', () => {
    expect(formatGpuResourceName('gpu.intel.com/millicores')).toBe('GPU Millicores');
  });

  it('returns raw suffix for unknown resources', () => {
    expect(formatGpuResourceName('gpu.intel.com/custom')).toBe('custom');
  });
});

// ---------------------------------------------------------------------------
// formatGpuType
// ---------------------------------------------------------------------------

describe('formatGpuType', () => {
  it('formats discrete', () => {
    expect(formatGpuType('discrete')).toBe('Discrete');
  });

  it('formats integrated', () => {
    expect(formatGpuType('integrated')).toBe('Integrated');
  });

  it('formats unknown', () => {
    expect(formatGpuType('unknown')).toBe('Unknown');
  });
});

// ---------------------------------------------------------------------------
// pluginStatusToStatus
// ---------------------------------------------------------------------------

describe('pluginStatusToStatus', () => {
  function makePlugin(
    desired: number,
    ready: number,
    unavailable = 0
  ): GpuDevicePlugin {
    return {
      apiVersion: 'deviceplugin.intel.com/v1',
      kind: 'GpuDevicePlugin',
      metadata: { name: 'test-plugin' },
      spec: {},
      status: {
        desiredNumberScheduled: desired,
        numberReady: ready,
        numberUnavailable: unavailable,
      },
    };
  }

  it('returns success when all nodes ready', () => {
    expect(pluginStatusToStatus(makePlugin(3, 3))).toBe('success');
  });

  it('returns warning when desired is 0', () => {
    expect(pluginStatusToStatus(makePlugin(0, 0))).toBe('warning');
  });

  it('returns warning when some nodes unavailable', () => {
    expect(pluginStatusToStatus(makePlugin(3, 2, 1))).toBe('warning');
  });

  it('returns error when ready < desired with no unavailable', () => {
    expect(pluginStatusToStatus(makePlugin(3, 1))).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// pluginStatusText
// ---------------------------------------------------------------------------

describe('pluginStatusText', () => {
  it('shows ready/desired counts', () => {
    const plugin: GpuDevicePlugin = {
      apiVersion: 'deviceplugin.intel.com/v1',
      kind: 'GpuDevicePlugin',
      metadata: { name: 'p' },
      spec: {},
      status: { desiredNumberScheduled: 3, numberReady: 2 },
    };
    expect(pluginStatusText(plugin)).toBe('2/3 ready');
  });

  it('shows no nodes scheduled when desired is 0', () => {
    const plugin: GpuDevicePlugin = {
      apiVersion: 'deviceplugin.intel.com/v1',
      kind: 'GpuDevicePlugin',
      metadata: { name: 'p' },
      spec: {},
      status: { desiredNumberScheduled: 0, numberReady: 0 },
    };
    expect(pluginStatusText(plugin)).toBe('No nodes scheduled');
  });
});
