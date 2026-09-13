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
