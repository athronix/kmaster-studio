/**
 * stores/hermesStatus.ts — Hermes 状态 store（U-16 + U-18）
 *
 * Bridge 四态 + gateway 状态 + offline 标记。
 * 从 /api/hermes/probe 定期刷新。
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getHealth } from '../api/client';

export type BridgeState = 'connected' | 'disconnected' | 'mock' | 'unknown';

export const useHermesStatusStore = defineStore('hermesStatus', () => {
  const bridgeState = ref<BridgeState>('unknown');
  const ghostHomeDetected = ref(false);
  const gatewayRunning = ref(false);
  const hermesVersion = ref('');
  const lastProbeTs = ref(0);
  const probeError = ref<string | null>(null);

  const isOffline = computed(() =>
    bridgeState.value === 'disconnected' || bridgeState.value === 'unknown',
  );
  const isMock = computed(() => bridgeState.value === 'mock');

  async function refresh() {
    try {
      const health = await getHealth();
      // bridge mode from health endpoint
      if (health.bridge_mock === true) {
        bridgeState.value = 'mock';
      } else if (health.bridge_mock === false) {
        // When not mock, assume connected (probe endpoint refines this)
        bridgeState.value = 'connected';
      } else {
        bridgeState.value = 'unknown';
      }
      gatewayRunning.value = true;
      lastProbeTs.value = Date.now();
      probeError.value = null;
    } catch {
      bridgeState.value = 'disconnected';
      gatewayRunning.value = false;
      probeError.value = 'probe unreachable';
      lastProbeTs.value = Date.now();
    }
  }

  return {
    bridgeState,
    ghostHomeDetected,
    gatewayRunning,
    hermesVersion,
    lastProbeTs,
    probeError,
    isOffline,
    isMock,
    refresh,
  };
});
