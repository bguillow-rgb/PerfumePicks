/**
 * probe-feed-dupes — READ-ONLY. Answers one question: how many DECLARED clones
 * are the retailer feeds carrying that our ETL currently throws away?
 *
 * Why this exists: scripts/etl-cj-sftp.ts does `if (isDupe(row.TITLE)) return null`,
 * and DUPE_PATTERNS includes 'inspired by', 'impression of', 'our version',
 * 'compare to', 'type for', 'our impression'. Those are exactly the phrases a
 * clone house uses to DECLARE what it clones, which is the same signal that made
 * the AromaPassions seed (305 pairs) possible. So the feed may already contain
 * the dupe pairs we now want, and we have been dropping them at ingest.
 *
 * Writes NOTHING: no DB, no files beyond a temp zip it cleans up. Prints counts
 * and samples so we can size the opportunity before changing any ETL.
 *
 * Usage: node scripts/probe-feed-dupes.mjs
 */

import { Client as SftpClient } from 'ssh2';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const CJ_SFTP_HOST = 'datatransfer.cj.com';
const CJ_SFTP_PORT = 22;
const CJ_SFTP_USER = '7966973';
const CJ_SFTP_PASSWORD = process.env.CJ_SFTP_PASSWORD;

const SSH_ALGORITHMS = {
  kex: [
    'diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1',
    'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group-exchange-sha1',
    'diffie-hellman-group1-sha1', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384',
    'ecdh-sha2-nistp521',
  ],
  serverHostKey: [
    'ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521', 'rsa-sha2-256', 'rsa-sha2-512',
  ],
};

// The phrases the ETL rejects. A title containing one of these is a product
// telling us, in its own words, which fragrance it clones.
const DECLARES_CLONE = [
  'impression of', 'our impression', 'inspired by', 'type for',
  'our version', 'compare to', 'version of',
];

const FEEDS = [
  { id: 'fragranceshop', dir: '/outgoing/productcatalog/317600' },
  // Perfumania subscription 318053 — commented out in the ETL pending CJ's
  // first export. Probe it too: if the zip exists now, that's another feed.
  { id: 'perfumania', dir: '/outgoing/productcatalog/318053' },
];

function withSftp(fn) {
  return new Promise((resolve, reject) => {
    const conn = new SftpClient();
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }
        fn(sftp, () => conn.end()).then(resolve, reject);
      });
    });
    conn.on('error', reject);
    conn.connect({
      host: CJ_SFTP_HOST, port: CJ_SFTP_PORT, username: CJ_SFTP_USER,
      password: CJ_SFTP_PASSWORD, algorithms: SSH_ALGORITHMS, readyTimeout: 30000,
    });
  });
}

async function probeFeed(feed, tmpDir) {
  const zipPath = path.join(tmpDir, `${feed.id}.zip`);
  const listed = await withSftp((sftp, done) => new Promise((res, rej) => {
    sftp.readdir(feed.dir, (e, list) => {
      if (e) { done(); return res(null); }
      const zip = list.find((f) => f.filename.endsWith('.zip'));
      if (!zip) { done(); return res(null); }
      sftp.fastGet(`${feed.dir}/${zip.filename}`, zipPath, (dlErr) => {
        done();
        if (dlErr) return rej(dlErr);
        res(zip.filename);
      });
    });
  }));
  if (!listed) { console.log(`\n### ${feed.id}: no zip in ${feed.dir} (feed not live)`); return; }

  const outDir = path.join(tmpDir, feed.id);
  fs.mkdirSync(outDir, { recursive: true });
  execSync(`unzip -o -q "${zipPath}" -d "${outDir}"`);
  const dataFile = fs.readdirSync(outDir).find((f) => !f.startsWith('.'));
  const full = path.join(outDir, dataFile);

  const rl = readline.createInterface({ input: fs.createReadStream(full), crlfDelay: Infinity });
  let header = null, total = 0, declared = 0;
  let titleIdx = -1, brandIdx = -1, priceIdx = -1;
  const samples = [];
  const byBrand = {};

  for await (const line of rl) {
    const cols = line.split('\t');
    if (!header) {
      header = cols.map((c) => c.trim().toUpperCase());
      titleIdx = header.indexOf('TITLE') >= 0 ? header.indexOf('TITLE') : header.indexOf('NAME');
      brandIdx = header.indexOf('BRAND');
      priceIdx = header.indexOf('PRICE');
      continue;
    }
    total++;
    const title = (cols[titleIdx] || '').toLowerCase();
    if (DECLARES_CLONE.some((p) => title.includes(p))) {
      declared++;
      const b = cols[brandIdx] || '(no brand)';
      byBrand[b] = (byBrand[b] || 0) + 1;
      if (samples.length < 12) samples.push(`${cols[brandIdx] || '?'} | ${cols[titleIdx]} | $${cols[priceIdx] || '?'}`);
    }
  }

  console.log(`\n### ${feed.id}  (${listed})`);
  console.log(`  rows in feed              : ${total}`);
  console.log(`  DECLARED clones (rejected): ${declared}   ${declared ? '← currently dropped at ingest' : ''}`);
  if (declared) {
    console.log('  by brand:');
    Object.entries(byBrand).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .forEach(([b, n]) => console.log(`    ${String(b).padEnd(26)} ${n}`));
    console.log('  samples:');
    samples.forEach((s) => console.log(`    • ${s}`));
  }
}

(async () => {
  if (!CJ_SFTP_PASSWORD) { console.error('CJ_SFTP_PASSWORD missing'); process.exit(1); }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feedprobe-'));
  try {
    for (const f of FEEDS) {
      try { await probeFeed(f, tmpDir); }
      catch (e) { console.log(`\n### ${f.id}: probe failed — ${e.message}`); }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})();
