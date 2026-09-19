import { createEntityRef, createGraphClientCache, entity, field } from '@ontahi/core/data-graph';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOntahiDiagnostics } from '../diagnostics.js';
import { createEntityHistory } from '../entity-history.js';

import { EntityHistoryPanel } from './entity-history-panel.js';
import { OntahiDevtools } from './ontahi-devtools.js';

const Book = entity('Book', { id: field.id(), title: field.string() })
  .locators({ byId: 'id' })
  .identity('byId');
const row = (title: string) => ({ id: 'b1', title });
afterEach(cleanup);

describe('entity history UI', { timeout: 15_000 }, () => {
  it('records across panel closure, pins historical values, stops without losing history, and keeps live cache separate', () => {
    const cache = createGraphClientCache();
    cache.writeEntity(Book, row('Baseline'));
    render(
      <OntahiDevtools diagnostics={createOntahiDiagnostics()} clientCache={cache} initiallyOpen />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const toggle = screen.getByRole('checkbox', {
      name: 'Record entity history',
    }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Close Devtools' }));
    act(() => {
      cache.writeEntity(Book, row('While closed'));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Ontahí Devtools' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cache' }));
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    const timeline = screen.getByRole('region', { name: 'Entity history timeline' });
    expect(within(timeline).getAllByRole('button')).toHaveLength(2);
    expect(screen.getAllByText('"While closed"')[0]).toBeTruthy();
    fireEvent.click(within(timeline).getByRole('button', { name: /#1 · baseline/ }));
    act(() => {
      cache.writeEntity(Book, row('Newest'));
    });
    expect(screen.getAllByText('"Baseline"')[0]).toBeTruthy();
    expect(screen.queryByText('"Newest"')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Follow latest' }));
    expect(screen.getAllByText('"Newest"')[0]).toBeTruthy();
    expect(screen.getByText('title · changed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Record entity history' }));
    act(() => {
      cache.writeEntity(Book, row('After stop'));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cache' }));
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(screen.getAllByText('"Newest"')[0]).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Live state' }));
    expect(screen.getAllByText('"After stop"')[0]).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear entity history' }));
    expect(cache.readEntity(createEntityRef(Book, { id: 'b1' }))).toEqual(row('After stop'));
  });

  it('unsubscribes from the old cache on replacement and from the new cache on unmount', () => {
    const cache = createGraphClientCache();
    const next = createGraphClientCache();
    const removed = vi.fn();
    const removedNext = vi.fn();
    const subscribe = cache.subscribe;
    const subscribeNext = next.subscribe;
    vi.spyOn(cache, 'subscribe').mockImplementation(listener => {
      const stop = subscribe(listener);
      return () => {
        removed();
        stop();
      };
    });
    vi.spyOn(next, 'subscribe').mockImplementation(listener => {
      const stop = subscribeNext(listener);
      return () => {
        removedNext();
        stop();
      };
    });
    const diagnostics = createOntahiDiagnostics();
    const { rerender, unmount } = render(
      <OntahiDevtools diagnostics={diagnostics} clientCache={cache} initiallyOpen />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Record entity history' }));
    rerender(<OntahiDevtools diagnostics={diagnostics} clientCache={next} initiallyOpen />);
    expect(removed).toHaveBeenCalledOnce();
    expect(
      (screen.getByRole('checkbox', { name: 'Record entity history' }) as HTMLInputElement).checked,
    ).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Record entity history' }));
    unmount();
    expect(removedNext).toHaveBeenCalledOnce();
  });

  it('does not compare across a stopped recording gap when an entity disappeared', () => {
    const cache = createGraphClientCache();
    const history = createEntityHistory(cache);
    history.setRecording(true);
    cache.writeEntity(Book, row('Old segment'));
    history.setRecording(false);
    cache.clear();
    history.setRecording(true);
    cache.writeEntity(Book, row('New segment'));
    render(<EntityHistoryPanel history={history} />);
    expect(
      screen.getByText('Captured fields (no preceding snapshot in this recording segment)'),
    ).toBeTruthy();
    expect(screen.getByText('title · added')).toBeTruthy();
    history.dispose();
  });

  it('keeps removed entities discoverable, explains eviction, and filters historical entries', () => {
    const cache = createGraphClientCache();
    const history = createEntityHistory(cache, { capacity: 3 });
    history.setRecording(true);
    cache.writeEntity(Book, row('First'));
    render(<EntityHistoryPanel history={history} />);
    fireEvent.click(screen.getByRole('button', { name: /#1 · write/ }));
    act(() => {
      cache.invalidateEntity(createEntityRef(Book, { id: 'b1' }));
      cache.clear();
    });
    expect(screen.getAllByText('"First"')[0]).toBeTruthy();
    act(() => {
      cache.writeEntity(Book, row('Next'));
    });
    expect(screen.getByText(/selected event is no longer in this view/)).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'invalidate' } });
    expect(screen.getByText('Entity invalidated from the local cache.')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'clear' } });
    expect(screen.getByText(/does not imply server deletion/)).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'absent' } });
    expect(screen.getByText('No history matches this filter.')).toBeTruthy();
    history.dispose();
  });
});
