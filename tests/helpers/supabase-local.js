// Utilitários para testes contra o Supabase local (`npm run supabase:start`).
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

export { localEnv } from './env.js';
import { localEnv } from './env.js';

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const anonClient = () => createClient(localEnv().url, localEnv().anon, opts);
export const adminClient = () => createClient(localEnv().url, localEnv().service, opts);

// Cria um usuário já confirmado e devolve um cliente autenticado como ele.
export async function createUser(label = 'user') {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = 'senha-de-teste-123';
  const { data, error } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = anonClient();
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, email, password, client };
}
