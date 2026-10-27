import { pad, money, esc, next, label, date, todayLocal, fmtAmount, status, validateDue, validateFine, validateSettings, validateMember, fineTotal, duesText } from './src/core.js';
import { createRepo } from './src/repo.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const $ = s => document.querySelector(s);
const state = {
  client: null, repo: null, userId: null, defaults: null, seq: 0, busy: false, recovering: false, copySources: [],
  month: todayLocal().slice(0, 7), filter: '', data: { settings: { monthly: 0, fineValue: 0, usesFines: true }, members: [] },
  theme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
};
window.__patotasReady = true;

const cfg = () => state.data.settings;
const memberById = id => state.data.members.find(x => x.id === id);
const findFine = id => state.data.members.flatMap(m => m.fines).find(f => f.id === id);
const pill = (d, m) => { const s = status(d, m), cls = d ? 'paid' : s === 'Atrasado' ? 'pending' : 'late'; return '<span class="pill ' + cls + '">' + s + '</span>'; };
const action = (text, act, cls = '') => '<button class="action ' + cls + '" data-act="' + act + '">' + text + '</button>';

function applyChrome() {
  document.body.classList.toggle('theme-dark', state.theme === 'dark');
  $('#themeToggle').textContent = state.theme === 'dark' ? '☀' : '☾';
  $('#selectMonth').textContent = label(state.month).replace(/^./, c => c.toUpperCase());
}

function render() {
  applyChrome();
  const list = state.data.members.filter(x => x.name.toLowerCase().includes(state.filter.toLowerCase()));
  $('#view').innerHTML = '<div class="month-actions"><button class="action" data-act="add">+ Adicionar membro</button>' +
    (state.data.members.length === 0 ? '<button class="action outline" data-act="copy">Copiar de outro mês</button>' : '<button class="action outline share-dues-button icon-copy-button" data-act="shareDues" type="button" aria-label="Copiar mensalidades" title="Copiar mensalidades"><svg class="copy-icon" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><span class="share-check" aria-hidden="true">✓</span></button>') + '</div>' +
    '<input class="search" id="search" placeholder="Buscar membro..." value="' + esc(state.filter) + '"><div id="memberRows">' + rows(list) + '</div>';
}

function rows(list) {
  return list.map(x => {
    const pending = x.fines.filter(y => !y.paidAt);
    return '<button class="list-row" data-act="member:' + x.id + '"><div class="grow"><div class="name">' + esc(x.name) + '</div><div class="detail">' +
      (x.exempt ? 'Isento de mensalidade' : !x.due ? 'Sem mensalidade cadastrada' : x.due.paidAt ? 'Mensalidade paga em ' + date(x.due.paidAt) : 'Mensalidade ' + status(null, state.month).toLowerCase()) +
      (pending.length ? ' · ' + pending.length + ' multa(s) pendente(s)' : '') + '</div></div>' +
      (x.exempt ? '<span class="pill neutral">Isento</span>' : x.due ? pill(x.due.paidAt, state.month) : '<span class="pill neutral">Sem mensalidade</span>') + '<span class="chevron">›</span></button>';
  }).join('') || '<div class="empty">Nenhum membro neste mês. Adicione um membro ou copie a lista de outro mês.</div>';
}

function modal(title, body) {
  $('#modalRoot').innerHTML = '<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>' + esc(title) + '</h2><button data-act="close" aria-label="Fechar">×</button></div>' + body + '</div></div>';
}
const close = () => { $('#modalRoot').innerHTML = ''; };

async function refresh() {
  const seq = ++state.seq, month = state.month;
  const data = await state.repo.loadMonth(month, state.defaults);
  if (seq !== state.seq) return;
  state.data = data;
  render();
}

async function guard(fn) {
  if (state.busy) return;
  state.busy = true;
  try { await fn(); } catch (e) { alert(e.message || 'Não foi possível salvar'); } finally { state.busy = false; }
}

/* ---------- Telas de membro, mensalidade e multa ---------- */
function showMember(id) {
  const x = memberById(id); if (!x) return;
  const d = x.due, fs = x.fines, exempt = x.exempt;
  modal(x.name, '<div class="tagline">Competência: ' + label(state.month) + '</div><div class="panel"><label class="exempt-option"><input type="checkbox" id="freeDue" data-id="' + id + '" ' + (exempt ? 'checked' : '') + '> Não paga mensalidade</label></div>' +
    (exempt ? '' : '<div class="panel"><div class="row"><strong>Mensalidade</strong>' + (d ? pill(d.paidAt, state.month) : '<span class="pill neutral">Não cadastrada</span>') + '</div>' +
      (d ? '<div class="money-line"><span>' + money(d.amount) + '</span><span>' + (d.paidAt ? 'Pago em ' + date(d.paidAt) : status(null, state.month)) + '</span></div>' : '<p class="notice">Nenhuma mensalidade cadastrada neste mês.</p>') +
      action(d ? 'Editar mensalidade' : 'Adicionar mensalidade', 'due:' + id, 'outline') + '</div>') +
    (cfg().usesFines ? '<div class="section-title"><h2>Multas</h2>' + action('+ Multa', 'addFine:' + id, 'small') + '</div>' +
      (fs.map(f => '<button class="list-row" data-act="fine:' + f.id + '"><div class="grow"><div class="name">' + f.quantity + ' multa(s) · ' + money(fineTotal(f)) + '</div><div class="detail">' + esc(f.reason || 'Sem motivo') + ' · ' + (f.occurredAt ? 'Multa em ' + date(f.occurredAt) + ' · ' : '') + (f.paidAt ? 'Pago em ' + date(f.paidAt) : 'Pendente') + '</div></div>' + pill(f.paidAt, state.month) + ' ›</button>').join('') || '<p class="notice">Nenhuma multa neste mês.</p>') : '') +
    '<div class="actions">' + action('Apagar membro', 'remove:' + id, 'danger') + '</div>');
  const title = document.querySelector('.modal-head h2');
  if (title) {
    const pen = document.createElement('button');
    pen.type = 'button'; pen.className = 'edit-name-icon'; pen.textContent = '✎'; pen.title = 'Editar nome';
    pen.setAttribute('aria-label', 'Editar nome'); pen.dataset.act = 'edit:' + id;
    title.append(' ', pen);
  }
}

function dueModal(id) {
  const x = memberById(id), d = x.due;
  modal('Mensalidade — ' + x.name, '<form id="dueForm" data-id="' + id + '"><div class="tagline">Referente a ' + label(state.month) + '</div><label class="form-label">Valor (R$)</label><input name="amount" type="text" inputmode="decimal" required value="' + fmtAmount(d?.amount ?? cfg().monthly) + '"><label class="form-label">Data do pagamento (opcional)</label><input name="paidAt" type="date" value="' + (d?.paidAt || '') + '"><p class="notice">Pode ser paga antes ou depois do mês de referência.</p><button class="action" type="submit">Salvar mensalidade</button>' + (d ? action('Excluir mensalidade', 'deleteDue:' + id, 'danger') : '') + '</form>');
}

function fineModal(id) {
  const f = findFine(id); if (!f) return;
  modal('Editar multa', '<form id="fineForm" data-id="' + id + '"><label class="form-label">Quantidade</label><input type="number" name="quantity" min="1" max="1000" value="' + f.quantity + '" required><label class="form-label">Valor unitário (R$)</label><input type="text" inputmode="decimal" name="unit" value="' + fmtAmount(f.unitAmount) + '" required><label class="form-label">Motivo</label><input name="reason" value="' + esc(f.reason || '') + '"><label class="form-label">Data da multa</label><input name="occurredAt" type="date" value="' + (f.occurredAt || '') + '" required><label class="form-label">Data do pagamento (opcional)</label><input name="paidAt" type="date" value="' + (f.paidAt || '') + '"><button type="submit" class="action">Salvar multa</button>' + action('Excluir multa', 'deleteFine:' + id, 'danger') + '</form>');
}

function addFineModal(id) {
  modal('Nova multa', '<form id="addFineForm" data-id="' + id + '"><label class="form-label">Quantidade</label><input name="quantity" type="number" min="1" max="1000" value="1" required><label class="form-label">Valor unitário (R$)</label><input name="unit" type="text" inputmode="decimal" value="' + fmtAmount(cfg().fineValue) + '" required><label class="form-label">Motivo</label><input name="reason" placeholder="Ex.: Atraso"><label class="form-label">Data da multa</label><input name="occurredAt" type="date" value="' + todayLocal() + '" required><label class="form-label">Data do pagamento (opcional)</label><input name="paidAt" type="date"><button class="action" type="submit">Adicionar multa</button></form>');
}

function memberModal(id) {
  const x = id ? memberById(id) : null;
  modal(x ? 'Editar membro' : 'Adicionar membro', '<form id="memberForm" data-id="' + (id || '') + '"><label class="form-label">Nome</label><input name="name" maxlength="80" required value="' + esc(x?.name || '') + '" placeholder="Nome do membro">' +
    (x ? '' : '<div class="panel"><label class="exempt-option"><input type="checkbox" name="exempt" id="newExempt"> Não paga mensalidade</label><div id="newDueFields"><label class="form-label">Valor da mensalidade (R$)</label><input name="dueAmount" type="text" inputmode="decimal" value="' + fmtAmount(cfg().monthly) + '"><label class="form-label">Data de pagamento</label><input name="duePaidAt" type="date"></div></div>' +
      (cfg().usesFines ? '<div class="section-title"><h2>Multas</h2><button type="button" class="action small" data-act="draftFine">+ Multa</button></div><div id="draftFines"></div>' : '')) +
    '<button type="submit" class="action">Salvar membro</button></form>');
}

function draftFine() {
  const host = document.getElementById('draftFines'); if (!host) return;
  const el = document.createElement('div');
  el.className = 'panel draft-fine';
  el.innerHTML = '<div class="row"><strong>Multa</strong><button type="button" class="action danger small" data-act="removeDraftFine">Excluir</button></div><label class="form-label">Quantidade</label><input class="draft-quantity" type="number" min="1" max="1000" value="1" required><label class="form-label">Valor unitário (R$)</label><input class="draft-unit" type="text" inputmode="decimal" value="' + fmtAmount(cfg().fineValue) + '" required><label class="form-label">Motivo</label><input class="draft-reason" placeholder="Ex.: Atraso"><label class="form-label">Data da multa</label><input class="draft-occurred" type="date" value="' + todayLocal() + '" required><label class="form-label">Data do pagamento (opcional)</label><input class="draft-paid" type="date">';
  host.append(el);
}

/* ---------- Copiar membros ---------- */
function copyPreview(names) {
  const target = document.getElementById('copyPreview'); if (!target) return;
  target.innerHTML = '<div class="section-title"><h2>Membros que serão copiados (' + names.length + ')</h2></div>' + (names.length ? '<div class="panel">' + names.map(n => '<div class="money-line"><span>' + esc(n) + '</span></div>').join('') + '</div>' : '<p class="notice">Nenhum membro nesse mês.</p>');
}
async function copySourceChange() {
  const year = document.getElementById('copyYear')?.value, month = document.getElementById('copyMonth'); if (!month) return;
  const sources = state.copySources.filter(s => s.month.startsWith(year + '-'));
  month.innerHTML = sources.map(s => '<option value="' + s.month + '">' + label(s.month).split(' de ')[0] + ' (' + s.count + ' membros)</option>').join('');
  await copyPreviewFor(month.value);
}
async function copyPreviewFor(source) {
  try { copyPreview(source ? await state.repo.listMemberNames(source) : []); } catch (e) { alert(e.message); }
}
async function copyModal() {
  state.copySources = await state.repo.listSourceMonths(state.month);
  const years = [...new Set(state.copySources.map(s => s.month.slice(0, 4)))].sort().reverse();
  modal('Copiar membros', '<form id="copyForm"><p class="notice">Escolha o ano e o mês de origem. Só os nomes serão copiados; mensalidades, isenções, multas e pagamentos começarão zerados.</p><div class="copy-selectors"><div><label class="form-label">Ano</label><select id="copyYear" required>' + years.map(y => '<option value="' + y + '">' + y + '</option>').join('') + '</select></div><div><label class="form-label">Mês</label><select id="copyMonth" name="source" required></select></div></div><div id="copyPreview"></div><button class="action" type="submit" ' + (!state.copySources.length ? 'disabled' : '') + '>Copiar membros</button></form>');
  await copySourceChange();
}

/* ---------- Compartilhar ---------- */
let toastTimer = 0, copyTimer = 0;
function notify(message) {
  const toast = document.getElementById('toast'); if (!toast) return;
  clearTimeout(toastTimer); toast.textContent = message; toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}
async function shareDues() {
  const value = duesText(state.data.members, state.month);
  try {
    if (!navigator.clipboard?.writeText) throw Error('Clipboard indisponível');
    await navigator.clipboard.writeText(value);
    notify('✓ Lista copiada! Cole no WhatsApp.');
    const button = document.querySelector('[data-act="shareDues"]');
    if (button) { clearTimeout(copyTimer); button.classList.add('copy-success'); copyTimer = setTimeout(() => button.classList.remove('copy-success'), 3000); }
  } catch (e) {
    modal('Copiar mensalidades', '<p class="notice">Selecione e copie o texto abaixo para enviar pelo WhatsApp.</p><textarea readonly id="shareText" style="width:100%;min-height:250px;padding:12px;border-radius:12px;background:var(--surface);color:var(--ink);border:1px solid var(--line)">' + esc(value) + '</textarea>');
    notify('Copie o texto para compartilhar no WhatsApp.');
  }
}

/* ---------- Configurações do mês ---------- */
async function refreshMonthFields() {
  const el = document.querySelector('#monthSettingsForm [name="month"]'); if (!el || !/^\d{4}-\d{2}$/.test(el.value)) return;
  const v = await state.repo.loadMonthSettings(el.value, state.defaults);
  if (!document.querySelector('#monthSettingsForm') || el.value !== document.querySelector('#monthSettingsForm [name="month"]')?.value) return;
  document.querySelector('#monthSettingsForm [name="monthly"]').value = fmtAmount(v.monthly);
  document.querySelector('#monthSettingsForm [name="fineValue"]').value = fmtAmount(v.fineValue);
  document.getElementById('usesFines').checked = v.usesFines;
  document.getElementById('fineSettings').hidden = !v.usesFines;
}
function monthPicker() {
  const v = cfg();
  modal('Mês e configurações', '<form id="monthSettingsForm"><label class="form-label">Mês de referência</label><input name="month" type="month" value="' + state.month + '" required><label class="form-label">Valor padrão da mensalidade (R$)</label><input inputmode="decimal" type="text" name="monthly" required value="' + fmtAmount(v.monthly) + '"><div class="panel"><label class="exempt-option"><input type="checkbox" id="usesFines" name="usesFines" ' + (v.usesFines ? 'checked' : '') + '> Usa multa</label><div id="fineSettings" ' + (v.usesFines ? '' : 'hidden') + '><label class="form-label">Valor padrão da multa (R$)</label><input type="text" inputmode="decimal" name="fineValue" value="' + fmtAmount(v.fineValue) + '"></div></div><p class="notice">Os valores padrão podem ser R$ 0,00. Os lançamentos precisam ter valor maior que zero.</p><button class="action" type="submit">Salvar e abrir mês</button><button class="action outline" type="button" data-act="logout">Sair da conta</button></form>');
}

/* ---------- Autenticação ---------- */
const authMessages = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos'],
  [/email not confirmed/i, 'Confirme seu e-mail pelo link enviado antes de entrar'],
  [/password should be at least/i, 'A senha precisa ter pelo menos 8 caracteres'],
  [/rate limit|too many/i, 'Muitas tentativas. Aguarde alguns minutos e tente de novo'],
  [/valid email|invalid format/i, 'Informe um e-mail válido'],
  [/same password/i, 'A nova senha precisa ser diferente da atual'],
  [/fetch|network/i, 'Sem conexão com o servidor. Verifique a internet'],
];
const authError = e => { const m = String(e?.message || ''); return new Error((authMessages.find(([re]) => re.test(m)) || [])[1] || 'Não foi possível concluir. Tente novamente'); };

function showLogin(note = '') {
  state.userId = null; state.repo = null; state.seq++;
  state.data = { settings: { monthly: 0, fineValue: 0, usesFines: true }, members: [] };
  close(); applyChrome();
  document.querySelector('.month-bar').hidden = true; $('#logout').hidden = true;
  $('#view').innerHTML = '<form id="loginForm" class="panel auth-panel" novalidate><h2>Entrar no Patotas</h2>' + (note ? '<p class="notice" id="authNote" role="status">' + esc(note) + '</p>' : '') +
    '<label class="form-label" for="authEmail">E-mail</label><input id="authEmail" name="email" type="email" autocomplete="email" inputmode="email" required>' +
    '<label class="form-label" for="authPassword">Senha</label><input id="authPassword" name="password" type="password" autocomplete="current-password" minlength="8" required>' +
    '<button class="action" type="submit">Entrar</button><button class="action outline" type="button" data-act="signup">Criar conta</button><button class="action outline" type="button" data-act="forgot">Esqueci a senha</button></form>';
}
function showRecovery() {
  state.recovering = true; applyChrome();
  document.querySelector('.month-bar').hidden = true; $('#logout').hidden = true;
  $('#view').innerHTML = '<form id="recoveryForm" class="panel auth-panel"><h2>Nova senha</h2><label class="form-label" for="newPassword">Nova senha (mín. 8 caracteres)</label><input id="newPassword" name="password" type="password" autocomplete="new-password" minlength="8" required><button class="action" type="submit">Salvar senha</button></form>';
}
function credentials() {
  const f = document.getElementById('loginForm');
  return { email: String(f?.email.value || '').trim(), password: String(f?.password.value || '') };
}
async function start(user) {
  if (state.userId === user.id || state.recovering) return;
  state.userId = user.id; state.repo = createRepo(state.client);
  try {
    state.defaults = await state.repo.loadSettings();
    state.theme = state.defaults.theme;
    document.querySelector('.month-bar').hidden = false; $('#logout').hidden = false;
    await refresh();
  } catch (e) { state.userId = null; state.repo = null; $('#view').innerHTML = '<div class="panel auth-panel"><strong>Não foi possível carregar seus dados.</strong><p class="notice" id="loadError">' + esc(e.message) + '</p><button class="action" data-act="reload">Tentar de novo</button></div>'; }
}

/* ---------- Ações ---------- */
async function act(raw) {
  const [type, v] = raw.split(':'), id = Number(v);
  if (type === 'close') return close();
  if (type === 'add' || type === 'edit') return memberModal(type === 'edit' ? id : null);
  if (type === 'member') return showMember(id);
  if (type === 'due') return dueModal(id);
  if (type === 'fine') return fineModal(id);
  if (type === 'addFine') return cfg().usesFines ? addFineModal(id) : undefined;
  if (type === 'draftFine') return draftFine();
  if (type === 'copy') return state.data.members.length ? undefined : guard(copyModal);
  if (type === 'shareDues') return shareDues();
  if (type === 'logout') return state.client.auth.signOut();
  if (type === 'reload') return location.reload();
  if (type === 'signup') return guard(async () => {
    const { email, password } = credentials();
    if (!email || password.length < 8) throw new Error('Informe e-mail e uma senha com pelo menos 8 caracteres');
    const { error } = await state.client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw authError(error);
    showLogin('Se o e-mail puder ser cadastrado, enviamos um link de confirmação. Confirme e depois entre.');
  });
  if (type === 'forgot') return guard(async () => {
    const { email } = credentials();
    if (!email) throw new Error('Informe o e-mail para receber o link de nova senha');
    const { error } = await state.client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) throw authError(error);
    showLogin('Se o e-mail estiver cadastrado, enviamos um link para criar uma nova senha.');
  });
  if (type === 'deleteDue') return guard(async () => {
    if (!confirm('Excluir a mensalidade deste membro em ' + label(state.month) + '?')) return;
    await state.repo.deleteDue(id); close(); await refresh();
  });
  if (type === 'remove') return guard(async () => {
    if (!confirm('Apagar este membro de ' + label(state.month) + '? A mensalidade e todas as multas deste membro serão apagadas NESTE MÊS APENAS. Os outros meses não serão alterados.')) return;
    await state.repo.deleteMember(id); close(); await refresh();
  });
  if (type === 'deleteFine') return guard(async () => {
    if (!confirm('Excluir esta multa?')) return;
    await state.repo.deleteFine(id); close(); await refresh();
  });
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b) { if (b.dataset.act === 'removeDraftFine') { b.closest('.draft-fine')?.remove(); return; } act(b.dataset.act); return; }
  if (e.target.classList.contains('modal-backdrop')) close();
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'newExempt') document.getElementById('newDueFields').hidden = t.checked;
  if (t.name === 'month' && t.closest('#monthSettingsForm')) refreshMonthFields().catch(err => alert(err.message));
  if (t.id === 'usesFines') document.getElementById('fineSettings').hidden = !t.checked;
  if (t.id === 'copyYear') copySourceChange();
  if (t.id === 'copyMonth') copyPreviewFor(t.value);
  if (t.id === 'freeDue') guard(async () => {
    const id = Number(t.dataset.id);
    if (t.checked && !confirm('Marcar como isento? A mensalidade deste mês será excluída.')) { t.checked = false; return; }
    await state.repo.setExempt(id, t.checked);
    await refresh(); showMember(id);
  });
});

document.addEventListener('input', e => {
  if (e.target.id === 'search') { state.filter = e.target.value; $('#memberRows').innerHTML = rows(state.data.members.filter(x => x.name.toLowerCase().includes(state.filter.toLowerCase()))); }
});

const submitters = {
  async loginForm() {
    const { email, password } = credentials();
    if (!email || !password) throw new Error('Informe e-mail e senha');
    const { error } = await state.client.auth.signInWithPassword({ email, password });
    if (error) throw authError(error);
  },
  async recoveryForm(data) {
    if (String(data.password || '').length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres');
    const { error } = await state.client.auth.updateUser({ password: data.password });
    if (error) throw authError(error);
    state.recovering = false;
    history.replaceState(null, '', location.pathname);
    const { data: s } = await state.client.auth.getSession();
    if (s.session) await start(s.session.user); else showLogin();
  },
  async monthSettingsForm(data) {
    const s = validateSettings(data);
    await state.repo.saveMonthSettings(s);
    state.defaults = { ...state.defaults, monthly: s.monthly, fineValue: s.fineValue, usesFines: s.usesFines };
    state.month = s.month; state.filter = '';
    close(); await refresh();
  },
  async memberForm(data, f) {
    const id = Number(f.dataset.id);
    if (id) { const name = String(data.name || '').trim(); if (!name) throw new Error('Digite o nome'); await state.repo.renameMember(id, name); }
    else {
      const fines = [...f.querySelectorAll('.draft-fine')].map(el => ({ quantity: el.querySelector('.draft-quantity').value, unit: el.querySelector('.draft-unit').value, reason: el.querySelector('.draft-reason').value, occurredAt: el.querySelector('.draft-occurred').value, paidAt: el.querySelector('.draft-paid').value }));
      await state.repo.createMember(state.month, validateMember({ ...data, fines }));
    }
    close(); await refresh();
  },
  async copyForm(data) {
    if (state.data.members.length) throw new Error('Este mês já possui membros cadastrados');
    await state.repo.copyMembers(data.source, state.month);
    close(); await refresh();
  },
  async dueForm(data, f) {
    const id = Number(f.dataset.id);
    if (memberById(id)?.exempt) throw new Error('Membro isento');
    await state.repo.saveDue(id, validateDue({ amount: data.amount, paidAt: data.paidAt }));
    close(); await refresh();
  },
  async fineForm(data, f) { await state.repo.updateFine(Number(f.dataset.id), validateFine(data)); close(); await refresh(); },
  async addFineForm(data, f) { await state.repo.addFine(Number(f.dataset.id), validateFine(data)); close(); await refresh(); },
};

document.addEventListener('submit', e => {
  const f = e.target; if (!f.id) return;
  e.preventDefault();
  const handler = submitters[f.id]; if (!handler) return;
  const data = Object.fromEntries(new FormData(f));
  guard(() => handler(data, f));
});

$('#themeToggle').onclick = () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyChrome();
  state.repo?.saveTheme(state.theme).catch(console.warn);
};
$('#logout').onclick = () => state.client.auth.signOut();
const go = n => { state.month = next(state.month, n); state.filter = ''; applyChrome(); refresh().catch(e => alert(e.message)); };
$('#prevMonth').onclick = () => go(-1);
$('#nextMonth').onclick = () => go(1);
$('#selectMonth').onclick = monthPicker;
window.addEventListener('error', e => console.error(e.error || e.message));

/* ---------- Inicialização ---------- */
function boot() {
  if (!window.supabase || !SUPABASE_URL.startsWith('http') || SUPABASE_URL.includes('SEU-PROJETO')) {
    document.querySelector('.month-bar').hidden = true; $('#logout').hidden = true;
    $('#view').innerHTML = '<div class="panel auth-panel"><strong>Configuração pendente.</strong><p class="notice">Preencha SUPABASE_URL e SUPABASE_ANON_KEY em config.js.</p></div>';
    return;
  }
  state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  state.recovering = /type=recovery/.test(location.hash);
  if (state.recovering) showRecovery();
  else { document.querySelector('.month-bar').hidden = true; $('#logout').hidden = true; applyChrome(); }
  state.client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') showRecovery();
    else if (event === 'SIGNED_OUT') { state.recovering = false; showLogin(); }
    else if (session && !state.recovering) setTimeout(() => start(session.user), 0);
  });
  state.client.auth.getSession().then(({ data }) => { if (!data.session && !state.recovering) showLogin(); });
}
boot();
