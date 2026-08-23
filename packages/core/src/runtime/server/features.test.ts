import { describe, expect, it } from 'vitest';

import { collectFeaturesFromGraphOperations, deriveFeatureProviderKey } from './features.js';

describe('server runtime features', () => {
  it('derives provider keys from graph operation paths', () => {
    expect(deriveFeatureProviderKey('Book.importFromGithubMarkdown')).toBe(
      'book_import_from_github_markdown',
    );
  });

  it('collects feature definitions from graph operation requirements', () => {
    const features = collectFeaturesFromGraphOperations([
      {
        id: 'Book.importFromGithubMarkdown',
        description: 'Import a Markdown book from GitHub',
        requires: [
          {
            feature: {},
          },
        ],
      },
      {
        id: 'ContentNode.evaluateExerciseSubmission',
        description: 'Evaluate an exercise submission',
        requires: [
          {
            feature: {
              providerKey: 'automatic_assisted_exercise_evaluation',
              defaultValue: true,
            },
          },
        ],
      },
    ]);

    expect(features).toEqual([
      {
        id: 'Book.importFromGithubMarkdown',
        providerKey: 'book_import_from_github_markdown',
        description: 'Import a Markdown book from GitHub',
        defaultValue: false,
      },
      {
        id: 'ContentNode.evaluateExerciseSubmission',
        providerKey: 'automatic_assisted_exercise_evaluation',
        description: 'Evaluate an exercise submission',
        defaultValue: true,
      },
    ]);
  });

  it('deduplicates explicit shared feature identities', () => {
    const features = collectFeaturesFromGraphOperations([
      {
        id: 'Book.importFromGithubMarkdown',
        requires: [
          {
            feature: {
              id: 'Book.githubImport',
              description: 'GitHub import',
            },
          },
        ],
      },
      {
        id: 'Book.syncFromGithubPush',
        requires: [
          {
            feature: {
              id: 'Book.githubImport',
              description: 'Should not replace the first definition',
            },
          },
        ],
      },
    ]);

    expect(features).toEqual([
      {
        id: 'Book.githubImport',
        providerKey: 'book_github_import',
        description: 'GitHub import',
        defaultValue: false,
      },
    ]);
  });
});
