import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useNetwork } from '../../context/NetworkContext';
import { formatDateTime, getFreshnessState } from '../../utils/formatters';

export function AdminOverviewPage() {
  const { state } = useNetwork();

  const totalSellable = state.inventory.reduce((sum, i) => sum + i.sellableQty, 0);
  const totalCartHolds = state.inventory.reduce((sum, i) => sum + (i.cartHoldQty || 0), 0);
  const discrepancies = state.inventory.filter((i) => i.recordedQty !== i.verifiedQty).length;
  const staleSkus = state.inventory.filter((i) => getFreshnessState(i.lastVerifiedAt).state === 'STALE').length;
  const pendingTransfers = state.transferRecommendations.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#1A2022]">Network Overview</h1>
        <p className="text-sm text-[#526063] mt-1">
          Operational visibility across the 4 fictional Bengaluru demo store nodes.
        </p>
      </div>

      {/* 4-column Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E1E5E4] rounded-xl p-5">
          <p className="text-xs text-[#526063]">Network Sellable Units</p>
          <p className="text-2xl font-semibold font-mono-tabular text-[#1A2022] mt-1">{totalSellable}</p>
          <p className="text-xs text-[#526063] mt-2">
            Across {state.stores.length} stores · {totalCartHolds} in 10m cart holds
          </p>
        </div>
        <div className="bg-white border border-[#E1E5E4] rounded-xl p-5">
          <p className="text-xs text-[#526063]">Stock Discrepancies / Stale SKUs</p>
          <p className="text-2xl font-semibold font-mono-tabular text-[#1A2022] mt-1">
            {discrepancies} <span className="text-sm font-normal text-[#526063]">/ {staleSkus} stale</span>
          </p>
          <Link to="/admin/inventory" className="text-xs font-medium text-[#264C4F] hover:underline mt-2 inline-block">
            Inspect Inventory
          </Link>
        </div>
        <div className="bg-white border border-[#E1E5E4] rounded-xl p-5">
          <p className="text-xs text-[#526063]">Demand Radar / Actual Orders</p>
          <p className="text-2xl font-semibold font-mono-tabular text-[#1A2022] mt-1">
            {state.demandSignals.length}{' '}
            <span className="text-sm font-normal text-[#526063]">/ {state.orders.length} orders</span>
          </p>
          <Link to="/admin/demand-radar" className="text-xs font-medium text-[#264C4F] hover:underline mt-2 inline-block">
            Open Demand Radar
          </Link>
        </div>
        <div className="bg-white border border-[#E1E5E4] rounded-xl p-5">
          <p className="text-xs text-[#526063]">Pending Transfer Recommendations</p>
          <p className="text-2xl font-semibold font-mono-tabular text-[#1A2022] mt-1">
            {pendingTransfers}
          </p>
          <Link to="/admin/transfers" className="text-xs font-medium text-[#264C4F] hover:underline mt-2 inline-block">
            Review Transfer Queue
          </Link>
        </div>
      </div>

      {/* Store Network Strip */}
      <section className="bg-white border border-[#E1E5E4] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#1A2022]">Bengaluru Demo Store Nodes</h2>
          <Link to="/admin/stores" className="text-xs font-medium text-[#264C4F] hover:underline">
            Store Directory
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {state.stores.map((store) => {
            const inv = state.inventory.filter((i) => i.storeId === store.id);
            const sellable = inv.reduce((sum, r) => sum + r.sellableQty, 0);
            const oos = inv.filter((r) => r.sellableQty === 0).length;
            const pendingTasks = state.pickTasks.filter(
              (t) => t.storeId === store.id && t.status === 'PENDING'
            ).length;

            return (
              <Link
                key={store.id}
                to={`/admin/stores/${store.id}`}
                className="p-4 border border-[#E1E5E4] rounded-lg hover:border-[#264C4F] transition-colors space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#1A2022]">{store.locality}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#526063]" aria-hidden="true" />
                </div>
                <div className="text-xs text-[#526063] font-mono-tabular space-y-0.5">
                  <p>{sellable} sellable units</p>
                  <p>{oos} out-of-stock SKUs</p>
                  <p>{pendingTasks} pending pick tasks</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent Cross-Portal Activity */}
      <section className="bg-white border border-[#E1E5E4] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#1A2022]">Recent Cross-Portal Activity</h2>
          <Link to="/admin/activity" className="text-xs font-medium text-[#264C4F] hover:underline">
            Full Activity Log
          </Link>
        </div>
        <div className="divide-y divide-[#EEF1F0]">
          {state.activityLogs.slice(0, 8).map((log) => (
            <div key={log.id} className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <StatusBadge label={log.eventType} tone="teal" withIcon={false} />
                <span className="text-[#1A2022] truncate">{log.summary}</span>
              </div>
              <span className="font-mono-tabular text-[#526063] shrink-0">
                {formatDateTime(log.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
