import fs from 'fs';
import { createSeededNetworkState, DEMO_PRODUCTS, DEMO_STORES } from '../src/data/seedData.js';
import {
  computeSellableStock,
  evaluateCartHoldPolicy,
  rankFulfilmentOptions,
} from '../src/services/fulfilmentService.js';
import { generateDynamicTransferRecommendations } from '../src/services/transferRecommendationEngine.js';
import type {
  AuthSession,
  CartItem,
  DemandSignal,
  DemandSignalOutcome,
  DemandSignalSource,
  FulfilmentPreference,
  InventoryMovement,
  NetworkActivity,
  NetworkState,
  Order,
  PickTask,
  StockVerification,
  TransferDecision,
  TransferRecommendation,
  UserRole,
} from '../src/types/index.js';
import { getPreferenceLabel } from '../src/utils/formatters.js';

const STATE_FILE_PATH = '/tmp/synapse_network_state_v2.json';
const REMOTE_STATE_KEY = 'synapse:network_state:v2';

export interface CompactFallbackState {
  epochId?: string;
  revision?: number;
  inventory?: NetworkState['inventory'];
  cart?: CartItem[];
  orders?: Order[];
  pickTasks?: PickTask[];
  verifications?: StockVerification[];
  demandSignals?: DemandSignal[];
  transferRecommendations?: TransferRecommendation[];
  transferDecisions?: TransferDecision[];
  inventoryMovements?: InventoryMovement[];
  activityLogs?: NetworkActivity[];
  registeredInterests?: string[];
}

interface PersistedServerState extends Omit<NetworkState, 'cart'> {
  epochId: string;
  revision: number;
  explicitReset?: boolean;
  reservations: CartItem[];
}

export interface NetworkApiResponse<T = undefined> {
  ok: boolean;
  status: number;
  message: string;
  state: NetworkState;
  expiredNotices?: string[];
  data?: T;
}

declare global {
  var _synapseServerState: PersistedServerState | undefined;
  var _synapseStateLock: Promise<void> | undefined;
}

function generateEpochId(): string {
  return `epoch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getKvConfig(): { url: string; token: string } | null {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

async function readRemoteKvState(): Promise<PersistedServerState | null> {
  const kv = getKvConfig();
  if (!kv) return null;
  try {
    const res = await fetch(`${kv.url}/get/${encodeURIComponent(REMOTE_STATE_KEY)}`, {
      headers: { Authorization: `Bearer ${kv.token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: unknown };
    if (typeof json.result === 'string' && json.result) {
      return JSON.parse(json.result) as PersistedServerState;
    }
  } catch {
    // Fall back to in-memory / /tmp state if remote KV is unreachable
  }
  return null;
}

async function writeRemoteKvState(state: PersistedServerState): Promise<void> {
  const kv = getKvConfig();
  if (!kv) return;
  try {
    await fetch(`${kv.url}/set/${encodeURIComponent(REMOTE_STATE_KEY)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kv.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(JSON.stringify(state)),
    });
  } catch {
    // Non-blocking fallback
  }
}

function toPersistedState(seed: NetworkState, explicitReset = false): PersistedServerState {
  const { cart, dynamicSuggestions: _unused, ...rest } = seed;
  return {
    ...rest,
    epochId: rest.epochId || generateEpochId(),
    revision: typeof rest.revision === 'number' && rest.revision >= 1 ? rest.revision : 1,
    explicitReset,
    reservations: cart || [],
  };
}

function normalizeParsedState(parsed: PersistedServerState): PersistedServerState {
  // Auto-migrate legacy electronic-city node to koramangala if encountered
  const hasLegacy = parsed.stores.some((s) => s.id === 'electronic-city');
  const migrateId = (id: string) => (id === 'electronic-city' ? 'koramangala' : id);
  const migrateName = (txt: string) =>
    txt.includes('Electronic City') ? txt.replace('Electronic City', 'Koramangala') : txt;

  return {
    ...parsed,
    epochId: parsed.epochId || generateEpochId(),
    revision: typeof parsed.revision === 'number' && parsed.revision >= 1 ? parsed.revision : 1,
    explicitReset: Boolean(parsed.explicitReset),
    stores: hasLegacy ? DEMO_STORES : parsed.stores,
    products: Array.isArray(parsed.products) && parsed.products.length > 0 ? parsed.products : DEMO_PRODUCTS,
    inventory: (parsed.inventory || []).map((inv) => {
      const storeId = migrateId(inv.storeId);
      return {
        ...inv,
        id: `${storeId}_${inv.productId}`,
        storeId,
      };
    }),
    reservations: Array.isArray(parsed.reservations) ? parsed.reservations : [],
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    pickTasks: Array.isArray(parsed.pickTasks) ? parsed.pickTasks : [],
    verifications: Array.isArray(parsed.verifications) ? parsed.verifications : [],
    demandSignals: Array.isArray(parsed.demandSignals) ? parsed.demandSignals : [],
    transferRecommendations: (parsed.transferRecommendations || []).map((r) => ({
      ...r,
      sourceStoreId: migrateId(r.sourceStoreId),
      sourceStoreName: migrateName(r.sourceStoreName),
      destinationStoreId: migrateId(r.destinationStoreId),
      destinationStoreName: migrateName(r.destinationStoreName),
      reason: migrateName(r.reason),
    })),
    transferDecisions: Array.isArray(parsed.transferDecisions)
      ? parsed.transferDecisions
      : [],
    inventoryMovements: Array.isArray(parsed.inventoryMovements)
      ? parsed.inventoryMovements
      : [],
    activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : [],
    registeredInterests: Array.isArray(parsed.registeredInterests)
      ? parsed.registeredInterests
      : [],
  };
}

async function loadServerState(): Promise<PersistedServerState> {
  const remote = await readRemoteKvState();
  if (
    remote &&
    Array.isArray(remote.stores) &&
    Array.isArray(remote.products) &&
    Array.isArray(remote.inventory)
  ) {
    const normalized = normalizeParsedState(remote);
    global._synapseServerState = normalized;
    return normalized;
  }

  if (global._synapseServerState) {
    return global._synapseServerState;
  }

  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as PersistedServerState;
      if (
        parsed &&
        Array.isArray(parsed.stores) &&
        Array.isArray(parsed.products) &&
        Array.isArray(parsed.inventory)
      ) {
        const normalized = normalizeParsedState(parsed);
        global._synapseServerState = normalized;
        return normalized;
      }
    }
  } catch {
    // Fall back to clean seed when filesystem storage is unavailable
  }

  const seeded = toPersistedState(createSeededNetworkState(), false);
  global._synapseServerState = seeded;
  await persistState(seeded);
  return seeded;
}

async function persistState(state: PersistedServerState): Promise<void> {
  global._synapseServerState = state;
  try {
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state), 'utf8');
  } catch {
    // Serverless read-only environments fall back gracefully to in-memory global state
  }
  await writeRemoteKvState(state);
}

function bumpRevision(state: PersistedServerState, clearReset = true): PersistedServerState {
  return {
    ...state,
    revision: (state.revision || 1) + 1,
    explicitReset: clearReset ? false : state.explicitReset,
  };
}

async function maybeHydrateFromFallback(
  current: PersistedServerState,
  fallback?: CompactFallbackState,
  holderKey?: string
): Promise<PersistedServerState> {
  if (!fallback || getKvConfig()) return current;
  const fbRev = typeof fallback.revision === 'number' ? fallback.revision : 0;
  const fbEpoch = typeof fallback.epochId === 'string' ? fallback.epochId : '';
  if (!fbEpoch || fbRev <= 1) return current;

  const isColdLambda = current.revision === 1 && !current.explicitReset && current.epochId !== fbEpoch;
  const isStaleSameEpoch = current.epochId === fbEpoch && fbRev > current.revision;
  if (!isColdLambda && !isStaleSameEpoch) return current;

  if (!Array.isArray(fallback.inventory) || fallback.inventory.length === 0) {
    return current;
  }

  const cleanHolder = (holderKey || '').trim();
  const hydratedCart = Array.isArray(fallback.cart)
    ? fallback.cart.map((c) => ({ ...c, holderKey: c.holderKey || cleanHolder }))
    : current.reservations;

  const merged = normalizeParsedState({
    ...current,
    epochId: fbEpoch,
    revision: fbRev,
    explicitReset: false,
    stores: DEMO_STORES,
    products: DEMO_PRODUCTS,
    inventory: fallback.inventory,
    reservations: hydratedCart,
    orders: Array.isArray(fallback.orders) ? fallback.orders : current.orders,
    pickTasks: Array.isArray(fallback.pickTasks) ? fallback.pickTasks : current.pickTasks,
    verifications: Array.isArray(fallback.verifications) ? fallback.verifications : current.verifications,
    demandSignals: Array.isArray(fallback.demandSignals) ? fallback.demandSignals : current.demandSignals,
    transferRecommendations: Array.isArray(fallback.transferRecommendations)
      ? fallback.transferRecommendations
      : current.transferRecommendations,
    transferDecisions: Array.isArray(fallback.transferDecisions)
      ? fallback.transferDecisions
      : current.transferDecisions,
    inventoryMovements: Array.isArray(fallback.inventoryMovements)
      ? fallback.inventoryMovements
      : current.inventoryMovements,
    activityLogs: Array.isArray(fallback.activityLogs) ? fallback.activityLogs : current.activityLogs,
    registeredInterests: Array.isArray(fallback.registeredInterests)
      ? fallback.registeredInterests
      : current.registeredInterests,
  });

  await persistState(merged);
  return merged;
}

async function withStateLock<T>(
  fn: (state: PersistedServerState) => T | Promise<T>,
  fallback?: CompactFallbackState,
  holderKey?: string
): Promise<T> {
  const prev = global._synapseStateLock || Promise.resolve();
  let release!: () => void;
  global._synapseStateLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await prev;
  try {
    const loaded = await loadServerState();
    const current = await maybeHydrateFromFallback(loaded, fallback, holderKey);
    return await fn(current);
  } finally {
    release();
  }
}

/**
 * Reaps any expired non-renewable 10-minute holds globally across all shoppers/devices,
 * recalculates live cartHoldQty and sellableQty per (storeId, productId), and logs
 * CART_HOLD_EXPIRED ledger/activity entries.
 */
async function sweepExpiredReservations(
  state: PersistedServerState,
  targetHolderKey?: string
): Promise<{ state: PersistedServerState; expiredNotices: string[] }> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const expired = state.reservations.filter(
    (item) => item.isTimedHold && item.expiresAt && new Date(item.expiresAt).getTime() <= nowMs
  );
  const active = state.reservations.filter(
    (item) => !item.isTimedHold || (item.expiresAt !== null && new Date(item.expiresAt).getTime() > nowMs)
  );

  // Sum active timed holds across ALL holders so double-reservation is impossible across devices
  const holdByKey = new Map<string, number>();
  for (const item of active) {
    if (!item.isTimedHold) continue;
    const key = `${item.storeId}_${item.productId}`;
    holdByKey.set(key, (holdByKey.get(key) || 0) + item.quantity);
  }

  const newMovements: InventoryMovement[] = [];
  const newActivities: NetworkActivity[] = [];
  const expiredNotices: string[] = [];

  for (const exp of expired) {
    const product = state.products.find((p) => p.id === exp.productId);
    const store = state.stores.find((s) => s.id === exp.storeId);
    const inv = state.inventory.find(
      (i) => i.storeId === exp.storeId && i.productId === exp.productId
    );
    const newHoldQty = holdByKey.get(`${exp.storeId}_${exp.productId}`) || 0;
    const afterSellable = inv
      ? computeSellableStock(inv.verifiedQty, inv.reservedQty, inv.safetyBuffer, newHoldQty)
      : 0;

    if (inv && product && store) {
      newMovements.push({
        id: `mov-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
        movementType: 'CART_HOLD_EXPIRED',
        storeId: store.id,
        storeName: store.name,
        productId: product.id,
        productName: product.name,
        quantityDelta: exp.quantity,
        beforeVerifiedQty: inv.verifiedQty,
        afterVerifiedQty: inv.verifiedQty,
        beforeSellableQty: inv.sellableQty,
        afterSellableQty: afterSellable,
        referenceId: exp.id,
        notes: `Non-renewable 10m hold expired for ${exp.quantity}x ${product.name}; stock returned to shelf.`,
        actorName: 'Reservation Expiry Sweeper',
        actorRole: 'CUSTOMER',
        createdAt: nowIso,
      });
    }

    if (targetHolderKey && exp.holderKey === targetHolderKey) {
      expiredNotices.push(
        `Your fixed 10-minute reservation expired and released ${exp.quantity}x ${product?.name || exp.productId} back to ${store?.name || exp.storeId}.`
      );
    }
  }

  if (expired.length > 0) {
    const summaryLabels = expired
      .map((e) => {
        const p = state.products.find((prod) => prod.id === e.productId);
        return `${e.quantity}x ${p?.name || e.productId}`;
      })
      .join(', ');

    newActivities.push({
      id: `act-${nowMs}-exp`,
      actorUid: 'system-hold-sweeper',
      actorRole: 'CUSTOMER',
      actorName: 'Reservation Expiry Sweeper',
      eventType: 'CART_HOLD_EXPIRED',
      storeId: expired[0].storeId,
      summary: `Released expired non-renewable 10m cart reservation (${summaryLabels}) back to sellable store stock.`,
      createdAt: nowIso,
    });
  }

  let inventoryChanged = false;
  const nextInventory = state.inventory.map((inv) => {
    const key = `${inv.storeId}_${inv.productId}`;
    const nextHold = holdByKey.get(key) || 0;
    const nextSellable = computeSellableStock(
      inv.verifiedQty,
      inv.reservedQty,
      inv.safetyBuffer,
      nextHold
    );
    if (nextHold === inv.cartHoldQty && nextSellable === inv.sellableQty) {
      return inv;
    }
    inventoryChanged = true;
    return {
      ...inv,
      cartHoldQty: nextHold,
      sellableQty: nextSellable,
      updatedAt: nowIso,
    };
  });

  if (expired.length === 0 && !inventoryChanged) {
    return { state, expiredNotices };
  }

  const nextState: PersistedServerState = bumpRevision({
    ...state,
    reservations: active,
    inventory: nextInventory,
    inventoryMovements: [...newMovements, ...state.inventoryMovements].slice(0, 250),
    activityLogs: [...newActivities, ...state.activityLogs].slice(0, 200),
  });
  await persistState(nextState);
  return { state: nextState, expiredNotices };
}

function buildClientState(state: PersistedServerState, holderKey: string): NetworkState {
  const holderCart = state.reservations.filter((r) => (r.holderKey || '') === holderKey);
  const dynamicSuggestions = generateDynamicTransferRecommendations({
    stores: state.stores,
    products: state.products,
    inventory: state.inventory,
    demandSignals: state.demandSignals,
    orders: state.orders,
    transferRecommendations: state.transferRecommendations,
  });

  return {
    epochId: state.epochId,
    revision: state.revision,
    explicitReset: Boolean(state.explicitReset),
    stores: state.stores,
    products: state.products,
    inventory: state.inventory,
    cart: holderCart,
    orders: state.orders,
    pickTasks: state.pickTasks,
    verifications: state.verifications,
    demandSignals: state.demandSignals,
    transferRecommendations: state.transferRecommendations,
    transferDecisions: state.transferDecisions,
    inventoryMovements: state.inventoryMovements,
    activityLogs: state.activityLogs,
    registeredInterests: state.registeredInterests,
    dynamicSuggestions,
  };
}

export async function getNetworkSnapshot(holderKey: string): Promise<NetworkApiResponse> {
  return withStateLock(async (current) => {
    const { state, expiredNotices } = await sweepExpiredReservations(current, holderKey);
    return {
      ok: true,
      status: 200,
      message: 'Synchronized live network state.',
      state: buildClientState(state, holderKey),
      expiredNotices,
    };
  });
}

export async function hydrateNetworkServerState(input: {
  holderKey: string;
  fallbackState?: CompactFallbackState;
}): Promise<NetworkApiResponse> {
  const cleanHolder = (input.holderKey || '').trim();
  return withStateLock(
    async (current) => {
      const { state, expiredNotices } = await sweepExpiredReservations(current, cleanHolder);
      return {
        ok: true,
        status: 200,
        message: 'Server state synchronized.',
        state: buildClientState(state, cleanHolder),
        expiredNotices,
      };
    },
    input.fallbackState,
    cleanHolder
  );
}

export async function reserveCartItem(input: {
  holderKey: string;
  productId: string;
  storeId: string;
  preference: FulfilmentPreference;
  qty: number;
  actorName?: string;
  fallbackState?: CompactFallbackState;
}): Promise<NetworkApiResponse<CartItem>> {
  const cleanHolder = input.holderKey.trim();
  if (!cleanHolder) {
    return withStateLock((s) => ({
      ok: false,
      status: 400,
      message: 'Missing holder session identifier.',
      state: buildClientState(s, ''),
    }));
  }

  return withStateLock(async (current) => {
    const { state, expiredNotices } = await sweepExpiredReservations(current, cleanHolder);
    const validPreferences: FulfilmentPreference[] = ['SAVE_MONEY', 'GET_IT_FASTER', 'SHOP_NEARBY'];
    const safePreference: FulfilmentPreference = validPreferences.includes(input.preference)
      ? input.preference
      : 'GET_IT_FASTER';

    const qty = Number(input.qty);
    if (!Number.isInteger(qty) || qty < 1) {
      return {
        ok: false,
        status: 400,
        message: 'Quantity must be a positive whole number.',
        state: buildClientState(state, cleanHolder),
        expiredNotices,
      };
    }

    const inv = state.inventory.find(
      (r) => r.productId === input.productId && r.storeId === input.storeId
    );
    const store = state.stores.find((s) => s.id === input.storeId);
    const product = state.products.find((p) => p.id === input.productId);
    if (!inv || !store || !product) {
      return {
        ok: false,
        status: 404,
        message: 'Selected store inventory record was not found.',
        state: buildClientState(state, cleanHolder),
        expiredNotices,
      };
    }

    if (!store.isOpen) {
      return {
        ok: false,
        status: 400,
        message: `${store.name} is currently closed for fulfilment.`,
        state: buildClientState(state, cleanHolder),
        expiredNotices,
      };
    }

    const holderItems = state.reservations.filter((c) => c.holderKey === cleanHolder);
    const hasDifferentStore = holderItems.some((c) => c.storeId !== input.storeId);
    if (hasDifferentStore) {
      return {
        ok: false,
        status: 409,
        message:
          'Your cart currently holds items fulfilled by a different store. Clear or checkout your current cart first to keep a single-store fulfilment promise.',
        state: buildClientState(state, cleanHolder),
        expiredNotices,
      };
    }

    // Strict double-reservation protection across all shoppers & devices
    if (qty > inv.sellableQty) {
      return {
        ok: false,
        status: 409,
        message:
          inv.cartHoldQty > 0
            ? `Only ${inv.sellableQty} sellable unit(s) remain at ${store.name} (${inv.cartHoldQty} unit(s) currently held in active 10m reservations).`
            : `Only ${inv.sellableQty} sellable unit(s) available at ${store.name}.`,
        state: buildClientState(state, cleanHolder),
        expiredNotices,
      };
    }

    const existingIdx = state.reservations.findIndex(
      (c) =>
        c.holderKey === cleanHolder &&
        c.productId === input.productId &&
        c.storeId === input.storeId
    );
    const existingItem = existingIdx >= 0 ? holderItems.find((c) => c.productId === input.productId) || state.reservations[existingIdx] : null;

    const policy = evaluateCartHoldPolicy(
      product,
      store,
      inv,
      state.demandSignals,
      state.orders,
      qty
    );

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    // CRITICAL INVARIANT: Re-adding or updating never extends, renews, or resets an existing timed expiry!
    const nextIsTimedHold = existingItem ? existingItem.isTimedHold || policy.qualifiesForTimedHold : policy.qualifiesForTimedHold;
    const nextExpiresAt = existingItem
      ? existingItem.expiresAt ||
        (nextIsTimedHold ? new Date(nowMs + 10 * 60 * 1000).toISOString() : null)
      : policy.qualifiesForTimedHold
        ? new Date(nowMs + policy.durationMinutes * 60 * 1000).toISOString()
        : null;

    const savedItem: CartItem = existingItem
      ? {
          ...existingItem,
          quantity: existingItem.quantity + qty,
          fulfilmentPreference: safePreference,
          // Preserve original addedAt, reservedAt, and immutable expiresAt
          isTimedHold: nextIsTimedHold,
          isRenewable: false,
          holdDurationMinutes: nextIsTimedHold ? 10 : 0,
          expiresAt: nextExpiresAt,
          demandLevel: existingItem.isTimedHold ? existingItem.demandLevel : policy.demandLevel,
          demandReason: existingItem.isTimedHold ? existingItem.demandReason : policy.reason,
        }
      : {
          id: `cart-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
          holderKey: cleanHolder,
          productId: input.productId,
          storeId: input.storeId,
          quantity: qty,
          fulfilmentPreference: safePreference,
          addedAt: nowIso,
          reservedAt: nowIso,
          expiresAt: nextExpiresAt,
          holdDurationMinutes: nextIsTimedHold ? 10 : 0,
          isTimedHold: nextIsTimedHold,
          isRenewable: false,
          demandLevel: policy.demandLevel,
          demandReason: policy.reason,
        };

    const nextReservations = [...state.reservations];
    if (existingIdx >= 0) {
      nextReservations[existingIdx] = savedItem;
    } else {
      nextReservations.push(savedItem);
    }

    const holdDelta = nextIsTimedHold
      ? existingItem && !existingItem.isTimedHold
        ? existingItem.quantity + qty
        : qty
      : 0;
    const nextCartHold = (inv.cartHoldQty || 0) + holdDelta;
    const afterSellable = computeSellableStock(
      inv.verifiedQty,
      inv.reservedQty,
      inv.safetyBuffer,
      nextCartHold
    );

    const nextInventory = state.inventory.map((r) =>
      r.storeId === input.storeId && r.productId === input.productId
        ? {
            ...r,
            cartHoldQty: nextCartHold,
            sellableQty: afterSellable,
            updatedAt: nowIso,
          }
        : r
    );

    const movements = [...state.inventoryMovements];
    if (holdDelta > 0) {
      movements.unshift({
        id: `mov-${nowMs}-${Math.random().toString(36).slice(2, 5)}`,
        movementType: 'CART_HOLD_LOCK',
        storeId: store.id,
        storeName: store.name,
        productId: product.id,
        productName: product.name,
        quantityDelta: -holdDelta,
        beforeVerifiedQty: inv.verifiedQty,
        afterVerifiedQty: inv.verifiedQty,
        beforeSellableQty: inv.sellableQty,
        afterSellableQty: afterSellable,
        referenceId: savedItem.id,
        notes: existingItem
          ? `Added ${qty} more unit(s) onto existing fixed 10m hold (original expiry preserved).`
          : `Fixed 10m non-renewable cart hold locked for ${qty}x ${product.name}.`,
        actorName: input.actorName || 'Customer',
        actorRole: 'CUSTOMER',
        createdAt: nowIso,
      });
    }

    const nextState: PersistedServerState = bumpRevision({
      ...state,
      reservations: nextReservations,
      inventory: nextInventory,
      inventoryMovements: movements.slice(0, 250),
    });
    await persistState(nextState);

    return {
      ok: true,
      status: 200,
      message: savedItem.isTimedHold
        ? existingItem
          ? `Added ${qty} unit(s) under your existing fixed 10-minute hold at ${store.name} (original timer preserved).`
          : `Reserved ${qty} unit(s) at ${store.name} with a fixed non-renewable 10-minute hold.`
        : `Added ${qty} unit(s) from ${store.name} (abundant shelf stock).`,
      state: buildClientState(nextState, cleanHolder),
      expiredNotices,
      data: savedItem,
    };
  }, input.fallbackState, cleanHolder);
}

export async function updateCartItemQty(input: {
  holderKey: string;
  cartItemId: string;
  quantity: number;
  actorName?: string;
  fallbackState?: CompactFallbackState;
}): Promise<NetworkApiResponse> {
  const cleanHolder = input.holderKey.trim();
  return withStateLock(async (current) => {
    const { state, expiredNotices } = await sweepExpiredReservations(current, cleanHolder);
    const idx = state.reservations.findIndex(
      (c) => c.id === input.cartItemId && c.holderKey === cleanHolder
    );
    if (idx < 0) {
      return {
        ok: false,
        status: 404,
        message: 'Cart reservation not found or already expired.',
        state: buildClientState(state, cleanHolder),
        expiredNotices,
      };
    }

    const item = state.reservations[idx];
    const nowIso = new Date().toISOString();
    const inv = state.inventory.find(
      (r) => r.storeId === item.storeId && r.productId === item.productId
    );
    const store = state.stores.find((s) => s.id === item.storeId);
    const product = state.products.find((p) => p.id === item.productId);

    if (input.quantity < 1) {
      const nextReservations = state.reservations.filter((c) => c.id !== item.id);
      const releaseDelta = item.isTimedHold ? item.quantity : 0;
      const nextHold = Math.max(0, (inv?.cartHoldQty || 0) - releaseDelta);
      const afterSellable = inv
        ? computeSellableStock(inv.verifiedQty, inv.reservedQty, inv.safetyBuffer, nextHold)
        : 0;

      const nextInventory = state.inventory.map((r) =>
        r.storeId === item.storeId && r.productId === item.productId
          ? {
              ...r,
              cartHoldQty: nextHold,
              sellableQty: afterSellable,
              updatedAt: nowIso,
            }
          : r
      );

      const movements = [...state.inventoryMovements];
      if (releaseDelta > 0 && inv && store && product) {
        movements.unshift({
          id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          movementType: 'CART_HOLD_RELEASE',
          storeId: store.id,
          storeName: store.name,
          productId: product.id,
          productName: product.name,
          quantityDelta: releaseDelta,
          beforeVerifiedQty: inv.verifiedQty,
          afterVerifiedQty: inv.verifiedQty,
          beforeSellableQty: inv.sellableQty,
          afterSellableQty: afterSellable,
          referenceId: item.id,
          notes: `Shopper removed ${releaseDelta}x ${product.name}; 10m hold released.`,
          actorName: input.actorName || 'Customer',
          actorRole: 'CUSTOMER',
          createdAt: nowIso,
        });
      }

      const nextState: PersistedServerState = bumpRevision({
        ...state,
        reservations: nextReservations,
        inventory: nextInventory,
        inventoryMovements: movements.slice(0, 250),
      });
      await persistState(nextState);
      return {
        ok: true,
        status: 200,
        message: 'Item removed and cart hold released.',
        state: buildClientState(nextState, cleanHolder),
        expiredNotices,
      };
    }

    if (!inv || !store || !product) {
      return {
        ok: false,
        status: 404,
        message: 'Store inventory record not found.',
        state: buildClientState(state, cleanHolder),
        expiredNotices,
      };
    }

    const delta = input.quantity - item.quantity;
    if (delta > 0 && delta > inv.sellableQty) {
      return {
        ok: false,
        status: 409,
        message: `Only ${inv.sellableQty} additional sellable unit(s) available at ${store.name}.`,
        state: buildClientState(state, cleanHolder),
        expiredNotices,
      };
    }

    // Strict non-renewable rule: quantity change NEVER extends or resets expiresAt!
    const nextReservations = state.reservations.map((c) =>
      c.id === item.id
        ? {
            ...c,
            quantity: input.quantity,
          }
        : c
    );

    const holdDelta = item.isTimedHold ? delta : 0;
    const nextCartHold = Math.max(0, (inv.cartHoldQty || 0) + holdDelta);
    const afterSellable = computeSellableStock(
      inv.verifiedQty,
      inv.reservedQty,
      inv.safetyBuffer,
      nextCartHold
    );

    const nextInventory = state.inventory.map((r) =>
      r.storeId === item.storeId && r.productId === item.productId
        ? {
            ...r,
            cartHoldQty: nextCartHold,
            sellableQty: afterSellable,
            updatedAt: nowIso,
          }
        : r
    );

    const nextState: PersistedServerState = bumpRevision({
      ...state,
      reservations: nextReservations,
      inventory: nextInventory,
    });
    await persistState(nextState);

    return {
      ok: true,
      status: 200,
      message: item.isTimedHold
        ? `Updated quantity to ${input.quantity} unit(s). Original non-renewable expiry preserved.`
        : `Updated quantity to ${input.quantity} unit(s).`,
      state: buildClientState(nextState, cleanHolder),
      expiredNotices,
    };
  }, input.fallbackState, cleanHolder);
}

export async function placeNetworkOrder(input: {
  holderKey: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  city: string;
  fallbackState?: CompactFallbackState;
}): Promise<NetworkApiResponse<Order>> {
  const cleanHolder = input.holderKey.trim();
  return withStateLock(async (current) => {
    const { state, expiredNotices } = await sweepExpiredReservations(current, cleanHolder);
    const holderCart = state.reservations.filter((c) => c.holderKey === cleanHolder);

    if (holderCart.length === 0) {
      return {
        ok: false,
        status: 400,
        message:
          expiredNotices.length > 0
            ? 'Your 10-minute reservation expired and stock was released. Please re-add available items.'
            : 'Your cart is empty.',
        state: buildClientState(state, cleanHolder),
        expiredNotices,
      };
    }

    const targetStoreId = holderCart[0].storeId;
    const targetPreference = holderCart[0].fulfilmentPreference;
    const store = state.stores.find((s) => s.id === targetStoreId);
    if (!store) {
      return {
        ok: false,
        status: 404,
        message: 'Fulfilment store could not be resolved.',
        state: buildClientState(state, cleanHolder),
        expiredNotices,
      };
    }

    // Re-check stock across ALL holders excluding this holder's own timed hold
    for (const cartItem of holderCart) {
      const inv = state.inventory.find(
        (r) => r.storeId === cartItem.storeId && r.productId === cartItem.productId
      );
      const prod = state.products.find((p) => p.id === cartItem.productId);
      const ownTimedUnits = cartItem.isTimedHold ? cartItem.quantity : 0;
      const availableForThisOrder = inv ? inv.sellableQty + ownTimedUnits : 0;
      if (!inv || availableForThisOrder < cartItem.quantity) {
        return {
          ok: false,
          status: 409,
          message: `Verified shelf stock changed for ${prod?.name || cartItem.productId} at ${store.name}. Only ${availableForThisOrder} unit(s) remain.`,
          state: buildClientState(state, cleanHolder),
          expiredNotices,
        };
      }
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const orderId = `ord-${nowMs}`;
    const orderNumber = `SYN-2026-${String(1003 + state.orders.length)}`;
    const customerId = input.customerId || cleanHolder;

    const orderItems = holderCart.map((c) => {
      const prod = state.products.find((p) => p.id === c.productId)!;
      return {
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        imageUrl: prod.imageUrl,
        unitPriceInr: prod.priceInr,
        quantity: c.quantity,
      };
    });

    const subtotalInr = orderItems.reduce(
      (sum, item) => sum + item.unitPriceInr * item.quantity,
      0
    );
    const deliveryFeeInr = store.deliveryFeeInr;
    const totalInr = subtotalInr + deliveryFeeInr;

    const newOrder: Order = {
      id: orderId,
      orderNumber,
      customerId,
      customerName: input.customerName.trim(),
      customerEmail: input.customerEmail.trim(),
      customerPhone: input.customerPhone.trim(),
      shippingAddress: input.shippingAddress.trim(),
      city: input.city.trim(),
      storeId: store.id,
      storeName: store.name,
      fulfilmentPreference: targetPreference,
      fulfilmentNote: `Assigned to ${store.name} via ${getPreferenceLabel(targetPreference)} (${store.fulfilmentHours}h readiness, ${store.distanceKm.toFixed(1)} km).`,
      status: 'PICK_PENDING',
      subtotalInr,
      deliveryFeeInr,
      totalInr,
      items: orderItems,
      timeline: [
        {
          id: `tl-${nowMs}-1`,
          status: 'CONFIRMED',
          title: 'Order Placed & Stock Locked',
          description: `Cart allocation converted into firm order reservation at ${store.name}.`,
          storeName: store.name,
          timestamp: nowIso,
        },
        {
          id: `tl-${nowMs}-2`,
          status: 'PICK_PENDING',
          title: 'Store Pick Task Dispatched',
          description: `Waiting for ${store.name} manager confirmation.`,
          storeName: store.name,
          timestamp: nowIso,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const createdTasks: PickTask[] = orderItems.map((item, index) => ({
      id: `task-${nowMs}-${index}`,
      orderId,
      orderNumber,
      customerId,
      storeId: store.id,
      storeName: store.name,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      status: 'PENDING',
      createdAt: nowIso,
      updatedAt: nowIso,
    }));

    const newMovements: InventoryMovement[] = [];
    const nextInventory = state.inventory.map((inv) => {
      if (inv.storeId !== store.id) return inv;
      const orderedLine = orderItems.find((i) => i.productId === inv.productId);
      if (!orderedLine) return inv;
      const heldLine = holderCart.find((c) => c.productId === inv.productId);
      const releaseHold = heldLine?.isTimedHold ? heldLine.quantity : 0;
      const nextCartHold = Math.max(0, (inv.cartHoldQty || 0) - releaseHold);
      const nextReserved = inv.reservedQty + orderedLine.quantity;
      const nextSellable = computeSellableStock(
        inv.verifiedQty,
        nextReserved,
        inv.safetyBuffer,
        nextCartHold
      );

      newMovements.push({
        id: `mov-${nowMs}-${inv.productId}`,
        movementType: 'ORDER_RESERVATION',
        storeId: store.id,
        storeName: store.name,
        productId: inv.productId,
        productName: orderedLine.productName,
        quantityDelta: -orderedLine.quantity,
        beforeVerifiedQty: inv.verifiedQty,
        afterVerifiedQty: inv.verifiedQty,
        beforeSellableQty: inv.sellableQty,
        afterSellableQty: nextSellable,
        referenceId: orderId,
        notes: `Order ${orderNumber} locked ${orderedLine.quantity} unit(s) for store pick.`,
        actorName: input.customerName.trim(),
        actorRole: 'CUSTOMER',
        createdAt: nowIso,
      });

      return {
        ...inv,
        cartHoldQty: nextCartHold,
        reservedQty: nextReserved,
        sellableQty: nextSellable,
        updatedAt: nowIso,
      };
    });

    const activity: NetworkActivity = {
      id: `act-${nowMs}`,
      actorUid: customerId,
      actorRole: 'CUSTOMER',
      actorName: input.customerName.trim(),
      eventType: 'ORDER_PLACED',
      storeId: store.id,
      summary: `Placed order ${orderNumber} (${orderItems.length} SKU) assigned to ${store.name}.`,
      createdAt: nowIso,
    };

    const nextState: PersistedServerState = bumpRevision({
      ...state,
      reservations: state.reservations.filter((c) => c.holderKey !== cleanHolder),
      inventory: nextInventory,
      orders: [newOrder, ...state.orders],
      pickTasks: [...createdTasks, ...state.pickTasks],
      inventoryMovements: [...newMovements, ...state.inventoryMovements].slice(0, 250),
      activityLogs: [activity, ...state.activityLogs].slice(0, 200),
    });
    await persistState(nextState);

    return {
      ok: true,
      status: 201,
      message: `Order ${orderNumber} placed and dispatched to ${store.name}.`,
      state: buildClientState(nextState, cleanHolder),
      expiredNotices,
      data: newOrder,
    };
  }, input.fallbackState, cleanHolder);
}

export async function verifyStoreInventory(input: {
  holderKey: string;
  storeId: string;
  productId: string;
  verifiedQty: number;
  discrepancyReason?: string;
  session: AuthSession;
  fallbackState?: CompactFallbackState;
}): Promise<NetworkApiResponse<StockVerification>> {
  return withStateLock(async (current) => {
    const { state } = await sweepExpiredReservations(current, input.holderKey);
    if (input.session.role === 'CUSTOMER') {
      return {
        ok: false,
        status: 403,
        message: 'Only store managers or network administrators can verify physical inventory.',
        state: buildClientState(state, input.holderKey),
      };
    }
    if (
      input.session.role === 'STORE_MANAGER' &&
      input.session.assignedStoreId &&
      input.session.assignedStoreId !== input.storeId
    ) {
      return {
        ok: false,
        status: 403,
        message: 'Managers can only verify inventory for their assigned branch.',
        state: buildClientState(state, input.holderKey),
      };
    }
    if (!Number.isInteger(input.verifiedQty) || input.verifiedQty < 0) {
      return {
        ok: false,
        status: 400,
        message: 'Physical count must be a non-negative whole number.',
        state: buildClientState(state, input.holderKey),
      };
    }

    const inv = state.inventory.find(
      (r) => r.storeId === input.storeId && r.productId === input.productId
    );
    const prod = state.products.find((p) => p.id === input.productId);
    const store = state.stores.find((s) => s.id === input.storeId);
    if (!inv || !prod || !store) {
      return {
        ok: false,
        status: 404,
        message: 'Inventory record not found.',
        state: buildClientState(state, input.holderKey),
      };
    }

    const discrepancyDelta = input.verifiedQty - inv.recordedQty;
    if (discrepancyDelta !== 0 && !input.discrepancyReason?.trim()) {
      return {
        ok: false,
        status: 400,
        message: 'Discrepancy reason is required when physical count differs from recorded stock.',
        state: buildClientState(state, input.holderKey),
      };
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const newSellableQty = computeSellableStock(
      input.verifiedQty,
      inv.reservedQty,
      inv.safetyBuffer,
      inv.cartHoldQty || 0
    );

    const verification: StockVerification = {
      id: `ver-${nowMs}`,
      storeId: input.storeId,
      productId: input.productId,
      productName: prod.name,
      recordedQty: inv.recordedQty,
      verifiedQty: input.verifiedQty,
      previousSellableQty: inv.sellableQty,
      newSellableQty,
      discrepancyDelta,
      discrepancyReason: input.discrepancyReason?.trim() || undefined,
      verifiedBy: input.session.displayName,
      verifiedByUid: input.session.uid,
      createdAt: nowIso,
    };

    const movement: InventoryMovement = {
      id: `mov-${nowMs}`,
      movementType: 'STOCK_VERIFICATION',
      storeId: store.id,
      storeName: store.name,
      productId: prod.id,
      productName: prod.name,
      quantityDelta: input.verifiedQty - inv.verifiedQty,
      beforeVerifiedQty: inv.verifiedQty,
      afterVerifiedQty: input.verifiedQty,
      beforeSellableQty: inv.sellableQty,
      afterSellableQty: newSellableQty,
      referenceId: verification.id,
      notes: input.discrepancyReason?.trim() || 'Physical cycle count verified on shelf.',
      actorName: input.session.displayName,
      actorRole: input.session.role,
      createdAt: nowIso,
    };

    const activity: NetworkActivity = {
      id: `act-${nowMs}`,
      actorUid: input.session.uid,
      actorRole: input.session.role,
      actorName: input.session.displayName,
      eventType: 'INVENTORY_CHANGED',
      storeId: input.storeId,
      summary: `Stock Whisperer verification at ${store.locality} for ${prod.name}: ${inv.recordedQty} recorded, ${input.verifiedQty} verified, ${newSellableQty} sellable.`,
      createdAt: nowIso,
    };

    const nextState: PersistedServerState = bumpRevision({
      ...state,
      inventory: state.inventory.map((r) =>
        r.id === inv.id
          ? {
              ...r,
              verifiedQty: input.verifiedQty,
              sellableQty: newSellableQty,
              lastVerifiedAt: nowIso,
              lastVerifiedBy: input.session.displayName,
              discrepancyReason: input.discrepancyReason?.trim() || undefined,
              updatedAt: nowIso,
            }
          : r
      ),
      verifications: [verification, ...state.verifications],
      inventoryMovements: [movement, ...state.inventoryMovements].slice(0, 250),
      activityLogs: [activity, ...state.activityLogs].slice(0, 200),
    });
    await persistState(nextState);

    return {
      ok: true,
      status: 200,
      message: 'Physical stock verification saved.',
      state: buildClientState(nextState, input.holderKey),
      data: verification,
    };
  }, input.fallbackState, input.holderKey);
}

export async function acceptStorePickTask(input: {
  holderKey: string;
  taskId: string;
  session: AuthSession;
  fallbackState?: CompactFallbackState;
}): Promise<NetworkApiResponse> {
  return withStateLock(async (current) => {
    const { state } = await sweepExpiredReservations(current, input.holderKey);
    const task = state.pickTasks.find((t) => t.id === input.taskId);
    if (!task) {
      return {
        ok: false,
        status: 404,
        message: 'Pick task not found.',
        state: buildClientState(state, input.holderKey),
      };
    }
    if (
      input.session.role === 'STORE_MANAGER' &&
      input.session.assignedStoreId &&
      input.session.assignedStoreId !== task.storeId
    ) {
      return {
        ok: false,
        status: 403,
        message: 'Managers can only operate on their assigned store.',
        state: buildClientState(state, input.holderKey),
      };
    }
    if (task.status !== 'PENDING') {
      return {
        ok: false,
        status: 409,
        message: 'Only pending pick tasks can be accepted.',
        state: buildClientState(state, input.holderKey),
      };
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const activity: NetworkActivity = {
      id: `act-${nowMs}`,
      actorUid: input.session.uid,
      actorRole: input.session.role,
      actorName: input.session.displayName,
      eventType: 'PICK_ACCEPTED',
      storeId: task.storeId,
      summary: `Accepted pick task for ${task.orderNumber} (${task.productName} x${task.quantity}) at ${task.storeName}.`,
      createdAt: nowIso,
    };

    const nextState: PersistedServerState = bumpRevision({
      ...state,
      pickTasks: state.pickTasks.map((t) =>
        t.id === task.id ? { ...t, status: 'ACCEPTED', updatedAt: nowIso } : t
      ),
      orders: state.orders.map((o) =>
        o.id === task.orderId
          ? {
              ...o,
              status: 'READY_FOR_DISPATCH',
              updatedAt: nowIso,
              timeline: [
                ...o.timeline,
                {
                  id: `tl-${nowMs}`,
                  status: 'READY_FOR_DISPATCH',
                  title: 'Pick Confirmed by Store Manager',
                  description: `${task.quantity} unit(s) verified and staged for dispatch at ${task.storeName}.`,
                  storeName: task.storeName,
                  timestamp: nowIso,
                },
              ],
            }
          : o
      ),
      activityLogs: [activity, ...state.activityLogs].slice(0, 200),
    });
    await persistState(nextState);

    return {
      ok: true,
      status: 200,
      message: `Pick task accepted for ${task.orderNumber}.`,
      state: buildClientState(nextState, input.holderKey),
    };
  }, input.fallbackState, input.holderKey);
}

export async function rejectAndReassignPickTask(input: {
  holderKey: string;
  taskId: string;
  reason: string;
  session: AuthSession;
  fallbackState?: CompactFallbackState;
}): Promise<NetworkApiResponse<{ reassignedStoreName?: string; exception: boolean }>> {
  return withStateLock(async (current) => {
    const { state } = await sweepExpiredReservations(current, input.holderKey);
    if (!input.reason.trim()) {
      return {
        ok: false,
        status: 400,
        message: 'A rejection reason is mandatory.',
        state: buildClientState(state, input.holderKey),
      };
    }

    const task = state.pickTasks.find((t) => t.id === input.taskId);
    if (!task) {
      return {
        ok: false,
        status: 404,
        message: 'Pick task not found.',
        state: buildClientState(state, input.holderKey),
      };
    }
    if (
      input.session.role === 'STORE_MANAGER' &&
      input.session.assignedStoreId &&
      input.session.assignedStoreId !== task.storeId
    ) {
      return {
        ok: false,
        status: 403,
        message: 'Managers can only operate on their assigned store.',
        state: buildClientState(state, input.holderKey),
      };
    }
    if (task.status !== 'PENDING') {
      return {
        ok: false,
        status: 409,
        message: 'Only pending pick tasks can be rejected.',
        state: buildClientState(state, input.holderKey),
      };
    }

    const product = state.products.find((p) => p.id === task.productId);
    const order = state.orders.find((o) => o.id === task.orderId);
    if (!product || !order) {
      return {
        ok: false,
        status: 404,
        message: 'Associated order or product not found.',
        state: buildClientState(state, input.holderKey),
      };
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const cleanReason = input.reason.trim();

    const candidateStores = state.stores.filter((s) => s.id !== task.storeId);
    const rankedAlternatives = rankFulfilmentOptions(
      product,
      candidateStores,
      state.inventory,
      order.fulfilmentPreference,
      task.quantity
    );
    const chosenAlt = rankedAlternatives[0] || null;
    const movementsToAdd: InventoryMovement[] = [];

    const origInv = state.inventory.find(
      (i) => i.storeId === task.storeId && i.productId === task.productId
    );
    if (origInv) {
      const nextOrigReserved = Math.max(0, origInv.reservedQty - task.quantity);
      const nextOrigSellable = computeSellableStock(
        origInv.verifiedQty,
        nextOrigReserved,
        origInv.safetyBuffer,
        origInv.cartHoldQty || 0
      );
      movementsToAdd.push({
        id: `mov-${nowMs}-rel`,
        movementType: 'PICK_RELEASE',
        storeId: task.storeId,
        storeName: task.storeName,
        productId: task.productId,
        productName: task.productName,
        quantityDelta: task.quantity,
        beforeVerifiedQty: origInv.verifiedQty,
        afterVerifiedQty: origInv.verifiedQty,
        beforeSellableQty: origInv.sellableQty,
        afterSellableQty: nextOrigSellable,
        referenceId: task.id,
        notes: `Released reservation at ${task.storeName} after pick rejection (${cleanReason}).`,
        actorName: input.session.displayName,
        actorRole: input.session.role,
        createdAt: nowIso,
      });
    }

    if (chosenAlt) {
      const altStore = chosenAlt.store;
      const altInv = chosenAlt.inventory;
      const nextAltReserved = altInv.reservedQty + task.quantity;
      const nextAltSellable = computeSellableStock(
        altInv.verifiedQty,
        nextAltReserved,
        altInv.safetyBuffer,
        altInv.cartHoldQty || 0
      );

      movementsToAdd.unshift({
        id: `mov-${nowMs}-rea`,
        movementType: 'PICK_REASSIGN_RESERVE',
        storeId: altStore.id,
        storeName: altStore.name,
        productId: task.productId,
        productName: task.productName,
        quantityDelta: -task.quantity,
        beforeVerifiedQty: altInv.verifiedQty,
        afterVerifiedQty: altInv.verifiedQty,
        beforeSellableQty: altInv.sellableQty,
        afterSellableQty: nextAltSellable,
        referenceId: order.id,
        notes: `Adaptive Fulfilment locked ${task.quantity} unit(s) at ${altStore.name} replacing ${task.storeName}.`,
        actorName: input.session.displayName,
        actorRole: input.session.role,
        createdAt: nowIso,
      });

      const newTask: PickTask = {
        id: `task-${nowMs}-reassigned`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        storeId: altStore.id,
        storeName: altStore.name,
        productId: task.productId,
        productName: task.productName,
        quantity: task.quantity,
        status: 'PENDING',
        reassignedFromStoreId: task.storeId,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const rejectActivity: NetworkActivity = {
        id: `act-${nowMs}-rej`,
        actorUid: input.session.uid,
        actorRole: input.session.role,
        actorName: input.session.displayName,
        eventType: 'PICK_REJECTED',
        storeId: task.storeId,
        summary: `Rejected pick task for ${order.orderNumber} at ${task.storeName} (${cleanReason}).`,
        createdAt: nowIso,
      };

      const reassignActivity: NetworkActivity = {
        id: `act-${nowMs}-rea`,
        actorUid: input.session.uid,
        actorRole: input.session.role,
        actorName: input.session.displayName,
        eventType: 'ORDER_REASSIGNED',
        storeId: altStore.id,
        summary: `Adaptive Fulfilment reassigned ${order.orderNumber} to ${altStore.name} (${altStore.fulfilmentHours}h readiness).`,
        createdAt: nowIso,
      };

      const nextInventory = state.inventory.map((inv) => {
        if (inv.storeId === task.storeId && inv.productId === task.productId) {
          const nextReserved = Math.max(0, inv.reservedQty - task.quantity);
          return {
            ...inv,
            reservedQty: nextReserved,
            sellableQty: computeSellableStock(
              inv.verifiedQty,
              nextReserved,
              inv.safetyBuffer,
              inv.cartHoldQty || 0
            ),
            updatedAt: nowIso,
          };
        }
        if (inv.storeId === altStore.id && inv.productId === task.productId) {
          const nextReserved = inv.reservedQty + task.quantity;
          return {
            ...inv,
            reservedQty: nextReserved,
            sellableQty: computeSellableStock(
              inv.verifiedQty,
              nextReserved,
              inv.safetyBuffer,
              inv.cartHoldQty || 0
            ),
            updatedAt: nowIso,
          };
        }
        return inv;
      });

      const nextState: PersistedServerState = bumpRevision({
        ...state,
        inventory: nextInventory,
        pickTasks: [
          newTask,
          ...state.pickTasks.map((t) =>
            t.id === task.id
              ? { ...t, status: 'REASSIGNED' as const, rejectionReason: cleanReason, updatedAt: nowIso }
              : t
          ),
        ],
        orders: state.orders.map((o) =>
          o.id === order.id
            ? {
                ...o,
                storeId: altStore.id,
                storeName: altStore.name,
                status: 'REASSIGNED',
                fulfilmentNote: `Reassigned from ${task.storeName} to ${altStore.name} after store pick rejection (${cleanReason}).`,
                updatedAt: nowIso,
                timeline: [
                  ...o.timeline,
                  {
                    id: `tl-${nowMs}-rej`,
                    status: 'REASSIGNED',
                    title: `Reassigned to ${altStore.name}`,
                    description: `${task.storeName} could not fulfil (${cleanReason}). Stock reserved at ${altStore.name} (${altStore.fulfilmentHours}h readiness).`,
                    storeName: altStore.name,
                    timestamp: nowIso,
                  },
                ],
              }
            : o
        ),
        inventoryMovements: [...movementsToAdd, ...state.inventoryMovements].slice(0, 250),
        activityLogs: [reassignActivity, rejectActivity, ...state.activityLogs].slice(0, 200),
      });
      await persistState(nextState);

      return {
        ok: true,
        status: 200,
        message: `Pick rejected. Reservation released and order reassigned to ${altStore.name}.`,
        state: buildClientState(nextState, input.holderKey),
        data: { reassignedStoreName: altStore.name, exception: false },
      };
    }

    const exceptionActivity: NetworkActivity = {
      id: `act-${nowMs}-exc`,
      actorUid: input.session.uid,
      actorRole: input.session.role,
      actorName: input.session.displayName,
      eventType: 'FULFILMENT_EXCEPTION',
      storeId: task.storeId,
      summary: `Fulfilment exception on ${order.orderNumber}: rejected at ${task.storeName} (${cleanReason}), no eligible alternative store found.`,
      createdAt: nowIso,
    };

    const nextInventory = state.inventory.map((inv) => {
      if (inv.storeId === task.storeId && inv.productId === task.productId) {
        const nextReserved = Math.max(0, inv.reservedQty - task.quantity);
        return {
          ...inv,
          reservedQty: nextReserved,
          sellableQty: computeSellableStock(
            inv.verifiedQty,
            nextReserved,
            inv.safetyBuffer,
            inv.cartHoldQty || 0
          ),
          updatedAt: nowIso,
        };
      }
      return inv;
    });

    const nextState: PersistedServerState = bumpRevision({
      ...state,
      inventory: nextInventory,
      pickTasks: state.pickTasks.map((t) =>
        t.id === task.id
          ? { ...t, status: 'EXCEPTION' as const, rejectionReason: cleanReason, updatedAt: nowIso }
          : t
      ),
      orders: state.orders.map((o) =>
        o.id === order.id
          ? {
              ...o,
              status: 'EXCEPTION',
              fulfilmentNote: `Fulfilment paused: ${task.storeName} rejected pick (${cleanReason}) and no alternate store had sufficient sellable stock.`,
              updatedAt: nowIso,
              timeline: [
                ...o.timeline,
                {
                  id: `tl-${nowMs}-exc`,
                  status: 'EXCEPTION',
                  title: 'Fulfilment Exception — Network Action Required',
                  description: `${task.storeName} could not fulfil (${cleanReason}). No alternative store has sufficient sellable stock.`,
                  storeName: task.storeName,
                  timestamp: nowIso,
                },
              ],
            }
          : o
      ),
      inventoryMovements: [...movementsToAdd, ...state.inventoryMovements].slice(0, 250),
      activityLogs: [exceptionActivity, ...state.activityLogs].slice(0, 200),
    });
    await persistState(nextState);

    return {
      ok: true,
      status: 200,
      message: 'Pick rejected. No alternate store qualified; order moved to Fulfilment Exception.',
      state: buildClientState(nextState, input.holderKey),
      data: { exception: true },
    };
  }, input.fallbackState, input.holderKey);
}

export async function recordNetworkDemandSignal(input: {
  holderKey: string;
  query: string;
  inferredCategory: string;
  inferredProductId?: string;
  locality: string;
  outcome: DemandSignalOutcome;
  signalSource?: DemandSignalSource;
  registerInterestProductId?: string;
  session: AuthSession | null;
  fallbackState?: CompactFallbackState;
}): Promise<NetworkApiResponse> {
  return withStateLock(async (current) => {
    const { state } = await sweepExpiredReservations(current, input.holderKey);
    const cleanQuery = input.query.trim();
    if (!cleanQuery) {
      return {
        ok: true,
        status: 200,
        message: 'Empty signal ignored.',
        state: buildClientState(state, input.holderKey),
      };
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const userId = input.session?.uid || input.holderKey || 'demo-customer-1';

    const recentDuplicate = state.demandSignals.find(
      (s) =>
        s.query.toLowerCase() === cleanQuery.toLowerCase() &&
        s.outcome === input.outcome &&
        nowMs - new Date(s.createdAt).getTime() < 20000
    );

    const registeredInterests =
      input.registerInterestProductId &&
      !state.registeredInterests.includes(input.registerInterestProductId)
        ? [...state.registeredInterests, input.registerInterestProductId]
        : state.registeredInterests;

    if (recentDuplicate) {
      const updated = bumpRevision({ ...state, registeredInterests });
      await persistState(updated);
      return {
        ok: true,
        status: 200,
        message: 'Interest recorded.',
        state: buildClientState(updated, input.holderKey),
      };
    }

    const signal: DemandSignal = {
      id: `sig-${nowMs}-${Math.random().toString(36).slice(2, 5)}`,
      userId,
      query: cleanQuery,
      inferredCategory: input.inferredCategory,
      inferredProductId: input.inferredProductId,
      locality: input.locality,
      outcome: input.outcome,
      signalSource: input.signalSource || 'TEXT_SEARCH',
      createdAt: nowIso,
    };

    const activity: NetworkActivity = {
      id: `act-${nowMs}`,
      actorUid: userId,
      actorRole: input.session?.role || 'CUSTOMER',
      actorName: input.session?.displayName || 'Customer',
      eventType: 'DEMAND_SIGNAL_RECORDED',
      summary: `Demand Radar captured "${cleanQuery}" (${input.outcome} · ${signal.signalSource}) in ${input.locality}.`,
      createdAt: nowIso,
    };

    const nextState: PersistedServerState = bumpRevision({
      ...state,
      registeredInterests,
      demandSignals: [signal, ...state.demandSignals].slice(0, 200),
      activityLogs: [activity, ...state.activityLogs].slice(0, 200),
    });
    await persistState(nextState);

    return {
      ok: true,
      status: 201,
      message: 'Demand signal recorded.',
      state: buildClientState(nextState, input.holderKey),
    };
  }, input.fallbackState, input.holderKey);
}

export async function createTransferRequest(input: {
  holderKey: string;
  sourceStoreId: string;
  destinationStoreId: string;
  productId: string;
  recommendedQty: number;
  reason: string;
  demandSignalCount: number;
  requestedBy?: string;
  requestedByRole?: UserRole;
  actorUid?: string;
  fallbackState?: CompactFallbackState;
}): Promise<NetworkApiResponse<TransferRecommendation>> {
  return withStateLock(async (current) => {
    const { state } = await sweepExpiredReservations(current, input.holderKey);

    if (input.sourceStoreId === input.destinationStoreId) {
      return {
        ok: false,
        status: 400,
        message: 'Source branch and destination branch must be different.',
        state: buildClientState(state, input.holderKey),
      };
    }
    if (!Number.isInteger(input.recommendedQty) || input.recommendedQty < 1) {
      return {
        ok: false,
        status: 400,
        message: 'Transfer quantity must be at least 1 unit.',
        state: buildClientState(state, input.holderKey),
      };
    }

    const sourceStore = state.stores.find((s) => s.id === input.sourceStoreId);
    const destStore = state.stores.find((s) => s.id === input.destinationStoreId);
    const product = state.products.find((p) => p.id === input.productId);
    const srcInv = state.inventory.find(
      (i) => i.storeId === input.sourceStoreId && i.productId === input.productId
    );
    const destInv = state.inventory.find(
      (i) => i.storeId === input.destinationStoreId && i.productId === input.productId
    );

    if (!sourceStore || !destStore || !product || !srcInv || !destInv) {
      return {
        ok: false,
        status: 404,
        message: 'Unable to resolve store or product for transfer queue.',
        state: buildClientState(state, input.holderKey),
      };
    }
    if (srcInv.sellableQty < 1) {
      return {
        ok: false,
        status: 409,
        message: `${sourceStore.name} currently has 0 sellable units of ${product.name} available to transfer.`,
        state: buildClientState(state, input.holderKey),
      };
    }

    const duplicatePending = state.transferRecommendations.find(
      (r) =>
        r.status === 'PENDING' &&
        r.sourceStoreId === input.sourceStoreId &&
        r.destinationStoreId === input.destinationStoreId &&
        r.productId === input.productId
    );
    if (duplicatePending) {
      return {
        ok: true,
        status: 200,
        message: `Pending transfer request already exists for ${product.name} (${sourceStore.locality} → ${destStore.locality}).`,
        state: buildClientState(state, input.holderKey),
        data: duplicatePending,
      };
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const clampedQty = Math.min(input.recommendedQty, srcInv.sellableQty);
    const actorName = input.requestedBy?.trim() || 'Network Operations';
    const actorRole = input.requestedByRole || 'NETWORK_ADMIN';

    const newRec: TransferRecommendation = {
      id: `tr-rec-${nowMs}`,
      sourceStoreId: sourceStore.id,
      sourceStoreName: sourceStore.name,
      destinationStoreId: destStore.id,
      destinationStoreName: destStore.name,
      productId: product.id,
      productName: product.name,
      recommendedQty: clampedQty,
      reason:
        input.reason.trim() ||
        `Inter-branch transfer requested from ${sourceStore.locality} to ${destStore.locality}.`,
      sourceSellableQty: srcInv.sellableQty,
      destinationSellableQty: destInv.sellableQty,
      demandSignalCount: input.demandSignalCount,
      status: 'PENDING',
      requestedBy: actorName,
      requestedByRole: actorRole,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const activity: NetworkActivity = {
      id: `act-${nowMs}-trreq`,
      actorUid: input.actorUid || 'network-ops',
      actorRole,
      actorName,
      eventType: 'TRANSFER_REQUESTED',
      storeId: destStore.id,
      summary: `${actorName} requested transfer of ${clampedQty}x ${product.name} (${sourceStore.locality} → ${destStore.locality}).`,
      createdAt: nowIso,
    };

    const nextState: PersistedServerState = bumpRevision({
      ...state,
      transferRecommendations: [newRec, ...state.transferRecommendations],
      activityLogs: [activity, ...state.activityLogs].slice(0, 200),
    });
    await persistState(nextState);

    return {
      ok: true,
      status: 201,
      message: `Transfer request submitted (${newRec.recommendedQty}x ${product.name}: ${sourceStore.locality} → ${destStore.locality}) for Network Admin approval.`,
      state: buildClientState(nextState, input.holderKey),
      data: newRec,
    };
  }, input.fallbackState, input.holderKey);
}

export async function decideTransferRequest(input: {
  holderKey: string;
  recommendationId: string;
  decision: 'APPROVED' | 'REJECTED';
  notes: string;
  session: AuthSession;
  fallbackState?: CompactFallbackState;
}): Promise<
  NetworkApiResponse<{
    recommendation: TransferRecommendation;
    decision: TransferDecision;
    movements: InventoryMovement[];
  }>
> {
  return withStateLock(async (current) => {
    const { state } = await sweepExpiredReservations(current, input.holderKey);

    if (input.session.role !== 'NETWORK_ADMIN') {
      return {
        ok: false,
        status: 403,
        message: 'Only Network Administrators can approve or reject stock transfers.',
        state: buildClientState(state, input.holderKey),
      };
    }

    const rec = state.transferRecommendations.find((r) => r.id === input.recommendationId);
    if (!rec) {
      return {
        ok: false,
        status: 404,
        message: 'Transfer recommendation not found.',
        state: buildClientState(state, input.holderKey),
      };
    }
    if (rec.status !== 'PENDING') {
      return {
        ok: false,
        status: 409,
        message: 'Transfer recommendation was already processed.',
        state: buildClientState(state, input.holderKey),
      };
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (input.decision === 'REJECTED') {
      const decisionRecord: TransferDecision = {
        id: `tdec-${nowMs}`,
        recommendationId: rec.id,
        sourceStoreId: rec.sourceStoreId,
        sourceStoreName: rec.sourceStoreName,
        destinationStoreId: rec.destinationStoreId,
        destinationStoreName: rec.destinationStoreName,
        productId: rec.productId,
        productName: rec.productName,
        quantity: rec.recommendedQty,
        decision: 'REJECTED',
        notes: input.notes.trim() || 'Declined by Network Administrator.',
        decidedBy: input.session.displayName,
        createdAt: nowIso,
      };
      const updatedRec: TransferRecommendation = { ...rec, status: 'REJECTED', updatedAt: nowIso };
      const activity: NetworkActivity = {
        id: `act-${nowMs}`,
        actorUid: input.session.uid,
        actorRole: input.session.role,
        actorName: input.session.displayName,
        eventType: 'TRANSFER_REJECTED',
        storeId: rec.destinationStoreId,
        summary: `Rejected transfer recommendation for ${rec.productName} (${rec.sourceStoreName} -> ${rec.destinationStoreName}).`,
        createdAt: nowIso,
      };

      const nextState: PersistedServerState = bumpRevision({
        ...state,
        transferRecommendations: state.transferRecommendations.map((r) =>
          r.id === rec.id ? updatedRec : r
        ),
        transferDecisions: [decisionRecord, ...state.transferDecisions],
        activityLogs: [activity, ...state.activityLogs].slice(0, 200),
      });
      await persistState(nextState);

      return {
        ok: true,
        status: 200,
        message: 'Transfer recommendation rejected and logged.',
        state: buildClientState(nextState, input.holderKey),
        data: { recommendation: updatedRec, decision: decisionRecord, movements: [] },
      };
    }

    const srcInv = state.inventory.find(
      (i) => i.storeId === rec.sourceStoreId && i.productId === rec.productId
    );
    const dstInv = state.inventory.find(
      (i) => i.storeId === rec.destinationStoreId && i.productId === rec.productId
    );

    if (!srcInv || !dstInv || srcInv.sellableQty < rec.recommendedQty) {
      return {
        ok: false,
        status: 409,
        message: `Insufficient sellable stock at ${rec.sourceStoreName} (${srcInv?.sellableQty ?? 0} available).`,
        state: buildClientState(state, input.holderKey),
      };
    }

    const decisionRecord: TransferDecision = {
      id: `tdec-${nowMs}`,
      recommendationId: rec.id,
      sourceStoreId: rec.sourceStoreId,
      sourceStoreName: rec.sourceStoreName,
      destinationStoreId: rec.destinationStoreId,
      destinationStoreName: rec.destinationStoreName,
      productId: rec.productId,
      productName: rec.productName,
      quantity: rec.recommendedQty,
      decision: 'APPROVED',
      notes: input.notes.trim() || 'Approved for inter-store rebalancing.',
      decidedBy: input.session.displayName,
      createdAt: nowIso,
    };

    const srcNextRecorded = Math.max(0, srcInv.recordedQty - rec.recommendedQty);
    const srcNextVerified = Math.max(0, srcInv.verifiedQty - rec.recommendedQty);
    const srcNextSellable = computeSellableStock(
      srcNextVerified,
      srcInv.reservedQty,
      srcInv.safetyBuffer,
      srcInv.cartHoldQty || 0
    );

    const dstNextRecorded = dstInv.recordedQty + rec.recommendedQty;
    const dstNextVerified = dstInv.verifiedQty + rec.recommendedQty;
    const dstNextSellable = computeSellableStock(
      dstNextVerified,
      dstInv.reservedQty,
      dstInv.safetyBuffer,
      dstInv.cartHoldQty || 0
    );

    const outMovement: InventoryMovement = {
      id: `mov-${nowMs}-out`,
      movementType: 'TRANSFER_OUT',
      storeId: rec.sourceStoreId,
      storeName: rec.sourceStoreName,
      productId: rec.productId,
      productName: rec.productName,
      quantityDelta: -rec.recommendedQty,
      beforeVerifiedQty: srcInv.verifiedQty,
      afterVerifiedQty: srcNextVerified,
      beforeSellableQty: srcInv.sellableQty,
      afterSellableQty: srcNextSellable,
      referenceId: decisionRecord.id,
      notes: `Dispatched ${rec.recommendedQty} unit(s) to ${rec.destinationStoreName}. ${decisionRecord.notes}`,
      actorName: input.session.displayName,
      actorRole: input.session.role,
      createdAt: nowIso,
    };

    const inMovement: InventoryMovement = {
      id: `mov-${nowMs}-in`,
      movementType: 'TRANSFER_IN',
      storeId: rec.destinationStoreId,
      storeName: rec.destinationStoreName,
      productId: rec.productId,
      productName: rec.productName,
      quantityDelta: rec.recommendedQty,
      beforeVerifiedQty: dstInv.verifiedQty,
      afterVerifiedQty: dstNextVerified,
      beforeSellableQty: dstInv.sellableQty,
      afterSellableQty: dstNextSellable,
      referenceId: decisionRecord.id,
      notes: `Received ${rec.recommendedQty} unit(s) from ${rec.sourceStoreName}. ${decisionRecord.notes}`,
      actorName: input.session.displayName,
      actorRole: input.session.role,
      createdAt: nowIso,
    };

    const updatedRec: TransferRecommendation = { ...rec, status: 'APPROVED', updatedAt: nowIso };
    const activity: NetworkActivity = {
      id: `act-${nowMs}`,
      actorUid: input.session.uid,
      actorRole: input.session.role,
      actorName: input.session.displayName,
      eventType: 'TRANSFER_APPROVED',
      storeId: rec.destinationStoreId,
      summary: `Approved transfer of ${rec.recommendedQty}x ${rec.productName} from ${rec.sourceStoreName} to ${rec.destinationStoreName}.`,
      createdAt: nowIso,
    };

    const nextState: PersistedServerState = bumpRevision({
      ...state,
      inventory: state.inventory.map((inv) => {
        if (inv.storeId === rec.sourceStoreId && inv.productId === rec.productId) {
          return {
            ...inv,
            recordedQty: srcNextRecorded,
            verifiedQty: srcNextVerified,
            sellableQty: srcNextSellable,
            updatedAt: nowIso,
          };
        }
        if (inv.storeId === rec.destinationStoreId && inv.productId === rec.productId) {
          return {
            ...inv,
            recordedQty: dstNextRecorded,
            verifiedQty: dstNextVerified,
            sellableQty: dstNextSellable,
            lastVerifiedAt: nowIso,
            lastVerifiedBy: `Transfer from ${rec.sourceStoreName}`,
            updatedAt: nowIso,
          };
        }
        return inv;
      }),
      transferRecommendations: state.transferRecommendations.map((r) =>
        r.id === rec.id ? updatedRec : r
      ),
      transferDecisions: [decisionRecord, ...state.transferDecisions],
      inventoryMovements: [inMovement, outMovement, ...state.inventoryMovements].slice(0, 250),
      activityLogs: [activity, ...state.activityLogs].slice(0, 200),
    });
    await persistState(nextState);

    return {
      ok: true,
      status: 200,
      message: `Approved transfer of ${rec.recommendedQty} units to ${rec.destinationStoreName} and recorded stock movement.`,
      state: buildClientState(nextState, input.holderKey),
      data: {
        recommendation: updatedRec,
        decision: decisionRecord,
        movements: [outMovement, inMovement],
      },
    };
  }, input.fallbackState, input.holderKey);
}

export async function resetNetworkServerState(holderKey: string): Promise<NetworkApiResponse> {
  return withStateLock(async () => {
    const fresh = toPersistedState(createSeededNetworkState(), true);
    await persistState(fresh);
    return {
      ok: true,
      status: 200,
      message: 'Network data reset to baseline four-store state.',
      state: buildClientState(fresh, holderKey),
    };
  });
}
