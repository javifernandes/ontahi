'use client';

import { useState } from 'react';

import type { ExplorerSchemaDescriptor } from '../contracts/index.js';

import { ExplorerCollapsibleSection } from './collapsible-section.js';
import { ExplorerJsonEditor } from './json-editor.js';
import { ExplorerSchemaFields, ExplorerSchemaStatusBadge } from './schema-fields.js';

type SchemaPanelView = 'fields' | 'json';

export type ExplorerSchemaPanelProps = {
  title: string;
  schema: ExplorerSchemaDescriptor;
  defaultOpen?: boolean;
  jsonPath?: string;
};

const getDefaultOpen = (schema: ExplorerSchemaDescriptor) =>
  schema.source !== 'not-declared' || schema.fields.length > 0;

const getDefaultJsonPath = (title: string) =>
  `ontahi-explorer://schema/${title.toLowerCase()}.json`;

export const ExplorerSchemaPanel = ({
  title,
  schema,
  defaultOpen = getDefaultOpen(schema),
  jsonPath = getDefaultJsonPath(title),
}: ExplorerSchemaPanelProps) => {
  const [view, setView] = useState<SchemaPanelView>('fields');
  const canShowJson = Boolean(schema.jsonSchema);
  const showJson = canShowJson && view === 'json';

  return (
    <ExplorerCollapsibleSection
      title={title}
      defaultOpen={defaultOpen}
      summaryAside={
        canShowJson ? (
          <button
            type='button'
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              setView(current => (current === 'json' ? 'fields' : 'json'));
            }}
            className='rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground'
          >
            {showJson ? 'Fields' : 'JSON'}
          </button>
        ) : null
      }
    >
      {schema.fields.length === 0 || schema.source !== 'zod' ? (
        <div className='flex flex-wrap items-center gap-2'>
          <ExplorerSchemaStatusBadge schema={schema} />
          {schema.fields.length === 0 ? (
            <span className='text-sm text-muted-foreground'>{schema.summary}</span>
          ) : null}
        </div>
      ) : null}
      {schema.error ? <p className='text-sm text-destructive'>{schema.error}</p> : null}
      {showJson ? (
        <ExplorerJsonEditor
          label={`${title} schema`}
          value={JSON.stringify(schema.jsonSchema, null, 2)}
          path={jsonPath}
          height='320px'
          readOnly
          showHeader={false}
        />
      ) : (
        <ExplorerSchemaFields schema={schema} />
      )}
    </ExplorerCollapsibleSection>
  );
};
