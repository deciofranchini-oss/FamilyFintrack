// Family FinTrack - Supabase connection bundle
// Central configuration to avoid reconfiguring on each device.
// WARNING: This is a public anon key. Keep RLS enabled.

window.FINTRACK_SUPABASE = {
  url: "https://wkiytjwuztnytygpxooe.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndraXl0and1enRueXR5Z3B4b29lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODc3NzUsImV4cCI6MjA4Nzg2Mzc3NX0.Z3fyYRDobzarCEdqkobTjQQd1J9HAUR2CCdnBbLC0QA"
};

// Backward-compatible aliases used by the app:
window.SUPABASE_URL = window.FINTRACK_SUPABASE.url;
window.SUPABASE_ANON_KEY = window.FINTRACK_SUPABASE.anonKey;
