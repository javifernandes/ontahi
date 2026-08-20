import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createExplorerRoutes,
  ExplorerEntityStructurePanel,
  ExplorerEventDetail,
  ExplorerProvider,
} from '../../src/components/index.js';
import type { ExplorerEntityDetail, ExplorerEventDescriptor } from '../../src/contracts/index.js';

afterEach(cleanup);

const entity: ExplorerEntityDetail = {
  name: 'Book',
  fieldCount: 2,
  relationCount: 1,
  graphOperationCount: 0,
  domainOperationCount: 1,
  durableOperationCount: 0,
  taskCount: 0,
  diagram: 'graph TD; Book-->Profile;',
  fields: [
    {
      name: 'id',
      type: 'uuid',
      nullable: false,
    },
    {
      name: 'title',
      type: 'text',
      nullable: true,
    },
  ],
  relations: [
    {
      name: 'collaborators',
      kind: 'hasMany',
      target: 'Profile',
      direction: 'inverse',
      cardinality: 'many',
      nullable: false,
      required: false,
      structuralVerbs: ['add', 'remove'],
    },
  ],
  relationOwner: {
    source: 'Library',
    name: 'books',
    cardinality: 'many',
    target: 'Book',
  },
};

const event: ExplorerEventDescriptor = {
  type: 'BookShared',
  domain: 'sharing',
  actorScoped: true,
  payloadFields: [
    {
      name: 'bookSlug',
      type: 'string',
    },
  ],
  relatedEntities: ['Book', 'Profile'],
  handlers: ['notifyCollaborator'],
};

describe('Explorer entity detail panels', () => {
  it('renders entity structure with a package-owned entity link', () => {
    render(
      <ExplorerEntityStructurePanel
        entity={entity}
        renderDiagram={diagram => <pre data-testid='diagram'>{diagram}</pre>}
      />,
    );

    expect(screen.getByTestId('diagram').textContent).toBe('graph TD; Book-->Profile;');
    expect(screen.getByText('Relation Owner')).toBeTruthy();
    expect(screen.getByText('title')).toBeTruthy();
    expect(screen.getByText('optional')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe(
      '/entities/Profile',
    );
    expect(screen.getByText('inverse')).toBeTruthy();
    expect(screen.getByText('many')).toBeTruthy();
    expect(screen.getByText('add · remove')).toBeTruthy();
  });

  it('supports a configured Explorer mount path for entity relations', () => {
    render(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerEntityStructurePanel entity={entity} />
      </ExplorerProvider>,
    );

    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe(
      '/internal/graph/entities/Profile',
    );
  });

  it('labels structural inverse endpoints as derived metadata', () => {
    render(
      <ExplorerEntityStructurePanel
        entity={{
          ...entity,
          relations: [
            {
              ...entity.relations[0],
              name: 'TodoItem.tags',
              provenance: 'derived-inverse',
              structuralVerbs: [],
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('TodoItem.tags')).toBeTruthy();
    expect(screen.getByText('derived inverse')).toBeTruthy();
    expect(screen.queryByText('add · remove')).toBeNull();
  });

  it('renders event detail with package-owned related entity links', () => {
    render(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerEventDetail event={event} />
      </ExplorerProvider>,
    );

    expect(screen.getByText('BookShared')).toBeTruthy();
    expect(screen.getByText('actor')).toBeTruthy();
    expect(screen.getByText('bookSlug')).toBeTruthy();
    expect(screen.getByText('notifyCollaborator')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Book' }).getAttribute('href')).toBe(
      '/internal/graph/entities/Book',
    );
  });

  it('normalizes Explorer route base paths and encodes route identifiers', () => {
    expect(createExplorerRoutes('/internal/graph').entity('Book Shelf')).toBe(
      '/internal/graph/entities/Book%20Shelf',
    );
    expect(createExplorerRoutes('/internal/graph').entity('Book', { tab: 'operations' })).toBe(
      '/internal/graph/entities/Book?tab=operations',
    );
    expect(createExplorerRoutes('/internal/graph').operation('Book.share', { tab: 'schema' })).toBe(
      '/internal/graph/operations/Book.share?tab=schema',
    );
    expect(createExplorerRoutes('/internal/graph').task('importBook', { tab: 'runs' })).toBe(
      '/internal/graph/tasks/importBook?tab=runs',
    );
    expect(createExplorerRoutes('/').entity('Book')).toBe('/entities/Book');
    expect(createExplorerRoutes('internal/graph/').event('BookShared')).toBe(
      '/internal/graph/events/BookShared',
    );
  });
});
