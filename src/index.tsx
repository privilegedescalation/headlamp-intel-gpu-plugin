/**
 * headlamp-intel-gpu-plugin — entry point.
 *
 * Registers sidebar entries, routes, detail view sections, and table column
 * processors for Intel GPU device plugin visibility in Headlamp.
 *
 * Surfaces Intel GPU information in the following places:
 *   - Dedicated sidebar section: Overview / Device Plugins / Nodes / Pods / Metrics
 *   - Native Node detail page: Intel GPU section (capacity, utilization, pods)
 *   - Native Pod detail page: GPU resource requests per container
 *   - Native Nodes table: GPU Type and GPU Devices columns
 */

import {
  registerDetailsViewSection,
  registerResourceTableColumnsProcessor,
  registerRoute,
  registerSidebarEntry,
} from '@kinvolk/headlamp-plugin/lib';
import React from 'react';
import { IntelGpuDataProvider } from './api/IntelGpuDataContext';
import DevicePluginsPage from './components/DevicePluginsPage';
import { buildNodeGpuColumns } from './components/integrations/NodeColumns';
import MetricsPage from './components/MetricsPage';
import NodeDetailSection from './components/NodeDetailSection';
import NodesPage from './components/NodesPage';
import OverviewPage from './components/OverviewPage';
import PodDetailSection from './components/PodDetailSection';
import PodsPage from './components/PodsPage';

// ---------------------------------------------------------------------------
// Sidebar entries
// ---------------------------------------------------------------------------

registerSidebarEntry({
  parent: null,
  name: 'headlamp-intel-gpu',
  label: 'headlamp-intel-gpu',
  url: '/headlamp-intel-gpu',
  icon: 'mdi:gpu',
});

registerSidebarEntry({
  parent: 'headlamp-intel-gpu',
  name: 'headlamp-intel-gpu-overview',
  label: 'Overview',
  url: '/headlamp-intel-gpu',
  icon: 'mdi:view-dashboard',
});

registerSidebarEntry({
  parent: 'headlamp-intel-gpu',
  name: 'headlamp-intel-gpu-device-plugins',
  label: 'Device Plugins',
  url: '/headlamp-intel-gpu/device-plugins',
  icon: 'mdi:chip',
});

registerSidebarEntry({
  parent: 'headlamp-intel-gpu',
  name: 'headlamp-intel-gpu-nodes',
  label: 'GPU Nodes',
  url: '/headlamp-intel-gpu/nodes',
  icon: 'mdi:server',
});

registerSidebarEntry({
  parent: 'headlamp-intel-gpu',
  name: 'headlamp-intel-gpu-pods',
  label: 'GPU Pods',
  url: '/headlamp-intel-gpu/pods',
  icon: 'mdi:cube-outline',
});

registerSidebarEntry({
  parent: 'headlamp-intel-gpu',
  name: 'headlamp-intel-gpu-metrics',
  label: 'Metrics',
  url: '/headlamp-intel-gpu/metrics',
  icon: 'mdi:chart-line',
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

registerRoute({
  path: '/headlamp-intel-gpu',
  sidebar: 'headlamp-intel-gpu-overview',
  name: 'headlamp-intel-gpu-overview',
  exact: true,
  component: () => (
    <IntelGpuDataProvider>
      <OverviewPage />
    </IntelGpuDataProvider>
  ),
});

registerRoute({
  path: '/headlamp-intel-gpu/device-plugins',
  sidebar: 'headlamp-intel-gpu-device-plugins',
  name: 'headlamp-intel-gpu-device-plugins',
  exact: true,
  component: () => (
    <IntelGpuDataProvider>
      <DevicePluginsPage />
    </IntelGpuDataProvider>
  ),
});

registerRoute({
  path: '/headlamp-intel-gpu/nodes',
  sidebar: 'headlamp-intel-gpu-nodes',
  name: 'headlamp-intel-gpu-nodes',
  exact: true,
  component: () => (
    <IntelGpuDataProvider>
      <NodesPage />
    </IntelGpuDataProvider>
  ),
});

registerRoute({
  path: '/headlamp-intel-gpu/pods',
  sidebar: 'headlamp-intel-gpu-pods',
  name: 'headlamp-intel-gpu-pods',
  exact: true,
  component: () => (
    <IntelGpuDataProvider>
      <PodsPage />
    </IntelGpuDataProvider>
  ),
});

registerRoute({
  path: '/headlamp-intel-gpu/metrics',
  sidebar: 'headlamp-intel-gpu-metrics',
  name: 'headlamp-intel-gpu-metrics',
  exact: true,
  component: () => (
    <IntelGpuDataProvider>
      <MetricsPage />
    </IntelGpuDataProvider>
  ),
});

// ---------------------------------------------------------------------------
// Detail view section — Node pages
// Inject Intel GPU section into native Node detail page for GPU nodes.
// ---------------------------------------------------------------------------

registerDetailsViewSection(({ resource }) => {
  if (resource?.kind !== 'Node') return null;

  return (
    <IntelGpuDataProvider>
      <NodeDetailSection resource={resource} />
    </IntelGpuDataProvider>
  );
});

// ---------------------------------------------------------------------------
// Detail view section — Pod pages
// Inject Intel GPU resource section into native Pod detail page for GPU pods.
// ---------------------------------------------------------------------------

registerDetailsViewSection(({ resource }) => {
  if (resource?.kind !== 'Pod') return null;
  return <PodDetailSection resource={resource} />;
});

// ---------------------------------------------------------------------------
// Table column processors — native Nodes table
// Appends GPU Type and GPU Devices columns.
// ---------------------------------------------------------------------------

registerResourceTableColumnsProcessor(({ id, columns }) => {
  if (id === 'headlamp-nodes') {
    return [...columns, ...buildNodeGpuColumns()];
  }
  return columns;
});
