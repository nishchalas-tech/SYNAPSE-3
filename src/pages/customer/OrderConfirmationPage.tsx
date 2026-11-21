import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, Truck } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useNetwork } from '../../context/NetworkContext';
import { formatDateTime, formatInr, getOrderStatusMeta } from '../../utils/formatters';

export function OrderConfirmationPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { state } = useNetwork();
  const order = state.orders.find((o) => o.id === orderId);

  if (!order) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <h1 className="text-xl font-semibold text-[#1A2022]">Order Not Found</h1>
        <Link to="/orders" className="inline-flex px-4 py-2 text-sm font-medium text-white bg-[#264C4F] rounded-lg">
          View My Orders
        </Link>
      </div>
    );
  }

  const statusMeta = getOrderStatusMeta(order.status);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div className="bg-white border border-[#E1E5E4] rounded-xl p-6 sm:p-8 space-y-6">
        <div className="flex items-start gap-4 pb-6 border-b border-[#EEF1F0]">
          <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#264C4F]">Demo Order Confirmed</p>
              <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
            </div>
            <h1 className="text-2xl font-semibold text-[#1A2022] font-mono-tabular">
              {order.orderNumber}
            </h1>
            <p className="text-sm text-[#526063]">
              Placed on {formatDateTime(order.createdAt)}. Assigned to <strong>{order.storeName}</strong> for store pick confirmation.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#1A2022]">Items Reserved</h2>
          <ul className="divide-y divide-[#EEF1F0]">
            {order.items.map((item) => (
              <li key={item.productId} className="py-3 flex justify-between text-sm">
                <div>
                  <p className="font-medium text-[#1A2022]">{item.productName}</p>
                  <p className="text-xs text-[#526063] font-mono-tabular">
                    {item.sku} · Qty {item.quantity}
                  </p>
                </div>
                <span className="font-mono-tabular font-medium text-[#1A2022]">
                  {formatInr(item.unitPriceInr * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="pt-3 border-t border-[#EEF1F0] flex justify-between text-base font-semibold">
            <span>Demo Total</span>
            <span className="font-mono-tabular">{formatInr(order.totalInr)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link
            to={`/orders/${order.id}`}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg"
          >
            <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
            View Order Details
          </Link>
          <Link
            to={`/orders/${order.id}/track`}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-[#1A2022] border border-[#D4DAD8] hover:bg-[#F7F7F5] rounded-lg"
          >
            <Truck className="w-4 h-4" aria-hidden="true" />
            Track Fulfilment
          </Link>
        </div>
      </div>
    </div>
  );
}
