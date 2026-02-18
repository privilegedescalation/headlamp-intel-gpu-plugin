/**
 * NodeColumns — adds Intel GPU columns to the native Headlamp Nodes table.
 *
 * Injects two columns:
 *   - "GPU Type" — Discrete / Integrated / — for non-GPU nodes
 *   - "GPU Devices" — count of i915/xe devices available on the node
 *
 * The processor is registered via registerResourceTableColumnsProcessor
 * in index.tsx, targeting the 'headlamp-nodes' table ID.
 */

import { StatusLabel } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import React from 'react';
import {
  formatGpuType,
  getNodeGpuCount,
  getNodeGpuType,
  isIntelGpuNode,
} from '../../api/k8s';

/** Build GPU columns to append to the native Nodes table. */
export function buildNodeGpuColumns() {
  return [
    {
      label: 'GPU Type',
      getter: (resource: unknown) => {
        // resource is a Headlamp KubeObject — extract jsonData
        const raw =
          resource && typeof resource === 'object' && 'jsonData' in resource
            ? (resource as { jsonData: unknown }).jsonData
            : resource;

        if (!isIntelGpuNode(raw)) return '—';
        const node = raw as Parameters<typeof getNodeGpuType>[0];
        const type = getNodeGpuType(node);
        return (
          <StatusLabel status="success">
            {formatGpuType(type)}
          </StatusLabel>
        );
      },
    },
    {
      label: 'GPU Devices',
      getter: (resource: unknown) => {
        const raw =
          resource && typeof resource === 'object' && 'jsonData' in resource
            ? (resource as { jsonData: unknown }).jsonData
            : resource;

        if (!isIntelGpuNode(raw)) return '—';
        const node = raw as Parameters<typeof getNodeGpuCount>[0];
        const count = getNodeGpuCount(node);
        return count > 0 ? String(count) : '—';
      },
    },
  ];
}
