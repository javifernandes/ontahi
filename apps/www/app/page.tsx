import Image from 'next/image';

const siteUrl = 'https://ontahi.org';
const repoUrl = 'https://github.com/javifernandes/ontahi';
const docsUrl = 'https://bookops.net/ontahi-for-devs';
const docsSourceUrl = `${repoUrl}/tree/main/docs/developers`;
const npmUrl = 'https://www.npmjs.com/search?q=%40ontahi%2F';
const licenseUrl = `${repoUrl}/blob/main/LICENSE`;

const primitives = [
  ['Entities & relations', 'Describe the things in your domain and how they connect.'],
  ['Selections & reads', 'Ask for domain-shaped data without coupling callers to storage.'],
  ['Commands & operations', 'Name intent and computation as capabilities of the model.'],
  [
    'Runtimes & interactions',
    'Execute the same model through APIs, UIs, CLIs, or durable workers.',
  ],
] as const;

const journey = [
  ['Declare', 'Define the domain once, in ordinary TypeScript.'],
  ['Reflect', 'Ontahí turns that declaration into an inspectable application model.'],
  ['Execute', 'A runtime interprets reads, commands, and operations through adapters.'],
  ['Adapt', 'Add another interface or runtime without redefining the domain.'],
] as const;

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareSourceCode',
  name: 'Ontahí',
  alternateName: 'Ontahi',
  description:
    'An open-source executable domain framework and runtime protocol for TypeScript applications.',
  url: siteUrl,
  codeRepository: repoUrl,
  license: licenseUrl,
  programmingLanguage: 'TypeScript',
  runtimePlatform: 'Node.js',
  sameAs: [repoUrl, docsUrl, 'https://www.npmjs.com/package/@ontahi/core'],
};

export default function HomePage() {
  return (
    <>
      <main>
        <section className='hero' aria-labelledby='hero-title'>
          <header className='site-header' aria-label='Ontahí'>
            <a className='brand-mark' href='/' aria-label='Ontahí home'>
              <Image src='/brand/ontahi-symbol.svg' width={34} height={34} alt='' priority />
              <span>Ontahí</span>
            </a>
            <nav className='site-nav' aria-label='Primary'>
              <a href={docsUrl}>Docs</a>
              <a href='/vision/'>Vision</a>
              <a href={repoUrl}>GitHub</a>
              <a href={npmUrl}>npm</a>
            </nav>
          </header>

          <div className='hero-grid'>
            <div className='hero-copy'>
              <p className='eyebrow'>Open source · Public alpha</p>
              <h1 id='hero-title'>Ontahí</h1>
              <p className='lede'>An executable domain framework and runtime protocol.</p>
              <p className='support'>
                Define entities, relationships, selections, commands, operations, and policies as
                one application model. Ontahí carries that model across storage, APIs, interfaces,
                and long-running work. Its current TypeScript implementation is published as the{' '}
                <code>@ontahi/*</code> packages.
              </p>
              <div className='hero-actions'>
                <a className='button-link' href={docsUrl}>
                  Start with the developer guide
                </a>
                <a className='button-link secondary' href={repoUrl}>
                  Explore the source
                </a>
              </div>
            </div>

            <aside className='experience-panel code-panel' aria-label='Ontahí entity example'>
              <div className='panel-topline'>
                <span>todo-item.ts</span>
                <span>TypeScript</span>
              </div>
              <pre className='code-sample'>
                <code>{`const TodoItem = entity({
  name: 'TodoItem',
  fields: {
    title: text(),
    completed: boolean(),
  },
  operations: {
    complete: operation({
      input: object({}),
    }),
  },
});`}</code>
              </pre>
              <p className='formula'>The model is the contract. Runtimes decide how it executes.</p>
            </aside>
          </div>
        </section>

        <section className='runtime-section' aria-labelledby='model-title'>
          <div className='section-inner runtime-inner'>
            <div className='section-copy'>
              <p className='eyebrow'>The application model</p>
              <h2 id='model-title'>Name the domain before choosing its surfaces.</h2>
              <p>
                Ontahí keeps meaning in the model and infrastructure behind runtime contracts. The
                same domain can serve a web app today, a CLI tomorrow, and durable or AI-mediated
                interactions when the application needs them.
              </p>
            </div>

            <div className='layer-stack' aria-label='Ontahí model primitives'>
              {primitives.map(([title, text], index) => (
                <article className='layer-row' key={title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className='journey-section' aria-labelledby='journey-title'>
          <div className='section-inner journey-inner'>
            <div className='section-copy'>
              <p className='eyebrow'>One model in motion</p>
              <h2 id='journey-title'>From declaration to execution.</h2>
              <p>
                Ontahí is not a code generator or another transport abstraction. It is a shared
                language between the domain and the runtimes that interpret it.
              </p>
            </div>
            <ol className='journey-list'>
              {journey.map(([title, text], index) => (
                <li key={title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className='docs-section' aria-labelledby='docs-title'>
          <div className='section-inner docs-inner'>
            <div className='docs-heading'>
              <p className='eyebrow'>Learn and build</p>
              <h2 id='docs-title'>Choose your way into Ontahí.</h2>
            </div>
            <div className='docs-grid'>
              <a href={docsUrl}>
                <span>01</span>
                <strong>Developer guide</strong>
                <p>A guided introduction with concepts, examples, and the current API.</p>
              </a>
              <a href={docsSourceUrl}>
                <span>02</span>
                <strong>Documentation source</strong>
                <p>Read, search, or improve the canonical Markdown documentation on GitHub.</p>
              </a>
              <a href={npmUrl}>
                <span>03</span>
                <strong>Published packages</strong>
                <p>
                  Inspect the public <code>@ontahi/*</code> modules and their versions on npm.
                </p>
              </a>
            </div>
          </div>
        </section>

        <section className='vision-section' aria-labelledby='vision-title'>
          <div className='section-inner vision-inner'>
            <div>
              <p className='eyebrow'>Where this can go</p>
              <h2 id='vision-title'>Explore the wider Ontahí vision.</h2>
              <p>
                See how authorization, interactive operations, native LLM support, portable
                runtimes, migrations, and a domain language fit around the core.
              </p>
            </div>
            <a className='button-link' href='/vision/'>
              Open the interactive vision map
            </a>
          </div>
        </section>
      </main>

      <footer className='site-footer'>
        <div className='footer-inner'>
          <p>© 2026 Javier Fernandes and Ontahí contributors.</p>
          <p>
            <a href={repoUrl}>GitHub</a> · <a href={docsUrl}>Documentation</a> ·{' '}
            <a href={licenseUrl}>Apache License 2.0</a>
          </p>
        </div>
      </footer>

      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </>
  );
}
