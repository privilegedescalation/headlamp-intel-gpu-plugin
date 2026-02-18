/**
 * AppBarGpuBadge — compact Intel GPU health indicator in the Headlamp app bar.
 *
 * Shows a status chip in the top navigation bar summarising GPU plugin health.
 * Hides itself when no Intel GPU plugin is detected.
 */

import { StatusLabel } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import React from 'react';
import { useIntelGpuContext } from '../api/IntelGpuDataContext';

export default function AppBarGpuBadge() {
  const { pluginInstalled, gpuNodes, devicePlugins, loading } = useIntelGpuContext();

  // Hide when loading or no plugin present
  if (loading || !pluginInstalled) return null;

  const hasUnhealthyPlugin = devicePlugins.some(p => {
    const desired = p.status?.desiredNumberScheduled ?? 0;
    const ready = p.status?.numberReady ?? 0;
    const unavailable = p.status?.numberUnavailable ?? 0;
    return (desired > 0 && ready < desired) || unavailable > 0;
  });

  const status = hasUnhealthyPlugin ? 'warning' : 'success';
  const nodeCount = gpuNodes.length;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '0 8px',
        cursor: 'default',
      }}
      title={`Intel GPU: ${nodeCount} node${nodeCount !== 1 ? 's' : ''}`}
    >
      <StatusLabel status={status}>
        <span style={{ fontSize: '11px', fontWeight: 600 }}>
          Intel GPU{nodeCount > 0 ? ` · ${nodeCount}N` : ''}
        </span>
      </StatusLabel>
    </div>
  );
}
