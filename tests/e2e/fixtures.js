import { test as base, expect } from '@playwright/test';
import { localEnv, createUserRaw as createUser } from '../helpers/env.js';

// Data fixa: 15/10/2026 (competência atual = outubro/2026).
const NOW = new Date('2026-10-15T12:00:00');

export const test = base.extend({
  // Aponta o app para o Supabase local sem alterar config.js.
  page: async ({ page }, use) => {
    const env = localEnv();
    await page.route('**/config.js*', route => route.fulfill({
      contentType: 'text/javascript',
      body: `export const SUPABASE_URL=${JSON.stringify(env.url)};export const SUPABASE_ANON_KEY=${JSON.stringify(env.anon)};`,
    }));
    await page.clock.setFixedTime(NOW);
    page.on('dialog', d => d.accept());
    await use(page);
  },
  user: async ({}, use) => { await use(await createUser('e2e')); },
});

export async function login(page, user) {
  await page.goto('/');
  await page.fill('#authEmail', user.email);
  await page.fill('#authPassword', user.password);
  await page.click('#loginForm button[type=submit]');
  await expect(page.locator('#selectMonth')).toContainText('Outubro');
}

export { expect };
