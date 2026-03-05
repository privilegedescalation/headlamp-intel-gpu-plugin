# ADR 002: Dual Data Fetching Strategy (Hooks + ApiProxy)

**Status**: Accepted

**Date**: 2026-03-05

**Deciders**: Development Team

---

## Context

The plugin needs data from two categories of Kubernetes resources:

- **Standard resources**: Nodes and Pods, for which Headlamp provides reactive `useList()` hooks via built-in resource classes.
- **Custom resources**: GpuDevicePlugin CRD (under `deviceplugin.intel.com/v1`) and DaemonSet pods with specific labels, for which Headlamp does not have built-in support.

Headlamp provides reactive `useList()` hooks for standard resource classes but does not have built-in support for custom CRDs. The plugin uses three possible label selectors for DaemonSet pod discovery to handle different deployment configurations.

---

## Decision

Implement a two-track data fetching strategy within the context provider:

1. **Track 1 (Reactive)**: Use `K8s.ResourceClasses.Node.useList()` and `K8s.ResourceClasses.Pod.useList({namespace:''})` for standard resources. These are reactive to cluster changes and automatically update when resources are created, modified, or deleted.

2. **Track 2 (Imperative)**: Use `ApiProxy.request()` inside a `useEffect` keyed on `refreshKey` for GpuDevicePlugin CRDs and DaemonSet pods. The `refreshKey` is incremented by the `refresh()` function exposed through the context.

---

## Consequences

- ✅ Leverages Headlamp's reactive hooks for standard resources with automatic updates
- ✅ Flexible `ApiProxy` for custom CRDs without needing to register custom resource classes
- ✅ Refresh mechanism provides manual control over imperative fetches
- ✅ Clean separation of reactive vs imperative data sources
- ⚠️ Two different update mechanisms (hooks auto-update vs manual refresh for CRDs)
- ⚠️ CRD data may lag behind hook data between refreshes

The negative consequences are mitigated by providing a manual refresh button in the UI, allowing users to force an update of imperative data when needed.

---

## Alternatives Considered

1. **All ApiProxy (no hooks)** — Rejected. Loses reactivity for standard resources, meaning Node and Pod changes would not be reflected until a manual refresh.

2. **All hooks (register CRD as custom resource class)** — Rejected. Headlamp's `KubeObject` registration is complex for read-only CRD access and would add unnecessary coupling to Headlamp internals.

3. **Single useEffect for everything** — Rejected. Loses the reactivity benefit for Nodes and Pods, and would require manual refresh for all data instead of just CRDs.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-05 | Initial decision accepted |
