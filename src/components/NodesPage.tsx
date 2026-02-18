/**
 * NodesPage — lists all nodes with Intel GPU capabilities.
 *
 * Shows GPU type, device count, resource allocation, and pod assignments
 * for each GPU-capable node in the cluster.
 */

import {
  Loader,
  NameValueTable,
  SectionBox,
  SectionHeader,
  SimpleTable,
  StatusLabel,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import React from 'react';
import { useIntelGpuContext } from '../api/IntelGpuDataContext';
import {
  formatAge,
  formatGpuResourceName,
  formatGpuType,
  getGpuResources,
  getNodeGpuCount,
  getNodeGpuType,
  INTEL_GPU_RESOURCE,
  INTEL_GPU_RESOURCE_PREFIX,
  INTEL_GPU_XE_RESOURCE,
  IntelGpuNode,
  isNodeReady,
} from '../api/k8s';

// ---------------------------------------------------------------------------
// GPU allocation bar component
// ---------------------------------------------------------------------------

function GpuAllocationBar({
  used,
  allocatable,
}: {
  used: number;
  allocatable: number;
}) {
  if (allocatable === 0) return <span>—</span>;
  const pct = Math.min(100, Math.round((used / allocatable) * 100));
  const color = pct >= 90 ? '#d32f2f' : pct >= 70 ? '#f57c00' : '#0071c5';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div
        style={{
          width: '80px',
          height: '8px',
          backgroundColor: '#e0e0e0',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: '4px',
          }}
        />
      </div>
      <span style={{ fontSize: '12px' }}>{`${used}/${allocatable} (${pct}%)`}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node detail card
// ---------------------------------------------------------------------------

function NodeDetailCard({
  node,
  podsByNode,
}: {
  node: IntelGpuNode;
  podsByNode: Map<string, string[]>;
}) {
  const gpuType = getNodeGpuType(node);
  const gpuCount = getNodeGpuCount(node);
  const ready = isNodeReady(node);

  const capacityResources = getGpuResources(node.status?.capacity);
  const allocatableResources = getGpuResources(node.status?.allocatable);

  const podsOnNode = podsByNode.get(node.metadata.name) ?? [];

  return (
    <SectionBox title={node.metadata.name}>
      <NameValueTable
        rows={[
          {
            name: 'Status',
            value: (
              <StatusLabel status={ready ? 'success' : 'error'}>
                {ready ? 'Ready' : 'Not Ready'}
              </StatusLabel>
            ),
          },
          {
            name: 'GPU Type',
            value: formatGpuType(gpuType),
          },
          ...(gpuCount > 0
            ? [{ name: 'GPU Devices (i915/xe)', value: String(gpuCount) }]
            : []),
          ...Object.entries(capacityResources).map(([key, cap]) => {
            const alloc = parseInt(allocatableResources[key] ?? '0', 10);
            const total = parseInt(cap, 10);
            return {
              name: `${formatGpuResourceName(key)} (capacity)`,
              value: String(total),
            };
          }),
          ...Object.entries(allocatableResources).map(([key, alloc]) => {
            return {
              name: `${formatGpuResourceName(key)} (allocatable)`,
              value: alloc ?? '0',
            };
          }),
          {
            name: 'GPU Workload Pods',
            value: podsOnNode.length > 0 ? podsOnNode.join(', ') : '—',
          },
          {
            name: 'OS Image',
            value: node.status?.nodeInfo?.osImage ?? '—',
          },
          {
            name: 'Kernel',
            value: node.status?.nodeInfo?.kernelVersion ?? '—',
          },
          {
            name: 'Kubelet',
            value: node.status?.nodeInfo?.kubeletVersion ?? '—',
          },
          {
            name: 'Age',
            value: formatAge(node.metadata.creationTimestamp),
          },
        ]}
      />
    </SectionBox>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function NodesPage() {
  const { gpuNodes, gpuPods, loading, error, refresh } = useIntelGpuContext();

  if (loading) {
    return <Loader title="Loading GPU node data..." />;
  }

  // Build map: nodeName → list of GPU pod names
  const podsByNode = new Map<string, string[]>();
  for (const pod of gpuPods) {
    if (!pod.spec?.nodeName) continue;
    const existing = podsByNode.get(pod.spec.nodeName) ?? [];
    existing.push(pod.metadata.name);
    podsByNode.set(pod.spec.nodeName, existing);
  }

  // Build table data for summary
  const tableData = gpuNodes.map(node => {
    const gpuType = getNodeGpuType(node);
    const gpuCount = getNodeGpuCount(node);
    const ready = isNodeReady(node);
    const capacity = node.status?.capacity ?? {};
    const allocatable = node.status?.allocatable ?? {};

    let totalCapacity = 0;
    let totalAllocatable = 0;
    for (const key of Object.keys(capacity)) {
      if (key === INTEL_GPU_RESOURCE || key === INTEL_GPU_XE_RESOURCE) {
        totalCapacity += parseInt(capacity[key] ?? '0', 10);
        totalAllocatable += parseInt(allocatable[key] ?? '0', 10);
      }
    }

    const podsOnNode = podsByNode.get(node.metadata.name) ?? [];

    return {
      node,
      gpuType,
      gpuCount,
      ready,
      totalCapacity,
      totalAllocatable,
      podsOnNode,
    };
  });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <SectionHeader title="Intel GPU — Nodes" />
        <button
          onClick={refresh}
          aria-label="Refresh node data"
          style={{
            padding: '6px 16px',
            backgroundColor: 'transparent',
            color: 'var(--mui-palette-primary-main, #0071c5)',
            border: '1px solid var(--mui-palette-primary-main, #0071c5)',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <SectionBox title="Error">
          <NameValueTable
            rows={[{ name: 'Status', value: <StatusLabel status="error">{error}</StatusLabel> }]}
          />
        </SectionBox>
      )}

      {gpuNodes.length === 0 && (
        <SectionBox title="No GPU Nodes Found">
          <NameValueTable
            rows={[
              {
                name: 'Status',
                value: (
                  <StatusLabel status="warning">
                    No nodes with Intel GPU resources or labels were found
                  </StatusLabel>
                ),
              },
              {
                name: 'Note',
                value:
                  'Nodes appear here when they have gpu.intel.com/* resources or Intel GPU node labels. ' +
                  'Ensure the Intel GPU device plugin and Node Feature Discovery are installed.',
              },
            ]}
          />
        </SectionBox>
      )}

      {/* Summary table */}
      {gpuNodes.length > 0 && (
        <SectionBox title="GPU Node Summary">
          <SimpleTable
            columns={[
              { label: 'Node', getter: (d) => d.node.metadata.name },
              {
                label: 'Ready',
                getter: (d) => (
                  <StatusLabel status={d.ready ? 'success' : 'error'}>
                    {d.ready ? 'Ready' : 'Not Ready'}
                  </StatusLabel>
                ),
              },
              { label: 'GPU Type', getter: (d) => formatGpuType(d.gpuType) },
              { label: 'GPU Devices', getter: (d) => String(d.gpuCount || '—') },
              {
                label: 'Allocation',
                getter: (d) => (
                  <GpuAllocationBar
                    used={d.podsOnNode.length}
                    allocatable={d.totalAllocatable || d.gpuCount}
                  />
                ),
              },
              { label: 'GPU Pods', getter: (d) => String(d.podsOnNode.length) },
              { label: 'Age', getter: (d) => formatAge(d.node.metadata.creationTimestamp) },
            ]}
            data={tableData}
          />
        </SectionBox>
      )}

      {/* Per-node detail cards */}
      {gpuNodes.map(node => (
        <NodeDetailCard
          key={node.metadata.uid ?? node.metadata.name}
          node={node}
          podsByNode={podsByNode}
        />
      ))}
    </>
  );
}
