import fs from 'fs';
import path from 'path';

function getImports(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const imports = [];
  const regex = /(?:import|export)\s+(?:.*?from\s+)?['"](\.[^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(code)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function resolveImport(sourceFile, importPath) {
  const dir = path.dirname(sourceFile);
  const full = path.resolve(dir, importPath);
  const candidates = [full, full + '.ts', full + '.tsx', full + '.js', path.join(full, 'index.ts'), path.join(full, 'index.tsx')];
  for (const c of candidates) {
    if (fs.existsSync(c) && !fs.statSync(c).isDirectory()) return c;
  }
  return null;
}

function walk(dir) {
  let files = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) files = files.concat(walk(p));
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) files.push(p);
  }
  return files;
}

const allFiles = walk(path.resolve('src'));
const graph = new Map();
for (const f of allFiles) {
  const imps = getImports(f).map(i => resolveImport(f, i)).filter(Boolean);
  graph.set(f, imps);
}

const visited = new Set();
const stack = [];
const cycles = [];

function dfs(node) {
  visited.add(node);
  stack.push(node);
  const neighbors = graph.get(node) || [];
  for (const n of neighbors) {
    const idx = stack.indexOf(n);
    if (idx !== -1) {
      cycles.push(stack.slice(idx).concat(n).map(p => path.relative(process.cwd(), p)));
    } else if (!visited.has(n)) {
      dfs(n);
    }
  }
  stack.pop();
}

for (const f of allFiles) {
  if (!visited.has(f)) dfs(f);
}

if (cycles.length === 0) {
  console.log('PASS: No circular dependencies found across src/');
} else {
  console.log(`Found ${cycles.length} circular dependency chains:`);
  cycles.slice(0, 10).forEach(c => console.log('  Cycle: ' + c.join(' -> ')));
}
