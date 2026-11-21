import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useNetwork } from '../../context/NetworkContext';
import type { DemandSignalOutcome, DemandSignalSource } from '../../types';
import { formatDateTime, formatInr } from '../../utils/formatters';

export function AdminDemandRadarPage() {
  const { state, createTransferRecommendation } = useNetwork();
  const [localityFilter, setLocalityFilter] = useState('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | DemandSignalOutcome>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | DemandSignalSource>('ALL');
  const [transferNotice, setTransferNotice] = useState<string | null>(null);

  // 1. Actual Sales Ledger (computed strictly from confirmed/active orders, excluding EXCEPTION)
  const actualSalesSummary = useMemo(() => {
    const validOrders = state.orders.filter((o) => o.status !== 'EXCEPTION');
    const totalRevenueInr = validOrders.reduce((sum, o) => sum + o.totalInr, 0);
    const totalUnitsSold = validOrders.reduce(
      (sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0),
      0
    );

    const byProduct = new Map<
      string,
      { productName: string; sku: string; unitsSold: number; revenueInr: number; stores: Set<string> }
    >();
    for (const order of validOrders) {
      for (const item of order.items) {
        const current = byProduct.get(item.productId) || {
          productName: item.productName,
          sku: item.sku,
          unitsSold: 0,
          revenueInr: 0,
          stores: new Set<string>(),
        };
        current.unitsSold += item.quantity;
        current.revenueInr += item.unitPriceInr * item.quantity;
        current.stores.add(order.storeName.replace('SYNAPSE ', ''));
        byProduct.set(item.productId, current);
      }
    }

    return {
      orderCount: validOrders.length,
      exceptionCount: state.orders.filter((o) => o.status === 'EXCEPTION').length,
      totalRevenueInr,
      totalUnitsSold,
      skuRows: Array.from(byProduct.entries())
        .map(([productId, data]) => ({ productId, ...data }))
        .sort((a, b) => b.revenueInr - a.revenueInr),
    };
  }, [state.orders]);

  // 2. Separate Search-Interest & Unmet Demand Signals
  const signals = state.demandSignals.filter((s) => {
    if (localityFilter !== 'ALL' && s.locality.toLowerCase() !== localityFilter.toLowerCase()) {
      return false;
    }
    if (outcomeFilter !== 'ALL' && s.outcome !== outcomeFilter) return false;
    if (sourceFilter !== 'ALL' && (s.signalSource || 'TEXT_SEARCH') !== sourceFilter) return false;
    return true;
  });

  // 3. SKU Demand Gap vs. Actual Sales Comparison + Surplus Exchange Trigger
  const demandGapRows = useMemo(() => {
    return state.products
      .map((product) => {
        const relatedSignals = state.demandSignals.filter((s) => s.inferredProductId === product.id);
        const actualSku = actualSalesSummary.skuRows.find((r) => r.productId === product.id);
        const storeStock = state.stores.map((store) => {
          const inv = state.inventory.find(
            (i) => i.storeId === store.id && i.productId === product.id
          );
          return { store, sellableQty: inv?.sellableQty ?? 0 };
        });
        const networkSellable = storeStock.reduce((sum, s) => sum + s.sellableQty, 0);
        const surplusNode = [...storeStock]
          .filter((s) => s.sellableQty >= 3)
          .sort((a, b) => b.sellableQty - a.sellableQty)[0];
        const shortageNode = storeStock.find((s) => s.sellableQty <= 1);

        return {
          product,
          signalCount: relatedSignals.length,
          actualUnitsSold: actualSku?.unitsSold ?? 0,
          actualRevenueInr: actualSku?.revenueInr ?? 0,
          networkSellable,
          surplusNode,
          shortageNode,
        };
      })
      .filter((row) => row.signalCount > 0 || row.actualUnitsSold > 0)
      .sort((a, b) => b.signalCount - a.signalCount || b.actualUnitsSold - a.actualUnitsSold);
  }, [state.products, state.demandSignals, state.stores, state.inventory, actualSalesSummary.skuRows]);

  const handleQueueTransfer = async (row: (typeof demandGapRows)[number]) => {
    if (!row.surplusNode || !row.shortageNode) return;
    const qty = Math.min(2, Math.max(1, row.surplusNode.sellableQty - 2));
    const res = await createTransferRecommendation({
      sourceStoreId: row.surplusNode.store.id,
      destinationStoreId: row.shortageNode.store.id,
      productId: row.product.id,
      recommendedQty: qty,
      reason: `Demand Radar signal gap (${row.signalCount} unmet signal(s), ${row.actualUnitsSold} actual sold). Rebalance from ${row.surplusNode.store.locality} (${row.surplusNode.sellableQty} sellable) to ${row.shortageNode.store.locality} (${row.shortageNode.sellableQty} sellable).`,
      demandSignalCount: row.signalCount,
    });
    setTransferNotice(res.message);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A2022]">Demand Radar &amp; Actual Sales</h1>
          <p className="text-sm text-[#526063] mt-1">
            Compares confirmed transactional sales against strictly separated text/photo search-interest and unmet demand signals.
          </p>
        </div>
        <Link
          to="/admin/transfers"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg whitespace-nowrap"
        >
          Open Transfer Queue
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>

      {/* Explicit Separation: Actual Sales KPIs vs Search-Interest KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E1E5E4] rounded-xl p-5">
          <p className="text-xs text-[#526063]">Actual Sales Revenue (Orders Ledger)</p>
          <p className="text-2xl font-semibold font-mono-tabular text-[#1A2022] mt-1">
            {formatInr(actualSalesSummary.totalRevenueInr)}
          </p>
          <p className="text-xs text-[#526063] mt-1">
            Across {actualSalesSummary.orderCount} active/confirmed orders ({actualSalesSummary.totalUnitsSold} units)
          </p>
        </div>
        <div className="bg-white border border-[#E1E5E4] rounded-xl p-5">
          <p className="text-xs text-[#526063]">Search-Interest Signals (Non-Order)</p>
          <p className="text-2xl font-semibold font-mono-tabular text-[#264C4F] mt-1">
            {state.demandSignals.length}
          </p>
          <p className="text-xs text-[#526063] mt-1">
            Kept separate from sales revenue · includes{' '}
            {state.demandSignals.filter((s) => s.signalSource === 'VISUAL_SEARCH').length} visual search
          </p>
        </div>
        <div className="bg-white border border-[#E1E5E4] rounded-xl p-5">
          <p className="text-xs text-[#526063]">Unmatched Queries (Catalog Gaps)</p>
          <p className="text-2xl font-semibold font-mono-tabular text-amber-800 mt-1">
            {state.demandSignals.filter((s) => s.outcome === 'UNMATCHED_SEARCH').length}
          </p>
          <p className="text-xs text-[#526063] mt-1">Text &amp; photo searches with 0 catalog matches</p>
        </div>
        <div className="bg-white border border-[#E1E5E4] rounded-xl p-5">
          <p className="text-xs text-[#526063]">Explicit Restock Interests</p>
          <p className="text-2xl font-semibold font-mono-tabular text-[#1A2022] mt-1">
            {state.demandSignals.filter((s) => s.outcome === 'REGISTERED_INTEREST').length}
          </p>
          <p className="text-xs text-[#526063] mt-1">
            {actualSalesSummary.exceptionCount} fulfilment exception order(s)
          </p>
        </div>
      </div>

      {transferNotice && (
        <div role="status" className="p-3.5 bg-[#E7F0EE] border border-[#C9DBD7] rounded-lg text-xs text-[#264C4F] flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            {transferNotice}
          </span>
          <Link to="/admin/transfers" className="font-semibold underline whitespace-nowrap">
            Review in Transfer Queue
          </Link>
        </div>
      )}

      {/* Side-by-side: Actual Sales Breakdown & Demand Gap Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-[#E1E5E4] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[#EEF1F0]">
            <h2 className="text-base font-semibold text-[#1A2022]">Actual Sales by SKU</h2>
            <p className="text-xs text-[#526063] mt-0.5">
              Verified order revenue &amp; units committed from store shelves.
            </p>
          </div>
          {actualSalesSummary.skuRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#526063]">No active orders recorded yet.</div>
          ) : (
            <div className="divide-y divide-[#EEF1F0]">
              {actualSalesSummary.skuRows.map((row) => (
                <div key={row.productId} className="p-4 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1A2022] truncate">{row.productName}</p>
                    <p className="text-[#526063] mt-0.5">
                      <span className="font-mono-tabular">{row.sku}</span> · Stores:{' '}
                      {Array.from(row.stores).join(', ')}
                    </p>
                  </div>
                  <div className="text-right shrink-0 font-mono-tabular">
                    <p className="font-semibold text-[#1A2022]">{formatInr(row.revenueInr)}</p>
                    <p className="text-[#264C4F]">{row.unitsSold} sold</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 bg-white border border-[#E1E5E4] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[#EEF1F0]">
            <h2 className="text-base font-semibold text-[#1A2022]">
              Actual Sales vs. Unmet Search-Interest Signals
            </h2>
            <p className="text-xs text-[#526063] mt-0.5">
              Identifies high-interest SKUs with zero/low local stock eligible for Surplus Exchange rebalancing.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8FAF9] border-b border-[#E1E5E4] font-semibold text-[#526063]">
                  <th className="py-2.5 px-4">Product</th>
                  <th className="py-2.5 px-3 text-right">Sold</th>
                  <th className="py-2.5 px-3 text-right">Signals</th>
                  <th className="py-2.5 px-3 text-right">Net Sellable</th>
                  <th className="py-2.5 px-4 text-right">Rebalance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF1F0]">
                {demandGapRows.map((row) => (
                  <tr key={row.product.id} className="hover:bg-[#FAFBFA]">
                    <td className="py-3 px-4 font-medium text-[#1A2022]">{row.product.name}</td>
                    <td className="py-3 px-3 text-right font-mono-tabular">{row.actualUnitsSold}</td>
                    <td className="py-3 px-3 text-right font-mono-tabular font-semibold text-[#264C4F]">
                      {row.signalCount}
                    </td>
                    <td className="py-3 px-3 text-right font-mono-tabular">{row.networkSellable}</td>
                    <td className="py-3 px-4 text-right">
                      {row.surplusNode && row.shortageNode ? (
                        <button
                          type="button"
                          onClick={() => void handleQueueTransfer(row)}
                          className="px-2.5 py-1 text-[11px] font-medium text-[#264C4F] bg-[#E7F0EE] hover:bg-[#D4E4E1] rounded whitespace-nowrap"
                        >
                          Queue {row.surplusNode.store.locality} → {row.shortageNode.store.locality}
                        </button>
                      ) : (
                        <span className="text-[#526063]">Balanced / OOS</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Filters for Separate Search-Interest Signals Ledger */}
      <div className="bg-white border border-[#E1E5E4] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F0F2F1] rounded-lg">
          {(
            [
              ['ALL', 'All Signals'],
              ['UNMATCHED_SEARCH', 'Unmatched Search'],
              ['OUT_OF_STOCK_NEARBY', 'Out of Stock Nearby'],
              ['REGISTERED_INTEREST', 'Registered Interest'],
              ['RESCUED_ALTERNATIVE', 'Rescued Alternative'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setOutcomeFilter(val)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                outcomeFilter === val ? 'bg-white text-[#1A2022] shadow-xs' : 'text-[#526063]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by capture source"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as 'ALL' | DemandSignalSource)}
            className="px-3 py-2 text-xs bg-white border border-[#D4DAD8] rounded-lg"
          >
            <option value="ALL">All Sources</option>
            <option value="TEXT_SEARCH">Text Search</option>
            <option value="VISUAL_SEARCH">Photo Search</option>
            <option value="PRODUCT_VIEW">Product View (OOS)</option>
            <option value="RESCUE_REGISTER">Rescue Interest</option>
          </select>

          <select
            aria-label="Filter by locality"
            value={localityFilter}
            onChange={(e) => setLocalityFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-[#D4DAD8] rounded-lg"
          >
            <option value="ALL">All Localities</option>
            {state.stores.map((s) => (
              <option key={s.id} value={s.locality}>
                {s.locality}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Signals Table */}
      <div className="bg-white border border-[#E1E5E4] rounded-xl overflow-hidden">
        {signals.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#526063]">
            No search-interest signals match the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#F8FAF9] border-b border-[#E1E5E4] text-xs font-semibold text-[#526063]">
                  <th className="py-3 px-4">Search Query / Product</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Locality</th>
                  <th className="py-3 px-4">Outcome</th>
                  <th className="py-3 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF1F0]">
                {signals.map((sig) => (
                  <tr key={sig.id} className="hover:bg-[#FAFBFA]">
                    <td className="py-3.5 px-4 font-medium text-[#1A2022]">&ldquo;{sig.query}&rdquo;</td>
                    <td className="py-3.5 px-4 text-[#526063]">{sig.inferredCategory}</td>
                    <td className="py-3.5 px-4 text-xs font-mono-tabular text-[#526063]">
                      {(sig.signalSource || 'TEXT_SEARCH').replace(/_/g, ' ')}
                    </td>
                    <td className="py-3.5 px-4 text-[#1A2022]">{sig.locality}</td>
                    <td className="py-3.5 px-4">
                      <StatusBadge
                        label={sig.outcome.replace(/_/g, ' ')}
                        tone={
                          sig.outcome === 'REGISTERED_INTEREST'
                            ? 'teal'
                            : sig.outcome === 'UNMATCHED_SEARCH'
                              ? 'warning'
                              : 'neutral'
                        }
                      />
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-tabular text-xs text-[#526063]">
                      {formatDateTime(sig.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
