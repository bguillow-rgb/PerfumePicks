import { launchStealth, gotoAndHydrate } from './lib/stealthBrowser';
async function main() {
  const b = await launchStealth();
  const p = await b.newPage();
  await p.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15');
  await p.setViewport({ width: 1366, height: 900 });
  await gotoAndHydrate(p, 'https://www.fragrantica.com/designers/Carolina-Herrera.html', { graceMs: 4000 });
  const title = await p.title();
  const html = await p.content();
  const pdps = new Set(html.match(/\/perfume\/Carolina-Herrera\/[^"]+\.html/gi) || []).size;
  console.log(`Title: ${title} | PDPs: ${pdps} | Len: ${html.length}`);
  await b.close();
}
main().catch(e => console.error(e.message));
