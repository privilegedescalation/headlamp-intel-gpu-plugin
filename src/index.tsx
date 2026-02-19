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
  name: 'intel-gpu',
  label: 'intel-gpu',
  url: '/intel-gpu',
  icon: 'mdi:gpu',
});

registerSidebarEntry({
  parent: 'intel-gpu',
  name: 'intel-gpu-overview',
  label: 'Overview',
  url: '/intel-gpu',
  icon: 'mdi:view-dashboard',
});

registerSidebarEntry({
  parent: 'intel-gpu',
  name: 'intel-gpu-device-plugins',
  label: 'Device Plugins',
  url: '/intel-gpu/device-plugins',
  icon: 'mdi:chip',
});

registerSidebarEntry({
  parent: 'intel-gpu',
  name: 'intel-gpu-nodes',
  label: 'GPU Nodes',
  url: '/intel-gpu/nodes',
  icon: 'mdi:server',
});

registerSidebarEntry({
  parent: 'intel-gpu',
  name: 'intel-gpu-pods',
  label: 'GPU Pods',
  url: '/intel-gpu/pods',
  icon: 'mdi:cube-outline',
});

registerSidebarEntry({
  parent: 'intel-gpu',
  name: 'intel-gpu-metrics',
  label: 'Metrics',
  url: '/intel-gpu/metrics',
  icon: 'mdi:chart-line',
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

registerRoute({
  path: '/intel-gpu',
  sidebar: 'intel-gpu-overview',
  name: 'intel-gpu-overview',
  exact: true,
  component: () => (
    <IntelGpuDataProvider>
      <OverviewPage />
    </IntelGpuDataProvider>
  ),
});

registerRoute({
  path: '/intel-gpu/device-plugins',
  sidebar: 'intel-gpu-device-plugins',
  name: 'intel-gpu-device-plugins',
  exact: true,
  component: () => (
    <IntelGpuDataProvider>
      <DevicePluginsPage />
    </IntelGpuDataProvider>
  ),
});

registerRoute({
  path: '/intel-gpu/nodes',
  sidebar: 'intel-gpu-nodes',
  name: 'intel-gpu-nodes',
  exact: true,
  component: () => (
    <IntelGpuDataProvider>
      <NodesPage />
    </IntelGpuDataProvider>
  ),
});

registerRoute({
  path: '/intel-gpu/pods',
  sidebar: 'intel-gpu-pods',
  name: 'intel-gpu-pods',
  exact: true,
  component: () => (
    <IntelGpuDataProvider>
      <PodsPage />
    </IntelGpuDataProvider>
  ),
});

registerRoute({
  path: '/intel-gpu/metrics',
  sidebar: 'intel-gpu-metrics',
  name: 'intel-gpu-metrics',
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

