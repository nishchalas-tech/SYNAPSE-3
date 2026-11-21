import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, ShoppingBag, Store as StoreIcon } from 'lucide-react';
import { ProductRescuePanel } from '../../components/fulfilment/ProductRescuePanel';
import { TradeoffSlider } from '../../components/fulfilment/TradeoffSlider';
import { ProductImage } from '../../components/products/ProductImage';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import {
  evaluateCartHoldPolicy,
  evaluateProductRescue,
  getWeightsForPreference,
  rankFulfilmentOptions,
} from '../../services/fulfilmentService';
import type { FulfilmentPreference, TradeoffWeights } from '../../types';
import { formatInr } from '../../utils/formatters';

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const { state, addToCart, recordDemandSignal, registerProductInterest } = useNetwork();
  const { session } = useAuth();

  const product = state.products.find((p) => p.id === productId);
  const preferredStoreId = session?.preferredStoreId || 'indiranagar';

  const [preference, setPreference] = useState<FulfilmentPreference>('SHOP_NEARBY');
  const [weights, setWeights] = useState<TradeoffWeights>(() => getWeightsForPreference('SHOP_NEARBY'));
  const [quantity, setQuantity] = useState(1);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const rankedOptions = useMemo(() => {
    if (!product) return [];
    return rankFulfilmentOptions(product, state.stores, state.inventory, preference, quantity, weights);
  }, [product, state.stores, state.inventory, preference, quantity, weights]);

  const rescue = useMemo(() => {
    if (!product) return null;
    return evaluateProductRescue(
      product,
      preferredStoreId,
      state.stores,
      state.products,
      state.inventory,
      preference,
      quantity,
      weights
    );
  }, [product, preferredStoreId, state.stores, state.products, state.inventory, preference, quantity, weights]);

  // Keep selectedStoreId synchronized with the highest-ranked eligible store
  useEffect(() => {
    if (rankedOptions.length > 0) {
      setSelectedStoreId((prev) =>
        rankedOptions.some((o) => o.store.id === prev) ? prev : rankedOptions[0].store.id
      );
    } else {
      setSelectedStoreId('');
    }
  }, [rankedOptions]);

  // Log Demand Signal when preferred store is out of stock
  useEffect(() => {
    if (product && rescue && rescue.outcome !== 'AVAILABLE_PREFERRED') {
      const preferredStore = state.stores.find((s) => s.id === preferredStoreId);
      recordDemandSignal({
        query: product.name,
        inferredCategory: product.category,
        inferredProductId: product.id,
        locality: preferredStore?.locality || 'Indiranagar',
        outcome:
          rescue.outcome === 'RESCUE_COMPATIBLE_PRODUCT'
            ? 'RESCUED_ALTERNATIVE'
            : 'OUT_OF_STOCK_NEARBY',
        signalSource: 'PRODUCT_VIEW',
        session,
      });
    }
  }, [product?.id]); // intentionally run on product mount

  if (!product || !rescue) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <h1 className="text-xl font-semibold text-[#1A2022]">Product Not Found</h1>
        <p className="text-sm text-[#526063]">The requested item could not be found in the catalog.</p>
        <Link
          to="/catalogue"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#264C4F] rounded-lg"
        >
          Back to Catalogue
        </Link>
      </div>
    );
  }

  const activeOption = rankedOptions.find((o) => o.store.id === selectedStoreId) || rankedOptions[0] || null;
  const isInterestRegistered = state.registeredInterests.includes(product.id);
  const preferredStore = state.stores.find((s) => s.id === preferredStoreId);

  const holdPreview = activeOption
    ? evaluateCartHoldPolicy(
        product,
        activeOption.store,
        activeOption.inventory,
        state.demandSignals,
        state.orders,
        quantity
      )
    : null;

  const handleAddToCart = async () => {
    if (!activeOption) return;
    const res = await addToCart(product.id, activeOption.store.id, preference, quantity);
    setFeedback({ ok: res.ok, text: res.message });
  };

  const handleQuickAddCompatible = async (compatibleProductId: string, storeId: string) => {
    const res = await addToCart(compatibleProductId, storeId, preference, 1);
    setFeedback({ ok: res.ok, text: res.message });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <Link
        to="/catalogue"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#526063] hover:text-[#1A2022]"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Back to Catalogue
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Product Imagery & Technical Specifications */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-[#E1E5E4] rounded-xl overflow-hidden">
            <ProductImage src={product.imageUrl} alt={product.name} />
          </div>

          <div className="bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[#1A2022]">Technical Specifications</h2>
              <span className="text-xs font-mono-tabular text-[#526063]">{product.sku}</span>
            </div>
            <dl className="divide-y divide-[#EEF1F0]">
              {product.specs.map((spec) => (
                <div key={spec.label} className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1 text-sm">
                  <dt className="text-[#526063]">{spec.label}</dt>
                  <dd className="font-medium text-[#1A2022] sm:text-right">{spec.value}</dd>
                </div>
              ))}
              <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1 text-sm">
                <dt className="text-[#526063]">Compatibility Group</dt>
                <dd className="font-medium text-[#264C4F] sm:text-right">{product.compatibilityLabel}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Right: Contiguous Purchase & Fulfilment Module */}
        <div className="lg:col-span-6 bg-white border border-[#E1E5E4] rounded-xl p-6 sm:p-7 space-y-6 lg:sticky lg:top-24">
          <div className="space-y-2 pb-5 border-b border-[#EEF1F0]">
            <div className="flex items-center gap-2 text-xs text-[#526063]">
              <span>{product.brand}</span>
              <span aria-hidden="true">·</span>
              <span>{product.category}</span>
            </div>
            <h1 className="text-2xl font-semibold text-[#1A2022] leading-snug">{product.name}</h1>
            <p className="text-sm text-[#526063] leading-relaxed">{product.description}</p>
            <p className="text-2xl font-semibold font-mono-tabular text-[#1A2022] pt-2">
              {formatInr(product.priceInr)}
            </p>
          </div>

          {/* Trade-off Slider */}
          <TradeoffSlider
            value={preference}
            weights={weights}
            onChange={(nextPref, nextWeights) => {
              setPreference(nextPref);
              setWeights(nextWeights);
            }}
          />

          {/* Product Rescue (shown automatically if preferred store lacks stock) */}
          <ProductRescuePanel
            product={product}
            evaluation={rescue}
            isInterestRegistered={isInterestRegistered}
            selectedStoreId={selectedStoreId}
            onSelectStore={(id) => {
              setSelectedStoreId(id);
              setFeedback(null);
            }}
            onQuickAddProduct={handleQuickAddCompatible}
            onRegisterInterest={() =>
              registerProductInterest(
                product.id,
                product.name,
                preferredStore?.locality || 'Indiranagar',
                session
              )
            }
          />

          {/* Eligible Store Ranking */}
          {rankedOptions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#1A2022]">
                  Eligible Network Stores ({rankedOptions.length})
                </h2>
                <span className="text-xs text-[#526063]">Ranked using live stock &amp; fulfilment</span>
              </div>

              <div className="space-y-2">
                {rankedOptions.map((opt, index) => {
                  const selected = opt.store.id === (activeOption?.store.id || '');
                  return (
                    <button
                      key={opt.store.id}
                      type="button"
                      onClick={() => {
                        setSelectedStoreId(opt.store.id);
                        setFeedback(null);
                      }}
                      className={`w-full text-left p-3.5 rounded-lg border transition-colors ${
                        selected
                          ? 'bg-[#F8FAF9] border-[#264C4F]'
                          : 'bg-white border-[#E1E5E4] hover:border-[#C2CAC8]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <StoreIcon className="w-4 h-4 text-[#264C4F]" aria-hidden="true" />
                          <span className="text-sm font-semibold text-[#1A2022]">{opt.store.name}</span>
                          {index === 0 && <StatusBadge label="Top Match" tone="teal" withIcon={false} />}
                        </div>
                        <span className="text-sm font-semibold font-mono-tabular text-[#1A2022]">
                          {formatInr(opt.totalCostInr)}
                        </span>
                      </div>

                      <p className="text-xs text-[#526063] mt-1">{opt.reason}</p>

                      <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-[#526063] mt-2 font-mono-tabular">
                        <span className="text-[#264C4F] font-semibold">
                          {opt.inventory.sellableQty} sellable
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{opt.inventory.verifiedQty} verified</span>
                        {(opt.inventory.cartHoldQty || 0) > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-800">{opt.inventory.cartHoldQty} held in cart</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>
                          {opt.deliveryFeeInr === 0 ? 'Free delivery' : `${formatInr(opt.deliveryFeeInr)} delivery`}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className={opt.isStaleWarning ? 'text-amber-800 inline-flex items-center gap-1' : ''}>
                          {opt.isStaleWarning && <AlertTriangle className="w-3 h-3" aria-hidden="true" />}
                          Verified {opt.freshnessRelative}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Purchase Action Row */}
          <div className="pt-4 border-t border-[#EEF1F0] space-y-3">
            {holdPreview && (
              <div className="p-3 bg-[#F7F7F5] border border-[#E1E5E4] rounded-lg flex items-start gap-2.5 text-xs">
                <Clock className="w-4 h-4 text-[#264C4F] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-0.5">
                  <p className="font-medium text-[#1A2022]">
                    {holdPreview.qualifiesForTimedHold
                      ? 'Fixed 10-Minute Hold · Non-Renewable (High-Demand / Low-Stock SKU)'
                      : 'Standard Cart Allocation (Abundant Shelf Stock)'}
                  </p>
                  <p className="text-[#526063]">{holdPreview.reason}</p>
                  {holdPreview.qualifiesForTimedHold && (
                    <p className="text-[11px] font-medium text-amber-800">
                      Cannot be renewed, extended, or reset. Unclaimed units return automatically after 10 minutes.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center border border-[#D4DAD8] rounded-lg">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-3 py-2 text-sm font-medium text-[#1A2022] hover:bg-[#F7F7F5]"
                >
                  -
                </button>
                <span className="px-3 py-2 text-sm font-mono-tabular min-w-10 text-center">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() =>
                    setQuantity((q) => Math.min(activeOption?.inventory.sellableQty || 1, q + 1))
                  }
                  className="px-3 py-2 text-sm font-medium text-[#1A2022] hover:bg-[#F7F7F5]"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                disabled={!activeOption}
                onClick={handleAddToCart}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] disabled:bg-[#B8C2C0] rounded-lg transition-colors"
              >
                <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                {activeOption
                  ? `Reserve & Add · ${activeOption.store.locality}`
                  : 'Currently Unavailable'}
              </button>
            </div>

            {feedback && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center justify-between gap-3 ${
                  feedback.ok
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                    : 'bg-red-50 text-red-900 border border-red-200'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {feedback.ok && <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />}
                  {feedback.text}
                </span>
                {feedback.ok && (
                  <Link to="/cart" className="font-semibold underline whitespace-nowrap">
                    Go to Cart
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
