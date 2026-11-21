import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useNetwork } from '../../context/NetworkContext';
import { formatDateTime, getOrderStatusMeta } from '../../utils/formatters';

export function OrderTrackingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { state } = useNetwork();
  const order = state.orders.find((o) => o.id === orderId);

  if (!order) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <h1 className="text-xl font-semibold text-[#1A2022]">Order Not Found</h1>
        <Link to="/orders" className="inline-flex px-4 py-2 text-sm font-medium text-white bg-[#264C4F] rounded-lg">
          Back to My Orders
        </Link>
      </div>
    );
  }

  const meta = getOrderStatusMeta(order.status);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link
        to={`/orders/${order.id}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#526063] hover:text-[#1A2022]"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Back to Order Details
      </Link>

      <div className="bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#EEF1F0]">
          <div>
            <h1 className="text-xl font-semibold text-[#1A2022]">
              Fulfilment Milestones · <span className="font-mono-tabular">{order.orderNumber}</span>
            </h1>
            <p className="text-xs text-[#526063] mt-1">
              Operational status updates recorded from Store Manager pick actions.
            </p>
          </div>
          <StatusBadge label={meta.label} tone={meta.tone} />
        </div>

        <ol className="space-y-5">
          {order.timeline.map((step, idx) => {
            const isLatest = idx === order.timeline.length - 1;
            return (
              <li key={step.id} className="flex gap-3.5">
                <div className="pt-0.5 shrink-0">
                  {isLatest && order.status === 'PICK_PENDING' ? (
                    <Clock className="w-5 h-5 text-amber-600" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-[#264C4F]" aria-hidden="true" />
                  )}
                </div>
                <div className="flex-1 pb-4 border-b border-[#EEF1F0] last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[#1A2022]">{step.title}</p>
                    <span className="text-xs font-mono-tabular text-[#526063]">
                      {formatDateTime(step.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs text-[#526063] mt-1">{step.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
