# Suomi-Satztrainer

Ein Finnisch-Deutsch-Satztrainer als statische Website, ohne Konto und ohne Server-Datenbank.

- 4.467 aktive Sätze in sechs geschätzten Schwierigkeitsstufen, darunter 300 Sätze in Level 1.
- Übersetzen in beide Richtungen, Hörmodus, Diktat und Schreibtest.
- Grammatik nach Themen sowie satzgebundene Grammatikhilfen.
- Favoriten, Wiederholungsplanung und Sicherung des lokalen Lernstands.
- 4.115 verknüpfte finnische Originalaufnahmen mit bestätigter Lizenz.
- Audio bleibt online bei Tatoeba und ist nicht in diesem Repository enthalten.
- Quellen, Mitwirkende und Lizenzen werden an den jeweiligen Sätzen angezeigt.

`dist/` enthält die fertige Website. Ein Build-Schritt ist nicht erforderlich.

## Auf GitHub Pages veröffentlichen

Dieses Repository enthält einen fertigen GitHub-Actions-Workflow. Nach dem Hochladen:

1. Öffne im Repository **Settings → Pages**.
2. Wähle unter **Build and deployment → Source** den Eintrag **GitHub Actions**.
3. Öffne den Reiter **Actions** und den Lauf **Deploy Suomi-Satztrainer to GitHub Pages**.
4. Nach erfolgreichem Abschluss steht die Website unter `https://DEIN-NAME.github.io/suomi-satztrainer/` bereit.

Jeder Push auf den Branch `main` veröffentlicht den Inhalt von `dist/` erneut. Der Lernstand bleibt jeweils im verwendeten Browser gespeichert. Die Audiowiedergabe benötigt eine Internetverbindung zu Tatoeba.

## Data

The current deck is rebuilt with `python build_audio_deck.py`. It reads the immutable
400-card baseline in `sources/baseline-deck.json`, the refreshed source records in
`sources/audio-candidates.json`, and German adaptations in `sources/english-to-german.tsv`.
`prepare_data.py` is the legacy baseline generator and should not overwrite the current deck.
The original, unmodified baseline records remain in `sources/tatoeba-snapshot.json`.
The first import used `/v1/sentences`, with Finnish language, direct German
translation, non-orphan and non-unapproved filters and `include=audios`.
Retrieved on 2026-09-09 and expanded on 2026-09-10. This is a bounded starter selection, not the full corpus.
Level assignments are estimates, not official CEFR certification or native-speaker review.

Text licenses and contributors are recorded per sentence. Finnish audio includes
CC BY-NC 4.0 contributions by Orava and is used for this personal learning app.
Do not repurpose NC audio for commercial use without permission or replacing it.
Tatoeba-supplied audio download URLs should be checked when refreshing the data.

## Persistence

`suomi-learning-v1` stores reviews, favorites, daily practice count and preferences.
The record key is the Finnish sentence ID plus study direction. `again` is due now
and is reinserted after two cards when available; `hard` is due in one day; `easy`
is due in three days initially, then 2.5 times the prior interval (up to 180 days).
Clearing browser data removes progress. There is no cross-device synchronization.

## Audio-first refresh (2026-09-10)

- 400 active cards, 100 per level; 321 have licensed Finnish audio (previously 95).
- 201 German texts were created with AI from a directly linked English Tatoeba
  translation, and retain that exact English sentence, ID, contributor and license.
  They are clearly marked as app adaptations, never as German Tatoeba contributions.
- Newly selected audio cards use native German when available. New-card sessions
  prioritize audio with native German, then audio with adapted German, then no audio.
  Due reviews retain their usual scheduling.
- All 400 previous cards survive unchanged in either active or archived records.
  Archived cards do not enter new sessions, but remain eligible for due reviews
  and favorites. Browser storage keys and card identifiers are unchanged.
- The source scan queried Finnish audio with direct German OR English translations,
  excluding unapproved/orphan records, in word-count bands 1–2, 3, 4, and 5–8.
  The 803 retained source records also include the previous full German audio scan.
  This is a curated expansion, not a claim to exhaust every Finnish recording.
- German adaptations were checked against the Finnish and English text. Clearly
  mismatched pairs and unsuitable difficulty/colloquial forms were omitted. Level
  classifications remain estimates and were not certified by a language examiner.

## Hörmodus und Diktat
Die Übungsart wählt Übersetzen, Hörmodus oder Diktat. Hörübungen enthalten ausschließlich Sätze mit finnischer Aufnahme und verbergen Text, Übersetzung und Quellen bis zum Aufdecken. Wiederholen startet von vorne; Tempo 1, 0,75 oder 0,5 bleibt gespeichert. Diktate vergleichen Zeichen mit Levenshtein-Ausrichtung und markieren fehlende/abweichende Buchstaben, einschließlich ä/ö und Doppelbuchstaben. Der Vergleich ignoriert Großschreibung, Satzzeichen und zusätzliche Leerzeichen. Alle Eingaben werden vor HTML-Ausgabe escaped. Die Bewertung bleibt eine Selbsteinschätzung. Fortschritt wird getrennt als `id:listen` und `id:dictation` gespeichert; bestehende Übersetzungsrichtungen bleiben erhalten.

## Satzgebundene Grammatikhilfe
`build_grammar.py` erzeugt `dist/grammar.json` aus expliziten Wort-/Phrasenlisten und `sources/grammar-specific.tsv`. Keine Ableitung von Fällen allein aus beliebigen Wortendungen. Alle 400 aktiven Sätze haben bis zu drei deutschsprachige Hinweise; auch passende Archivkarten werden erfasst. Exakte Satztexte werden mitgespeichert, damit geänderte Inhalte keine veralteten Hinweise erhalten. Die Hinweise sind KI-formulierte Lernhilfen, keine vollständige linguistische Annotation. Referenz zum Nachlesen: https://uusikielemme.fi/finnish-grammar (Partitiv, Konditional, Besitzkonstruktion, Perfekt, negative Vergangenheit und dritter Infinitiv überprüft). Die Grammatikhilfe erscheint ausschließlich nach dem Aufdecken in allen Übungsarten, wird unabhängig von Satzdaten geladen und im Service Worker gecacht. Fehler beim Laden blockieren die Übungen nicht. Fortschritts- und Audiodaten bleiben unverändert.

## Vollständiger Audioimport (11. September 2026)
`build_full_deck.py` ist der maßgebliche Rebuild für den erweiterten Bestand. Er nutzt `sources/full-audio-candidates.json` aus den Tatoeba-Wochenexporten vom 5. September 2026 (Finnisch/Deutsch/Englisch: detailed TSV; links; sentences_with_audio) und die Bestandsprüfung vom 10. September. Alle 4.253 finnischen Audio-Satz-IDs sind aufgenommen. 4.115 lizenzierte Aufnahmen von Orava (CC BY-NC 4.0) sind verknüpft; die 138 ohne Lizenz von nyymi sind als `license_missing` markiert und werden nicht abgespielt. Zusätzlich bleiben 72 bisherige aktive Sätze und 226 Archivkarten erhalten: 4.325 aktive Karten.

Deutsche Übersetzung: bestehende Entscheidungen beibehalten, sonst direkte deutsche Verknüpfung; dann originale deutsche Tatoeba-Fassung über zwei direkte Kanten Finnisch → Englisch → Deutsch. Dieser indirekte Weg ist ausdrücklich gekennzeichnet; semantische Gleichheit ist nicht garantiert. `link_path` und englischer Quellsatz belegen die Verbindung. Bei fehlender deutscher Fassung enthalten 1.363 neue Zeilen in `sources/import-german.tsv` KI-Übersetzungen, am finnischen Satz abgeglichen. Für die 29 ohne Englischquelle wurde aus Finnisch übersetzt; andere direkt verknüpfte Sprachfassungen sind als Querverweise enthalten. Beispielhafte erkannte Fehler in englischen Vorlagen (has/is a problem, need/do not need, Gegenwart/Vergangenheit) wurden in diesen neuen Fassungen nicht übernommen. Kein TTS oder Speech-to-Text-Dienst aufgerufen.

`level_import.py` ordnet neue Karten vorläufig in Level 1–6 ein: begrenzter Grundwortschatz, Alltag, Vergangenheit/erweiterter Wortschatz, komplexere Verbformen/Nebensätze, Umgangssprache/abstrakter Wortschatz, verdichtete oder mehrteilige Satzstrukturen. Dies ist eine heuristische Schätzung, keine geprüfte CEFR-Zuordnung; keine feste Anzahl pro Level. Bisherige 626 aktive/archivierte Karten behalten ID, Text, Übersetzung und Level. Die ursprünglichen Grammatikhilfen bleiben erhalten; noch nicht annotierte Importkarten melden das ausdrücklich.

Geprüft: Vollständigkeit aller 4.253 Quell-IDs, exakte finnische Texte, deutsche Fassung jeder aktiven Karte, keine doppelten IDs über Aktiv/Archiv, Level 1–6, Erhalt aller bisherigen Karten, Audio-Lizenzausschluss, Quellenanzeige für direkte/indirekte/KI-Fassungen, Lernrichtungen, Hörmodus/Diktat, Wiederholen und Favoriten.

## Auswahl per Buttons und zufällige Lernrichtung
Übungsart und Lernrichtung sind beschriftete Dreiergruppen mit Tastaturbedienung und `aria-pressed`. „Zufällig“ wählt je Karte unter den noch neuen bzw. fälligen Richtungen; Favoriten erlauben beide. Die zugewiesene Richtung bleibt für Aufdecken und „Nochmal“ stabil. Bewertungen nutzen weiterhin `id:fi-de` oder `id:de-fi`; es gibt keinen getrennten Zufalls-Lernstand. Zähler zählen geeignete Sätze einmal, auch wenn beide Richtungen verfügbar sind. Auswahl und bestehende Fortschritte bleiben gespeichert.

## Grammatikhilfen für den vollständigen Bestand (11. September 2026)
`python build_import_grammar.py` (auch über `python build_grammar.py`) baut die vollständige Grammatikhilfe: 4.325 aktive Sätze plus 226 Archivkarten, insgesamt 4.551 Karten. Jede Karte hat ein bis drei deutschsprachige Hinweise. Die 571 zuvor vorhandenen Datensätze werden aus `sources/grammar-baseline.json` unverändert übernommen; 3.980 weitere Karten erhalten Hinweise.

Die Ergänzungen stehen in `grammar-import-rules.tsv`, expliziten Verbparadigmen und `grammar-extra-verbs.tsv` unter `sources/`. Es werden ganze Wörter und ausgewählte Wortgruppen abgeglichen, keine unbekannten Endungen als Fälle erraten. `grammar-import-specific.tsv` enthält vollständige, vorrangige Hinweise für bestimmte Satz-IDs, insbesondere Redewendungen, gesprochene Verschmelzungen, mehrdeutige Formen und komplexe Partizip-/Infinitivkonstruktionen. Diese Hinweise werden nicht durch allgemeine Treffer ergänzt. Der Generator bricht bei fehlenden Hinweisen ab, statt unvollständige Daten auszugeben. Hinweise erklären ausgewählte Aspekte; sie sind keine vollständige syntaktische Analyse oder fachlich zertifizierte Prüfung.

Kontrollierte Beispiele: „Näin on näppylät“ als Redewendung statt Vergangenheitsverb; „Eksä muista?“ als negative Frage statt Aufforderung; „Ruokin“ mit gleicher Präsens-/Vergangenheitsform; „Siirretään sohva/sohvaa“ mit unterschiedlichem Objektfall; sämtliche 19 Level-6-Sätze mit Hinweisen zu den jeweiligen fortgeschrittenen Konstruktionen. Ein Schreibfehler der Quelle in „OIet“ wird erklärt, der Satztext bleibt unverändert. Satzdaten, Übersetzungen, Audio-Links, Levels und gespeicherte Fortschritts-Schlüssel werden nicht geändert.

Die Grammatik erscheint nach dem Aufdecken in Übersetzen, Hörmodus und Diktat; exakte Satzbindung und Offline-Cache bleiben erhalten. Die Hinweise sind von KI verfasste eigene Erläuterungen. Fachliche Referenzen für die kontrollierten Konstruktionen:

- [Verneinung und Zeitformen](https://uusikielemme.fi/finnish-grammar/verbs/verb-tenses-and-moods/making-verbs-negative-in-finnish-dont-havent-hadnt-shouldnt)
- [Konditional](https://uusikielemme.fi/finnish-grammar/verbs/verb-tenses-and-moods/the-conditional-mood-konditionaali)
- [Partitiv](https://uusikielemme.fi/finnish-grammar/finnish-cases/grammatical-cases/the-partitive-case-partitiivi)
- [Imperativ](https://uusikielemme.fi/finnish-grammar/verbs/verb-tenses-and-moods/the-imperative-mood-imperatiivi-tule-mene-syo)
- [Besitzkonstruktion](https://uusikielemme.fi/finnish-grammar/syntax/sentence-types/possession-having-something)
- [Pronomen in gesprochener Sprache](https://uusikielemme.fi/spoken-language/spoken-language-grammar/ma-maa-mie-pronouns-in-spoken-language)
- [Fragen in gesprochener Sprache](https://uusikielemme.fi/spoken-language/spoken-language-grammar/question-sentences-in-finnish-spoken-language)
- [Zweckkonstruktion](https://uusikielemme.fi/finnish-grammar/syntax/constructions/long-form-of-the-first-infinitive-finaalirakenne)
- [Referativkonstruktion](https://uusikielemme.fi/finnish-grammar/verbs/participles/partisiipit-the-reference-construction-etta-participle)

## Visuelle Überarbeitung
Helle Papierflächen, dunkle Konturen und versetzte Schatten; Türkis für Lernkarten, Violett für die Übungsauswahl und Orange für die Hauptaktion. Eigenständige Fraunces-/DM-Sans-Typografie, separat gerahmter Lernpfad und segmentierte Fortschrittsanzeige. Responsive Umstellung auf einspaltige Karten und ein dreispaltiges Levelraster. Hörmodus, Diktat, aufgedeckte Antworten, Grammatikhilfen, Quellen und Dialog verwenden das gleiche helle Farbsystem. Bestehende Funktionen und Daten bleiben erhalten.

## Lokale Fehlerhinweise und Sicherung
„Fehler melden“ speichert je Satz und Kategorie (Übersetzung, Grammatik, Audio, Level, Sonstiges) einen bearbeitbaren Hinweis mit Satz-ID, damaligem finnischem/deutschem Text und Zeitstempeln. Es gibt keine automatische Übermittlung. „Lernstand & Hinweise“ zeigt die letzten 50 Hinweise, ermöglicht Löschen und exportiert alle Hinweise als JSON für eine gezielte Korrektur im Chat. Der Hinweisdialog gibt vor dem Aufdecken keine Lösung preis.

Versionierte `suomi-backup`-Dateien enthalten Bewertungen, Favoriten, Tageszahlen, Einstellungen und Hinweise. Import bis 20 MB mit Prüfung von Formatversion, Wertebereichen, Schlüsseln, Datumswerten und Textlängen. Vor der Übernahme erscheint eine Vorschau. Zusammenführen erhält die Vereinigung der Favoriten; bei Bewertungen entscheidet das neuere Bewertungsdatum. Für alte Bewertungen ohne Zeitstempel entscheiden Wiederholungszahl und danach Fälligkeit. Tageswerte werden mit Maximum statt Addition übernommen; doppelte Importe erhöhen sie nicht. Hinweise werden je Satz/Kategorie nach Aktualisierungszeit vereinigt. Einstellungen stammen aus der Sicherung, die Lerneinheit startet neu. Unbekannte Satz-IDs bleiben in der Sicherung erhalten, beeinflussen den aktuellen Bestand aber nicht.

Import und Hinweisänderungen schreiben zuerst in den Browserspeicher und übernehmen den neuen Zustand erst nach erfolgreichem Schreiben. Bei Fehler bleibt der bisherige Zustand aktiv. Alle importierten Notizen werden als Text ausgegeben. Tastenkürzel für Bewertungen sind in den Dialogen deaktiviert. Fortschritt bleibt lokal; die Datei ermöglicht eine manuelle Übertragung auf ein anderes Gerät.

## Eigene Übersetzungen eintippen
Der Übersetzungsmodus bietet ein Eingabefeld in der jeweiligen Zielsprache, auch bei zufälliger Richtung. „Übersetzung anzeigen“ zeigt die optional eingegebene eigene Antwort und sämtliche passenden Vorlagen ohne automatische Richtig-/Falsch-Bewertung; sinngleiche Alternativen bleiben der Selbsteinschätzung überlassen. Die Eingabe ist optional; derselbe Hauptbutton deckt die Übersetzung auch bei leerem Feld direkt auf. Ä/Ö sowie im Deutschen Ü/ß können per Button an der Cursorposition eingefügt werden. Der Entwurf bleibt beim erneuten Rendern erhalten, wird bei Bewertung oder Wechsel der Lerneinheit gelöscht und weder gespeichert noch extern übertragen. Bestehende Bewertungen je Richtung, Audiofreigabe, Diktat, Hörmodus und Grammatikhilfen bleiben erhalten.

## Schreibtest mit gesammelter Auflösung
Vierte Übungsart `writing`: vor dem Start wählbar mit fünf oder zehn verschiedenen aktiven/archivierten Sätzen des gewählten Levels, jeweils Deutsch → Finnisch. Die Übungsart wird ab fünf geeigneten Sätzen freigeschaltet; die Auswahl von zehn bleibt deaktiviert, solange weniger als zehn verfügbar sind. Zulassung ausschließlich über vorhandene Lernstände: mindestens zwei Bewertungen (`repetitions >= 2`) in wenigstens einem der bisherigen Pfade `fi-de`, `de-fi`, `listen`, `dictation`. Das entspricht erstem Lernen plus einer Wiederholung nach dem vorhandenen Zählmodell, einschließlich „Nochmal“. Bewertungen verschiedener Pfade werden nicht addiert. Audiofilter und normale Neue-/Wiederholen-/Favoriten-Auswahl gelten in diesem Modus nicht.

Jede nichtleere Antwort wird mit OK abgegeben. Danach erscheint der nächste deutsche Satz, das Eingabefeld wird geleert, und bereits abgegebene Antworten bleiben darunter sichtbar. Vor der letzten Abgabe enthält die gerenderte Testansicht weder finnische Vorlagen noch Quellen, Audio oder eine Aufdecken-Schaltfläche. Die letzte Abgabe zeigt alle Paare (eigene Antwort / finnische Vorlage), auf kleinen Bildschirmen untereinander. Übereinstimmung nach Normalisierung wird benannt; Unterschiede gelten ausdrücklich nicht automatisch als Fehler. Quellen und Fehlerhinweise sind erst bei den Ergebnissen zugänglich.

Pro Level wird eine Sitzung im Arbeitsspeicher gehalten, sodass Wechsel der Übungsart oder des Levels Antworten/Entwurf erhalten. „Neuer Schreibtest“ startet bewusst neu; Neuladen beendet diese flüchtigen Sitzungen. Die Testpräferenz ist mit Sicherung und Wiederherstellung kompatibel, Testantworten gehören nicht zur Sicherung. Abgaben erhöhen einmal den Tageszähler, verändern aber weder Bewertungen noch Wiederholungstermine. Doppelte Abgabe über veraltete Handler wird anhand von Sitzung und Antwortindex verhindert. Geprüft: 0/1/10-Satz-Sitzungen, Mindestbewertungen, Eindeutigkeit, keine vorzeitigen Lösungen, Eingaberücksetzung, HTML-Escaping, Wiederaufnahme, Neustart und Erhalt aller bisherigen Übungsarten.


## Level 1 extension (2026-09-12)

Level 1 now has 300 active cards: 142 additional Finnish sentences from the
2026-09-05 Tatoeba export, each with a direct German translation. None of their
IDs or normalized Finnish texts existed in the previous active deck or archive.
No previous cards, levels, audio links, or saved progress identifiers changed.
There are now 4,467 active cards and 226 archived cards; all 4,693 have grammar.
The existing 4,115 licensed audio cards remain available. The additions contain
no audio and can be studied with the translation audio filter switched off.

`sources/level1-expansion.json` pins the exact Finnish and German texts, real
Tatoeba IDs, authors, licenses and direct translation pairs. The new levels are
provisional editorial beginner selections, not certified CEFR assessments.
`build_full_deck.py` includes the extension deterministically and rejects ID/text
duplicates. `sources/grammar-import-specific.tsv` contains the reviewed notes
for these new cards, including case forms, possession, negation and quantities.
Rebuild with `python build_full_deck.py` then `python build_import_grammar.py`.


## Writing-test self-assessment and targeted practice (2026-09-12)

Completed writing tests now offer optional Richtig / Fast richtig / Noch üben
ratings per answer. Device-local writingRatings stores the latest rating and
monotonic timestamp for each real sentence ID. Correct ratings are retained as
merge tombstones so an older backup cannot resurrect resolved practice items.
Backups validate this optional field; older backups remain supported.

Markierte Sätze üben starts up to ten eligible marked cards from the current
level, prioritizing Noch üben and then older ratings. Reference answers remain
hidden until the round ends. Rating never changes normal SRS schedules.
An in-progress round with submitted answers or a draft cannot be replaced by
the targeted-practice button. Storage failures leave the previous rating intact.
# Grammatik nach Themen

Die Übungsart „Grammatik“ filtert aktive Sätze nach Level und zehn Themen aus den Titeln der vorhandenen, zum exakten Satztext gehörenden Grammatikhilfen. Die Themenauswahl zeigt die jeweilige Satzanzahl unter Berücksichtigung des Audiofilters. Nicht jedes Thema ist in jedem Level vertreten. Ein Satz kann mehrere Themen haben; die Zuordnung ist keine vollständige linguistische Analyse.

Pro Runde werden bis zu zehn passende Sätze zufällig gewählt, einschließlich bereits geübter Sätze. Beide Lernrichtungen und Zufall sind verfügbar. Eingaben bleiben optional. Erst nach dem Aufdecken erscheinen die passenden Hinweise, direkt aufgeklappt. Bewertungen verwenden die bestehenden richtungsbezogenen Lernstände. Thema und Übungsart werden in Einstellungen und Sicherungen gespeichert; ältere Sicherungen bleiben importierbar. Das Themenmodul gehört zum Offline-Cache.

Prüfung: `node test-grammar.mjs` (Themen/Levels, Lösungsschutz, Bewertungen, Audiofilter, Sicherungen und Wechsel der Übungsarten).

## Verbformen im Präsens

Die Übung enthält 200 gebräuchliche Verben mit deutscher Bedeutung und jeweils
sechs ausgeschriebenen, bejahenden Präsensformen der Standardsprache
(`dist/verbs-data.mjs`). Die Auswahl ergänzt den bisherigen Paradigmenbestand
um alltägliche Verben; sie ist keine behauptete exakte Korpus-Rangliste.
Einzelformen wurden unter anderem mit den Wörterbucheinträgen
[häiritä](https://kieli.net/sana/h%C3%A4irit%C3%A4),
[purra](https://kieli.net/sana/purra) und
[vanheta](https://kieli.net/sana/vanheta) abgeglichen.

Fünf oder zehn Aufgaben pro Runde, ohne Audio und unabhängig vom Satzlevel.
Bei hän und he verlangt die Antwortprüfung das Personalpronomen zusammen mit
der Verbform. Bei minä, sinä, me und te ist es optional (NFC, Großschreibung
und Leerraum normalisiert).
Nach jedem Prüfen sind alle sechs Formen sichtbar; die abgefragte ist markiert.
Runden bleiben beim Wechsel der Ansicht/Übung im Arbeitsspeicher erhalten.

`verbProgress` speichert jede Kombination als `lemma:personIndex` (0–5).
Auch eine angezeigte, noch nicht beantwortete Form gilt als gesehen, bleibt aber
fällig. Mindestens zwei von fünf Positionen werden für neue Formen reserviert,
solange ungesehene Formen vorhanden sind. Falsche Antworten kommen nach
mindestens zwei anderen Aufgaben wieder; kurze Runden werden nicht verlängert.
Wiederholungen, die nicht mehr hineinpassen, bleiben für spätere Runden fällig.
Bei mehrfachen Fehlern werden auch andere Personalformen dieses Verbs gewählt.
Richtige Antworten erhöhen die Abstände auf 1, 3, 9, 27 und maximal 60 Tage.
Zwei richtige Antworten in Folge gelten in der Übersicht als sicher.

Kontospeicherung, Sicherungsexport/-import und Cloud-Merge berücksichtigen den
zusätzlichen Lernstand. Ältere Sicherungen bleiben kompatibel. Cloud-Merges
erhalten die Vereinigungsmenge gesehener Kombinationen und die neuesten
Antwort-/Wiederholungsdaten pro Kombination; gleichzeitig auf zwei Geräten
erfasste Zähler werden per Maximum zusammengeführt, nicht addiert.
Eine reine Anzeige auf einem anderen Gerät überschreibt keine Antwort.
Während der Verbübung werden Cloud-Änderungen ohne Neuladen übernommen,
damit die aktuelle Eingabe erhalten bleibt. Gäste speichern nichts dauerhaft.
Die Module und Styles sind Teil des Offline-Caches.

Prüfen: `node test-verbforms.mjs`, `node test-auth-sync.mjs`.
Browserprüfung: `node test-verbforms-browser.mjs` mit Playwright 1.55.0 und Chromium.
Die GitHub-Action „Verify verb practice“ führt diese Prüfungen aus.
