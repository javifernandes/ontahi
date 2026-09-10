import { undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { entity, field } from '@ontahi/core/data-graph';
import { authoringDialectPreference } from '@ontahi/language-codemirror';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOntahiDiagnostics } from '../diagnostics.js';

import { withConsoleMetadata } from './console-transport.test-support.js';
import { OntahiDevtools } from './ontahi-devtools.js';

const Tag = entity('Tag', { id: field.id(), name: field.string() });

afterEach(() => {
  cleanup();
  authoringDialectPreference.set(undefined);
});

const openConsole = (initialDocument = 'Tag.many()', initialDialect?: 'ts' | 'declarative') => {
  const request = vi.fn();
  render(
    <OntahiDevtools
      initiallyOpen
      diagnostics={createOntahiDiagnostics()}
      runtimeTransport={withConsoleMetadata(request)}
      console={{ entities: [Tag], initialDocument, initialDialect }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Console' }));
  const editor = screen.getByRole('textbox', { name: 'Ontahí Console expression' });
  const view = EditorView.findFromDOM(editor)!;
  return { view, request };
};

const setPreference = (dialect: 'ts' | 'declarative') => {
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Preferred dialect' }), {
    target: { value: dialect },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Console' }));
};

describe('shared authoring settings', () => {
  it('retains the same editor and undo history across Settings and converts without executing', () => {
    const { view, request } = openConsole();
    act(() =>
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Tag.count()' } }),
    );
    setPreference('declarative');
    expect(EditorView.findFromDOM(screen.getByRole('textbox'))).toBe(view);
    expect(view.state.doc.toString()).toBe('Tag count');
    expect(request).not.toHaveBeenCalled();
    act(() => {
      undo(view);
    });
    expect(view.state.doc.toString()).toBe('Tag.count()');
    expect(screen.getByRole('button', { name: 'TS' }).getAttribute('aria-pressed')).toBe('true');
    expect(authoringDialectPreference.getSnapshot()).toBe('declarative');
  });

  it('keeps incomplete drafts intact when the preference changes', () => {
    const { view, request } = openConsole('Tag.where(');
    setPreference('declarative');
    expect(view.state.doc.toString()).toBe('Tag.where(');
    expect(screen.getByText(/Preferred dialect changed; this incomplete draft/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'TS' }).getAttribute('aria-pressed')).toBe('true');
    expect(request).not.toHaveBeenCalled();
  });

  it('uses the saved default on mount while leaving the Console switch local', () => {
    authoringDialectPreference.set('declarative');
    const { view, request } = openConsole();
    expect(view.state.doc.toString()).toBe('Tag many');
    fireEvent.click(screen.getByRole('button', { name: 'TS' }));
    expect(view.state.doc.toString()).toBe('Tag.many()');
    expect(authoringDialectPreference.getSnapshot()).toBe('declarative');
    expect(request).not.toHaveBeenCalled();
  });

  it('respects an explicit host dialect override', () => {
    authoringDialectPreference.set('declarative');
    const { view } = openConsole('Tag.many()', 'ts');
    expect(view.state.doc.toString()).toBe('Tag.many()');
  });
});
