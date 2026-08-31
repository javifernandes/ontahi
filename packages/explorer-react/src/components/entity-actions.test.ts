import type { AnyEntityRef } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import type { ExplorerOperationDescriptor } from '../contracts/index.js';

import {
  buildExplorerContextualOperationInput,
  getExplorerInstanceOperationBinding,
  getExplorerInstanceOperationBindings,
} from './entity-actions.js';

const operation = (
  overrides: Partial<ExplorerOperationDescriptor> = {},
): ExplorerOperationDescriptor => ({
  id: 'TodoItem.deleteTag',
  entityName: 'TodoItem',
  name: 'deleteTag',
  kind: 'domain',
  authority: 'server',
  exposure: 'bridge',
  inputSchema: {
    source: 'ontahi',
    summary: 'object',
    fields: [{ path: 'tag', type: 'Tag', required: true }],
  },
  inputRefs: [
    {
      path: 'tag',
      entityName: 'Tag',
      receiver: false,
      optional: false,
      locators: [{ name: 'refById', fields: ['tag'], sourceFields: ['id'] }],
    },
  ],
  resultSchema: { source: 'not-declared', summary: 'unknown', fields: [] },
  ...overrides,
});

const tagRef: AnyEntityRef = {
  kind: 'entity-ref',
  entityName: 'Tag',
  locator: { id: 'tag-1' },
};

describe('Explorer instance operation bindings', () => {
  it('finds and binds a cross-owner operation from the instance identity', () => {
    const binding = getExplorerInstanceOperationBinding(operation(), tagRef);

    expect(binding).toMatchObject({
      kind: 'reference',
      operation: { id: 'TodoItem.deleteTag' },
      inputRef: { path: 'tag', entityName: 'Tag' },
      locator: { name: 'refById' },
    });
    expect(buildExplorerContextualOperationInput(binding!, tagRef)).toEqual({
      tag: {
        kind: 'entity-ref',
        entityName: 'Tag',
        locator: { id: 'tag-1' },
      },
    });
  });

  it('does not guess when multiple compatible inputs could be the instance receiver', () => {
    const ambiguous = operation({
      inputRefs: [operation().inputRefs![0]!, { ...operation().inputRefs![0]!, path: 'otherTag' }],
    });

    expect(getExplorerInstanceOperationBinding(ambiguous, tagRef)).toBeNull();
  });

  it('uses an explicit receiver to disambiguate compatible references', () => {
    const receiver = { ...operation().inputRefs![0]!, receiver: true };
    const resolved = operation({
      inputRefs: [receiver, { ...receiver, path: 'otherTag', receiver: false }],
    });

    const binding = getExplorerInstanceOperationBinding(resolved, tagRef);

    expect(binding?.kind).toBe('reference');
    expect(binding?.kind === 'reference' ? binding.inputRef.path : undefined).toBe('tag');
  });

  it('binds one-cardinality Entity selections but leaves many selections explicit', () => {
    const rename = operation({
      id: 'TodoList.rename',
      entityName: 'TodoList',
      name: 'rename',
      inputRefs: [],
      inputSchema: {
        source: 'ontahi',
        summary: 'object',
        fields: [
          {
            path: 'list',
            type: 'Selection<TodoList>',
            required: true,
            selection: { entityName: 'TodoList', cardinality: 'one' },
          },
          { path: 'name', type: 'string', required: true },
        ],
      },
    });
    const listRef: AnyEntityRef = {
      kind: 'entity-ref',
      entityName: 'TodoList',
      locator: { id: 'list-1' },
    };
    const binding = getExplorerInstanceOperationBinding(rename, listRef);

    expect(binding).toMatchObject({ kind: 'selection', field: { path: 'list' } });
    expect(buildExplorerContextualOperationInput(binding!, listRef)).toEqual({
      list: {
        kind: 'selection',
        entityName: 'TodoList',
        expression: { kind: 'references', refs: [listRef] },
      },
      name: '',
    });
    expect(
      getExplorerInstanceOperationBinding(
        {
          ...rename,
          inputSchema: {
            ...rename.inputSchema,
            fields: [
              {
                ...rename.inputSchema.fields[0]!,
                selection: { entityName: 'TodoList', cardinality: 'many' },
              },
            ],
          },
        },
        listRef,
      ),
    ).toBeNull();
  });

  it('ignores operations whose entity or locator cannot match the instance', () => {
    const missingLocator: AnyEntityRef = {
      kind: 'entity-ref',
      entityName: 'Tag',
      locator: { slug: 'important' },
    };

    expect(getExplorerInstanceOperationBinding(operation(), missingLocator)).toBeNull();
    expect(
      getExplorerInstanceOperationBinding(operation(), {
        ...tagRef,
        entityName: 'TodoItem',
      }),
    ).toBeNull();
    expect(getExplorerInstanceOperationBindings([operation()], tagRef)).toHaveLength(1);
  });
});
