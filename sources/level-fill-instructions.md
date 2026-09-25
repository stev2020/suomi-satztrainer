# Neue Tatoeba-Sätze prüfen, einstufen und erklären

Der Suomi-Satztrainer (Finnisch für Deutschsprachige) bekommt neue Sätze aus dem Tatoeba-Export vom 25.09.2026: Level 2 soll den Sprung zu Level 3 (1.570 Sätze) abfedern, Level 6 hat bisher nur 19 Sätze. Du prüfst ein Paket Kandidaten.

## Eingabe
`sources/level-fill-work/batches/<PAKET>.txt`
```
#<fi-ID> [<Autor>] <finnischer Satz>
  de <de-ID> [<Autor>]: <deutsche Übersetzung>     (eine oder mehrere, alle direkt verknüpft)
```
Häufige Grammatiktitel des Bestands: `sources/level-fill-work/grammar-titles.txt` (Titel, Anzahl).
Beispiele für gute Grammatikhinweise: `sources/grammar-import-specific.tsv`.

## Ausgabe 1: Entscheidungen
`sources/level-fill-work/review/<PAKET>.tsv`, eine Zeile pro Kandidat, TAB-getrennt, ohne Kopfzeile:
```
fi-ID	entscheidung	level	thema	de-IDs	grund
```
- `entscheidung`: `keep` oder `reject`.
- **reject**, wenn: der finnische Satz einen Fehler hat (Rechtschreibung, Kasus, Kongruenz, fehlende Wörter) oder unidiomatisch/übersetzt klingt; keine deutsche Übersetzung inhaltlich und sprachlich stimmt (Anrede du/ihr/Sie passend zum Finnischen, Bedeutung, deutsche Grammatik); der Satz anstößig, politisch/religiös wertend, gewaltverherrlichend oder für Lernende unbrauchbar ist (reine Fragmente, Zungenbrecher ohne Sinn, Fachjargon); er fast wörtlich einen anderen Kandidaten im selben Paket wiederholt (dann nur den besseren behalten); er nicht auf das Ziel-Level passt (siehe unten).
- `level` (nur bei keep): Level-2-Pakete: `1` oder `2`. Level-6-Pakete: `6`.
  - **1:** sehr kurz, Grundwortschatz, Präsens, keine Nebensätze.
  - **2:** Alltagssatz, meist Präsens (auch Imperativ, Modalverb + Infinitiv, einfache Fälle, Verneinung, Fragen), bis etwa 7 Wörter. **Keine Vergangenheit** (Imperfekt/Perfekt), kein Konditional, keine Nebensätze, keine Umgangssprache → sonst reject (gehört in Level 3+, das bereits voll ist).
  - **6:** anspruchsvoll: lange oder mehrteilige Sätze, Partizip-/Infinitivkonstruktionen, mehrere Nebensätze, dichter Wortschatz, gehobene Sprache. Muss trotzdem korrekt, natürlich und verständlich übersetzt sein. Kürzere, einfache Sätze, die die Heuristik falsch einstufte → reject.
- `thema` (nur bei keep): passendes Lernpfad-Thema oder `-`: `hello` (Begrüßung/Grundlagen), `time` (Zahlen/Zeit), `cafe` (Essen/Trinken), `family` (Familie/Beziehungen), `travel` (Reisen/Orientierung), `shopping` (Einkaufen/Geld), `health` (Körper/Gesundheit), `nature` (Wetter/Natur), `feelings` (Gefühle/Meinungen), `work` (Arbeit/Technik), `slang` (Umgangssprache), `romance` (Liebe), `emergency` (Notfälle/Hilfe).
- `de-IDs` (nur bei keep): kommagetrennt die deutschen Übersetzungen, die korrekt sind (die beste zuerst). Falsche weglassen.
- `grund`: kurz (deutsch), bei reject Pflicht.

## Ausgabe 2: Grammatikhinweise (nur für keep)
`sources/level-fill-work/review/<PAKET>.notes.tsv`, Format wie `sources/grammar-import-specific.tsv` (ohne Kommentarzeile):
```
fi-ID	exakter Fokus	Titel	Erklärung
```
- 1–3 Hinweise pro behaltenem Satz, zu den lernrelevanten Formen/Konstruktionen. Der **Fokus** muss wörtlich (Groß-/Kleinschreibung egal) im Satz vorkommen.
- **Titel**: wenn möglich einen der vorhandenen Titel aus `grammar-titles.txt` verwenden (die App ordnet Themen wie Verneinung, Fragen, Besitz, Ortsfälle, Partitiv, Präsens, Vergangenheit, Konditional, Aufforderungen, Umgangssprache über die Titel zu), sonst einen kurzen, sprechenden Titel im selben Stil.
- **Erklärung**: 1–3 deutsche Sätze, konkret zur Form im Satz (Grundform → Form, Endung, Bedeutung), wie in den Beispielen. Keine Fehler: lieber weniger sagen.
- Keine TAB-Zeichen im Text.

## Ablauf
1. Anleitung, Titelliste und ein Stück `grammar-import-specific.tsv` lesen, dann das Paket vollständig.
2. Jeden Kandidaten einzeln beurteilen – streng: ein Satz, der in der App landet, sollte korrekt, natürlich und nützlich sein. Rechne mit einer Ablehnungsquote von 20–50 %.
3. Beide Dateien schreiben und `cd /home/claude/suomi-satztrainer && python3 build_level_fill.py check <PAKET>` ausführen, bis OK erscheint.
4. Keine anderen Dateien ändern.
