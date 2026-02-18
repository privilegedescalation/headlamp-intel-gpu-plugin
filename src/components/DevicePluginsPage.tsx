/**
 * DevicePluginsPage — lists all GpuDevicePlugin CRD instances.
 *
 * Shows configuration details for each Intel GPU device plugin deployment,
 * including spec and status information.
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
import { formatAge, isPodReady, pluginStatusText, pluginStatusToStatus } from '../api/k8s';

export default function DevicePluginsPage() {
  const { devicePlugins, pluginPods, crdAvailable, loading, error, refresh } =
    useIntelGpuContext();

  if (loading) {
    return <Loader title="Loading device plugin data..." />;
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <SectionHeader title="Intel GPU — Device Plugins" />
        <button
          onClick={refresh}
          aria-label="Refresh device plugin data"
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

      {!crdAvailable && (
        <SectionBox title="CRD Not Available">
          <NameValueTable
            rows={[
              {
                name: 'Status',
                value: (
                  <StatusLabel status="warning">
                    GpuDevicePlugin CRD (deviceplugin.intel.com/v1) is not installed
                  </StatusLabel>
                ),
              },
              {
                name: 'Note',
                value:
                  'Install the Intel Device Plugins Operator to manage GpuDevicePlugin resources. ' +
                  'Plugin daemon pods are shown below if detected.',
              },
            ]}
          />
        </SectionBox>
      )}

      {/* GpuDevicePlugin CRD instances */}
      {crdAvailable && devicePlugins.length === 0 && (
        <SectionBox title="No Device Plugins">
          <NameValueTable
            rows={[
              {
                name: 'Status',
                value: (
                  <StatusLabel status="warning">
                    No GpuDevicePlugin resources found on this cluster
                  </StatusLabel>
                ),
              },
              {
                name: 'Create',
                value:
                  'kubectl apply -f gpudeviceplugin.yaml (see Intel documentation for configuration)',
              },
            ]}
          />
        </SectionBox>
      )}

      {devicePlugins.map(plugin => (
        <SectionBox key={plugin.metadata.uid ?? plugin.metadata.name} title={`GpuDevicePlugin: ${plugin.metadata.name}`}>
          <NameValueTable
            rows={[
              {
                name: 'Status',
                value: (
                  <StatusLabel status={pluginStatusToStatus(plugin)}>
                    {pluginStatusText(plugin)}
                  </StatusLabel>
                ),
              },
              {
                name: 'Image',
                value: plugin.spec.image ?? '—',
              },
              {
                name: 'Shared Devices/Node',
                value: String(plugin.spec.sharedDevNum ?? 1),
              },
              {
                name: 'Allocation Policy',
                value: plugin.spec.preferredAllocationPolicy ?? 'default',
              },
              {
                name: 'Monitoring',
                value: plugin.spec.enableMonitoring ? (
                  <StatusLabel status="success">Enabled</StatusLabel>
                ) : (
                  <StatusLabel status="warning">Disabled</StatusLabel>
                ),
              },
              {
                name: 'Resource Manager',
                value: plugin.spec.resourceManager ? 'Enabled' : 'Disabled',
              },
              {
                name: 'Desired Nodes',
                value: String(plugin.status?.desiredNumberScheduled ?? '—'),
              },
              {
                name: 'Ready Nodes',
                value: String(plugin.status?.numberReady ?? '—'),
              },
              ...(plugin.status?.numberUnavailable
                ? [{
                    name: 'Unavailable Nodes',
                    value: (
                      <StatusLabel status="error">
                        {plugin.status.numberUnavailable}
                      </StatusLabel>
                    ),
                  }]
                : []),
              {
                name: 'Node Selector',
                value: plugin.spec.nodeSelector
                  ? Object.entries(plugin.spec.nodeSelector)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(', ')
                  : '—',
              },
              {
                name: 'Age',
                value: formatAge(plugin.metadata.creationTimestamp),
              },
            ]}
          />
        </SectionBox>
      ))}

      {/* Plugin daemon pods */}
      {pluginPods.length > 0 && (
        <SectionBox title="Plugin Daemon Pods">
          <SimpleTable
            columns={[
              { label: 'Name', getter: (p) => p.metadata.name },
              { label: 'Namespace', getter: (p) => p.metadata.namespace ?? '—' },
              { label: 'Node', getter: (p) => p.spec?.nodeName ?? '—' },
              {
                label: 'Ready',
                getter: (p) => (
                  <StatusLabel status={isPodReady(p) ? 'success' : 'warning'}>
                    {isPodReady(p) ? 'Ready' : p.status?.phase ?? 'Unknown'}
                  </StatusLabel>
                ),
              },
              {
                label: 'Restarts',
                getter: (p) => {
                  const restarts = p.status?.containerStatuses?.reduce(
                    (sum, c) => sum + c.restartCount, 0
                  ) ?? 0;
                  return restarts > 0 ? (
                    <StatusLabel status="warning">{restarts}</StatusLabel>
                  ) : (
                    String(restarts)
                  );
                },
              },
              { label: 'Age', getter: (p) => formatAge(p.metadata.creationTimestamp) },
            ]}
            data={pluginPods}
          />
        </SectionBox>
      )}
    </>
  );
}
