import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../out/', import.meta.url));
const site = new URL('https://kabukura-rpg.github.io/Roguelite/');
const checked = new Set();

async function checkReference(reference, sourceUrl) {
  if (!reference || reference.startsWith('#') || reference.startsWith('data:')) return;
  const url = new URL(reference.replaceAll('&amp;', '&'), sourceUrl);
  if (url.origin !== site.origin) return;
  assert.ok(url.pathname.startsWith(site.pathname), `Asset escapes /Roguelite/: ${url}`);
  const relative = decodeURIComponent(url.pathname.slice(site.pathname.length));
  const filename = path.resolve(output, relative || 'index.html');
  assert.ok(filename.startsWith(output), `Invalid export path: ${url}`);
  const info = await stat(filename).catch(() => null);
  assert.ok(info, `Missing exported asset: ${url}`);
  if (info.isDirectory()) await stat(path.join(filename, 'index.html'));
  checked.add(url.pathname);
}

async function inspectDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspectDirectory(filename);
      continue;
    }
    const relative = path.relative(output, filename).split(path.sep).join('/');
    const sourceUrl = new URL(relative, site);
    if (filename.endsWith('.html')) {
      const html = await readFile(filename, 'utf8');
      for (const tag of html.matchAll(/<(?:script|link|img|source)\b[^>]*>/gi)) {
        for (const attr of tag[0].matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
          await checkReference(attr[1], sourceUrl);
        }
      }
    } else if (filename.endsWith('.css')) {
      const css = await readFile(filename, 'utf8');
      for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) {
        await checkReference(match[1], sourceUrl);
      }
    }
  }
}

// Reject a stale out/ left by an older build if Next exported somewhere else.
const exportDetail = JSON.parse(await readFile(new URL('../.next/export-detail.json', import.meta.url), 'utf8'));
assert.equal(exportDetail.success, true, 'Next.js static export did not finish successfully.');
assert.equal(path.resolve(exportDetail.outDirectory), path.resolve(output),
  `Next.js exported to ${exportDetail.outDirectory}; Pages requires ${output}`);
const homepage = await readFile(path.join(output, 'index.html'), 'utf8');
assert.ok(homepage.includes('株クラ'), 'The game homepage was not exported.');
await stat(path.join(output, '404.html'));
await stat(path.join(output, '.nojekyll'));
await inspectDirectory(output);
assert.ok([...checked].some((url) => url.endsWith('.css')), 'No stylesheet found.');
assert.ok([...checked].some((url) => url.endsWith('.js')), 'No JavaScript found.');
assert.ok(checked.has('/Roguelite/favicon.svg'), 'Favicon must include basePath.');
console.log(`Pages export verified: ${checked.size} asset paths under ${site.pathname}`);
