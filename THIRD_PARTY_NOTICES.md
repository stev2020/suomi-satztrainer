# Quellen und Lizenzen

## Satztexte

Die finnischen und deutschen Tatoeba-Satztexte werden entsprechend der jeweils in `dist/sentences.json` angegebenen Lizenz verwendet. Soweit dort nichts anderes angegeben ist, gilt CC BY 2.0 FR. Urheber, Satz-ID und Lizenz sind in `dist/sentences.json` enthalten und in der App unter „Quellen & Aufnahmen“ sichtbar.

- Quelle: https://tatoeba.org/
- Lizenz: https://creativecommons.org/licenses/by/2.0/fr/

KI-erstellte deutsche Übertragungen sind in den Datensätzen als solche gekennzeichnet und keine Tatoeba-Beiträge.

## Audioaufnahmen

Die App verweist auf 4.115 finnische Originalaufnahmen von Tatoeba. Die Aufnahmen sind nicht in diesem Repository enthalten; sie werden bei der Wiedergabe über die in `dist/sentences.json` gespeicherten Tatoeba-URLs abgerufen. Urheber, Lizenz und Quellenlink stehen bei jeder Aufnahme im Datensatz und werden auf der jeweiligen Lernkarte angezeigt.

Die derzeit verknüpften Aufnahmen stammen von Orava und stehen unter CC BY-NC 4.0. Sie dürfen mit Namensnennung für nichtkommerzielle Zwecke verwendet werden.

- Urheberprofil: https://tatoeba.org/en/user/profile/Orava
- Lizenz: https://creativecommons.org/licenses/by-nc/4.0/

Die 138 Tatoeba-Aufnahmen ohne bestätigte Wiederverwendungsfreigabe werden nicht eingebunden. Ihre Satztexte können weiterhin entsprechend ihrer jeweiligen Textlizenz verwendet werden.

## Grammatikinformationen

Die deutschen Grammatikhilfen wurden mit KI für diese App formuliert. Als weiterführende Referenz wird https://uusikielemme.fi/finnish-grammar verlinkt; Inhalte dieser Website sind nicht in der App kopiert.

## Schriften

Die Schriften werden lokal aus `dist/fonts/` ausgeliefert (keine Verbindung zu Google Fonts). Beide stehen unter der SIL Open Font License 1.1; die Lizenztexte liegen neben den Dateien.

- DM Sans – Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts), `dist/fonts/OFL-DM-Sans.txt`
- Fraunces – Copyright 2020 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces), `dist/fonts/OFL-Fraunces.txt`
- Bezogen über Fontsource (`@fontsource-variable/dm-sans`, `@fontsource-variable/fraunces`, Version 5).

## Spiel Mustikka Hyppy (Bereich „Spiele“)

`dist/games/hyppy/` enthält den Einbettungs-Build des eigenen Spiels Mustikka Hyppy (github.com/stev2020/mustikka-hyppy).

- Phaser (https://phaser.io), MIT License – Lizenztext in `dist/games/hyppy/LICENSES.txt`
- Schrift Patrick Hand – Copyright 2010–2012 Patrick Wagesreiter, SIL Open Font License 1.1, `dist/games/hyppy/fonts/OFL-Patrick-Hand.txt`
- Wortliste `words-de-fi.json` – eigener Grundwortschatz, CC0 1.0
- Grafiken – eigene, per Skript gezeichnete Kritzel-Grafiken

## Dienste

- Hosting: GitHub Pages
- Konten, Synchronisierung, Klassenräume: Supabase
- Passwortprüfung: Have I Been Pwned (k-Anonymität, nur serverseitig)

Details stehen in `dist/datenschutz.html`.
