import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ExplorerEntityDetail } from '../contracts/index.js';

import {
  formatExplorerEntityValue,
  getExplorerEntityInstanceLabel,
  getExplorerReferenceLocator,
  getExplorerRelatedRowLabel,
} from './entity-instance-values.js';

afterEach(cleanup);

describe('Explorer instance values', () => {
  it('formats null, boolean, and object values without losing their meaning', () => {
    render(
      <div>
        <div data-testid='null'>{formatExplorerEntityValue(null)}</div>
        <div data-testid='boolean'>{formatExplorerEntityValue(false)}</div>
        <div data-testid='object'>{formatExplorerEntityValue({ rank: 2 })}</div>
      </div>,
    );

    expect(screen.getByTestId('null').textContent).toBe('null');
    expect(screen.getByTestId('boolean').textContent).toBe('false');
    expect(screen.getByTestId('object').textContent).toBe('{"rank":2}');
  });

  it('normalizes portable and scalar Reference values through reflected identity', () => {
    expect(getExplorerReferenceLocator(null, { fields: ['id'] })).toBeUndefined();
    expect(
      getExplorerReferenceLocator(
        { kind: 'entity-ref', entityName: 'Tag', locator: { id: 'tag-1' } },
        { fields: ['id'] },
      ),
    ).toEqual({ id: 'tag-1' });
    expect(getExplorerReferenceLocator('tag-2', { fields: ['id'] })).toEqual({ id: 'tag-2' });
    expect(
      getExplorerReferenceLocator('incomplete', { fields: ['workspaceId', 'slug'] }),
    ).toBeUndefined();
  });

  it('falls back from display metadata to identity and Entity names', () => {
    const entity = {
      name: 'Tag',
      fieldCount: 0,
      relationCount: 0,
      graphOperationCount: 0,
      domainOperationCount: 0,
      durableOperationCount: 0,
      taskCount: 0,
      diagram: '',
      fields: [],
      relations: [],
    } satisfies ExplorerEntityDetail;

    expect(getExplorerEntityInstanceLabel(entity, {})).toBe('Tag');
    expect(
      getExplorerEntityInstanceLabel(
        { ...entity, identity: { name: 'byId', fields: ['id'] } },
        {
          id: 'tag-1',
        },
      ),
    ).toBe('tag-1');
    expect(
      getExplorerRelatedRowLabel(
        { arbitrary: true },
        { name: 'items', kind: 'hasMany', target: 'TodoItem' },
      ),
    ).toBe('{"arbitrary":true}');
  });
});
