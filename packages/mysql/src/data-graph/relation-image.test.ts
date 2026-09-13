import { Selection, toGraphReadRequest } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import { contextualGraph } from '../../../sql/src/data-graph/relation-image.test-support.js';

import { compileMysqlQuery, compileMysqlSelection } from './sql.js';

describe('MySQL relational membership compiler', () => {
  it('uses the shared EXISTS compiler with MySQL quoting and positional parameters', () => {
    const { chapters, mappings } = contextualGraph();
    const result = compileMysqlQuery(chapters.toQuery(), undefined, mappings[1]!, {
      selectionMappings: mappings,
    });
    expect(result.values).toEqual([true, 'part', 'chapter']);
    expect(result.text.match(/EXISTS/g)).toHaveLength(2);
    expect(result.text.match(/\?/g)).toHaveLength(3);
    expect(result.text).toContain('`__ontahi_image_0`.`node_id` = `image_nodes`.`parent_id`');
    expect(result.text).toContain('`__ontahi_image_1`.`book_id` = `__ontahi_image_0`.`book_id`');
  });

  it('parameterizes source values and rejects absent or ambiguous receiver mappings', () => {
    const { Book, mappings } = contextualGraph();
    const input = "x' OR TRUE --";
    const selected = Selection.where(Book, b => b.id.eq(input)).parts;
    const sql = compileMysqlQuery(selected.toQuery(), undefined, mappings[1]!, {
      selectionMappings: mappings,
    });
    expect(sql.values).toEqual([input, 'part']);
    expect(sql.text).not.toContain(input);
    for (const selectionMappings of [[mappings[1]!], [...mappings, mappings[0]!]])
      expect(() =>
        compileMysqlQuery(selected.toQuery(), undefined, mappings[1]!, {
          selectionMappings,
        }),
      ).toThrow('Expected one SQL mapping');
  });

  it('does not open protocol v1 or mutation membership', () => {
    const { chapters, mappings } = contextualGraph();
    expect(() => toGraphReadRequest(chapters.toQuery(), 'run')).toThrow('protocol v1');
    expect(() => chapters.delete()).toThrow('relation-image');
    // Commands use this compiler without read-only relational mapping context.
    expect(() => compileMysqlSelection(chapters.build(), mappings[1]!, [])).toThrow(
      'relation-image',
    );
  });
});
