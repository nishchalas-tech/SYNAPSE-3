import { Link } from 'react-router-dom';
import { ArrowRight, Package } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { formatDateTime, formatInr, getOrderStatusMeta } from '../../utils/formatters';

export function MyOrdersPage() {
  const { state } = useNetwork();
  const { session } = useAuth();

  // Show orders belonging to current customer or seeded demo orders for seamless demo walkthrough
  const orders = state.orders.filter(
    (o) => !session || session.role !== 'CUSTOMER' || o.customerId === session.uid || o.isSeeded
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#1A2022]">My Orders</h1>
        <p className="text-sm text-[#526063] mt-1">
          Live store pick confirmation, reassignments, and fulfilment updates across SYNAPSE stores.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white border border-[#E1E5E4] rounded-xl p-10 text-center space-y-3">
          <Package className="w-8 h-8 text-[#264C4F] mx-auto" aria-hidden="true" />
          <h2 className="text-base font-semibold text-[#1A2022]">No demo orders yet</h2>
          <p className="text-sm text-[#526063]">Place a demo order from the catalog to track store pick decisions.</p>
          <Link
            to="/catalogue"
            className="inline-flex px-4 py-2 text-xs font-medium text-white bg-[#264C4F] rounded-lg"
          >
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const meta = getOrderStatusMeta(order.status);
            return (
              <div
                key={order.id}
                className="bg-white border border-[#E1E5E4] rounded-xl p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#EEF1F0]">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-semibold font-mono-tabular text-[#1A2022]">
                        {order.orderNumber}
                      </span>
                      <StatusBadge label={meta.label} tone={meta.tone} />
                    </div>
                    <p className="text-xs text-[#526063]">
                      Placed {formatDateTime(order.createdAt)} · Fulfilled by{' '}
                      <strong className="text-[#1A2022]">{order.storeName}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-base font-semibold font-mono-tabular text-[#1A2022]">
                      {formatInr(order.totalInr)}
                    </span>
                    <Link
                      to={`/orders/${order.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#264C4F] bg-[#E7F0EE] hover:bg-[#D5E5E2] rounded-md"
                    >
                      Details
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#526063]">
                  <span>
                    {order.items.map((i) => `${i.productName} (x${i.quantity})`).join(', ')}
                  </span>
                  <Link
                    to={`/orders/${order.id}/track`}
                    className="font-medium text-[#264C4F] hover:underline"
                  >
                    View Fulfilment Timeline
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
