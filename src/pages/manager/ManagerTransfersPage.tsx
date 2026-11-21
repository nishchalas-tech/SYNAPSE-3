import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeftRight, ArrowRight, CheckCircle2, Send } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { formatDateTime } from '../../utils/formatters';

export function ManagerTransfersPage() {
  const { session } = useAuth();
  const { state, createTransferRecommendation } = useNetwork();
  const [searchParams] = useSearchParams();

  const assignedStoreId = session?.assignedStoreId || 'indiranagar';
  const assignedStore =
    state.stores.find((s) => s.id === assignedStoreId) || state.stores[0];
  const otherStores = useMemo(
    () => state.stores.filter((s) => s.id !== assignedStore.id),
    [state.stores, assignedStore.id]
  );

  const initialProductId = useMemo(() => {
    const paramId = searchParams.get('productId');
    if (paramId && state.products.some((p) => p.id === paramId)) {
      return paramId;
    }
    // Default to a low-stock SKU at this branch if one exists
    const lowInv = state.inventory.find(
      (i) => i.storeId === assignedStore.id && i.sellableQty <= 2
    );
    return lowInv?.productId || state.products[0]?.id || '';
  }, [searchParams, state.products, state.inventory, assignedStore.id]);

  const [direction, setDirection] = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');
  const [productId, setProductId] = useState<string>(initialProductId);
  const [partnerStoreId, setPartnerStoreId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(2);
  const [reason, setReason] = useState<string>('');
  const [filterScope, setFilterScope] = useState<'ALL' | 'INBOUND' | 'OUTBOUND'>('ALL');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const paramId = searchParams.get('productId');
    if (paramId && state.products.some((p) => p.id === paramId)) {
      setProductId(paramId);
    }
  }, [searchParams, state.products]);

  const stockByStore = useMemo(() => {
    return state.stores.map((store) => {
      const inv = state.inventory.find(
        (i) => i.storeId === store.id && i.productId === productId
      );
      return {
        store,
        sellableQty: inv?.sellableQty ?? 0,
        verifiedQty: inv?.verifiedQty ?? 0,
        cartHoldQty: inv?.cartHoldQty ?? 0,
      };
    });
  }, [state.stores, state.inventory, productId]);

  // Auto-select best partner store whenever product or direction changes
  useEffect(() => {
    if (direction === 'INBOUND') {
      const bestSource = stockByStore
        .filter((s) => s.store.id !== assignedStore.id && s.sellableQty > 0)
        .sort((a, b) => b.sellableQty - a.sellableQty)[0];
      setPartnerStoreId(bestSource?.store.id || otherStores[0]?.id || '');
    } else {
      const neediestDest = stockByStore
        .filter((s) => s.store.id !== assignedStore.id)
        .sort((a, b) => a.sellableQty - b.sellableQty)[0];
      setPartnerStoreId(neediestDest?.store.id || otherStores[0]?.id || '');
    }
  }, [direction, productId, assignedStore.id, stockByStore, otherStores]);

  const sourceStoreId = direction === 'INBOUND' ? partnerStoreId : assignedStore.id;
  const destinationStoreId = direction === 'INBOUND' ? assignedStore.id : partnerStoreId;

  const sourceInv = state.inventory.find(
    (i) => i.storeId === sourceStoreId && i.productId === productId
  );
  const maxTransferable = sourceInv?.sellableQty ?? 0;

  useEffect(() => {
    if (maxTransferable > 0 && quantity > maxTransferable) {
      setQuantity(maxTransferable);
    } else if (maxTransferable > 0 && quantity < 1) {
      setQuantity(1);
    }
  }, [maxTransferable, quantity]);

  if (!session) return null;

  const selectedProduct = state.products.find((p) => p.id === productId);
  const partnerStore = state.stores.find((s) => s.id === partnerStoreId);

  const branchRequests = state.transferRecommendations.filter((rec) => {
    const involvesBranch =
      rec.sourceStoreId === assignedStore.id || rec.destinationStoreId === assignedStore.id;
    if (!involvesBranch) return false;
    if (filterScope === 'INBOUND') return rec.destinationStoreId === assignedStore.id;
    if (filterScope === 'OUTBOUND') return rec.sourceStoreId === assignedStore.id;
    return true;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !partnerStore) {
      setFeedback({ ok: false, text: 'Select a valid product and branch.' });
      return;
    }

    const relatedSignalCount = state.demandSignals.filter(
      (s) =>
        s.inferredProductId === selectedProduct.id &&
        (s.locality.toLowerCase() === assignedStore.locality.toLowerCase() ||
          s.locality.toLowerCase() === partnerStore.locality.toLowerCase())
    ).length;

    const defaultReason =
      direction === 'INBOUND'
        ? `Branch replenishment request by ${assignedStore.locality} manager to cover local walk-in & pickup demand.`
        : `Outbound surplus rebalance offered by ${assignedStore.locality} manager to support ${partnerStore.locality}.`;

    setSubmitting(true);
    const res = await createTransferRecommendation({
      sourceStoreId,
      destinationStoreId,
      productId: selectedProduct.id,
      recommendedQty: quantity,
      reason: reason.trim() || defaultReason,
      demandSignalCount: relatedSignalCount,
      requestedBy: session.displayName,
      requestedByRole: session.role,
      actorUid: session.uid,
    });
    setSubmitting(false);

    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) {
      setReason('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#1A2022]">Inter-Branch Stock Transfers</h1>
        <p className="text-sm text-[#526063] mt-1">
          Request inbound stock from another Bengaluru branch to {assignedStore.name}, or offer surplus units outward. All requests route to the Network Admin Transfer Queue for approval.
        </p>
      </div>

      {feedback && (
        <div
          role="status"
          className={`p-4 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Request Form Card */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#EEF1F0]">
          <div>
            <h2 className="text-base font-semibold text-[#1A2022] inline-flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-[#264C4F]" aria-hidden="true" />
              New Branch Transfer Request
            </h2>
            <p className="text-xs text-[#526063] mt-0.5">
              Compare live sellable stock across all 4 branches before submitting.
            </p>
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-[#F0F2F1] border border-[#E1E5E4] rounded-lg self-start">
            <button
              type="button"
              onClick={() => setDirection('INBOUND')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                direction === 'INBOUND' ? 'bg-white text-[#1A2022] shadow-xs' : 'text-[#526063]'
              }`}
            >
              Request Inbound Stock
            </button>
            <button
              type="button"
              onClick={() => setDirection('OUTBOUND')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                direction === 'OUTBOUND' ? 'bg-white text-[#1A2022] shadow-xs' : 'text-[#526063]'
              }`}
            >
              Send Surplus Outbound
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-5">
            <label htmlFor="transfer-product" className="block text-xs font-medium text-[#1A2022] mb-1.5">
              Product SKU
            </label>
            <select
              id="transfer-product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
            >
              {state.products.map((p) => {
                const localInv = state.inventory.find(
                  (i) => i.storeId === assignedStore.id && i.productId === p.id
                );
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} ({localInv?.sellableQty ?? 0} here)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="md:col-span-5">
            <label htmlFor="transfer-partner" className="block text-xs font-medium text-[#1A2022] mb-1.5">
              {direction === 'INBOUND'
                ? `Source Branch (transfers to ${assignedStore.locality})`
                : `Destination Branch (receives from ${assignedStore.locality})`}
            </label>
            <select
              id="transfer-partner"
              value={partnerStoreId}
              onChange={(e) => setPartnerStoreId(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
            >
              {otherStores.map((store) => {
                const inv = state.inventory.find(
                  (i) => i.storeId === store.id && i.productId === productId
                );
                const sellable = inv?.sellableQty ?? 0;
                return (
                  <option
                    key={store.id}
                    value={store.id}
                    disabled={direction === 'INBOUND' && sellable < 1}
                  >
                    {store.name} ({sellable} sellable)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="transfer-qty" className="block text-xs font-medium text-[#1A2022] mb-1.5">
              Quantity
            </label>
            <input
              id="transfer-qty"
              type="number"
              min={1}
              max={Math.max(1, maxTransferable)}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number.parseInt(e.target.value || '1', 10)))}
              disabled={maxTransferable < 1}
              className="w-full px-3.5 py-2.5 text-sm font-mono-tabular border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F] disabled:bg-[#F7F7F5]"
            />
          </div>
        </div>

        {/* Live 4-Branch Stock Visibility Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stockByStore.map(({ store, sellableQty, cartHoldQty }) => {
            const isSource = store.id === sourceStoreId;
            const isDest = store.id === destinationStoreId;
            return (
              <div
                key={store.id}
                className={`p-3 rounded-lg border text-xs ${
                  isSource
                    ? 'bg-[#F8FAF9] border-[#264C4F]'
                    : isDest
                      ? 'bg-[#E7F0EE]/50 border-[#84ADA9]'
                      : 'bg-[#F7F7F5] border-[#E1E5E4]'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-[#1A2022] truncate">{store.locality}</span>
                  {isSource && (
                    <span className="text-[10px] font-semibold text-[#264C4F]">SOURCE</span>
                  )}
                  {isDest && (
                    <span className="text-[10px] font-semibold text-[#264C4F]">DEST</span>
                  )}
                </div>
                <p className="font-mono-tabular text-sm font-semibold text-[#1A2022] mt-1">
                  {sellableQty} sellable
                </p>
                {cartHoldQty > 0 && (
                  <p className="font-mono-tabular text-[11px] text-amber-800 mt-0.5">
                    {cartHoldQty} in cart holds
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label htmlFor="transfer-reason" className="block text-xs font-medium text-[#1A2022] mb-1.5">
              Operational Justification (optional)
            </label>
            <input
              id="transfer-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={280}
              placeholder={
                direction === 'INBOUND'
                  ? `e.g., Customer pickup demand or depleted shelf at ${assignedStore.locality}`
                  : `e.g., Surplus inventory available to rebalance ${partnerStore?.locality || 'network'}`
              }
              className="w-full px-3.5 py-2.5 text-sm border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
            />
          </div>

          <button
            type="submit"
            disabled={maxTransferable < 1 || submitting}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            {submitting ? 'Submitting...' : 'Submit Transfer Request'}
          </button>
        </div>

        {maxTransferable < 1 && (
          <p className="text-xs text-amber-800">
            Selected source branch currently has 0 sellable units for this SKU. Choose another branch with available stock.
          </p>
        )}
      </form>

      {/* Live Branch Transfer Requests & Status */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[#1A2022]">
            Branch Transfer Requests ({branchRequests.length})
          </h2>

          <div className="inline-flex items-center gap-1 p-1 bg-[#E9ECEB] rounded-lg">
            {(
              [
                ['ALL', 'All Branch Requests'],
                ['INBOUND', 'Inbound'],
                ['OUTBOUND', 'Outbound'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setFilterScope(val)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filterScope === val ? 'bg-white text-[#1A2022] shadow-xs' : 'text-[#526063]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {branchRequests.length === 0 ? (
          <div className="bg-white border border-[#E1E5E4] rounded-xl p-8 text-center text-sm text-[#526063]">
            No transfer requests involving {assignedStore.name} yet. Submit a request above to queue one for Network Admin approval.
          </div>
        ) : (
          <div className="space-y-3">
            {branchRequests.map((rec) => {
              const isInbound = rec.destinationStoreId === assignedStore.id;
              const decision = state.transferDecisions.find(
                (d) => d.recommendationId === rec.id
              );

              return (
                <div
                  key={rec.id}
                  className="bg-white border border-[#E1E5E4] rounded-xl p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#526063]">
                        <span className="font-semibold text-[#264C4F]">
                          {isInbound ? 'INBOUND TO BRANCH' : 'OUTBOUND FROM BRANCH'}
                        </span>
                        <span>·</span>
                        <span className="font-mono-tabular">{formatDateTime(rec.createdAt)}</span>
                        {rec.requestedBy && (
                          <>
                            <span>·</span>
                            <span>Requested by {rec.requestedBy}</span>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#1A2022] mt-1">
                        <span>{rec.sourceStoreName}</span>
                        <ArrowRight className="w-4 h-4 text-[#264C4F]" aria-hidden="true" />
                        <span>{rec.destinationStoreName}</span>
                      </div>
                      <p className="text-sm font-semibold text-[#264C4F] mt-0.5">
                        {rec.productName} ·{' '}
                        <span className="font-mono-tabular">{rec.recommendedQty} units</span>
                      </p>
                    </div>

                    <StatusBadge
                      label={rec.status === 'PENDING' ? 'AWAITING ADMIN APPROVAL' : rec.status}
                      tone={
                        rec.status === 'APPROVED'
                          ? 'success'
                          : rec.status === 'REJECTED'
                            ? 'danger'
                            : 'warning'
                      }
                    />
                  </div>

                  <p className="text-xs text-[#526063]">{rec.reason}</p>

                  {decision && (
                    <div className="p-3 bg-[#F7F7F5] border border-[#E1E5E4] rounded-lg text-xs text-[#1A2022] flex flex-wrap justify-between gap-2">
                      <span>
                        <strong>Admin Decision ({decision.decidedBy}):</strong> {decision.notes}
                      </span>
                      <span className="font-mono-tabular text-[#526063]">
                        {formatDateTime(decision.createdAt)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
