# Supabase-Einrichtung für Nutzerkonten

Die App bleibt auf GitHub Pages. Supabase übernimmt nur Anmeldung, Wiederherstellung und Synchronisierung des Lernstands.

## 1. Datenbank
Die Migration `supabase/migrations/0001_user_accounts.sql` auf das Supabase-Projekt anwenden.

## 2. Edge Functions
Die Funktionen `register` und `recover` aus `supabase/functions/` deployen.
In `supabase/config.toml` ist für beide `verify_jwt = false` gesetzt, weil Registrierung und Wiederherstellung vor dem Login erreichbar sein müssen.

## 3. Browser-Konfiguration
In `dist/supabase-config.js` eintragen:
- Project URL
- anon/publishable key

Der anon/publishable key ist für Browser-Apps gedacht. Der `service_role`-Key ist geheim und darf niemals in `dist/` oder GitHub Pages landen.

## 4. Nutzerablauf
- Registrierung: Benutzername + Passwort, keine echte E-Mail-Adresse
- intern nutzt Supabase Auth eine rein technische Adresse
- Recovery-Code wird nur bei Registrierung bzw. nach erfolgreicher Passwort-Wiederherstellung angezeigt
- gespeichert wird nur der SHA-256-Hash des Recovery-Codes
- normaler Login: Benutzername + Passwort
- nach Recovery wird der alte Code ungültig und ein neuer ausgegeben
- der Lernstand bleibt weiterhin lokal gespeichert und wird bei angemeldeten Nutzern zusätzlich synchronisiert

## 5. Vor größerer öffentlicher Nutzung
Für offene Registrierung sollte zusätzlich Rate-Limiting oder CAPTCHA/Turnstile ergänzt werden, um automatisierte Massenregistrierungen zu begrenzen.

## 6. Freiwillige E-Mail-Adresse (Passwort zurücksetzen)
- Migration `supabase/migrations/20261008220000_account_emails.sql` anwenden.
- Edge Function `account-email` deployen (`verify_jwt = false`: Bestätigungs- und Zurücksetz-Links funktionieren ohne Anmeldung; die Konto-Aktionen prüfen das Anmeldetoken selbst).
- Secret `LETTERMINT_API_TOKEN` setzen (Projekt-Token von Lettermint, lettermint.co). Optional: `MAIL_FROM` (Standard `Vanamo <noreply@vanamo.app>`) und `SITE_URL` (Standard `https://vanamo.app`).
- Die Absender-Domain muss bei Lettermint bestätigt sein (DNS-Einträge bei Cloudflare).
- Ein anderer Versanddienst braucht nur eine neue `sendMail()` in `supabase/functions/account-email/index.ts`.

## 7. Passwort im Konto ändern
- Edge Function `change-password` deployen (`verify_jwt = true`). Sie prüft das aktuelle Passwort, das neue gegen bekannte Datenlecks und beendet danach alle Anmeldungen.
