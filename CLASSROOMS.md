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
- Kein allgemeiner Chat, keine Live-Sitzung und keine Benachrichtigungen
  in dieser ersten Version. Änderungen mit **Aktualisieren** laden.
- Antwortentwürfe nur im Arbeitsspeicher, verbindliche Abgaben in Supabase.
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
