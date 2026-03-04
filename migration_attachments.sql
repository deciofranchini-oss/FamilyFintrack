-- ============================================================
-- JF Family FinTrack — Attachment Storage Setup
-- Run this ONCE in your Supabase SQL Editor
-- ============================================================

-- 1. Ensure both attachment columns exist on transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS attachment_url  text;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS attachment_name text;

-- ============================================================
-- 2. Supabase Storage — create the bucket via the Dashboard UI:
--
--    a. Go to: Supabase Dashboard → Storage → New Bucket
--    b. Bucket name:  fintrack-attachments
--    c. Public bucket: YES  (toggle ON)
--    d. Click "Save"
--
-- ============================================================

-- 3. Storage RLS Policies — run these in SQL Editor:
--    These allow any authenticated or anonymous user to
--    read and write to the bucket (adjust if you need stricter access).

-- Allow public READ (needed for displaying images/PDFs in the app)
INSERT INTO storage.buckets (id, name, public)
VALUES ('fintrack-attachments', 'fintrack-attachments', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policy: allow all operations (upload, download, delete)
-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Allow all on fintrack-attachments" ON storage.objects;

CREATE POLICY "Allow all on fintrack-attachments"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'fintrack-attachments')
  WITH CHECK (bucket_id = 'fintrack-attachments');

-- ============================================================
-- DONE.
-- After running this script:
--   • Upload a file in the transaction modal
--   • It should appear immediately in the transaction detail view
--   • Check Supabase → Storage → fintrack-attachments to confirm
-- ============================================================
