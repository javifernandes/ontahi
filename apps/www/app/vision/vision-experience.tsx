'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './vision.module.css';

type Stage = 'available' | 'building' | 'next' | 'research';

type Direction = {
  number: string;
  title: string;
  summary: string;
  stage: Stage;
  ideas: readonly string[];
};

const stageLabels: Record<Stage, string> = {
  available: 'Available',
  building: 'In construction',
  next: 'Next',
  research: 'Research',
};

const directions: readonly Direction[] = [
  {
    number: '01',
    title: 'Semantic model',
    summary: 'A shared vocabulary for what an application means and what it can do.',
    stage: 'available',
    ideas: ['Entities & relations', 'Reads & commands', 'Operations', 'Conditions & reactions'],
  },
  {
    number: '02',
    title: 'Distributed execution',
    summary: 'Computations can move without surrendering their meaning to infrastructure.',
    stage: 'building',
    ideas: ['Runtime Protocol', 'Durable execution', 'Observation', 'Runtime adapters'],
  },
  {
    number: '03',
    title: 'Interaction & intelligence',
    summary: 'People and models can interpret, complete, and implement typed computations.',
    stage: 'building',
    ideas: [
      'Interactions',
      'Model interpretation',
      'Model-backed operations',
      'Assistants & sessions',
    ],
  },
  {
    number: '04',
    title: 'Trust & evolution',
    summary: 'Real applications need authority, continuity, and safe change over time.',
    stage: 'next',
    ideas: ['Authorization', 'Idempotency', 'Model evolution', 'Protocol conformance'],
  },
  {
    number: '05',
    title: 'Languages & surfaces',
    summary: 'One semantic core can support many ways to author, inspect, and operate a system.',
    stage: 'research',
    ideas: ['CLI', 'Devtools', 'Ontahí languages', 'Cross-language portability'],
  },
] as const;

const runtimeSteps = [
  ['Application', 'declares meaning'],
  ['Runtime', 'owns capabilities'],
  ['Protocol', 'carries requests'],
  ['Another runtime', 'continues evaluation'],
] as const;

const modelRoles = [
  {
    label: 'Interpreter',
    title: 'Language becomes a canonical request',
    body: 'A model resolves human intent into an existing Read, Command, or Operation. Ontahí still validates, authorizes, and dispatches it.',
  },
  {
    label: 'Implementation',
    title: 'A model fulfills an Operation contract',
    body: 'The Operation keeps its identity, typed input, output, authority, and lifecycle while composition selects a model-backed executor.',
  },
] as const;

const chapters = [
  'opening',
  'first-model',
  'one-meaning',
  'problem',
  'today',
  'directions',
  'runtime',
  'interaction',
  'models',
  'trust',
  'kernel',
  'community',
] as const;

const usePresentationQuery = () => {
  const [presenting, setPresenting] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setPresenting(query.has('present'));
  }, []);

  return [presenting, setPresenting] as const;
};

export const VisionExperience = () => {
  const [presenting, setPresenting] = usePresentationQuery();
  const [activeChapter, setActiveChapter] = useState(0);
  const chapterCount = chapters.length;
  const activeId = chapters[activeChapter];
  const modeLabel = presenting ? 'Exit presentation' : 'Present';
  const darkHeader = presenting && ['one-meaning', 'today', 'models', 'kernel'].includes(activeId);

  const progress = useMemo(
    () =>
      `${String(activeChapter + 1).padStart(2, '0')} / ${String(chapterCount).padStart(2, '0')}`,
    [activeChapter, chapterCount],
  );

  const changeChapter = useCallback(
    (next: number) => {
      setActiveChapter(Math.min(Math.max(next, 0), chapterCount - 1));
    },
    [chapterCount],
  );

  const togglePresentation = useCallback(() => {
    const next = !presenting;
    setPresenting(next);
    const url = new URL(window.location.href);
    if (next) {
      url.searchParams.set('present', '');
    } else {
      url.searchParams.delete('present');
    }
    window.history.replaceState({}, '', url);
  }, [presenting, setPresenting]);

  useEffect(() => {
    if (!presenting) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) {
        event.preventDefault();
        changeChapter(activeChapter + 1);
      }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
        event.preventDefault();
        changeChapter(activeChapter - 1);
      }
      if (event.key === 'Home') changeChapter(0);
      if (event.key === 'End') changeChapter(chapterCount - 1);
      if (event.key === 'Escape') togglePresentation();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeChapter, chapterCount, changeChapter, presenting, togglePresentation]);

  return (
    <div className={`${styles.vision} ${presenting ? styles.presenting : ''}`}>
      <header className={`${styles.header} ${darkHeader ? styles.darkHeader : ''}`}>
        <a className={styles.brand} href='/' aria-label='Ontahí home'>
          <Image src='/brand/ontahi-symbol.svg' width={32} height={32} alt='' priority />
          <span>Ontahí</span>
        </a>
        <div className={styles.headerActions}>
          {presenting ? <span className={styles.progress}>{progress}</span> : null}
          <button className={styles.modeButton} type='button' onClick={togglePresentation}>
            {modeLabel}
          </button>
        </div>
      </header>

      <main className={styles.story}>
        <section
          id='opening'
          className={`${styles.chapter} ${styles.opening} ${activeId === 'opening' ? styles.active : ''}`}
          aria-hidden={presenting && activeId !== 'opening'}
        >
          <div className={styles.chapterInner}>
            <p className={styles.kicker}>The evolving vision</p>
            <h1>Meaning that can move</h1>
            <p className={styles.openingStatement}>
              Define an application’s entities, relations, operations, and policies once. Use that
              meaning across databases, APIs, interfaces, and long-running work.
            </p>
            <a className={styles.readCue} href='#first-model'>
              Explore the vision <span aria-hidden='true'>↓</span>
            </a>
          </div>
        </section>

        <section
          id='first-model'
          className={`${styles.chapter} ${styles.firstModelChapter} ${activeId === 'first-model' ? styles.active : ''}`}
          aria-hidden={presenting && activeId !== 'first-model'}
        >
          <div className={styles.chapterInner}>
            <p className={styles.kicker}>Start with an ordinary application</p>
            <h2>A todo item is more than a database row</h2>
            <div className={styles.codeExplanation}>
              <pre className={styles.codeBlock} aria-label='An Ontahí TodoItem entity definition'>
                <code>{`const TodoItem = entity({
  name: 'TodoItem',
  fields: {
    id: field.generated(field.id(), 'uuid'),
    list: field.existingRef(TodoList),
    title: field.nonEmptyString({ trim: true }),
    completed: field.default(field.boolean(), false),
  },
})`}</code>
              </pre>
              <div className={styles.codeNotes}>
                <div>
                  <span>Identity</span>
                  <p>Every item has a stable, generated ID.</p>
                </div>
                <div>
                  <span>Relationship</span>
                  <p>The list reference points to another Entity.</p>
                </div>
                <div>
                  <span>Rules</span>
                  <p>Validation and defaults belong to the model.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id='one-meaning'
          className={`${styles.chapter} ${styles.oneMeaningChapter} ${activeId === 'one-meaning' ? styles.active : ''}`}
          aria-hidden={presenting && activeId !== 'one-meaning'}
        >
          <div className={styles.chapterInner}>
            <p className={styles.kicker}>One model in motion</p>
            <h2>The same meaning travels through the application</h2>
            <div className={styles.meaningFlow}>
              <article>
                <span>01 · Interface</span>
                <strong>Show open items</strong>
                <code>completed = false</code>
              </article>
              <article>
                <span>02 · Ontahí Read</span>
                <strong>A typed Selection</strong>
                <code>TodoItem.where(completed = false).many()</code>
              </article>
              <article>
                <span>03 · Runtime</span>
                <strong>Authorize and route</strong>
                <p>The runtime checks policy and finds the capability that can execute the Read.</p>
              </article>
              <article>
                <span>04 · Adapter</span>
                <strong>Execute in storage</strong>
                <p>
                  Postgres, MySQL, Supabase, or an in-memory implementation preserves the request’s
                  meaning.
                </p>
              </article>
            </div>
            <p className={styles.conclusion}>
              The interface does not own a private query language. The database does not become the
              domain model.
            </p>
          </div>
        </section>

        <section
          id='problem'
          className={`${styles.chapter} ${styles.problem} ${activeId === 'problem' ? styles.active : ''}`}
          aria-hidden={presenting && activeId !== 'problem'}
        >
          <div className={styles.chapterInner}>
            <p className={styles.kicker}>The problem</p>
            <h2>An application’s meaning is scattered</h2>
            <div className={styles.meaningMap}>
              <svg
                viewBox='0 0 1000 520'
                role='img'
                aria-labelledby='meaning-map-title meaning-map-description'
              >
                <title id='meaning-map-title'>
                  Application meaning scattered around the domain
                </title>
                <desc id='meaning-map-description'>
                  Types, databases, APIs, permissions, queues, prompts, and UI state each contain a
                  partial translation of the central domain.
                </desc>

                <g className={styles.translationLines} aria-hidden='true'>
                  <path d='M390 222 L225 130' />
                  <path d='M500 195 L500 112' />
                  <path d='M610 218 L775 145' />
                  <path d='M620 260 L800 260' />
                  <path d='M590 305 L742 405' />
                  <path d='M485 315 L485 412' />
                  <path d='M390 294 L225 395' />
                </g>

                <g className={styles.peripheralNode} transform='translate(70 70)'>
                  <rect width='170' height='72' />
                  <text x='85' y='38'>
                    types
                  </text>
                  <text className={styles.fragmentLabel} x='85' y='57'>
                    partial model
                  </text>
                </g>
                <g className={styles.peripheralNode} transform='translate(415 40)'>
                  <rect width='170' height='72' />
                  <text x='85' y='38'>
                    database
                  </text>
                  <text className={styles.fragmentLabel} x='85' y='57'>
                    stored shape
                  </text>
                </g>
                <g className={styles.peripheralNode} transform='translate(760 82)'>
                  <rect width='170' height='72' />
                  <text x='85' y='38'>
                    APIs
                  </text>
                  <text className={styles.fragmentLabel} x='85' y='57'>
                    transport shape
                  </text>
                </g>
                <g className={styles.peripheralNode} transform='translate(790 224)'>
                  <rect width='180' height='72' />
                  <text x='90' y='38'>
                    permissions
                  </text>
                  <text className={styles.fragmentLabel} x='90' y='57'>
                    access rules
                  </text>
                </g>
                <g className={styles.peripheralNode} transform='translate(700 386)'>
                  <rect width='170' height='72' />
                  <text x='85' y='38'>
                    queues
                  </text>
                  <text className={styles.fragmentLabel} x='85' y='57'>
                    work lifecycle
                  </text>
                </g>
                <g className={styles.peripheralNode} transform='translate(400 412)'>
                  <rect width='170' height='72' />
                  <text x='85' y='38'>
                    prompts
                  </text>
                  <text className={styles.fragmentLabel} x='85' y='57'>
                    implicit intent
                  </text>
                </g>
                <g className={styles.peripheralNode} transform='translate(65 366)'>
                  <rect width='170' height='72' />
                  <text x='85' y='38'>
                    UI state
                  </text>
                  <text className={styles.fragmentLabel} x='85' y='57'>
                    interaction rules
                  </text>
                </g>

                <g className={styles.domainNode} transform='translate(380 195)'>
                  <rect width='240' height='120' rx='60' />
                  <text x='120' y='62'>
                    domain
                  </text>
                  <text className={styles.domainLabel} x='120' y='84'>
                    one meaning
                  </text>
                </g>
              </svg>
            </div>
            <p className={styles.conclusion}>
              Every boundary translates the system again. Its intent becomes harder to preserve,
              inspect, and evolve.
            </p>
          </div>
        </section>

        <section
          id='today'
          className={`${styles.chapter} ${styles.darkChapter} ${activeId === 'today' ? styles.active : ''}`}
          aria-hidden={presenting && activeId !== 'today'}
        >
          <div className={styles.chapterInner}>
            <p className={styles.kicker}>Ontahí today</p>
            <h2>A shared executable vocabulary</h2>
            <div className={styles.vocabulary}>
              {['Entity', 'Relation', 'Selection', 'Read', 'Command', 'Operation'].map(
                (concept, index) => (
                  <div key={concept}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{concept}</strong>
                  </div>
                ),
              )}
            </div>
            <p className={styles.conclusion}>
              The model survives storage choices, transports, UI frameworks, and execution engines.
            </p>
          </div>
        </section>

        <section
          id='directions'
          className={`${styles.chapter} ${styles.directionsChapter} ${activeId === 'directions' ? styles.active : ''}`}
          aria-hidden={presenting && activeId !== 'directions'}
        >
          <div className={styles.wideInner}>
            <p className={styles.kicker}>Five connected directions</p>
            <h2>One kernel, a larger field of work</h2>
            <div className={styles.directionList}>
              {directions.map(direction => (
                <article key={direction.number} className={styles.direction}>
                  <div className={styles.directionHeading}>
                    <span className={styles.directionNumber}>{direction.number}</span>
                    <h3>{direction.title}</h3>
                    <span className={`${styles.stage} ${styles[direction.stage]}`}>
                      {stageLabels[direction.stage]}
                    </span>
                  </div>
                  <p>{direction.summary}</p>
                  <ul>
                    {direction.ideas.map(idea => (
                      <li key={idea}>{idea}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id='runtime'
          className={`${styles.chapter} ${activeId === 'runtime' ? styles.active : ''}`}
          aria-hidden={presenting && activeId !== 'runtime'}
        >
          <div className={styles.chapterInner}>
            <p className={styles.kicker}>Distributed execution</p>
            <h2>Infrastructure carries the work. Ontahí preserves the meaning.</h2>
            <div className={styles.runtimePath}>
              {runtimeSteps.map(([title, detail], index) => (
                <div className={styles.runtimeStep} key={title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </div>
              ))}
            </div>
            <p className={styles.conclusion}>
              Runtime implementations may differ. Canonical requests, authority, and lifecycle
              remain visible across the boundary.
            </p>
          </div>
        </section>

        <section
          id='interaction'
          className={`${styles.chapter} ${styles.interactionChapter} ${activeId === 'interaction' ? styles.active : ''}`}
          aria-hidden={presenting && activeId !== 'interaction'}
        >
          <div className={styles.chapterInner}>
            <p className={styles.kicker}>Durable & interactive operations</p>
            <h2>A computation can pause without losing itself</h2>
            <div className={styles.timeline}>
              <div>
                <span>01</span>
                <strong>Invoke</strong>
              </div>
              <div>
                <span>02</span>
                <strong>Progress</strong>
              </div>
              <div className={styles.timelineFocus}>
                <span>03</span>
                <strong>Ask</strong>
                <small>choice · approval</small>
              </div>
              <div>
                <span>04</span>
                <strong>Resume</strong>
              </div>
              <div>
                <span>05</span>
                <strong>Complete</strong>
              </div>
            </div>
            <p className={styles.conclusion}>
              Interaction belongs to the Operation contract, independent from chat, CLI, Devtools,
              or a particular workflow engine.
            </p>
          </div>
        </section>

        <section
          id='models'
          className={`${styles.chapter} ${styles.darkChapter} ${activeId === 'models' ? styles.active : ''}`}
          aria-hidden={presenting && activeId !== 'models'}
        >
          <div className={styles.chapterInner}>
            <p className={styles.kicker}>Native model support</p>
            <h2>Models can occupy two precise roles</h2>
            <div className={styles.modelRoles}>
              {modelRoles.map((role, index) => (
                <article key={role.label}>
                  <span>
                    {String(index + 1).padStart(2, '0')} · {role.label}
                  </span>
                  <h3>{role.title}</h3>
                  <p>{role.body}</p>
                </article>
              ))}
            </div>
            <p className={styles.conclusion}>
              Provider messages never become a parallel operation language.
            </p>
          </div>
        </section>

        <section
          id='trust'
          className={`${styles.chapter} ${activeId === 'trust' ? styles.active : ''}`}
          aria-hidden={presenting && activeId !== 'trust'}
        >
          <div className={styles.chapterInner}>
            <p className={styles.kicker}>Trust & evolution</p>
            <h2>Meaning must remain safe as the system changes</h2>
            <div className={styles.trustGrid}>
              <article>
                <span>Authority</span>
                <strong>Who may do what?</strong>
                <p>Policies stay attached to semantic actions and data scope.</p>
              </article>
              <article>
                <span>Continuity</span>
                <strong>What happens twice?</strong>
                <p>Identity and idempotency make durable work reliable.</p>
              </article>
              <article>
                <span>Evolution</span>
                <strong>What changed?</strong>
                <p>Models, storage, and runtimes need explicit migration paths.</p>
              </article>
              <article>
                <span>Conformance</span>
                <strong>Can runtimes agree?</strong>
                <p>Capabilities and protocol versions need testable contracts.</p>
              </article>
            </div>
          </div>
        </section>

        <section
          id='kernel'
          className={`${styles.chapter} ${styles.kernelChapter} ${activeId === 'kernel' ? styles.active : ''}`}
          aria-hidden={presenting && activeId !== 'kernel'}
        >
          <div className={styles.chapterInner}>
            <p className={styles.kicker}>Research horizon</p>
            <h2>The Semantic Program Kernel</h2>
            <div className={styles.kernelDiagram}>
              <div className={styles.kernelCore}>
                <span>Ontahí</span>
                <strong>typed semantic program</strong>
              </div>
              <div className={styles.kernelOrbit}>
                <span>partially bind</span>
                <span>delegate</span>
                <span>suspend</span>
                <span>observe</span>
                <span>resume</span>
              </div>
            </div>
            <p className={styles.conclusion}>
              A computation may be incomplete, travel to the runtime that owns a capability, wait
              for a participant, and continue as a live value.
            </p>
          </div>
        </section>

        <section
          id='community'
          className={`${styles.chapter} ${styles.communityChapter} ${activeId === 'community' ? styles.active : ''}`}
          aria-hidden={presenting && activeId !== 'community'}
        >
          <div className={styles.chapterInner}>
            <p className={styles.kicker}>An open field of work</p>
            <h2>Build a runtime, a surface, a language, or a proof</h2>
            <div className={styles.communityLinks}>
              <a href='https://github.com/javifernandes/ontahi'>Explore the repository</a>
              <a href='/'>Return to Ontahí</a>
            </div>
            <p className={styles.finalLine}>
              Ontahí provides the grammar. A community can discover what it makes possible.
            </p>
          </div>
        </section>
      </main>

      {presenting ? (
        <nav className={styles.presentationNav} aria-label='Presentation navigation'>
          <button
            type='button'
            onClick={() => changeChapter(activeChapter - 1)}
            disabled={activeChapter === 0}
            aria-label='Previous chapter'
          >
            ←
          </button>
          <span>{progress}</span>
          <button
            type='button'
            onClick={() => changeChapter(activeChapter + 1)}
            disabled={activeChapter === chapterCount - 1}
            aria-label='Next chapter'
          >
            →
          </button>
        </nav>
      ) : null}
    </div>
  );
};
