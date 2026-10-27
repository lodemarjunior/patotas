import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const js = read('app.js'), css = read('styles.css'), html = read('index.html'), sw = read('sw.js');

test('campo de data de pagamento do novo membro é opcional', () => {
  assert.match(js, /name="duePaidAt" type="date"/);
  assert.doesNotMatch(js, /name="duePaidAt" type="date" required/);
});
test('feedback de copiar não troca o texto do botão', () => {
  assert.match(js, /class="share-check"/);
  assert.doesNotMatch(js, /button\.textContent\s*=\s*'✓ Lista copiada'/);
});
test('lista de membros rola e notificações aparecem no topo', () => {
  assert.match(css, /#memberRows\{max-height:/);
  assert.match(css, /#toast\{top:/);
  assert.match(css, /bottom:auto/);
});
test('dados não são gravados em localStorage pelo app', () => {
  for (const f of ['app.js', 'src/core.js', 'src/repo.js']) assert.doesNotMatch(read(f), /localStorage|sessionStorage/);
});
test('versões de index.html e service worker estão alinhadas', () => {
  const v = html.match(/app\.js\?v=(\d+)/)[1];
  assert.match(sw, new RegExp('patotas-pwa-v' + v));
  assert.match(html, new RegExp('styles\\.css\\?v=' + v));
  for (const a of ['./config.js', './src/core.js', './src/repo.js']) assert.ok(sw.includes(a), a + ' no cache do SW');
});
test('service worker ignora outras origens (Supabase)', () => {
  assert.match(sw, /origin !== self\.location\.origin\) return/);
});
test('config.js não contém service_role', () => {
  assert.doesNotMatch(read('config.js'), /service_role/i);
});
