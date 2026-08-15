'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Reveal from 'reveal.js';

type Todo = {
  id: number;
  title: string;
  completed: boolean;
};

const initialTodos: Todo[] = [
  { id: 1, title: 'Name the domain', completed: true },
  { id: 2, title: 'Choose what matters now', completed: false },
  { id: 3, title: 'Make change explicit', completed: false },
];

const atlasSources = {
  entity: 'ontahi.model.entity',
  relationship: 'ontahi.model.relationship',
  selection: 'ontahi.model.selection',
  ref: 'ontahi.model.ref',
  operation: 'ontahi.model.domain-operation',
  runtime: 'ontahi.runtime-capability-model',
} as const;

function AtlasSource({ children }: Readonly<{ children: React.ReactNode }>) {
  return <p className="atlas-source">{children}</p>;
}

function TodoExperiment() {
  const [todos, setTodos] = useState(initialTodos);
  const pendingIds = todos.filter(todo => !todo.completed).map(todo => todo.id);

  function completePending() {
    setTodos(current => current.map(todo => ({ ...todo, completed: true })));
  }

  return (
    <div className="experiment">
      <div className="experiment-state">
        <p className="surface-label">Running state</p>
        <ul>
          {todos.map(todo => (
            <li key={todo.id} className={todo.completed ? 'is-complete' : undefined}>
              <span>{todo.completed ? '✓' : '○'}</span>
              {todo.title}
            </li>
          ))}
        </ul>
        <div className="experiment-actions">
          <button type="button" onClick={completePending} disabled={pendingIds.length === 0}>
            Execute completeTodos
          </button>
          <button type="button" className="quiet-action" onClick={() => setTodos(initialTodos)}>
            Reset
          </button>
        </div>
      </div>

      <pre className="code-surface" aria-label="Ontahí operation">
        <code>
          <span className="code-muted">const pending = </span>
          <span className="code-accent">selection</span>
          <span className="code-muted">(Todo, todo =&gt;</span>
          {'\n  '}
          <span className="code-muted">todo.completed.eq(</span>
          <span className="code-value">false</span>
          <span className="code-muted">));</span>
          {'\n\n'}
          <span className="code-accent">completeTodos</span>
          <span className="code-muted">.execute({'{'}</span>
          {'\n  '}
          <span className="code-muted">todos: pending</span>
          {'\n'}
          <span className="code-muted">{'}'});</span>
          {'\n\n'}
          <span className="code-comment">
            {'// resolves now → ['}
            {pendingIds.join(', ')}
            {']'}
          </span>
        </code>
      </pre>
    </div>
  );
}

export function LearnDeck() {
  const deckRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!deckRef.current) return;

    const deck = new Reveal(deckRef.current, {
      hash: true,
      history: true,
      controls: true,
      controlsTutorial: false,
      progress: true,
      center: false,
      transition: 'fade',
      backgroundTransition: 'fade',
      width: 1440,
      height: 900,
      margin: 0,
    });

    void deck.initialize();

    return () => {
      deck.destroy();
    };
  }, []);

  return (
    <main className="learn-page">
      <header className="learn-header">
        <Link className="learn-brand" href="/">
          <Image src="/brand/ontahi-symbol.svg" width={30} height={30} alt="" priority />
          <span>Ontahí</span>
        </Link>
        <span className="learn-context">An executable domain, in eight movements</span>
      </header>

      <div className="reveal" ref={deckRef}>
        <div className="slides">
          <section className="learn-slide title-slide" data-background-color="#f6f2eb">
            <div className="botanical-mark" aria-hidden="true" />
            <p className="kicker">A short exploration</p>
            <h1>The model is where the system begins.</h1>
            <p className="opening">
              Ontahí gives an application a language for naming what exists, what can change, and
              where that change can run.
            </p>
            <p className="start-cue">Use the arrows to begin</p>
          </section>

          <section className="learn-slide premise-slide" data-background-color="#162018">
            <p className="kicker">01 · The application</p>
            <h2>A to-do list is small. Its domain is not nothing.</h2>
            <div className="premise-layout">
              <p className="large-statement">
                It has things with identity, relationships between them, populations we care
                about, and changes the system allows.
              </p>
              <p className="side-note">
                Ontahí starts there—not with routes, tables, controllers, or framework glue.
              </p>
            </div>
          </section>

          <section className="learn-slide model-slide" data-background-color="#f6f2eb">
            <p className="kicker">02 · The grammar</p>
            <h2>Four ideas describe the heart of the application.</h2>
            <div className="model-sequence" aria-label="Ontahí core model">
              <article>
                <span>01</span>
                <h3>Entities</h3>
                <p>Name the things that carry identity and meaning.</p>
              </article>
              <article>
                <span>02</span>
                <h3>Relations</h3>
                <p>Make the domain navigable as a graph.</p>
              </article>
              <article>
                <span>03</span>
                <h3>Selections</h3>
                <p>Describe the set of things meant right now.</p>
              </article>
              <article>
                <span>04</span>
                <h3>Operations</h3>
                <p>Name the changes the domain permits.</p>
              </article>
            </div>
          </section>

          <section className="learn-slide entity-slide" data-background-color="#e8e2d3">
            <p className="kicker">03 · Entities & relations</p>
            <h2>The domain becomes a graph before it becomes storage.</h2>
            <div className="entity-composition">
              <div className="entity-node entity-person">
                <span>Entity</span>
                <strong>Person</strong>
                <small>person-1</small>
              </div>
              <div className="relation-line">
                <span>owns</span>
              </div>
              <div className="entity-node entity-todo">
                <span>Entity</span>
                <strong>Todo</strong>
                <small>todo-2</small>
              </div>
              <p>
                The relation belongs to the model. A runtime may later bind it to a foreign key,
                an in-memory index, or another physical representation.
              </p>
            </div>
            <AtlasSource>
              {atlasSources.entity} · {atlasSources.relationship}
            </AtlasSource>
          </section>

          <section className="learn-slide selection-slide" data-background-color="#f6f2eb">
            <p className="kicker">04 · Selections & refs</p>
            <h2>A Selection says which things we mean.</h2>
            <div className="selection-composition">
              <pre className="code-surface">
                <code>
                  <span className="code-muted">const pending = </span>
                  <span className="code-accent">selection</span>
                  <span className="code-muted">(Todo, todo =&gt;</span>
                  {'\n  '}
                  <span className="code-muted">todo.completed.eq(</span>
                  <span className="code-value">false</span>
                  <span className="code-muted">));</span>
                </code>
              </pre>
              <div className="selection-meaning">
                <p>
                  Not query syntax. Not UI state. A portable description of membership that reads,
                  operations, policies, and tools can share.
                </p>
                <p className="selection-aside">
                  A Ref identifies one entity. A Selection describes a set—even when that set has
                  one member.
                </p>
              </div>
            </div>
            <AtlasSource>
              {atlasSources.selection} · {atlasSources.ref}
            </AtlasSource>
          </section>

          <section className="learn-slide operation-slide" data-background-color="#1f2a24">
            <p className="kicker">05 · Operations</p>
            <h2>An operation names a possible transformation.</h2>
            <TodoExperiment />
            <AtlasSource>{atlasSources.operation}</AtlasSource>
          </section>

          <section className="learn-slide runtime-slide" data-background-color="#f6f2eb">
            <p className="kicker">06 · Runtimes</p>
            <h2>The application keeps its language when the technology changes.</h2>
            <div className="runtime-comparison">
              <div className="runtime-model">
                <span>Application model</span>
                <strong>Todo · owns · pending · completeTodos</strong>
              </div>
              <div className="runtime-choices">
                <article>
                  <span>Start here</span>
                  <h3>In memory</h3>
                  <p>A complete local reference runtime.</p>
                </article>
                <article>
                  <span>Bind later</span>
                  <h3>PostgreSQL</h3>
                  <p>Persistent state behind the same semantic model.</p>
                </article>
              </div>
            </div>
            <AtlasSource>{atlasSources.runtime}</AtlasSource>
          </section>

          <section className="learn-slide frontier-slide" data-background-color="#e8e2d3">
            <p className="kicker">07 · The frontier</p>
            <h2>What happens when one runtime is no longer enough?</h2>
            <div className="frontier-lines">
              <p>
                <span>Distributed runtimes</span>
                Where does an operation run, and how does its meaning survive the boundary?
              </p>
              <p>
                <span>Replicated state</span>
                Which state is authoritative, observed, derived, copied, or reconciled?
              </p>
            </div>
            <p className="frontier-close">
              These are not side concerns. They are where Ontahí’s model must prove that it can
              describe a whole living system.
            </p>
          </section>

          <section className="learn-slide closing-slide" data-background-color="#d94c43">
            <p className="kicker">08 · An invitation</p>
            <h2>Ontahí is taking shape. It should be argued with.</h2>
            <p className="closing-question">
              Does this grammar describe the applications you know—or hide distinctions that
              matter?
            </p>
            <div className="closing-links">
              <a href="https://github.com/javifernandes/ontahi">Explore the source</a>
              <Link href="/">Return to Ontahí</Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
