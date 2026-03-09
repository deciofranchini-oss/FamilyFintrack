// ── backup.js — Backup local (JSON) + Backup no banco (Supabase) ───────────

// ══════════════════════════════════════════════════════════════════════════
//  SEÇÃO 1 — BACKUP LOCAL (JSON download)
// ══════════════════════════════════════════════════════════════════════════

async function exportBackup() {
  const btn = event?.target;
  const origText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Exportando...'; }
  const status = document.getElementById('backupStatus');
  try {
    const fid = famId();
    const q = q => famQ(sb.from(q).select('*'));
    const [a, c, p, t, b, s, grp] = await Promise.all([
      q('accounts'),
      q('categories'),
      q('payees'),
      q('transactions'),
      q('budgets'),
      famQ(sb.from('scheduled_transactions').select('*')),
      famQ(sb.from('account_groups').select('*')),
    ]);
    const backup = {
      version:     '3.0',
      app:         'JF Family FinTrack',
      family_id:   fid,
      exported_at: new Date().toISOString(),
      counts: {
        accounts:     a.data?.length || 0,
        categories:   c.data?.length || 0,
        transactions: t.data?.length || 0,
        budgets:      b.data?.length || 0,
        scheduled:    s.data?.length || 0,
      },
      data: {
        accounts:             a.data  || [],
        account_groups:       grp.data|| [],
        categories:           c.data  || [],
        payees:               p.data  || [],
        transactions:         t.data  || [],
        budgets:              b.data  || [],
        scheduled_transactions: s.data || [],
      },
    };
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a2   = document.createElement('a');
    a2.href = url;
    a2.download = `FinTrack_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a2.click();
    URL.revokeObjectURL(url);
    if (status) {
      status.textContent = `✓ ${backup.counts.transactions} transações · ${(json.length / 1024).toFixed(0)} KB`;
      status.style.color = 'var(--green)';
    }
    toast('Backup exportado!', 'success');
  } catch (e) {
    if (status) { status.textContent = '✗ ' + e.message; status.style.color = 'var(--red)'; }
    toast('Erro ao exportar: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
}

async function restoreBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const status = document.getElementById('restoreStatus');
  if (status) status.textContent = '⏳ Lendo arquivo...';
  try {
    const backup = JSON.parse(await file.text());
    if (!backup.version || !backup.data) throw new Error('Arquivo de backup inválido');
    const ok = confirm(
      `Restaurar backup de ${backup.exported_at?.slice(0, 10) || '?'}?\n\n` +
      `${backup.counts?.transactions || 0} transações · ${backup.counts?.accounts || 0} contas\n\n` +
      `Dados existentes serão mantidos (upsert).`
    );
    if (!ok) { if (status) status.textContent = ''; return; }
    if (status) status.textContent = '⏳ Restaurando...';
    const d = backup.data;
    for (const [table, rows] of [
      ['account_groups',        d.account_groups        || []],
      ['accounts',              d.accounts              || []],
      ['categories',            d.categories            || []],
      ['payees',                d.payees                || []],
      ['transactions',          d.transactions          || []],
      ['budgets',               d.budgets               || []],
      ['scheduled_transactions', d.scheduled_transactions || d.scheduled || []],
    ]) {
      if (!rows.length) continue;
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await sb.from(table).upsert(rows.slice(i, i + 200), { ignoreDuplicates: false });
        if (error) { if (status) status.textContent = `✗ ${table}: ${error.message}`; return; }
      }
      if (status) status.textContent = `✓ ${table} ok...`;
    }
    await Promise.all([loadAccounts(), loadCategories(), loadPayees()]);
    populateSelects();
    if (status) { status.textContent = '✓ Restaurado com sucesso!'; status.style.color = 'var(--green)'; }
    toast('Backup restaurado!', 'success');
  } catch (e) {
    if (status) { status.textContent = '✗ ' + e.message; status.style.color = 'var(--red)'; }
    toast('Erro: ' + e.message, 'error');
  }
  event.target.value = '';
}

// ══════════════════════════════════════════════════════════════════════════
//  SEÇÃO 2 — BACKUP NO BANCO (app_backups)
// ══════════════════════════════════════════════════════════════════════════

let _dbBackupList = [];

// ── Verificar se tabela app_backups existe ────────────────────────────────
async function _checkBackupTable() {
  const { error } = await sb.from('app_backups').select('id').limit(1);
  return !error || !error.message?.includes('does not exist');
}

// ── Criar snapshot no banco ───────────────────────────────────────────────
async function createDbBackup(label = '') {
  const btn = document.getElementById('dbBackupCreateBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Criando...'; }
  try {
    const hasTable = await _checkBackupTable();
    if (!hasTable) {
      toast('Tabela app_backups não existe. Execute a migration primeiro.', 'error');
      _showDbBackupMigrationHint();
      return;
    }

    // Resolve family_id da família ativa, em ordem de confiabilidade:
    // 1) currentUser.family_id (usuário normal — mais rápido)
    // 2) state já carregado (owner que carregou dados de uma família)
    // 3) query direta ao banco em accounts/categories/families
    let fid = currentUser?.family_id
      || state.accounts?.find(a => a.family_id)?.family_id
      || state.categories?.find(c => c.family_id)?.family_id
      || null;

    if (!fid) {
      // Busca via account (tem family_id garantido, RLS permite leitura)
      const { data: acc } = await sb.from('accounts').select('family_id').limit(1).maybeSingle();
      fid = acc?.family_id || null;
    }
    if (!fid) {
      const { data: famRow } = await sb.from('families').select('id').limit(1).maybeSingle();
      fid = famRow?.id || null;
    }
    if (!fid) {
      toast('Não foi possível determinar a família ativa. Recarregue a página e tente novamente.', 'error');
      return;
    }
    const q = t => sb.from(t).select('*').eq('family_id', fid);
    const [a, c, p, t2, b, s, grp] = await Promise.all([
      q('accounts'), q('categories'), q('payees'), q('transactions'),
      q('budgets'), q('scheduled_transactions'), q('account_groups'),
    ]);

    const payload = {
      account_groups:         grp.data || [],
      accounts:               a.data   || [],
      categories:             c.data   || [],
      payees:                 p.data   || [],
      transactions:           t2.data  || [],
      budgets:                b.data   || [],
      scheduled_transactions: s.data   || [],
    };
    const counts = {
      accounts:     a.data?.length  || 0,
      categories:   c.data?.length  || 0,
      transactions: t2.data?.length || 0,
      budgets:      b.data?.length  || 0,
      scheduled:    s.data?.length  || 0,
    };

    const row = {
      family_id:   fid,
      label:       label || `Backup manual — ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      created_by:  currentUser?.name || currentUser?.email || 'sistema',
      payload,
      counts,
      size_kb:     Math.round(JSON.stringify(payload).length / 1024),
      backup_type: label ? 'manual' : 'manual',
    };

    const { error } = await sb.from('app_backups').insert(row);
    if (error) throw error;

    toast('✅ Backup criado no banco!', 'success');
    await loadDbBackups();
  } catch (e) {
    toast('Erro ao criar backup: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📸 Criar Snapshot'; }
  }
}

// ── Listar backups do banco ────────────────────────────────────────────────
async function loadDbBackups() {
  const container = document.getElementById('dbBackupList');
  if (!container) return;

  container.innerHTML = '<div style="color:var(--muted);font-size:.83rem;padding:12px 0">⏳ Carregando...</div>';

  try {
    const hasTable = await _checkBackupTable();
    if (!hasTable) {
      _showDbBackupMigrationHint();
      container.innerHTML = '';
      return;
    }

    // Família ativa = mesma lógica do createDbBackup
    let listFid = currentUser?.family_id
      || state.accounts?.find(a => a.family_id)?.family_id
      || state.categories?.find(c => c.family_id)?.family_id
      || null;
    if (!listFid) {
      const { data: acc } = await sb.from('accounts').select('family_id').limit(1).maybeSingle();
      listFid = acc?.family_id || null;
    }
    if (!listFid) {
      const { data: fr } = await sb.from('families').select('id').limit(1).maybeSingle();
      listFid = fr?.id || null;
    }

    let backupQuery = sb.from('app_backups')
      .select('id, label, created_at, created_by, counts, size_kb, backup_type')
      .order('created_at', { ascending: false })
      .limit(20);
    if (listFid) backupQuery = backupQuery.eq('family_id', listFid);

    const { data, error } = await backupQuery;
    if (error) throw error;

    _dbBackupList = data || [];
    document.getElementById('dbBackupMigrationHint')?.style && (document.getElementById('dbBackupMigrationHint').style.display = 'none');

    if (!_dbBackupList.length) {
      container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted);font-size:.83rem">
        <div style="font-size:1.8rem;margin-bottom:8px;opacity:.4">🗄️</div>
        Nenhum backup no banco ainda.<br>Clique em "Criar Snapshot" para começar.
      </div>`;
      return;
    }

    container.innerHTML = _dbBackupList.map(b => {
      const dt  = new Date(b.created_at);
      const ago = _timeAgo(dt);
      const typeIcon = b.backup_type === 'auto' ? '🤖' : '👤';
      return `<div class="db-backup-row">
        <div class="db-backup-row-info">
          <div class="db-backup-row-label">${typeIcon} ${esc(b.label || 'Backup')}</div>
          <div class="db-backup-row-meta">
            ${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            · <span title="${ago}">${ago}</span>
            · por ${esc(b.created_by || '—')}
            · ${b.size_kb || '?'} KB
          </div>
          <div class="db-backup-row-counts">
            ${b.counts?.transactions || 0} txs
            · ${b.counts?.accounts || 0} contas
            · ${b.counts?.categories || 0} categorias
          </div>
        </div>
        <div class="db-backup-row-actions">
          <button class="btn btn-ghost btn-sm" onclick="downloadDbBackup('${b.id}')" title="Baixar JSON">⬇️</button>
          <button class="btn btn-ghost btn-sm" onclick="restoreDbBackup('${b.id}')" title="Restaurar este snapshot">↩️ Restaurar</button>
          <button class="btn-icon" onclick="deleteDbBackup('${b.id}')" title="Excluir backup" style="color:var(--red)">🗑️</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<div style="color:var(--red);font-size:.83rem;padding:12px">${esc(e.message)}</div>`;
  }
}

// ── Download de backup específico ─────────────────────────────────────────
async function downloadDbBackup(id) {
  try {
    const { data, error } = await sb.from('app_backups').select('*').eq('id', id).single();
    if (error) throw error;
    const exportObj = {
      version:     '3.0',
      app:         'JF Family FinTrack',
      family_id:   famId(),
      exported_at: data.created_at,
      source:      'db_backup',
      label:       data.label,
      counts:      data.counts,
      data:        data.payload,
    };
    const json = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `FinTrack_Backup_${data.created_at.slice(0, 10)}_${id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup baixado!', 'success');
  } catch (e) {
    toast('Erro ao baixar backup: ' + e.message, 'error');
  }
}

// ── Restaurar snapshot do banco ────────────────────────────────────────────
async function restoreDbBackup(id) {
  const backup = _dbBackupList.find(b => b.id === id);
  const label  = backup?.label || 'este backup';
  if (!confirm(`⚠️ Restaurar "${label}"?\n\nOs dados atuais serão sobrescritos (upsert). Esta ação não pode ser desfeita.\n\nDeseja continuar?`)) return;

  const btn = document.querySelector(`[onclick="restoreDbBackup('${id}')"]`);
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

  try {
    const { data, error } = await sb.from('app_backups').select('payload').eq('id', id).single();
    if (error) throw error;

    const d = data.payload;
    for (const [table, rows] of [
      ['account_groups',        d.account_groups        || []],
      ['accounts',              d.accounts              || []],
      ['categories',            d.categories            || []],
      ['payees',                d.payees                || []],
      ['transactions',          d.transactions          || []],
      ['budgets',               d.budgets               || []],
      ['scheduled_transactions', d.scheduled_transactions || []],
    ]) {
      if (!rows.length) continue;
      for (let i = 0; i < rows.length; i += 200) {
        const { error: uErr } = await sb.from(table).upsert(rows.slice(i, i + 200), { ignoreDuplicates: false });
        if (uErr) throw new Error(`${table}: ${uErr.message}`);
      }
    }

    await Promise.all([loadAccounts(), loadCategories(), loadPayees()]);
    populateSelects();
    toast('✅ Snapshot restaurado com sucesso!', 'success');
  } catch (e) {
    toast('Erro ao restaurar: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↩️ Restaurar'; }
  }
}

// ── Excluir backup ────────────────────────────────────────────────────────
async function deleteDbBackup(id) {
  if (!confirm('Excluir este backup?')) return;
  const { error } = await sb.from('app_backups').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Backup excluído', 'success');
  await loadDbBackups();
}

// ── Label personalizado ────────────────────────────────────────────────────
function openDbBackupCreate() {
  const label = prompt('Nome/etiqueta para este backup (opcional):', `Backup — ${new Date().toLocaleDateString('pt-BR')}`);
  if (label === null) return; // cancelou
  createDbBackup(label || '');
}

// ── Hint de migration ─────────────────────────────────────────────────────
function _showDbBackupMigrationHint() {
  const hint = document.getElementById('dbBackupMigrationHint');
  if (hint) hint.style.display = '';
}

// ── Formatação de tempo relativo ──────────────────────────────────────────
function _timeAgo(dt) {
  const diff = (Date.now() - dt.getTime()) / 1000;
  if (diff < 60)     return 'agora mesmo';
  if (diff < 3600)   return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h atrás`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} dias atrás`;
  return dt.toLocaleDateString('pt-BR');
}

// ══════════════════════════════════════════════════════════════════════════
//  SEÇÃO 3 — CLEAR DATABASE
// ══════════════════════════════════════════════════════════════════════════

function confirmClearDatabase() {
  if (!confirm(
    '⚠️ ATENÇÃO: Esta ação irá apagar TODOS os dados!\n\n' +
    '• Todas as transações\n• Todas as contas\n• Todas as categorias\n' +
    '• Todos os beneficiários\n• Todos os orçamentos\n\n' +
    'Esta ação é IRREVERSÍVEL. Deseja continuar?'
  )) return;
  if (!confirm('⛔ SEGUNDA CONFIRMAÇÃO\n\nTODOS os dados serão permanentemente apagados.\nTem ABSOLUTA certeza?')) return;
  showClearDatabasePinConfirm();
}

function showClearDatabasePinConfirm() {
  const pin = prompt('🔐 Digite seu Masterpin para confirmar a limpeza:');
  if (pin === null) return;
  if (pin !== getMasterPin()) { alert('❌ PIN incorreto. Operação cancelada.'); return; }
  executeClearDatabase();
}

async function executeClearDatabase() {
  const btn = document.querySelector('[onclick="confirmClearDatabase()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Limpando...'; }
  try {
    if (!sb || typeof sb.from !== 'function') throw new Error('Supabase não conectado.');
    const tables = [
      'scheduled_occurrences', 'scheduled_transactions', 'transactions',
      'budgets', 'payees', 'categories', 'accounts',
    ];
    const cleared = [], failed = [], skipped = [];
    for (const t of tables) {
      try {
        if (t === 'categories') {
          try { await sb.from('categories').update({ parent_id: null }).not('id', 'is', null); } catch {}
        }
        const { error } = await famQ(sb.from(t).delete()).not('id', 'is', null);
        if (error) {
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('does not exist')) { skipped.push(t); continue; }
          failed.push(t + ': ' + error.message); continue;
        }
        cleared.push(t);
      } catch (e) { failed.push(t + ': ' + e.message); }
    }
    state.accounts = []; state.categories = []; state.payees = [];
    state.transactions = []; state.budgets = [];
    if (state.scheduled) state.scheduled = [];
    state.txTotal = 0; state.txPage = 0;
    populateSelects();
    if (failed.length > 0) {
      alert('⚠️ Limpeza parcial:\n\n• ' + failed.join('\n• '));
      toast('Limpeza parcial — veja detalhes', 'error');
    } else {
      toast('✓ Base de dados limpa! (' + cleared.length + ' tabelas)', 'success');
    }
    document.getElementById('loginScreen').style.display = 'flex';
  } catch (e) {
    toast('Erro ao limpar: ' + (e?.message || e), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚠️ Limpar Tudo'; }
  }
}
