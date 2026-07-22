import { describe, expect, it } from 'vitest';

import { renderVercelWorkflowModules } from '../src/codegen.js';

describe('Vercel Workflow codegen', () => {
  it('derives static workflow and step entrypoints from the Ontahi application model', () => {
    const result = renderVercelWorkflowModules({
      application: {
        tasks: [
          {
            entityName: 'Book',
            name: 'internalImportFromGithubMarkdown',
            runtime: 'vercel-workflow',
            taskId: 'book.import-github-markdown',
            steps: [
              {
                id: 'import-github-markdown-source',
                importPath: './book-task',
                importedIdentifier: 'importGithubMarkdownSourceStep',
              },
            ],
          },
        ],
      },
      runtimeImportPath: './workflow-runtime',
      stepsImportPath: './steps.generated',
      stepRunnerImport: {
        importPath: './bookops-step-runner',
        importedIdentifier: 'runBookopsTaskStep',
      },
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.workflowSource).toContain(
      'export async function bookImportGithubMarkdownWorkflow(',
    );
    expect(result.workflowSource).toContain("'use workflow';");
    expect(result.workflowSource).toContain(
      "['book.import-github-markdown', bookImportGithubMarkdownWorkflow]",
    );
    expect(result.stepsSource).toContain(
      'export async function bookImportGithubMarkdownSourceStep(',
    );
    expect(result.stepsSource).toContain("'use step';");
    expect(result.stepsSource).toContain(
      "const { runBookopsTaskStep } = await import('./bookops-step-runner');",
    );
    expect(result.stepsSource).toContain("case 'import-github-markdown-source':");
    expect(result.stepsSource).toContain('runBookImportGithubMarkdownWorkflowStep');
  });

  it('emits a workflow runner for durable tasks without steps', () => {
    const result = renderVercelWorkflowModules({
      application: {
        tasks: [
          {
            name: 'refreshIndex',
            runtime: 'vercel-workflow',
            taskId: 'search.refresh-index',
            steps: [],
          },
        ],
      },
      runtimeImportPath: './workflow-runtime',
      stepsImportPath: './steps.generated',
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.workflowSource).toContain('searchRefreshIndexWorkflow');
    expect(result.stepsSource).toContain('runSearchRefreshIndexWorkflowStep');
    expect(result.stepsSource).toContain('does not declare generated steps');
  });

  it('uses the configured runtime executor when the host does not provide a step runner', () => {
    const result = renderVercelWorkflowModules({
      application: {
        tasks: [
          {
            name: 'refreshIndex',
            runtime: 'vercel-workflow',
            taskId: 'search.refresh-index',
            steps: [
              {
                id: 'refresh-documents',
                importPath: './search-task',
                importedIdentifier: 'refreshDocumentsStep',
              },
            ],
          },
        ],
      },
      runtimeImportPath: './workflow-runtime',
      stepsImportPath: './steps.generated',
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.stepsSource).toContain('runTaskStepInVercelWorkflow,');
    expect(result.stepsSource).toContain(
      'return runTaskStepInVercelWorkflow(input, runSearchRefreshIndexWorkflowStep);',
    );
  });

  it('reports unresolved ids as adapter diagnostics', () => {
    const result = renderVercelWorkflowModules({
      application: {
        tasks: [
          {
            entityName: 'Note',
            name: 'archive',
            runtime: 'vercel-workflow',
            steps: [],
          },
        ],
      },
      runtimeImportPath: './workflow-runtime',
      stepsImportPath: './steps.generated',
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'task-id-unresolved',
        taskName: 'archive',
      }),
    ]);
    expect(result.workflowSource).toContain('new Map<string, TaskWorkflow>');
    expect(result.workflowSource).not.toContain("'use workflow';");
  });
});
