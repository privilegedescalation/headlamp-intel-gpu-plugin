/**
 * PodDetailSection — injected into Headlamp's native Pod detail page.
 *
 * Shows Intel GPU resource requests and limits per container, plus
 * a link to the node's GPU summary.
 * Returns null for pods that don't request Intel GPU resources.
 */

import {
  NameValueTable,
  SectionBox,
  StatusLabel,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import React from 'react';
import { formatGpuResourceName, INTEL_GPU_RESOURCE_PREFIX, isGpuRequestingPod } from '../api/k8s';

interface PodDetailSectionProps {
  resource: {
    kind?: string;
    metadata?: { name?: string; namespace?: string };
    jsonData?: unknown;
  };
}

export default function PodDetailSection({ resource }: PodDetailSectionProps) {
  // Extract raw Kubernetes JSON
  const rawPod =
    resource.jsonData && typeof resource.jsonData === 'object'
      ? resource.jsonData
      : resource;

  // Only render for pods that request Intel GPU resources
  if (!isGpuRequestingPod(rawPod)) return null;

  const pod = rawPod as {
    metadata: { name: string; namespace?: string };
    spec?: {
      nodeName?: string;
      containers?: Array<{
        name: string;
        resources?: {
          requests?: Record<string, string>;
          limits?: Record<string, string>;
        };
      }>;
    };
    status?: { phase?: string };
  };

  const containers = pod.spec?.containers ?? [];
  const gpuContainers = containers.filter(c => {
    const all = { ...c.resources?.requests, ...c.resources?.limits };
    return Object.keys(all).some(k => k.startsWith(INTEL_GPU_RESOURCE_PREFIX));
  });

  if (gpuContainers.length === 0) return null;

  // Build rows: one per container per GPU resource
  const rows: Array<{ name: string; value: React.ReactNode }> = [];

  for (const c of gpuContainers) {
    const requests = c.resources?.requests ?? {};
    const limits = c.resources?.limits ?? {};
    const allGpuKeys = new Set([
      ...Object.keys(requests).filter(k => k.startsWith(INTEL_GPU_RESOURCE_PREFIX)),
      ...Object.keys(limits).filter(k => k.startsWith(INTEL_GPU_RESOURCE_PREFIX)),
    ]);

    for (const key of allGpuKeys) {
      const req = requests[key];
      const lim = limits[key];
      const resourceName = formatGpuResourceName(key);

      rows.push({
        name: `${c.name} → ${resourceName} request`,
        value: req ?? '—',
      });
      if (lim && lim !== req) {
        rows.push({
          name: `${c.name} → ${resourceName} limit`,
          value: lim,
        });
      }
    }
  }

  const phase = pod.status?.phase;
  const phaseStatus: 'success' | 'warning' | 'error' =
    phase === 'Running' || phase === 'Succeeded'
      ? 'success'
      : phase === 'Pending'
      ? 'warning'
      : 'error';

  return (
    <SectionBox title="Intel GPU Resources">
      <NameValueTable
        rows={[
          {
            name: 'Phase',
            value: (
              <StatusLabel status={phaseStatus}>{phase ?? 'Unknown'}</StatusLabel>
            ),
          },
          {
            name: 'Scheduled Node',
            value: pod.spec?.nodeName ?? '—',
          },
          {
            name: 'GPU Containers',
            value: String(gpuContainers.length),
          },
          ...rows,
        ]}
      />
    </SectionBox>
  );
}
