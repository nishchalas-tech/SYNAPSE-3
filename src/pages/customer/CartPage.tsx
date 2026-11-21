import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, Lock, ShoppingBag, Store as StoreIcon, Trash2 } from 'lucide-react';
import { ProductImage } from '../../components/products/ProductImage';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useNetwork } from '../../context/NetworkContext';
import { formatCountdown, formatInr, getPreferenceLabel, getRemainingSeconds } from '../../utils/formatters';

export function CartPage() {
  const { state, updateCartQuantity, removeFromCart, refreshState } = useNetwork();
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const hasTimedItems = state.cart.some((c) => c.isTimedHold && c.expiresAt);

  useEffect(() => {
    if (!hasTimedItems) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasTimedItems]);

  if (state.cart.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white border border-[#E1E5E4] rounded-xl p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-[#F0F2F1] text-[#264C4F] flex items-center justify-center mx-auto">
            <ShoppingBag className="w-6 h-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold text-[#1A2022]">Your shopping cart is empty</h1>
          <p className="text-sm text-[#526063] max-w-md mx-auto">
            Explore our Bengaluru electronics catalog to reserve verified shelf units. High-demand or low-stock SKUs receive a fixed, non-renewable 10-minute hold.
          </p>
          <div className="pt-2">
            <Link
              to="/catalogue"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg transition-colors"
            >
              Browse Catalogue
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const assignedStore = state.stores.find((s) => s.id === state.cart[0].storeId);
  const preference = state.cart[0].fulfilmentPreference;

  const subtotalInr = state.cart.reduce((sum, item) => {
    const product = state.products.find((p) => p.id === item.productId);
    return sum + (product?.priceInr || 0) * item.quantity;
  }, 0);
  const deliveryFeeInr = assignedStore?.deliveryFeeInr || 0;
  const totalInr = subtotalInr + deliveryFeeInr;

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
  const minRemainingSec = getRemainingSeconds(earliestExpiry, nowMs);

  const handleQtyChange = async (cartItemId: string, nextQty: number) => {
    setBusyItemId(cartItemId);
    const res = await updateCartQuantity(cartItemId, nextQty);
    setBusyItemId(null);
    setErrorMsg(res.ok ? null : res.message);
    if (!res.ok) {
      void refreshState();
    }
  };

  const handleRemove = async (cartItemId: string) => {
    setBusyItemId(cartItemId);
    const res = await removeFromCart(cartItemId);
    setBusyItemId(null);
    setErrorMsg(res.ok ? null : res.message);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A2022]">Shopping Cart</h1>
          <p className="text-sm text-[#526063] mt-1">
            Fulfilled as a single-store promise from {assignedStore?.name || 'selected store'}. High-demand reservations are fixed across refreshes and devices.
          </p>
        </div>

        {earliestExpiry && (
          <div className="flex items-center gap-3 bg-white border border-[#C9DBD7] rounded-xl px-4 py-2.5">
            <Clock
              className={`w-4 h-4 shrink-0 ${minRemainingSec < 120 ? 'text-amber-700' : 'text-[#264C4F]'}`}
              aria-hidden="true"
            />
            <div className="text-xs">
              <p className="text-[#526063] inline-flex items-center gap-1">
                <Lock className="w-3 h-3 text-[#264C4F]" aria-hidden="true" />
                Fixed 10m Hold · Non-Renewable
              </p>
              <p
                className={`text-sm font-semibold font-mono-tabular ${
                  minRemainingSec < 120 ? 'text-amber-800' : 'text-[#264C4F]'
                }`}
              >
                {formatCountdown(earliestExpiry, nowMs)}
              </p>
              <p className="text-[11px] text-[#526063]">Cannot be renewed, extended, or reset</p>
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div role="alert" className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-4">
          {state.cart.map((item) => {
            const product = state.products.find((p) => p.id === item.productId);
            const inv = state.inventory.find(
              (r) => r.productId === item.productId && r.storeId === item.storeId
            );
            if (!product) return null;

            const isTimed = item.isTimedHold && Boolean(item.expiresAt);
            const remainingSec = isTimed ? getRemainingSeconds(item.expiresAt, nowMs) : 0;
            const isLowTime = isTimed && remainingSec < 120;
            const isBusy = busyItemId === item.id;

            return (
              <div
                key={item.id}
                className="bg-white border border-[#E1E5E4] rounded-xl p-4 sm:p-5 space-y-3"
              >
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <div className="w-full sm:w-32 shrink-0 rounded-lg overflow-hidden border border-[#EEF1F0]">
                    <ProductImage src={product.imageUrl} alt={product.name} />
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-[#526063]">
                      <span>{product.brand}</span>
                      <span aria-hidden="true">·</span>
                      <span>{product.sku}</span>
                    </div>
                    <Link
                      to={`/products/${product.id}`}
                      className="text-base font-semibold text-[#1A2022] hover:text-[#264C4F] block truncate"
                    >
                      {product.name}
                    </Link>
                    <p className="text-xs text-[#526063] font-mono-tabular">
                      {inv
                        ? `${inv.sellableQty} additional sellable · ${inv.cartHoldQty || 0} held in 10m holds at ${assignedStore?.locality}`
                        : 'Checking stock'}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-center">
                    <div className="flex items-center border border-[#D4DAD8] rounded-lg">
                      <button
                        type="button"
                        disabled={isBusy}
                        aria-label={`Decrease quantity for ${product.name}`}
                        onClick={() => void handleQtyChange(item.id, item.quantity - 1)}
                        className="px-2.5 py-1.5 text-sm hover:bg-[#F7F7F5] disabled:opacity-50"
                      >
                        -
                      </button>
                      <span className="px-3 py-1.5 text-sm font-mono-tabular">{item.quantity}</span>
                      <button
                        type="button"
                        disabled={isBusy}
                        aria-label={`Increase quantity for ${product.name}`}
                        onClick={() => void handleQtyChange(item.id, item.quantity + 1)}
                        className="px-2.5 py-1.5 text-sm hover:bg-[#F7F7F5] disabled:opacity-50"
                      >
                        +
                      </button>
                    </div>

                    <div className="text-right min-w-24">
                      <p className="text-sm font-semibold font-mono-tabular text-[#1A2022]">
                        {formatInr(product.priceInr * item.quantity)}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isBusy}
                      aria-label={`Remove ${product.name} from cart`}
                      onClick={() => void handleRemove(item.id)}
                      className="p-2 text-[#526063] hover:text-red-700 rounded-md disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Fixed Non-Renewable Hold vs Standard Allocation Bar */}
                <div className="pt-3 border-t border-[#EEF1F0] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={
                        isTimed
                          ? 'Fixed 10m Hold · Non-Renewable'
                          : 'Standard Cart Allocation'
                      }
                      tone={
                        isTimed
                          ? item.demandLevel === 'HIGH'
                            ? 'danger'
                            : 'warning'
                          : 'teal'
                      }
                    />
                    <span className="text-[#526063]">{item.demandReason}</span>
                  </div>
                  {isTimed ? (
                    <span
                      className={`font-mono-tabular font-semibold ${
                        isLowTime ? 'text-amber-800' : 'text-[#264C4F]'
                      }`}
                    >
                      {formatCountdown(item.expiresAt, nowMs)} remaining (fixed)
                    </span>
                  ) : (
                    <span className="font-mono-tabular text-[#526063]">
                      No countdown needed
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary Card */}
        <div className="lg:col-span-4 bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-5">
          <div className="space-y-2 pb-4 border-b border-[#EEF1F0]">
            <h2 className="text-base font-semibold text-[#1A2022]">Fulfilment Summary</h2>
            {assignedStore && (
              <div className="flex items-start gap-2 text-xs text-[#526063]">
                <StoreIcon className="w-4 h-4 text-[#264C4F] shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-medium text-[#1A2022]">{assignedStore.name}</p>
                  <p>
                    {getPreferenceLabel(preference)} · {assignedStore.fulfilmentHours}h readiness ·{' '}
                    {assignedStore.distanceKm.toFixed(1)} km
                  </p>
                </div>
              </div>
            )}
          </div>

          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#526063]">Subtotal</dt>
              <dd className="font-mono-tabular font-medium text-[#1A2022]">{formatInr(subtotalInr)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#526063]">Local Store Fulfilment</dt>
              <dd className="font-mono-tabular font-medium text-[#1A2022]">
                {deliveryFeeInr === 0 ? 'Free (₹0)' : formatInr(deliveryFeeInr)}
              </dd>
            </div>
            <div className="flex justify-between pt-3 border-t border-[#EEF1F0] text-base font-semibold">
              <dt>Estimated Total</dt>
              <dd className="font-mono-tabular text-[#1A2022]">{formatInr(totalInr)}</dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={() => navigate('/checkout')}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg transition-colors"
          >
            Proceed to Demo Checkout
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
