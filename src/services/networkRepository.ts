import { createSeededNetworkState, DEMO_STORES } from '../data/seedData';
import { computeSellableStock } from './fulfilmentService';
import type { NetworkState } from '../types';

const STORAGE_KEY = 'synapse_demo_network_state_v2';

/**
 * Normalizes persisted state across schema upgrades, migrates legacy Electronic City
 * records to SYNAPSE Koramangala, and sweeps any expired 10-minute cart reservations
 * immediately upon loading from storage.
 */
export function normalizeAndSweepNetworkState(rawState: NetworkState): NetworkState {
  const nowMs = Date.now();

  // Ensure Koramangala replaces any persisted legacy electronic-city store node
  const hasElectronicCity = (rawState.stores || []).some((s) => s.id === 'electronic-city');
  const stores = hasElectronicCity
    ? DEMO_STORES
    : rawState.stores && rawState.stores.length === 4
      ? rawState.stores
      : DEMO_STORES;

  const migrateStoreId = (id: string) => (id === 'electronic-city' ? 'koramangala' : id);
  const migrateStoreName = (name: string) =>
    name.includes('Electronic City') ? name.replace('Electronic City', 'Koramangala') : name;

  const normalizedCart = (rawState.cart || []).map((item) => {
    const addedAt = item.addedAt || new Date(nowMs).toISOString();
    const reservedAt = item.reservedAt || addedAt;
    const isTimedHold =
      typeof item.isTimedHold === 'boolean' ? item.isTimedHold : Boolean(item.expiresAt);
    const holdDurationMinutes = isTimedHold ? 10 : 0;
    const expiresAt = isTimedHold
      ? item.expiresAt ||
        new Date(new Date(reservedAt).getTime() + 10 * 60 * 1000).toISOString()
      : null;

    return {
      ...item,
      storeId: migrateStoreId(item.storeId),
      reservedAt,
      expiresAt,
      holdDurationMinutes,
      isTimedHold,
      isRenewable: false,
      demandLevel: item.demandLevel || 'ELEVATED',
      demandReason:
        item.demandReason ||
        (isTimedHold
          ? 'Fixed 10m non-renewable reservation'
          : 'Standard cart allocation'),
    };
  });

  const activeCart = normalizedCart.filter(
    (item) => !item.isTimedHold || (item.expiresAt !== null && new Date(item.expiresAt).getTime() > nowMs)
  );

  // Recompute cartHoldQty deterministically from active timed holds so stale holds never orphan stock
  const holdByKey = new Map<string, number>();
  for (const item of activeCart) {
    if (!item.isTimedHold) continue;
    const key = `${item.storeId}_${item.productId}`;
    holdByKey.set(key, (holdByKey.get(key) || 0) + item.quantity);
  }

  const normalizedInventory = (rawState.inventory || []).map((inv) => {
    const storeId = migrateStoreId(inv.storeId);
    const key = `${storeId}_${inv.productId}`;
    const cartHoldQty = holdByKey.get(key) || 0;
    const sellableQty = computeSellableStock(
      inv.verifiedQty,
      inv.reservedQty,
      inv.safetyBuffer,
      cartHoldQty
    );
    return {
      ...inv,
      id: `${storeId}_${inv.productId}`,
      storeId,
      cartHoldQty,
      sellableQty,
    };
  });

  const transferRecommendations = (rawState.transferRecommendations || []).map((rec) => ({
    ...rec,
    sourceStoreId: migrateStoreId(rec.sourceStoreId),
    sourceStoreName: migrateStoreName(rec.sourceStoreName),
    destinationStoreId: migrateStoreId(rec.destinationStoreId),
    destinationStoreName: migrateStoreName(rec.destinationStoreName),
    reason: migrateStoreName(rec.reason),
  }));

  return {
    ...rawState,
    stores,
    cart: activeCart,
    inventory: normalizedInventory,
    transferRecommendations,
    transferDecisions: rawState.transferDecisions || [],
    inventoryMovements: rawState.inventoryMovements || [],
    activityLogs: rawState.activityLogs || [],
    registeredInterests: rawState.registeredInterests || [],
  };
}

export function loadNetworkState(): NetworkState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = createSeededNetworkState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as NetworkState;
    if (
      !parsed ||
      !Array.isArray(parsed.stores) ||
      !Array.isArray(parsed.products) ||
      !Array.isArray(parsed.inventory)
    ) {
      const seeded = createSeededNetworkState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const normalized = normalizeAndSweepNetworkState(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return createSeededNetworkState();
  }
}

export function saveNetworkState(state: NetworkState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to persist SYNAPSE state:', err);
  }
}

export function resetNetworkState(): NetworkState {
  const seeded = createSeededNetworkState();
  saveNetworkState(seeded);
  return seeded;
}
