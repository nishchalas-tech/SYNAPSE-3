import { RotateCcw } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useNetwork } from '../../context/NetworkContext';
import { formatDateTime } from '../../utils/formatters';

export function AdminActivityPage() {
  const { state, resetDemoData } = useNetwork();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A2022]">Network Activity</h1>
          <p className="text-sm text-[#526063] mt-1">
            Unified event timeline across Customer orders, Store Manager verifications & pick tasks, and Administrator transfer actions.
          </p>
        </div>

        <button
          type="button"
          onClick={resetDemoData}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#1A2022] bg-white border border-[#D4DAD8] hover:bg-[#F7F7F5] rounded-lg self-start"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          Reset Seeded Demo State
        </button>
      </div>

      <div className="bg-white border border-[#E1E5E4] rounded-xl overflow-hidden">
        <div className="divide-y divide-[#EEF1F0]">
          {state.activityLogs.map((log) => (
            <div key={log.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge label={log.eventType} tone="teal" withIcon={false} />
                  <span className="text-xs font-medium text-[#1A2022]">
                    {log.actorName} ({log.actorRole})
                  </span>
                  <span className="text-[11px] text-[#526063]">
                    {log.isSeeded ? 'Seeded Baseline' : 'Live Demo Action'}
                  </span>
                </div>
                <p className="text-sm text-[#1A2022]">{log.summary}</p>
              </div>
              <span className="text-xs font-mono-tabular text-[#526063] shrink-0">
                {formatDateTime(log.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
