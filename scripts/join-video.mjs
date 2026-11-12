// Joins media-src/features-video/part-*.bin into public/assets/videos/ufuq-features-720.mp4 before every build.
// (The video is stored in small parts so it can be pushed to GitHub over a slow connection.)
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve('media-src/features-video');
const out = path.resolve('public/assets/videos/ufuq-features-720.mp4');
if (!fs.existsSync(dir)) process.exit(0);
const parts = fs.readdirSync(dir).filter((f) => /^part-\d+\.bin$/.test(f)).sort();
if (!parts.length) process.exit(0);
const bufs = parts.map((f) => fs.readFileSync(path.join(dir, f)));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat(bufs));
console.log(`join-video: ${parts.length} parts -> ${path.relative('.', out)}`);
