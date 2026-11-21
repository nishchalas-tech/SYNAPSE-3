import type {
  DemandPressureLevel,
  DemandSignal,
  FulfilmentOption,
  FulfilmentPreference,
  IneligibleStoreDetail,
  InventoryRecord,
  Order,
  Product,
  RescueEvaluation,
  Store,
  TradeoffWeights,
} from '../types';
import { formatInr, getFreshnessState } from '../utils/formatters';

export const FIXED_CART_HOLD_MINUTES = 10;

export interface CartHoldPolicyResult {
  qualifiesForTimedHold: boolean;
  durationMinutes: number;
  isRenewable: false;
  demandLevel: DemandPressureLevel;
  reason: string;
}

/**
 * Computes sellable store stock from verified shelf stock minus firm reservations,
 * active temporary cart holds, and safety buffer.
 */
export function computeSellableStock(
  verifiedQty: number,
  reservedQty: number,
  safetyBuffer: number,
  cartHoldQty = 0
): number {
  return Math.max(0, verifiedQty - reservedQty - cartHoldQty - safetyBuffer);
}

/**
 * Maps a discrete FulfilmentPreference preset into normalized 0..100 weights
 * for the Trade-off Slider.
 */
export function getWeightsForPreference(preference: FulfilmentPreference): TradeoffWeights {
  switch (preference) {
    case 'SAVE_MONEY':
      return { cost: 80, speed: 12, proximity: 8 };
    case 'SHOP_NEARBY':
      return { cost: 10, speed: 15, proximity: 75 };
    case 'GET_IT_FASTER':
    default:
      return { cost: 10, speed: 80, proximity: 10 };
  }
}

/**
 * Strict Non-Renewable 10-Minute Cart Reservation Policy:
 * Qualifying high-demand or low-stock SKUs receive a fixed 10-minute (600s) hold
 * that cannot be renewed, extended, or reset. Abundant low-pressure SKUs do not lock
 * a timed countdown.
 */
export function evaluateCartHoldPolicy(
  product: Product,
  store: Store,
  inventory: InventoryRecord,
  demandSignals: DemandSignal[],
  orders: Order[],
  requestedQty = 1
): CartHoldPolicyResult {
  const remainingAfterHold = Math.max(0, inventory.sellableQty - requestedQty);
  const matchingSignals = demandSignals.filter(
    (s) =>
      s.inferredProductId === product.id ||
      s.query.toLowerCase().includes(product.name.toLowerCase()) ||
      (s.locality.toLowerCase() === store.locality.toLowerCase() &&
        s.inferredCategory === product.category)
  ).length;

  const recentOrderUnits = orders
    .filter((o) => o.status !== 'EXCEPTION')
    .flatMap((o) => o.items)
    .filter((item) => item.productId === product.id)
    .reduce((sum, item) => sum + item.quantity, 0);

  const isLowStock = inventory.sellableQty <= 4 || remainingAfterHold <= 2;
  const isHighDemand = matchingSignals >= 1 || recentOrderUnits >= 1;

  if (!isLowStock && !isHighDemand) {
    return {
      qualifiesForTimedHold: false,
      durationMinutes: 0,
      isRenewable: false,
      demandLevel: 'NORMAL',
      reason: `Standard cart allocation (${inventory.sellableQty} sellable at ${store.locality} · abundant stock, no countdown lock needed).`,
    };
  }

  const demandLevel: DemandPressureLevel =
    remainingAfterHold <= 1 || matchingSignals >= 2 ? 'HIGH' : 'ELEVATED';

  const triggers: string[] = [];
  if (isLowStock) {
    triggers.push(`low stock (${inventory.sellableQty} sellable at ${store.locality})`);
  }
  if (isHighDemand) {
    triggers.push(`${matchingSignals} radar signal(s) · ${recentOrderUnits} active order unit(s)`);
  }

  return {
    qualifiesForTimedHold: true,
    durationMinutes: FIXED_CART_HOLD_MINUTES,
    isRenewable: false,
    demandLevel,
    reason: `Fixed 10m non-renewable hold (${triggers.join(' · ')}). Cannot be renewed, extended, or reset.`,
  };
}

export function diagnoseIneligibleStores(
  product: Product,
  stores: Store[],
  inventory: InventoryRecord[],
  requestedQty = 1
): IneligibleStoreDetail[] {
  const details: IneligibleStoreDetail[] = [];

  for (const store of stores) {
    const inv = inventory.find((r) => r.storeId === store.id && r.productId === product.id) || null;
    if (!store.isOpen) {
      details.push({
        store,
        inventory: inv,
        reason: 'Store node currently closed for fulfilment.',
        hasActiveCartHolds: false,
      });
      continue;
    }
    if (!inv) {
      details.push({
        store,
        inventory: null,
        reason: 'No inventory record registered at this node.',
        hasActiveCartHolds: false,
      });
      continue;
    }
    if (inv.sellableQty < requestedQty) {
      const parts: string[] = [];
      if (inv.verifiedQty === 0) {
        parts.push('0 verified shelf units');
      } else {
        parts.push(`${inv.verifiedQty} verified`);
        if (inv.reservedQty > 0) parts.push(`${inv.reservedQty} order-reserved`);
        if (inv.cartHoldQty > 0) parts.push(`${inv.cartHoldQty} held in active 10m cart`);
        if (inv.safetyBuffer > 0) parts.push(`${inv.safetyBuffer} safety buffer`);
        parts.push(`${inv.sellableQty} sellable (need ${requestedQty})`);
      }
      details.push({
        store,
        inventory: inv,
        reason: parts.join(' · '),
        hasActiveCartHolds: inv.cartHoldQty > 0,
      });
    }
  }

  return details;
}

export function rankFulfilmentOptions(
  product: Product,
  stores: Store[],
  inventory: InventoryRecord[],
  preference: FulfilmentPreference,
  requestedQty = 1,
  customWeights?: TradeoffWeights
): FulfilmentOption[] {
  const candidates: Array<{ store: Store; inv: InventoryRecord; totalCostInr: number }> = [];

  for (const store of stores) {
    if (!store.isOpen) continue;
    const inv = inventory.find((r) => r.storeId === store.id && r.productId === product.id);
    if (!inv || inv.sellableQty < requestedQty) continue;
    const totalCostInr = product.priceInr * requestedQty + store.deliveryFeeInr;
    candidates.push({ store, inv, totalCostInr });
  }

  if (candidates.length === 0) return [];

  const weights = customWeights || getWeightsForPreference(preference);
  const weightSum = Math.max(1, weights.cost + weights.speed + weights.proximity);
  const wCost = weights.cost / weightSum;
  const wSpeed = weights.speed / weightSum;
  const wProx = weights.proximity / weightSum;

  const minCost = Math.min(...candidates.map((c) => c.totalCostInr));
  const maxCost = Math.max(...candidates.map((c) => c.totalCostInr));
  const minHours = Math.min(...candidates.map((c) => c.store.fulfilmentHours));
  const maxHours = Math.max(...candidates.map((c) => c.store.fulfilmentHours));
  const minDist = Math.min(...candidates.map((c) => c.store.distanceKm));
  const maxDist = Math.max(...candidates.map((c) => c.store.distanceKm));

  const normalize = (val: number, min: number, max: number) =>
    max === min ? 0 : (val - min) / (max - min);

  const eligible: FulfilmentOption[] = candidates.map(({ store, inv, totalCostInr }) => {
    const freshness = getFreshnessState(inv.lastVerifiedAt);
    const isStaleWarning = freshness.state === 'STALE';

    const normCost = normalize(totalCostInr, minCost, maxCost);
    const normSpeed = normalize(store.fulfilmentHours, minHours, maxHours);
    const normProx = normalize(store.distanceKm, minDist, maxDist);

    // Real operational penalty when verification count is stale (>12h) or stock is single-unit edge
    const freshnessPenalty = freshness.state === 'STALE' ? 0.08 : freshness.state === 'AGING' ? 0.02 : 0;
    const depthBonus = inv.sellableQty >= requestedQty + 2 ? -0.02 : 0;

    const score = Number(
      (normCost * wCost + normSpeed * wSpeed + normProx * wProx + freshnessPenalty + depthBonus).toFixed(4)
    );

    const stockHealthLabel =
      inv.cartHoldQty > 0
        ? `${inv.sellableQty} sellable (${inv.cartHoldQty} held in active cart)`
        : `${inv.sellableQty} sellable of ${inv.verifiedQty} verified`;

    let reason = '';
    if (wCost >= wSpeed && wCost >= wProx) {
      reason =
        store.deliveryFeeInr === 0
          ? `Cost-optimized (${formatInr(totalCostInr)} total with ₹0 delivery · ${stockHealthLabel}).`
          : `Cost-ranked (${formatInr(totalCostInr)} incl. ${formatInr(store.deliveryFeeInr)} delivery · ${stockHealthLabel}).`;
    } else if (wSpeed >= wCost && wSpeed >= wProx) {
      reason = `Speed-optimized (${store.fulfilmentHours}h store dispatch · ${stockHealthLabel} · ${freshness.label} count).`;
    } else if (wProx >= wCost && wProx >= wSpeed) {
      reason = `Proximity-ranked (${store.distanceKm.toFixed(1)} km away · ${store.fulfilmentHours}h dispatch · ${stockHealthLabel}).`;
    } else {
      reason = `Balanced cost (${formatInr(store.deliveryFeeInr)} fee), speed (${store.fulfilmentHours}h), and distance (${store.distanceKm.toFixed(1)} km).`;
    }

    if (isStaleWarning) {
      reason += ` Count verified ${freshness.relativeText} (recount advised).`;
    }

    return {
      store,
      inventory: inv,
      totalCostInr,
      deliveryFeeInr: store.deliveryFeeInr,
      fulfilmentHours: store.fulfilmentHours,
      distanceKm: store.distanceKm,
      freshness: freshness.state,
      freshnessRelative: freshness.relativeText,
      isStaleWarning,
      stockHealthLabel,
      score,
      reason,
    };
  });

  eligible.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.distanceKm - b.distanceKm;
  });

  return eligible;
}

export function evaluateProductRescue(
  product: Product,
  preferredStoreId: string,
  stores: Store[],
  products: Product[],
  inventory: InventoryRecord[],
  preference: FulfilmentPreference,
  requestedQty = 1,
  customWeights?: TradeoffWeights
): RescueEvaluation {
  const rankedExact = rankFulfilmentOptions(
    product,
    stores,
    inventory,
    preference,
    requestedQty,
    customWeights
  );
  const preferredOption = rankedExact.find((opt) => opt.store.id === preferredStoreId) || null;
  const ineligibleStores = diagnoseIneligibleStores(product, stores, inventory, requestedQty);
  const heldInCartsNetworkQty = inventory
    .filter((inv) => inv.productId === product.id)
    .reduce((sum, inv) => sum + (inv.cartHoldQty || 0), 0);

  if (preferredOption) {
    return {
      outcome: 'AVAILABLE_PREFERRED',
      preferredStoreOption: preferredOption,
      alternativeStoreOptions: rankedExact.filter((opt) => opt.store.id !== preferredStoreId),
      compatibleAlternatives: [],
      ineligibleStores,
      heldInCartsNetworkQty,
      summary: `Available at your preferred store (${preferredOption.store.name}) with ${preferredOption.inventory.sellableQty} sellable units.`,
    };
  }

  if (rankedExact.length > 0) {
    return {
      outcome: 'RESCUE_OTHER_STORE',
      preferredStoreOption: null,
      alternativeStoreOptions: rankedExact,
      compatibleAlternatives: [],
      ineligibleStores,
      heldInCartsNetworkQty,
      summary: `Unavailable at your preferred store for qty ${requestedQty}. Exact model rescued from ${rankedExact[0].store.name} (${rankedExact.length} network ${rankedExact.length === 1 ? 'store' : 'stores'} available).`,
    };
  }

  // Priority 2: Curated compatible alternative using documented compatibilityGroup + live stock
  const compatibleProducts = products.filter(
    (p) => p.id !== product.id && p.compatibilityGroup === product.compatibilityGroup
  );
  const compatibleAlternatives: RescueEvaluation['compatibleAlternatives'] = [];

  for (const altProduct of compatibleProducts) {
    const rankedAlt = rankFulfilmentOptions(
      altProduct,
      stores,
      inventory,
      preference,
      requestedQty,
      customWeights
    );
    if (rankedAlt.length > 0) {
      compatibleAlternatives.push({
        product: altProduct,
        bestOption: rankedAlt[0],
        allOptions: rankedAlt,
      });
    }
  }

  if (compatibleAlternatives.length > 0) {
    compatibleAlternatives.sort((a, b) => a.bestOption.score - b.bestOption.score);
    return {
      outcome: 'RESCUE_COMPATIBLE_PRODUCT',
      preferredStoreOption: null,
      alternativeStoreOptions: [],
      compatibleAlternatives,
      ineligibleStores,
      heldInCartsNetworkQty,
      summary: `No sellable network stock for ${product.name}. Compatible ${product.compatibilityLabel} alternative available at ${compatibleAlternatives[0].bestOption.store.name} (${compatibleAlternatives[0].bestOption.inventory.sellableQty} sellable).`,
    };
  }

  // Priority 3: Register interest (includes visibility into temporary 10m cart holds)
  const holdNotice =
    heldInCartsNetworkQty > 0
      ? ` ${heldInCartsNetworkQty} unit(s) currently reserved in active 10-minute customer carts.`
      : '';

  return {
    outcome: 'REGISTER_INTEREST',
    preferredStoreOption: null,
    alternativeStoreOptions: [],
    compatibleAlternatives: [],
    ineligibleStores,
    heldInCartsNetworkQty,
    summary: `Currently 0 sellable units across all 4 Bengaluru stores.${holdNotice} Register interest to notify Demand Radar.`,
  };
}
