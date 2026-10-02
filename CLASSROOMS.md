# Klassenräume

Oben in der App **Klassenräume** öffnen. Mit bestehendem Konto anmelden,
einen Raum erstellen oder mit dem 16-stelligen Einladungscode beitreten.
Ersteller sind Lehrkräfte ihres eigenen Raums, Beitretende sind Teilnehmer.

## Ablauf

1. Lehrkraft erstellt einen Raum und teilt den Code.
2. Teilnehmer treten bei; Nutzername und Beiträge sind im Raum sichtbar.
3. Lehrkraft stellt eine Aufgabe mit insgesamt 1–20 Sätzen zusammen. Vorhandene
   Sätze lassen sich nach Level und Grammatikthema filtern. Zusätzlich kann die
   Lehrkraft eigene deutsche Sätze mit der richtigen finnischen Lösung eingeben.
   Ein Abgabetermin ist optional.
   Der Reiter „Eigene Sätze“ öffnet diese Eingabe direkt. Im Reiter „Vorhandene
   Sätze“ können ergänzend einzelne eigene Sätze hinzugefügt werden. Erst
   „Satz hinzufügen“ übernimmt ein Satzpaar sichtbar in die aktuelle Aufgabe.
4. Teilnehmer übersetzen alle Sätze und geben einmal verbindlich ab.
5. Lehrkraft sieht Abgaben mit Namen und noch fehlende Teilnehmer.
6. **Abgaben schließen & Vergleich freigeben** öffnet den Vergleich für die
   Klasse ohne die Namen der Verfasser. Danach keine weiteren Abgaben.
7. Alle können satzbezogene Fragen/Antworten posten und nach der Freigabe
   mit „Hilfreich“, „Interessant“ oder „Gut gemacht“ reagieren.

Die Prozentanzeige bezieht sich auf eingereichte Pakete, nicht auf richtige
Antworten. Es gibt keine automatische Benotung und kein öffentliches Ranking.
Die Satzvorlagen sind bereits im öffentlich herunterladbaren Übungsmaterial
enthalten. Das ist kein manipulationssicheres Prüfungssystem.

## Privatsphäre und Moderation

- Die Mitgliederliste zeigt die Lehrkraft mit „Ersteller“ und die Teilnehmer.
  Alle Raummitglieder können die aktive Liste sehen; entfernte Mitglieder
  erscheinen nur für die Lehrkraft. Die Abgabequote zählt weiterhin nur Schüler.
- Unter jedem Diskussionsbeitrag gibt es „Antworten“. Antworten und weitere
  Unterantworten bleiben ihrem Elternbeitrag und demselben Satz zugeordnet.
  „Neue Diskussion starten“ beginnt einen unabhängigen Diskussionsbaum.
- Beim Entfernen eines Beitrags wird dessen Text durch einen Platzhalter ersetzt;
  Antworten bleiben erhalten. Alte Beiträge ohne Verknüpfung bleiben eigenständige
  Diskussionen; frühere Zusammenhänge werden nicht nachträglich geraten.

- Der persönliche `learning_state` bleibt unverändert und privat.
- Die Lehrkraft sieht Namen und Abgaben. Andere Teilnehmer sehen fremde
  Abgaben erst nach Freigabe und ohne Nutzernamen. Formulierungen können
  trotzdem wiedererkennbar sein; dies ist keine garantierte Anonymisierung.
- Fragen erscheinen mit Nutzernamen. Keine persönlichen Daten posten.
- Die Lehrkraft kann Beiträge löschen, Mitglieder sperren und Codes erneuern.
- Teilnehmer können eigene Beiträge löschen und den Raum verlassen.
  Bisherige Beiträge/Abgaben bleiben beim Verlassen erhalten.
- Archivierung schließt Beitritt und Änderungen; Lesen bleibt möglich.
- Ersteller können unter „Einladung & Mitglieder verwalten“ einen Raum
  endgültig löschen, auch im Archiv. Dafür muss der exakte Raumname eingegeben
  werden. Aufgaben, Abgaben, Fragen, Reaktionen und Mitgliedschaften werden
  unwiderruflich gelöscht; Konten und persönliche Lernstände bleiben erhalten.
- Limits: 10 eigene Räume, 30 Mitgliedschaften, 100 Teilnehmer pro Raum,
  100 Aufgabenpakete pro Raum, 300 Diskussionsbeiträge pro Aufgabe,
  30 Schreib-/Beitrittsaktionen pro Minute und Konto.
- Kein allgemeiner Chat, keine Live-Sitzung und keine Push-Benachrichtigungen.
  Neues zeigt die App selbst an (siehe „Hinweis auf Neues“); **Aktualisieren** lädt sofort.
- Antwortentwürfe liegen auf dem Gerät (`localStorage`, Schlüssel `vanamo-classroom-drafts:<Konto-ID>`), verbindliche Abgaben in Supabase. Entwürfe verschwinden beim Abgeben, nach 60 Tagen und beim Abmelden.
  Gastnutzer können nichts im Klassenraum speichern.

## Architektur

`dist/classrooms.js` verwendet den vorhandenen Login samt Token-Erneuerung.
Die API ist `POST /rest/v1/rpc/classroom_api` mit `action` und `payload`.
Der öffentliche SQL-Wrapper ist SECURITY INVOKER. Die Implementierung liegt
im nicht exponierten Schema `classroom_private` und verwendet SECURITY DEFINER,
weil sie kontrolliert mehrere Tabellen/Benutzer lesen muss. Jede Anfrage prüft
`auth.uid()`, ein vorhandenes Profil, Raumzugehörigkeit und ggf. die Lehrkraftrolle.
Tabellenrechte sind für Browserrollen entzogen; RLS enthält zusätzlich
explizite Deny-Policies. Service-Role-Schlüssel sind nicht im Frontend.

Die Migration unter `supabase/migrations/20260912211313_classroom_system.sql`
enthält die komplette Struktur. Sie wurde im bestehenden Projekt über SQL
angewendet und unter derselben Versionsnummer in der Migrationshistorie erfasst.
Die älteren Migrationen 0001–0003 haben im bestehenden Projekt abweichende
Zeitstempel; vor einem späteren CLI-Push diese historische Zuordnung beachten.

## Tests

Stand Oktober 2026: `npm run test:classrooms` führt die vier Klassenraum-Tests ohne Browser aus (Aufgaben-Matrix, Oberfläche, Stream, Datenbank). Dafür einmalig `npm install --no-save --package-lock=false happy-dom@20.8.4 @electric-sql/pglite@0.5.8`. `node test-classrooms.mjs` klickt die Klassenräume mit Playwright auf Handy- und Desktopbreite durch und startet den lokalen Server selbst; `CLASSROOM_SCREENSHOTS=<Ordner>` speichert von jedem Schritt ein Bild. Alle fünf Tests laufen auch vor jeder Veröffentlichung in GitHub Actions.

- `npm test`: bestehende Grammatik-/Lernfunktionen.
- `supabase/tests/classrooms.sql`: echte Rollen-, Workflow- und Zugriffstests
  innerhalb einer Transaktion mit vollständigem ROLLBACK. Keine dauerhaften
  Testkonten. Als Projekt-Datenbankadministrator ausführen.
- `test-classrooms.mjs`: Playwright-Oberflächentest mit simulierten API-Antworten,
  ausdrücklich kein Ersatz für den Datenbanktest. Benötigt Playwright und Chromium.
  `TEST_BASE_URL` auf den lokalen Server setzen; standardmäßig Port 4173.
- `test-classrooms-dom.mjs`: Formular- und Klickabläufe mit happy-dom (20.8.4),
  optional über `HAPPY_DOM_MODULE` angegeben. Testet Gastzugang, Raum-/Aufgabenanlage,
  Rollenansichten, Abgabe, HTML-Escaping, Fragen, Moderation und Reaktionen.

Validierung der ersten Version: Datenbanktest, vorhandene Grammatiktests,
JavaScript-Syntax und DOM-Abläufe bestanden. Visueller Desktop-/Handytest
konnte in der Build-Umgebung nicht ausgeführt werden (Chromium startet nicht).

Satzdaten einschließlich Herkunft und Lizenz bleiben in Aufgaben erhalten.
Eigene Sätze werden als Bestandteil der Aufgabe gespeichert und als Inhalt der
Lehrkraft gekennzeichnet. Schüler sehen zuerst den deutschen Satz; die richtige
finnische Lösung erscheint nach ihrer Abgabe beziehungsweise nach der Freigabe.
Audio wird weder kopiert noch zusätzlich gespeichert.

## Klassenstream

Der Klassenraum zeigt den gemeinsamen Feed links und „Heute & demnächst“, Mitglieder sowie den gemeinsamen Abgabestand rechts. Unter 850 px stehen diese Bereiche untereinander. Die vorhandenen Farben und Schriften bleiben erhalten.

- Mitglieder können Fragen und Beiträge mit Text und anklickbaren HTTP(S)-Links veröffentlichen. Ankündigungen und angeheftete Beiträge verwaltet die Lehrkraft.
- Alle Mitglieder können antworten. Eine Frage können nur ihr Verfasser und die Lehrkraft als beantwortet markieren oder wieder öffnen.
- Neue Aufgaben erscheinen mit ihrem ursprünglichen Erstellungszeitpunkt automatisch im Feed. Persönliche Lernfortschritte oder namentliche Abschlussmeldungen werden nicht erzeugt.
- Verfasser und Lehrkraft können Beiträge entfernen. Antworten bleiben dabei erhalten. Archivierte Klassenräume bleiben lesbar.
- „Aktualisieren“ lädt den aktuellen Stand. Der Feed lädt 30 Beiträge pro Seite nach; Filter beziehen sich auf die geladenen Beiträge und die Aufgaben des Raums.
- Pro Beitrag sind bis zu drei Anhänge mit jeweils 10 MB möglich: PNG/JPG/WebP, PDF, TXT/CSV, ZIP sowie DOCX/XLSX/PPTX. Bilder lassen sich im Feed ansehen, Dateien herunterladen.
- Entwürfe und Downloads bleiben im Arbeitsspeicher. Nach einem fehlgeschlagenen Upload kann erneut gesendet werden; bestätigte Uploads werden wiederverwendet. Wiederholte Veröffentlichungsanfragen mit derselben ID erzeugen keinen doppelten Beitrag.

### Datenbank und Dateizugriff

Migration: `supabase/migrations/20260913184155_classroom_stream.sql`.

Der private Bucket `classroom-stream` erlaubt ausschließlich reservierte Uploadpfade. Mitgliedschaft und Sperrstatus werden bei jedem Abruf geprüft; es gibt keine öffentlichen oder signierten Downloadlinks. Veröffentlichte Dateien können nicht überschrieben werden. Neue Tabellen sind im privaten Schema mit RLS und ohne direkten Browserzugriff; die bestehenden autorisierten RPCs werden erweitert.

Grenzen: 2.000 Hauptbeiträge pro Raum, 100 Antworten pro Beitrag, 1 GB reservierte Dateigröße pro Raum und 30 offene Dateireservierungen pro Konto. Abgebrochene Entwürfe können vor Verlassen der Seite über „Entfernen“ bereinigt werden. Verwaiste Storage-Objekte nach Neuladen, Kontolöschung oder Raumlöschung müssen administrativ über die Storage-API bereinigt werden; ihre Zugriffserlaubnis entfällt sofort. Die Migration löscht keine vorhandenen Klasseninhalte.

### Prüfung dieser Erweiterung

- `node test-classroom-stream.mjs` (benötigt `happy-dom`, alternativ `HAPPY_DOM_MODULE`): Feed, Links und Escaping, Fragen/Antworten, Statusrechte, Filter, Entwürfe, Uploadfehler mit Wiederholung, Anhänge und Archivansicht.
- `node test-classrooms-dom.mjs`: bestehende Aufgaben, eigene Sätze, Abgaben, Satzdiskussionen und Raumverwaltung.
- `supabase/tests/classroom_stream.sql`: Transaktion mit Rollback; Mitgliedschaft, Rechte, Idempotenz, Uploadreservierung, Storage-RLS, Sperren und Archivierung.
- Die neue Datenbankmigration und beide DOM-Suiten wurden erfolgreich geprüft. Die visuelle Browserprüfung war in der Ausführungsumgebung wegen gesperrter lokaler Vorschau nicht möglich.
- Der vorhandene allgemeine Grammatiktest scheitert bereits mit dem unveränderten Stand an seinem veralteten DOM-Mock (`document.querySelector` fehlt); dieser Test wurde nicht inhaltlich verändert.

### Antworten auf Antworten

Auch jede einzelne Stream-Antwort besitzt einen Antworten-Button. `reply_to_id` hält den direkten Bezug fest, während `parent_id` weiterhin den ursprünglichen Beitrag bezeichnet. Dadurch bleiben Seitennavigation und das Limit von 100 Antworten pro Unterhaltung erhalten. Die Anzeige verschachtelt Antworten und nennt den jeweiligen Adressaten; auf schmalen Bildschirmen wird die Einrückung begrenzt. Bestehende Antworten bleiben unverändert. Migration: `20260913185859_classroom_stream_reply_targets.sql`. Die DOM- und SQL-Tests prüfen zusätzlich zwei weitere Antwortebenen.

Die Beitragsbox ist standardmäßig eingeklappt. Ein nativer Aufklapppfeil und „Frage oder Beitrag erstellen · Aufklappen“ kennzeichnen den klickbaren Bereich. Beim Einklappen bleibt der Entwurf erhalten.

## Weitere Lehrkräfte

Der Ersteller kann in **Unsere Klasse → Mitglieder** aktive Teilnehmer mit **Zur Lehrkraft machen** ernennen und die Rolle mit **Lehrkraftrolle entziehen** wieder zurücknehmen. Die Rolle gilt ausschließlich für diesen Raum. Lehrkräfte können Aufgaben erstellen und freigeben, Abgaben einsehen und Beiträge moderieren. Nur der Ersteller kann Rollen und Mitglieder verwalten, Einladungscodes ändern sowie den Raum archivieren oder löschen. Zusätzliche Lehrkräfte können den Raum verlassen.

Lehrkräfte zählen nicht zu den erwarteten Teilnehmerabgaben. Bereits abgegebene Antworten bleiben bei Rollenwechseln erhalten. Entfernte Mitglieder verlieren sofort sämtliche Raumrechte; archivierte Räume erlauben keine Rollenänderung.

Aktivierung: zuerst `supabase/migrations/20260914063059_classroom_teacher_roles.sql` anwenden, danach das Frontend veröffentlichen. Die Migration wurde am 14.09.2026 nach Nutzerfreigabe auf dem Live-Projekt angewendet. Der transaktionale Integrationstest für Lehrkraftrollen wurde dort erfolgreich ausgeführt; sämtliche Testdaten wurden zurückgerollt.

Regression: `node test-classroom-db.mjs` mit `@electric-sql/pglite` (oder `PGLITE_MODULE` auf dessen Moduldatei setzen) prüft die echten Migrationen und SQL-Berechtigungen in einer lokalen PostgreSQL-Instanz; lediglich die Supabase-Systemschemas Auth/Storage sind nachgebildet. Die Oberflächentests `test-classrooms-dom.mjs` und `test-classroom-stream.mjs` benötigen `happy-dom` oder `HAPPY_DOM_MODULE`.

## Namen pro Klassenraum

Beim Erstellen und Beitreten ist `display_name` Pflicht (1–80 Zeichen, äußere Leerzeichen werden entfernt). Der eigene Eintrag in der Mitgliederliste öffnet ein Formular zum Ändern über `rename`. Die Änderung gilt auch in archivierten Räumen und ausschließlich für `auth.uid()` im angegebenen Raum.

Die private Tabelle `display_names` speichert Namen getrennt von `profiles.username`. Bestehende Namen werden bei der Migration übernommen. Stream, Antworten, Aufgabenfragen und benannte Abgaben verwenden den aktuellen Raumnamen. Namen bleiben nach dem Verlassen für alte Beiträge erhalten und werden beim Löschen des Raums mit entfernt. Abgaben werden über Benutzer-IDs statt über möglicherweise identische Namen zugeordnet; anonymisierte Vergleiche bleiben anonymisiert.

Rollout: Migration `classroom_display_names` vor dem Frontend aktivieren. Tests: `test-classroom-db.mjs` (mit PGlite) und `test-classrooms-dom.mjs` (mit Happy DOM).

## Aufgaben bearbeiten und löschen

In der Aufgabenansicht stehen **Aufgabe bearbeiten** und **Aufgabe löschen**. Beides dürfen die Lehrkraft, die die Aufgabe erstellt hat, und der Ersteller des Raums; in archivierten Räumen geht beides nicht.

- Titel und Abgabetermin lassen sich immer ändern.
- Die Sätze lassen sich nur ändern, solange es keine Abgaben und keine Fragen gibt und der Vergleich nicht freigegeben ist, weil Antworten und Fragen sich über die Position auf einen Satz beziehen. Eigene Sätze kann man korrigieren, vorhandene Sätze nur entfernen; neue Sätze kommen über eine neue Aufgabe dazu.
- Löschen entfernt die Aufgabe mit allen Abgaben, Fragen und Reaktionen unwiderruflich.

API: `update_assignment` (`assignment_id`, `title`, `due_at`, optional `items`) und `delete_assignment` (`assignment_id`). `room` liefert je Aufgabe `can_manage`, `items_locked` und `created_at`. Ohne die Migration fehlen diese Felder, dann zeigt die Oberfläche die beiden Knöpfe nicht.

Rollout: zuerst `supabase/migrations/20261002130000_classroom_assignment_edit.sql` anwenden, danach das Frontend veröffentlichen. Tests: `supabase/tests/classroom_assignment_edit.sql` (läuft in `test-classroom-db.mjs` mit), `test-classroom-assignment-ui.mjs` und `test-classrooms.mjs`.

## Rückmeldung zu Abgaben

- **Vergleich mit der Vorlage:** Nach der Abgabe sieht man unter jedem Satz, wo die eigene Antwort von der Vorlage abweicht (dieselbe Auswertung wie beim Üben, `translation-feedback.mjs`). Das ist keine Benotung; andere Formulierungen können richtig sein. Die Auswertung läuft im Browser, gespeichert wird nichts.
- **Kommentar der Lehrkraft:** In der Abgabenübersicht kann die Lehrkraft, die die Aufgabe erstellt hat, oder der Ersteller des Raums zu jedem Satz einer Abgabe einen Kommentar schreiben (höchstens 1000 Zeichen, einer je Satz; leer speichern löscht ihn). Den Kommentar sieht nur, wer die Abgabe eingereicht hat – im freigegebenen Vergleich erscheint er nicht. In archivierten Räumen bleiben Kommentare lesbar, aber nicht änderbar.

API: `feedback` (`assignment_id`, `submission_id`, `item_index`, `body`). `room` liefert je Abgabe `feedback` als Liste aus `item_index`, `body`, `author`, `updated_at`. Tabelle `classroom_private.feedback`, ohne direkten Browserzugriff; Kommentare werden mit der Abgabe, der Aufgabe, dem Raum und dem Konto der Lehrkraft gelöscht.

Rollout: zuerst `supabase/migrations/20261002150000_classroom_feedback.sql` anwenden, danach das Frontend veröffentlichen. Tests: `supabase/tests/classroom_feedback.sql`, `test-classroom-assignment-ui.mjs`, `test-classrooms.mjs`.

## Hinweis auf Neues

- Am Knopf **Klassenräume** steht die Zahl der Räume, in denen es etwas Neues gibt. In der Raumliste tragen diese Räume „Neu“, dazu steht bei Teilnehmern die Zahl der offenen Aufgaben. Neue Antworten unter einem Beitrag zeigt „Neu“ an der Zeile „n Antworten“ an; die Antworten bleiben zugeklappt, nach dem Aufklappen trägt jede neue Antwort „Neu“. Im Raum tragen neue Beiträge und Aufgaben mit Neuem (neue Aufgabe, Frage, Abgabe für die Lehrkraft, Kommentar zur eigenen Abgabe) „Neu“, bis man den Raum das nächste Mal lädt.
- Neu ist, was jemand anderes getan hat; eigene Beiträge zählen nicht. Was ein Gerät schon gezeigt hat, merkt es sich je Konto in `localStorage` (`vanamo-classroom-seen:<Konto-ID>`). Der Stand gilt also pro Gerät; ein Raum, den ein Gerät zum ersten Mal sieht, gilt als gesehen.
- Die App fragt beim Start, bei der Rückkehr in den Tab (höchstens einmal pro Minute) und alle fünf Minuten nach. Bei der Rückkehr in den Tab lädt ein geöffneter Raum von selbst neu, wenn der letzte Stand älter als eine Minute ist und gerade nichts geschrieben wird.

API: `list` liefert je Raum `open_tasks` und `activity`. Ohne die Migration fehlen beide Felder, dann gibt es keine Hinweise.

Rollout: zuerst `supabase/migrations/20261002170000_classroom_activity.sql` anwenden, danach das Frontend veröffentlichen. Tests: `supabase/tests/classroom_activity.sql`, `test-classrooms.mjs`.
