import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatExactDateTime,
  formatFullDate,
  formatRelativeDate,
  formatRelativeTime,
} from '../../src/value/date-time.js';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses compact relative units for recent past timestamps', () => {
    expect(formatRelativeTime('2026-03-20T11:59:50.000Z')).toBe('10s ago');
    expect(formatRelativeTime('2026-03-20T11:57:00.000Z')).toBe('3m ago');
    expect(formatRelativeTime('2026-03-20T09:00:00.000Z')).toBe('3h ago');
    expect(formatRelativeTime('2026-03-17T12:00:00.000Z')).toBe('3d ago');
    expect(formatRelativeTime('2026-03-06T12:00:00.000Z')).toBe('2w ago');
  });

  it('uses compact relative units for future timestamps', () => {
    expect(formatRelativeTime('2026-03-20T12:00:10.000Z')).toBe('in 10s');
    expect(formatRelativeTime('2026-03-20T12:03:00.000Z')).toBe('in 3m');
    expect(formatRelativeTime('2026-03-20T15:00:00.000Z')).toBe('in 3h');
    expect(formatRelativeTime('2026-03-23T12:00:00.000Z')).toBe('in 3d');
  });

  it('returns invalid date inputs unchanged for string-based formatters', () => {
    expect(formatRelativeTime('not-a-date')).toBe('not-a-date');
    expect(formatExactDateTime('not-a-date')).toBe('not-a-date');
    expect(formatRelativeDate('not-a-date')).toBe('not-a-date');
    expect(formatFullDate('not-a-date')).toBe('not-a-date');
  });

  it('falls back to an absolute date after a month', () => {
    expect(formatRelativeTime('2026-02-10T12:00:00.000Z')).toBe('Feb 10');
    expect(formatRelativeTime('2025-01-10T12:00:00.000Z')).toBe('Jan 10, 2025');
  });

  it('does not round up into the next compact unit inside a branch', () => {
    expect(formatRelativeTime('2026-03-20T11:59:00.001Z')).toBe('59s ago');
    expect(formatRelativeTime('2026-03-20T11:00:00.001Z')).toBe('59m ago');
  });

  it('uses the explicit en-US locale for absolute dates and exact date-times', () => {
    const dateStringSpy = vi.spyOn(Date.prototype, 'toLocaleDateString');
    const dateTimeSpy = vi.spyOn(Date.prototype, 'toLocaleString');

    formatRelativeTime('2025-01-10T12:00:00.000Z');
    formatExactDateTime('2026-03-20T12:00:00.000Z');

    expect(dateStringSpy).toHaveBeenCalledWith('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    expect(dateTimeSpy).toHaveBeenCalledWith('en-US');
  });

  it('formats relative date display branches', () => {
    expect(formatRelativeDate(new Date('2026-03-20T11:59:30.000Z'))).toBe('Just now');
    expect(formatRelativeDate(new Date('2026-03-20T11:30:00.000Z'))).toBe('30m ago');
    expect(formatRelativeDate(new Date('2026-03-20T09:00:00.000Z'))).toBe('3h ago');
    expect(formatRelativeDate(new Date('2026-03-19T12:00:00.000Z'))).toBe('Yesterday');
    expect(formatRelativeDate(new Date('2026-03-17T12:00:00.000Z'))).toBe('3 days ago');
    expect(formatRelativeDate(new Date('2026-03-01T12:00:00.000Z'))).toBe('Mar 1, 2026');
  });

  it('formats full dates with date and time fields', () => {
    const dateStringSpy = vi.spyOn(Date.prototype, 'toLocaleDateString');

    formatFullDate(new Date('2026-03-20T12:30:00.000Z'));

    expect(dateStringSpy).toHaveBeenCalledWith('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  });
});
