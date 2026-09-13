import {
  createEntityRef,
  entity,
  field,
  mapEntity,
  Selection,
  toGraphReadRequest,
  type SelectionExpression,
} from '@ontahi/core/data-graph';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { compileContextualSelection } from './contextual-selection.js';
import { contextualModel } from './contextual-selection.test-support.js';
import { createSupabaseDataGraphRuntime } from './runtime.js';

describe('Supabase contextual read compilation boundaries', () => {
  it('requires the exact receiver registry and rejects ambiguous Entity names', () => {
    const { chapters, entities, Book } = contextualModel();
    for (const registry of [[], entities.slice(1), [...entities, Book]])
      expect(() => compileContextualSelection(chapters.root, chapters.build(), registry)).toThrow(
        'Expected one registered',
      );
    const impostor = entity(chapters.root.name, { id: field.id() });
    expect(() => compileContextualSelection(impostor, chapters.build(), entities)).toThrow(
      'root does not match',
    );
  });

  it('rejects unknown and inherited relation names rather than dropping a hop', () => {
    const { Node, Book, entities } = contextualModel();
    for (const relationName of ['missing', 'constructor', 'toString']) {
      const expression: SelectionExpression = {
        kind: 'relation-image',
        source: Selection.all(Book).toAst(),
        relationName,
      };
      expect(() => compileContextualSelection(Node, expression, entities)).toThrow(
        'does not target',
      );
    }
  });

  it('rejects virtual, unknown and syntactically unsafe filter columns', () => {
    const { chapters, Node, entities } = contextualModel();
    expect(() =>
      compileContextualSelection(
        Node,
        {
          kind: 'and',
          operands: [
            chapters.build(),
            { kind: 'predicate', operator: 'eq', fieldName: 'unknown', value: true },
          ],
        },
        entities,
      ),
    ).toThrow('stored field');
    mapEntity(Node).toTable('nodes', {
      id: 'id),other(*)',
      bookId: 'book_id',
      parentId: 'parent_id',
      type: 'node_type',
    });
    expect(() =>
      compileContextualSelection(Node, chapters.and(n => n.id.eq('c1')).build(), entities),
    ).toThrow('identifier');
    const Derived = entity('Derived', {
      id: field.id(),
      name: field.derived(field.string(), () => 'virtual'),
    });
    const Parent = entity('Parent', { id: field.id() }).hasMany('children', Derived, { via: 'id' });
    const selection = Selection.all(Parent)
      .through('children')
      .and(n => n.name.eq('x'));
    expect(() => compileContextualSelection(Derived, selection.build(), [Parent, Derived])).toThrow(
      'stored field',
    );
  });

  it('avoids collisions between physical columns and internal existence aliases', () => {
    const { chapters, Node, entities } = contextualModel();
    mapEntity(Node).toTable('nodes', {
      id: '__ontahi_image_0',
      bookId: 'book_id',
      parentId: 'parent_id',
      type: 'node_type',
    });
    const plan = compileContextualSelection(Node, chapters.build(), entities)!;
    expect(plan.embeds.join(',')).not.toContain('__ontahi_image_0:');
    expect(plan.embeds).toHaveLength(1);
  });

  it('lowers reference membership inside the source instead of fetching it', () => {
    const { Book, entities } = contextualModel();
    const selection = Selection.references(Book, [createEntityRef(Book, { id: 'b1' })]).parts;
    const plan = compileContextualSelection(selection.root, selection.build(), entities)!;
    expect(plan.filters.map(filter => filter.filter)).toContain('id.eq."b1"');
  });

  it('retains protocol v1 and command rejection and limits recursion', () => {
    const { chapters, entities } = contextualModel();
    expect(() => toGraphReadRequest(chapters.toQuery(), 'run')).toThrow('protocol v1');
    expect(() => chapters.delete()).toThrow('relation-image');
    let expression = chapters.build();
    for (let i = 0; i < 34; i++) expression = { kind: 'not', operand: expression };
    expect(() => compileContextualSelection(chapters.root, expression, entities)).toThrow('budget');
  });

  it('rejects missing edge mappings, composite edges and unsupported inverse self navigation', () => {
    const { Book, Tag, Node, entities } = contextualModel();
    const unmapped = Selection.all(Book.manyToMany('unmapped', Tag)).through('unmapped');
    expect(() => compileContextualSelection(Tag, unmapped.build(), entities)).toThrow(
      'matching edge mappings',
    );
    const Composite = entity('Composite', { tenant: field.string(), key: field.string() })
      .locators({ identity: ['tenant', 'key'] })
      .identity('identity')
      .manyToMany('tags', Tag);
    const composite = Selection.all(Composite).through('tags');
    expect(() =>
      compileContextualSelection(Tag, composite.build(), [...entities, Composite]),
    ).toThrow('single-field');
    const inverse = Selection.all(Node.belongsTo('parent', Node, { via: 'parentId' })).through(
      'parent',
    );
    expect(() => compileContextualSelection(Node, inverse.build(), entities)).toThrow(
      'self navigation',
    );
  });

  it('surfaces compile errors through the host error factory before acquiring a client', async () => {
    const { chapters } = contextualModel();
    const getClient = vi.fn(() => Effect.die('Must not acquire a client'));
    const db = createSupabaseDataGraphRuntime({
      getReadClient: getClient,
      getCommandClient: getClient,
      createError: ({ message }) => new Error(message),
    });
    await expect(Effect.runPromise(db.run(chapters.toQuery(), undefined))).rejects.toThrow(
      'registered',
    );
    await expect(Effect.runPromise(db.count(chapters.toQuery(), undefined))).rejects.toThrow(
      'registered',
    );
    expect(getClient).not.toHaveBeenCalled();
  });
});
