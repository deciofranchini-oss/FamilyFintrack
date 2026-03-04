-- migration_v_pending_confirm_and_autoconfirm.sql
-- 1) Ensure transactions.status exists and defaults to confirmed
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS status character varying DEFAULT 'confirmed';

UPDATE public.transactions
SET status = 'confirmed'
WHERE status IS NULL OR status = '';

-- 2) Add auto_confirm to scheduled_transactions
ALTER TABLE public.scheduled_transactions
  ADD COLUMN IF NOT EXISTS auto_confirm boolean DEFAULT true;

UPDATE public.scheduled_transactions
SET auto_confirm = true
WHERE auto_confirm IS NULL;
