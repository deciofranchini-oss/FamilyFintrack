-- ============================================================
-- JF Family FinTrack — Multi-Family Migration
-- Run this script once in your Supabase SQL Editor
-- ============================================================

-- 1. Create the families table
CREATE TABLE IF NOT EXISTS families (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Add family_id to app_users (nullable = admin users with no family see all data)
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES families(id) ON DELETE SET NULL;

-- 3. Add family_id to all data tables
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES families(id) ON DELETE CASCADE;

ALTER TABLE account_groups
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES families(id) ON DELETE CASCADE;

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES families(id) ON DELETE CASCADE;

ALTER TABLE payees
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES families(id) ON DELETE CASCADE;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES families(id) ON DELETE CASCADE;

ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES families(id) ON DELETE CASCADE;

ALTER TABLE scheduled_transactions
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES families(id) ON DELETE CASCADE;

-- 4. Performance indexes
CREATE INDEX IF NOT EXISTS idx_accounts_family           ON accounts(family_id);
CREATE INDEX IF NOT EXISTS idx_account_groups_family     ON account_groups(family_id);
CREATE INDEX IF NOT EXISTS idx_categories_family         ON categories(family_id);
CREATE INDEX IF NOT EXISTS idx_payees_family             ON payees(family_id);
CREATE INDEX IF NOT EXISTS idx_transactions_family       ON transactions(family_id);
CREATE INDEX IF NOT EXISTS idx_budgets_family            ON budgets(family_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_family          ON scheduled_transactions(family_id);
CREATE INDEX IF NOT EXISTS idx_app_users_family          ON app_users(family_id);

-- 5. (Optional) If you already have data and want to assign it to a default family:
-- Step A: Create the default family
-- INSERT INTO families (name, description) VALUES ('Família Principal', 'Família padrão migrada')
-- RETURNING id;
--
-- Step B: Copy the returned UUID below and replace <FAMILY_UUID>
-- UPDATE accounts             SET family_id = '<FAMILY_UUID>' WHERE family_id IS NULL;
-- UPDATE account_groups       SET family_id = '<FAMILY_UUID>' WHERE family_id IS NULL;
-- UPDATE categories           SET family_id = '<FAMILY_UUID>' WHERE family_id IS NULL;
-- UPDATE payees               SET family_id = '<FAMILY_UUID>' WHERE family_id IS NULL;
-- UPDATE transactions         SET family_id = '<FAMILY_UUID>' WHERE family_id IS NULL;
-- UPDATE budgets              SET family_id = '<FAMILY_UUID>' WHERE family_id IS NULL;
-- UPDATE scheduled_transactions SET family_id = '<FAMILY_UUID>' WHERE family_id IS NULL;
--
-- Step C: Assign your admin user to the family too (optional — admins see all)
-- UPDATE app_users SET family_id = '<FAMILY_UUID>' WHERE role = 'admin';

-- ============================================================
-- DONE. The app will now filter all data by family_id.
-- Admin users (role = 'admin') with no family_id see ALL data.
-- ============================================================
