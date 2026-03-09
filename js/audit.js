
// ── Auditoria de Auto-registros ──────────────────────────────────────────
// A tabela scheduled_run_logs é preenchida pelo auto-register (scheduled.js)
// cada vez que uma transação programada é executada automaticamente.
// Se a tabela não existir, execute a migration exibida na tela.

let _auditSearchTerm = '';

async function loadAuditLogs() {
  const body    = document.getElementById('auditBody');
  const countEl = document.getElementById('auditCount');
  if (body) body.innerHTML = `
    <tr><td colspan="6" style="text-align:center;padding:28px;color:var(--muted)">
      <span style="font-size:.85rem">⟳ Carregando…</span>
    </td></tr>`;

  try {
    if (!sb) { toast('Sem conexão com o banco', 'error'); return; }

    const { error: testErr } = await sb.from('scheduled_run_logs').select('id').limit(1);
    if (testErr) throw testErr;

    const statusFilter = document.getElementById('auditStatusFilter')?.value || '';
    const typeFilter   = document.getElementById('auditTypeFilter')?.value   || '';
    _auditSearchTerm   = (document.getElementById('auditSearch')?.value || '').toLowerCase().trim();

    let q = famQ(
      sb.from('scheduled_run_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300)
    );
    if (statusFilter) q = q.eq('status', statusFilter);

    const { data, error } = await q;
    if (error) throw error;

    _updateAuditCounters(data || []);

    let rows = data || [];
    if (_auditSearchTerm) {
      rows = rows.filter(r =>
        (r.description || '').toLowerCase().includes(_auditSearchTerm)
      );
    }

    if (countEl) countEl.textContent = `${rows.length} registro${rows.length !== 1 ? 's' : ''}`;

    if (!rows.length) {
      const msg = _auditSearchTerm || statusFilter
        ? 'Nenhum registro encontrado com esses filtros.'
        : 'Nenhum auto-registro ainda. Execute uma transação programada automática para ver logs aqui.';
      if (body) body.innerHTML = `
        <tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted)">
          <div style="font-size:1.8rem;margin-bottom:8px">📋</div>
          <div style="font-size:.85rem">${msg}</div>
        </td></tr>`;
      return;
    }

    if (body) body.innerHTML = rows.map(r => _auditRow(r)).join('');

  } catch(e) {
    console.warn('[audit]', e.message);
    const isMissing = /does not exist|relation|not found/i.test(e.message || '');
    if (body) body.innerHTML = isMissing
      ? `<tr><td colspan="6"><div style="margin:12px;padding:18px 20px;background:var(--amber-lt);border:1.5px solid var(--amber);border-radius:var(--r);font-size:.85rem;line-height:1.7">
          <div style="font-weight:700;color:var(--amber);margin-bottom:10px">⚠️ Tabela <code>scheduled_run_logs</code> não encontrada</div>
          <div style="color:var(--text2);margin-bottom:12px">Execute o SQL abaixo no <strong>Supabase SQL Editor</strong> para criar a tabela:</div>
          <pre id="auditMigrationSql" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:12px;font-size:.7rem;overflow-x:auto;white-space:pre;color:var(--text);cursor:text;user-select:all">${_auditMigrationSql()}</pre>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="_copyAuditMigration()">📋 Copiar SQL</button>
            <button class="btn btn-ghost btn-sm" onclick="window.open('https://supabase.com/dashboard','_blank')">🔗 Supabase</button>
            <button class="btn btn-ghost btn-sm" onclick="loadAuditLogs()">↻ Tentar novamente</button>
          </div>
        </div></td></tr>`
      : `<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--red);font-size:.85rem">
          Erro: ${esc(e.message)}
          <br><button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="loadAuditLogs()">↻ Tentar novamente</button>
        </td></tr>`;
  }
}

function _updateAuditCounters(data) {
  const total     = data.length;
  const confirmed = data.filter(r => r.status === 'confirmed').length;
  const pending   = data.filter(r => r.status === 'pending').length;
  const errors    = data.filter(r => r.status === 'error').length;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('auditCntTotal',     total);
  set('auditCntConfirmed', confirmed);
  set('auditCntPending',   pending);
  set('auditCntError',     errors);
}

function _auditRow(r) {
  const desc   = r.description || '—';
  const amount = r.amount ?? 0;
  const date   = r.scheduled_date || r.created_at;
  const status = r.status || 'confirmed';
  const badge  = {
    confirmed: `<span class="audit-status-badge audit-ok">✅ confirmada</span>`,
    pending:   `<span class="audit-status-badge audit-pending">⏳ pendente</span>`,
    error:     `<span class="audit-status-badge audit-error">❌ erro</span>`,
  }[status] || `<span class="audit-status-badge audit-ok">✅ confirmada</span>`;

  const txLink = r.transaction_id
    ? `<button class="btn btn-ghost btn-sm" onclick="openTxDetail('${r.transaction_id}')" style="font-size:.72rem;padding:3px 8px">Ver</button>`
    : `<span style="color:var(--muted);font-size:.8rem">—</span>`;

  const createdAt = r.created_at
    ? new Date(r.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '—';

  return `<tr>
    <td style="white-space:nowrap;font-size:.82rem">${fmtDate(date)}</td>
    <td>
      <div style="font-weight:500;font-size:.875rem">${esc(desc)}</div>
      ${r.notes ? `<div style="font-size:.72rem;color:var(--muted);margin-top:1px">${esc(r.notes)}</div>` : ''}
    </td>
    <td>${badge}</td>
    <td style="text-align:right;white-space:nowrap" class="${amount >= 0 ? 'amount-pos' : 'amount-neg'}">${fmt(amount)}</td>
    <td style="font-size:.75rem;color:var(--muted);white-space:nowrap">${createdAt}</td>
    <td style="text-align:center">${txLink}</td>
  </tr>`;
}

function _auditMigrationSql() {
  return `CREATE TABLE IF NOT EXISTS public.scheduled_run_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id      UUID REFERENCES public.families(id) ON DELETE CASCADE,
  scheduled_id   UUID REFERENCES public.scheduled_transactions(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  scheduled_date DATE,
  status         TEXT NOT NULL DEFAULT 'confirmed'
                   CHECK (status IN ('confirmed','pending','error')),
  amount         NUMERIC(14,2),
  description    TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_srl_family  ON public.scheduled_run_logs(family_id);
CREATE INDEX IF NOT EXISTS idx_srl_created ON public.scheduled_run_logs(created_at DESC);
ALTER TABLE public.scheduled_run_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srl_family_access" ON public.scheduled_run_logs;
CREATE POLICY "srl_family_access" ON public.scheduled_run_logs
  USING (
    family_id IN (SELECT family_id FROM public.family_members WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.app_users WHERE id = auth.uid() AND role IN ('admin','owner'))
  );`.replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _copyAuditMigration() {
  const sql = _auditMigrationSql().replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  navigator.clipboard.writeText(sql)
    .then(() => toast('SQL copiado!', 'success'))
    .catch(() => toast('Selecione o texto acima e copie', 'info'));
}

function filterAuditLogs() { loadAuditLogs(); }
