# ADR 001: React Context for Centralized GPU State

**Status**: Accepted

**Date**: 2026-03-05

**Deciders**: Development Team

---

## Context

The Intel GPU plugin needs to share GPU-related data across 5 page views (Overview, DevicePlugins, Nodes, Pods, Metrics) and 2 detail view sections (Node, Pod). Data includes GPU nodes (identified by node labels and capacity fields), GPU pods, GpuDevicePlugin CRD instances, and plugin DaemonSet pods.

The `IntelGpuDataProvider` context holds all derived GPU state. Child components access data via `useIntelGpuContext()`. The context collects errors from three streams (node hook error, pod hook error, async CRD fetch error) into a `string[]` joined with `';'` into a single error string.

---

## Decision

Use a single `IntelGpuDataProvider` React Context that wraps every route and every `registerDetailsViewSection` call in `index.tsx`. All GPU-derived state is computed in the provider and exposed via context.

---

## Consequences

- ✅ Single source of truth for all GPU data
- ✅ All views share consistent state
- ✅ Error aggregation from multiple sources into a unified error string
- ✅ Refresh mechanism updates everything atomically
- ⚠️ All consumers re-render on any data change
- ⚠️ Monolithic provider couples all GPU state together

The negative consequences are mitigated by the fact that GPU data updates infrequently in practice, so unnecessary re-renders are rare.

---

## Alternatives Considered

1. **Per-page data fetching** — Rejected. Would duplicate complex GPU node/pod filtering logic across each of the 5 pages and 2 detail sections.

2. **Multiple contexts (NodesContext, PodsContext, CRDContext)** — Rejected. GPU data is highly cross-referenced (e.g., GPU pods reference GPU nodes, CRD instances relate to DaemonSet pods). Splitting contexts would require complex cross-context coordination.

3. **External state library (Redux, Zustand, etc.)** — Rejected. External state libraries are not available in the Headlamp plugin runtime environment.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-05 | Initial decision accepted |
