import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Plus, Send, Sparkles, XCircle } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { generateDynamicTransferRecommendations } from '../../services/transferRecommendationEngine';
import type { DynamicTransferSuggestion } from '../../types';

export function AdminTransfersPage() {
  const { session } = useAuth();
  const { state, createTransferRecommendation, approveTransfer, rejectTransfer } = useNetwork();
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [showNewForm, setShowNewForm] = useState(false);
  const [productId, setProductId] = useState(state.products[0]?.id || '');
  const [sourceStoreId, setSourceStoreId] = useState(state.stores[2]?.id || state.stores[0]?.id || '');
  const [destinationStoreId, setDestinationStoreId] = useState(state.stores[0]?.id || '');
  const [qty, setQty] = useState(2);
  const [reason, setReason] = useState('');

  const selectedSrcInv = useMemo(
    () =>
      state.inventory.find(
        (i) => i.storeId === sourceStoreId && i.productId === productId
      ),
    [state.inventory, sourceStoreId, productId]
  );

  const dynamicSuggestions = useMemo(
    () =>
      state.dynamicSuggestions ??
      generateDynamicTransferRecommendations({
        stores: state.stores,
        products: state.products,
        inventory: state.inventory,
        demandSignals: state.demandSignals,
        orders: state.orders,
        transferRecommendations: state.transferRecommendations,
      }),
    [
      state.dynamicSuggestions,
      state.stores,
      state.products,
      state.inventory,
      state.demandSignals,
      state.orders,
      state.transferRecommendations,
    ]
  );

  if (!session) return null;

  const handleApprove = async (recId: string) => {
    setBusyKey(recId);
    const res = await approveTransfer(recId, notesById[recId] || '', session);
    setBusyKey(null);
    setFeedback({ ok: res.ok, text: res.message });
  };

  const handleReject = async (recId: string) => {
    setBusyKey(recId);
    const res = await rejectTransfer(recId, notesById[recId] || '', session);
    setBusyKey(null);
    setFeedback({ ok: res.ok, text: res.message });
  };

  const handleQueueDynamicSuggestion = async (
    sug: DynamicTransferSuggestion,
    autoApprove: boolean
  ) => {
    setBusyKey(sug.suggestionKey);
    let targetRecId = sug.alreadyQueuedId;

    if (!targetRecId) {
      const queued = await createTransferRecommendation({
        sourceStoreId: sug.sourceStoreId,
        destinationStoreId: sug.destinationStoreId,
        productId: sug.productId,
        recommendedQty: sug.recommendedQty,
        reason: sug.reason,
        demandSignalCount: sug.demandSignalCount,
        requestedBy: 'Dynamic Transfer Engine',
        requestedByRole: 'NETWORK_ADMIN',
        actorUid: session.uid,
      });

      if (!queued.ok || !queued.data) {
        setBusyKey(null);
        setFeedback({ ok: queued.ok, text: queued.message });
        return;
      }
      targetRecId = queued.data.id;

      if (!autoApprove) {
        setBusyKey(null);
        setFeedback({ ok: true, text: queued.message });
        return;
      }
    }

    if (autoApprove && targetRecId) {
      const approved = await approveTransfer(
        targetRecId,
        `Approved directly from Dynamic Transfer Recommendations (urgency ${sug.urgencyScore}).`,
        session
      );
      setBusyKey(null);
      setFeedback({ ok: approved.ok, text: approved.message });
      return;
    }

    setBusyKey(null);
  };

  const handleCreateManualTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyKey('manual-create');
    const res = await createTransferRecommendation({
      sourceStoreId,
      destinationStoreId,
      productId,
      recommendedQty: qty,
      reason:
        reason.trim() ||
        'Manual network rebalancing request created from Transfer Queue.',
      demandSignalCount: state.demandSignals.filter(
        (d) => d.inferredProductId === productId
      ).length,
      requestedBy: session.displayName,
      requestedByRole: session.role,
      actorUid: session.uid,
    });
    setBusyKey(null);
    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) {
      setReason('');
      setShowNewForm(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A2022]">Transfer Recommendations &amp; Requests</h1>
          <p className="text-sm text-[#526063] mt-1">
            Review automatically ranked surplus-to-shortage transfers, branch manager requests, and queue items. Approving updates shelf stock at both branches and records an immutable movement ledger entry.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowNewForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            {showNewForm ? 'Close Request Form' : 'New Transfer Request'}
          </button>
          <Link
            to="/admin/transfers/history"
            className="text-xs font-medium text-[#264C4F] hover:underline whitespace-nowrap"
          >
            History &amp; Movement Ledger ({state.inventoryMovements.length})
          </Link>
        </div>
      </div>

      {showNewForm && (
        <form
          onSubmit={(e) => void handleCreateManualTransfer(e)}
          className="bg-white border border-[#C9DBD7] rounded-xl p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-[#1A2022]">
            Create Inter-Branch Transfer Request
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
            <div className="md:col-span-4">
              <label htmlFor="admin-tr-product" className="block font-medium text-[#1A2022] mb-1">
                Product
              </label>
              <select
                id="admin-tr-product"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#D4DAD8] rounded-lg"
              >
                {state.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label htmlFor="admin-tr-src" className="block font-medium text-[#1A2022] mb-1">
                Source Branch
              </label>
              <select
                id="admin-tr-src"
                value={sourceStoreId}
                onChange={(e) => setSourceStoreId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#D4DAD8] rounded-lg"
              >
                {state.stores.map((s) => {
                  const inv = state.inventory.find(
                    (i) => i.storeId === s.id && i.productId === productId
                  );
                  return (
                    <option key={s.id} value={s.id}>
                      {s.locality} ({inv?.sellableQty ?? 0} sellable)
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="md:col-span-3">
              <label htmlFor="admin-tr-dst" className="block font-medium text-[#1A2022] mb-1">
                Destination Branch
              </label>
              <select
                id="admin-tr-dst"
                value={destinationStoreId}
                onChange={(e) => setDestinationStoreId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#D4DAD8] rounded-lg"
              >
                {state.stores.map((s) => {
                  const inv = state.inventory.find(
                    (i) => i.storeId === s.id && i.productId === productId
                  );
                  return (
                    <option key={s.id} value={s.id}>
                      {s.locality} ({inv?.sellableQty ?? 0} sellable)
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="admin-tr-qty" className="block font-medium text-[#1A2022] mb-1">
                Qty (max {selectedSrcInv?.sellableQty ?? 0})
              </label>
              <input
                id="admin-tr-qty"
                type="number"
                min={1}
                max={Math.max(1, selectedSrcInv?.sellableQty ?? 1)}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number.parseInt(e.target.value || '1', 10)))}
                className="w-full px-3 py-2 font-mono-tabular bg-white border border-[#D4DAD8] rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 text-xs">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for inter-branch transfer..."
              aria-label="Reason for transfer"
              className="flex-1 px-3.5 py-2 border border-[#D4DAD8] rounded-lg"
            />
            <button
              type="submit"
              disabled={busyKey === 'manual-create'}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] disabled:opacity-60 rounded-lg whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              Queue Transfer Request
            </button>
          </div>
        </form>
      )}

      {feedback && (
        <div
          role="status"
          className={`p-4 rounded-xl border text-xs ${
            feedback.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Automated Dynamic Transfer Recommendations Panel */}
      <section className="bg-white border border-[#C9DBD7] rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#EEF1F0]">
          <div>
            <h2 className="text-base font-semibold text-[#1A2022] inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#264C4F]" aria-hidden="true" />
              Dynamic Transfer Recommendations ({dynamicSuggestions.length})
            </h2>
            <p className="text-xs text-[#526063] mt-0.5">
              Live ranking of surplus (&ge; 4 sellable) to shortage (&le; 1 sellable or aging count) pairings scored by local Demand Radar hits and order pressure.
            </p>
          </div>
        </div>

        {dynamicSuggestions.length === 0 ? (
          <p className="text-xs text-[#526063]">
            All 4 branches are currently balanced with zero urgent surplus-to-shortage imbalances.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {dynamicSuggestions.slice(0, 6).map((sug) => {
              const isBusy = busyKey === sug.suggestionKey;
              return (
                <div
                  key={sug.suggestionKey}
                  className="p-4 rounded-lg border border-[#E1E5E4] bg-[#F8FAF9] space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[#1A2022]">
                        <span>{sug.sourceStoreName}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#264C4F]" aria-hidden="true" />
                        <span>{sug.destinationStoreName}</span>
                      </div>
                      <p className="text-sm font-semibold text-[#264C4F] mt-0.5 truncate">
                        {sug.productName} · <span className="font-mono-tabular">{sug.recommendedQty} units</span>
                      </p>
                    </div>
                    <StatusBadge
                      label={`Urgency ${sug.urgencyScore}`}
                      tone={sug.urgencyScore >= 70 ? 'danger' : sug.urgencyScore >= 45 ? 'warning' : 'teal'}
                      withIcon={false}
                    />
                  </div>

                  <p className="text-xs text-[#526063] leading-relaxed">{sug.reason}</p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E6ECEA] text-[11px] font-mono-tabular text-[#526063]">
                    <span>
                      Source {sug.sourceSellableQty} · Dest {sug.destinationSellableQty} · {sug.demandSignalCount} signal(s)
                    </span>
                    <div className="flex items-center gap-2">
                      {!sug.alreadyQueuedId && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleQueueDynamicSuggestion(sug, false)}
                          className="px-2.5 py-1 font-sans text-xs font-medium text-[#264C4F] bg-[#E7F0EE] hover:bg-[#D4E4E1] disabled:opacity-50 rounded"
                        >
                          Queue Recommendation
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleQueueDynamicSuggestion(sug, true)}
                        className="px-2.5 py-1 font-sans text-xs font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] disabled:opacity-50 rounded"
                      >
                        {sug.alreadyQueuedId ? 'Approve Queued Transfer' : 'Approve & Move Stock'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Queued Recommendations & Branch Requests */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-[#1A2022]">
          Queued Transfers &amp; Branch Manager Requests ({state.transferRecommendations.length})
        </h2>

        {state.transferRecommendations.map((rec) => {
          const srcInv = state.inventory.find(
            (i) => i.storeId === rec.sourceStoreId && i.productId === rec.productId
          );
          const dstInv = state.inventory.find(
            (i) => i.storeId === rec.destinationStoreId && i.productId === rec.productId
          );
          const isBusy = busyKey === rec.id;

          return (
            <div key={rec.id} className="bg-white border border-[#E1E5E4] rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[#EEF1F0]">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#1A2022]">
                    <span>{rec.sourceStoreName}</span>
                    <ArrowRight className="w-4 h-4 text-[#264C4F]" aria-hidden="true" />
                    <span>{rec.destinationStoreName}</span>
                  </div>
                  <p className="text-base font-semibold text-[#264C4F] mt-1">
                    {rec.productName} · <span className="font-mono-tabular">{rec.recommendedQty} units</span>
                  </p>
                  {rec.requestedBy && (
                    <p className="text-xs text-[#526063] mt-0.5">
                      Requested by {rec.requestedBy} (
                      {rec.requestedByRole === 'STORE_MANAGER' ? 'Store Manager' : 'Network Operations'})
                    </p>
                  )}
                </div>

                <StatusBadge
                  label={rec.status}
                  tone={
                    rec.status === 'APPROVED'
                      ? 'success'
                      : rec.status === 'REJECTED'
                        ? 'danger'
                        : 'warning'
                  }
                />
              </div>

              <p className="text-sm text-[#526063]">{rec.reason}</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-[#F7F7F5] border border-[#E1E5E4] rounded-lg text-xs">
                <div>
                  <span className="text-[#526063]">Current Source Sellable</span>
                  <p className="font-mono-tabular font-semibold text-[#1A2022] mt-0.5">
                    {srcInv?.sellableQty ?? rec.sourceSellableQty} units ({rec.sourceStoreName})
                  </p>
                </div>
                <div>
                  <span className="text-[#526063]">Current Destination Sellable</span>
                  <p className="font-mono-tabular font-semibold text-[#1A2022] mt-0.5">
                    {dstInv?.sellableQty ?? rec.destinationSellableQty} units ({rec.destinationStoreName})
                  </p>
                </div>
                <div>
                  <span className="text-[#526063]">Linked Demand Signals</span>
                  <p className="font-mono-tabular font-semibold text-[#1A2022] mt-0.5">
                    {rec.demandSignalCount} signal(s)
                  </p>
                </div>
              </div>

              {rec.status === 'PENDING' && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
                  <input
                    type="text"
                    value={notesById[rec.id] || ''}
                    onChange={(e) =>
                      setNotesById((prev) => ({ ...prev, [rec.id]: e.target.value }))
                    }
                    placeholder="Optional decision note..."
                    aria-label={`Decision note for ${rec.productName}`}
                    className="flex-1 px-3.5 py-2 text-xs border border-[#D4DAD8] rounded-lg focus:outline-none focus:border-[#264C4F]"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleApprove(rec.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] disabled:opacity-50 rounded-lg transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Approve &amp; Move Stock
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleReject(rec.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50 rounded-lg transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
