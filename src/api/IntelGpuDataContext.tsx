/**
 * IntelGpuDataContext — shared data provider for Intel GPU device plugin resources.
 *
 * Wraps K8s hook calls and ApiProxy requests, providing filtered Intel GPU
 * resources to all child pages through React context, avoiding prop drilling
 * and duplicate API calls.
 */

import { ApiProxy, K8s } from '@kinvolk/headlamp-plugin/lib';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  filterGpuRequestingPods,
  filterIntelGpuNodes,
  filterIntelGpuPluginPods,
  GpuDevicePlugin,
  INTEL_DEVICE_PLUGIN_API_GROUP,
  INTEL_DEVICE_PLUGIN_API_VERSION,
  IntelGpuNode,
  IntelGpuPod,
  isGpuDevicePlugin,
  isKubeList,
} from './k8s';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface IntelGpuContextValue {
  /** GpuDevicePlugin CRD instances — one per GPU type/config */
  devicePlugins: GpuDevicePlugin[];
  /** True if at least one GpuDevicePlugin CR exists */
  pluginInstalled: boolean;

  /** Nodes that have Intel GPU resources or labels */
  gpuNodes: IntelGpuNode[];

  /** Pods requesting Intel GPU resources */
  gpuPods: IntelGpuPod[];

  /** Intel GPU device plugin daemon pods */
  pluginPods: IntelGpuPod[];

  /** True if the GpuDevicePlugin CRD is available on the cluster */
  crdAvailable: boolean;

  /** Loading / error state */
  loading: boolean;
  error: string | null;

  /** Manual refresh trigger */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const IntelGpuContext = createContext<IntelGpuContextValue | null>(null);

export function useIntelGpuContext(): IntelGpuContextValue {
  const ctx = useContext(IntelGpuContext);
  if (!ctx) {
    throw new Error('useIntelGpuContext must be used within an IntelGpuDataProvider');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function IntelGpuDataProvider({ children }: { children: React.ReactNode }) {
  // K8s resource hooks — headlamp re-fetches on cluster context changes
  const [allNodes, nodeError] = K8s.ResourceClasses.Node.useList();
  const [allPods, podError] = K8s.ResourceClasses.Pod.useList({ namespace: '' });

  // Async state for CRD resources
  const [devicePlugins, setDevicePlugins] = useState<GpuDevicePlugin[]>([]);
  const [pluginPods, setPluginPods] = useState<IntelGpuPod[]>([]);
  const [crdAvailable, setCrdAvailable] = useState(false);
  const [asyncLoading, setAsyncLoading] = useState(true);
  const [asyncError, setAsyncError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchAsync() {
      setAsyncLoading(true);
      setAsyncError(null);

      try {
        // GpuDevicePlugin CRDs — graceful degradation if CRD not installed
        try {
          const pluginList = await ApiProxy.request(
            `/apis/${INTEL_DEVICE_PLUGIN_API_GROUP}/${INTEL_DEVICE_PLUGIN_API_VERSION}/gpudeviceplugins`
          );
          if (!cancelled && isKubeList(pluginList)) {
            setCrdAvailable(true);
            setDevicePlugins(pluginList.items.filter(isGpuDevicePlugin));
          }
        } catch {
          if (!cancelled) {
            setCrdAvailable(false);
            setDevicePlugins([]);
          }
        }

        // Intel GPU plugin DaemonSet pods — look across all namespaces
        // The device plugin is commonly deployed in kube-system but may vary
        const pluginPodSelectors = [
          // Intel device plugins operator deployment
          `/api/v1/pods?labelSelector=${encodeURIComponent('app=intel-gpu-plugin')}`,
          // Alternative: by component label
          `/api/v1/pods?labelSelector=${encodeURIComponent('app.kubernetes.io/name=intel-gpu-plugin')}`,
          // Intel device plugins from inteldeviceplugins-system namespace
          `/api/v1/namespaces/inteldeviceplugins-system/pods`,
        ];

        const foundPluginPods: IntelGpuPod[] = [];

        for (const url of pluginPodSelectors) {
          try {
            const list = await ApiProxy.request(url);
            if (!cancelled && isKubeList(list)) {
              const gpuPluinPods = filterIntelGpuPluginPods(list.items);
              foundPluginPods.push(...gpuPluinPods);
            }
          } catch {
            // Silently ignore — some selectors may not match
          }
        }

        // Deduplicate by pod UID
        const seen = new Set<string>();
        const uniquePluginPods = foundPluginPods.filter(p => {
          const uid = p.metadata.uid;
          if (!uid || seen.has(uid)) return false;
          seen.add(uid);
          return true;
        });

        if (!cancelled) setPluginPods(uniquePluginPods);
      } catch (err: unknown) {
        if (!cancelled) {
          setAsyncError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setAsyncLoading(false);
      }
    }

    void fetchAsync();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // ---------------------------------------------------------------------------
  // Derived / filtered values — memoized to avoid recomputation on every render
  //
  // Headlamp useList() returns KubeObject class instances that store raw
  // Kubernetes JSON under `.jsonData`. Extract jsonData so our plain-object
  // type helpers work correctly.
  // ---------------------------------------------------------------------------

  const extractJsonData = (items: unknown[]): unknown[] =>
    items.map(item =>
      item && typeof item === 'object' && 'jsonData' in item
        ? (item as { jsonData: unknown }).jsonData
        : item
    );

  const gpuNodes = useMemo(() => {
    if (!allNodes) return [];
    return filterIntelGpuNodes(extractJsonData(allNodes as unknown[]));
  }, [allNodes]);

  const gpuPods = useMemo(() => {
    if (!allPods) return [];
    return filterGpuRequestingPods(extractJsonData(allPods as unknown[]));
  }, [allPods]);

  // ---------------------------------------------------------------------------
  // Combined loading / error state
  // ---------------------------------------------------------------------------

  const loading = asyncLoading || !allNodes || !allPods;

  const errors: string[] = [];
  if (nodeError) errors.push(String(nodeError));
  if (podError) errors.push(String(podError));
  if (asyncError) errors.push(asyncError);
  const error = errors.length > 0 ? errors.join('; ') : null;

  const pluginInstalled = devicePlugins.length > 0 || pluginPods.length > 0;

  // ---------------------------------------------------------------------------
  // Memoized context value
  // ---------------------------------------------------------------------------

  const value = useMemo<IntelGpuContextValue>(
    () => ({
      devicePlugins,
      pluginInstalled,
      gpuNodes,
      gpuPods,
      pluginPods,
      crdAvailable,
      loading,
      error,
      refresh,
    }),
    [
      devicePlugins,
      pluginInstalled,
      gpuNodes,
      gpuPods,
      pluginPods,
      crdAvailable,
      loading,
      error,
      refresh,
    ]
  );

  return <IntelGpuContext.Provider value={value}>{children}</IntelGpuContext.Provider>;
}
