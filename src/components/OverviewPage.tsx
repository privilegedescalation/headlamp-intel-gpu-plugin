/**
 * OverviewPage — main dashboard for the Intel GPU plugin.
 *
 * Shows: plugin health, GPU node summary, resource allocation overview,
 * and pods requesting GPU resources.
 */

import {
  Loader,
  NameValueTable,
  PercentageBar,
  SectionBox,
  SectionHeader,
  SimpleTable,
  StatusLabel,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import React from 'react';
import { useIntelGpuContext } from '../api/IntelGpuDataContext';
import {
  formatAge,
  formatGpuType,
  getNodeGpuCount,
  getNodeGpuType,
  getPodGpuRequests,
  INTEL_GPU_RESOURCE,
  INTEL_GPU_RESOURCE_PREFIX,
  INTEL_GPU_XE_RESOURCE,
  isNodeReady,
  isPodReady,
  pluginStatusText,
  pluginStatusToStatus,
} from '../api/k8s';

// ---------------------------------------------------------------------------
// GPU type distribution chart
// ---------------------------------------------------------------------------

function gpuTypeChartData(
  discreteCount: number,
  integratedCount: number,
  unknownCount: number
): Array<{ name: string; value: number; fill: string }> {
  const data = [];
  if (discreteCount > 0) data.push({ name: 'Discrete', value: discreteCount, fill: '#0071c5' });
  if (integratedCount > 0) data.push({ name: 'Integrated', value: integratedCount, fill: '#60a4dc' });
  if (unknownCount > 0) data.push({ name: 'Unknown', value: unknownCount, fill: '#9e9e9e' });
  return data;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  const {
    devicePlugins,
    pluginInstalled,
    gpuNodes,
    gpuPods,
    pluginPods,
    crdAvailable,
    loading,
    error,
    refresh,
  } = useIntelGpuContext();

  if (loading) {
    return <Loader title="Loading Intel GPU data..." />;
  }

  // Node type breakdown
  let discreteCount = 0;
  let integratedCount = 0;
  let unknownCount = 0;
  let totalGpuCount = 0;
  let readyNodeCount = 0;

  for (const node of gpuNodes) {
    const type = getNodeGpuType(node);
    if (type === 'discrete') discreteCount++;
    else if (type === 'integrated') integratedCount++;
    else unknownCount++;

    totalGpuCount += getNodeGpuCount(node);
    if (isNodeReady(node)) readyNodeCount++;
  }

  // GPU allocation summary: sum capacity vs allocatable across all GPU nodes
  let totalCapacityGpus = 0;
  let totalAllocatableGpus = 0;
  let totalAllocatedGpus = 0;

  for (const node of gpuNodes) {
    const capacity = node.status?.capacity ?? {};
    const allocatable = node.status?.allocatable ?? {};
    for (const key of Object.keys(capacity)) {
      if (key === INTEL_GPU_RESOURCE || key === INTEL_GPU_XE_RESOURCE) {
        totalCapacityGpus += parseInt(capacity[key] ?? '0', 10);
        totalAllocatableGpus += parseInt(allocatable[key] ?? '0', 10);
      }
    }
  }

  // Count GPUs in use from pods
  for (const pod of gpuPods) {
    if (pod.status?.phase !== 'Running') continue;
    const requests = getPodGpuRequests(pod);
    for (const [key, value] of Object.entries(requests)) {
      if (key === INTEL_GPU_RESOURCE || key === INTEL_GPU_XE_RESOURCE) {
        totalAllocatedGpus += parseInt(value, 10) || 0;
      }
    }
  }

  const gpuUtilizationPct =
    totalCapacityGpus > 0
      ? Math.round((totalAllocatedGpus / totalCapacityGpus) * 100)
      : 0;

  const chartData = gpuTypeChartData(discreteCount, integratedCount, unknownCount);
  const totalGpuNodes = gpuNodes.length;

  // Pod phase breakdown
  const podPhaseCounts = { Running: 0, Pending: 0, Succeeded: 0, Failed: 0, Other: 0 };
  for (const pod of gpuPods) {
    const phase = pod.status?.phase ?? 'Other';
    if (phase in podPhaseCounts) {
      podPhaseCounts[phase as keyof typeof podPhaseCounts]++;
    } else {
      podPhaseCounts.Other++;
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <SectionHeader title="Intel GPU — Overview" />
        <button
          onClick={refresh}
          aria-label="Refresh Intel GPU data"
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

      {/* Error state */}
      {error && (
        <SectionBox title="Error">
          <NameValueTable
            rows={[{ name: 'Status', value: <StatusLabel status="error">{error}</StatusLabel> }]}
          />
        </SectionBox>
      )}

      {/* Plugin not detected */}
      {!pluginInstalled && !loading && (
        <SectionBox title="Plugin Not Detected">
          <NameValueTable
            rows={[
              {
                name: 'Status',
                value: (
                  <StatusLabel status="warning">
                    Intel GPU device plugin not found on this cluster
                  </StatusLabel>
                ),
              },
              {
                name: 'Install (Helm)',
                value:
                  'helm repo add intel https://intel.github.io/helm-charts && ' +
                  'helm install intel-device-plugins-operator intel/intel-device-plugins-operator',
              },
              {
                name: 'Documentation',
                value: 'https://intel.github.io/intel-device-plugins-for-kubernetes/',
              },
            ]}
          />
        </SectionBox>
      )}

      {/* CRD not available notice */}
      {!crdAvailable && pluginInstalled && (
        <SectionBox title="Notice">
          <NameValueTable
            rows={[
              {
                name: 'CRD Status',
                value: (
                  <StatusLabel status="warning">
                    GpuDevicePlugin CRD not found — limited visibility available
                  </StatusLabel>
                ),
              },
              {
                name: 'Note',
                value:
                  'Plugin pods detected via DaemonSet labels. Install the Intel Device Plugins Operator for full CRD-based management.',
              },
            ]}
          />
        </SectionBox>
      )}

      {/* Device Plugin status — only shown when CRDs exist */}
      {crdAvailable && devicePlugins.length > 0 && (
        <SectionBox title="Device Plugin Status">
          <SimpleTable
            columns={[
              { label: 'Name', getter: (p) => p.metadata.name },
              {
                label: 'Status',
                getter: (p) => (
                  <StatusLabel status={pluginStatusToStatus(p)}>
                    {pluginStatusText(p)}
                  </StatusLabel>
                ),
              },
              {
                label: 'Monitoring',
                getter: (p) => p.spec.enableMonitoring ? (
                  <StatusLabel status="success">Enabled</StatusLabel>
                ) : (
                  <StatusLabel status="warning">Disabled</StatusLabel>
                ),
              },
              { label: 'Shared/Node', getter: (p) => String(p.spec.sharedDevNum ?? 1) },
              { label: 'Policy', getter: (p) => p.spec.preferredAllocationPolicy ?? '—' },
              { label: 'Age', getter: (p) => formatAge(p.metadata.creationTimestamp) },
            ]}
            data={devicePlugins}
          />
        </SectionBox>
      )}

      {/* Plugin daemon pods (shown when no CRD, or always as supplemental) */}
      {pluginPods.length > 0 && (
        <SectionBox title="Plugin Daemon Pods">
          <SimpleTable
            columns={[
              { label: 'Name', getter: (p) => p.metadata.name },
              { label: 'Namespace', getter: (p) => p.metadata.namespace ?? '—' },
              { label: 'Node', getter: (p) => p.spec?.nodeName ?? '—' },
              {
                label: 'Status',
                getter: (p) => (
                  <StatusLabel status={isPodReady(p) ? 'success' : 'warning'}>
                    {isPodReady(p) ? 'Ready' : p.status?.phase ?? 'Unknown'}
                  </StatusLabel>
                ),
              },
              { label: 'Age', getter: (p) => formatAge(p.metadata.creationTimestamp) },
            ]}
            data={pluginPods}
          />
        </SectionBox>
      )}

      {/* GPU Node summary */}
      <SectionBox title="GPU Nodes">
        {totalGpuNodes > 0 && chartData.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ marginBottom: '8px', fontSize: '14px', color: 'var(--mui-palette-text-secondary)' }}>
              GPU Type Distribution
            </div>
            <PercentageBar data={chartData} total={totalGpuNodes} />
          </div>
        )}
        <NameValueTable
          rows={[
            {
              name: 'Total GPU Nodes',
              value: (
                <StatusLabel status={totalGpuNodes > 0 ? 'success' : 'warning'}>
                  {totalGpuNodes}
                </StatusLabel>
              ),
            },
            { name: 'Ready Nodes', value: String(readyNodeCount) },
            ...(discreteCount > 0 ? [{ name: 'Discrete GPU Nodes', value: String(discreteCount) }] : []),
            ...(integratedCount > 0 ? [{ name: 'Integrated GPU Nodes', value: String(integratedCount) }] : []),
            ...(totalGpuCount > 0 ? [{ name: 'Total GPU Devices', value: String(totalGpuCount) }] : []),
          ]}
        />
      </SectionBox>

      {/* GPU allocation summary */}
      {totalCapacityGpus > 0 && (
        <SectionBox title="GPU Allocation">
          <div style={{ marginBottom: '16px' }}>
            <div style={{ marginBottom: '8px', fontSize: '14px', color: 'var(--mui-palette-text-secondary)' }}>
              GPU Utilization ({gpuUtilizationPct}%)
            </div>
            <PercentageBar
              data={[
                { name: 'In Use', value: totalAllocatedGpus, fill: '#0071c5' },
                { name: 'Available', value: totalAllocatableGpus - totalAllocatedGpus, fill: '#e0e0e0' },
              ]}
              total={totalAllocatableGpus}
            />
          </div>
          <NameValueTable
            rows={[
              { name: 'Total Capacity (GPU devices)', value: String(totalCapacityGpus) },
              { name: 'Allocatable', value: String(totalAllocatableGpus) },
              { name: 'In Use', value: String(totalAllocatedGpus) },
              {
                name: 'Free',
                value: (
                  <StatusLabel
                    status={totalAllocatableGpus - totalAllocatedGpus > 0 ? 'success' : 'warning'}
                  >
                    {totalAllocatableGpus - totalAllocatedGpus}
                  </StatusLabel>
                ),
              },
            ]}
          />
        </SectionBox>
      )}

      {/* GPU workloads summary */}
      <SectionBox title="GPU Workloads">
        <NameValueTable
          rows={[
            { name: 'Total GPU Pods', value: String(gpuPods.length) },
            ...(podPhaseCounts.Running > 0
              ? [{ name: 'Running', value: <StatusLabel status="success">{podPhaseCounts.Running}</StatusLabel> }]
              : []),
            ...(podPhaseCounts.Pending > 0
              ? [{ name: 'Pending', value: <StatusLabel status="warning">{podPhaseCounts.Pending}</StatusLabel> }]
              : []),
            ...(podPhaseCounts.Failed > 0
              ? [{ name: 'Failed', value: <StatusLabel status="error">{podPhaseCounts.Failed}</StatusLabel> }]
              : []),
          ]}
        />
      </SectionBox>

      {/* Active GPU pods list (running only, trimmed to top 10) */}
      {gpuPods.filter(p => p.status?.phase === 'Running').length > 0 && (
        <SectionBox title="Active GPU Pods">
          <SimpleTable
            columns={[
              { label: 'Name', getter: (p) => p.metadata.name },
              { label: 'Namespace', getter: (p) => p.metadata.namespace ?? '—' },
              { label: 'Node', getter: (p) => p.spec?.nodeName ?? '—' },
              {
                label: 'GPU Request',
                getter: (p) => {
                  const reqs = getPodGpuRequests(p);
                  const parts: string[] = [];
                  for (const [key, val] of Object.entries(reqs)) {
                    const shortKey = key.replace(INTEL_GPU_RESOURCE_PREFIX, '');
                    parts.push(`${shortKey}: ${val}`);
                  }
                  return parts.join(', ') || '—';
                },
              },
              { label: 'Age', getter: (p) => formatAge(p.metadata.creationTimestamp) },
            ]}
            data={gpuPods.filter(p => p.status?.phase === 'Running').slice(0, 10)}
          />
        </SectionBox>
      )}
    </>
  );
}
