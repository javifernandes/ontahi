const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const week = 7 * day;
const month = 30 * day;
const year = 365 * day;
const dateTimeLocale = 'en-US';

function toDate(value: Date | string): Date | null {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatAbsoluteDate(date: Date): string {
  const now = new Date();
  const sameYear = now.getFullYear() === date.getFullYear();

  return date.toLocaleDateString(dateTimeLocale, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function formatRelativeTime(value: string): string {
  const date = toDate(value);
  if (!date) return value;

  const diffMs = date.getTime() - Date.now();
  const absDiffMs = Math.abs(diffMs);
  const isFuture = diffMs > 0;

  const formatCompact = (amount: number, suffix: string) =>
    isFuture ? `in ${amount}${suffix}` : `${amount}${suffix} ago`;

  if (absDiffMs < minute) return formatCompact(Math.max(1, Math.floor(absDiffMs / 1000)), 's');
  if (absDiffMs < hour) return formatCompact(Math.floor(absDiffMs / minute), 'm');
  if (absDiffMs < day) return formatCompact(Math.floor(absDiffMs / hour), 'h');
  if (absDiffMs < week) return formatCompact(Math.floor(absDiffMs / day), 'd');
  if (absDiffMs < month) return formatCompact(Math.floor(absDiffMs / week), 'w');
  if (absDiffMs < year) return formatAbsoluteDate(date);
  return formatAbsoluteDate(date);
}

export function formatExactDateTime(value: string): string {
  const date = toDate(value);
  if (!date) return value;
  return date.toLocaleString(dateTimeLocale);
}

export function formatRelativeDate(value: Date | string): string {
  const date = toDate(value);
  if (!date) return typeof value === 'string' ? value : value.toString();

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'Just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatFullDate(value: Date | string): string {
  const date = toDate(value);
  if (!date) return typeof value === 'string' ? value : value.toString();

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
