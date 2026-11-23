import { describe, expect, it } from 'vitest';

import { graphSchemaDescriptorToJsonSchema, type GraphSchemaDescriptor } from './descriptor.js';

describe('graphSchemaDescriptorToJsonSchema', () => {
  it('projects portable descriptor structure without a data-graph definition', () => {
    const descriptor: GraphSchemaDescriptor = {
      kind: 'object',
      role: 'value',
      name: 'CreateBookInput',
      unknownKeys: 'strict',
      fields: {
        title: { kind: 'scalar', type: 'string' },
        subtitle: { kind: 'optional', item: { kind: 'scalar', type: 'string' } },
        format: {
          kind: 'default',
          item: { kind: 'scalar', type: 'enum', enumValues: ['print', 'digital'] },
          defaultValue: 'print',
        },
      },
    };

    expect(graphSchemaDescriptorToJsonSchema(descriptor)).toEqual({
      type: 'object',
      title: 'CreateBookInput',
      properties: {
        title: { type: 'string' },
        subtitle: { type: 'string' },
        format: { type: 'string', enum: ['print', 'digital'], default: 'print' },
      },
      required: ['title'],
      additionalProperties: false,
    });
  });

  it('collects lazy definitions once and references them recursively', () => {
    const node: GraphSchemaDescriptor = {
      kind: 'lazy',
      name: 'Node',
      item: {
        kind: 'object',
        role: 'object',
        unknownKeys: 'strip',
        fields: {
          name: { kind: 'scalar', type: 'string' },
          children: {
            kind: 'array',
            item: { kind: 'lazy', name: 'Node' },
          },
        },
      },
    };

    expect(graphSchemaDescriptorToJsonSchema(node)).toEqual({
      $ref: '#/$defs/Node',
      $defs: {
        Node: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            children: { type: 'array', items: { $ref: '#/$defs/Node' } },
          },
          required: ['name', 'children'],
          additionalProperties: false,
        },
      },
    });
  });

  it('projects nullable and named descriptors and accepts void output', () => {
    expect(
      graphSchemaDescriptorToJsonSchema({
        kind: 'named',
        name: 'OptionalTitle',
        item: { kind: 'nullable', item: { kind: 'scalar', type: 'string' } },
      }),
    ).toEqual({
      title: 'OptionalTitle',
      anyOf: [{ type: 'string' }, { type: 'null' }],
    });
    expect(graphSchemaDescriptorToJsonSchema({ kind: 'void' })).toEqual({});
  });
});
