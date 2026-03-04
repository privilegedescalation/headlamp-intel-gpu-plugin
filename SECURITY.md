# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |

## Plugin Scope

This plugin is **read-only**. It does not perform any write operations against the Kubernetes cluster. It reads:

- Nodes
- Pods (all namespaces)
- GpuDevicePlugin CRDs (`deviceplugin.intel.com/v1`)
- Prometheus metrics (via API proxy in `monitoring` namespace)

All data is fetched through Headlamp's built-in API proxy, which respects the user's existing RBAC permissions.

## Reporting a Vulnerability

Please report security vulnerabilities by opening a private issue or emailing the maintainers directly.
