import type { AnyEntityRef } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import type { ExplorerEntityDetail } from '../contracts/index.js';

import { createExplorerManyToManyRelationshipCommand } from './entity-instance-relation.js';

const ref = (entityName: string, id: string): AnyEntityRef => ({
  kind: 'entity-ref',
  entityName,
  locator: { id },
});

describe('createExplorerManyToManyRelationshipCommand', () => {
  it('rejects Relations without canonical many-to-many identity', () => {
    const relation = {
      name: 'tags',
      kind: 'manyToMany',
      target: 'Tag',
    } satisfies ExplorerEntityDetail['relations'][number];

    expect(() =>
      createExplorerManyToManyRelationshipCommand(
        'link',
        relation,
        ref('TodoItem', 'todo-1'),
        ref('Tag', 'tag-1'),
      ),
    ).toThrow('Relation TodoItem.tags is not canonical many-to-many.');
  });

  it('rejects participants that do not match the canonical Relation endpoints', () => {
    const relation = {
      name: 'tags',
      kind: 'manyToMany',
      target: 'Tag',
      canonicalIdentity: {
        sourceEntityName: 'TodoItem',
        relationName: 'tags',
        targetEntityName: 'Tag',
        cardinality: 'many-to-many',
      },
    } satisfies ExplorerEntityDetail['relations'][number];

    expect(() =>
      createExplorerManyToManyRelationshipCommand(
        'unlink',
        relation,
        ref('Project', 'project-1'),
        ref('Person', 'person-1'),
      ),
    ).toThrow('Relation Project.tags received invalid participants.');
  });
});
