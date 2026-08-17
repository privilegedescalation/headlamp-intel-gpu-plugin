/**
 * SettingsPage — Plugin settings for the intel-gpu Headlamp plugin.
 *
 * Allows users to configure the Prometheus service discovery parameters
 * (namespace, service name, port) so the Metrics page works with
 * non-default kube-prometheus-stack deployments.
 *
 * When all three fields are left blank, the plugin falls back to the
 * built-in default candidates (monitoring/kube-prometheus-stack-prometheus:9090,
 * monitoring/prometheus-operated:9090, monitoring/prometheus:9090),
 * preserving backward compatibility.
 */

import { ConfigStore } from '@kinvolk/headlamp-plugin/lib';
import { PluginSettingsDetailsProps } from '@kinvolk/headlamp-plugin/lib';
import React, { useState } from 'react';
import { PrometheusConfig } from '../api/pluginConfig';

// ---------------------------------------------------------------------------
// ConfigStore instance for reading/writing persisted settings
// ---------------------------------------------------------------------------

const configStore = new ConfigStore<PrometheusConfig>('intel-gpu');

// ---------------------------------------------------------------------------
// Input component
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--mui-palette-divider, #ccc)',
  borderRadius: '4px',
  backgroundColor: 'var(--mui-palette-background-paper, #fff)',
  color: 'var(--mui-palette-text-primary, #333)',
  fontSize: '14px',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  fontSize: '14px',
  fontWeight: 500,
  color: 'var(--mui-palette-text-primary, #333)',
};

const helpTextStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--mui-palette-text-secondary, #666)',
  marginTop: '4px',
};

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

export default function SettingsPage({ data, onDataChange }: PluginSettingsDetailsProps) {
  // Read current config from ConfigStore, falling back to data prop or defaults
  const stored = configStore.get();
  const initial: PrometheusConfig = {
    prometheusNamespace: data?.prometheusNamespace ?? stored?.prometheusNamespace ?? '',
    prometheusService: data?.prometheusService ?? stored?.prometheusService ?? '',
    prometheusPort: data?.prometheusPort ?? stored?.prometheusPort ?? '',
  };

  const [namespace, setNamespace] = useState(initial.prometheusNamespace);
  const [service, setService] = useState(initial.prometheusService);
  const [port, setPort] = useState(initial.prometheusPort);

  function handleChange(field: keyof PrometheusConfig, value: string): void {
    const updated: PrometheusConfig = {
      prometheusNamespace: field === 'prometheusNamespace' ? value : namespace,
      prometheusService: field === 'prometheusService' ? value : service,
      prometheusPort: field === 'prometheusPort' ? value : port,
    };

    // Update local state
    if (field === 'prometheusNamespace') setNamespace(value);
    if (field === 'prometheusService') setService(value);
    if (field === 'prometheusPort') setPort(value);

    // Persist to ConfigStore (readable by non-React code like metrics.ts)
    configStore.update({ [field]: value } as Partial<PrometheusConfig>);

    // Also notify Headlamp's plugin settings infrastructure
    if (onDataChange) {
      onDataChange(updated);
    }
  }

  return (
    <div style={{ maxWidth: '600px' }}>
      <p style={{ ...helpTextStyle, marginBottom: '20px' }}>
        Configure the Prometheus service used for GPU power metrics. Leave all fields blank to use
        the default discovery (monitoring namespace, kube-prometheus-stack-prometheus /
        prometheus-operated / prometheus, port 9090).
      </p>

      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle} htmlFor="prometheus-namespace">
          Prometheus Namespace
        </label>
        <input
          id="prometheus-namespace"
          type="text"
          value={namespace}
          onChange={e => handleChange('prometheusNamespace', e.target.value)}
          placeholder="e.g. observability (blank = use defaults)"
          style={inputStyle}
          aria-label="Prometheus namespace"
        />
        <p style={helpTextStyle}>Kubernetes namespace where the Prometheus service is deployed.</p>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle} htmlFor="prometheus-service">
          Prometheus Service Name
        </label>
        <input
          id="prometheus-service"
          type="text"
          value={service}
          onChange={e => handleChange('prometheusService', e.target.value)}
          placeholder="e.g. monitoring-kube-prometheus-prometheus (blank = use defaults)"
          style={inputStyle}
          aria-label="Prometheus service name"
        />
        <p style={helpTextStyle}>Kubernetes Service name for the Prometheus instance.</p>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle} htmlFor="prometheus-port">
          Prometheus Port
        </label>
        <input
          id="prometheus-port"
          type="text"
          value={port}
          onChange={e => handleChange('prometheusPort', e.target.value)}
          placeholder="e.g. 9090 (blank = use defaults)"
          style={inputStyle}
          aria-label="Prometheus port"
        />
        <p style={helpTextStyle}>Port number or name for the Prometheus service.</p>
      </div>

      <div
        style={{
          padding: '12px',
          backgroundColor: 'var(--mui-palette-background-default, #fafafa)',
          borderRadius: '4px',
          border: '1px solid var(--mui-palette-divider, #e0e0e0)',
        }}
      >
        <p style={{ ...helpTextStyle, margin: 0 }}>
          <strong>Note:</strong> The configured service is tried first. If it is unreachable, the
          plugin falls back to the built-in default candidates. Changes take effect on the next
          metrics fetch.
        </p>
      </div>
    </div>
  );
}
