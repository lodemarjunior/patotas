import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createUser, anonClient } from '../helpers/supabase-local.js';
import { createRepo } from '../../src/repo.js';

let a, b, repoA;
const M1 = '2026-09', M2 = '2026-10';
const ok = ({ data, error }) => { assert.equal(error, null, error?.message); return data; };

before(async () => {
  a = await createUser('tesoureiro-a');
  b = await createUser('tesoureiro-b');
  repoA = createRepo(a.client);
});

const newMember = (repo, month, name, extra = {}) => repo.createMember(month, { name, exempt: false, due: { amount: 50, paidAt: null }, fines: [], ...extra });

test('RLS: anônimo não lê nem grava nada', async () => {
  const anon = anonClient();
  const r = await anon.from('members').select('id');
  assert.ok(r.error || r.data.length === 0);
  const w = await anon.from('members').insert({ month: M1, name: 'X' });
  assert.ok(w.error);
});

test('RLS: tesoureiro B não vê, edita ou apaga dados do A', async () => {
  const id = await newMember(repoA, M1, 'Privado A');
  const due = ok(await a.client.from('dues').select('id').eq('member_id', id).single());
  assert.ok(due.id);
  assert.equal(ok(await b.client.from('members').select('id').eq('id', id)).length, 0);
  assert.equal(ok(await b.client.from('dues').select('id').eq('member_id', id)).length, 0);
  ok(await b.client.from('members').update({ name: 'Hackeado' }).eq('id', id));
  ok(await b.client.from('members').delete().eq('id', id));
  const still = ok(await a.client.from('members').select('name').eq('id', id).single());
  assert.equal(still.name, 'Privado A');
});

test('RLS: B não consegue anexar mensalidade/multa a membro do A nem forjar user_id', async () => {
  const id = await newMember(repoA, M1, 'Alvo');
  const d = await b.client.from('dues').insert({ member_id: id, amount: 10 });
  assert.ok(d.error, 'due em membro alheio deve falhar');
  const f = await b.client.from('fines').insert({ member_id: id, quantity: 1, unit_amount: 5 });
  assert.ok(f.error, 'multa em membro alheio deve falhar');
  const forged = await b.client.from('members').insert({ user_id: a.id, month: M1, name: 'Forjado' });
  assert.ok(forged.error, 'user_id forjado deve falhar');
});

test('RLS: configurações são por usuário', async () => {
  await repoA.saveMonthSettings({ month: M1, monthly: 77, fineValue: 7, usesFines: false });
  const repoB = createRepo(b.client);
  const sb = await repoB.loadSettings();
  assert.equal(sb.monthly, 0);
  const mb = await repoB.loadMonthSettings(M1, sb);
  assert.equal(mb.monthly, 0);
  assert.equal(mb.usesFines, true);
});

test('constraints: valores e formatos inválidos são rejeitados no banco', async () => {
  const id = await newMember(repoA, '2026-01', 'Regras');
  assert.ok((await a.client.from('dues').update({ amount: 0 }).eq('member_id', id)).error);
  assert.ok((await a.client.from('fines').insert({ member_id: id, quantity: 0, unit_amount: 5 })).error);
  assert.ok((await a.client.from('fines').insert({ member_id: id, quantity: 1, unit_amount: 0 })).error);
  assert.ok((await a.client.from('fines').insert({ member_id: id, quantity: 1001, unit_amount: 5 })).error);
  assert.ok((await a.client.from('members').insert({ month: '2026-13', name: 'Mês ruim' })).error);
  assert.ok((await a.client.from('members').insert({ month: '2026-01', name: '   ' })).error);
});

test('isenção: marcar apaga a mensalidade; isento não recebe nova; multas independem', async () => {
  const id = await newMember(repoA, '2026-02', 'Isento', { fines: [{ quantity: 1, unitAmount: 10, reason: '', occurredAt: '2026-02-03', paidAt: null }] });
  await repoA.setExempt(id, true);
  const m = (await repoA.loadMonth('2026-02', { monthly: 0, fineValue: 0, usesFines: true })).members.find(x => x.id === id);
  assert.equal(m.exempt, true);
  assert.equal(m.due, null);
  assert.equal(m.fines.length, 1);
  await assert.rejects(() => repoA.saveDue(id, { amount: 50, paidAt: null }), /isento/i);
  await repoA.setExempt(id, false);
  await repoA.saveDue(id, { amount: 50, paidAt: '2026-02-10' });
  const again = (await repoA.loadMonth('2026-02', { monthly: 0, fineValue: 0, usesFines: true })).members.find(x => x.id === id);
  assert.equal(again.due.paidAt, '2026-02-10');
});

test('mensalidade: antecipação e atraso aceitos; excluir não recria', async () => {
  const id = await newMember(repoA, '2026-03', 'Datas');
  await repoA.saveDue(id, { amount: 50, paidAt: '2026-02-20' });
  await repoA.saveDue(id, { amount: 50, paidAt: '2026-05-02' });
  await repoA.deleteDue(id);
  const defaults = { monthly: 0, fineValue: 0, usesFines: true };
  await repoA.loadMonth('2026-03', defaults);
  const m = (await repoA.loadMonth('2026-03', defaults)).members.find(x => x.id === id);
  assert.equal(m.due, null);
});

test('multas: várias por membro, editar, excluir, tolera data de aplicação ausente (legado)', async () => {
  const id = await newMember(repoA, '2026-04', 'Multado');
  const f = { quantity: 2, unitAmount: 10, reason: 'Atraso', occurredAt: '2026-04-03', paidAt: null };
  await repoA.addFine(id, f);
  await repoA.addFine(id, { ...f, quantity: 1, paidAt: '2026-04-09' });
  const legacy = ok(await a.client.from('fines').insert({ member_id: id, quantity: 1, unit_amount: 5, occurred_at: null }).select('id').single());
  const defaults = { monthly: 0, fineValue: 0, usesFines: true };
  let m = (await repoA.loadMonth('2026-04', defaults)).members.find(x => x.id === id);
  assert.equal(m.fines.length, 3);
  assert.equal(m.fines[2].occurredAt, null);
  await repoA.updateFine(m.fines[0].id, { ...f, quantity: 3, paidAt: '2026-04-20' });
  await repoA.deleteFine(legacy.id);
  m = (await repoA.loadMonth('2026-04', defaults)).members.find(x => x.id === id);
  assert.equal(m.fines.length, 2);
  assert.equal(m.fines[0].quantity, 3);
  assert.equal(m.fines[0].paidAt, '2026-04-20');
});

test('competências independentes: criar, apagar e copiar em um mês não altera outro', async () => {
  const defaults = { monthly: 0, fineValue: 0, usesFines: true };
  const ana = await newMember(repoA, M2, 'Ana', { fines: [{ quantity: 1, unitAmount: 10, reason: 'x', occurredAt: '2026-10-02', paidAt: null }] });
  await newMember(repoA, M2, 'Bia', { exempt: true, due: null });
  const month = async m => (await repoA.loadMonth(m, defaults)).members;

  const sources = await repoA.listSourceMonths('2026-11');
  assert.ok(sources.some(s => s.month === M2 && s.count === 2));
  assert.deepEqual(await repoA.listMemberNames(M2), ['Ana', 'Bia']);

  const n = await repoA.copyMembers(M2, '2026-11');
  assert.equal(n, 2);
  const copied = await month('2026-11');
  assert.deepEqual(copied.map(x => x.name), ['Ana', 'Bia']);
  assert.ok(copied.every(x => !x.due && x.fines.length === 0 && !x.exempt), 'cópia traz só nomes');
  assert.equal((await month(M2)).length, 2, 'origem intacta');

  await assert.rejects(() => repoA.copyMembers(M2, '2026-11'), /já possui membros/);
  await assert.rejects(() => repoA.copyMembers('2030-01', '2030-02'), /origem inválido/);

  await repoA.deleteMember(copied[0].id);
  assert.equal((await month('2026-11')).length, 1);
  const orig = await month(M2);
  assert.equal(orig.length, 2);
  assert.equal(orig.find(x => x.id === ana).fines.length, 1, 'multas da origem preservadas');
});

test('create_member é atômico: multa inválida desfaz o membro inteiro', async () => {
  const before = (await repoA.listMemberNames('2026-06')).length;
  await assert.rejects(() => newMember(repoA, '2026-06', 'Atômico', { fines: [{ quantity: 0, unitAmount: 10, reason: '', occurredAt: '2026-06-01', paidAt: null }] }));
  assert.equal((await repoA.listMemberNames('2026-06')).length, before);
});

test('excluir membro apaga mensalidade e multas em cascata', async () => {
  const id = await newMember(repoA, '2026-07', 'Cascata', { fines: [{ quantity: 1, unitAmount: 10, reason: '', occurredAt: '2026-07-01', paidAt: null }] });
  await repoA.deleteMember(id);
  assert.equal(ok(await a.client.from('dues').select('id').eq('member_id', id)).length, 0);
  assert.equal(ok(await a.client.from('fines').select('id').eq('member_id', id)).length, 0);
});

test('configurações: padrões da conta aceitam 0, mês herda o último valor salvo, tema persiste', async () => {
  const c = await createUser('config');
  const repo = createRepo(c.client);
  const d0 = await repo.loadSettings();
  assert.deepEqual(d0, { monthly: 0, fineValue: 0, usesFines: true, theme: 'light' });
  await repo.saveMonthSettings({ month: '2026-10', monthly: 60, fineValue: 5, usesFines: false });
  const d1 = await repo.loadSettings();
  assert.equal(d1.monthly, 60);
  assert.equal((await repo.loadMonthSettings('2026-10', d1)).usesFines, false);
  assert.equal((await repo.loadMonthSettings('2027-01', d1)).monthly, 60);
  await repo.saveTheme('dark');
  assert.equal((await repo.loadSettings()).theme, 'dark');
});
