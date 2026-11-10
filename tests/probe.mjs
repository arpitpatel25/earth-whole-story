// Runs a snippet inside the built site and prints what it returns: a quick way to ask the running app a question.
// Usage: VIEW=phone QUERY='?capture=1' node tests/probe.mjs "return window.__earth.pins.visible.length"
import { startServer, launch, openPage } from './lib/browser.mjs';
const srv = await startServer();
const browser = await launch();
const { page, errors } = await openPage(browser, srv.base, { query: process.env.QUERY || '?capture=1', view: process.env.VIEW || 'laptop' });
await page.waitForFunction(() => window.__earth && window.__earth.featuresLoaded, null, { timeout: 60000 });
const code = process.argv[2];
const out = await page.evaluate(new Function(`return (async () => { ${code} })()`));
console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
if (errors.length) console.log('ERRORS', [...new Set(errors)].slice(0, 5).join('\n'));
await browser.close();
await srv.close();
