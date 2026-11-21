import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Clock, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { formatCountdown, formatInr, getPreferenceLabel } from '../../utils/formatters';

export function CheckoutPage() {
  const { state, placeDemoOrder } = useNetwork();
  const { session } = useAuth();
  const navigate = useNavigate();

  const [customerName, setCustomerName] = useState(session?.displayName || 'Aarav Sharma');
  const [customerEmail, setCustomerEmail] = useState(session?.email || 'customer@synapse.demo');
  const [customerPhone, setCustomerPhone] = useState('+91 98450 11223');
  const [shippingAddress, setShippingAddress] = useState('42, 12th Main Road, HAL 2nd Stage, Indiranagar');
  const [city, setCity] = useState(session?.city || 'Bengaluru');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [submitting, setSubmitting] = useState(false);

  const hasTimedItems = state.cart.some((c) => c.isTimedHold && c.expiresAt);

  useEffect(() => {
    if (!hasTimedItems) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasTimedItems]);

  if (state.cart.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <h1 className="text-xl font-semibold text-[#1A2022]">No items ready for checkout</h1>
        <p className="text-sm text-[#526063]">Add products to your cart before completing demo checkout.</p>
        <Link
          to="/catalogue"
          className="inline-flex px-4 py-2 text-sm font-medium text-white bg-[#264C4F] rounded-lg"
        >
          Browse Catalogue
        </Link>
      </div>
    );
  }

  const assignedStore = state.stores.find((s) => s.id === state.cart[0].storeId);
  const preference = state.cart[0].fulfilmentPreference;
  const timedItems = state.cart.filter((item) => item.isTimedHold && item.expiresAt);
  const earliestExpiry =
    timedItems.length > 0
      ? timedItems.reduce((min, item) => {
          if (!min) return item.expiresAt!;
          return new Date(item.expiresAt!).getTime() < new Date(min).getTime()
            ? item.expiresAt!
            : min;
        }, timedItems[0].expiresAt!)
      : null;
  const subtotalInr = state.cart.reduce((sum, item) => {
    const product = state.products.find((p) => p.id === item.productId);
    return sum + (product?.priceInr || 0) * item.quantity;
  }, 0);
  const deliveryFeeInr = assignedStore?.deliveryFeeInr || 0;
  const totalInr = subtotalInr + deliveryFeeInr;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (customerName.trim().length < 2) {
      setErrorMsg('Please enter the recipient full name.');
      return;
    }
    if (!customerEmail.includes('@')) {
      setErrorMsg('Please enter a valid contact email.');
      return;
    }
    if (customerPhone.trim().length < 8) {
      setErrorMsg('Please enter a valid contact phone number.');
      return;
    }
    if (shippingAddress.trim().length < 8) {
      setErrorMsg('Please enter a complete Bengaluru delivery address.');
      return;
    }

    setSubmitting(true);
    const res = await placeDemoOrder({
      customerName,
      customerEmail,
      customerPhone,
      shippingAddress,
      city,
      session,
    });
    setSubmitting(false);

    if (!res.ok || !res.data) {
      setErrorMsg(res.message);
      return;
    }

    navigate(`/orders/confirmation/${res.data.id}`, { replace: true });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#E7F0EE] border border-[#C9DBD7] rounded-xl px-5 py-3.5">
        <div className="flex items-center gap-2 text-xs font-medium text-[#264C4F]">
          <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            DEMO CHECKOUT — Re-verifies sellable store stock and converts your cart allocation into a live Manager Pick Task.
          </span>
        </div>
        {earliestExpiry && (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono-tabular font-semibold text-[#264C4F]">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            Fixed 10m Hold {formatCountdown(earliestExpiry, nowMs)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <form onSubmit={handleSubmit} className="lg:col-span-7 bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-5">
          <h1 className="text-xl font-semibold text-[#1A2022]">Delivery & Contact Details</h1>

          {errorMsg && (
            <div role="alert" className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="chk-name" className="block text-xs font-medium text-[#1A2022] mb-1.5">
                Full Name
              </label>
              <input
                id="chk-name"
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
              />
            </div>
            <div>
              <label htmlFor="chk-phone" className="block text-xs font-medium text-[#1A2022] mb-1.5">
                Mobile Number
              </label>
              <input
                id="chk-phone"
                type="tel"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="chk-email" className="block text-xs font-medium text-[#1A2022] mb-1.5">
              Order Notification Email
            </label>
            <input
              id="chk-email"
              type="email"
              required
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
            />
          </div>

          <div>
            <label htmlFor="chk-addr" className="block text-xs font-medium text-[#1A2022] mb-1.5">
              Delivery Address
            </label>
            <textarea
              id="chk-addr"
              rows={2}
              required
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
            />
          </div>

          <div>
            <label htmlFor="chk-city" className="block text-xs font-medium text-[#1A2022] mb-1.5">
              City
            </label>
            <input
              id="chk-city"
              type="text"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
            />
          </div>

          <div className="p-4 bg-[#F7F7F5] border border-[#E1E5E4] rounded-lg text-xs text-[#526063]">
            Demo Settlement Mode: Placing this order reserves sellable inventory at{' '}
            <strong className="text-[#1A2022]">{assignedStore?.name}</strong> and creates a store pick task. No real card or UPI charge occurs.
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] disabled:opacity-60 rounded-lg transition-colors"
          >
            <Lock className="w-4 h-4" aria-hidden="true" />
            {submitting ? 'Confirming Reservation...' : `Place Demo Order (${formatInr(totalInr)})`}
          </button>
        </form>

        <div className="lg:col-span-5 bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[#1A2022]">Order Review</h2>
            <span className="text-xs font-mono-tabular text-[#264C4F]">
              {earliestExpiry ? `Hold ${formatCountdown(earliestExpiry, nowMs)}` : 'Standard Allocation'}
            </span>
          </div>
          <p className="text-xs text-[#526063]">
            Fulfilment Store: <strong className="text-[#1A2022]">{assignedStore?.name}</strong> ({getPreferenceLabel(preference)})
          </p>

          <ul className="divide-y divide-[#EEF1F0]">
            {state.cart.map((item) => {
              const product = state.products.find((p) => p.id === item.productId);
              if (!product) return null;
              return (
                <li key={item.id} className="py-3 flex justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium text-[#1A2022]">{product.name}</p>
                    <p className="text-xs text-[#526063] font-mono-tabular">
                      Qty {item.quantity} ·{' '}
                      {item.isTimedHold && item.expiresAt
                        ? `${formatCountdown(item.expiresAt, nowMs)} fixed hold`
                        : 'Standard allocation'}
                    </p>
                  </div>
                  <span className="font-mono-tabular font-medium text-[#1A2022]">
                    {formatInr(product.priceInr * item.quantity)}
                  </span>
                </li>
              );
            })}
          </ul>

          <dl className="pt-3 border-t border-[#EEF1F0] space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#526063]">Subtotal</dt>
              <dd className="font-mono-tabular">{formatInr(subtotalInr)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#526063]">Fulfilment Fee</dt>
              <dd className="font-mono-tabular">{deliveryFeeInr === 0 ? 'Free' : formatInr(deliveryFeeInr)}</dd>
            </div>
            <div className="flex justify-between pt-2 border-t border-[#EEF1F0] font-semibold">
              <dt>Demo Total</dt>
              <dd className="font-mono-tabular">{formatInr(totalInr)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
