-- ══════════════════════════════════════════════════════════════
--  Controle Financeiro do Décio — Supabase Schema v2.0
--  Execução: Supabase > SQL Editor > Run
-- ══════════════════════════════════════════════════════════════

-- Extensão para UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUM: tipo de conta ───────────────────────────────────────
CREATE TYPE account_type AS ENUM (
  'credit_card',   -- Cartão de Crédito
  'checking',      -- Conta Corrente
  'cash',          -- Dinheiro
  'investment'     -- Investimentos
);

-- ─── ENUM: tipo de transação ───────────────────────────────────
CREATE TYPE tx_type AS ENUM ('PAID', 'RECEIVED', 'FORECAST');

-- ─── ENUM: status de transação ────────────────────────────────
CREATE TYPE tx_status AS ENUM ('confirmed', 'pending');

-- ══════════════════════════════════════════════════════════════
--  TABELA: accounts (Contas bancárias)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS accounts (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  type        account_type NOT NULL DEFAULT 'checking',
  icon_key    TEXT,        -- chave do ícone da instituição (ex: 'nubank', 'bnp')
  icon_emoji  TEXT,        -- fallback emoji
  color       TEXT,        -- cor hex opcional
  active      BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN accounts.icon_key IS 'Chave do banco: nubank, itau, bradesco, santander, inter, bb, caixa, c6, xp, bnp, ca, sg, lbp, boursorama, revolut, wise';

-- ══════════════════════════════════════════════════════════════
--  TABELA: categories (Categorias com suporte a subcategorias)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS categories (
  id          BIGSERIAL PRIMARY KEY,
  key         TEXT        NOT NULL UNIQUE,
  label       TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '#8E8E93',
  icon_key    TEXT,        -- chave de ícone (emoji ou nome)
  parent_id   BIGINT      REFERENCES categories(id) ON DELETE SET NULL,
  system      BOOLEAN     NOT NULL DEFAULT false,
  sort_order  INT         NOT NULL DEFAULT 0,
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN categories.parent_id IS 'NULL = categoria raiz; preenchido = subcategoria';
COMMENT ON COLUMN categories.icon_key  IS 'Emoji ou chave de ícone personalizado';

-- Índice para busca hierárquica
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- ══════════════════════════════════════════════════════════════
--  TABELA: parties (Beneficiários / Fontes pagadoras)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS parties (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  emoji       TEXT        NOT NULL DEFAULT '👤',
  type        TEXT        NOT NULL DEFAULT 'beneficiary', -- 'beneficiary' | 'payer'
  active      BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN parties.type IS 'beneficiary = quem recebe; payer = fonte pagadora / quem paga';

-- ══════════════════════════════════════════════════════════════
--  TABELA: transactions (Transações financeiras)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS transactions (
  id              BIGSERIAL PRIMARY KEY,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  type            tx_type       NOT NULL DEFAULT 'PAID',
  status          tx_status     NOT NULL DEFAULT 'confirmed',
  date            DATE          NOT NULL,
  category_id     BIGINT        REFERENCES categories(id) ON DELETE SET NULL,
  category_key    TEXT,         -- cache da chave para compatibilidade
  account_id      BIGINT        REFERENCES accounts(id) ON DELETE SET NULL,
  party_id        BIGINT        REFERENCES parties(id) ON DELETE SET NULL,
  party_name      TEXT,         -- fallback texto livre
  notes           TEXT,
  tags            TEXT,
  file_url        TEXT,         -- URL do arquivo no Supabase Storage
  file_name       TEXT,
  file_size       INT,
  file_type       TEXT,
  academic_year   INT           GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)::INT) STORED,
  academic_month  INT           GENERATED ALWAYS AS (EXTRACT(MONTH FROM date)::INT) STORED,
  is_forecast     BOOLEAN       GENERATED ALWAYS AS (type = 'FORECAST') STORED,
  is_late         BOOLEAN       NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_tx_date        ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_year        ON transactions(academic_year);
CREATE INDEX IF NOT EXISTS idx_tx_category    ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_tx_account     ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_tx_party       ON transactions(party_id);
CREATE INDEX IF NOT EXISTS idx_tx_type        ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_year_month  ON transactions(academic_year, academic_month);

-- ══════════════════════════════════════════════════════════════
--  TABELA: ai_files (Comprovantes armazenados)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ai_files (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  size        INT,
  mime_type   TEXT,
  ext         TEXT,
  storage_key TEXT,        -- path no Supabase Storage
  data_b64    TEXT,        -- base64 (fallback para arquivos pequenos)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
--  TRIGGERS: updated_at automático
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER trg_accounts_upd     BEFORE UPDATE ON accounts     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_categories_upd   BEFORE UPDATE ON categories   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_parties_upd      BEFORE UPDATE ON parties      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_transactions_upd BEFORE UPDATE ON transactions  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══════════════════════════════════════════════════════════════
--  VIEW: vw_transactions — join completo para leitura da UI
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW vw_transactions AS
SELECT
  t.id,
  t.amount,
  t.type,
  t.status,
  t.date,
  t.is_late,
  t.is_forecast,
  t.academic_year,
  t.academic_month,
  t.notes,
  t.tags,
  t.file_url,
  t.file_name,
  t.file_size,
  t.created_at,
  t.updated_at,
  -- Categoria
  c.id         AS category_id,
  COALESCE(t.category_key, c.key) AS category_key,
  c.label      AS category_label,
  c.color      AS category_color,
  c.icon_key   AS category_icon,
  cp.key       AS category_parent_key,
  cp.label     AS category_parent_label,
  -- Conta
  a.id         AS account_id,
  a.name       AS account_name,
  a.type       AS account_type,
  a.icon_key   AS account_icon_key,
  a.icon_emoji AS account_icon_emoji,
  -- Beneficiário / Fonte
  p.id         AS party_id,
  COALESCE(p.name, t.party_name) AS party_name,
  p.emoji      AS party_emoji,
  p.type       AS party_type
FROM transactions t
LEFT JOIN categories c  ON c.id = t.category_id
LEFT JOIN categories cp ON cp.id = c.parent_id
LEFT JOIN accounts   a  ON a.id = t.account_id
LEFT JOIN parties    p  ON p.id = t.party_id;

-- ══════════════════════════════════════════════════════════════
--  VIEW: vw_monthly_summary — totais por mês/categoria
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW vw_monthly_summary AS
SELECT
  academic_year,
  academic_month,
  COALESCE(c.key, t.category_key, 'outros') AS category_key,
  c.label      AS category_label,
  c.color      AS category_color,
  t.type,
  COUNT(*)     AS tx_count,
  SUM(t.amount) AS total
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
WHERE t.type != 'FORECAST'
GROUP BY 1,2,3,4,5,6;

-- ══════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS) — ativar quando tiver autenticação
-- ══════════════════════════════════════════════════════════════
-- ALTER TABLE accounts     ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE categories   ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE parties      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE ai_files     ENABLE ROW LEVEL SECURITY;

-- Política básica de acesso público (single-user app sem auth):
-- Descomentar as linhas abaixo para habilitar acesso público anônimo
-- CREATE POLICY "public_all" ON accounts     FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "public_all" ON categories   FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "public_all" ON parties      FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "public_all" ON transactions FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "public_all" ON ai_files     FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  DADOS INICIAIS: Categorias padrão do sistema
-- ══════════════════════════════════════════════════════════════
INSERT INTO categories (key, label, color, icon_key, system, sort_order) VALUES
  ('alimentacao',   'Alimentação',    '#F97316', '🍔',  true,  1),
  ('compras',       'Compras',        '#3B82F6', '🛍️', true,  2),
  ('saude',         'Saúde',          '#EF4444', '🏥',  true,  3),
  ('habitacao',     'Habitação',      '#8B5CF6', '🏠',  true,  4),
  ('lazer',         'Lazer',          '#EC4899', '🎭',  true,  5),
  ('servicos',      'Serviços',       '#14B8A6', '🔧',  true,  6),
  ('tarifas',       'Tarifas',        '#F59E0B', '📱',  true,  7),
  ('impostos',      'Impostos',       '#6366F1', '🏛️', true,  8),
  ('viagens',       'Viagens',        '#06B6D4', '✈️',  true,  9),
  ('criancas',      'Crianças',       '#A855F7', '👶',  true, 10),
  ('reembolsaveis', 'Reembolsáveis',  '#22C55E', '↩️',  true, 11)
ON CONFLICT (key) DO NOTHING;

-- Exemplos de subcategorias (opcional):
-- INSERT INTO categories (key, label, color, icon_key, parent_id, sort_order)
-- SELECT 'restaurantes', 'Restaurantes', '#F97316', '🍽️', id, 1
-- FROM categories WHERE key = 'alimentacao';

-- INSERT INTO categories (key, label, color, icon_key, parent_id, sort_order)
-- SELECT 'supermercado', 'Supermercado', '#FB923C', '🛒', id, 2
-- FROM categories WHERE key = 'alimentacao';

-- ══════════════════════════════════════════════════════════════
--  DADOS INICIAIS: Contas padrão (exemplos)
-- ══════════════════════════════════════════════════════════════
INSERT INTO accounts (name, type, icon_key, icon_emoji, sort_order) VALUES
  ('Nubank',        'checking',    'nubank',    '💜', 1),
  ('Cartão Inter',  'credit_card', 'inter',     '🟠', 2),
  ('Carteira',      'cash',        NULL,        '👜', 3),
  ('BNP Paribas',   'checking',    'bnp',       '🟢', 4),
  ('Boursorama',    'checking',    'boursorama','🔵', 5)
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════
--  FUNÇÃO: busca transações com filtros (para API)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_get_transactions(
  p_year       INT     DEFAULT NULL,
  p_type       TEXT    DEFAULT NULL,
  p_cat_key    TEXT    DEFAULT NULL,
  p_account_id BIGINT  DEFAULT NULL,
  p_search     TEXT    DEFAULT NULL
)
RETURNS SETOF vw_transactions
LANGUAGE sql STABLE AS $$
  SELECT * FROM vw_transactions
  WHERE
    (p_year IS NULL       OR academic_year = p_year)
    AND (p_type IS NULL   OR type::TEXT    = p_type)
    AND (p_cat_key IS NULL OR category_key = p_cat_key)
    AND (p_account_id IS NULL OR account_id = p_account_id)
    AND (p_search IS NULL OR
         notes ILIKE '%' || p_search || '%' OR
         category_label ILIKE '%' || p_search || '%' OR
         party_name ILIKE '%' || p_search || '%' OR
         account_name ILIKE '%' || p_search || '%'
    )
  ORDER BY date DESC, id DESC;
$$;
