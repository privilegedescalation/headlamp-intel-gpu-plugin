/**
 * NodeDetailSection — injected into Headlamp's native Node detail page.
 *
 * Shows Intel GPU resources available on the node (capacity, allocatable),
 * GPU type, and pods currently using GPU resources on this node.
 * Returns null for non-GPU nodes.
 */

import {
  NameValueTable,
  SectionBox,
  StatusLabel,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import React from 'react';
import { useIntelGpuContext } from '../api/IntelGpuDataContext';
import {
  formatGpuResourceName,
  formatGpuType,
  getGpuResources,
  getNodeGpuType,
  INTEL_GPU_RESOURCE,
  INTEL_GPU_RESOURCE_PREFIX,
  INTEL_GPU_XE_RESOURCE,
  isIntelGpuNode,
  isNodeReady,
} from '../api/k8s';

interface NodeDetailSectionProps {
  resource: {
    kind?: string;
    metadata?: { name?: string; labels?: Record<string, string> };
    jsonData?: unknown;
    // Headlamp KubeObject may expose status directly or via jsonData
    status?: unknown;
  };
}

export default function NodeDetailSection({ resource }: NodeDetailSectionProps) {
  const { gpuPods, loading } = useIntelGpuContext();

  // Extract the raw Kubernetes JSON — Headlamp KubeObject wraps it in jsonData
  const rawNode =
    resource.jsonData && typeof resource.jsonData === 'object'
      ? resource.jsonData
      : resource;

  // Only render for Node resources that have Intel GPU
  if (!isIntelGpuNode(rawNode)) return null;

  const node = rawNode as Parameters<typeof isIntelGpuNode>[0] & {
    status?: {
      capacity?: Record<string, string>;
      allocatable?: Record<string, string>;
      nodeInfo?: { kernelVersion?: string; osImage?: string };
    };
    metadata: { name: string; labels?: Record<string, string> };
  };

  const nodeName = (node as { metadata: { name: string } }).metadata.name;
  const capacity = getGpuResources((node as any).status?.capacity);
  const allocatable = getGpuResources((node as any).status?.allocatable);

  const gpuType = getNodeGpuType(node as any);

  // Find GPU pods scheduled on this node
  const podsOnNode = loading
    ? []
    : gpuPods.filter(p => p.spec?.nodeName === nodeName);

  if (Object.keys(capacity).length === 0 && Object.keys(allocatable).length === 0) {
    return null;
  }

  // GPU utilization: count GPU units used by running pods
  let gpuInUse = 0;
  let gpuAllocatable = 0;

  for (const [key, val] of Object.entries(allocatable)) {
    if (key === INTEL_GPU_RESOURCE || key === INTEL_GPU_XE_RESOURCE) {
      gpuAllocatable += parseInt(val, 10) || 0;
    }
  }
  for (const pod of podsOnNode.filter(p => p.status?.phase === 'Running')) {
    const reqs = pod.spec?.containers?.flatMap(c =>
      Object.entries(c.resources?.requests ?? {}).filter(([k]) =>
        k === INTEL_GPU_RESOURCE || k === INTEL_GPU_XE_RESOURCE
      )
    ) ?? [];
    for (const [, val] of reqs) {
      gpuInUse += parseInt(val, 10) || 0;
    }
  }

  const utilizationPct =
    gpuAllocatable > 0 ? Math.round((gpuInUse / gpuAllocatable) * 100) : 0;
  const utilizationStatus: 'success' | 'warning' | 'error' =
    utilizationPct >= 90 ? 'error' : utilizationPct >= 70 ? 'warning' : 'success';

  return (
    <SectionBox title="Intel GPU">
      <NameValueTable
        rows={[
          {
            name: 'GPU Type',
            value: formatGpuType(gpuType),
          },
          // Capacity rows
          ...Object.entries(capacity).map(([key, val]) => ({
            name: `${formatGpuResourceName(key)} (capacity)`,
            value: val,
          })),
          // Allocatable rows
          ...Object.entries(allocatable).map(([key, val]) => ({
            name: `${formatGpuResourceName(key)} (allocatable)`,
            value: val,
          })),
          // Utilization
          ...(gpuAllocatable > 0
            ? [
                {
                  name: 'GPU Utilization',
                  value: (
                    <StatusLabel status={utilizationStatus}>
                      {`${gpuInUse}/${gpuAllocatable} (${utilizationPct}%)`}
                    </StatusLabel>
                  ),
                },
              ]
            : []),
          // Workload pods
          {
            name: 'GPU Workload Pods',
            value:
              podsOnNode.length > 0
                ? podsOnNode.map(p => p.metadata.name).join(', ')
                : loading
                ? 'Loading…'
                : 'None',
          },
        ]}
      />
    </SectionBox>
  );
}
