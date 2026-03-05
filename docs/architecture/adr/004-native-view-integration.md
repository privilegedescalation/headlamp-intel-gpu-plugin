# ADR 004: Headlamp View Integration via Detail Sections and Column Processors

**Status**: Accepted

**Date**: 2026-03-05

**Deciders**: Development Team

---

## Context

The plugin provides its own pages (Overview, Nodes, Pods, etc.) but also needs to enhance Headlamp's native views. Users browsing the standard Nodes list should see GPU information without navigating to the plugin.

Headlamp offers two integration mechanisms:

- `registerDetailsViewSection` for injecting sections into resource detail pages.
- `registerResourceTableColumnsProcessor` for adding columns to resource list tables.

---

## Decision

Use both integration mechanisms:

1. **Detail sections**: `registerDetailsViewSection` injects GPU information into Node and Pod detail pages. Resource-kind guards ensure sections only render for the correct resource type.

2. **Column processors**: `registerResourceTableColumnsProcessor` appends "GPU Type" and "GPU Devices" columns to the native `headlamp-nodes` table.

Both integration points consume data from the shared `IntelGpuDataProvider` context, so they benefit from the same cached data as the plugin's own pages.

---

## Consequences

- ✅ GPU data visible in native Headlamp views without navigation
- ✅ Seamless user experience for users already familiar with Headlamp
- ✅ Uses Headlamp's official extension APIs for forward compatibility
- ✅ Shared context means no duplicate data fetches
- ⚠️ Detail sections render for all Nodes/Pods (guard needed to check GPU relevance)
- ⚠️ Column processors add columns even when no GPU nodes exist in the cluster

The negative consequences are mitigated by resource-kind guards and conditional rendering that hide GPU sections when a resource has no GPU relevance.

---

## Alternatives Considered

1. **Plugin pages only (no native view integration)** — Rejected. Users would miss GPU info when browsing standard Headlamp views, reducing discoverability.

2. **Override native views entirely** — Rejected. Not supported by Headlamp's plugin API and would conflict with other plugins.

3. **App bar notification only** — Rejected. Insufficient detail for node-level and pod-level GPU information; only suitable for cluster-wide summaries.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-05 | Initial decision accepted |
