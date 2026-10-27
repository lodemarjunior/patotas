import { test, expect } from './fixtures.js';

const MAIL = 'http://127.0.0.1:54324/api/v1';

// Busca o link do e-mail mais recente para o destinatário (Mailpit do Supabase local).
async function linkFor(email, subjectPart) {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAIL}/search?query=${encodeURIComponent('to:' + email)}`)).json();
    const msg = (list.messages || []).find(m => m.Subject.toLowerCase().includes(subjectPart));
    if (msg) {
      const full = await (await fetch(`${MAIL}/message/${msg.ID}`)).json();
      const m = (full.HTML || full.Text).match(/href="([^"]+)"/) || full.Text.match(/(https?:\/\/\S+)/);
      return m[1].replace(/&amp;/g, '&');
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('e-mail não chegou: ' + subjectPart);
}

test.describe('conta por e-mail e senha', () => {
  test('criar conta exige confirmação por e-mail antes de entrar', async ({ page }) => {
    const email = `novo-${Date.now()}@example.test`;
    const messages = [];
    page.on('dialog', d => messages.push(d.message()));
    await page.goto('/');
    await page.fill('#authEmail', email);
    await page.fill('#authPassword', 'curta');
    await page.click('[data-act="signup"]');
    await expect.poll(() => messages.join('|')).toMatch(/8 caracteres/);

    await page.fill('#authPassword', 'senha-segura-123');
    await page.click('[data-act="signup"]');
    await expect(page.locator('#authNote')).toContainText('link de confirmação');

    // Sem confirmar, o login é recusado
    await page.fill('#authEmail', email);
    await page.fill('#authPassword', 'senha-segura-123');
    await page.click('#loginForm button[type=submit]');
    await expect.poll(() => messages.join('|')).toMatch(/Confirme seu e-mail/);

    // Após confirmar pelo link, entra direto
    await page.goto(await linkFor(email, 'confirm'));
    await expect(page.locator('#selectMonth')).toContainText('Outubro');
    await expect(page.locator('[data-act="add"]')).toBeVisible();
  });

  test('recuperar senha: link abre tela de nova senha e o novo login funciona', async ({ page, user }) => {
    await page.goto('/');
    await page.fill('#authEmail', user.email);
    await page.click('[data-act="forgot"]');
    await expect(page.locator('#authNote')).toContainText('nova senha');

    await page.goto(await linkFor(user.email, 'reset'));
    await expect(page.locator('#recoveryForm')).toBeVisible();
    await page.fill('#newPassword', 'nova-senha-456');
    await page.click('#recoveryForm button[type=submit]');
    await expect(page.locator('#selectMonth')).toContainText('Outubro');

    await page.click('#logout');
    await page.fill('#authEmail', user.email);
    await page.fill('#authPassword', 'nova-senha-456');
    await page.click('#loginForm button[type=submit]');
    await expect(page.locator('#selectMonth')).toContainText('Outubro');
  });
});
