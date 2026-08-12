import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { createExplorerRoutes, ExplorerShell } from '../../src/components/index.js';

afterEach(cleanup);

describe('ExplorerShell', () => {
  it('owns section routes while preserving host home and header content', () => {
    render(
      <ExplorerShell
        basePath='/internal/graph'
        currentPath='/internal/graph/entities/Book?tab=data'
        homeHref='/'
        headerEnd={<button type='button'>Account</button>}
      >
        <h1>Explorer content</h1>
      </ExplorerShell>,
    );

    expect(screen.getByRole('navigation', { name: 'Explorer sections' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe(
      '/internal/graph',
    );
    expect(screen.getByRole('link', { name: 'Entities' }).getAttribute('href')).toBe(
      '/internal/graph/entities',
    );
    expect(screen.getByRole('link', { name: 'Entities' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: 'Account' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Explorer content' })).toBeTruthy();
  });

  it('uses root as the standalone overview and omits host navigation by default', () => {
    render(
      <ExplorerShell currentPath='/'>
        <div>Standalone Explorer</div>
      </ExplorerShell>,
    );

    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Operations' }).getAttribute('href')).toBe(
      '/operations',
    );
  });

  it('exposes collection and detail routes from the same route contract', () => {
    const routes = createExplorerRoutes('/internal/graph/');

    expect(routes.overview).toBe('/internal/graph');
    expect(routes.entities).toBe('/internal/graph/entities');
    expect(routes.operations).toBe('/internal/graph/operations');
    expect(routes.tasks).toBe('/internal/graph/tasks');
    expect(routes.events).toBe('/internal/graph/events');
    expect(routes.entity('Book')).toBe('/internal/graph/entities/Book');
  });
});
