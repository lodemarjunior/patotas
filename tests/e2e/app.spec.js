import { test, expect, login } from './fixtures.js';

const addMember = async (page, name, { amount = '50', paidAt = '', exempt = false } = {}) => {
  await page.click('[data-act="add"]');
  await page.fill('#memberForm [name="name"]', name);
  if (exempt) await page.check('#newExempt');
  else {
    await page.fill('#memberForm [name="dueAmount"]', amount);
    if (paidAt) await page.fill('#memberForm [name="duePaidAt"]', paidAt);
  }
  await page.click('#memberForm button[type=submit]');
  await expect(page.locator('#modalRoot .modal')).toHaveCount(0);
};
const open = (page, name) => page.locator('.list-row', { hasText: name }).first().click();
const month = (page, dir) => page.click(dir === 'prev' ? '#prevMonth' : '#nextMonth');

test('fumaça: sem sessão mostra o login, sem lista de membros e sem tela em branco', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loginForm')).toBeVisible();
  await expect(page.locator('.month-bar')).toBeHidden();
  await expect(page.locator('#startupError')).toHaveCount(0);
});

test('login inválido mostra erro; login válido abre a lista; sair volta ao login', async ({ page, user }) => {
  await page.goto('/');
  const messages = [];
  page.on('dialog', d => messages.push(d.message()));
  await page.fill('#authEmail', user.email);
  await page.fill('#authPassword', 'senha-errada-123');
  await page.click('#loginForm button[type=submit]');
  await expect.poll(() => messages.join('|')).toMatch(/incorretos/);
  await page.fill('#authPassword', user.password);
  await page.click('#loginForm button[type=submit]');
  await expect(page.locator('#selectMonth')).toContainText('Outubro');
  await expect(page.locator('[data-act="add"]')).toBeVisible();
  await page.click('#logout');
  await expect(page.locator('#loginForm')).toBeVisible();
});

test('nada de dados do app em localStorage; sessão sobrevive a recarregar', async ({ page, user }) => {
  await login(page, user);
  await addMember(page, 'Persistente');
  await page.reload();
  await expect(page.locator('.list-row', { hasText: 'Persistente' })).toBeVisible();
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.filter(k => !k.startsWith('sb-'))).toEqual([]);
});

test('fluxo completo: membro, mensalidade, multa, histórico e competências independentes', async ({ page, user }) => {
  await login(page, user);

  // Mês vazio oferece copiar só se houver origem; adiciona membros
  await expect(page.locator('[data-act="copy"]')).toBeVisible();
  await addMember(page, 'Carlos');
  await addMember(page, 'Ana', { paidAt: '2026-10-03' });
  await addMember(page, 'Isento Silva', { exempt: true });
  await expect(page.locator('[data-act="copy"]')).toHaveCount(0);
  await expect(page.locator('.list-row', { hasText: 'Ana' })).toContainText('Mensalidade paga em 03/10/2026');
  await expect(page.locator('.list-row', { hasText: 'Carlos' })).toContainText('Pendente');
  await expect(page.locator('.list-row', { hasText: 'Isento Silva' })).toContainText('Isento');

  // Mensalidade: valor > 0 obrigatório
  await open(page, 'Carlos');
  await page.click('[data-act^="due:"]');
  const msgs = [];
  page.on('dialog', d => msgs.push(d.message()));
  await page.fill('#dueForm [name="amount"]', '0');
  await page.click('#dueForm button[type=submit]');
  await expect.poll(() => msgs.join('|')).toMatch(/maior que zero/);
  await page.fill('#dueForm [name="amount"]', '60,50');
  await page.fill('#dueForm [name="paidAt"]', '2026-09-28'); // antecipado
  await page.click('#dueForm button[type=submit]');
  await open(page, 'Carlos');
  await expect(page.locator('.modal')).toContainText('R$');
  await expect(page.locator('.modal .pill').first()).toHaveText('Adiantado');

  // Multas: duas, independentes da mensalidade
  await page.click('[data-act^="addFine:"]');
  await page.fill('#addFineForm [name="quantity"]', '2');
  await page.fill('#addFineForm [name="unit"]', '10');
  await page.fill('#addFineForm [name="reason"]', 'Faltas');
  await page.click('#addFineForm button[type=submit]');
  await open(page, 'Carlos');
  await page.click('[data-act^="addFine:"]');
  await page.fill('#addFineForm [name="unit"]', '5');
  await page.fill('#addFineForm [name="paidAt"]', '2026-10-12');
  await page.click('#addFineForm button[type=submit]');
  await open(page, 'Carlos');
  await expect(page.locator('.modal [data-act^="fine:"]')).toHaveCount(2);
  await page.locator('.modal [data-act^="fine:"]').first().click();
  await page.fill('#fineForm [name="paidAt"]', '2026-10-14');
  await page.click('#fineForm button[type=submit]');
  await open(page, 'Carlos');
  await expect(page.locator('.modal [data-act^="fine:"]').first()).toContainText('Pago em 14/10/2026');
  await page.click('[data-act="close"]');

  // Isenção: cancelar não altera; confirmar remove a mensalidade
  await open(page, 'Ana');
  page.removeAllListeners('dialog');
  page.once('dialog', d => d.dismiss());
  await page.check('#freeDue').catch(() => {});
  await expect(page.locator('#freeDue')).not.toBeChecked();
  page.on('dialog', d => d.accept());
  await page.check('#freeDue');
  await expect(page.locator('.modal')).not.toContainText('Mensalidade');
  await page.click('[data-act="close"]');
  await expect(page.locator('.list-row', { hasText: 'Ana' })).toContainText('Isento');

  // Histórico: novembro vazio e independente; copiar traz só nomes
  await month(page, 'next');
  await expect(page.locator('#selectMonth')).toContainText('Novembro');
  await expect(page.locator('.list-row')).toHaveCount(0);
  await page.click('[data-act="copy"]');
  await expect(page.locator('#copyPreview')).toContainText('Carlos');
  await page.click('#copyForm button[type=submit]');
  await expect(page.locator('.list-row')).toHaveCount(3);
  await expect(page.locator('.list-row', { hasText: 'Carlos' })).toContainText('Sem mensalidade cadastrada');
  await expect(page.locator('.list-row', { hasText: 'Carlos' })).not.toContainText('multa');
  await expect(page.locator('.list-row', { hasText: 'Isento Silva' })).toContainText('Sem mensalidade cadastrada');

  // Apagar em novembro não afeta outubro
  await open(page, 'Carlos');
  await page.click('[data-act^="remove:"]');
  await expect(page.locator('.list-row')).toHaveCount(2);
  await month(page, 'prev');
  await expect(page.locator('.list-row')).toHaveCount(3);
  await open(page, 'Carlos');
  await expect(page.locator('.modal [data-act^="fine:"]')).toHaveCount(2);
});

test('mensalidade vencida: mês anterior mostra Atrasado; excluir lançamento não recria', async ({ page, user }) => {
  await login(page, user);
  await month(page, 'prev');
  await addMember(page, 'Devedor');
  await expect(page.locator('.list-row', { hasText: 'Devedor' })).toContainText('Atrasado');
  await open(page, 'Devedor');
  await page.click('[data-act^="due:"]');
  await page.click('[data-act^="deleteDue:"]');
  await page.reload();
  await month(page, 'prev');
  await expect(page.locator('.list-row', { hasText: 'Devedor' })).toContainText('Sem mensalidade cadastrada');
});

test('configurações: padrão aceita 0, "Usa multa" oculta controles sem apagar multas', async ({ page, user }) => {
  await login(page, user);
  await addMember(page, 'Mult');
  await open(page, 'Mult');
  await page.click('[data-act^="addFine:"]');
  await page.fill('#addFineForm [name="unit"]', '10');
  await page.click('#addFineForm button[type=submit]');
  await page.click('#selectMonth');
  await page.fill('#monthSettingsForm [name="monthly"]', '0');
  await page.uncheck('#usesFines');
  await page.click('#monthSettingsForm button[type=submit]');
  await open(page, 'Mult');
  await expect(page.locator('.modal [data-act^="addFine:"]')).toHaveCount(0);
  await page.click('[data-act="close"]');
  await page.click('#selectMonth');
  await page.check('#usesFines');
  await page.click('#monthSettingsForm button[type=submit]');
  await open(page, 'Mult');
  await expect(page.locator('.modal [data-act^="fine:"]')).toHaveCount(1);
});

test('compartilhar mensalidades: texto com datas, atrasados e isentos (fallback sem clipboard)', async ({ page, user }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
  await login(page, user);
  await month(page, 'prev');
  await addMember(page, 'Pago', { paidAt: '2026-09-05' });
  await addMember(page, 'Devendo');
  await addMember(page, 'Livre', { exempt: true });
  await page.click('[data-act="shareDues"]');
  const text = await page.locator('#shareText').inputValue();
  expect(text).toBe('Mensalidades 09/2026\n\nDevendo - Atrasado\nLivre - Isento\nPago - 05/09/2026');
});

test('isolamento: outro usuário não vê membros', async ({ page, user }) => {
  await login(page, user);
  await addMember(page, 'Segredo');
  await page.click('#logout');
  const { createUserRaw: createUser } = await import('../helpers/env.js');
  const other = await createUser('outro');
  await page.fill('#authEmail', other.email);
  await page.fill('#authPassword', other.password);
  await page.click('#loginForm button[type=submit]');
  await expect(page.locator('#selectMonth')).toContainText('Outubro');
  await expect(page.locator('.list-row')).toHaveCount(0);
});

test('responsividade: modal rola e campos de data cabem na tela', async ({ page, user }) => {
  await login(page, user);
  await page.click('[data-act="add"]');
  const vw = page.viewportSize().width;
  const box = await page.locator('#memberForm [name="duePaidAt"]').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
