# Suomi-Satztrainer starten

Diese ZIP enthält den vollständigen Stand der veröffentlichten App, einschließlich 4.467 aktiver Sätze, 226 Archivkarten, Übersetzungen, Grammatikhilfen und aller Funktionen. Die 4.115 erlaubten Originalaufnahmen werden weiterhin von Tatoeba geladen und sind deshalb nicht als MP3-Dateien enthalten.

## Lokal starten

1. Installiere Node.js 18 oder neuer.
2. Entpacke die ZIP-Datei.
3. Öffne ein Terminal im entpackten Ordner.
4. Führe `npm start` aus.
5. Öffne `http://localhost:4173` im Browser.

Es werden keine Pakete installiert und kein `node_modules`-Ordner benötigt. `npm test` prüft die Grammatik-Themen und wichtige Lernabläufe.

## Mit GitHub Pages veröffentlichen

1. Lade den Inhalt dieses Ordners in ein öffentliches GitHub-Repository namens `suomi-satztrainer` hoch.
2. Öffne dort **Settings → Pages**.
3. Wähle unter **Build and deployment → Source** den Eintrag **GitHub Actions**.
4. Der enthaltene Workflow veröffentlicht den Ordner `dist/`. Nach erfolgreichem Lauf findest du die Adresse unter **Settings → Pages**.

Die App benötigt keine Datenbank und keinen Servercode. Für die Audiowiedergabe brauchen die Nutzer eine Internetverbindung zu Tatoeba. Die Audiodateien sind nicht Bestandteil dieses Projekts.

Die App darf mit den enthaltenen Tatoeba-Aufnahmen nur kostenlos und nichtkommerziell angeboten werden. Erhalte die Quellenangaben in der App und `THIRD_PARTY_NOTICES.md`. Die 138 Aufnahmen ohne Wiederverwendungsfreigabe sind nicht verlinkt und nicht enthalten.
