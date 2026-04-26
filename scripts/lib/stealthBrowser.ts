/**
 * Stealth puppeteer wrapper.
 *
 * Brand sites (Tom Ford, Le Labo, Byredo, Kilian, etc.) use Cloudflare /
 * DataDome / similar bot protection. Vanilla puppeteer's headless Chrome
 * announces itself with `navigator.webdriver === true` and other tells —
 * those sites then either return a 403, an empty shell, or a JS challenge.
 *
 * puppeteer-extra-plugin-stealth patches a couple dozen of the common
 * detection vectors (navigator.webdriver, missing chrome runtime, plugin
 * lengths, language headers, etc.) which gets us past most consumer-grade
 * bot blockers without rotating proxies.
 */

import puppeteerExtra from 'puppeteer-extra';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
import type { Browser, Page } from 'puppeteer';

let pluginRegistered = false;
function ensureStealth() {
  if (pluginRegistered) return;
  puppeteerExtra.use(StealthPlugin());
  pluginRegistered = true;
}

export async function launchStealth(): Promise<Browser> {
  ensureStealth();
  // Headless 'new' mode + a few extra args that further reduce automation
  // fingerprints (e.g. disable the AutomationControlled feature flag).
  return puppeteerExtra.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
    ],
  }) as unknown as Browser;
}

/**
 * Navigate + give the page time to fully hydrate. Pure `networkidle2` isn't
 * enough on heavy SPAs — they often keep one long-poll connection open and
 * never go idle. Belt-and-suspenders: wait for a specific selector OR a
 * fixed grace period, whichever comes first.
 */
export async function gotoAndHydrate(
  page: Page,
  url: string,
  opts: { hydrationSelector?: string; graceMs?: number; timeout?: number } = {},
): Promise<void> {
  const { hydrationSelector, graceMs = 2500, timeout = 35_000 } = opts;
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
      '(KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  );
  await page.setViewport({ width: 1366, height: 900 });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  if (hydrationSelector) {
    try {
      await page.waitForSelector(hydrationSelector, { timeout: 12_000 });
    } catch {
      // fall through to grace period
    }
  }
  await new Promise((r) => setTimeout(r, graceMs));
  // Also nudge a scroll so any IntersectionObserver-lazy content paints.
  await page.evaluate(() => window.scrollBy(0, 800));
  await new Promise((r) => setTimeout(r, 500));
}
