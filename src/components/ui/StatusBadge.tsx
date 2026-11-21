import { AlertTriangle, CheckCircle2, Clock, Info, XCircle } from 'lucide-react';

export type StatusTone = 'neutral' | 'teal' | 'success' | 'warning' | 'danger';

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  withIcon?: boolean;
}

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-[#F0F2F1] text-[#3E4B4E] border-[#DCE1DF]',
  teal: 'bg-[#E7F0EE] text-[#264C4F] border-[#C9DBD7]',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-red-50 text-red-800 border-red-200',
};

export function StatusBadge({ label, tone = 'neutral', withIcon = true }: StatusBadgeProps) {
  const Icon =
    tone === 'success'
      ? CheckCircle2
      : tone === 'warning'
        ? Clock
        : tone === 'danger'
          ? XCircle
          : tone === 'teal'
            ? Info
            : AlertTriangle;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 ${TONE_CLASSES[tone]}`}
    >
      {withIcon && <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
}
