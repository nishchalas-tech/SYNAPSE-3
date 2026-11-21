import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useNetwork } from '../../context/NetworkContext';
import type { InventoryMovementType } from '../../types';
import { formatDateTime } from '../../utils/formatters';

function getMovementTone(type: InventoryMovementType): 'teal' | 'success' | 'warning' | 'danger' | 'neutral' {
  switch (type) {
    case 'TRANSFER_IN':
    case 'CART_HOLD_RELEASE':
    case 'CART_HOLD_EXPIRED':
    case 'PICK_RELEASE':
      return 'success';
    case 'TRANSFER_OUT':
    case 'ORDER_RESERVATION':
    case 'PICK_REASSIGN_RESERVE':
      return 'teal';
    case 'CART_HOLD_LOCK':
      return 'warning';
    case 'STOCK_VERIFICATION':
    default:
      return 'neutral';
  }
}

export function AdminTransferHistoryPage() {
  const { state } = useNetwork();

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          to="/admin/transfers"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#526063] hover:text-[#1A2022]"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Back to Transfer Queue
        </Link>

        <div>
          <h1 className="text-2xl font-semibold text-[#1A2022]">
            Transfer Decision History &amp; Inventory Movement Ledger
          </h1>
          <p className="text-sm text-[#526063] mt-1">
            Auditable inter-branch approvals alongside every stock movement across transfers, pick reassignments, cycle verifications, and non-renewable 10-minute reservations.
          </p>
        </div>
      </div>

      {/* Transfer Decisions Section */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-[#1A2022]">
          Administrator Transfer Decisions ({state.transferDecisions.length})
        </h2>
        <div className="bg-white border border-[#E1E5E4] rounded-xl overflow-hidden">
          {state.transferDecisions.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <h3 className="text-base font-semibold text-[#1A2022]">No transfer decisions recorded yet</h3>
              <p className="text-sm text-[#526063]">
                Approve or reject a recommendation in the Transfer Queue to log an auditable decision here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#EEF1F0]">
              {state.transferDecisions.map((dec) => (
                <div key={dec.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#1A2022]">
                      <span>{dec.sourceStoreName}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#264C4F]" aria-hidden="true" />
                      <span>{dec.destinationStoreName}</span>
                      <StatusBadge
                        label={dec.decision}
                        tone={dec.decision === 'APPROVED' ? 'success' : 'danger'}
                      />
                    </div>
                    <p className="text-xs text-[#1A2022]">
                      {dec.productName} · <span className="font-mono-tabular">{dec.quantity} units</span>
                    </p>
                    <p className="text-xs text-[#526063]">
                      Decided by {dec.decidedBy} · Note: {dec.notes}
                    </p>
                  </div>
                  <span className="text-xs font-mono-tabular text-[#526063] shrink-0">
                    {formatDateTime(dec.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Immutable Inventory Movement Ledger */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[#1A2022]">
              Inventory Movement Ledger ({state.inventoryMovements.length})
            </h2>
            <p className="text-xs text-[#526063]">
              Records exact verified and sellable shelf stock deltas for every branch movement.
            </p>
          </div>
        </div>

        <div className="bg-white border border-[#E1E5E4] rounded-xl overflow-hidden">
          {state.inventoryMovements.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#526063]">
              No inventory movements logged yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F8FAF9] border-b border-[#E1E5E4] font-semibold text-[#526063]">
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Branch</th>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-3 text-right">Delta</th>
                    <th className="py-3 px-4">Verified</th>
                    <th className="py-3 px-4">Sellable</th>
                    <th className="py-3 px-4">Notes &amp; Actor</th>
                    <th className="py-3 px-4 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF1F0]">
                  {state.inventoryMovements.map((mov) => (
                    <tr key={mov.id} className="hover:bg-[#FAFBFA]">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusBadge
                          label={mov.movementType}
                          tone={getMovementTone(mov.movementType)}
                          withIcon={false}
                        />
                      </td>
                      <td className="py-3 px-4 font-medium text-[#1A2022] whitespace-nowrap">
                        {mov.storeName}
                      </td>
                      <td className="py-3 px-4 text-[#1A2022]">{mov.productName}</td>
                      <td
                        className={`py-3 px-3 text-right font-mono-tabular font-semibold whitespace-nowrap ${
                          mov.quantityDelta > 0
                            ? 'text-emerald-800'
                            : mov.quantityDelta < 0
                              ? 'text-amber-800'
                              : 'text-[#526063]'
                        }`}
                      >
                        {mov.quantityDelta > 0 ? `+${mov.quantityDelta}` : mov.quantityDelta}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-[#526063] whitespace-nowrap">
                        {mov.beforeVerifiedQty} → <strong className="text-[#1A2022]">{mov.afterVerifiedQty}</strong>
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-[#526063] whitespace-nowrap">
                        {mov.beforeSellableQty} → <strong className="text-[#264C4F]">{mov.afterSellableQty}</strong>
                      </td>
                      <td className="py-3 px-4 text-[#526063] max-w-xs">
                        <p className="text-[#1A2022]">{mov.notes}</p>
                        <p className="text-[11px] font-mono-tabular mt-0.5">
                          {mov.actorName} · Ref {mov.referenceId}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-[#526063] whitespace-nowrap">
                        {formatDateTime(mov.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
