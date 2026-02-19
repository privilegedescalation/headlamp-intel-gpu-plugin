/**
 * MetricsPage — real-time Intel GPU metrics from the device plugin pods.
 *
 * Fetches Prometheus metrics from each Intel GPU device plugin pod (port 9090)
 * and displays per-card engine utilization, GPU frequency, memory usage,
 * and cumulative energy. Requires `enableMonitoring: true` in GpuDevicePlugin.
 */

import {
  Loader,
  NameValueTable,
  SectionBox,
  SectionHeader,
  StatusLabel,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import React, { useCallback, useEffect, useState } from 'react';
import { useIntelGpuContext } from '../api/IntelGpuDataContext';
import {
  fetchGpuPluginMetrics,
  formatBytes,
  formatFreq,
  GpuNodeMetrics,
} from '../api/metrics';
import { IntelGpuPod } from '../api/k8s';

// ---------------------------------------------------------------------------
// Utilization bar
// ---------------------------------------------------------------------------

function UtilizationBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? '#d32f2f' : pct >= 70 ? '#f57c00' : '#0071c5';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div
        style={{
          width: '100px',
          height: '8px',
          backgroundColor: '#e0e0e0',
          borderRadius: '4px',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: '4px',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <span style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-node metrics card
// ---------------------------------------------------------------------------

function NodeMetricsCard({ metrics }: { metrics: GpuNodeMetrics }) {
  const { nodeName, podName, engineUtilization, boostFreqMhz, memoryLocalBytes, memorySystemBytes, energyMicrojoules } = metrics;

  // Group engines by card
  const byCard = new Map<string, typeof engineUtilization>();
  for (const e of engineUtilization) {
    if (!byCard.has(e.card)) byCard.set(e.card, []);
    byCard.get(e.card)!.push(e);
  }

  const freqByCard = new Map(boostFreqMhz.map(f => [f.card, f.value]));
  const memLocalByCard = new Map(memoryLocalBytes.map(m => [m.card, m.value]));
  const memSysByCard = new Map(memorySystemBytes.map(m => [m.card, m.value]));
  const energyByCard = new Map(energyMicrojoules.map(e => [e.card, e.value]));

  const cards = Array.from(
    new Set([
      ...byCard.keys(),
      ...freqByCard.keys(),
      ...memLocalByCard.keys(),
    ])
  ).sort();

  if (cards.length === 0) {
    return (
      <SectionBox title={`${nodeName} — No Metric Data`}>
        <NameValueTable
          rows={[
            {
              name: 'Pod',
              value: podName,
            },
            {
              name: 'Note',
              value: 'No GPU metrics found. Ensure enableMonitoring: true is set in GpuDevicePlugin.',
            },
          ]}
        />
      </SectionBox>
    );
  }

  return (
    <>
      {cards.map(card => {
        const engines = byCard.get(card) ?? [];
        const freq = freqByCard.get(card);
        const memLocal = memLocalByCard.get(card);
        const memSys = memSysByCard.get(card);
        const energy = energyByCard.get(card);

        const rows: Array<{ name: string; value: React.ReactNode }> = [
          { name: 'Node', value: nodeName },
          { name: 'Plugin Pod', value: podName },
          { name: 'GPU Card', value: card },
        ];

        if (freq !== undefined) {
          rows.push({ name: 'Boost Frequency', value: formatFreq(freq) });
        }

        if (memLocal !== undefined) {
          rows.push({ name: 'VRAM (local)', value: formatBytes(memLocal) });
        }
        if (memSys !== undefined && memSys > 0) {
          rows.push({ name: 'System Memory', value: formatBytes(memSys) });
        }

        if (energy !== undefined) {
          rows.push({
            name: 'Energy (cumulative)',
            value: `${(energy / 1e6).toFixed(2)} J`,
          });
        }

        // Engine utilization rows
        for (const e of engines) {
          rows.push({
            name: `Engine: ${e.engine}`,
            value: <UtilizationBar pct={e.pct} />,
          });
        }

        return (
          <SectionBox key={`${nodeName}-${card}`} title={`${nodeName} — ${card}`}>
            <NameValueTable rows={rows} />
          </SectionBox>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MetricsPage() {
  const { pluginPods, pluginInstalled, loading: ctxLoading } = useIntelGpuContext();

  const [metricsMap, setMetricsMap] = useState<Map<string, GpuNodeMetrics | 'error'>>(new Map());
  const [fetching, setFetching] = useState(false);

  const fetchAll = useCallback(async (pods: IntelGpuPod[]) => {
    if (pods.length === 0) return;
    setFetching(true);

    const results = await Promise.all(
      pods.map(async pod => {
        const name = pod.metadata.name;
        const namespace = pod.metadata.namespace ?? 'kube-system';
        const nodeName = pod.spec?.nodeName ?? name;
        const result = await fetchGpuPluginMetrics(name, namespace, nodeName);
        return { name, result };
      })
    );

    const map = new Map<string, GpuNodeMetrics | 'error'>();
    for (const { name, result } of results) {
      map.set(name, result ?? 'error');
    }
    setMetricsMap(map);
    setFetching(false);
  }, []);

  useEffect(() => {
    if (!ctxLoading && pluginPods.length > 0) {
      void fetchAll(pluginPods);
    }
  }, [ctxLoading, pluginPods, fetchAll]);

  if (ctxLoading) {
    return <Loader title="Loading Intel GPU data..." />;
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <SectionHeader title="Intel GPU — Metrics" />
        <button
          onClick={() => void fetchAll(pluginPods)}
          disabled={fetching || pluginPods.length === 0}
          aria-label="Refresh metrics"
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
          {fetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {!pluginInstalled && (
        <SectionBox title="Intel GPU Plugin Not Detected">
          <NameValueTable
            rows={[
              {
                name: 'Status',
                value: (
                  <StatusLabel status="warning">No Intel GPU device plugin pods found</StatusLabel>
                ),
              },
              {
                name: 'Note',
                value: 'Install the Intel GPU device plugin and set enableMonitoring: true to expose Prometheus metrics.',
              },
            ]}
          />
        </SectionBox>
      )}

      {pluginInstalled && pluginPods.length === 0 && (
        <SectionBox title="No Plugin Pods Found">
          <NameValueTable
            rows={[
              {
                name: 'Status',
                value: (
                  <StatusLabel status="warning">Plugin detected via CRD but no pods found</StatusLabel>
                ),
              },
            ]}
          />
        </SectionBox>
      )}

      {pluginPods.length > 0 && metricsMap.size === 0 && fetching && (
        <Loader title="Fetching GPU metrics..." />
      )}

      {pluginPods.length > 0 && metricsMap.size === 0 && !fetching && (
        <SectionBox title="Metrics Unavailable">
          <NameValueTable
            rows={[
              {
                name: 'Status',
                value: (
                  <StatusLabel status="warning">
                    Could not fetch metrics from any plugin pod
                  </StatusLabel>
                ),
              },
              {
                name: 'Requirements',
                value: 'Set enableMonitoring: true in GpuDevicePlugin spec and ensure port 9090 is accessible via kube-apiserver proxy.',
              },
              {
                name: 'Plugin Pods Found',
                value: pluginPods.map(p => p.metadata.name).join(', '),
              },
            ]}
          />
        </SectionBox>
      )}

      {Array.from(metricsMap.entries()).map(([podName, metrics]) => {
        if (metrics === 'error') {
          return (
            <SectionBox key={podName} title={`${podName} — Metrics Unavailable`}>
              <NameValueTable
                rows={[
                  {
                    name: 'Status',
                    value: (
                      <StatusLabel status="error">
                        Failed to fetch metrics from pod
                      </StatusLabel>
                    ),
                  },
                  {
                    name: 'Hint',
                    value: 'Ensure enableMonitoring: true is set in the GpuDevicePlugin CR and the pod is running.',
                  },
                ]}
              />
            </SectionBox>
          );
        }
        return <NodeMetricsCard key={podName} metrics={metrics} />;
      })}
    </>
  );
}
