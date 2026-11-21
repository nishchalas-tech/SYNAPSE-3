import type { FreshnessState, FulfilmentPreference, OrderStatus, PickTaskStatus } from '../types/index.js';

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getFreshnessState(isoTimestamp: string): {
  state: FreshnessState;
  label: string;
  hoursAgo: number;
  relativeText: string;
} {
  const verifiedMs = new Date(isoTimestamp).getTime();
  const diffMs = Math.max(0, Date.now() - verifiedMs);
  const hoursAgo = Math.floor(diffMs / (1000 * 60 * 60));
  const minsAgo = Math.floor(diffMs / (1000 * 60));

  let relativeText = 'Just now';
  if (minsAgo >= 1 && minsAgo < 60) {
    relativeText = `${minsAgo}m ago`;
  } else if (hoursAgo >= 1 && hoursAgo < 48) {
    relativeText = `${hoursAgo} ${hoursAgo === 1 ? 'hour' : 'hours'} ago`;
  } else if (hoursAgo >= 48) {
    const days = Math.floor(hoursAgo / 24);
    relativeText = `${days} days ago`;
  }

  if (hoursAgo < 6) {
    return { state: 'FRESH', label: 'Fresh', hoursAgo, relativeText };
  }
  if (hoursAgo < 12) {
    return { state: 'AGING', label: 'Aging', hoursAgo, relativeText };
  }
  return { state: 'STALE', label: 'Stale', hoursAgo, relativeText };
}

export function formatDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function getPreferenceLabel(pref: FulfilmentPreference): string {
  switch (pref) {
    case 'SAVE_MONEY':
      return 'Save Money';
    case 'GET_IT_FASTER':
      return 'Get It Faster';
    case 'SHOP_NEARBY':
      return 'Shop Nearby';
  }
}

export function getOrderStatusMeta(status: OrderStatus): {
  label: string;
  tone: 'neutral' | 'teal' | 'success' | 'warning' | 'danger';
} {
  switch (status) {
    case 'CONFIRMED':
      return { label: 'Confirmed', tone: 'teal' };
    case 'PICK_PENDING':
      return { label: 'Pending Store Pick', tone: 'warning' };
    case 'READY_FOR_DISPATCH':
      return { label: 'Ready for Dispatch', tone: 'success' };
    case 'REASSIGNED':
      return { label: 'Reassigned to Alternate Store', tone: 'teal' };
    case 'EXCEPTION':
      return { label: 'Fulfilment Exception', tone: 'danger' };
    case 'COMPLETED':
      return { label: 'Completed', tone: 'success' };
  }
}

export function getPickTaskStatusMeta(status: PickTaskStatus): {
  label: string;
  tone: 'neutral' | 'teal' | 'success' | 'warning' | 'danger';
} {
  switch (status) {
    case 'PENDING':
      return { label: 'Awaiting Pick', tone: 'warning' };
    case 'ACCEPTED':
      return { label: 'Accepted', tone: 'success' };
    case 'REJECTED':
      return { label: 'Rejected', tone: 'danger' };
    case 'REASSIGNED':
      return { label: 'Reassigned Out', tone: 'teal' };
    case 'EXCEPTION':
      return { label: 'No Alternate Stock', tone: 'danger' };
  }
}

export function sanitizeFirestoreId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

export function getRemainingSeconds(
  expiresAtIso: string | null | undefined,
  nowMs = Date.now()
): number {
  if (!expiresAtIso) return 0;
  const expMs = new Date(expiresAtIso).getTime();
  if (Number.isNaN(expMs)) return 0;
  return Math.max(0, Math.floor((expMs - nowMs) / 1000));
}

export function formatCountdown(
  expiresAtIso: string | null | undefined,
  nowMs = Date.now()
): string {
  if (!expiresAtIso) return 'Standard';
  const totalSec = getRemainingSeconds(expiresAtIso, nowMs);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

