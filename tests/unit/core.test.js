import test from 'node:test';
import assert from 'node:assert/strict';
import { next, label, date, validISO, parseAmount, fmtAmount, status, validateDue, validateFine, validateMember, validateSettings, totals, duesText, fineTotal, esc } from '../../src/core.js';

test('next navega entre meses e vira o ano', () => {
  assert.equal(next('2026-10', 1), '2026-11');
  assert.equal(next('2026-12', 1), '2027-01');
  assert.equal(next('2026-01', -1), '2025-12');
});
test('label e date formatam em pt-BR', () => {
  assert.match(label('2026-10'), /outubro/i);
  assert.equal(date('2026-10-05'), '05/10/2026');
  assert.equal(date(null), '—');
});
test('validISO rejeita datas inválidas', () => {
  assert.equal(validISO('2026-02-30'), false);
  assert.equal(validISO('2026-10-05'), true);
  assert.equal(validISO(''), false);
});
test('parseAmount aceita vírgula/ponto e rejeita lixo', () => {
  assert.equal(parseAmount('50,5'), 50.5);
  assert.equal(parseAmount('50.25'), 50.25);
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('-1')));
  assert.equal(fmtAmount(50), '50,00');
});

test('status: pendente durante a competência, atrasado a partir do mês seguinte', () => {
  assert.equal(status(null, '2026-09', '2026-09-30'), 'Pendente');
  assert.equal(status(null, '2026-09', '2026-08-01'), 'Pendente');
  assert.equal(status(null, '2026-09', '2026-10-01'), 'Atrasado');
});
test('status: pago exibe adiantado, pago ou pago com atraso conforme a data real', () => {
  assert.equal(status('2026-08-31', '2026-09'), 'Adiantado');
  assert.equal(status('2026-09-21', '2026-09'), 'Pago');
  assert.equal(status('2026-10-01', '2026-09'), 'Pago com atraso');
});

test('mensalidade: valor > 0 obrigatório; data de pagamento opcional', () => {
  assert.throws(() => validateDue({ amount: '0' }), /maior que zero/);
  assert.throws(() => validateDue({ amount: '' }), /maior que zero/);
  assert.throws(() => validateDue({ amount: '50', paidAt: '2026-13-01' }), /inválida/);
  assert.deepEqual(validateDue({ amount: '50' }), { amount: 50, paidAt: null });
  assert.deepEqual(validateDue({ amount: '50', paidAt: '2026-10-05' }), { amount: 50, paidAt: '2026-10-05' });
});

test('multa: quantidade inteira positiva, valor > 0, data da multa obrigatória, pagamento opcional', () => {
  const ok = { quantity: '2', unit: '10', reason: 'Faltas', occurredAt: '2026-10-03' };
  assert.deepEqual(validateFine(ok), { quantity: 2, unitAmount: 10, reason: 'Faltas', occurredAt: '2026-10-03', paidAt: null });
  assert.throws(() => validateFine({ ...ok, quantity: '1.5' }), /maior que zero/);
  assert.throws(() => validateFine({ ...ok, quantity: '0' }), /maior que zero/);
  assert.throws(() => validateFine({ ...ok, unit: '0' }), /maior que zero/);
  assert.throws(() => validateFine({ ...ok, occurredAt: '' }), /data da multa/);
  assert.equal(validateFine({ ...ok, paidAt: '2026-10-09' }).paidAt, '2026-10-09');
  assert.equal(fineTotal({ quantity: 2, unitAmount: 10 }), 20);
});

test('configurações aceitam 0 como padrão mas rejeitam negativos e mês inválido', () => {
  assert.deepEqual(validateSettings({ month: '2026-10', monthly: '0', fineValue: '0', usesFines: 'on' }), { month: '2026-10', monthly: 0, fineValue: 0, usesFines: true });
  assert.throws(() => validateSettings({ month: '2026-13', monthly: '0', fineValue: '0' }), /Mês inválido/);
  assert.throws(() => validateSettings({ month: '2026-10', monthly: 'x', fineValue: '0' }), /valores válidos/);
});

test('membro novo: nome obrigatório; isento não exige mensalidade; multas validadas', () => {
  assert.throws(() => validateMember({ name: '  ' }), /nome/);
  assert.throws(() => validateMember({ name: 'Ana', dueAmount: '0' }), /maior que zero/);
  const exempt = validateMember({ name: ' Ana ', exempt: 'on', dueAmount: '0' });
  assert.equal(exempt.name, 'Ana');
  assert.equal(exempt.due, null);
  assert.throws(() => validateMember({ name: 'Ana', dueAmount: '50', fines: [{ quantity: '1', unit: '0', occurredAt: '2026-10-01' }] }), /multa/);
  assert.equal(validateMember({ name: 'Ana', dueAmount: '50' }).due.paidAt, null);
});

test('totais ignoram isentos e somam multas pendentes de forma independente', () => {
  const members = [
    { exempt: false, due: { amount: 50, paidAt: '2026-10-03' } },
    { exempt: false, due: { amount: 50, paidAt: null } },
    { exempt: true, due: null },
  ];
  const fines = [{ quantity: 2, unitAmount: 10, paidAt: null }, { quantity: 1, unitAmount: 10, paidAt: '2026-10-02' }];
  assert.deepEqual(totals(members, fines), { count: 2, paid: 1, pending: 50, fine: 20 });
});

test('texto de compartilhar: pago mostra data, vencido atrasado, isento e sem cadastro', () => {
  const list = [
    { name: 'Ana', exempt: false, due: { paidAt: '2026-09-05' } },
    { name: 'Bia', exempt: false, due: { paidAt: null } },
    { name: 'Caio', exempt: true, due: null },
    { name: 'Davi', exempt: false, due: null },
  ];
  assert.equal(duesText(list, '2026-09', '2026-10-02'), 'Mensalidades 09/2026\n\nAna - 05/09/2026\nBia - Atrasado\nCaio - Isento\nDavi - Não cadastrada');
  assert.match(duesText(list, '2026-09', '2026-09-20'), /Bia - Pendente/);
});

test('esc neutraliza HTML', () => {
  assert.equal(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
});
