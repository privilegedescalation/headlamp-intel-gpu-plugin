# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Headlamp plugin for Intel GPU device plugin visibility and monitoring. Read-only — monitors GpuDevicePlugin CRDs, GPU-capable nodes, pods requesting Intel GPU resources, and real-time power metrics via Prometheus. No cluster write operations.

- **Plugin name**: `intel-gpu`
- **Target**: Headlamp >= v0.20.0
- **Data sources**: GpuDevicePlugin CRDs (`deviceplugin.intel.com/v1`), Nodes, Pods (all namespaces), Prometheus (node-exporter i915 hwmon)
- **Reference plugin**: `../headlamp-kube-vip-plugin`

## Commands

```bash
npm start          # dev server with hot reload
npm run build      # production build
npm run package    # package for headlamp
npm run tsc        # TypeScript type check (no emit)
npm run lint       # ESLint
npm run lint:fix   # ESLint with auto-fix
npm run format     # Prettier write
npm run format:check # Prettier check
npm test           # vitest run
npm run test:watch # vitest watch mode
```

All tests and `tsc` must pass before committing.

## Architecture

```
src/
├── index.tsx                         # Plugin entry: registerRoute, registerSidebarEntry, registerDetailsViewSection, registerResourceTableColumnsProcessor
├── api/
│   ├── k8s.ts                        # Types + helpers (GpuDevicePlugin CRD, Nodes, Pods, type guards, formatters)
│   ├── k8s.test.ts                   # Tests for k8s helpers (48 test cases)
│   ├── metrics.ts                    # Prometheus GPU power metrics (node-exporter i915 hwmon)
│   └── IntelGpuDataContext.tsx       # Shared React context provider with data fetching
└── components/
    ├── OverviewPage.tsx               # Dashboard: plugin health, GPU node summary, allocation, active pods
    ├── DevicePluginsPage.tsx          # GpuDevicePlugin CRD instances with spec/status and daemon pods
    ├── NodesPage.tsx                  # Per-node GPU type, device count, allocation, workload pods
    ├── PodsPage.tsx                   # All pods requesting Intel GPU resources with per-container detail
    ├── MetricsPage.tsx                # Real-time GPU power metrics from Prometheus
    ├── NodeDetailSection.tsx           # Injected into native Node detail page (capacity, utilization, pods)
    ├── PodDetailSection.tsx           # Injected into native Pod detail page (GPU requests per container)
    └── integrations/
        └── NodeColumns.tsx            # GPU Type and GPU Devices columns for native Nodes table
```

## Data flow

`IntelGpuDataContext.tsx` uses **two fetching strategies**:

1. **Headlamp hooks** (`K8s.ResourceClasses.*.useList()`) — for Nodes and Pods.
2. **`ApiProxy.request()`** — for GpuDevicePlugin CRDs and plugin daemon pods (with label selector fallback).

The plugin gracefully degrades when the GpuDevicePlugin CRD is not installed — GPU nodes and pods are still shown based on resource labels and capacity.

## Key constants (src/api/k8s.ts)

- API group: `deviceplugin.intel.com`
- API version: `v1`
- GPU resources: `gpu.intel.com/i915`, `gpu.intel.com/xe`, `gpu.intel.com/millicores`, `gpu.intel.com/memory.max`
- Resource prefix: `gpu.intel.com/`
- Node labels: `intel.feature.node.kubernetes.io/gpu`, `node-role.kubernetes.io/gpu`, `node-role.kubernetes.io/igpu`
- Pod selector: `app=intel-gpu-plugin`
- Prometheus services: `kube-prometheus-stack-prometheus`, `prometheus-operated`, `prometheus` (monitoring namespace, port 9090)

## Code conventions

- Functional React components only — no class components
- All imports from `@kinvolk/headlamp-plugin/lib` and `@kinvolk/headlamp-plugin/lib/CommonComponents`
- No additional UI libraries (no MUI direct imports, no Ant Design, etc.)
- TypeScript strict mode — no `any`, use `unknown` + type guards at API boundaries
- Context provider (`IntelGpuDataProvider`) wraps each route component in `index.tsx`
- Tests: vitest + @testing-library/react, mock with `vi.mock('@kinvolk/headlamp-plugin/lib', ...)`
- `vitest.setup.ts` provides a spec-compliant `localStorage` shim for Node 22+ compatibility

## Testing

Mock pattern for headlamp APIs:
```typescript
vi.mock('@kinvolk/headlamp-plugin/lib', () => ({
  ApiProxy: { request: vi.fn().mockResolvedValue({ items: [] }) },
  K8s: {
    ResourceClasses: {
      Node: { useList: vi.fn(() => [[], null]) },
      Pod: { useList: vi.fn(() => [[], null]) },
    },
  },
}));
```
