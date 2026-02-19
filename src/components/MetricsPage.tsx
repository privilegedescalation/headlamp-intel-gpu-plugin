/**
 * MetricsPage — Intel GPU metrics from Prometheus (node-exporter hwmon).
 *
 * METRIC AVAILABILITY
 * -------------------
 * Power (current W, TDP)
 *   Source:   node_hwmon_energy_joule_total, node_hwmon_power_max_watt
 *   Driver:   i915 hwmon sysfs (/sys/class/drm/card{N}/device/hwmon/)
 *   Scraped:  node-exporter hwmon collector (enabled by default)
 *   Nodes:    Discrete GPU nodes only (i915 driver exposes hwmon; iGPU driver does not)
 *   No extra config required — works out of the box with kube-prometheus-stack.
 *
 * GPU Frequency (current, boost, min, max MHz)
 *   Source:   DRM sysfs (/sys/class/drm/card{N}/gt_{x}_freq_mhz)
 *   Driver:   i915 kernel driver
 *   Scraped:  NOT available -- node-exporter --collector.drm is AMD-only and does not
 *             read i915 gt_freq sysfs files. Would require a custom exporter or
 *             node-exporter textfile collector sidecar writing these values.
 *
 * GPU Utilization (engine busy %)
 *   Source:   Not exposed via hwmon or any standard Prometheus collector for i915.
 *             Would require intel-gpu-top, XPU Manager, or a custom DRM-based exporter.
 *
 * Integrated GPU (iGPU) nodes
 *   The iGPU driver does not expose hwmon sensors. No Prometheus metrics are
 *   available for iGPU nodes regardless of configuration.
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
    {
      name: 'Current Power',
      value: chip.powerWatts !== null
        ? <PowerBar watts={chip.powerWatts} maxWatts={chip.powerMaxWatts} />
        : <StatusLabel status="warning">No data — needs ≥5m of scrape history</StatusLabel>,
    },
  ];

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
// Requirements info box
// ---------------------------------------------------------------------------

function MetricRequirements() {
  return (
    <SectionBox title="Metric Availability">
      <NameValueTable
        rows={[
          {
            name: 'Power (W)',
            value: (
              <>
                <StatusLabel status="success">Available — discrete GPU nodes</StatusLabel>
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                  Source: <code>node_hwmon_energy_joule_total</code> via node-exporter hwmon collector (enabled by default).
                  Requires the i915 kernel driver on the node. iGPU nodes do not expose hwmon sensors.
                </div>
              </>
            ),
          },
          {
            name: 'Frequency (MHz)',
            value: (
              <>
                <StatusLabel status="error">Not available</StatusLabel>
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                  i915 exposes <code>gt_*_freq_mhz</code> via DRM sysfs but node-exporter&apos;s{' '}
                  <code>--collector.drm</code> flag is AMD-only and does not read these files.
                  A custom exporter or textfile-collector sidecar writing these values would be required.
                </div>
              </>
            ),
          },
          {
            name: 'Utilization (%)',
            value: (
              <>
                <StatusLabel status="error">Not available</StatusLabel>
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                  No standard Prometheus collector exposes i915 engine busy percentage.
                  Would require intel-gpu-top, XPU Manager, or a custom DRM-based exporter.
                </div>
              </>
            ),
          },
          {
            name: 'iGPU nodes',
            value: (
              <>
                <StatusLabel status="error">No metrics available</StatusLabel>
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                  The integrated GPU driver does not expose hwmon sensors. No Prometheus metrics
                  are available for iGPU nodes regardless of configuration.
                </div>
              </>
            ),
          },
        ]}
      />
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

      <MetricRequirements />

      {fetching && !metrics && <Loader title="Querying Prometheus for GPU metrics..." />}

      {fetchError && (
        <SectionBox title="Prometheus Unreachable">
          <NameValueTable
            rows={[
              {
                name: 'Error',
                value: <StatusLabel status="error">{fetchError}</StatusLabel>,
              },
              {
                name: 'Checked services',
                value: 'kube-prometheus-stack-prometheus:9090, prometheus-operated:9090, prometheus:9090 (monitoring namespace)',
              },
            ]}
          />
        </SectionBox>
      )}

      {metrics && metrics.chips.length === 0 && (
        <SectionBox title="No i915 Metrics in Prometheus">
          <NameValueTable
            rows={[
              {
                name: 'Status',
                value: (
                  <StatusLabel status="warning">
                    Prometheus reachable — no node_hwmon_chip_names&#123;chip_name=&quot;i915&quot;&#125; found
                  </StatusLabel>
                ),
              },
              {
                name: 'GPU Nodes',
                value: gpuNodes.length > 0 ? gpuNodes.map(n => n.metadata.name).join(', ') : 'None detected',
              },
              {
                name: 'Likely cause',
                value: 'node-exporter is not running on the GPU nodes, or the hwmon collector is disabled.',
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
                  name: 'Query',
                  value: 'rate(node_hwmon_energy_joule_total[5m]) joined with node_hwmon_chip_names{chip_name="i915"}',
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
