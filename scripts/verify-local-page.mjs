import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:3003';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outputDir = path.join(process.cwd(), 'apps/www/.verification');
const viewports = [
  { name: 'desktop', width: 1440, height: 1100 },
  { name: 'mobile', width: 390, height: 900 },
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
});

const consoleMessages = [];
const failedResponses = [];
const screenshots = [];
let title = '';
let bodyText = '';
let overlayCount = 0;
let hasEssayLink = false;
let hasRepoLink = false;

for (const viewport of viewports) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });

  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push({ viewport: viewport.name, type: message.type(), text: message.text() });
    }
  });

  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedResponses.push({
        viewport: viewport.name,
        status: response.status(),
        url: response.url(),
      });
    }
  });

  await page.goto(url, { waitUntil: 'networkidle' });

  title = await page.title();
  bodyText = await page.locator('body').innerText();
  overlayCount += await page
    .locator('[data-nextjs-dialog], .nextjs-container-errors, #webpack-dev-server-client-overlay')
    .count();
  hasEssayLink ||= (await page.locator('a[href*="why-systems-evolve"]').count()) > 0;
  hasRepoLink ||=
    (await page.locator('a[href="https://github.com/javifernandes/ontahi"]').count()) > 0;

  const screenshotPath = path.join(outputDir, `ontahi-home-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  screenshots.push(screenshotPath);
  await page.close();
}
await browser.close();

const result = {
  url,
  title,
  hasOntahi: bodyText.includes('Ontahí'),
  hasComingSoon: bodyText.toLowerCase().includes('coming soon'),
  hasExecutableDomains: bodyText.includes(
    'Executable domains, from applications to living experiences.',
  ),
  hasDomainLayer: bodyText.includes('Entities, relations, operations, policies, and events'),
  hasOptionalAutonomy: bodyText.includes('Autonomy is a layer, not the entry fee.'),
  hasEssayLink,
  hasRepoLink,
  overlayCount,
  consoleMessages,
  failedResponses,
  screenshots,
};

console.log(JSON.stringify(result, null, 2));

if (
  !result.hasOntahi ||
  !result.hasComingSoon ||
  !result.hasExecutableDomains ||
  !result.hasDomainLayer ||
  !result.hasOptionalAutonomy ||
  !result.hasEssayLink ||
  !result.hasRepoLink ||
  overlayCount > 0 ||
  failedResponses.length > 0
) {
  process.exitCode = 1;
}
