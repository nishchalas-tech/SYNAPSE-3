import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useNetwork } from '../../context/NetworkContext';
import { getFreshnessState } from '../../utils/formatters';

export function AdminInventoryPage() {
  const { state } = useNetwork();
  const [storeFilter, setStoreFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);

  const rows = useMemo(() => {
    return state.inventory
      .map((inv) => {
        const store = state.stores.find((s) => s.id === inv.storeId)!;
        const product = state.products.find((p) => p.id === inv.productId)!;
        const freshness = getFreshnessState(inv.lastVerifiedAt);
        const discrepancy = inv.verifiedQty - inv.recordedQty;
        return { inv, store, product, freshness, discrepancy };
      })
      .filter(({ store, product, freshness, discrepancy, inv }) => {
        if (storeFilter !== 'ALL' && store.id !== storeFilter) return false;
        if (query.trim()) {
          const q = query.toLowerCase();
          if (!product.name.toLowerCase().includes(q) && !product.sku.toLowerCase().includes(q)) {
            return false;
          }
        }
        if (onlyIssues) {
          return discrepancy !== 0 || inv.sellableQty === 0 || freshness.state === 'STALE';
        }
        return true;
      });
  }, [state.inventory, state.stores, state.products, storeFilter, query, onlyIssues]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#1A2022]">Network Inventory</h1>
        <p className="text-sm text-[#526063] mt-1">
          Live Stock Whisperer state across all 4 Bengaluru store nodes, synchronized with manager verifications and order reservations.
        </p>
      </div>

      <div className="bg-white border border-[#E1E5E4] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-60 max-w-md">
          <Search className="w-4 h-4 text-[#526063] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SKU or product name..."
            aria-label="Search network inventory"
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-[#F7F7F5] border border-[#D4DAD8] rounded-lg focus:bg-white focus:outline-none focus:border-[#264C4F]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter by store"
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-[#D4DAD8] rounded-lg"
          >
            <option value="ALL">All 4 Stores</option>
            {state.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.locality}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-[#1A2022] cursor-pointer">
            <input
              type="checkbox"
              checked={onlyIssues}
              onChange={(e) => setOnlyIssues(e.target.checked)}
              className="rounded border-[#D4DAD8] text-[#264C4F]"
            />
            Discrepancies, OOS, or Stale Only
          </label>
        </div>
      </div>

      <div className="bg-white border border-[#E1E5E4] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#F8FAF9] border-b border-[#E1E5E4] text-xs font-semibold text-[#526063]">
                <th className="py-3 px-4">Store</th>
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4 text-right">Recorded</th>
                <th className="py-3 px-4 text-right">Verified</th>
                <th className="py-3 px-4 text-right">Order Res.</th>
                <th className="py-3 px-4 text-right">Cart Holds</th>
                <th className="py-3 px-4 text-right">Sellable</th>
                <th className="py-3 px-4">Freshness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF1F0]">
              {rows.map(({ inv, store, product, freshness, discrepancy }) => (
                <tr key={inv.id} className="hover:bg-[#FAFBFA]">
                  <td className="py-3 px-4 font-medium text-[#1A2022] whitespace-nowrap">{store.locality}</td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-[#1A2022]">{product.name}</p>
                    {discrepancy !== 0 && (
                      <p className="text-xs text-amber-800">
                        Discrepancy {discrepancy > 0 ? `+${discrepancy}` : discrepancy}
                        {inv.discrepancyReason ? ` · ${inv.discrepancyReason}` : ''}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-[#526063]">{inv.recordedQty}</td>
                  <td className="py-3 px-4 text-right font-mono-tabular">{inv.verifiedQty}</td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-[#526063]">{inv.reservedQty}</td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-amber-800">{inv.cartHoldQty || 0}</td>
                  <td
                    className={`py-3 px-4 text-right font-mono-tabular font-semibold ${
                      inv.sellableQty === 0 ? 'text-red-700' : 'text-[#264C4F]'
                    }`}
                  >
                    {inv.sellableQty}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge
                      label={`${freshness.label} · ${freshness.relativeText}`}
                      tone={
                        freshness.state === 'FRESH'
                          ? 'success'
                          : freshness.state === 'AGING'
                            ? 'warning'
                            : 'danger'
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
