import {
  createEntityRef,
  createGraphClientCache,
  entity,
  field,
  graphOutput,
} from '@ontahi/core/data-graph';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { createOntahiDiagnostics } from '../diagnostics.js';

import { CachePanel } from './cache-panel.js';
import { OntahiDevtools } from './ontahi-devtools.js';

const Book = entity('Book', { id: field.id(), slug: field.string(), title: field.string() })
  .locators({ refById: 'id', refBySlug: 'slug' })
  .identity('refById');

afterEach(cleanup);

// Match the other Devtools UI suites: coverage on CI can exceed the 5s default.
describe('Cache inspector', { timeout: 15_000 }, () => {
  it('orders the views and distinguishes an unconnected cache from an empty cache', () => {
    render(
      <OntahiDevtools
        diagnostics={createOntahiDiagnostics()}
        console={{ entities: [Book] }}
        initiallyOpen
      />,
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Devtools views' }))
        .getAllByRole('button')
        .map(button => button.textContent),
    ).toEqual(['Console', 'Activity 0', 'Cache', 'Settings']);
    fireEvent.click(screen.getByRole('button', { name: 'Cache' }));
    expect(screen.getByText(/No client cache connected/)).toBeTruthy();
  });

  it('updates live, filters aliases, and navigates normalized output references in both directions', () => {
    const cache = createGraphClientCache();
    render(<CachePanel clientCache={cache} />);
    expect(screen.getByText('No cached entities yet.')).toBeTruthy();
    act(() => {
      cache.writeOutput(['books'], graphOutput.array(graphOutput.entity(Book)), [
        { id: 'b1', slug: 'programming', title: 'Programming' },
      ]);
    });
    expect(screen.getByText('"Programming"')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'programming' } });
    expect(
      within(screen.getByRole('list', { name: 'Cache entries' })).getAllByRole('button'),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'References' }));
    expect(screen.queryByRole('heading', { name: 'Present fields' })).toBeNull();
    expect(screen.getByText('"books"')).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Selected cache entry' })).getByRole('button', {
        name: 'Open output 1',
      }),
    );
    expect(screen.getByRole('heading', { name: 'Normalized output' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aliases' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'References' }));
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Selected cache entry' })).getByRole('button', {
        name: 'Open Book:{"id":"b1"}',
      }),
    );
    expect(screen.getByRole('heading', { name: 'Present fields' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aliases' }));
    expect(screen.getByRole('heading', { name: 'Identity, aliases and freshness' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Present fields' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Data' }));
    act(() => {
      cache.writeEntity(Book, { id: 'b1', slug: 'programming', title: 'Revised' });
    });
    expect(screen.getByText('"Revised"')).toBeTruthy();
    act(() => {
      cache.invalidateEntity(createEntityRef(Book, { id: 'b1' }));
    });
    expect(screen.queryByRole('region', { name: 'Selected cache entry' })).toBeNull();
    act(() => {
      cache.clear();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Outputs 0' }));
    expect(screen.getByText('No cached outputs yet.')).toBeTruthy();
  });

  it('inspects local values containing bigint and cycles without changing the cache', () => {
    const cache = createGraphClientCache();
    const cycle: Record<string, unknown> = { amount: 42n };
    cycle.self = cycle;
    cache.writeEntity(Book, { id: 'b1', slug: 'local', title: 'Local', extra: cycle });
    render(<CachePanel clientCache={cache} />);
    expect(screen.getByText('"42"')).toBeTruthy();
    expect(screen.getByText('"[Circular]"')).toBeTruthy();
    expect(cycle.amount).toBe(42n);
    expect(cycle.self).toBe(cycle);
  });

  it('switches cache sources and shows writes that occurred while the tab was closed', () => {
    const first = createGraphClientCache();
    const second = createGraphClientCache();
    second.writeEntity(Book, { id: 'b2', slug: 'next', title: 'Second cache' });
    const { rerender } = render(<CachePanel clientCache={first} />);
    rerender(<CachePanel clientCache={second} />);
    expect(screen.getByText('"Second cache"')).toBeTruthy();
    act(() => {
      first.writeEntity(Book, { id: 'b1', slug: 'old', title: 'Old cache' });
    });
    expect(screen.queryByText('"Old cache"')).toBeNull();
    rerender(<CachePanel />);
    act(() => {
      second.writeEntity(Book, { id: 'b2', slug: 'next', title: 'While closed' });
    });
    rerender(<CachePanel clientCache={second} />);
    expect(screen.getByText('"While closed"')).toBeTruthy();
  });
});
