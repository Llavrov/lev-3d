// Свести ветки волны wave/<имя>: новые файлы упражнений и помощников берём как есть, index.js собираем из своего
// и добавленных в ветках импортов и имён. node tools/wave-merge.mjs legs core … (ветки правят только новые файлы и index.js).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const sh = (c) => execSync(c, { encoding: 'utf8' });
const IX = 'src/trainer/ex/index.js';
const list = (s) => s.match(/export default \[([^\]]*)\]/)[1].split(',').map((x) => x.trim()).filter(Boolean);
let ix = readFileSync(IX, 'utf8');
for (const b of process.argv.slice(2)) {
  const diff = sh(`git diff --name-status main...wave/${b}`).trim().split('\n').map((l) => l.split('\t'));
  const odd = diff.filter(([st, f]) => !(st === 'A' || (st === 'M' && f === IX)));
  if (odd.length) throw new Error(`${b}: правки вне новых файлов: ${JSON.stringify(odd)}`);
  const files = diff.filter(([st]) => st === 'A').map(([, f]) => f);
  sh(`git checkout wave/${b} -- ${files.join(' ')}`);
  const theirs = sh(`git show wave/${b}:${IX}`), base = sh(`git show main:${IX}`);
  const have = new Set(ix.split('\n')), imports = theirs.split('\n').filter((l) => l.startsWith('import ') && !base.includes(l) && !have.has(l));
  const names = list(theirs).filter((n) => !list(base).includes(n) && !list(ix).includes(n));
  ix = ix.replace(/\nexport default \[([^\]]*)\];/, (m, cur) => `// Волна 23.11.2026, группа ${b}.\n${imports.join('\n')}\n\nexport default [${cur}, ${names.join(', ')}];`);
  console.log(`${b}: файлов ${files.length}, упражнений ${names.length}`);
}
writeFileSync(IX, ix);
console.log('всего в списке:', list(ix).length);
