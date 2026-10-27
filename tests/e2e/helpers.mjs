// Gemeinsame Hilfen für die Browser-Tests. Nutzt das installierte Edge/Chrome (PW_CHANNEL), weil
// Playwrights eigene Browser hier nicht heruntergeladen werden können.
import { after, before } from 'node:test';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.mjs';

/** Startet pro Testdatei einen Server und einen Browser. */
export function useApp() {
  const state = { base: '', browser: null, server: null };

  before(async () => {
    const started = await startServer(0);
    state.server = started.server;
    state.base = `http://localhost:${started.port}/`;
    state.browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
  });

  after(async () => {
    await state.browser?.close();
    state.server?.close();
  });

  const newContext = (opts = {}) => state.browser.newContext({ viewport: { width: 1376, height: 1000 }, acceptDownloads: true, ...opts });

  /** Öffnet die App in einem frischen Browser-Kontext (leerer Speicher); die Übersicht bleibt stehen. */
  async function openApp({ context: existing, url } = {}) {
    const context = existing ?? (await newContext());
    const page = await context.newPage();
    const problems = [];
    const foreign = [];
    page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(String(e)));
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(state.base) && !u.startsWith('data:') && !u.startsWith('blob:')) foreign.push(u);
    });
    await page.goto(url ?? state.base);
    await page.waitForSelector('#lib-neu');
    return { context, page, problems, foreign };
  }

  /** Legt über „Neuer Zettel“ einen Zettel aus einem Szenario an und wartet auf den Editor. */
  async function neuerZettel(page, szenario = 'verkaeuferin') {
    await page.click('#lib-neu');
    await page.click(`#dlg-neu [data-szenario="${szenario}"]`);
    await page.waitForSelector('#slip-host .slip');
  }

  const gespeichert = (page) => page.evaluate(() => window.__lohnzettel.flush());

  return { get base() { return state.base; }, openApp, newContext, neuerZettel, gespeichert };
}
