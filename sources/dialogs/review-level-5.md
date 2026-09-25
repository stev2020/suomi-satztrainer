# Review Level 5

Geprüft nach REVIEW.md, INSTRUCTIONS.md, register.md, fehlerklassen.md und schreibverfahren.md (Szene, Dialog, Proben).
Ergebnis: 42 Zeilen geändert oder neu (drei Dialoge neu geschrieben: 28 Zeilen; 14 Einzelkorrekturen). `python3 build_dialogs.py check 5` → OK (13 Dialoge, 116 Zeilen).

## Grundsätzlich: Verteilung der Sprachlage

Vorher standen 12 von 13 Dialogen in Puhekieli. Nur `hello` war gesprochenes Standardfinnisch. INSTRUCTIONS.md setzt puhuttu yleiskieli als Norm und erlaubt Puhekieli auf Level 5 nur für lockere Szenen. Drei Szenen sind deshalb jetzt Situationen mit Fremden, Dienstleistung oder Gesundheitswesen und stehen in gesprochenem Standardfinnisch:

| Sprachlage | Dialoge |
|---|---|
| gesprochenes Standardfinnisch | hello (Hausversammlung), health (Pflegerin am Telefon), nature (Beratung im Naturzentrum), emergency (Passant) |
| Puhekieli (Helsinki-nah, durchgehend) | time, cafe, family, travel, shopping, feelings, work (unter Kollegen), slang, romance |

Puhekieli-Formen sind jetzt einheitlich südfinnisch/helsinkiisch: *mä/sä, oon, -ks/-tsä, ootetaan, lähetään, meiän, seittemän, ens, iltasin*. Die falsche Form *oodataan* wurde entfernt. Offen bleibt nur *huomen* (siehe `time`).

## l5-hello (Standard)
- Keine Textänderung.
- Zweifel geklärt: *Pahoittelut myöhästymisestä* passt zu einer Versammlung, die etwas förmlicher ist (die Phrase ist als „etwas förmlich“ erklärt). *Puhuttiin juuri …* ist das unpersönliche Passiv der Standardsprache und kein Puhekieli-„wir“. Beide Zweifel gelöscht.

## l5-time (Puhekieli)
- Z5 *Liput maksaa kymppi, mut sä pääset listalla* → *Liput maksaa kympin, mut mä laitoin sut listalle.* Grund: *maksaa* verlangt beim Betrag den Akkusativ (*kympin*). *päästä listalla* ist nicht idiomatisch; üblich ist *laittaa listalle*. Deutsch angepasst.
- Zweifel geklärt: *tänä yönä* passt zu einem Auftritt ab 23 Uhr. *yhdestätoista* mit d ist in geschriebenem Puhekieli üblich und passt zu *yhdeltätoista* in Z9.
- Offen: *huomen* (Z7 Lernpfad, Z8 angeglichen). Ist das im Helsinkier Puhekieli geläufig oder westfinnisch gefärbt?

## l5-cafe (Puhekieli)
- Z2 *Syön mä. Mä syön lihaa …* → *Joo. Mä syön lihaa …* Grund: Die Bekräftigung stand doppelt, das Verb direkt zweimal.
- Z8 *illalla en juo* → *iltasin en juo*. Grund: Es geht um eine Gewohnheit, also „abends“ und nicht „heute Abend“.
- Zweifel geklärt: Die Schreibung *Syök sä / Tykkääk sä* ist wörtlich aus dem Lernpfad. Im Dialog steht keine konkurrierende -ks-Form (*Miks* ist ein anderes Wort).

## l5-family (Puhekieli)
- Z1 *koulun jälkeen* → *sitten kouluaikojen*. Grund: *koulun jälkeen* heißt vor allem „nach dem Unterricht“. Gemeint ist „seit der Schulzeit“.
- Z6 *Onks se vielä auki?* → *Onks se vielä olemassa?* Grund: *auki* heißt „geöffnet“, gemeint ist „gibt es das noch“.
- Zweifel geklärt: *se* für den Vater und *seittemänkyt* sind konsequentes Puhekieli. *synttäreinä* (Essiv für den Tag) ist korrekt, *synttäreillä* (auf der Feier) wäre ebenso möglich.

## l5-travel (Puhekieli)
- Keine Textänderung.
- Zweifel geklärt: *Reissu oli tosi hauska* ist Lernpfad-Satz und idiomatisch. *piirtää servettiin* ist ebenso üblich wie *servetille*.

## l5-shopping (Puhekieli)
- Z2 *Tarviin.* → *Kyl tarvii.* Grund: Die Antwort auf das unpersönliche *sun ei tarvii* übernimmt die unpersönliche Form. *kyl* ist das bekräftigende „doch“. Deutsch: „Doch.“
- Zweifel geklärt: *Otetaan se.* sagt man auch als Beschenkte.

## l5-health (neu, Standard)
- Neu geschrieben als Anruf im Gesundheitszentrum (Pflegerin Sari, Patientin Aino). Grund: Die Arztszene gehört ins Standardfinnisch. Der Lernpfad-Satz *Polveeni sattuu kovasti.* passt jetzt vom Register her und wurde eingebaut. *Haluuk sä, et mä soitan ambulanssin?* (6970679) wurde aus `reuses` entfernt.
- Handlung: Sturz beim Unihockey, Termin morgen um Viertel nach acht, Rat bis dahin (kühlen, hochlegen, bei Verschlechterung Päivystysapu 116 117).
- Offen: Die Pflegerin duzt durchgehend. Ist das am Telefon natürlich, oder würde man eher siezen oder unpersönlich formulieren?

## l5-nature (neu, Standard)
- Neu geschrieben als Beratung im Naturzentrum Haltia (Mitarbeiterin Riikka, Wanderer Matti). Grund: Kundendienst gehört ins Standardfinnisch. Außerdem gab es einen echten Mischfehler: Der Lernpfad-Satz *Se ei ollut kummoinen myrsky* stand neben *Ei ollu* aus Puhekieli. *Sä tykkäät sateesta, eikö niin?* (6679077) wurde entfernt, *Sää on huono* (6887741) kam hinzu.
- Die Handlung bleibt: Für Samstag ist Sturm angesagt, deshalb wird die Wanderung auf Sonntag mit Frost und erstem Schnee verlegt.

## l5-feelings (Puhekieli)
- Z6 *Mut maanantai vielä!* → *Ja vielä maanantaina!* Grund: So war der Satz nicht idiomatisch. Gemeint ist „und dann auch noch an einem Montag“.
- Z7 *meni päivä miten vaan* → *meni päivä miten meni*. Grund: Das ist die feste Wendung.
- Z8 *Kunhan maanantai menis …* → *Kunpa maanantai menis …* Grund: *kunhan* heißt „sofern“. Der Wunsch heißt *kunpa*. Damit passt auch die Antwort *Mä toivon samaa* (Zweifel geklärt).

## l5-work (Puhekieli)
- Z7 *ensi kuussa* → *ens kuussa*. Grund: So passt es zur übrigen Puhekieli-Lautung (*meiän, tällasissa*).
- Zweifel geklärt: *Sitä asiakasprojektia?* als Partitiv-Echo zu *työstän projektia* ist richtig. *Mun tarvii* ist nicht normgerecht, aber echtes Puhekieli und als Lernpfad-Satz im Puhekieli-Dialog stimmig.

## l5-slang (Puhekieli)
- Z5 *me oodataan* → *me ootetaan*. Grund: Die Umgangsform von *odotetaan* ist *ootetaan*. *oodataan* gibt es nicht.
- Z6 *mun pyörässä on puhjennu kumi* → *mun pyörän kumi on puhki*. Grund: Das ist die übliche Formulierung.
- Z8 *Hauska.* → *Tosi hauska.* Grund: So wird die ironische Antwort eindeutig.
- Zweifel geklärt: *Eksä muista?* ist wörtlich aus dem Lernpfad und verbreitet.

## l5-romance (Puhekieli)
- Z3 *ravintolasta, jossa* → *ravintolasta, missä*. Grund: Im Puhekieli steht das Relativpronomen *missä*.
- Zweifel geklärt: *olla hermona* ist idiomatisch.

## l5-emergency (neu, Standard)
- Neu geschrieben: Maija bittet am Marktplatz einen Passanten (Kalle) um sein Handy, lässt die Karten sperren (020 333), erfährt vom Fundbüro und ruft ihre Schwester wegen des Ersatzschlüssels an. Grund: Hilfe von Fremden gehört ins Standardfinnisch. Damit ist auch der alte Zweifel zur HSL gegenstandslos. Die Puhekieli-Sätze 6466005 und 5488903 wurden aus `reuses` entfernt. Die übrigen Lernpfad-Sätze des Themas passen nicht (Tatoeba-Namen, Raumfahrt, Rettungsweste), deshalb ist `reuses` leer.
- Offen (Sachfrage): Stimmen die zentrale Kartensperre 020 333 und der Weg von Fundsachen aus HSL-Straßenbahnen ins löytötavaratoimisto noch?

## Verbleibende Zweifel (kurz)
1. `time` Z7/8: *huomen*: Ist die Form helsinkiisch oder regional?
2. `health`: Duzen oder Siezen durch die Pflegerin am Telefon?
3. `emergency`: Sachstand 020 333 und Fundbüro.
4. Verteilung: 4 Dialoge Standard und 9 Puhekieli. `shopping` (Freunde ohne Verkäufer) und `cafe` (Essen zu Hause) erreichen ihr Themenziel „bezahlen“ bzw. „bestellen“ nur indirekt. Das ließe sich nur mit Standard-Szenen und dem Verlust fast aller Lernpfad-Sätze ändern, deshalb wurde es nicht geändert.
