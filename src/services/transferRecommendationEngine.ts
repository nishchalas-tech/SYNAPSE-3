import type {
  DemandSignal,
  DynamicTransferSuggestion,
  InventoryRecord,
  Order,
  Product,
  Store,
  TransferRecommendation,
} from '../types';
import { getFreshnessState } from '../utils/formatters';

interface EngineInput {
  stores: Store[];
  products: Product[];
  inventory: InventoryRecord[];
  demandSignals: DemandSignal[];
  orders: Order[];
  transferRecommendations: TransferRecommendation[];
}

/**
 * Automatically identifies surplus (>= 4 sellable and buffer headroom) and shortage (<= 1 sellable
 * or zero-stock with local Demand Radar signals / recent orders) across all open stores and ranks
 * optimal inter-branch transfer recommendations.
 */
export function generateDynamicTransferRecommendations(
  input: EngineInput
): DynamicTransferSuggestion[] {
  const { stores, products, inventory, demandSignals, orders, transferRecommendations } = input;
  const suggestions: DynamicTransferSuggestion[] = [];

  for (const product of products) {
    const rows = stores
      .filter((s) => s.isOpen)
      .map((store) => {
        const inv = inventory.find((r) => r.storeId === store.id && r.productId === product.id);
        const freshness = inv ? getFreshnessState(inv.lastVerifiedAt) : null;
        return {
          store,
          inv,
          sellableQty: inv?.sellableQty ?? 0,
          safetyBuffer: inv?.safetyBuffer ?? 1,
          isStale: freshness?.state === 'STALE',
        };
      });

    const surplusCandidates = rows
      .filter((r) => r.sellableQty >= 4 && r.inv && r.sellableQty >= r.safetyBuffer + 2)
      .sort((a, b) => b.sellableQty - a.sellableQty);

    const shortageCandidates = rows
      .filter((r) => r.sellableQty <= 1 || (r.sellableQty <= 2 && r.isStale))
      .sort((a, b) => a.sellableQty - b.sellableQty);

    if (surplusCandidates.length === 0 || shortageCandidates.length === 0) {
      continue;
    }

    for (const dest of shortageCandidates) {
      // Pick the highest-surplus source store (breaking ties by closest distance to network hub)
      const bestSource = surplusCandidates.find((src) => src.store.id !== dest.store.id);
      if (!bestSource || !bestSource.inv) continue;

      const localSignals = demandSignals.filter(
        (sig) =>
          (sig.inferredProductId === product.id ||
            sig.query.toLowerCase().includes(product.name.toLowerCase())) &&
          sig.locality.toLowerCase() === dest.store.locality.toLowerCase()
      ).length;

      const networkProductSignals = demandSignals.filter(
        (sig) =>
          sig.inferredProductId === product.id ||
          sig.query.toLowerCase().includes(product.name.toLowerCase())
      ).length;

      const exceptionOrPendingDestOrders = orders.filter(
        (o) =>
          o.storeId === dest.store.id &&
          (o.status === 'EXCEPTION' || o.status === 'PICK_PENDING') &&
          o.items.some((i) => i.productId === product.id)
      ).length;

      const maxSafeGive = Math.max(1, bestSource.sellableQty - Math.max(2, bestSource.safetyBuffer));
      const targetReplenish = dest.sellableQty === 0 ? 3 : 2;
      const recommendedQty = Math.max(1, Math.min(targetReplenish, maxSafeGive));

      const shortageSeverity = dest.sellableQty === 0 ? 45 : dest.sellableQty === 1 ? 25 : 12;
      const signalBoost = localSignals * 22 + networkProductSignals * 6 + exceptionOrPendingDestOrders * 20;
      const surplusHeadroomBoost = (bestSource.sellableQty - recommendedQty) * 3;
      const staleBoost = dest.isStale ? 10 : 0;
      const urgencyScore = Math.round(
        shortageSeverity + signalBoost + surplusHeadroomBoost + staleBoost - dest.store.distanceKm * 0.4
      );

      const pendingMatch = transferRecommendations.find(
        (rec) =>
          rec.status === 'PENDING' &&
          rec.sourceStoreId === bestSource.store.id &&
          rec.destinationStoreId === dest.store.id &&
          rec.productId === product.id
      );

      const reasonParts: string[] = [
        `${dest.store.locality} has ${dest.sellableQty} sellable unit(s)`,
        `${bestSource.store.locality} holds ${bestSource.sellableQty} sellable in surplus`,
      ];
      if (localSignals > 0) {
        reasonParts.push(`${localSignals} local Demand Radar hit(s)`);
      }
      if (exceptionOrPendingDestOrders > 0) {
        reasonParts.push(`${exceptionOrPendingDestOrders} impacted local order(s)`);
      }
      if (dest.isStale) {
        reasonParts.push('destination verification count is aging/stale');
      }

      suggestions.push({
        suggestionKey: `${bestSource.store.id}__${dest.store.id}__${product.id}`,
        sourceStoreId: bestSource.store.id,
        sourceStoreName: bestSource.store.name,
        destinationStoreId: dest.store.id,
        destinationStoreName: dest.store.name,
        productId: product.id,
        productName: product.name,
        recommendedQty,
        sourceSellableQty: bestSource.sellableQty,
        destinationSellableQty: dest.sellableQty,
        demandSignalCount: localSignals || networkProductSignals,
        urgencyScore,
        reason: `${reasonParts.join(' · ')}.`,
        alreadyQueuedId: pendingMatch?.id,
      });
    }
  }

  return suggestions.sort((a, b) => b.urgencyScore - a.urgencyScore);
}
