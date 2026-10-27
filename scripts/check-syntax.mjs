// Verifica a sintaxe de todos os arquivos JS do projeto (sem executar).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const skip = new Set(['node_modules', '.git', 'vendor', 'supabase', 'test-results', 'playwright-report']);
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (skip.has(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs|cjs)$/.test(e.name)) files.push(p); } })('.');
let bad = 0;
for (const f of files) { try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { bad++; console.error(f + '\n' + e.stderr); } }
console.log(files.length + ' arquivos verificados, ' + bad + ' com erro');
process.exit(bad ? 1 : 0);
