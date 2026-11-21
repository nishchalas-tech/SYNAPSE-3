import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Truck } from 'lucide-react';
import { ProductImage } from '../../components/products/ProductImage';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useNetwork } from '../../context/NetworkContext';
import { formatDateTime, formatInr, getOrderStatusMeta, getPreferenceLabel } from '../../utils/formatters';

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { state } = useNetwork();
  const order = state.orders.find((o) => o.id === orderId);

  if (!order) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <h1 className="text-xl font-semibold text-[#1A2022]">Order Not Found</h1>
        <Link to="/orders" className="inline-flex px-4 py-2 text-sm font-medium text-white bg-[#264C4F] rounded-lg">
          Back to My Orders
        </Link>
      </div>
    );
  }

  const meta = getOrderStatusMeta(order.status);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link
        to="/orders"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#526063] hover:text-[#1A2022]"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Back to My Orders
      </Link>

      <div className="bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#EEF1F0]">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold font-mono-tabular text-[#1A2022]">
                {order.orderNumber}
              </h1>
              <StatusBadge label={meta.label} tone={meta.tone} />
            </div>
            <p className="text-xs text-[#526063] mt-1">
              Placed {formatDateTime(order.createdAt)} · Preference: {getPreferenceLabel(order.fulfilmentPreference)}
            </p>
          </div>
          <Link
            to={`/orders/${order.id}/track`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg"
          >
            <Truck className="w-3.5 h-3.5" aria-hidden="true" />
            Track Fulfilment
          </Link>
        </div>

        {/* Adaptive Fulfilment Notice (surfaces store reassignments or exceptions honestly) */}
        <div
          className={`p-4 rounded-lg border text-xs leading-relaxed ${
            order.status === 'EXCEPTION'
              ? 'bg-red-50 border-red-200 text-red-900'
              : order.status === 'REASSIGNED'
                ? 'bg-[#E7F0EE] border-[#C9DBD7] text-[#1A2022]'
                : 'bg-[#F7F7F5] border-[#E1E5E4] text-[#526063]'
          }`}
        >
          <p className="font-semibold text-[#1A2022] mb-0.5">
            Current Fulfilment Node: {order.storeName}
          </p>
          <p>{order.fulfilmentNote}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[#1A2022]">Order Items</h2>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.productId} className="flex items-center gap-3 p-3 border border-[#EEF1F0] rounded-lg">
                  <div className="w-16 shrink-0 rounded overflow-hidden">
                    <ProductImage src={item.imageUrl} alt={item.productName} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1A2022] truncate">{item.productName}</p>
                    <p className="text-xs text-[#526063] font-mono-tabular">
                      Qty {item.quantity} · {formatInr(item.unitPriceInr)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[#1A2022]">Delivery & Totals</h2>
            <div className="p-4 bg-[#F7F7F5] rounded-lg space-y-2 text-xs text-[#526063]">
              <p className="font-medium text-[#1A2022]">{order.customerName}</p>
              <p>{order.shippingAddress}</p>
              <p>{order.city} · {order.customerPhone}</p>
            </div>
            <dl className="space-y-1.5 text-sm pt-2">
              <div className="flex justify-between">
                <dt className="text-[#526063]">Subtotal</dt>
                <dd className="font-mono-tabular">{formatInr(order.subtotalInr)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#526063]">Fulfilment Fee</dt>
                <dd className="font-mono-tabular">{formatInr(order.deliveryFeeInr)}</dd>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#EEF1F0] font-semibold">
                <dt>Total</dt>
                <dd className="font-mono-tabular">{formatInr(order.totalInr)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
