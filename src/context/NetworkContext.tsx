import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  syncDemandSignalToFirestore,
  syncInventoryMovementsToFirestore,
  syncOrderAndTaskToFirestore,
  syncTransferDecisionToFirestore,
  syncVerificationToFirestore,
} from '../services/firestoreSync';
import { computeSellableStock } from '../services/fulfilmentService';
import {
  loadNetworkState,
  normalizeAndSweepNetworkState,
  resetNetworkState,
  saveNetworkState,
} from '../services/networkRepository';
import { generateDynamicTransferRecommendations } from '../services/transferRecommendationEngine';
import type {
  AuthSession,
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
} from '../types';

const GUEST_HOLDER_KEY_STORAGE = 'synapse_holder_key_v1';

interface CheckoutPayload {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  city: string;
  session: AuthSession | null;
}

export interface ActionResult<T = undefined> {
  ok: boolean;
  message: string;
  data?: T;
}

interface ServerApiPayload<T = unknown> {
  ok: boolean;
  status: number;
  message: string;
  state: NetworkState;
  expiredNotices?: string[];
  data?: T;
}

interface NetworkContextValue {
  state: NetworkState;
  holderKey: string;
  expiredCartNotice: string | null;
  dismissExpiredNotice: () => void;
  refreshState: () => Promise<void>;
  addToCart: (
    productId: string,
    storeId: string,
    preference: FulfilmentPreference,
    qty?: number
  ) => Promise<ActionResult>;
  updateCartQuantity: (cartItemId: string, quantity: number) => Promise<ActionResult>;
  removeFromCart: (cartItemId: string) => Promise<ActionResult>;
  placeDemoOrder: (payload: CheckoutPayload) => Promise<ActionResult<Order>>;
  submitStockVerification: (input: {
    storeId: string;
    productId: string;
    verifiedQty: number;
    discrepancyReason?: string;
    session: AuthSession;
  }) => Promise<ActionResult<StockVerification>>;
  acceptPickTask: (taskId: string, session: AuthSession) => Promise<ActionResult>;
  rejectPickTask: (
    taskId: string,
    reason: string,
    session: AuthSession
  ) => Promise<
    ActionResult<{
      reassignedStoreName?: string;
      exception: boolean;
    }>
  >;
  recordDemandSignal: (input: {
    query: string;
    inferredCategory: string;
    inferredProductId?: string;
    locality: string;
    outcome: DemandSignalOutcome;
    signalSource?: DemandSignalSource;
    session: AuthSession | null;
  }) => Promise<void>;
  registerProductInterest: (
    productId: string,
    productName: string,
    locality: string,
    session: AuthSession | null
  ) => Promise<void>;
  createTransferRecommendation: (input: {
    sourceStoreId: string;
    destinationStoreId: string;
    productId: string;
    recommendedQty: number;
    reason: string;
    demandSignalCount: number;
    requestedBy?: string;
    requestedByRole?: AuthSession['role'];
    actorUid?: string;
  }) => Promise<ActionResult<TransferRecommendation>>;
  approveTransfer: (
    recommendationId: string,
    notes: string,
    session: AuthSession
  ) => Promise<ActionResult>;
  rejectTransfer: (
    recommendationId: string,
    notes: string,
    session: AuthSession
  ) => Promise<ActionResult>;
  resetDemoData: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextValue | undefined>(undefined);

function getOrCreateGuestHolderKey(): string {
  try {
    const existing = localStorage.getItem(GUEST_HOLDER_KEY_STORAGE);
    if (existing && existing.trim()) return existing;
    const created = `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem(GUEST_HOLDER_KEY_STORAGE, created);
    return created;
  } catch {
    return 'guest-browser';
  }
}

function enrichWithDynamicSuggestions(raw: NetworkState): NetworkState {
  const normalized = normalizeAndSweepNetworkState(raw);
  const dynamicSuggestions =
    raw.dynamicSuggestions && raw.dynamicSuggestions.length >= 0
      ? raw.dynamicSuggestions
      : generateDynamicTransferRecommendations({
          stores: normalized.stores,
          products: normalized.products,
          inventory: normalized.inventory,
          demandSignals: normalized.demandSignals,
          orders: normalized.orders,
          transferRecommendations: normalized.transferRecommendations,
        });
  return {
    ...normalized,
    dynamicSuggestions,
  };
}

function buildCompactFallback(s: NetworkState) {
  return {
    epochId: s.epochId,
    revision: s.revision,
    inventory: s.inventory,
    cart: s.cart,
    orders: s.orders,
    pickTasks: s.pickTasks,
    verifications: s.verifications,
    demandSignals: s.demandSignals,
    transferRecommendations: s.transferRecommendations,
    transferDecisions: s.transferDecisions,
    inventoryMovements: s.inventoryMovements,
    activityLogs: s.activityLogs,
    registeredInterests: s.registeredInterests,
  };
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [guestKey] = useState<string>(() => getOrCreateGuestHolderKey());
  const holderKey = useMemo(() => session?.uid || guestKey, [session?.uid, guestKey]);

  const [state, setState] = useState<NetworkState>(() => enrichWithDynamicSuggestions(loadNetworkState()));
  const stateRef = useRef<NetworkState>(state);
  stateRef.current = state;

  const [expiredCartNotice, setExpiredCartNotice] = useState<string | null>(null);
  const lastSyncRef = useRef<number>(0);

  const dismissExpiredNotice = useCallback(() => setExpiredCartNotice(null), []);

  const applyServerState = useCallback(
    (nextRaw: NetworkState, expiredNotices?: string[]) => {
      const enriched = enrichWithDynamicSuggestions(nextRaw);
      stateRef.current = enriched;
      setState(enriched);
      saveNetworkState(enriched);
      if (expiredNotices && expiredNotices.length > 0) {
        setExpiredCartNotice(expiredNotices.join(' '));
      }
      return enriched;
    },
    []
  );

  const refreshState = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/network/state?holderKey=${encodeURIComponent(holderKey)}`,
        { cache: 'no-store' }
      );
      if (!response.ok) return;
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return;
      const payload = (await response.json()) as ServerApiPayload;
      if (!payload?.state) return;

      const serverState = payload.state;
      const local = stateRef.current;
      const localRev = local.revision || 1;
      const serverRev = serverState.revision || 1;

      const hitColdOrStaleLambda =
        localRev > 1 &&
        Boolean(local.epochId) &&
        !serverState.explicitReset &&
        ((serverState.epochId === local.epochId && serverRev < localRev) ||
          (serverRev === 1 && serverState.epochId !== local.epochId));

      if (hitColdOrStaleLambda) {
        const hydrateRes = await fetch('/api/network/hydrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            holderKey,
            fallbackState: buildCompactFallback(local),
          }),
        });
        if (hydrateRes.ok) {
          const hydratedPayload = (await hydrateRes.json()) as ServerApiPayload;
          if (hydratedPayload?.state) {
            lastSyncRef.current = Date.now();
            applyServerState(hydratedPayload.state, hydratedPayload.expiredNotices);
          }
        }
        return;
      }

      lastSyncRef.current = Date.now();
      applyServerState(serverState, payload.expiredNotices);
    } catch {
      // Keep local state if transient network issue occurs
    }
  }, [holderKey, applyServerState]);

  const postNetworkApi = useCallback(
    async <T,>(endpoint: string, body: Record<string, unknown>): Promise<ServerApiPayload<T>> => {
      const includeFallback = endpoint !== '/api/network/reset';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          holderKey,
          ...(includeFallback ? { fallbackState: buildCompactFallback(stateRef.current) } : {}),
        }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Network API returned HTTP ${response.status} (non-JSON response).`);
      }
      const payload = (await response.json()) as ServerApiPayload<T>;
      if (payload?.state) {
        lastSyncRef.current = Date.now();
        applyServerState(payload.state, payload.expiredNotices);
      }
      return payload;
    },
    [holderKey, applyServerState]
  );

  // Initial hydration + polling + window focus sync across tabs and devices
  useEffect(() => {
    void refreshState();

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshState();
      }
    };

    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    const pollId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshState();
      }
    }, 5000);

    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      window.clearInterval(pollId);
    };
  }, [refreshState]);

  // Same-browser cross-tab synchronization via storage event
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'synapse_demo_network_state_v2' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as NetworkState;
          setState(enrichWithDynamicSuggestions(parsed));
        } catch {
          // Ignore malformed payload
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Automatic 1-second countdown watcher for fixed non-renewable 10-minute holds
  useEffect(() => {
    const hasTimedHolds = state.cart.some((c) => c.isTimedHold && c.expiresAt);
    if (!hasTimedHolds) return;

    const timer = window.setInterval(() => {
      const nowMs = Date.now();
      const expiredItems = state.cart.filter(
        (c) => c.isTimedHold && c.expiresAt && new Date(c.expiresAt).getTime() <= nowMs
      );
      if (expiredItems.length === 0) return;

      // Immediately release locally for snappy UX and trigger server sweep to record ledger + notify
      setState((prev) => {
        const stillExpired = prev.cart.filter(
          (c) => c.isTimedHold && c.expiresAt && new Date(c.expiresAt).getTime() <= nowMs
        );
        if (stillExpired.length === 0) return prev;

        const activeCart = prev.cart.filter(
          (c) => !c.isTimedHold || (c.expiresAt !== null && new Date(c.expiresAt).getTime() > nowMs)
        );
        const holdByKey = new Map<string, number>();
        for (const item of activeCart) {
          if (!item.isTimedHold) continue;
          const key = `${item.storeId}_${item.productId}`;
          holdByKey.set(key, (holdByKey.get(key) || 0) + item.quantity);
        }

        const nowIso = new Date(nowMs).toISOString();
        const nextInventory = prev.inventory.map((inv) => {
          const key = `${inv.storeId}_${inv.productId}`;
          const nextCartHold = holdByKey.get(key) || 0;
          if (nextCartHold === inv.cartHoldQty) return inv;
          return {
            ...inv,
            cartHoldQty: nextCartHold,
            sellableQty: computeSellableStock(
              inv.verifiedQty,
              inv.reservedQty,
              inv.safetyBuffer,
              nextCartHold
            ),
            updatedAt: nowIso,
          };
        });

        const releasedLabels = stillExpired
          .map((e) => {
            const prod = prev.products.find((p) => p.id === e.productId);
            return `${e.quantity}x ${prod?.name || e.productId}`;
          })
          .join(', ');

        const expiryActivity: NetworkActivity = {
          id: `act-${nowMs}-exp`,
          actorUid: 'system-hold-sweeper',
          actorRole: 'CUSTOMER',
          actorName: 'Reservation Expiry Sweeper',
          eventType: 'CART_HOLD_EXPIRED',
          storeId: stillExpired[0].storeId,
          summary: `Released expired non-renewable 10m cart reservation (${releasedLabels}) back to sellable store stock.`,
          createdAt: nowIso,
        };

        const nextState = enrichWithDynamicSuggestions({
          ...prev,
          cart: activeCart,
          inventory: nextInventory,
          activityLogs: [expiryActivity, ...prev.activityLogs],
        });
        saveNetworkState(nextState);
        setExpiredCartNotice(
          `Your fixed 10-minute reservation expired and released ${releasedLabels} back to sellable store stock.`
        );
        return nextState;
      });

      void refreshState();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [state.cart, refreshState]);

  const addToCart = useCallback(
    async (
      productId: string,
      storeId: string,
      preference: FulfilmentPreference,
      qty = 1
    ): Promise<ActionResult> => {
      try {
        setExpiredCartNotice(null);
        const payload = await postNetworkApi('/api/network/cart/reserve', {
          productId,
          storeId,
          preference,
          qty,
          actorName: session?.displayName || 'Customer',
        });
        return { ok: payload.ok, message: payload.message };
      } catch {
        return { ok: false, message: 'Unable to reserve stock right now. Please try again.' };
      }
    },
    [postNetworkApi, session?.displayName]
  );

  const updateCartQuantity = useCallback(
    async (cartItemId: string, quantity: number): Promise<ActionResult> => {
      try {
        const payload = await postNetworkApi('/api/network/cart/quantity', {
          cartItemId,
          quantity,
          actorName: session?.displayName || 'Customer',
        });
        return { ok: payload.ok, message: payload.message };
      } catch {
        return { ok: false, message: 'Unable to update cart reservation. Please try again.' };
      }
    },
    [postNetworkApi, session?.displayName]
  );

  const removeFromCart = useCallback(
    async (cartItemId: string): Promise<ActionResult> => {
      return updateCartQuantity(cartItemId, 0);
    },
    [updateCartQuantity]
  );

  const placeDemoOrder = useCallback(
    async (payload: CheckoutPayload): Promise<ActionResult<Order>> => {
      try {
        const res = await postNetworkApi<Order>('/api/network/orders', {
          customerId: payload.session?.uid || holderKey,
          customerName: payload.customerName,
          customerEmail: payload.customerEmail,
          customerPhone: payload.customerPhone,
          shippingAddress: payload.shippingAddress,
          city: payload.city,
        });

        if (res.ok && res.data && payload.session) {
          const order = res.data;
          const createdTasks: PickTask[] = (res.state?.pickTasks || []).filter(
            (t) => t.orderId === order.id
          );
          void syncOrderAndTaskToFirestore(payload.session, order, createdTasks).catch((err) => {
            console.warn('Order Firestore sync deferred:', err);
          });
        }

        return { ok: res.ok, message: res.message, data: res.data };
      } catch {
        return { ok: false, message: 'Unable to submit order to network server. Please retry.' };
      }
    },
    [postNetworkApi, holderKey]
  );

  const submitStockVerification = useCallback(
    async (input: {
      storeId: string;
      productId: string;
      verifiedQty: number;
      discrepancyReason?: string;
      session: AuthSession;
    }): Promise<ActionResult<StockVerification>> => {
      try {
        const res = await postNetworkApi<StockVerification>('/api/network/inventory/verify', {
          storeId: input.storeId,
          productId: input.productId,
          verifiedQty: input.verifiedQty,
          discrepancyReason: input.discrepancyReason,
          session: input.session,
        });
        if (res.ok && res.data) {
          void syncVerificationToFirestore(input.session, res.data).catch(() => undefined);
        }
        return { ok: res.ok, message: res.message, data: res.data };
      } catch {
        return { ok: false, message: 'Unable to save stock verification right now.' };
      }
    },
    [postNetworkApi]
  );

  const acceptPickTask = useCallback(
    async (taskId: string, activeSession: AuthSession): Promise<ActionResult> => {
      try {
        const res = await postNetworkApi('/api/network/pick-tasks/accept', {
          taskId,
          session: activeSession,
        });
        return { ok: res.ok, message: res.message };
      } catch {
        return { ok: false, message: 'Unable to accept pick task right now.' };
      }
    },
    [postNetworkApi]
  );

  const rejectPickTask = useCallback(
    async (
      taskId: string,
      reason: string,
      activeSession: AuthSession
    ): Promise<ActionResult<{ reassignedStoreName?: string; exception: boolean }>> => {
      try {
        const res = await postNetworkApi<{ reassignedStoreName?: string; exception: boolean }>(
          '/api/network/pick-tasks/reject',
          {
            taskId,
            reason,
            session: activeSession,
          }
        );
        return { ok: res.ok, message: res.message, data: res.data };
      } catch {
        return { ok: false, message: 'Unable to reject and reassign pick task right now.' };
      }
    },
    [postNetworkApi]
  );

  const recordDemandSignal = useCallback(
    async (input: {
      query: string;
      inferredCategory: string;
      inferredProductId?: string;
      locality: string;
      outcome: DemandSignalOutcome;
      signalSource?: DemandSignalSource;
      session: AuthSession | null;
    }): Promise<void> => {
      const cleanQuery = input.query.trim();
      if (!cleanQuery) return;
      try {
        const res = await postNetworkApi('/api/network/demand-signals', {
          query: cleanQuery,
          inferredCategory: input.inferredCategory,
          inferredProductId: input.inferredProductId,
          locality: input.locality,
          outcome: input.outcome,
          signalSource: input.signalSource,
          session: input.session,
        });
        const latestSignal: DemandSignal | undefined = res.state?.demandSignals?.[0];
        if (input.session && latestSignal) {
          void syncDemandSignalToFirestore(input.session, latestSignal).catch(() => undefined);
        }
      } catch {
        // Non-blocking telemetry
      }
    },
    [postNetworkApi]
  );

  const registerProductInterest = useCallback(
    async (
      productId: string,
      productName: string,
      locality: string,
      activeSession: AuthSession | null
    ): Promise<void> => {
      const category =
        state.products.find((p) => p.id === productId)?.category || 'General';
      try {
        await postNetworkApi('/api/network/demand-signals', {
          query: productName,
          inferredCategory: category,
          inferredProductId: productId,
          locality,
          outcome: 'REGISTERED_INTEREST',
          signalSource: 'RESCUE_REGISTER',
          registerInterestProductId: productId,
          session: activeSession,
        });
      } catch {
        // Ignore transient failure
      }
    },
    [postNetworkApi, state.products]
  );

  const createTransferRecommendation = useCallback(
    async (input: {
      sourceStoreId: string;
      destinationStoreId: string;
      productId: string;
      recommendedQty: number;
      reason: string;
      demandSignalCount: number;
      requestedBy?: string;
      requestedByRole?: AuthSession['role'];
      actorUid?: string;
    }): Promise<ActionResult<TransferRecommendation>> => {
      try {
        const res = await postNetworkApi<TransferRecommendation>(
          '/api/network/transfers/request',
          input
        );
        return { ok: res.ok, message: res.message, data: res.data };
      } catch {
        return { ok: false, message: 'Unable to submit transfer request right now.' };
      }
    },
    [postNetworkApi]
  );

  const approveTransfer = useCallback(
    async (
      recommendationId: string,
      notes: string,
      activeSession: AuthSession
    ): Promise<ActionResult> => {
      try {
        const res = await postNetworkApi<{
          recommendation: TransferRecommendation;
          decision: TransferDecision;
          movements: InventoryMovement[];
        }>('/api/network/transfers/decide', {
          recommendationId,
          decision: 'APPROVED',
          notes,
          session: activeSession,
        });
        if (res.ok && res.data) {
          void syncTransferDecisionToFirestore(
            activeSession,
            res.data.recommendation,
            res.data.decision
          ).catch(() => undefined);
          if (res.data.movements?.length) {
            void syncInventoryMovementsToFirestore(activeSession, res.data.movements).catch(
              () => undefined
            );
          }
        }
        return { ok: res.ok, message: res.message };
      } catch {
        return { ok: false, message: 'Unable to approve transfer right now.' };
      }
    },
    [postNetworkApi]
  );

  const rejectTransfer = useCallback(
    async (
      recommendationId: string,
      notes: string,
      activeSession: AuthSession
    ): Promise<ActionResult> => {
      try {
        const res = await postNetworkApi<{
          recommendation: TransferRecommendation;
          decision: TransferDecision;
          movements: InventoryMovement[];
        }>('/api/network/transfers/decide', {
          recommendationId,
          decision: 'REJECTED',
          notes,
          session: activeSession,
        });
        if (res.ok && res.data) {
          void syncTransferDecisionToFirestore(
            activeSession,
            res.data.recommendation,
            res.data.decision
          ).catch(() => undefined);
        }
        return { ok: res.ok, message: res.message };
      } catch {
        return { ok: false, message: 'Unable to reject transfer right now.' };
      }
    },
    [postNetworkApi]
  );

  const resetDemoData = useCallback(async () => {
    setExpiredCartNotice(null);
    try {
      const payload = await postNetworkApi('/api/network/reset', {});
      if (payload?.state) return;
    } catch {
      // Fallback to local reset
    }
    const fresh = enrichWithDynamicSuggestions(resetNetworkState());
    setState(fresh);
  }, [postNetworkApi]);

  return (
    <NetworkContext.Provider
      value={{
        state,
        holderKey,
        expiredCartNotice,
        dismissExpiredNotice,
        refreshState,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        placeDemoOrder,
        submitStockVerification,
        acceptPickTask,
        rejectPickTask,
        recordDemandSignal,
        registerProductInterest,
        createTransferRecommendation,
        approveTransfer,
        rejectTransfer,
        resetDemoData,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetwork must be used within NetworkProvider');
  return ctx;
}
