/**
 * MetricsPage — Intel GPU power metrics from Prometheus (node-exporter hwmon).
 *
 * The Intel i915/Xe GPU driver exposes hwmon sensors which node-exporter scrapes.
 * This page queries kube-prometheus-stack for real-time GPU power draw
 * (derived from node_hwmon_energy_joule_total rate) and TDP per GPU node.
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
import { fetchGpuMetrics, formatPercent, formatWatts, GpuChipMetrics, GpuMetrics } from '../api/metrics';

// ---------------------------------------------------------------------------
// Power bar
// ---------------------------------------------------------------------------

function PowerBar({ watts, maxWatts }: { watts: number; maxWatts: number | null }) {
  const pct = maxWatts && maxWatts > 0 ? Math.min(100, Math.round((watts / maxWatts) * 100)) : null;
  const color = pct === null ? '#0071c5' : pct >= 90 ? '#d32f2f' : pct >= 70 ? '#f57c00' : '#0071c5';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {pct !== null && (
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
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      )}
      <span style={{ fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
        {formatWatts(watts)}
        {maxWatts !== null && maxWatts > 0 && (
          <span style={{ color: '#888', marginLeft: '4px' }}>
            / {formatWatts(maxWatts)} ({formatPercent(watts, maxWatts)})
          </span>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-chip card
// ---------------------------------------------------------------------------

function GpuChipCard({ chip }: { chip: GpuChipMetrics }) {
  const rows: Array<{ name: string; value: React.ReactNode }> = [
    { name: 'Node', value: chip.nodeName },
    { name: 'GPU (PCI)', value: chip.chip },
  ];

  if (chip.powerWatts !== null) {
    rows.push({
      name: 'Current Power',
      value: <PowerBar watts={chip.powerWatts} maxWatts={chip.powerMaxWatts} />,
    });
  } else {
    rows.push({
      name: 'Current Power',
      value: <StatusLabel status="warning">No data (needs ≥5m of scrape history)</StatusLabel>,
    });
  }

  if (chip.powerMaxWatts !== null && chip.powerMaxWatts > 0) {
    rows.push({ name: 'TDP', value: formatWatts(chip.powerMaxWatts) });
  }

  return (
    <SectionBox title={`${chip.nodeName} — ${chip.chip}`}>
      <NameValueTable rows={rows} />
    </SectionBox>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MetricsPage() {
  const { gpuNodes, loading: ctxLoading } = useIntelGpuContext();

  const [metrics, setMetrics] = useState<GpuMetrics | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const doFetch = useCallback(async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const result = await fetchGpuMetrics();
      setMetrics(result);
      if (!result) {
        setFetchError('Could not reach Prometheus. Ensure kube-prometheus-stack is installed in the monitoring namespace.');
      }
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!ctxLoading) {
      void doFetch();
    }
  }, [ctxLoading, doFetch]);

  if (ctxLoading) {
    return <Loader title="Loading Intel GPU data..." />;
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <SectionHeader title="Intel GPU — Metrics" />
        <button
          onClick={() => void doFetch()}
          disabled={fetching}
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

      {fetching && !metrics && <Loader title="Querying Prometheus for GPU metrics..." />}

      {fetchError && (
        <SectionBox title="Metrics Unavailable">
          <NameValueTable
            rows={[
              {
                name: 'Error',
                value: <StatusLabel status="error">{fetchError}</StatusLabel>,
              },
              {
                name: 'Data Source',
                value: 'node_hwmon_energy_joule_total (chip_name="i915") via kube-prometheus-stack',
              },
              {
                name: 'Requirements',
                value: 'kube-prometheus-stack installed in monitoring namespace with node-exporter enabled',
              },
            ]}
          />
        </SectionBox>
      )}

      {metrics && metrics.chips.length === 0 && (
        <SectionBox title="No i915 GPU Metrics Found">
          <NameValueTable
            rows={[
              {
                name: 'Status',
                value: (
                  <StatusLabel status="warning">
                    Prometheus is reachable but no i915 hwmon chips found
                  </StatusLabel>
                ),
              },
              {
                name: 'Note',
                value: 'The i915 driver exposes hwmon sensors on discrete Intel GPU nodes. ' +
                  'Ensure node-exporter is running on GPU nodes with hwmon collector enabled.',
              },
              {
                name: 'GPU Nodes',
                value: gpuNodes.length > 0
                  ? gpuNodes.map(n => n.metadata.name).join(', ')
                  : 'None detected',
              },
            ]}
          />
        </SectionBox>
      )}

      {metrics && metrics.chips.length > 0 && (
        <>
          <SectionBox title="GPU Power Summary">
            <NameValueTable
              rows={[
                {
                  name: 'GPUs Monitored',
                  value: String(metrics.chips.length),
                },
                {
                  name: 'Total Power',
                  value: (() => {
                    const total = metrics.chips.reduce((s, c) => s + (c.powerWatts ?? 0), 0);
                    const maxTotal = metrics.chips.reduce((s, c) => s + (c.powerMaxWatts ?? 0), 0);
                    return <PowerBar watts={total} maxWatts={maxTotal > 0 ? maxTotal : null} />;
                  })(),
                },
                {
                  name: 'Last Fetched',
                  value: new Date(metrics.fetchedAt).toLocaleTimeString(),
                },
                {
                  name: 'Data Source',
                  value: 'node-exporter hwmon · i915 driver · rate(node_hwmon_energy_joule_total[5m])',
                },
              ]}
            />
          </SectionBox>

          {metrics.chips.map(chip => (
            <GpuChipCard key={`${chip.instance}-${chip.chip}`} chip={chip} />
          ))}
        </>
      )}
    </>
  );
}
