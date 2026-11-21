import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';

export function AdminSurplusExchangePage() {
  const { session } = useAuth();
  const { state, createTransferRecommendation } = useNetwork();
  const [selectedSourceByProduct, setSelectedSourceByProduct] = useState<Record<string, string>>({});
  const [selectedDestByProduct, setSelectedDestByProduct] = useState<Record<string, string>>({});
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Compute live surplus and shortage pairings from current inventory + demand signals
  const pairings = state.products
    .map((product) => {
      const storeRows = state.stores.map((store) => {
        const inv = state.inventory.find(
          (i) => i.storeId === store.id && i.productId === product.id
        );
        return { store, sellableQty: inv?.sellableQty ?? 0 };
      });
      const surplusStores = storeRows
        .filter((r) => r.sellableQty >= 4)
        .sort((a, b) => b.sellableQty - a.sellableQty);
      const shortageStores = storeRows
        .filter((r) => r.sellableQty <= 1)
        .sort((a, b) => a.sellableQty - b.sellableQty);
      const relatedSignals = state.demandSignals.filter(
        (d) => d.inferredProductId === product.id
      );

      return { product, surplusStores, shortageStores, relatedSignals };
    })
    .filter((p) => p.surplusStores.length > 0 && p.shortageStores.length > 0);

  const handleQueuePairing = async (pairing: (typeof pairings)[number]) => {
    const sourceEntry =
      pairing.surplusStores.find((s) => s.store.id === selectedSourceByProduct[pairing.product.id]) ||
      pairing.surplusStores[0];
    const destEntry =
      pairing.shortageStores.find((s) => s.store.id === selectedDestByProduct[pairing.product.id]) ||
      pairing.shortageStores[0];
    if (!sourceEntry || !destEntry) return;

    const requestedQty = Math.min(
      qtyByProduct[pairing.product.id] ?? 2,
      Math.max(1, sourceEntry.sellableQty - 1)
    );

    const res = await createTransferRecommendation({
      sourceStoreId: sourceEntry.store.id,
      destinationStoreId: destEntry.store.id,
      productId: pairing.product.id,
      recommendedQty: requestedQty,
      reason: `Surplus Exchange rebalance (${sourceEntry.store.locality} ${sourceEntry.sellableQty} sellable → ${destEntry.store.locality} ${destEntry.sellableQty} sellable).`,
      demandSignalCount: pairing.relatedSignals.length,
      requestedBy: session?.displayName || 'Network Admin',
      requestedByRole: session?.role || 'NETWORK_ADMIN',
      actorUid: session?.uid,
    });

    setFeedback({ ok: res.ok, text: res.message });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A2022]">Surplus Exchange</h1>
          <p className="text-sm text-[#526063] mt-1">
            Identifies products with surplus sellable stock (&ge; 4 units) alongside shortage stores (&le; 1 unit) and lets you queue branch-to-branch transfer requests directly.
          </p>
        </div>
        <Link
          to="/admin/transfers"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-lg whitespace-nowrap"
        >
          Open Transfer Queue
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>

      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
            feedback.ok
              ? 'bg-[#E7F0EE] border-[#C9DBD7] text-[#264C4F]'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            {feedback.text}
          </span>
          {feedback.ok && (
            <Link to="/admin/transfers" className="font-semibold underline whitespace-nowrap">
              Review &amp; Approve in Transfer Queue
            </Link>
          )}
        </div>
      )}

      {pairings.length === 0 ? (
        <div className="bg-white border border-[#E1E5E4] rounded-xl p-10 text-center text-sm text-[#526063]">
          No simultaneous surplus and shortage pairings currently detected across the 4 stores.
        </div>
      ) : (
        <div className="space-y-4">
          {pairings.map((pairing) => {
            const { product, surplusStores, shortageStores, relatedSignals } = pairing;
            const activeSource =
              surplusStores.find((s) => s.store.id === selectedSourceByProduct[product.id]) ||
              surplusStores[0];
            const activeDest =
              shortageStores.find((s) => s.store.id === selectedDestByProduct[product.id]) ||
              shortageStores[0];
            const maxQty = Math.max(1, (activeSource?.sellableQty ?? 2) - 1);
            const currentQty = Math.min(qtyByProduct[product.id] ?? 2, maxQty);

            return (
              <div key={product.id} className="bg-white border border-[#E1E5E4] rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#EEF1F0]">
                  <div>
                    <p className="text-xs font-mono-tabular text-[#526063]">{product.sku} · {product.category}</p>
                    <h2 className="text-base font-semibold text-[#1A2022]">{product.name}</h2>
                  </div>
                  <span className="text-xs font-mono-tabular text-[#264C4F]">
                    {relatedSignals.length} related Demand Radar signal(s)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 bg-[#F8FAF9] border border-[#D4E4E1] rounded-lg space-y-1.5">
                    <p className="font-semibold text-[#264C4F]">Surplus Stores (&ge; 4 sellable)</p>
                    {surplusStores.map(({ store, sellableQty }) => (
                      <div key={store.id} className="flex justify-between font-mono-tabular">
                        <span className="text-[#1A2022]">{store.name}</span>
                        <span className="font-semibold text-[#264C4F]">{sellableQty} units</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-lg space-y-1.5">
                    <p className="font-semibold text-amber-900">Shortage Stores (&le; 1 sellable)</p>
                    {shortageStores.map(({ store, sellableQty }) => (
                      <div key={store.id} className="flex justify-between font-mono-tabular">
                        <span className="text-[#1A2022]">{store.name}</span>
                        <span className="font-semibold text-amber-900">{sellableQty} units</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#EEF1F0] flex flex-wrap items-center gap-2.5 text-xs">
                  <select
                    aria-label={`Source branch for ${product.name}`}
                    value={activeSource?.store.id || ''}
                    onChange={(e) =>
                      setSelectedSourceByProduct((prev) => ({
                        ...prev,
                        [product.id]: e.target.value,
                      }))
                    }
                    className="px-2.5 py-1.5 bg-white border border-[#D4DAD8] rounded-md"
                  >
                    {surplusStores.map(({ store, sellableQty }) => (
                      <option key={store.id} value={store.id}>
                        From: {store.locality} ({sellableQty})
                      </option>
                    ))}
                  </select>

                  <ArrowRight className="w-3.5 h-3.5 text-[#526063]" aria-hidden="true" />

                  <select
                    aria-label={`Destination branch for ${product.name}`}
                    value={activeDest?.store.id || ''}
                    onChange={(e) =>
                      setSelectedDestByProduct((prev) => ({
                        ...prev,
                        [product.id]: e.target.value,
                      }))
                    }
                    className="px-2.5 py-1.5 bg-white border border-[#D4DAD8] rounded-md"
                  >
                    {shortageStores.map(({ store, sellableQty }) => (
                      <option key={store.id} value={store.id}>
                        To: {store.locality} ({sellableQty})
                      </option>
                    ))}
                  </select>

                  <label className="inline-flex items-center gap-1.5 text-[#526063]">
                    Qty
                    <input
                      type="number"
                      min={1}
                      max={maxQty}
                      value={currentQty}
                      onChange={(e) =>
                        setQtyByProduct((prev) => ({
                          ...prev,
                          [product.id]: Math.max(1, Number.parseInt(e.target.value || '1', 10)),
                        }))
                      }
                      aria-label={`Transfer quantity for ${product.name}`}
                      className="w-16 px-2 py-1.5 font-mono-tabular border border-[#D4DAD8] rounded-md bg-white text-[#1A2022]"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void handleQueuePairing(pairing)}
                    className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 font-medium text-white bg-[#264C4F] hover:bg-[#1D3B3D] rounded-md transition-colors whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    Request Transfer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
