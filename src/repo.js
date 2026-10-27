// Acesso a dados via Supabase. `client` é um cliente supabase-js já autenticado (RLS isola por usuário).
const must = ({ data, error }) => {
  if (error) throw new Error(error.message || 'Falha ao acessar os dados');
  return data;
};
const one = v => Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');
const toFine = r => ({ id: r.id, memberId: r.member_id, quantity: r.quantity, unitAmount: Number(r.unit_amount), reason: r.reason || '', occurredAt: r.occurred_at, paidAt: r.paid_at });
const fineRow = f => ({ quantity: f.quantity, unit_amount: f.unitAmount, reason: f.reason, occurred_at: f.occurredAt, paid_at: f.paidAt });

export function createRepo(client) {
  const db = t => client.from(t);
  return {
    async loadSettings() {
      let row = must(await db('settings').select('monthly,fine_value,uses_fines,theme').maybeSingle());
      if (!row) {
        must(await db('settings').upsert({}, { onConflict: 'user_id', ignoreDuplicates: true }));
        row = must(await db('settings').select('monthly,fine_value,uses_fines,theme').single());
      }
      return { monthly: Number(row.monthly), fineValue: Number(row.fine_value), usesFines: row.uses_fines, theme: row.theme };
    },
    async saveTheme(theme) {
      must(await db('settings').update({ theme }).not('user_id', 'is', null));
    },
    // Configuração efetiva do mês: a do mês, senão os padrões da conta.
    async loadMonthSettings(month, defaults) {
      const ms = must(await db('month_settings').select('monthly,fine_value,uses_fines').eq('month', month).maybeSingle());
      return ms ? { monthly: Number(ms.monthly), fineValue: Number(ms.fine_value), usesFines: ms.uses_fines } : { monthly: defaults.monthly, fineValue: defaults.fineValue, usesFines: defaults.usesFines };
    },
    async loadMonth(month, defaults) {
      const [settings, members] = await Promise.all([
        this.loadMonthSettings(month, defaults),
        db('members').select('id,name,exempt,dues(id,amount,paid_at),fines(id,member_id,quantity,unit_amount,reason,occurred_at,paid_at)').eq('month', month).then(must),
      ]);
      const list = members.map(m => {
        const d = one(m.dues);
        return { id: m.id, name: m.name, exempt: m.exempt, due: d ? { id: d.id, amount: Number(d.amount), paidAt: d.paid_at } : null, fines: (m.fines || []).map(toFine).sort((a, b) => a.id - b.id) };
      }).sort(byName);
      return { settings, members: list };
    },
    async saveMonthSettings({ month, monthly, fineValue, usesFines }) {
      must(await db('month_settings').upsert({ month, monthly, fine_value: fineValue, uses_fines: usesFines }, { onConflict: 'user_id,month' }));
      // Último valor usado vira o padrão para meses ainda não configurados.
      must(await db('settings').upsert({ monthly, fine_value: fineValue, uses_fines: usesFines }, { onConflict: 'user_id' }));
    },
    async listSourceMonths(exceptMonth) {
      const rows = must(await db('members').select('month').neq('month', exceptMonth));
      const counts = {};
      for (const r of rows) counts[r.month] = (counts[r.month] || 0) + 1;
      return Object.entries(counts).map(([month, count]) => ({ month, count })).sort((a, b) => b.month.localeCompare(a.month));
    },
    async listMemberNames(month) {
      return must(await db('members').select('name').eq('month', month)).map(r => r.name).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },
    async copyMembers(sourceMonth, targetMonth) {
      return must(await client.rpc('copy_members', { source_month: sourceMonth, target_month: targetMonth }));
    },
    async createMember(month, { name, exempt, due, fines }) {
      return must(await client.rpc('create_member', {
        p_month: month, p_name: name, p_exempt: exempt,
        p_due_amount: due ? due.amount : null, p_due_paid_at: due ? due.paidAt : null,
        p_fines: fines.map(fineRow),
      }));
    },
    async renameMember(id, name) { must(await db('members').update({ name }).eq('id', id)); },
    async deleteMember(id) { must(await db('members').delete().eq('id', id)); },
    async setExempt(id, exempt) { must(await db('members').update({ exempt }).eq('id', id)); },
    async saveDue(memberId, { amount, paidAt }) {
      must(await db('dues').upsert({ member_id: memberId, amount, paid_at: paidAt }, { onConflict: 'member_id' }));
    },
    async deleteDue(memberId) { must(await db('dues').delete().eq('member_id', memberId)); },
    async addFine(memberId, fine) { must(await db('fines').insert({ member_id: memberId, ...fineRow(fine) })); },
    async updateFine(id, fine) { must(await db('fines').update(fineRow(fine)).eq('id', id)); },
    async deleteFine(id) { must(await db('fines').delete().eq('id', id)); },
  };
}
