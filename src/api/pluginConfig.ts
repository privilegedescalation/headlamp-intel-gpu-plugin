/**
 * Plugin configuration for the intel-gpu Headlamp plugin.
 *
 * Uses Headlamp's ConfigStore API to persist user-configurable settings in
 * the browser's Redux store.  The settings are editable via the plugin
 * settings page (Settings → Plugins → intel-gpu) and readable at runtime
 * from both React components (useConfig hook) and non-React code
 * (get() method).
 */

import { ConfigStore } from '@kinvolk/headlamp-plugin/lib';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Prometheus service discovery configuration.
 *
 * All fields are optional — when unset (empty string), the plugin falls
 * back to the built-in default service candidates, preserving backward
 * compatibility with existing kube-prometheus-stack deployments.
 */
export interface PrometheusConfig {
  /** Kubernetes namespace where Prometheus is deployed (e.g. "observability"). */
  prometheusNamespace: string;
  /** Kubernetes Service name for Prometheus (e.g. "monitoring-kube-prometheus-prometheus"). */
  prometheusService: string;
  /** Port number/name for the Prometheus service (e.g. "9090"). */
  prometheusPort: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Empty-string defaults — unset values trigger fallback to built-in candidates. */
export const DEFAULT_PROMETHEUS_CONFIG: PrometheusConfig = {
  prometheusNamespace: '',
  prometheusService: '',
  prometheusPort: '',
};

/**
 * Built-in fallback service candidates (backward-compatible with v1.1.0).
 * Used when the user has not configured custom values.
 */
export const DEFAULT_PROMETHEUS_SERVICES: ReadonlyArray<{
  namespace: string;
  service: string;
  port: string;
}> = [
  { namespace: 'monitoring', service: 'kube-prometheus-stack-prometheus', port: '9090' },
  { namespace: 'monitoring', service: 'prometheus-operated', port: '9090' },
  { namespace: 'monitoring', service: 'prometheus', port: '9090' },
];

// ---------------------------------------------------------------------------
// ConfigStore
// ---------------------------------------------------------------------------

const PLUGIN_NAME = 'intel-gpu';

export const prometheusConfigStore = new ConfigStore<PrometheusConfig>(PLUGIN_NAME);

/**
 * Returns the current Prometheus configuration, merged with defaults.
 * Empty-string fields are treated as "not configured" and replaced by
 * the corresponding default (empty string = use fallback candidates).
 */
export function getPrometheusConfig(): PrometheusConfig {
  const stored = prometheusConfigStore.get();
  return {
    prometheusNamespace: stored?.prometheusNamespace ?? '',
    prometheusService: stored?.prometheusService ?? '',
    prometheusPort: stored?.prometheusPort ?? '',
  };
}

/**
 * Returns the ordered list of service candidates for Prometheus discovery.
 *
 * If the user has configured all three fields (namespace, service, port),
 * that single candidate is tried first, followed by the built-in defaults
 * as fallback.  If only some fields are configured, the configured values
 * are still tried first (with defaults filling gaps), then the built-in
 * defaults follow.
 *
 * This preserves backward compatibility: unconfigured deployments get the
 * exact same candidate list as v1.1.0.
 */
export function getPrometheusServiceCandidates(): Array<{
  namespace: string;
  service: string;
  port: string;
}> {
  const cfg = getPrometheusConfig();
  const candidates: Array<{ namespace: string; service: string; port: string }> = [];

  // If user configured a full custom service, try it first
  if (cfg.prometheusNamespace && cfg.prometheusService && cfg.prometheusPort) {
    candidates.push({
      namespace: cfg.prometheusNamespace,
      service: cfg.prometheusService,
      port: cfg.prometheusPort,
    });
  }

  // Always include the built-in defaults as fallback
  for (const svc of DEFAULT_PROMETHEUS_SERVICES) {
    candidates.push({ ...svc });
  }

  return candidates;
}
