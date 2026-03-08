# headlamp-intel-gpu-plugin

[![CI](https://github.com/privilegedescalation/headlamp-intel-gpu-plugin/actions/workflows/ci.yaml/badge.svg)](https://github.com/privilegedescalation/headlamp-intel-gpu-plugin/actions/workflows/ci.yaml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

A [Headlamp](https://headlamp.dev/) plugin providing visibility into [Intel GPU device plugin](https://intel.github.io/intel-device-plugins-for-kubernetes/) deployments on Kubernetes.

## Features

- **Overview Dashboard** — Plugin health, GPU node summary, allocation bar, active GPU pods
- **Device Plugins** — GpuDevicePlugin CRD instances with spec/status and daemon pod health
- **GPU Nodes** — Per-node GPU type (discrete/integrated), device count, allocation, workload pods
- **GPU Pods** — All pods requesting Intel GPU resources with per-container detail
- **Metrics** — Real-time GPU power draw (W) and TDP via Prometheus node-exporter i915 hwmon
- **Node Detail Integration** — Intel GPU section injected into native Headlamp Node detail views
- **Pod Detail Integration** — GPU resource requests/limits injected into native Pod detail views
- **Nodes Table Columns** — GPU Type and GPU Devices columns added to native Nodes table

## Installation

### Plugin Manager (Headlamp UI)

Search for `headlamp-intel-gpu` in the Headlamp Plugin Manager.

### Manual

```bash
# Download the latest release tarball
curl -LO https://github.com/privilegedescalation/headlamp-intel-gpu-plugin/releases/latest/download/headlamp-intel-gpu-*.tar.gz

# Extract to Headlamp plugins directory
mkdir -p ~/.config/Headlamp/plugins
tar -xzf headlamp-intel-gpu-*.tar.gz -C ~/.config/Headlamp/plugins/
```

### From Source

```bash
git clone https://github.com/privilegedescalation/headlamp-intel-gpu-plugin.git
cd headlamp-intel-gpu-plugin
npm install
npm run build
```

## Requirements

- Headlamp >= v0.20.0
- Intel GPU device plugin deployed (optional — plugin gracefully degrades without it)
- Optional: Node Feature Discovery with Intel GPU labels
- Optional: kube-prometheus-stack with node-exporter for GPU power metrics

## RBAC

This plugin is **read-only** and requires the following permissions:

| Resource | API Group | Verbs |
|----------|-----------|-------|
| nodes | v1 | list, get, watch |
| pods | v1 | list, get, watch |
| gpudeviceplugins | deviceplugin.intel.com/v1 | list, get |

For metrics, Prometheus must be accessible via the Headlamp API proxy in the `monitoring` namespace.

## Architecture

```
src/
├── index.tsx                    # Plugin entry point
├── api/
│   ├── k8s.ts                   # Types and helper functions
│   ├── metrics.ts               # Prometheus GPU metrics
│   └── IntelGpuDataContext.tsx  # React context provider
└── components/
    ├── OverviewPage.tsx          # Dashboard
    ├── DevicePluginsPage.tsx     # Device plugin CRDs
    ├── NodesPage.tsx             # GPU nodes
    ├── PodsPage.tsx              # GPU pods
    ├── MetricsPage.tsx           # Power metrics
    ├── NodeDetailSection.tsx     # Injected into Node detail view
    ├── PodDetailSection.tsx      # Injected into Pod detail view
    └── integrations/
        └── NodeColumns.tsx       # Nodes table columns
```

## Development

```bash
npm install
npm start          # dev server
npm test           # run tests
npm run tsc        # type check
npm run lint       # ESLint
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| No GPU nodes shown | No Intel GPU labels or resources on nodes | Install Intel Node Feature Discovery or Intel GPU device plugin |
| CRD not available warning | GpuDevicePlugin CRD not installed | Install Intel device plugins operator — plugin still works without it |
| No metrics data | Prometheus not found | Deploy kube-prometheus-stack in the `monitoring` namespace |
| Metrics show only discrete GPUs | Integrated GPUs lack hwmon | Expected — iGPU driver doesn't expose hwmon power data |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

Apache License 2.0. See [LICENSE](LICENSE) for details.
