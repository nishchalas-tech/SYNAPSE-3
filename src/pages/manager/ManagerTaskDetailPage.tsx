import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { formatDateTime, getPickTaskStatusMeta } from '../../utils/formatters';

export function ManagerTaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const { session } = useAuth();
  const { state, acceptPickTask, rejectPickTask } = useNetwork();

  const [rejectReason, setRejectReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [actionResult, setActionResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const task = state.pickTasks.find((t) => t.id === taskId);
  const storeId = session?.assignedStoreId || 'indiranagar';

  if (!task || !session) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[#526063]">Pick task not found.</p>
        <Link to="/manager/tasks" className="text-sm font-medium text-[#264C4F] underline">
          Back to Pick Tasks
        </Link>
      </div>
    );
  }

  if (session.role === 'STORE_MANAGER' && task.storeId !== storeId) {
    return (
      <div className="bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-3">
        <h1 className="text-lg font-semibold text-[#1A2022]">Store Scope Restricted</h1>
        <p className="text-sm text-[#526063]">
          This pick task belongs to {task.storeName}. You can only operate on your assigned store.
        </p>
        <Link to="/manager/tasks" className="text-sm font-medium text-[#264C4F] underline">
          Return to Your Store Tasks
        </Link>
      </div>
    );
  }

  const order = state.orders.find((o) => o.id === task.orderId);
  const inv = state.inventory.find(
    (r) => r.storeId === task.storeId && r.productId === task.productId
  );
  const meta = getPickTaskStatusMeta(task.status);

  const handleAccept = async () => {
    setSubmitting(true);
    const res = await acceptPickTask(task.id, session);
    setSubmitting(false);
    setActionResult({ ok: res.ok, text: res.message });
  };

  const handleReject = async () => {
    setSubmitting(true);
    const res = await rejectPickTask(task.id, rejectReason, session);
    setSubmitting(false);
    setActionResult({ ok: res.ok, text: res.message });
    if (res.ok) {
      setShowRejectBox(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        to="/manager/tasks"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#526063] hover:text-[#1A2022]"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Back to Pick Tasks
      </Link>

      <div className="bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#EEF1F0]">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold font-mono-tabular text-[#1A2022]">
                {task.orderNumber}
              </h1>
              <StatusBadge label={meta.label} tone={meta.tone} />
            </div>
            <p className="text-xs text-[#526063] mt-1">
              Assigned Store: <strong className="text-[#1A2022]">{task.storeName}</strong> · Created{' '}
              {formatDateTime(task.createdAt)}
            </p>
          </div>
        </div>

        {actionResult && (
          <div
            role="status"
            className={`p-4 rounded-lg border text-xs ${
              actionResult.ok
                ? 'bg-[#E7F0EE] border-[#C9DBD7] text-[#1A2022]'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            {actionResult.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-[#1A2022]">Pick Item Details</h2>
            <div className="p-4 bg-[#F7F7F5] border border-[#E1E5E4] rounded-lg space-y-1.5 text-sm">
              <p className="font-semibold text-[#1A2022]">{task.productName}</p>
              <p className="text-xs text-[#526063] font-mono-tabular">
                Requested Quantity: {task.quantity} unit(s)
              </p>
              {inv && (
                <p className="text-xs text-[#526063] font-mono-tabular">
                  Store Inventory: {inv.verifiedQty} verified · {inv.reservedQty} reserved · {inv.sellableQty} sellable
                </p>
              )}
            </div>
          </div>

          {order && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-[#1A2022]">Customer Order Context</h2>
              <div className="p-4 bg-[#F7F7F5] border border-[#E1E5E4] rounded-lg space-y-1.5 text-xs text-[#526063]">
                <p className="font-semibold text-[#1A2022]">{order.customerName}</p>
                <p>{order.city}</p>
                <p>Fulfilment Note: {order.fulfilmentNote}</p>
              </div>
            </div>
          )}
        </div>

        {task.status === 'PENDING' ? (
          <div className="pt-4 border-t border-[#EEF1F0] space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleAccept()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] disabled:opacity-60 rounded-lg transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                Accept & Confirm Physical Pick
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowRejectBox((prev) => !prev)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-60 rounded-lg transition-colors"
              >
                <XCircle className="w-4 h-4" aria-hidden="true" />
                Reject Pick Task
              </button>
            </div>

            {showRejectBox && (
              <div className="p-4 bg-red-50/60 border border-red-200 rounded-lg space-y-3">
                <div className="flex items-start gap-2 text-xs text-red-900">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <p>
                    Rejecting releases the reservation at {task.storeName} and immediately evaluates eligible alternative Bengaluru stores to rescue the customer order.
                  </p>
                </div>
                <div>
                  <label htmlFor="reject-reason" className="block text-xs font-medium text-[#1A2022] mb-1">
                    Mandatory Rejection Reason
                  </label>
                  <input
                    id="reject-reason"
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g., Sealed unit damaged during inspection"
                    className="w-full px-3.5 py-2 text-sm bg-white border border-red-300 rounded-lg focus:outline-none focus:border-red-600"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleReject()}
                    className="px-4 py-2 text-xs font-medium text-white bg-red-700 hover:bg-red-800 disabled:opacity-60 rounded-lg"
                  >
                    {submitting ? 'Reassigning Order...' : 'Confirm Reject & Evaluate Alternate Store'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRejectBox(false)}
                    className="px-3 py-2 text-xs text-[#526063]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          task.rejectionReason && (
            <div className="p-4 bg-[#F7F7F5] border border-[#E1E5E4] rounded-lg text-xs text-[#526063]">
              Recorded Rejection Reason: <strong className="text-[#1A2022]">{task.rejectionReason}</strong>
            </div>
          )
        )}
      </div>
    </div>
  );
}
