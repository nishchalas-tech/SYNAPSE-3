import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useNetwork } from '../../context/NetworkContext';
import { formatDateTime, getFreshnessState, getPickTaskStatusMeta } from '../../utils/formatters';

export function AdminStoreDetailPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const { state } = useNetwork();
  const store = state.stores.find((s) => s.id === storeId);

  if (!store) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[#526063]">Store node not found.</p>
        <Link to="/admin/stores" className="text-sm font-medium text-[#264C4F] underline">
          Back to Store Network
        </Link>
      </div>
    );
  }

  const storeInventory = state.inventory.filter((i) => i.storeId === store.id);
  const storeTasks = state.pickTasks.filter((t) => t.storeId === store.id);
  const storeSignals = state.demandSignals.filter(
    (s) => s.locality.toLowerCase() === store.locality.toLowerCase()
  );

  return (
    <div className="space-y-6">
      <Link
        to="/admin/stores"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#526063] hover:text-[#1A2022]"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Back to Store Network
      </Link>

      <div className="bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-2">
        <h1 className="text-2xl font-semibold text-[#1A2022]">{store.name}</h1>
        <p className="text-sm text-[#526063]">{store.address}</p>
        <p className="text-xs text-[#526063] font-mono-tabular">
          Manager: {store.managerName} ({store.managerEmail}) · Readiness: {store.fulfilmentHours}h · Distance:{' '}
          {store.distanceKm.toFixed(1)} km
        </p>
      </div>

      {/* Inventory Table */}
      <section className="bg-white border border-[#E1E5E4] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E1E5E4]">
          <h2 className="text-base font-semibold text-[#1A2022]">Store Inventory Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#F8FAF9] border-b border-[#E1E5E4] text-xs font-semibold text-[#526063]">
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4 text-right">Recorded</th>
                <th className="py-3 px-4 text-right">Verified</th>
                <th className="py-3 px-4 text-right">Reserved</th>
                <th className="py-3 px-4 text-right">Sellable</th>
                <th className="py-3 px-4">Freshness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF1F0]">
              {storeInventory.map((inv) => {
                const product = state.products.find((p) => p.id === inv.productId)!;
                const freshness = getFreshnessState(inv.lastVerifiedAt);
                return (
                  <tr key={inv.id}>
                    <td className="py-3 px-4">
                      <p className="font-medium text-[#1A2022]">{product.name}</p>
                      <p className="text-xs font-mono-tabular text-[#526063]">{product.sku}</p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular">{inv.recordedQty}</td>
                    <td className="py-3 px-4 text-right font-mono-tabular">{inv.verifiedQty}</td>
                    <td className="py-3 px-4 text-right font-mono-tabular">{inv.reservedQty}</td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-[#264C4F]">
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
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-[#E1E5E4] rounded-xl p-5 space-y-3">
          <h2 className="text-base font-semibold text-[#1A2022]">Store Pick Tasks</h2>
          {storeTasks.length === 0 ? (
            <p className="text-sm text-[#526063]">No pick tasks recorded for this store.</p>
          ) : (
            <div className="divide-y divide-[#EEF1F0]">
              {storeTasks.map((t) => {
                const meta = getPickTaskStatusMeta(t.status);
                return (
                  <div key={t.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-mono-tabular font-semibold text-[#1A2022]">{t.orderNumber}</span>
                      <span className="text-[#526063] ml-2">{t.productName} (x{t.quantity})</span>
                    </div>
                    <StatusBadge label={meta.label} tone={meta.tone} />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-white border border-[#E1E5E4] rounded-xl p-5 space-y-3">
          <h2 className="text-base font-semibold text-[#1A2022]">Local Demand Signals</h2>
          {storeSignals.length === 0 ? (
            <p className="text-sm text-[#526063]">No demand signals logged in {store.locality}.</p>
          ) : (
            <div className="divide-y divide-[#EEF1F0]">
              {storeSignals.map((sig) => (
                <div key={sig.id} className="py-2.5 text-xs space-y-0.5">
                  <div className="flex justify-between">
                    <span className="font-medium text-[#1A2022]">"{sig.query}"</span>
                    <span className="font-mono-tabular text-[#526063]">{formatDateTime(sig.createdAt)}</span>
                  </div>
                  <p className="text-[#526063]">{sig.outcome} · {sig.inferredCategory}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
