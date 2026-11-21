import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { computeSellableStock } from '../../services/fulfilmentService';
import { formatDateTime, getFreshnessState } from '../../utils/formatters';

export function ManagerInventoryDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const { session } = useAuth();
  const { state, submitStockVerification } = useNetwork();

  const storeId = session?.assignedStoreId || 'indiranagar';
  const store = state.stores.find((s) => s.id === storeId) || state.stores[0];
  const product = state.products.find((p) => p.id === productId);
  const inv = state.inventory.find((r) => r.storeId === store.id && r.productId === productId);

  const [verifiedInput, setVerifiedInput] = useState<string>(String(inv?.verifiedQty ?? 0));
  const [reason, setReason] = useState<string>(inv?.discrepancyReason || '');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!product || !inv || !session) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[#526063]">Inventory record not found for your assigned store.</p>
        <Link to="/manager/inventory" className="text-sm font-medium text-[#264C4F] underline">
          Back to Stock Whisperer
        </Link>
      </div>
    );
  }

  const parsedCount = Number.parseInt(verifiedInput, 10);
  const validCount = !Number.isNaN(parsedCount) && parsedCount >= 0;
  const previewSellable = validCount
    ? computeSellableStock(parsedCount, inv.reservedQty, inv.safetyBuffer, inv.cartHoldQty || 0)
    : inv.sellableQty;
  const hasDiscrepancy = validCount && parsedCount !== inv.recordedQty;
  const freshness = getFreshnessState(inv.lastVerifiedAt);

  const history = state.verifications.filter(
    (v) => v.storeId === store.id && v.productId === product.id
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validCount) {
      setFeedback({ ok: false, text: 'Enter a valid non-negative integer count.' });
      return;
    }
    setSubmitting(true);
    const res = await submitStockVerification({
      storeId: store.id,
      productId: product.id,
      verifiedQty: parsedCount,
      discrepancyReason: reason,
      session,
    });
    setSubmitting(false);
    setFeedback({ ok: res.ok, text: res.message });
  };

  return (
    <div className="space-y-6">
      <Link
        to="/manager/inventory"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#526063] hover:text-[#1A2022]"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Back to Stock Whisperer
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Current Stock Whisperer Snapshot */}
        <div className="lg:col-span-5 bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-5">
          <div>
            <p className="text-xs font-mono-tabular text-[#526063]">{product.sku}</p>
            <h1 className="text-xl font-semibold text-[#1A2022] mt-1">{product.name}</h1>
            <p className="text-xs text-[#526063] mt-1">{store.name}</p>
          </div>

          <div className="p-4 bg-[#F7F7F5] border border-[#E1E5E4] rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#526063]">Operational Freshness</span>
              <StatusBadge
                label={`${freshness.label} · ${freshness.relativeText}`}
                tone={freshness.state === 'FRESH' ? 'success' : freshness.state === 'AGING' ? 'warning' : 'danger'}
              />
            </div>
            <p className="text-xs text-[#526063]">
              Last verified by <strong className="text-[#1A2022]">{inv.lastVerifiedBy}</strong>
            </p>
          </div>

          <dl className="divide-y divide-[#EEF1F0] text-sm">
            <div className="py-2.5 flex justify-between">
              <dt className="text-[#526063]">System Recorded Stock</dt>
              <dd className="font-mono-tabular font-medium">{inv.recordedQty} units</dd>
            </div>
            <div className="py-2.5 flex justify-between">
              <dt className="text-[#526063]">Physically Verified Stock</dt>
              <dd className="font-mono-tabular font-semibold text-[#1A2022]">{inv.verifiedQty} units</dd>
            </div>
            <div className="py-2.5 flex justify-between">
              <dt className="text-[#526063]">Active Order Reservations</dt>
              <dd className="font-mono-tabular">{inv.reservedQty} units</dd>
            </div>
            <div className="py-2.5 flex justify-between">
              <dt className="text-[#526063]">Active 10m Cart Holds</dt>
              <dd className="font-mono-tabular text-amber-800">{inv.cartHoldQty || 0} units</dd>
            </div>
            <div className="py-2.5 flex justify-between">
              <dt className="text-[#526063]">Store Safety Buffer</dt>
              <dd className="font-mono-tabular">{inv.safetyBuffer} units</dd>
            </div>
            <div className="py-2.5 flex justify-between font-semibold text-[#264C4F]">
              <dt>Sellable Stock</dt>
              <dd className="font-mono-tabular">{inv.sellableQty} units</dd>
            </div>
          </dl>

          <p className="text-[11px] text-[#526063] leading-relaxed">
            Documented formula: Sellable = max(0, Verified - Order Reserved - Cart Holds - Safety Buffer).
          </p>

          <Link
            to={`/manager/transfers?productId=${product.id}`}
            className="block w-full text-center px-4 py-2 text-xs font-medium text-[#264C4F] bg-[#E7F0EE] hover:bg-[#D4E4E1] rounded-lg transition-colors"
          >
            Request Stock Transfer for This SKU
          </Link>
        </div>

        {/* Right: Physical Count Verification Form */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={(e) => void handleSubmit(e)} className="bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-5">
            <h2 className="text-base font-semibold text-[#1A2022]">Submit Physical Stock Count</h2>

            {feedback && (
              <div
                role="status"
                className={`p-3.5 rounded-lg border text-xs flex items-center gap-2 ${
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

            <div>
              <label htmlFor="physical-count" className="block text-xs font-medium text-[#1A2022] mb-1.5">
                Physically Counted Quantity on Shelf
              </label>
              <input
                id="physical-count"
                type="number"
                min={0}
                step={1}
                value={verifiedInput}
                onChange={(e) => setVerifiedInput(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-mono-tabular border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
              />
            </div>

            {hasDiscrepancy && (
              <div>
                <label htmlFor="discrepancy-reason" className="block text-xs font-medium text-[#1A2022] mb-1.5">
                  Discrepancy Reason (required since count differs from {inv.recordedQty} recorded)
                </label>
                <input
                  id="discrepancy-reason"
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Damaged packaging, demo display unit, unposted walk-in sale"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
                />
              </div>
            )}

            <div className="p-4 bg-[#F8FAF9] border border-[#C9DBD7] rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[#526063]">Recalculated Sellable Stock Preview:</span>
              <span className="font-mono-tabular text-sm font-semibold text-[#264C4F]">
                {previewSellable} units
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-sm font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] disabled:opacity-60 rounded-lg transition-colors"
            >
              {submitting ? 'Saving Verification...' : 'Confirm Physical Verification'}
            </button>
          </form>

          {/* Verification Audit History */}
          <div className="bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-3">
            <h2 className="text-base font-semibold text-[#1A2022]">Verification History</h2>
            {history.length === 0 ? (
              <p className="text-sm text-[#526063]">No prior verification records for this SKU at {store.locality}.</p>
            ) : (
              <div className="divide-y divide-[#EEF1F0]">
                {history.map((h) => (
                  <div key={h.id} className="py-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="font-semibold text-[#1A2022]">{h.verifiedBy}</span>
                      <span className="font-mono-tabular text-[#526063]">{formatDateTime(h.createdAt)}</span>
                    </div>
                    <p className="font-mono-tabular text-[#526063]">
                      Recorded {h.recordedQty} · Verified {h.verifiedQty} · Sellable {h.previousSellableQty} →{' '}
                      <strong className="text-[#264C4F]">{h.newSellableQty}</strong>
                    </p>
                    {h.discrepancyReason && (
                      <p className="text-amber-800">Note: {h.discrepancyReason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
