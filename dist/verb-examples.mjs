// Beispielsätze und Satzmuster für die 50 wichtigsten Verben (Lösungskarte der Verbübung).
// Für Vanamo geschrieben – keine Tatoeba-Sätze. Kurz, Präsens, Standardsprache.
//
// PATTERNS: Verben, deren Bedeutung erst mit ihrer Konstruktion klar wird (Fall, Infinitiv, Genitiv).
//   Jedes Muster: label (was es ausdrückt + Bauplan), fi, de.
// EXAMPLES: ein bis zwei typische Sätze für die übrigen Verben.

export const VERB_PATTERNS = {
 olla: [
  {label: 'Wo? · olla + -ssa/-lla', fi: 'Olen nyt Suomessa.', de: 'Ich bin jetzt in Finnland.'},
  {label: 'Haben · -lla + on', fi: 'Minulla on koira.', de: 'Ich habe einen Hund.'},
  {label: 'Wer oder was? · olla + Nomen', fi: 'Hän on opettaja.', de: 'Sie ist Lehrerin.'},
  {label: 'Es gibt · Ort + on + Nomen', fi: 'Täällä on hyvä kahvila.', de: 'Hier gibt es ein gutes Café.'}
 ],
 mennä: [
  {label: 'Wohin? · mennä + -Vn/-hin/-lle', fi: 'Menen Helsinkiin.', de: 'Ich fahre nach Helsinki.'},
  {label: 'Etwas tun gehen · mennä + -maan', fi: 'Menen nukkumaan.', de: 'Ich gehe schlafen.'},
  {label: 'Womit? · mennä + -lla', fi: 'Menen töihin bussilla.', de: 'Ich fahre mit dem Bus zur Arbeit.'}
 ],
 tulla: [
  {label: 'Woher? · tulla + -sta/-lta', fi: 'Tulen Saksasta.', de: 'Ich komme aus Deutschland.'},
  {label: 'Wohin? · tulla + -Vn/-lle', fi: 'Tuletko huomenna meille?', de: 'Kommst du morgen zu uns?'},
  {label: 'Werden · -sta tulee + Nomen', fi: 'Hänestä tulee lääkäri.', de: 'Er wird Arzt.'}
 ],
 käydä: [
  {label: 'Irgendwo sein, hin und zurück · käydä + -ssa/-lla', fi: 'Käyn usein Helsingissä.', de: 'Ich bin oft in Helsinki.'},
  {label: 'Kurz etwas erledigen · käydä + -ssa', fi: 'Käyn kaupassa.', de: 'Ich gehe kurz einkaufen.'},
  {label: 'Regelmäßig besuchen · käydä + Partitiv', fi: 'Lapsi käy koulua.', de: 'Das Kind geht zur Schule.'}
 ],
 saada: [
  {label: 'Bekommen · saada + Objekt', fi: 'Saan paljon sähköposteja.', de: 'Ich bekomme viele E-Mails.'},
  {label: 'Dürfen · saada + Infinitiv', fi: 'Saanko istua tähän?', de: 'Darf ich mich hierher setzen?'},
  {label: 'Höflich bestellen · Saisinko …?', fi: 'Saisinko kahvin?', de: 'Könnte ich einen Kaffee bekommen?'}
 ],
 voida: [
  {label: 'Können · voida + Infinitiv', fi: 'Voin tulla huomenna.', de: 'Ich kann morgen kommen.'},
  {label: 'Bitten · Voitko …?', fi: 'Voitko auttaa minua?', de: 'Kannst du mir helfen?'},
  {label: 'Befinden · voida hyvin', fi: 'Miten voit? – Voin hyvin.', de: 'Wie geht es dir? – Mir geht es gut.'}
 ],
 pitää: [
  {label: 'Mögen · pitää + -sta', fi: 'Pidän kahvista.', de: 'Ich mag Kaffee.'},
  {label: 'Müssen · Genitiv + pitää + Infinitiv', fi: 'Minun pitää lähteä nyt.', de: 'Ich muss jetzt los.'},
  {label: 'Halten · pitää + Objekt', fi: 'Hän pitää lasta sylissä.', de: 'Sie hält das Kind auf dem Arm.'}
 ],
 täytyä: [
  {label: 'Müssen · Genitiv + täytyy + Infinitiv', fi: 'Minun täytyy mennä.', de: 'Ich muss gehen.'},
  {label: 'Auch mit Namen · Genitiv + täytyy', fi: 'Annan täytyy tehdä töitä.', de: 'Anna muss arbeiten.'},
  {label: 'Nicht müssen · Genitiv + ei tarvitse', fi: 'Sinun ei tarvitse tulla.', de: 'Du musst nicht kommen.'}
 ]
};

export const VERB_EXAMPLES = {
 tehdä: [{fi: 'Mitä teet huomenna?', de: 'Was machst du morgen?'}],
 haluta: [{fi: 'Haluan oppia suomea.', de: 'Ich möchte Finnisch lernen.'}],
 tietää: [{fi: 'Tiedätkö, missä asema on?', de: 'Weißt du, wo der Bahnhof ist?'}],
 tuntea: [{fi: 'Tunnetko Mikkoa?', de: 'Kennst du Mikko?'}],
 nähdä: [{fi: 'Näen meren ikkunasta.', de: 'Ich sehe das Meer vom Fenster aus.'}],
 katsoa: [{fi: 'Katsomme elokuvaa illalla.', de: 'Wir schauen am Abend einen Film.'}],
 kuulla: [{fi: 'Kuuletko minua?', de: 'Hörst du mich?'}],
 kuunnella: [{fi: 'Kuuntelen musiikkia bussissa.', de: 'Ich höre im Bus Musik.'}],
 sanoa: [{fi: 'Mitä sinä sanot tästä?', de: 'Was sagst du dazu?'}],
 puhua: [{fi: 'Puhutko englantia?', de: 'Sprichst du Englisch?'}],
 kysyä: [{fi: 'Kysyn opettajalta.', de: 'Ich frage die Lehrerin.'}],
 vastata: [{fi: 'Vastaan viestiin huomenna.', de: 'Ich antworte morgen auf die Nachricht.'}],
 ymmärtää: [{fi: 'Ymmärrätkö suomea?', de: 'Verstehst du Finnisch?'}],
 ajatella: [{fi: 'Ajattelen sinua.', de: 'Ich denke an dich.'}],
 uskoa: [{fi: 'Uskon, että huomenna sataa.', de: 'Ich glaube, dass es morgen regnet.'}],
 muistaa: [{fi: 'Muistatko hänen nimensä?', de: 'Erinnerst du dich an seinen Namen?'}],
 unohtaa: [{fi: 'Unohdan aina avaimet kotiin.', de: 'Ich vergesse die Schlüssel immer zu Hause.'}],
 opiskella: [{fi: 'Opiskelen yliopistossa.', de: 'Ich studiere an der Universität.'}],
 oppia: [{fi: 'Lapset oppivat nopeasti.', de: 'Kinder lernen schnell.'}],
 lukea: [{fi: 'Luen kirjaa sängyssä.', de: 'Ich lese im Bett ein Buch.'}],
 kirjoittaa: [{fi: 'Kirjoitan ystävälle kirjettä.', de: 'Ich schreibe einer Freundin einen Brief.'}],
 syödä: [{fi: 'Syömme lounasta kahdeltatoista.', de: 'Wir essen um zwölf zu Mittag.'}],
 juoda: [{fi: 'Juon aamulla kahvia.', de: 'Morgens trinke ich Kaffee.'}],
 nukkua: [{fi: 'Nukun yleensä kahdeksan tuntia.', de: 'Ich schlafe meistens acht Stunden.'}],
 herätä: [{fi: 'Herään joka aamu kuudelta.', de: 'Ich wache jeden Morgen um sechs auf.'}],
 asua: [{fi: 'Asun Berliinissä.', de: 'Ich wohne in Berlin.'}],
 elää: [{fi: 'Kalat elävät vedessä.', de: 'Fische leben im Wasser.'}],
 työskennellä: [{fi: 'Työskentelen sairaalassa.', de: 'Ich arbeite in einem Krankenhaus.'}],
 ostaa: [{fi: 'Ostan kaupasta leipää.', de: 'Ich kaufe im Laden Brot.'}],
 myydä: [{fi: 'He myyvät vanhan autonsa.', de: 'Sie verkaufen ihr altes Auto.'}],
 maksaa: [{fi: 'Paljonko tämä maksaa?', de: 'Wie viel kostet das?'}, {fi: 'Maksan kortilla.', de: 'Ich zahle mit Karte.'}],
 antaa: [{fi: 'Annan sinulle kirjan.', de: 'Ich gebe dir das Buch.'}],
 ottaa: [{fi: 'Otan kahvin, kiitos.', de: 'Ich nehme einen Kaffee, danke.'}],
 käyttää: [{fi: 'Käytän tätä sovellusta joka päivä.', de: 'Ich benutze diese App jeden Tag.'}],
 löytää: [{fi: 'En löydä avaimiani.', de: 'Ich finde meine Schlüssel nicht.'}],
 etsiä: [{fi: 'Etsin työtä.', de: 'Ich suche Arbeit.'}],
 odottaa: [{fi: 'Odotan sinua asemalla.', de: 'Ich warte am Bahnhof auf dich.'}],
 auttaa: [{fi: 'Autan sinua mielelläni.', de: 'Ich helfe dir gern.'}],
 tarvita: [{fi: 'Tarvitsen apua.', de: 'Ich brauche Hilfe.'}],
 alkaa: [{fi: 'Elokuva alkaa kahdeksalta.', de: 'Der Film beginnt um acht.'}],
 lopettaa: [{fi: 'Lopetan työt viideltä.', de: 'Ich höre um fünf mit der Arbeit auf.'}],
 jättää: [{fi: 'Jätän laukun tähän.', de: 'Ich lasse die Tasche hier.'}, {fi: 'Hän jättää työnsä.', de: 'Sie gibt ihre Stelle auf.'}]
};

export function verbUsage(id) {
 if (VERB_PATTERNS[id]) return {kind: 'patterns', items: VERB_PATTERNS[id]};
 if (VERB_EXAMPLES[id]) return {kind: 'examples', items: VERB_EXAMPLES[id]};
 return null;
}
