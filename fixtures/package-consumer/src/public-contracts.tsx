import {
  analyzeOntahiApplication,
  createFileSystemSourceLoader,
  formatCodegenDiagnostic,
  type CodegenDiagnostic,
  type OntahiApplicationAnalysis,
} from '@ontahi/codegen';
import { createOntahiExpressExplorer } from '@ontahi/runtime-express/explorer';
import { createElement, type ReactNode } from 'react';

type PublicModules = [
  typeof import('@ontahi/core'),
  typeof import('@ontahi/core/data-graph'),
  typeof import('@ontahi/core/runtime/browser'),
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
  typeof import('@ontahi/postgres'),
  typeof import('@ontahi/postgres/data-graph'),
  typeof import('@ontahi/runtime-express'),
  typeof import('@ontahi/runtime-express/explorer'),
  typeof import('@ontahi/runtime-nextjs'),
  typeof import('@ontahi/runtime-nextjs/actions'),
  typeof import('@ontahi/runtime-nextjs/actions/server'),
  typeof import('@ontahi/runtime-nextjs/operation-invocation'),
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
