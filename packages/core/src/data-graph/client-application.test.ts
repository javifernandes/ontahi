import { describe, expect, it } from 'vitest';

import { defineClientApplication } from './client-application.js';
import { entity, field } from './definitions.js';
import { defineClientEntity } from './operations.js';

describe('Client Application', () => {
  it('retains one generated Entity catalog without changing its members', () => {
    const Todo = defineClientEntity(entity('Todo', { id: field.id() }));

    const application = defineClientApplication({ entities: [Todo] });

    expect(application.entities).toEqual([Todo]);
  });
});
