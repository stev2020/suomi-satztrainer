# Dialoge für den Suomi-Satztrainer schreiben

Zu jedem der 13 Themen des Lernpfads bekommt jedes Level einen kurzen Alltagsdialog. Lernende lesen ihn Zeile für Zeile, können jedes Wort antippen (Grundform, Bedeutung, Form) und eine Rolle selbst sprechen. Der Dialog zeigt die Sätze, die sie im Thema gelernt haben, **in einer echten Situation**.

## Pflichtlektüre vor dem ersten finnischen Satz
Der Maßstab für natürliches Finnisch kommt aus dem Aimo-Kurs des Projektinhabers:
- `/root/.claude/skills/synced/89ef856c-00fe-4e42-8378-8310b516cbb5_6d5b99fa-6ea8-4558-bc54-6d18b8a86a48/aimo-lektion/references/register.md` (ganz)
- `/root/.claude/skills/synced/89ef856c-00fe-4e42-8378-8310b516cbb5_6d5b99fa-6ea8-4558-bc54-6d18b8a86a48/aimo-lektion/references/fehlerklassen.md` (ganz)
- `/root/.claude/skills/synced/89ef856c-00fe-4e42-8378-8310b516cbb5_6d5b99fa-6ea8-4558-bc54-6d18b8a86a48/aimo-lektion/references/schreibverfahren.md` (mindestens die Abschnitte zu Szene, Dialog und den Proben)

Die Aimo-Wortkontingente, Stationen, Figuren (Aimo, Marja, Lumi) und Datenformate gelten hier **nicht**. Übernimm nur die Regeln zur Sprachlage, zu Partikeln/Klitika/Ja-Nein/Höflichkeit und die Proben gegen Maschinentext.

## Eingabe
`/tmp/claude-0/-home-claude/f69b3b68-904e-5cd3-8163-cd57dac7d205/scratchpad/dialogs/level-N-topics.md`: die 13 Themen des Levels (ID, Titel, Ziel) mit den Sätzen aus dem Lernpfad (`[ID] finnisch | deutsch`).

## Ausgabe
`/home/claude/suomi-satztrainer/sources/dialogs/level-N.json` – ein JSON-Array mit genau 13 Dialogen in der Reihenfolge der Themen:

```json
{
  "id": "l1-cafe",
  "level": 1,
  "topic": "cafe",
  "title": "Im Café",
  "scene": "Emma bestellt im Café am Bahnhof. Mikko arbeitet an der Theke.",
  "speakers": {"A": {"name": "Mikko", "role": "Verkäufer"}, "B": {"name": "Emma", "role": "Kundin"}},
  "lines": [
    {"s": "A", "fi": "Hei! Mitä saa olla?", "de": "Hallo! Was darf es sein?"},
    {"s": "B", "fi": "Yksi kahvi, kiitos.", "de": "Einen Kaffee, bitte."}
  ],
  "reuses": [1234567],
  "phrases": [{"fi": "Mitä saa olla?", "de": "Was darf es sein? – feste Frage an der Theke"}],
  "doubts": []
}
```

- `id` = `l<Level>-<Themen-ID>`; `title` 2–4 deutsche Wörter; `scene` ein deutscher Satz: wer, wo, was will jemand.
- `speakers`: zwei Personen (höchstens drei), finnische Vornamen, abwechslungsreich über die 13 Dialoge (Aino, Mikko, Liisa, Juha, Sanna, Pekka, Emma, Onni, Kaisa, Ville, Leena, Antti …). Kein „Tom/Tomi/Mari“. `role` deutsch, kurz.
- `lines`: **6–10 Zeilen**, jede mit `s`, `fi`, `de`. Eine Zeile = ein Redebeitrag (1–3 kurze Sätze).
- `reuses`: IDs der Lernpfad-Sätze, die im Dialog **wörtlich** vorkommen (2–4 pro Dialog, wo das Thema Sätze hat und sie natürlich passen). Nur einbauen, wenn der Satz in der Situation Sinn ergibt – lieber ein Satz weniger als ein Fremdkörper.
- `phrases`: 1–2 Gesprächsformeln des Dialogs mit kurzer deutscher Erklärung.
- `doubts`: deutsch formulierte Zweifel an Formulierungen, die ein finnischer Muttersprachler prüfen sollte (Zeilennummer + Frage). Leer nur, wenn du wirklich sicher bist.

## Sprache
- **Level passend:**
  - Level 1: Präsens, Fragen mit -ko/-kö und Fragewörtern, Verneinung, Besitz (*minulla on*), häufige Ortsfälle (-ssa, -sta, -lla, -lle), Partitiv nach Zahl/Verneinung/Menge. Keine Vergangenheit. Kurze Zeilen.
  - Level 2: dazu mehr Alltagswortschatz, Imperativ, *haluta/pitää/voida* + Infinitiv. Noch keine Vergangenheit außer festen Wendungen.
  - Level 3: dazu Imperfekt, Perfekt, längere Sätze, *että*-Sätze.
  - Level 4: dazu Konditional, Nebensätze (*kun, jos, koska*), Passiv, Infinitivkonstruktionen.
  - Level 5: dazu abstrakterer Wortschatz, Meinungen, Umgangssprache.
- Wortschatz überwiegend aus den Lernpfad-Sätzen dieses und der niedrigeren Level; höchstens etwa fünf neue, gut erschließbare Wörter pro Dialog.
- **Sprachlage: puhuttu yleiskieli** (Standardformen, gesprochene Syntax): duzen, *joo* als Ja, Kurzantwort mit dem Verb (*– Onko teillä…? – On.*), Ellipse, 1–3 Partikeln (*no, joo, ai, niin, okei, no niin*), Klitika (*-kin, -han, -pa, mitäs*) sparsam, *minä/sinä* nicht in jedem Satz. Keine Konditionalketten beim Bestellen (*kiitos* genügt), kein *Kyllä.* als bloßes Ja.
- **Ausnahme Thema `slang` (Umgangssprache):** Ab Level 3 bewusst Puhekieli (*mä, sä, oon, mun, -ks, se* für Personen, *mennään*), konsistent im ganzen Dialog, und die `de`-Zeile übersetzt normal. In Level 1–2 für `slang` nur die verbreitetsten lockeren Wörter (*moi, moikka, kiitti, heippa, joo, okei, jees*), sonst Standardformen. Auf Level 5 dürfen auch andere lockere Situationen (Freunde) Puhekieli nutzen – dann durchgehend.
- Jede Frage bekommt eine Antwort von der gefragten Person; mindestens einmal baut jemand auf einer Antwort auf. Niemand ist nur Stichwortgeber. Am Ende ist etwas anders (bestellt, verabredet, geholfen, entschieden).
- Die ersten 1–2 Zeilen machen die Lage klar (Begrüßung, Ort, Anliegen).
- **Keine Tatoeba-Sätze kopieren** außer den aufgeführten Lernpfad-Sätzen.
- Deutsche Übersetzung natürlich und treu, nicht Wort für Wort; Anrede im Deutschen passend (du).
- Inhaltlich: freundlich, alltagsnah, ohne heikle Themen. Bei `emergency`: Hilfe holen, Arzt, Polizei rufen, verlorene Tasche – nüchtern, nicht dramatisch. Bei `romance`: harmlos (Verabredung, Kompliment, Jahrestag).

## Ablauf
1. Pflichtlektüre lesen, dann die Themen-Datei deines Levels.
2. Pro Thema zuerst auf Deutsch die Szene denken (wer will was, was steht im Weg, was ist am Ende anders), dann Finnisch schreiben, dann die Proben aus `schreibverfahren.md`/`fehlerklassen.md` anlegen.
3. Datei schreiben, dann `cd /home/claude/suomi-satztrainer && python3 build_dialogs.py check N` ausführen, bis `OK` erscheint.
4. Keine anderen Dateien ändern.
