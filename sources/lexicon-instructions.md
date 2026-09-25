# Wortanalyse annotieren (Suomi-Satztrainer)

Lernende tippen in der App auf ein finnisches Wort und sehen: **Grundform**, **deutsche Bedeutung**, **Form** (Fall/Verbform) und optional **„hier:“** (was genau dieses Wort in diesem Satz heißt). Deine Annotation muss für deutschsprachige Finnisch-Anfänger stimmen und verständlich sein.

## Eingabe
`sources/lexicon-work/batches/NNN.txt`:
```
#<Satz-ID> | <finnischer Satz> | <deutsche Übersetzung>
  <Index> <Wort>: [a] <Grundform> = <Formbeschreibung> | [b] ...     (oder: (keine Analyse))
```
Die Kandidaten stammen aus Voikko (Morphologie-Analyse) und enthalten oft unpassende Lesarten.

## Ausgabe
`sources/lexicon-work/answers/NNN.tsv` – genau eine Zeile pro Wort, TAB-getrennt, keine Kopfzeile, 8 Spalten:

```
satz_id	index	wort	wahl	grundform	bedeutung	form	hier
```

- **wahl**: Buchstabe des passenden Kandidaten im Satzzusammenhang (`a`, `b`, …). `-` nur, wenn kein Kandidat passt oder keine Analyse vorhanden ist.
- **grundform**: bei Buchstabenwahl leer lassen (wird übernommen). Bei `-` Pflicht: die standardsprachliche Grundform (Umgangssprache → Standard: `mä` → `minä`, `oon` → `olla`, `mun` → `minä`, `tää` → `tämä`).
- **bedeutung**: deutsche Wörterbuchbedeutung der Grundform **in der hier gemeinten Bedeutung**, kurz (1–4 Wörter). Verben im Infinitiv („kommen“), Nomen im Singular ohne Artikel („Haus“), Adjektive in Grundform („groß“), Pronomen („ich“, „du“, „dieser“). `ei` → „nicht (Verneinungsverb)“. Namen → „Tom (Name)“, „Finnland“. Zahlen als Ziffer → die Zahl. Mehrdeutige Lemmata: nur die hier gemeinte Bedeutung (`kuusi` → „sechs“ oder „Fichte“).
- **form**: normalerweise LEER (die Formbeschreibung des gewählten Kandidaten wird übernommen). Nur ausfüllen, wenn:
  - `wahl` = `-` (dann Pflicht), oder
  - die Kandidatenbeschreibung im Kontext irreführt. Wichtigster Fall: Verb nach einem Verneinungsverb (en/et/ei/emme/ette/eivät, älä, ettei …). Dann Kandidat wählen und Form überschreiben:
    - Präsens: `Verb · Verneinungsform (nach ei)` (z. B. *En puhu*)
    - Vergangenheit: `Verbform · Partizip Perfekt aktiv · verneinte Vergangenheit` (*en puhunut*)
    - Konditional: `Verb · Konditional · Verneinungsform` (*en puhuisi*)
    - Verbot: `Verb · Verneinungsform (nach älä)`
  - Umgangssprache (`-`): Stil wie die Kandidaten, z. B. `Pronomen · Nominativ Singular · umgangssprachlich für minä`, `Verb · 1. Person Sg. (minä) · Präsens · umgangssprachlich für olen`, `Verb · 2. Person Sg. (sinä) · Präsens · + Frage -ko · umgangssprachlich für oletko sinä` usw.
  - Formbeschreibungen immer mit ` · ` trennen, Fälle wie in den Kandidaten benennen (Nominativ, Genitiv, Partitiv, Inessiv „in“, Elativ „aus“, Illativ „in … hinein“, Adessiv „auf, bei“, Ablativ „von … weg“, Allativ „auf … zu, an“, Essiv „als“, Translativ „zu … (werden)“, Abessiv „ohne“, Komitativ „mit“) + Singular/Plural. Unflektierbare Wörter: nur Wortart (`Adverb`, `Konjunktion`, `Postposition`, `Ausruf`, `Partikel`).
- **hier**: kurze deutsche Wiedergabe genau dieser Wortform im Satz, wenn sie mehr sagt als die Bedeutung: *talossa* → „im Haus“, *olet* → „(du) bist“, *Minulla* (on) → „bei mir → ich habe“, *tuli* → „kam“, *kirjoja* → „Bücher“, *puhu* (nach en) → „spreche“. Leer lassen, wenn identisch mit der Bedeutung (Nominativ Singular, Infinitiv, unveränderliche Wörter).

## Entscheidungsregeln
- Satzanfänge: `Minä` → Pronomen minä (nicht Nomen, nicht mikä). `Sinä` → sinä, nicht se.
- Infinitiv statt Passiv nach Modalverben (`Haluan nähdä` → Grundform).
- `Tom`/`Tomi`: wähle die Grundform, die zur deutschen Übersetzung passt (steht dort „Tom“, dann Tom).
- Ländernamen/Sprachen: *japania* in „En puhu japania“ = Sprache → `japani`, Bedeutung „Japanisch (Sprache)“.
- `on` in Besitzsätzen (*Minulla on*) bleibt Verb olla, Bedeutung „sein“, hier: „ist → (ich) habe“.
- Wenn der finnische Satz einen Tippfehler hat, trotzdem die gemeinte Form annotieren (wahl `-`, Form mit Zusatz `· Schreibfehler in der Quelle`).
- **Erstarrte Formen als eigene Wörter** (Lernende schlagen sie so nach): Fragewörter *missä* „wo“, *mistä* „woher“, *mihin/minne* „wohin“, *miksi* „warum“, *milloin* „wann“, *kuinka/miten* „wie“ → `wahl` `-`, Grundform = das Wort selbst (kleingeschrieben), Form z. B. `Fragewort · (Inessiv von mikä)`. Ebenso lexikalisierte Adverbien/Grüße: *kotona* „zu Hause“, *kotiin* „nach Hause“, *paljon* „viel“, *todella* „wirklich“, *melko* „ziemlich“, *yhdessä* „zusammen“, *ulkona* „draußen“, *terve* (Gruß) „hallo“, *kiitos* „danke“, *anteeksi* „Entschuldigung“ → Form `Adverb` bzw. `Ausruf` (bei `-` mit Grundform = Wort). Die Liste ist beispielhaft: gleiches gilt für Ortsadverbien *täällä/tuolla/siellä* „hier/dort“, *tänne/sinne* usw., *kotoisin* „stammend aus“, *tänään* „heute“, *huomenna*, *eilen*. *Mitä*, *mikä*, *kuka*, *ketä* bleiben normale Formen von mikä/kuka.
- Form überschreiben ist auch erlaubt, wenn Voikko die Zahl/den Fall im Kontext falsch hat (*lapsesi ovat* → Plural). Partitiv nach Zahlwort: Form bleibt, „hier:“ erklärt („Bücher (nach Zahlwort: Partitiv Sg.)“).
- Hilfsskripte für Standardwerte gleicher Wortformen sind erlaubt, aber jeder Satz muss im Kontext geprüft werden (Bedeutung, „hier:“, Verneinung, Besitzsätze).
- Nichts erfinden: Wenn du bei einem sehr seltenen Wort unsicher bist, wähle die plausibelste Kandidatenlesart und gib die übliche Bedeutung.

## Ablauf
1. Batch vollständig lesen (Read-Tool, ggf. in Abschnitten).
2. Antworten schreiben (Write-Tool; bei großen Batches in mehreren Dateien `NNN.part1.tsv` … zusammenfügen ist NICHT erlaubt – schreibe eine Datei `NNN.tsv`, notfalls per Write und anschließend Anhängen mit Bash `cat >> ... <<'EOF'`).
3. `cd /home/claude/suomi-satztrainer && python3 build_lexicon.py check NNN` so lange ausführen und korrigieren, bis `OK` erscheint.
4. Andere Dateien nicht verändern.
