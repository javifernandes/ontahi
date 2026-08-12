'use client';

import { ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import type { ExplorerSchemaDescriptor, ExplorerSchemaField } from '../contracts/index.js';
import { cx } from '../internal/cx.js';

type ExplorerSchemaFieldTreeNode = {
  segment: string;
  path: string;
  field?: ExplorerSchemaField;
  children: ExplorerSchemaFieldTreeNode[];
};

export const ExplorerFieldRow = ({
  name,
  type,
  required = null,
}: {
  name: string;
  type: string;
  required?: boolean | null;
}) => (
  <div className='flex flex-col gap-2 rounded-md bg-muted/35 px-3 py-2 text-sm md:flex-row md:items-center md:justify-between'>
    <span className='break-all font-mono text-foreground'>{name}</span>
    <div className='flex flex-wrap items-center gap-3 md:justify-end'>
      <span className='rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary'>
        {type}
      </span>
      {required == null ? null : (
        <span className='rounded-md bg-background/80 px-2 py-0.5 text-xs text-muted-foreground'>
          {required ? 'required' : 'optional'}
        </span>
      )}
    </div>
  </div>
);

const normalizeSchemaPathSegment = (segment: string, isLast: boolean) =>
  !isLast && segment.endsWith('[]') ? segment.slice(0, -2) : segment;

const buildSchemaFieldTree = (fields: ExplorerSchemaField[]): ExplorerSchemaFieldTreeNode[] => {
  const appendField = (siblings: ExplorerSchemaFieldTreeNode[], field: ExplorerSchemaField) => {
    const segments = field.path.split('.').filter(Boolean);
    let currentSiblings = siblings;
    let currentPath = '';

    for (const [index, segment] of segments.entries()) {
      const normalizedSegment = normalizeSchemaPathSegment(segment, index === segments.length - 1);
      currentPath = currentPath ? `${currentPath}.${segment}` : segment;
      let node = currentSiblings.find(candidate => candidate.segment === normalizedSegment);

      if (!node) {
        node = {
          segment: normalizedSegment,
          path: currentPath,
          children: [],
        };
        currentSiblings.push(node);
      }

      currentSiblings = node.children;
      if (currentPath === field.path) {
        node.field = field;
      }
    }
  };

  const tree: ExplorerSchemaFieldTreeNode[] = [];
  for (const field of fields) {
    appendField(tree, field);
  }

  return tree;
};

const getVariantChildFields = (field: ExplorerSchemaField, parentPath: string) => {
  const arrayItemPrefix = `${parentPath}[].`;
  const objectPrefix = `${parentPath}.`;

  return (
    field.variants?.map(variant => ({
      ...variant,
      fields: variant.fields.flatMap(child => {
        if (child.path.startsWith(arrayItemPrefix)) {
          return [{ ...child, path: child.path.slice(arrayItemPrefix.length) }];
        }

        if (child.path.startsWith(objectPrefix)) {
          return [{ ...child, path: child.path.slice(objectPrefix.length) }];
        }

        return [];
      }),
    })) ?? []
  );
};

const SchemaFieldBadges = ({ type, required }: { type: string; required?: boolean | null }) => (
  <div className='flex min-w-0 flex-wrap items-center gap-2 md:justify-end'>
    <span className='min-w-0 truncate rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary'>
      {type}
    </span>
    {required == null ? null : (
      <span className='rounded-md bg-background/80 px-2 py-0.5 text-xs text-muted-foreground'>
        {required ? 'required' : 'optional'}
      </span>
    )}
  </div>
);

const SchemaFieldTreeRow = ({
  node,
  depth = 0,
}: {
  node: ExplorerSchemaFieldTreeNode;
  depth?: number;
}) => {
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const variants = node.field ? getVariantChildFields(node.field, node.path) : [];
  const hasVariantTabs = variants.length > 1;
  const selectedVariant = hasVariantTabs
    ? variants[Math.min(selectedVariantIndex, variants.length - 1)]
    : null;
  const children = selectedVariant ? buildSchemaFieldTree(selectedVariant.fields) : node.children;
  const hasChildren = children.length > 0 || hasVariantTabs;
  const type = node.field?.type ?? (hasChildren ? 'object' : 'unknown');
  const required = node.field?.required ?? null;

  if (!hasChildren) {
    return (
      <div className='grid min-h-9 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-muted/25 px-3 py-1.5 text-sm'>
        <span className='size-4' aria-hidden='true' />
        <span className='min-w-0 truncate font-mono text-foreground' title={node.path}>
          {node.segment}
        </span>
        <SchemaFieldBadges type={type} required={required} />
      </div>
    );
  }

  return (
    <details className='group/schema-node rounded-md bg-muted/25' open={depth === 0}>
      <summary className='grid min-h-9 cursor-pointer grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-1.5 text-sm marker:content-none'>
        <ChevronRight
          className='size-3.5 text-muted-foreground transition-transform group-open/schema-node:rotate-90'
          aria-hidden='true'
        />
        <span className='min-w-0 truncate font-mono text-foreground' title={node.path}>
          {node.segment}
        </span>
        <SchemaFieldBadges type={type} required={required} />
      </summary>
      <div className='ml-5 grid gap-1.5 border-l border-border/70 pb-2 pl-3 pr-2'>
        {hasVariantTabs ? (
          <div
            className='mb-1 flex w-fit max-w-full flex-wrap gap-1 rounded-md bg-background/60 p-1'
            role='tablist'
            aria-label={`${node.segment} variants`}
          >
            {variants.map((variant, index) => {
              const selected = selectedVariant?.type === variant.type;

              return (
                <button
                  key={variant.type}
                  type='button'
                  role='tab'
                  aria-selected={selected}
                  onClick={() => setSelectedVariantIndex(index)}
                  className={cx(
                    'rounded px-2 py-1 font-mono text-[0.7rem] transition-colors',
                    selected
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {variant.type}
                </button>
              );
            })}
          </div>
        ) : null}
        {children.map(child => (
          <SchemaFieldTreeRow key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
};

export const ExplorerSchemaFields = ({ schema }: { schema: ExplorerSchemaDescriptor }) => {
  if (schema.fields.length === 0) {
    return null;
  }

  const tree = buildSchemaFieldTree(schema.fields);

  return (
    <div className='grid gap-1.5'>
      {tree.map(node => (
        <SchemaFieldTreeRow key={node.path} node={node} />
      ))}
    </div>
  );
};

const Badge = ({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) => (
  <span
    className={cx(
      'inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground',
      className,
    )}
    title={title}
  >
    {children}
  </span>
);

export const ExplorerSchemaStatusBadge = ({ schema }: { schema: ExplorerSchemaDescriptor }) => {
  if (schema.source === 'not-declared') {
    return (
      <Badge className='size-6 justify-center px-0' title={schema.summary}>
        ?
      </Badge>
    );
  }

  if (schema.source === 'unknown') {
    return <Badge title={schema.summary}>unknown</Badge>;
  }

  return null;
};
