import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, PackageCheck } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { formatDateTime, getFreshnessState, getPickTaskStatusMeta } from '../../utils/formatters';

export function ManagerOverviewPage() {
  const { session } = useAuth();
  const { state } = useNetwork();

  const storeId = session?.assignedStoreId || 'indiranagar';
  const store = state.stores.find((s) => s.id === storeId) || state.stores[0];
  const storeInventory = state.inventory.filter((i) => i.storeId === store.id);
  const storeTasks = state.pickTasks.filter((t) => t.storeId === store.id);
  const pendingTasks = storeTasks.filter((t) => t.status === 'PENDING');
  const staleOrDiscrepancyItems = storeInventory.filter((inv) => {
    const freshness = getFreshnessState(inv.lastVerifiedAt);
    return freshness.state !== 'FRESH' || inv.recordedQty !== inv.verifiedQty;
  });
  const recentVerifications = state.verifications.filter((v) => v.storeId === store.id).slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#1A2022]">{store.name} Operations</h1>
        <p className="text-sm text-[#526063] mt-1">
          Store-scoped workspace for physical inventory verification and order pick execution.
        </p>
      </div>

      {/* Operational Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E1E5E4] rounded-xl p-5">
          <p className="text-xs text-[#526063]">Pending Pick Tasks</p>
          <p className="text-2xl font-semibold font-mono-tabular text-[#1A2022] mt-1">
            {pendingTasks.length}
          </p>
          <Link
            to="/manager/tasks"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#264C4F] mt-3 hover:underline"
          >
            Open Pick Queue
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="bg-white border border-[#E1E5E4] rounded-xl p-5">
          <p className="text-xs text-[#526063]">SKUs Needing Verification / Discrepancy</p>
          <p className="text-2xl font-semibold font-mono-tabular text-[#1A2022] mt-1">
            {staleOrDiscrepancyItems.length}
          </p>
          <Link
            to="/manager/inventory"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#264C4F] mt-3 hover:underline"
          >
            Open Stock Whisperer
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="bg-white border border-[#E1E5E4] rounded-xl p-5">
          <p className="text-xs text-[#526063]">Total Sellable Units at Store</p>
          <p className="text-2xl font-semibold font-mono-tabular text-[#1A2022] mt-1">
            {storeInventory.reduce((sum, i) => sum + i.sellableQty, 0)}
          </p>
          <Link
            to="/manager/transfers"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#264C4F] mt-3 hover:underline"
          >
            Request Branch Transfer ({storeInventory.length} SKUs)
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Pick Tasks */}
        <section className="bg-white border border-[#E1E5E4] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#1A2022] inline-flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#264C4F]" aria-hidden="true" />
              Active Pick Tasks
            </h2>
            <Link to="/manager/tasks" className="text-xs font-medium text-[#264C4F] hover:underline">
              View all
            </Link>
          </div>

          {pendingTasks.length === 0 ? (
            <p className="text-sm text-[#526063] py-4">No pending pick tasks at {store.locality}.</p>
          ) : (
            <div className="divide-y divide-[#EEF1F0]">
              {pendingTasks.map((task) => {
                const meta = getPickTaskStatusMeta(task.status);
                return (
                  <div key={task.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono-tabular font-semibold text-[#1A2022]">
                          {task.orderNumber}
                        </span>
                        <StatusBadge label={meta.label} tone={meta.tone} />
                      </div>
                      <p className="text-sm text-[#1A2022] truncate mt-1">
                        {task.productName} · <span className="font-mono-tabular">Qty {task.quantity}</span>
                      </p>
                    </div>
                    <Link
                      to={`/manager/tasks/${task.id}`}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-md whitespace-nowrap"
                    >
                      Inspect
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Stock Whisperer Priority List */}
        <section className="bg-white border border-[#E1E5E4] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#1A2022] inline-flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-[#264C4F]" aria-hidden="true" />
              Stock Whisperer Attention List
            </h2>
            <Link to="/manager/inventory" className="text-xs font-medium text-[#264C4F] hover:underline">
              Full inventory
            </Link>
          </div>

          {staleOrDiscrepancyItems.length === 0 ? (
            <p className="text-sm text-[#526063] py-4">All store SKUs are freshly verified with zero discrepancy.</p>
          ) : (
            <div className="divide-y divide-[#EEF1F0]">
              {staleOrDiscrepancyItems.slice(0, 5).map((inv) => {
                const product = state.products.find((p) => p.id === inv.productId);
                const freshness = getFreshnessState(inv.lastVerifiedAt);
                return (
                  <div key={inv.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#1A2022] truncate">{product?.name}</p>
                      <p className="text-xs text-[#526063] font-mono-tabular mt-0.5">
                        {inv.recordedQty} recorded · {inv.verifiedQty} verified · {inv.sellableQty} sellable ·{' '}
                        {freshness.relativeText}
                      </p>
                    </div>
                    <Link
                      to={`/manager/inventory/${inv.productId}`}
                      className="px-3 py-1.5 text-xs font-medium text-[#264C4F] bg-[#E7F0EE] hover:bg-[#D5E5E2] rounded-md whitespace-nowrap"
                    >
                      Verify
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Recent Verifications */}
      <section className="bg-white border border-[#E1E5E4] rounded-xl p-5 space-y-3">
        <h2 className="text-base font-semibold text-[#1A2022]">Recent Store Verification Logs</h2>
        {recentVerifications.length === 0 ? (
          <p className="text-sm text-[#526063]">No physical counts logged yet.</p>
        ) : (
          <div className="divide-y divide-[#EEF1F0]">
            {recentVerifications.map((ver) => (
              <div key={ver.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-semibold text-[#1A2022]">{ver.productName}</span>
                  <span className="text-[#526063] ml-2 font-mono-tabular">
                    {ver.recordedQty} rec / {ver.verifiedQty} ver / {ver.newSellableQty} sellable
                  </span>
                  {ver.discrepancyReason && (
                    <span className="text-amber-800 ml-2">({ver.discrepancyReason})</span>
                  )}
                </div>
                <span className="font-mono-tabular text-[#526063]">{formatDateTime(ver.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
