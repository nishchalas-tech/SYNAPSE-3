import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { getFreshnessState } from '../../utils/formatters';

type FreshnessFilter = 'ALL' | 'FRESH' | 'AGING' | 'STALE' | 'DISCREPANCY';

export function ManagerInventoryPage() {
  const { session } = useAuth();
  const { state } = useNetwork();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FreshnessFilter>('ALL');

  const storeId = session?.assignedStoreId || 'indiranagar';
  const store = state.stores.find((s) => s.id === storeId) || state.stores[0];

  const rows = useMemo(() => {
    return state.inventory
      .filter((inv) => inv.storeId === store.id)
      .map((inv) => {
        const product = state.products.find((p) => p.id === inv.productId)!;
        const freshness = getFreshnessState(inv.lastVerifiedAt);
        const hasDiscrepancy = inv.recordedQty !== inv.verifiedQty;
        return { inv, product, freshness, hasDiscrepancy };
      })
      .filter(({ product, freshness, hasDiscrepancy }) => {
        if (query.trim()) {
          const q = query.toLowerCase();
          if (
            !product.name.toLowerCase().includes(q) &&
            !product.sku.toLowerCase().includes(q) &&
            !product.category.toLowerCase().includes(q)
          ) {
            return false;
          }
        }
        if (filter === 'DISCREPANCY') return hasDiscrepancy;
        if (filter !== 'ALL' && freshness.state !== filter) return false;
        return true;
      });
  }, [state.inventory, state.products, store.id, query, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A2022]">Stock Whisperer — {store.locality}</h1>
          <p className="text-sm text-[#526063] mt-1">
            Distinguishes system-recorded stock, physically verified counts, active reservations, and sellable stock. Freshness is an operational time signal.
          </p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-[#E1E5E4] rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#526063] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by product name, SKU, or category..."
            aria-label="Filter store inventory"
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-[#F7F7F5] border border-[#D4DAD8] rounded-lg focus:bg-white focus:outline-none focus:border-[#264C4F]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F0F2F1] rounded-lg">
          {(['ALL', 'FRESH', 'AGING', 'STALE', 'DISCREPANCY'] as FreshnessFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === f ? 'bg-white text-[#1A2022] shadow-xs' : 'text-[#526063]'
              }`}
            >
              {f === 'ALL'
                ? 'All SKUs'
                : f === 'FRESH'
                  ? 'Fresh (<6h)'
                  : f === 'AGING'
                    ? 'Aging (6-12h)'
                    : f === 'STALE'
                      ? 'Stale (>12h)'
                      : 'Discrepancies'}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white border border-[#E1E5E4] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8FAF9] border-b border-[#E1E5E4] text-xs font-semibold text-[#526063]">
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4 text-right">Recorded</th>
                <th className="py-3 px-4 text-right">Verified</th>
                <th className="py-3 px-4 text-right">Order Res.</th>
                <th className="py-3 px-4 text-right">Cart Holds</th>
                <th className="py-3 px-4 text-right">Sellable</th>
                <th className="py-3 px-4">Freshness</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF1F0] text-sm">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-[#526063]">
                    No inventory records match the current filter.
                  </td>
                </tr>
              ) : (
                rows.map(({ inv, product, freshness, hasDiscrepancy }) => {
                  const tone =
                    freshness.state === 'FRESH'
                      ? 'success'
                      : freshness.state === 'AGING'
                        ? 'warning'
                        : 'danger';
                  return (
                    <tr key={inv.id} className="hover:bg-[#FAFBFA]">
                      <td className="py-3.5 px-4">
                        <p className="font-medium text-[#1A2022]">{product.name}</p>
                        <p className="text-xs text-[#526063]">
                          <span className="font-mono-tabular">{product.sku}</span> · {product.category}
                          {hasDiscrepancy && (
                            <span className="ml-2 text-amber-800 font-medium">
                              (Gap {inv.verifiedQty - inv.recordedQty})
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-[#526063]">
                        {inv.recordedQty}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular font-medium text-[#1A2022]">
                        {inv.verifiedQty}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-[#526063]">
                        {inv.reservedQty}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-amber-800">
                        {inv.cartHoldQty || 0}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-[#264C4F]">
                        {inv.sellableQty}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge label={freshness.label} tone={tone} />
                          <span className="text-[11px] text-[#526063] font-mono-tabular">
                            {freshness.relativeText}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          to={`/manager/inventory/${product.id}`}
                          className="inline-flex px-3 py-1.5 text-xs font-medium text-[#264C4F] bg-[#E7F0EE] hover:bg-[#D5E5E2] rounded-md whitespace-nowrap"
                        >
                          Verify Stock
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
