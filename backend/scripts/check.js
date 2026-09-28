const { execFileSync } = require('child_process');
const { readdirSync, statSync } = require('fs');
const { join, relative } = require('path');

const backendDir = join(__dirname, '..');

function collectJsFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return collectJsFiles(full);
    return full.endsWith('.js') ? [full] : [];
  });
}

const files = collectJsFiles(join(backendDir, 'src'));
const failures = [];

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failures.push({ file: relative(backendDir, file), output: error.stderr.toString().trim() });
  }
}

for (const failure of failures) {
  console.error(`FAIL ${failure.file}\n${failure.output}\n`);
}

if (failures.length > 0) {
  console.error(`${failures.length} of ${files.length} file(s) failed the syntax check.`);
  process.exit(1);
}

console.log(`check: ${files.length} backend source files OK`);
