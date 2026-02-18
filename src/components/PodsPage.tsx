/**
 * PodsPage — lists all pods requesting Intel GPU resources.
 *
 * Shows GPU resource requests/limits per container and pod-level status.
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
  IntelGpuPod,
  INTEL_GPU_RESOURCE_PREFIX,
  isPodReady,
  getPodGpuRequests,
  getPodRestarts,
} from '../api/k8s';

// ---------------------------------------------------------------------------
// Phase → status mapping
// ---------------------------------------------------------------------------

function phaseToStatus(phase: string | undefined): 'success' | 'warning' | 'error' {
  switch (phase) {
    case 'Running': return 'success';
    case 'Succeeded': return 'success';
    case 'Pending': return 'warning';
    case 'Failed': return 'error';
    default: return 'warning';
  }
}

// ---------------------------------------------------------------------------
// GPU container list for a pod
// ---------------------------------------------------------------------------

function GpuContainerList({ pod }: { pod: IntelGpuPod }) {
  const containers = pod.spec?.containers ?? [];
  const gpuContainers = containers.filter(c => {
    const resources = { ...c.resources?.requests, ...c.resources?.limits };
    return Object.keys(resources).some(k => k.startsWith(INTEL_GPU_RESOURCE_PREFIX));
  });

  if (gpuContainers.length === 0) return <span>—</span>;

  return (
    <>
      {gpuContainers.map(c => {
        const requests = c.resources?.requests ?? {};
        const limits = c.resources?.limits ?? {};
        const gpuKeys = new Set([
          ...Object.keys(requests).filter(k => k.startsWith(INTEL_GPU_RESOURCE_PREFIX)),
          ...Object.keys(limits).filter(k => k.startsWith(INTEL_GPU_RESOURCE_PREFIX)),
        ]);

        const parts: string[] = [];
        for (const key of gpuKeys) {
          const shortKey = formatGpuResourceName(key);
          const req = requests[key];
          const lim = limits[key];
          if (req && lim && req === lim) {
            parts.push(`${shortKey}: ${req}`);
          } else if (req || lim) {
            parts.push(`${shortKey}: req=${req ?? '—'} lim=${lim ?? '—'}`);
          }
        }

        return (
          <div key={c.name} style={{ marginBottom: '2px', fontSize: '13px' }}>
            <strong>{c.name}</strong>: {parts.join(', ')}
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PodsPage() {
  const { gpuPods, loading, error, refresh } = useIntelGpuContext();

  if (loading) {
    return <Loader title="Loading GPU pod data..." />;
  }

  // Group by phase
  const running = gpuPods.filter(p => p.status?.phase === 'Running');
  const pending = gpuPods.filter(p => p.status?.phase === 'Pending');
  const failed = gpuPods.filter(p => p.status?.phase === 'Failed');
  const other = gpuPods.filter(
    p => !['Running', 'Pending', 'Failed'].includes(p.status?.phase ?? '')
  );

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <SectionHeader title="Intel GPU — Pods" />
        <button
          onClick={refresh}
          aria-label="Refresh pod data"
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

      {gpuPods.length === 0 && (
        <SectionBox title="No GPU Pods Found">
          <NameValueTable
            rows={[
              {
                name: 'Status',
                value: (
                  <StatusLabel status="warning">
                    No pods requesting Intel GPU resources were found
                  </StatusLabel>
                ),
              },
              {
                name: 'Note',
                value:
                  'Pods appear here when they request resources like gpu.intel.com/i915 or gpu.intel.com/xe.',
              },
            ]}
          />
        </SectionBox>
      )}

      {/* Summary */}
      {gpuPods.length > 0 && (
        <SectionBox title="Summary">
          <NameValueTable
            rows={[
              { name: 'Total GPU Pods', value: String(gpuPods.length) },
              ...(running.length > 0
                ? [{ name: 'Running', value: <StatusLabel status="success">{running.length}</StatusLabel> }]
                : []),
              ...(pending.length > 0
                ? [{ name: 'Pending', value: <StatusLabel status="warning">{pending.length}</StatusLabel> }]
                : []),
              ...(failed.length > 0
                ? [{ name: 'Failed', value: <StatusLabel status="error">{failed.length}</StatusLabel> }]
                : []),
            ]}
          />
        </SectionBox>
      )}

      {/* All pods table */}
      {gpuPods.length > 0 && (
        <SectionBox title="All GPU Pods">
          <SimpleTable
            columns={[
              { label: 'Name', getter: (p) => p.metadata.name },
              { label: 'Namespace', getter: (p) => p.metadata.namespace ?? '—' },
              { label: 'Node', getter: (p) => p.spec?.nodeName ?? '—' },
              {
                label: 'Phase',
                getter: (p) => (
                  <StatusLabel status={phaseToStatus(p.status?.phase)}>
                    {p.status?.phase ?? 'Unknown'}
                  </StatusLabel>
                ),
              },
              {
                label: 'GPU Resources',
                getter: (p) => <GpuContainerList pod={p} />,
              },
              {
                label: 'Restarts',
                getter: (p) => {
                  const restarts = getPodRestarts(p);
                  return restarts > 0 ? (
                    <StatusLabel status="warning">{restarts}</StatusLabel>
                  ) : (
                    String(restarts)
                  );
                },
              },
              { label: 'Age', getter: (p) => formatAge(p.metadata.creationTimestamp) },
            ]}
            data={gpuPods}
          />
        </SectionBox>
      )}

      {/* Pending pods attention box */}
      {pending.length > 0 && (
        <SectionBox title="Attention: Pending GPU Pods">
          <SimpleTable
            columns={[
              { label: 'Name', getter: (p) => p.metadata.name },
              { label: 'Namespace', getter: (p) => p.metadata.namespace ?? '—' },
              {
                label: 'GPU Resources',
                getter: (p) => {
                  const reqs = getPodGpuRequests(p);
                  return Object.entries(reqs)
                    .map(([k, v]) => `${formatGpuResourceName(k)}: ${v}`)
                    .join(', ') || '—';
                },
              },
              {
                label: 'Waiting Reason',
                getter: (p) => {
                  const reason = p.status?.containerStatuses?.[0]?.state?.waiting?.reason;
                  return reason ?? '—';
                },
              },
              { label: 'Age', getter: (p) => formatAge(p.metadata.creationTimestamp) },
            ]}
            data={pending}
          />
        </SectionBox>
      )}
    </>
  );
}
