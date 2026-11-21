import { useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { formatDateTime, getPickTaskStatusMeta } from '../../utils/formatters';

export function ManagerTasksPage() {
  const { session } = useAuth();
  const { state } = useNetwork();
  const [tab, setTab] = useState<'PENDING' | 'HISTORY' | 'ALL'>('PENDING');

  const storeId = session?.assignedStoreId || 'indiranagar';
  const store = state.stores.find((s) => s.id === storeId) || state.stores[0];

  const tasks = state.pickTasks
    .filter((t) => t.storeId === store.id)
    .filter((t) => {
      if (tab === 'PENDING') return t.status === 'PENDING';
      if (tab === 'HISTORY') return t.status !== 'PENDING';
      return true;
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A2022]">Pick Tasks — {store.locality}</h1>
          <p className="text-sm text-[#526063] mt-1">
            Accept confirmed shelf picks or reject with a reason to trigger Adaptive Fulfilment store evaluation.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#E9ECEB] rounded-lg self-start">
          {(['PENDING', 'HISTORY', 'ALL'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === t ? 'bg-white text-[#1A2022] shadow-xs' : 'text-[#526063]'
              }`}
            >
              {t === 'PENDING' ? 'Pending' : t === 'HISTORY' ? 'Processed' : 'All Tasks'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-[#E1E5E4] rounded-xl overflow-hidden">
        {tasks.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <h2 className="text-base font-semibold text-[#1A2022]">No pick tasks in this view</h2>
            <p className="text-sm text-[#526063]">
              New customer orders assigned to {store.name} appear here automatically.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EEF1F0]">
            {tasks.map((task) => {
              const meta = getPickTaskStatusMeta(task.status);
              return (
                <div
                  key={task.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#FAFBFA]"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-sm font-semibold font-mono-tabular text-[#1A2022]">
                        {task.orderNumber}
                      </span>
                      <StatusBadge label={meta.label} tone={meta.tone} />
                      {task.reassignedFromStoreId && (
                        <span className="text-xs text-[#264C4F]">
                          Reassigned from {task.reassignedFromStoreId}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-[#1A2022]">
                      {task.productName} · <span className="font-mono-tabular">Qty {task.quantity}</span>
                    </p>
                    <p className="text-xs text-[#526063] font-mono-tabular">
                      Created {formatDateTime(task.createdAt)}
                      {task.rejectionReason ? ` · Reason: ${task.rejectionReason}` : ''}
                    </p>
                  </div>

                  <Link
                    to={`/manager/tasks/${task.id}`}
                    className="px-4 py-2 text-xs font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg whitespace-nowrap self-start sm:self-center"
                  >
                    {task.status === 'PENDING' ? 'Review & Decide' : 'View Task'}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
