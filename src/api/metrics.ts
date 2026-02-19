/**
 * Intel GPU metrics via Prometheus (kube-prometheus-stack).
 *
 * The Intel i915/Xe GPU driver exposes hwmon sensors that node-exporter
 * scrapes automatically. We query Prometheus for:
 *   - node_hwmon_energy_joule_total  (chip_name="i915") → rate = power in W
 *   - node_hwmon_power_max_watt      (same chip)        → TDP
 *   - node_hwmon_chip_names          (chip_name="i915") → identify GPU chips
 *   - node_uname_info                                   → instance → nodename
 *
 * Queries go through the Kubernetes API proxy to the in-cluster Prometheus
 * service: /api/v1/namespaces/monitoring/services/{svc}:{port}/proxy/...
 */

import { ApiProxy } from '@kinvolk/headlamp-plugin/lib';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GpuChipMetrics {
  /** Kubernetes node name (e.g. "buttons") */
  nodeName: string;
  /** PCI chip address (e.g. "0000:09:01_0_0000:0a:00_0") */
  chip: string;
  /** node-exporter instance (IP:port) */
  instance: string;
  /** Current power draw in watts (rate of energy counter, null if unavailable) */
  powerWatts: number | null;
  /** Maximum / TDP power in watts */
  powerMaxWatts: number | null;
}

export interface GpuMetrics {
  chips: GpuChipMetrics[];
  /** ISO timestamp of when metrics were fetched */
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Prometheus query helper
// ---------------------------------------------------------------------------

interface PrometheusResult {
  metric: Record<string, string>;
  value: [number, string];
}

interface PrometheusResponse {
  status: string;
  data: {
    resultType: string;
    result: PrometheusResult[];
  };
}

/**
 * Service discovery: find the Prometheus service.
 * Tries the kube-prometheus-stack default name; falls back to prometheus-operated.
 */
const PROMETHEUS_SERVICES = [
  { namespace: 'monitoring', service: 'kube-prometheus-stack-prometheus', port: '9090' },
  { namespace: 'monitoring', service: 'prometheus-operated', port: '9090' },
  { namespace: 'monitoring', service: 'prometheus', port: '9090' },
];

async function queryPrometheus(
  query: string,
  prometheusPath: string
): Promise<PrometheusResult[]> {
  const encoded = encodeURIComponent(query);
  const path = `${prometheusPath}/api/v1/query?query=${encoded}`;

  const raw = await ApiProxy.request(path, { method: 'GET' }) as PrometheusResponse;

  if (raw?.status !== 'success') return [];
  return raw.data?.result ?? [];
}

async function findPrometheusPath(): Promise<string | null> {
  for (const { namespace, service, port } of PROMETHEUS_SERVICES) {
    const basePath = `/api/v1/namespaces/${namespace}/services/${service}:${port}/proxy`;
    try {
      const raw = await ApiProxy.request(`${basePath}/api/v1/query?query=1`, { method: 'GET' }) as PrometheusResponse;
      if (raw?.status === 'success') return basePath;
    } catch {
      // try next
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Metrics fetch
// ---------------------------------------------------------------------------

export async function fetchGpuMetrics(): Promise<GpuMetrics | null> {
  const prometheusPath = await findPrometheusPath();
  if (!prometheusPath) return null;

  // Run queries in parallel
  const [chipResults, energyRateResults, powerMaxResults, unameResults] = await Promise.all([
    // i915 chip identification
    queryPrometheus('node_hwmon_chip_names{chip_name="i915"}', prometheusPath),
    // Current power (rate of cumulative energy counter)
    queryPrometheus(
      'rate(node_hwmon_energy_joule_total[5m]) * on(chip,instance) group_left(chip_name) node_hwmon_chip_names{chip_name="i915"}',
      prometheusPath
    ),
    // TDP / max power
    queryPrometheus(
      'node_hwmon_power_max_watt * on(chip,instance) group_left(chip_name) node_hwmon_chip_names{chip_name="i915"}',
      prometheusPath
    ),
    // instance → nodename mapping
    queryPrometheus('node_uname_info', prometheusPath),
  ]);

  // Build instance → nodename map
  const instanceToNode = new Map<string, string>();
  for (const r of unameResults) {
    const inst = r.metric['instance'];
    const nodename = r.metric['nodename'] ?? r.metric['node'] ?? inst;
    if (inst) instanceToNode.set(inst, nodename);
  }

  // Build chip → power map
  const chipToPower = new Map<string, number>();
  for (const r of energyRateResults) {
    const chip = r.metric['chip'];
    if (chip) chipToPower.set(chip, parseFloat(r.value[1]));
  }

  // Build chip → max power map
  const chipToMaxPower = new Map<string, number>();
  for (const r of powerMaxResults) {
    const chip = r.metric['chip'];
    if (chip) chipToMaxPower.set(chip, parseFloat(r.value[1]));
  }

  // Assemble per-chip metrics from the chip identification results
  const chips: GpuChipMetrics[] = chipResults.map(r => {
    const chip = r.metric['chip'] ?? '';
    const instance = r.metric['instance'] ?? '';
    const nodeName = instanceToNode.get(instance) ?? instance;
    const powerWatts = chipToPower.has(chip) ? chipToPower.get(chip)! : null;
    const powerMaxWatts = chipToMaxPower.has(chip) ? chipToMaxPower.get(chip)! : null;

    return { nodeName, chip, instance, powerWatts, powerMaxWatts };
  });

  return {
    chips,
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatWatts(w: number): string {
  return `${w.toFixed(1)} W`;
}

export function formatPercent(used: number, max: number): string {
  if (max <= 0) return '—';
  return `${Math.round((used / max) * 100)}%`;
}
