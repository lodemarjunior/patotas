// Regras puras do Patotas (datas, status, validação, texto de compartilhamento). Sem DOM nem rede.
export const pad = n => String(n).padStart(2, '0');
export const money = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const next = (m, n) => { const [y, mo] = m.split('-').map(Number), d = new Date(y, mo - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
export const label = m => new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
export const date = d => d ? d.split('-').reverse().join('/') : '—';
export const validISO = d => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T12:00:00');
  return !Number.isNaN(t.getTime()) && todayLocal(t) === d; // rejeita 30/02 (JS normaliza para março)
};
export const validMonth = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export const todayLocal = (now = new Date()) => now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
export const fmtAmount = v => (Number(v) || 0).toFixed(2).replace('.', ',');
export function parseAmount(v) {
  const t = String(v ?? '').trim().replace(/\s/g, '');
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(t)) return NaN;
  return Number(t.replace(',', '.'));
}

// Mensalidade não paga: pendente até o fim da competência, atrasada a partir do mês seguinte.
export function status(paidAt, month, today = todayLocal()) {
  if (!paidAt) return today >= next(month, 1) + '-01' ? 'Atrasado' : 'Pendente';
  if (paidAt < month + '-01') return 'Adiantado';
  if (paidAt >= next(month, 1) + '-01') return 'Pago com atraso';
  return 'Pago';
}

export function validateDue({ amount, paidAt }) {
  const a = typeof amount === 'number' ? amount : parseAmount(amount);
  if (!Number.isFinite(a) || a <= 0) throw new Error('O valor da mensalidade deve ser maior que zero');
  if (paidAt && !validISO(paidAt)) throw new Error('Data do pagamento inválida');
  return { amount: a, paidAt: paidAt || null };
}

export function validateFine({ quantity, unit, reason, occurredAt, paidAt }) {
  const q = Number(quantity), u = typeof unit === 'number' ? unit : parseAmount(unit);
  if (!Number.isInteger(q) || q < 1 || q > 1000 || !Number.isFinite(u) || u <= 0) throw new Error('O valor da multa deve ser maior que zero');
  if (!validISO(occurredAt)) throw new Error('Informe a data da multa');
  if (paidAt && !validISO(paidAt)) throw new Error('Data do pagamento inválida');
  return { quantity: q, unitAmount: u, reason: String(reason || ''), occurredAt, paidAt: paidAt || null };
}

export function validateSettings({ month, monthly, fineValue, usesFines }) {
  if (!validMonth(month)) throw new Error('Mês inválido');
  const m = parseAmount(monthly), f = usesFines ? parseAmount(fineValue) : parseAmount(fineValue || '0');
  if (!Number.isFinite(m) || m < 0 || !Number.isFinite(f) || f < 0) throw new Error('Informe valores válidos, iguais ou maiores que zero');
  return { month, monthly: m, fineValue: f, usesFines: !!usesFines };
}

export function validateMember({ name, exempt, dueAmount, duePaidAt, fines }) {
  const n = String(name || '').trim();
  if (!n) throw new Error('Digite o nome');
  if (n.length > 80) throw new Error('Nome muito longo');
  const out = { name: n, exempt: !!exempt, due: null, fines: (fines || []).map(validateFine) };
  if (!out.exempt) {
    const a = parseAmount(dueAmount);
    if (!Number.isFinite(a) || a <= 0) throw new Error('Informe valor da mensalidade maior que zero');
    out.due = validateDue({ amount: a, paidAt: duePaidAt });
  }
  return out;
}

export const fineTotal = f => f.quantity * f.unitAmount;

export function totals(members, fines) {
  const ds = members.filter(x => !x.exempt && x.due).map(x => x.due);
  return {
    count: ds.length,
    paid: ds.filter(d => d.paidAt).length,
    pending: ds.filter(d => !d.paidAt).reduce((n, d) => n + d.amount, 0),
    fine: fines.filter(f => !f.paidAt).reduce((n, f) => n + fineTotal(f), 0),
  };
}

// Texto copiado para o WhatsApp. `members` já ordenados, cada um com { name, exempt, due }.
export function duesText(members, month, today = todayLocal()) {
  const items = members.map(x => x.name + ' - ' + (x.exempt ? 'Isento' : !x.due ? 'Não cadastrada' : x.due.paidAt ? date(x.due.paidAt) : (today >= next(month, 1) + '-01' ? 'Atrasado' : 'Pendente')));
  return 'Mensalidades ' + month.slice(5) + '/' + month.slice(0, 4) + '\n\n' + items.join('\n');
}
