// Temporary investigation helper: locate the `.prepare` call site in node_modules.
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '.bin') continue;
      walk(f, out);
    } else if (/\.(mjs|js|cjs)$/.test(e.name)) {
      out.push(f);
    }
  }
  return out;
}

const files = walk(path.join(__dirname, '..', 'node_modules'));
let hits = 0;
for (const f of files) {
  let t;
  try {
    t = fs.readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  const i = t.indexOf('.prepare');
  if (i > -1 && hits < 12) {
    hits++;
    console.log('FILE ' + f);
    console.log(t.slice(Math.max(0, i - 350), i + 250).replace(/\n/g, ' '));
    console.log('---');
  }
}
console.log('scanned ' + files.length + ' files, hits: ' + hits);
