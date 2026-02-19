/**
 * Prometheus text format parser for Intel GPU device plugin metrics.
 *
 * Fetches raw metrics from the Intel GPU device plugin pod (port 9090)
 * via the Kubernetes API proxy and parses key metric families.
 *
 * Metrics exposed by intel-gpu-plugin when enableMonitoring: true:
 *   gpu_i915_engine_active_ticks  — engine busy ticks (per card, engine)
 *   gpu_i915_engine_total_ticks   — engine total ticks (for utilization %)
 *   gpu_i915_energy_microjoules   — cumulative energy (µJ → power = delta/dt)
 *   gpu_i915_gt_boost_freq_mhz    — current GT boost frequency (MHz)
 *   gpu_i915_memory_local         — local (VRAM) memory usage (bytes)
 *   gpu_i915_memory_system        — system memory usage (bytes)
 */

import { ApiProxy } from '@kinvolk/headlamp-plugin/lib';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricSample {
  labels: Record<string, string>;
  value: number;
}

export interface MetricFamily {
  name: string;
  help: string;
  type: string;
  samples: MetricSample[];
}

export type ParsedMetrics = Map<string, MetricFamily>;

export interface GpuNodeMetrics {
  /** Node name this metric set was fetched from (via plugin pod) */
  nodeName: string;
  /** Pod name of the intel-gpu-plugin daemonset pod */
  podName: string;
  /** Engine utilization per (card, engine): 0–100 */
  engineUtilization: Array<{ card: string; engine: string; pct: number }>;
  /** Current GT boost frequency in MHz per card */
  boostFreqMhz: Array<{ card: string; value: number }>;
  /** Local VRAM usage in bytes per card */
  memoryLocalBytes: Array<{ card: string; value: number }>;
  /** System memory usage in bytes per card */
  memorySystemBytes: Array<{ card: string; value: number }>;
  /** Cumulative energy in µJ per card (raw counter; compute delta for power) */
  energyMicrojoules: Array<{ card: string; value: number }>;
  /** Raw parsed metric families for advanced use */
  raw: ParsedMetrics;
}

// ---------------------------------------------------------------------------
// Prometheus text format parser
// ---------------------------------------------------------------------------

const LABEL_PAIR_RE = /(\w+)="([^"]*)"/g;

function parseLabels(labelStr: string): Record<string, string> {
  const labels: Record<string, string> = {};
  let match: RegExpExecArray | null;
  const re = new RegExp(LABEL_PAIR_RE.source, 'g');
  while ((match = re.exec(labelStr)) !== null) {
    const key = match[1];
    const val = match[2];
    if (key && val !== undefined) {
      labels[key] = val;
    }
  }
  return labels;
}

export function parsePrometheusText(text: string): ParsedMetrics {
  const families = new Map<string, MetricFamily>();
  let currentName = '';
  let currentHelp = '';
  let currentType = '';

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('# HELP ')) {
      const rest = line.slice(7);
      const spaceIdx = rest.indexOf(' ');
      currentName = spaceIdx >= 0 ? rest.slice(0, spaceIdx) : rest;
      currentHelp = spaceIdx >= 0 ? rest.slice(spaceIdx + 1) : '';
      continue;
    }

    if (line.startsWith('# TYPE ')) {
      const rest = line.slice(7);
      const spaceIdx = rest.indexOf(' ');
      currentType = spaceIdx >= 0 ? rest.slice(spaceIdx + 1) : '';
      continue;
    }

    if (line.startsWith('#')) continue;

    const openBrace = line.indexOf('{');
    const closeBrace = line.lastIndexOf('}');

    let metricName: string;
    let labels: Record<string, string>;
    let valuePart: string;

    if (openBrace >= 0 && closeBrace > openBrace) {
      metricName = line.slice(0, openBrace);
      labels = parseLabels(line.slice(openBrace + 1, closeBrace));
      valuePart = line.slice(closeBrace + 1).trim();
    } else {
      const spaceIdx = line.lastIndexOf(' ');
      if (spaceIdx < 0) continue;
      metricName = line.slice(0, spaceIdx);
      labels = {};
      valuePart = line.slice(spaceIdx + 1).trim();
    }

    const valueTokens = valuePart.split(' ');
    const valueStr = valueTokens[0] ?? '';
    const value = parseFloat(valueStr);
    if (!Number.isFinite(value)) continue;

    const familyKey = metricName;
    let family = families.get(familyKey);
    if (!family) {
      family = {
        name: familyKey,
        help: metricName === currentName ? currentHelp : '',
        type: metricName === currentName ? currentType : '',
        samples: [],
      };
      families.set(familyKey, family);
    }

    family.samples.push({ labels, value });
  }

  return families;
}

// ---------------------------------------------------------------------------
// Extract Intel GPU metrics from the parsed map
// ---------------------------------------------------------------------------

function samplesFor(families: ParsedMetrics, name: string): MetricSample[] {
  return families.get(name)?.samples ?? [];
}

export function extractGpuNodeMetrics(
  families: ParsedMetrics,
  nodeName: string,
  podName: string
): GpuNodeMetrics {
  const activeSamples = samplesFor(families, 'gpu_i915_engine_active_ticks');
  const totalSamples = samplesFor(families, 'gpu_i915_engine_total_ticks');

  // Build utilization: active/total per (card, engine)
  const engineUtilization: GpuNodeMetrics['engineUtilization'] = [];
  for (const active of activeSamples) {
    const card = active.labels['card'] ?? active.labels['gpu'] ?? 'gpu0';
    const engine = active.labels['engine'] ?? 'render/0';
    const totalSample = totalSamples.find(
      s =>
        (s.labels['card'] ?? s.labels['gpu']) === card &&
        s.labels['engine'] === engine
    );
    const total = totalSample?.value ?? 0;
    const pct = total > 0 ? Math.min(100, Math.round((active.value / total) * 100)) : 0;
    engineUtilization.push({ card, engine, pct });
  }

  // Boost frequency
  const boostFreqMhz = samplesFor(families, 'gpu_i915_gt_boost_freq_mhz').map(s => ({
    card: s.labels['card'] ?? s.labels['gpu'] ?? 'gpu0',
    value: s.value,
  }));

  // Memory
  const memoryLocalBytes = samplesFor(families, 'gpu_i915_memory_local').map(s => ({
    card: s.labels['card'] ?? s.labels['gpu'] ?? 'gpu0',
    value: s.value,
  }));
  const memorySystemBytes = samplesFor(families, 'gpu_i915_memory_system').map(s => ({
    card: s.labels['card'] ?? s.labels['gpu'] ?? 'gpu0',
    value: s.value,
  }));

  // Energy
  const energyMicrojoules = samplesFor(families, 'gpu_i915_energy_microjoules').map(s => ({
    card: s.labels['card'] ?? s.labels['gpu'] ?? 'gpu0',
    value: s.value,
  }));

  return {
    nodeName,
    podName,
    engineUtilization,
    boostFreqMhz,
    memoryLocalBytes,
    memorySystemBytes,
    energyMicrojoules,
    raw: families,
  };
}

// ---------------------------------------------------------------------------
// Fetch metrics from an Intel GPU device plugin pod
// ---------------------------------------------------------------------------

/**
 * Fetches and parses Prometheus metrics from an Intel GPU device plugin pod.
 *
 * The proxy path is:
 *   /api/v1/namespaces/{namespace}/pods/{podName}:9090/proxy/metrics
 *
 * Returns null if the pod is not exposing metrics (enableMonitoring: false)
 * or if the proxy request fails.
 */
export async function fetchGpuPluginMetrics(
  podName: string,
  namespace: string,
  nodeName: string
): Promise<GpuNodeMetrics | null> {
  const path = `/api/v1/namespaces/${namespace}/pods/${podName}:9090/proxy/metrics`;

  try {
    const raw: unknown = await ApiProxy.request(path, {
      method: 'GET',
      isJSON: false,
    });

    if (typeof raw !== 'string') return null;

    const families = parsePrometheusText(raw);
    return extractGpuNodeMetrics(families, nodeName, podName);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function formatFreq(mhz: number): string {
  return `${Math.round(mhz)} MHz`;
}
