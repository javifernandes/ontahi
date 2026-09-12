import {
  analyzeOntahiApplication,
  createFileSystemSourceLoader,
  formatCodegenDiagnostic,
  type CodegenDiagnostic,
  type OntahiApplicationAnalysis,
} from '@ontahi/codegen';
import { createRuntimeProtocolExchange } from '@ontahi/core/runtime/protocol';
import {
  contextualSelectionFactory,
  Selection,
  entity,
  field,
  graphSchema,
  withSelectionFactories,
  withContextualSelections,
  defineClientEntity,
} from '@ontahi/core/data-graph';
import { createFetchGraphClient } from '@ontahi/react/graph';
import { createOntahiExpressExplorer } from '@ontahi/runtime-express/explorer';
import { createExpressRuntimeProtocolHandler } from '@ontahi/runtime-express/runtime-protocol';
import { createNextRuntimeProtocolRouteHandler } from '@ontahi/runtime-nextjs/runtime-protocol';
import { createElement, type ReactNode } from 'react';

type PublicModules = [
  typeof import('@ontahi/core'),
  typeof import('@ontahi/core/data-graph'),
  typeof import('@ontahi/core/runtime/browser'),
  typeof import('@ontahi/core/runtime/identity'),
  typeof import('@ontahi/core/runtime/protocol'),
  typeof import('@ontahi/core/runtime/server'),
  typeof import('@ontahi/core/runtime/server/ingress'),
  typeof import('@ontahi/core/runtime/server/tasks'),
  typeof import('@ontahi/opentelemetry'),
  typeof import('@ontahi/codegen'),
  typeof import('@ontahi/codegen/application'),
  typeof import('@ontahi/codegen/operation-contracts'),
  typeof import('@ontahi/codegen/projections'),
  typeof import('@ontahi/codegen/runner'),
  typeof import('@ontahi/codegen/source-loader'),
  typeof import('@ontahi/supabase'),
  typeof import('@ontahi/supabase/data-graph'),
  typeof import('@ontahi/supabase/tasks'),
  typeof import('@ontahi/sql'),
  typeof import('@ontahi/sql/data-graph'),
  typeof import('@ontahi/mysql'),
  typeof import('@ontahi/mysql/data-graph'),
  typeof import('@ontahi/postgres'),
  typeof import('@ontahi/postgres/data-graph'),
  typeof import('@ontahi/runtime-express'),
  typeof import('@ontahi/runtime-express/explorer'),
  typeof import('@ontahi/runtime-express/runtime-protocol'),
  typeof import('@ontahi/runtime-nextjs'),
  typeof import('@ontahi/runtime-nextjs/actions'),
  typeof import('@ontahi/runtime-nextjs/actions/server'),
  typeof import('@ontahi/runtime-nextjs/operation-invocation'),
  typeof import('@ontahi/runtime-nextjs/graph-read'),
  typeof import('@ontahi/runtime-nextjs/runtime-protocol'),
  typeof import('@ontahi/runtime-vercel-workflows'),
  typeof import('@ontahi/runtime-vercel-workflows/runtime'),
  typeof import('@ontahi/runtime-vercel-workflows/executor'),
  typeof import('@ontahi/runtime-vercel-workflows/reconciliation'),
  typeof import('@ontahi/runtime-vercel-workflows/codegen'),
  typeof import('@ontahi/react'),
  typeof import('@ontahi/react/actions'),
  typeof import('@ontahi/react/graph'),
  typeof import('@ontahi/explorer-react'),
  typeof import('@ontahi/explorer-react/contracts'),
  typeof import('@ontahi/explorer-react/components'),
  typeof import('@ontahi/explorer-react/server'),
];

export type PublicModuleCount = PublicModules['length'];

const ContextItem = entity('ContextItem', {
  id: field.id(),
  listId: field.string(),
  done: field.boolean(),
});
const ContextList = entity('ContextList', { id: field.id() }).hasMany('items', ContextItem, {
  via: 'listId',
});
const pendingItems = contextualSelectionFactory(ContextList, 'items', item => item.done.eq(false));
const contextSelection: Selection<typeof ContextItem, undefined> = pendingItems.from(
  Selection.all(ContextList),
);
void contextSelection.toAst();
// @ts-expect-error Context factory source is a List, not an Item.
pendingItems.from(Selection.all(ContextItem));

const ContextLists = withContextualSelections(ContextList, ({ self }) => ({
  pending: self.items.where(item => item.done.eq(false)),
}));
const pending: Selection<typeof ContextItem, undefined> = Selection.all(ContextLists).pending;
void pending;
Selection.all(ContextLists)
  .where(list => list.id.eq('l1'))
  .pending.and(item => item.done.eq(true));
// @ts-expect-error target fields are checked
Selection.all(ContextLists).pending.and(item => item.missing.eq('x'));

const FactoryEntity = withSelectionFactories(entity('FactoryEntity', { id: field.id() }), {
  identity: {
    version: 1,
    input: graphSchema.object({ id: field.id() }),
    scalarInput: 'id',
    template: { kind: 'identity', bindings: { id: 'id' } },
  },
});
const factoryClient = defineClientEntity(FactoryEntity);
export const factorySelection = factoryClient.by({ identity: 'example' });
export const legacyFactoryRef = factoryClient.refById('example');

const VariantNode = entity('VariantNode', {
  id: field.id(),
  type: field.enum(['part', 'chapter']),
  title: field.string(),
});
const Chapter = VariantNode.variant('Chapter', { discriminator: { type: 'chapter' } });
const chapters = Chapter.where(node => node.title.eq('Intro'))
  .not()
  .many();
export const narrowedChapterRead: 'chapter' | undefined = chapters.__result?.type;
// @ts-expect-error Chapter predicates retain the narrowed discriminator type.
Chapter.where(node => node.type.eq('part'));
// @ts-expect-error Read-only variants are not yet Operation schema targets.
graphSchema.existingRef(Chapter);
// @ts-expect-error Variant selections do not expose generic writes.
Chapter.all().update({ type: 'part' });

export type UnifiedRuntimeProtocolPublicContracts = [
  typeof createRuntimeProtocolExchange,
  typeof createFetchGraphClient,
  typeof createExpressRuntimeProtocolHandler,
  typeof createNextRuntimeProtocolRouteHandler,
];

const diagnostic: CodegenDiagnostic = {
  code: 'fixture',
  message: 'Typed package contract',
};

export const formattedDiagnostic: string = formatCodegenDiagnostic(diagnostic);

const sourceLoader = createFileSystemSourceLoader({ rootDir: process.cwd() });

export const analyzeFixture = (graphApiPath: string): OntahiApplicationAnalysis =>
  analyzeOntahiApplication({ graphApiPath, sourceLoader });

export const explorer = createOntahiExpressExplorer({ path: '/explorer' });

export const child: ReactNode = createElement('span', null, 'Ontahi artifact fixture');
