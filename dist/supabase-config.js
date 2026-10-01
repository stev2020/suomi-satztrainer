// Öffentliche Browser-Konfiguration für Supabase.
// Der Publishable Key ist für Browser gedacht. Niemals einen Secret-/service_role-Key hier speichern.
export const SUPABASE_URL = 'https://sjhixmqlpuldwigfwybi.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_F86YKBkUzgh63RDVks2GWQ_gzW3FNIQ';
// Öffentlicher Site Key von Cloudflare Turnstile (Schutz der Registrierung vor Bots).
// Der zugehörige Secret Key liegt nur als Supabase-Secret TURNSTILE_SECRET_KEY auf dem Server.
export const TURNSTILE_SITE_KEY = '0x4AAAAAAFLVAmUovPe5SRhL';
