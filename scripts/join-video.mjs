// Joins media-src/<name>/part-*.bin into public/assets/videos/<name>.mp4 before every build.
// (Videos are stored in small parts so they can be pushed to GitHub over a slow connection.)
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('media-src');
const OUT_NAME = { 'features-video': 'ufuq-features-720.mp4' }; // folders whose video name differs from the folder name
if (!fs.existsSync(root)) process.exit(0);
for (const name of fs.readdirSync(root)) {
  const dir = path.join(root, name);
  if (!fs.statSync(dir).isDirectory()) continue;
  const parts = fs.readdirSync(dir).filter((f) => /^part-\d+\.bin$/.test(f)).sort();
  if (!parts.length) continue;
  const out = path.resolve('public/assets/videos', OUT_NAME[name] || name + '.mp4');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.concat(parts.map((f) => fs.readFileSync(path.join(dir, f)))));
  console.log(`join-video: ${parts.length} parts -> ${path.relative('.', out)}`);
}
