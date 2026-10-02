import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { syntaxPalettes } from './syntax-highlighting.js';

import { consoleExpressionExtensions } from './index.js';

const luminance = (hex: string) => {
  const channels = [1, 3, 5].map(offset => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
};

describe('authoring syntax contrast', () => {
  it.each([
    ['light', '#ffffff'],
    ['light', '#f6f8f5'],
    ['dark', '#09110d'],
    ['dark', '#102019'],
  ] as const)('keeps all %s token colors readable on %s', (scheme, background) => {
    for (const color of Object.values(syntaxPalettes[scheme])) {
      const values = [luminance(color), luminance(background)].sort((a, b) => a - b);
      expect((values[1]! + 0.05) / (values[0]! + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['ts', 'declarative'] as const)('highlights by, where and many in %s', dialect => {
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc:
          dialect === 'ts'
            ? 'TodoItem.by({ identity: "t1" }).where(completed = false).many()'
            : 'TodoItem by identity "t1" where completed = false many',
        extensions: consoleExpressionExtensions(
          {
            entities: [
              {
                name: 'TodoItem',
                fields: [{ name: 'completed', type: 'boolean', nullable: false }],
              },
            ],
          },
          { dialect, colorScheme: 'dark' },
        ),
      }),
    });
    try {
      const keywords = [...view.dom.querySelectorAll('.cm-ontahi-syntax-keyword')].map(
        node => node.textContent,
      );
      expect(keywords).toContain('where');
      expect(keywords).toContain('by');
      expect(keywords).toContain('many');
      expect(view.state.facet(EditorView.darkTheme)).toBe(true);
    } finally {
      view.destroy();
    }
  });

  it.each(['ts', 'declarative'] as const)('highlights named Graph Read Holes in %s', dialect => {
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc:
          dialect === 'ts'
            ? 'TodoItem.where(ownerId = ?owner).many()'
            : 'TodoItem where ownerId = ?owner',
        extensions: consoleExpressionExtensions(
          {
            entities: [
              {
                name: 'TodoItem',
                fields: [{ name: 'ownerId', type: 'id', nullable: false }],
              },
            ],
          },
          { dialect, colorScheme: 'dark' },
        ),
      }),
    });
    try {
      expect(
        [...view.dom.querySelectorAll('.cm-ontahi-syntax-field')].map(node => node.textContent),
      ).toContain('owner');
      expect(
        [...view.dom.querySelectorAll('.cm-ontahi-syntax-punctuation')].map(
          node => node.textContent,
        ),
      ).toContain('?');
    } finally {
      view.destroy();
    }
  });

  it('highlights Declarative Operations and structured input', () => {
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: 'invoke TodoList.createList with { name: "Inbox" }',
        extensions: consoleExpressionExtensions(
          {
            entities: [{ name: 'TodoList', fields: [] }],
            operations: [{ id: 'TodoList.createList', entityName: 'TodoList', name: 'createList' }],
          },
          { dialect: 'declarative', colorScheme: 'dark' },
        ),
      }),
    });
    try {
      const text = (className: string) =>
        [...view.dom.querySelectorAll(className)].map(node => node.textContent);
      expect(text('.cm-ontahi-syntax-keyword')).toEqual(
        expect.arrayContaining(['invoke', 'createList', 'with']),
      );
      expect(text('.cm-ontahi-syntax-entity')).toContain('TodoList');
      expect(text('.cm-ontahi-syntax-field')).toContain('name');
      expect(text('.cm-ontahi-syntax-string')).toContain('"Inbox"');
    } finally {
      view.destroy();
    }
  });

  it.each(['attach', 'attach ', 'attach TodoItem '])(
    'keeps an incomplete Relationship Command keyword highlighted: %s',
    source => {
      const view = new EditorView({
        parent: document.body,
        state: EditorState.create({
          doc: source,
          extensions: consoleExpressionExtensions(
            { entities: [{ name: 'TodoItem', fields: [] }] },
            { colorScheme: 'dark' },
          ),
        }),
      });
      try {
        const keywords = [...view.dom.querySelectorAll('.cm-ontahi-syntax-keyword')].map(
          node => node.textContent,
        );
        expect(keywords).toContain('attach');
        if (source.includes('TodoItem')) {
          expect(view.dom.querySelector('.cm-ontahi-syntax-entity')?.textContent).toBe('TodoItem');
        }
      } finally {
        view.destroy();
      }
    },
  );
});
