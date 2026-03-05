# ADR 003: Graceful CRD Degradation

**Status**: Accepted

**Date**: 2026-03-05

**Deciders**: Development Team

---

## Context

The GpuDevicePlugin CRD (`deviceplugin.intel.com/v1`) is only present when the Intel GPU device plugin operator is installed. However, Intel GPUs can be present in a cluster without the operator — the device plugin can be deployed as a plain DaemonSet.

The plugin should still detect and display GPU resources even without the CRD. GPU nodes are identifiable by node labels (e.g., `intel.feature.node.kubernetes.io/gpu`) and capacity fields (e.g., `gpu.intel.com/i915`). GPU pods are identifiable by resource requests/limits for Intel GPU resources.

---

## Decision

Wrap the GpuDevicePlugin CRD fetch in its own `try/catch`. If the fetch fails (CRD not installed), set `crdAvailable` to `false` and continue. GPU nodes and pods are still discovered via node labels, capacity fields, and pod resource requests — independent of the CRD.

The CRD data enriches the view when available but is not required for core functionality.

---

## Consequences

- ✅ Plugin works on any cluster with Intel GPUs regardless of operator installation
- ✅ Progressive enhancement when CRD is available
- ✅ No error displayed to the user for a missing CRD
- ⚠️ Two code paths (with/without CRD data) increase testing surface
- ⚠️ DevicePlugins page is empty without the CRD

The negative consequences are mitigated by clear messaging on the DevicePlugins page when the CRD is unavailable, informing users that the operator is not installed.

---

## Alternatives Considered

1. **Require CRD (hard dependency)** — Rejected. Too restrictive; many clusters run the device plugin as a plain DaemonSet without the operator and its CRD.

2. **API discovery check before fetch** — Considered, but `try/catch` is simpler and handles all failure modes (CRD not installed, API server errors, permission issues) uniformly.

3. **Disable plugin entirely without CRD** — Rejected. Core GPU monitoring (node detection, pod resource tracking) works without the CRD and provides significant value on its own.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-05 | Initial decision accepted |
