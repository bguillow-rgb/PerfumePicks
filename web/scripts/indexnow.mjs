// IndexNow ping. Submits this site's URLs to Bing/Yandex/Naver/Seznam (Google
// does NOT use IndexNow). The key file at public/<KEY>.txt must be live first.
//
// Usage (after the new build is deployed/live):  node scripts/indexnow.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const KEY = '6459c4aceebc6ca8fcb832a1df09ad12';
const HOST = 'perfumepicks.app';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sitemap = readFileSync(resolve(__dirname, '../dist/sitemap-0.xml'), 'utf8');
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

if (!urlList.length) {
  console.error('IndexNow: no URLs found in dist/sitemap-0.xml — run a build first.');
  process.exit(1);
}

const body = {
  host: HOST,
  key: KEY,
  keyLocation: `https://${HOST}/${KEY}.txt`,
  urlList,
};

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

console.log(`IndexNow ${HOST}: HTTP ${res.status} ${res.statusText} — submitted ${urlList.length} URLs`);
if (res.status !== 200 && res.status !== 202) {
  console.error('IndexNow: non-success status. Check the key file is live at', body.keyLocation);
  process.exit(1);
}
