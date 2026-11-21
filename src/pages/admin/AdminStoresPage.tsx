import { Link } from 'react-router-dom';
import { ArrowRight, MapPin } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useNetwork } from '../../context/NetworkContext';
import { formatInr, getFreshnessState } from '../../utils/formatters';

export function AdminStoresPage() {
  const { state } = useNetwork();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#1A2022]">Store Network</h1>
        <p className="text-sm text-[#526063] mt-1">
          Fictional Bengaluru retail demo nodes connected to the SYNAPSE fulfilment layer.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {state.stores.map((store) => {
          const inv = state.inventory.filter((i) => i.storeId === store.id);
          const sellable = inv.reduce((s, r) => s + r.sellableQty, 0);
          const stale = inv.filter((r) => getFreshnessState(r.lastVerifiedAt).state === 'STALE').length;
          const pending = state.pickTasks.filter(
            (t) => t.storeId === store.id && t.status === 'PENDING'
          ).length;

          return (
            <div key={store.id} className="bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-[#1A2022]">{store.name}</h2>
                  <p className="text-xs text-[#526063] mt-1 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#264C4F] shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{store.address}</span>
                  </p>
                </div>
                <StatusBadge label={store.isOpen ? 'Active Node' : 'Paused'} tone={store.isOpen ? 'success' : 'neutral'} />
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#EEF1F0] text-xs">
                <div>
                  <dt className="text-[#526063]">Sellable</dt>
                  <dd className="font-mono-tabular font-semibold text-sm text-[#1A2022] mt-0.5">{sellable}</dd>
                </div>
                <div>
                  <dt className="text-[#526063]">Stale SKUs</dt>
                  <dd className="font-mono-tabular font-semibold text-sm text-[#1A2022] mt-0.5">{stale}</dd>
                </div>
                <div>
                  <dt className="text-[#526063]">Pending Picks</dt>
                  <dd className="font-mono-tabular font-semibold text-sm text-[#1A2022] mt-0.5">{pending}</dd>
                </div>
                <div>
                  <dt className="text-[#526063]">Delivery Fee</dt>
                  <dd className="font-mono-tabular font-semibold text-sm text-[#1A2022] mt-0.5">
                    {formatInr(store.deliveryFeeInr)}
                  </dd>
                </div>
              </dl>

              <div className="flex items-center justify-between pt-2 text-xs">
                <span className="text-[#526063]">Manager: {store.managerName}</span>
                <Link
                  to={`/admin/stores/${store.id}`}
                  className="inline-flex items-center gap-1 font-medium text-[#264C4F] hover:underline"
                >
                  Inspect Store
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
