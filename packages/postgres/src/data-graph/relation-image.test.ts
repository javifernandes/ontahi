import { Selection, toGraphReadRequest, type GraphCommandSpec } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import { contextualGraph } from './relation-image.test-support.js';
import { compilePostgresCommand, compilePostgresQuery } from './sql.js';

describe('PostgreSQL relational membership compiler', () => {
  it('compiles nested self traversal to correlated EXISTS with shared parameter numbering', () => {
    const { chapters, mappings } = contextualGraph();
    const result = compilePostgresQuery(chapters.toQuery(), undefined, mappings[1]!, {
      selectionMappings: mappings,
    });
    expect(result.values).toEqual([true, 'part', 'chapter']);
    expect(result.text.match(/EXISTS/g)).toHaveLength(2);
    expect(result.text).toContain('"__ontahi_image_0"."node_id" = "image_nodes"."parent_id"');
    expect(result.text).toContain('"__ontahi_image_1"."book_id" = "__ontahi_image_0"."book_id"');
    expect(result.text).toContain('"__ontahi_image_0"."node_type" = $2');
    expect(result.text).toContain('"image_nodes"."node_type" = $3');
  });
  it('keeps values parameterized and rejects missing, duplicate or incompatible receiver mappings', () => {
    const { Book, mappings } = contextualGraph();
    const selected = Selection.where(Book, b => b.id.eq("x' OR TRUE --")).parts;
    expect(
      compilePostgresQuery(selected.toQuery(), undefined, mappings[1]!, {
        selectionMappings: mappings,
      }).values,
    ).toContain("x' OR TRUE --");
    expect(() =>
      compilePostgresQuery(selected.toQuery(), undefined, mappings[1]!, {
        selectionMappings: [mappings[1]!],
      }),
    ).toThrow('source');
    expect(() =>
      compilePostgresQuery(selected.toQuery(), undefined, mappings[1]!, {
        selectionMappings: [...mappings, mappings[0]!],
      }),
    ).toThrow('Expected one SQL mapping');
    expect(() =>
      compilePostgresQuery(
        selected.toQuery(),
        undefined,
        { ...mappings[1]!, columns: {} },
        { selectionMappings: mappings },
      ),
    ).toThrow('unmapped join');
  });
  it('retains explicit remote and mutation boundaries', () => {
    const { chapters, mappings } = contextualGraph();
    expect(() => toGraphReadRequest(chapters.toQuery(), 'run')).toThrow('protocol v1');
    expect(() => chapters.delete()).toThrow('relation-image');
    expect(() =>
      compilePostgresCommand(
        {
          kind: 'command',
          operation: 'delete',
          root: chapters.root,
          selection: chapters.build(),
        } as GraphCommandSpec,
        mappings[1]!,
      ),
    ).toThrow('relation-image');
  });
});
