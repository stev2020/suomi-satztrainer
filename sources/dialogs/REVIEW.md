# Dialoge gegenlesen

Du prüfst Dialoge, die jemand anderes geschrieben hat. Maßstab: `INSTRUCTIONS.md` in diesem Ordner und die dort genannte Pflichtlektüre (register.md, fehlerklassen.md, schreibverfahren.md). Lies alles vor der Prüfung.

Prüfe **jede Zeile** jedes Dialogs:
1. **Grammatik:** Kasus, Objektfall (Partitiv/Genitiv/Nominativ), Kongruenz, Verbformen, Rektion, Wortstellung, Rechtschreibung (ä/ö, Doppelbuchstaben).
2. **Idiomatik:** Würde ein Finne das so sagen? Übersetzungsfinnisch aus dem Deutschen/Englischen (falsche Höflichkeit, *Kyllä.* als Ja, *minä* in jedem Satz, Konditionalketten, wörtliche Redewendungen) → umschreiben.
3. **Sprachlage:** konsistent im ganzen Dialog. Standardformen mit gesprochener Syntax – außer Thema `slang` (ab Level 3 Puhekieli) und auf Level 5 lockere Szenen, dann **durchgehend** Puhekieli. Mischformen innerhalb eines Dialogs beseitigen (Ausnahme: wörtlich übernommene Lernpfad-Sätze; wenn einer davon den Ton bricht, lieber aus dem Dialog und aus `reuses` entfernen).
4. **Level:** Grammatik nicht über dem Level (siehe INSTRUCTIONS.md). Zu schwere Stellen vereinfachen.
5. **Logik:** Jede Frage bekommt eine Antwort, Zeitangaben und Fakten widersprechen sich nicht, die Szene endet mit einer Veränderung.
6. **Deutsch:** treu und natürlich, keine Bedeutungsverschiebung; `scene`, `title`, `phrases` korrekt.
7. **Wiederverwendete Lernpfad-Sätze:** Sie müssen wörtlich bleiben (Prüfskript). Wirkt einer im Gespräch gezwungen, entferne ihn samt ID aus `reuses` statt ihn zu verbiegen.
8. `doubts` des Autors: jeden Zweifel klären (dann Zweifel löschen und ggf. Text ändern) oder – wenn wirklich nur ein Muttersprachler entscheiden kann – präzise stehen lassen.

Korrigiere direkt in `level-N.json` (Struktur unverändert lassen). Schreibe ein Protokoll `review-level-N.md`: je Dialog die Änderungen (alt → neu, ein kurzer Grund) und die verbleibenden Zweifel. Danach `cd /home/claude/suomi-satztrainer && python3 build_dialogs.py check N` bis OK.

Sei streng bei Grammatik und Idiomatik, zurückhaltend bei Geschmacksfragen. Keine anderen Dateien ändern.
