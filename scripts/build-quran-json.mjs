// Builds public/quran/{1..114}.json from two Tanzil downloads (https://tanzil.net/download/):
//   node scripts/build-quran-json.mjs scripts/data/quran-simple.txt scripts/data/quran-simple-clean.txt public/quran
// Download both as "Text (with aya numbers)" -> lines look like  sura|aya|text . Turn OFF pause marks / sajda / hizb signs.
// Output per surah: { surah, ayahs: [ { n, words: [display...], clean: [matching...] } ] }
// Tanzil's text is licensed (verbatim copy, keep the attribution) — read the terms on tanzil.net before publishing it.
import fs from 'node:fs';
import path from 'node:path';

const [simpleFile, cleanFile, outDir = 'public/quran'] = process.argv.slice(2);
if (!simpleFile || !cleanFile) { console.error('usage: node build-quran-json.mjs <simple.txt> <simple-clean.txt> [outDir]'); process.exit(1); }

const hasLetter = /[\u0621-\u064A\u0671]/;
const words = (s) => s.split(/\s+/).filter((w) => w && hasLetter.test(w));
function parse(file) {
  const map = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(\d+)\|(\d+)\|(.*)$/);
    if (m) map.set(`${+m[1]}:${+m[2]}`, m[3].trim());
  }
  return map;
}
const simple = parse(simpleFile), clean = parse(cleanFile);
if (simple.size !== clean.size || simple.size === 0) { console.error(`ayah count differs or empty: ${simple.size} vs ${clean.size}`); process.exit(1); }

const bySurah = new Map();
let bad = 0;
for (const [key, text] of simple) {
  const [s, a] = key.split(':').map(Number);
  const d = words(text), c = words(clean.get(key) || '');
  if (d.length !== c.length) { console.error(`word count mismatch at ${key}: ${d.length} vs ${c.length}`); bad++; continue; }
  if (!bySurah.has(s)) bySurah.set(s, []);
  bySurah.get(s).push({ n: a, words: d, clean: c });
}
if (bad) { console.error(`${bad} ayahs mismatched — check that both files come from the same Tanzil options.`); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
for (const [s, ayahs] of bySurah) {
  ayahs.sort((x, y) => x.n - y.n);
  fs.writeFileSync(path.join(outDir, `${s}.json`), JSON.stringify({ surah: s, ayahs }));
}
console.log(`wrote ${bySurah.size} surah files to ${outDir}`);
