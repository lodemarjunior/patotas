// Ambiente do Supabase local sem depender do supabase-js (usado também pelo Playwright).
import { execSync } from 'node:child_process';

let cached;
export function localEnv() {
  if (cached) return cached;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (cached = { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY, service: process.env.SUPABASE_SERVICE_ROLE_KEY });
  }
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const v = Object.fromEntries(out.split(/\r?\n/).map(l => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
  return (cached = { url: v.API_URL, anon: v.ANON_KEY, service: v.SERVICE_ROLE_KEY });
}

// Cria usuário confirmado via API admin do GoTrue (fetch puro).
export async function createUserRaw(label = 'user') {
  const { url, service } = localEnv();
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = 'senha-de-teste-123';
  const res = await fetch(url + '/auth/v1/admin/users', { method: 'POST', headers: { apikey: service, authorization: 'Bearer ' + service, 'content-type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true }) });
  if (!res.ok) throw new Error('createUser falhou: ' + await res.text());
  return { id: (await res.json()).id, email, password };
}
