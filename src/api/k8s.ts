/**
 * Kubernetes type definitions and helper functions for Intel GPU device plugin resources.
 *
 * All K8s resource types are typed at the fields we actually use.
 * External data from the API is validated at the boundary before use.
 */

// ---------------------------------------------------------------------------
// Intel GPU device plugin constants
// ---------------------------------------------------------------------------

/** API group for Intel device plugin CRDs */
export const INTEL_DEVICE_PLUGIN_API_GROUP = 'deviceplugin.intel.com';
export const INTEL_DEVICE_PLUGIN_API_VERSION = 'v1';

/** Kubernetes extended resource names for Intel GPU */
export const INTEL_GPU_RESOURCE = 'gpu.intel.com/i915' as const;
export const INTEL_GPU_XE_RESOURCE = 'gpu.intel.com/xe' as const;
export const INTEL_GPU_MILLICORES_RESOURCE = 'gpu.intel.com/millicores' as const;
export const INTEL_GPU_MEMORY_RESOURCE = 'gpu.intel.com/memory.max' as const;

/** All Intel GPU resource names (prefix match) */
export const INTEL_GPU_RESOURCE_PREFIX = 'gpu.intel.com/';

/** Node labels set by Intel Node Feature Discovery */
export const INTEL_GPU_NODE_LABEL = 'intel.feature.node.kubernetes.io/gpu';
export const INTEL_DISCRETE_GPU_NODE_ROLE = 'node-role.kubernetes.io/gpu';
export const INTEL_INTEGRATED_GPU_NODE_ROLE = 'node-role.kubernetes.io/igpu';

/** Label selector for Intel GPU device plugin DaemonSet pods */
export const INTEL_GPU_PLUGIN_LABEL_SELECTOR =
  'app=intel-gpu-plugin';

// ---------------------------------------------------------------------------
// Generic Kubernetes object base shapes
// ---------------------------------------------------------------------------

export interface KubeObjectMeta {
  name: string;
  namespace?: string;
  creationTimestamp?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  uid?: string;
}

export interface KubeObject {
  apiVersion?: string;
  kind?: string;
  metadata: KubeObjectMeta;
}

// ---------------------------------------------------------------------------
// GpuDevicePlugin CRD (deviceplugin.intel.com/v1)
// ---------------------------------------------------------------------------

export interface GpuDevicePluginSpec {
  image?: string;
  sharedDevNum?: number;
  enableMonitoring?: boolean;
  preferredAllocationPolicy?: string;
  nodeSelector?: Record<string, string>;
  resourceManager?: boolean;
  logLevel?: number;
}

export interface GpuDevicePluginStatus {
  /** Number of nodes where the plugin daemonset is scheduled */
  desiredNumberScheduled?: number;
  /** Number of nodes where the plugin daemonset is running and ready */
  numberReady?: number;
  /** Number of nodes where the plugin daemonset pod is unavailable */
  numberUnavailable?: number;
  /** Number of nodes where the plugin daemonset is available */
  numberAvailable?: number;
}

export interface GpuDevicePlugin extends KubeObject {
  spec: GpuDevicePluginSpec;
  status?: GpuDevicePluginStatus;
}

export function isGpuDevicePlugin(value: unknown): value is GpuDevicePlugin {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return obj['kind'] === 'GpuDevicePlugin';
}

// ---------------------------------------------------------------------------
// Node (with GPU resource fields)
// ---------------------------------------------------------------------------

export interface NodeResources {
  [key: string]: string | undefined;
}

export interface NodeStatus {
  capacity?: NodeResources;
  allocatable?: NodeResources;
  conditions?: Array<{
    type: string;
    status: string;
    lastHeartbeatTime?: string;
    reason?: string;
    message?: string;
  }>;
  nodeInfo?: {
    kernelVersion?: string;
    osImage?: string;
    architecture?: string;
    kubeletVersion?: string;
  };
}

export interface NodeSpec {
  taints?: Array<{ key: string; effect: string; value?: string }>;
  unschedulable?: boolean;
}

export interface IntelGpuNode extends KubeObject {
  spec?: NodeSpec;
  status?: NodeStatus;
}

/** Returns true if the node has any Intel GPU resources in its capacity */
export function isIntelGpuNode(node: unknown): node is IntelGpuNode {
  if (!node || typeof node !== 'object') return false;
  const obj = node as Record<string, unknown>;
  const meta = obj['metadata'] as Record<string, unknown> | undefined;
  const labels = meta?.['labels'] as Record<string, string> | undefined;
  const status = obj['status'] as Record<string, unknown> | undefined;
  const capacity = status?.['capacity'] as Record<string, string> | undefined;

  // Check node labels (added by Intel Node Feature Discovery)
  if (labels) {
    if (
      labels[INTEL_GPU_NODE_LABEL] === 'true' ||
      labels[INTEL_DISCRETE_GPU_NODE_ROLE] === 'true' ||
      labels[INTEL_INTEGRATED_GPU_NODE_ROLE] === 'true'
    ) {
      return true;
    }
  }

  // Check node capacity for Intel GPU resources
  if (capacity) {
    for (const key of Object.keys(capacity)) {
      if (key.startsWith(INTEL_GPU_RESOURCE_PREFIX)) return true;
    }
  }

  return false;
}

export function filterIntelGpuNodes(items: unknown[]): IntelGpuNode[] {
  return items.filter(isIntelGpuNode);
}

/** Get all Intel GPU resource entries from a node's capacity/allocatable */
export function getGpuResources(resources: NodeResources | undefined): Record<string, string> {
  if (!resources) return {};
  const gpuResources: Record<string, string> = {};
  for (const [key, value] of Object.entries(resources)) {
    if (key.startsWith(INTEL_GPU_RESOURCE_PREFIX) && value !== undefined) {
      gpuResources[key] = value;
    }
  }
  return gpuResources;
}

/** Get total GPU count from node capacity */
export function getNodeGpuCount(node: IntelGpuNode): number {
  const capacity = node.status?.capacity ?? {};
  let count = 0;
  for (const [key, value] of Object.entries(capacity)) {
    if ((key === INTEL_GPU_RESOURCE || key === INTEL_GPU_XE_RESOURCE) && value) {
      count += parseInt(value, 10) || 0;
    }
  }
  return count;
}

/** Determine GPU type from node labels */
export type GpuType = 'discrete' | 'integrated' | 'unknown';

export function getNodeGpuType(node: IntelGpuNode): GpuType {
  const labels = node.metadata.labels ?? {};
  if (labels[INTEL_DISCRETE_GPU_NODE_ROLE] === 'true') return 'discrete';
  if (labels[INTEL_INTEGRATED_GPU_NODE_ROLE] === 'true') return 'integrated';
  // Fallback: check for generic Intel GPU label
  if (labels[INTEL_GPU_NODE_LABEL] === 'true') return 'unknown';
  return 'unknown';
}

export function formatGpuType(type: GpuType): string {
  switch (type) {
    case 'discrete': return 'Discrete';
    case 'integrated': return 'Integrated';
    default: return 'Unknown';
  }
}

// ---------------------------------------------------------------------------
// Pod (with GPU resource requests)
// ---------------------------------------------------------------------------

export interface ResourceRequirements {
  requests?: Record<string, string>;
  limits?: Record<string, string>;
}

export interface ContainerSpec {
  name: string;
  image?: string;
  resources?: ResourceRequirements;
}

export interface ContainerStatus {
  name: string;
  ready: boolean;
  restartCount: number;
  image?: string;
  state?: {
    running?: { startedAt?: string };
    waiting?: { reason?: string; message?: string };
    terminated?: { exitCode?: number; reason?: string };
  };
}

export interface PodSpec {
  nodeName?: string;
  containers?: ContainerSpec[];
  initContainers?: ContainerSpec[];
}

export interface PodStatus {
  phase?: string;
  conditions?: Array<{ type: string; status: string }>;
  containerStatuses?: ContainerStatus[];
}

export interface IntelGpuPod extends KubeObject {
  spec?: PodSpec;
  status?: PodStatus;
}

/** Returns true if any container in the pod requests Intel GPU resources */
export function isGpuRequestingPod(pod: unknown): pod is IntelGpuPod {
  if (!pod || typeof pod !== 'object') return false;
  const obj = pod as Record<string, unknown>;
  const spec = obj['spec'] as Record<string, unknown> | undefined;
  const containers = (spec?.['containers'] ?? []) as ContainerSpec[];
  const initContainers = (spec?.['initContainers'] ?? []) as ContainerSpec[];

  return [...containers, ...initContainers].some(c => {
    const requests = c.resources?.requests ?? {};
    const limits = c.resources?.limits ?? {};
    return Object.keys({ ...requests, ...limits }).some(k =>
      k.startsWith(INTEL_GPU_RESOURCE_PREFIX)
    );
  });
}

export function filterGpuRequestingPods(items: unknown[]): IntelGpuPod[] {
  return items.filter(isGpuRequestingPod);
}

/** Returns true if any container in the pod requests Intel GPU resources (for plugin pods) */
export function isIntelGpuPluginPod(pod: unknown): pod is IntelGpuPod {
  if (!pod || typeof pod !== 'object') return false;
  const obj = pod as Record<string, unknown>;
  const meta = obj['metadata'] as Record<string, unknown> | undefined;
  const labels = meta?.['labels'] as Record<string, string> | undefined;
  if (!labels) return false;
  return labels['app'] === 'intel-gpu-plugin' ||
    (labels['app.kubernetes.io/name'] === 'intel-gpu-plugin') ||
    (labels['component'] === 'intel-gpu-plugin');
}

export function filterIntelGpuPluginPods(items: unknown[]): IntelGpuPod[] {
  return items.filter(isIntelGpuPluginPod);
}

/** Get total GPU requests from a pod's containers */
export function getPodGpuRequests(pod: IntelGpuPod): Record<string, string> {
  const totals: Record<string, number> = {};
  const allContainers = [
    ...(pod.spec?.containers ?? []),
    ...(pod.spec?.initContainers ?? []),
  ];
  for (const c of allContainers) {
    const requests = c.resources?.requests ?? {};
    for (const [key, value] of Object.entries(requests)) {
      if (key.startsWith(INTEL_GPU_RESOURCE_PREFIX) && value) {
        totals[key] = (totals[key] ?? 0) + (parseInt(value, 10) || 0);
      }
    }
  }
  return Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, String(v)]));
}

export function isPodReady(pod: IntelGpuPod): boolean {
  return (
    pod.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True') ?? false
  );
}

export function getPodRestarts(pod: IntelGpuPod): number {
  return (
    pod.status?.containerStatuses?.reduce((sum, c) => sum + c.restartCount, 0) ?? 0
  );
}

// ---------------------------------------------------------------------------
// K8s API list response envelope
// ---------------------------------------------------------------------------

export interface KubeList<T> {
  items: T[];
  metadata?: { resourceVersion?: string };
}

export function isKubeList(value: unknown): value is KubeList<unknown> {
  if (!value || typeof value !== 'object') return false;
  return Array.isArray((value as Record<string, unknown>)['items']);
}

// ---------------------------------------------------------------------------
// Node condition helpers
// ---------------------------------------------------------------------------

export function isNodeReady(node: IntelGpuNode): boolean {
  return (
    node.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True') ?? false
  );
}

// ---------------------------------------------------------------------------
// Utility: human-readable age
// ---------------------------------------------------------------------------

export function formatAge(timestamp: string | undefined): string {
  if (!timestamp) return 'unknown';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ---------------------------------------------------------------------------
// Utility: GPU resource display name
// ---------------------------------------------------------------------------

export function formatGpuResourceName(resourceKey: string): string {
  const name = resourceKey.replace(INTEL_GPU_RESOURCE_PREFIX, '');
  const map: Record<string, string> = {
    'i915': 'GPU (i915)',
    'xe': 'GPU (Xe)',
    'millicores': 'GPU Millicores',
    'memory.max': 'GPU Memory (max)',
    'tiles': 'GPU Tiles',
  };
  return map[name] ?? name;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export function pluginStatusToStatus(
  plugin: GpuDevicePlugin
): 'success' | 'warning' | 'error' {
  const desired = plugin.status?.desiredNumberScheduled ?? 0;
  const ready = plugin.status?.numberReady ?? 0;
  const unavailable = plugin.status?.numberUnavailable ?? 0;

  if (desired === 0) return 'warning';
  if (unavailable > 0) return 'warning';
  if (ready === desired) return 'success';
  return 'error';
}

export function pluginStatusText(plugin: GpuDevicePlugin): string {
  const desired = plugin.status?.desiredNumberScheduled ?? 0;
  const ready = plugin.status?.numberReady ?? 0;
  if (desired === 0) return 'No nodes scheduled';
  return `${ready}/${desired} ready`;
}
