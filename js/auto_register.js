const AUTO_CHECK_CONFIG_KEY = 'fintrack_auto_check_config';
let _autoCheckTimer = null;

// Default config
const AUTO_CHECK_DEFAULTS = {
  enabled: false,
  intervalMinutes: 60,
  daysAhead: 0,
  emailDefault: '',
  method: 'browser',
  lastRun: null,
  lastRunCount: 0,
};

function getAutoCheckConfig() {
  try {
    const raw = localStorage.getItem(AUTO_CHECK_CONFIG_KEY);
    return raw ? { ...AUTO_CHECK_DEFAULTS, ...JSON.parse(raw) } : { ...AUTO_CHECK_DEFAULTS };
  } catch { return { ...AUTO_CHECK_DEFAULTS }; }
}

async function saveAutoCheckConfig() {
  const cfg = {
    enabled: document.getElementById('autoCheckEnabled')?.checked || false,
    intervalMinutes: parseInt(document.getElementById('autoCheckInterval')?.value||'60'),
    daysAhead: parseInt(document.getElementById('autoCheckDaysAhead')?.value||'0'),
    emailDefault: document.getElementById('autoCheckEmailDefault')?.value.trim()||'',
    method: document.getElementById('autoCheckMethod')?.value||'browser',
  };
  // Preserve non-form fields
  const current = getAutoCheckConfig();
  const merged = { ...current, ...cfg };
  localStorage.setItem(AUTO_CHECK_CONFIG_KEY, JSON.stringify(merged));
  await saveAppSetting(AUTO_CHECK_CONFIG_KEY, merged);
  applyAutoCheckTimer(merged);
  updateAutoCheckUI(merged);
  toast('Configuração de automação salva', 'success');
}

function loadAutoCheckConfig() {
  const cfg = getAutoCheckConfig();
  const enEl = document.getElementById('autoCheckEnabled');
  const intEl = document.getElementById('autoCheckInterval');
  const dayEl = document.getElementById('autoCheckDaysAhead');
  const emEl  = document.getElementById('autoCheckEmailDefault');
  const mEl   = document.getElementById('autoCheckMethod');
  if(enEl) enEl.checked = cfg.enabled;
  if(intEl) intEl.value = cfg.intervalMinutes;
  if(dayEl) dayEl.value = cfg.daysAhead;
  if(emEl)  emEl.value  = cfg.emailDefault;
  if(mEl)   mEl.value   = cfg.method;
  updateAutoCheckUI(cfg);
  applyAutoCheckTimer(cfg);
}

function updateAutoCheckUI(cfg) {
  // Toggle visual
  const chk = document.getElementById('autoCheckEnabled');
  const tog = document.getElementById('autoCheckToggle');
  if(tog) {
    tog.style.background = cfg.enabled ? 'var(--accent)' : '#ccc';
    // Move knob
    const before = document.createElement('style');
    before.id = 'tog-style';
    document.getElementById('tog-style')?.remove();
    before.textContent = `#autoCheckToggle::before{transform:translateX(${cfg.enabled?20:0}px)}`;
    document.head.appendChild(before);
  }
  // Method info
  onAutoCheckMethodChange();
  // Last run
  const lrEl = document.getElementById('autoCheckLastRun');
  if(lrEl) {
    if(cfg.lastRun) {
      const d = new Date(cfg.lastRun);
      lrEl.textContent = `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} — ${cfg.lastRunCount||0} transação(ões) registrada(s)`;
    } else {
      lrEl.textContent = 'Nunca executada';
    }
  }
}

function onAutoCheckMethodChange() {
  const method = document.getElementById('autoCheckMethod')?.value || 'browser';
  const infoEl = document.getElementById('autoCheckSupabaseInfo');
  const subEl  = document.getElementById('autoCheckMethodSub');
  const sqlEl  = document.getElementById('autoCheckSqlCode');

  const descriptions = {
    browser: 'O navegador executa a verificação periodicamente enquanto o app estiver aberto',
    supabase_cron: 'Supabase pg_cron — executa via banco de dados, mesmo com app fechado (requer extensão pg_cron)',
    supabase_edge: 'Supabase Edge Function — executa via função serverless, requer deploy manual',
  };
  if(subEl) subEl.textContent = descriptions[method] || '';

  if(infoEl) {
    infoEl.style.display = (method === 'browser') ? 'none' : '';
    if(method === 'supabase_cron' && sqlEl) {
      const intervalCfg = document.getElementById('autoCheckInterval')?.value || '60';
      const cronExpr = getCronExpression(parseInt(intervalCfg));
      sqlEl.textContent = getSupabaseCronSql(cronExpr);
    } else if(method === 'supabase_edge' && sqlEl) {
      sqlEl.textContent = getSupabaseEdgeSql();
    }
  }
}

function getCronExpression(minutes) {
  if(minutes < 60) return `*/${minutes} * * * *`;
  const hours = Math.floor(minutes/60);
  if(hours === 1) return '0 * * * *';
  if(hours < 24) return `0 */${hours} * * *`;
  return '0 8 * * *'; // daily at 8am
}

function getSupabaseCronSql(cronExpr) {
  return `-- Execute no SQL Editor do Supabase
-- Requer extensão pg_cron habilitada

-- 1. Habilitar extensão (se ainda não estiver)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Criar função que registra transações automáticas
CREATE OR REPLACE FUNCTION public.auto_register_scheduled_transactions()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_sc RECORD;
  v_next_date DATE;
BEGIN
  -- Buscar todos os programados ativos com auto_register=true
  FOR v_sc IN
    SELECT st.*, a.id as acc_id
    FROM scheduled_transactions st
    JOIN accounts a ON a.id = st.account_id
    WHERE st.status = 'active'
      AND st.auto_register = true
  LOOP
    -- Calcular próximas datas até hoje
    v_next_date := v_sc.start_date;
    WHILE v_next_date <= CURRENT_DATE LOOP
      -- Verificar se já foi registrada
      IF NOT EXISTS (
        SELECT 1 FROM scheduled_occurrences
        WHERE scheduled_id = v_sc.id
          AND scheduled_date = v_next_date
          AND transaction_id IS NOT NULL
      ) THEN
        -- Registrar a transação
        INSERT INTO transactions (
          account_id, description, amount, date,
          category_id, payee_id, memo, is_transfer
        ) VALUES (
          v_sc.account_id, v_sc.description, v_sc.amount, v_next_date,
          v_sc.category_id, v_sc.payee_id, v_sc.memo, false
        );

        -- Marcar ocorrência como registrada
        INSERT INTO scheduled_occurrences
          (scheduled_id, scheduled_date, actual_date, amount, transaction_id)
        VALUES (
          v_sc.id, v_next_date, CURRENT_DATE, v_sc.amount,
          (SELECT id FROM transactions WHERE account_id=v_sc.account_id
           AND date=v_next_date AND description=v_sc.description
           ORDER BY created_at DESC LIMIT 1)
        );

        -- Atualizar saldo da conta
        UPDATE accounts SET balance = balance + v_sc.amount
        WHERE id = v_sc.account_id;

        v_count := v_count + 1;
      END IF;

      -- Calcular próxima data baseada na frequência
      v_next_date := CASE v_sc.frequency
        WHEN 'once'       THEN v_next_date + INTERVAL '99 years'
        WHEN 'weekly'     THEN v_next_date + INTERVAL '7 days'
        WHEN 'biweekly'   THEN v_next_date + INTERVAL '14 days'
        WHEN 'monthly'    THEN v_next_date + INTERVAL '1 month'
        WHEN 'bimonthly'  THEN v_next_date + INTERVAL '2 months'
        WHEN 'quarterly'  THEN v_next_date + INTERVAL '3 months'
        WHEN 'semiannual' THEN v_next_date + INTERVAL '6 months'
        WHEN 'annual'     THEN v_next_date + INTERVAL '1 year'
        ELSE v_next_date + INTERVAL '99 years'
      END;
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 3. Agendar execução com pg_cron
SELECT cron.schedule(
  'fintrack-auto-register',  -- nome do job
  '${cronExpr}',             -- expressão cron
  $$SELECT public.auto_register_scheduled_transactions()$$
);

-- 4. Verificar jobs agendados:
-- SELECT * FROM cron.job;

-- 5. Para remover o job:
-- SELECT cron.unschedule('fintrack-auto-register');`;
}

function getSupabaseEdgeSql() {
  return `/* Deploy esta Edge Function no Supabase:
supabase functions new auto-register
supabase functions deploy auto-register

Arquivo: supabase/functions/auto-register/index.ts */
