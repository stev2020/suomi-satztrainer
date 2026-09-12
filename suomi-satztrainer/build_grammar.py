"""Build sentence-bound learning notes from explicitly selected words and constructions.
No suffix guessing: whole words/phrases must match. Original sentence data stays untouched.
"""
import json,re
from pathlib import Path
ROOT=Path(__file__).parent
rules=[]
def rule(forms,title,text,priority=5):
    for form in forms.split('|'):
        rules.append((form,title,text,priority))
def entries(title,lines,priority=5):
    for line in lines.strip().splitlines():
        forms,text=line.split(' :: ',1);rule(forms,title,text,priority)

entries('Haben und Befinden', '''
minulla on :: Wörtlich „bei mir ist“: minulla on bedeutet „ich habe“. Finnisch verwendet hier olla (sein), kein eigenes Verb wie das deutsche „haben“.
sinulla on|onko sinulla :: sinulla bedeutet „bei dir“. Zusammen mit on entsteht „du hast“, mit onko die Frage „hast du?“.
tomilla on :: Tomilla ist die -lla-Form von Tomi. Tomilla on bedeutet „Tomi hat“; das Verb steht im Singular.
linnuilla on :: linnuilla ist die Mehrzahlform mit -lla: „bei den Vögeln“. Die Konstruktion bedeutet „Vögel haben“.
oppilailla on :: oppilailla bedeutet „bei den Schülern“. Mit on tylsää wird daraus „den Schülern ist langweilig“.
pojalla on :: poika → pojalla: „bei dem Jungen“. Pojalla on bedeutet „der Junge hat“; dabei verändert sich k zu j.
meillä on :: meillä on heißt „wir haben“. meillä bezeichnet die besitzende Personengruppe, on bleibt im Singular.
minulla ei ole|tomilla ei ole|sinulla ei ole :: „Nicht haben“ wird mit Besitzerform + ei ole ausgedrückt. Die verneinte Sache steht hier im Partitiv.
minulla on ollut :: on ollut ist das Perfekt von olla. In dieser Besitzkonstruktion bedeutet minulla on ollut „ich habe … gehabt“.
''',1)
entries('Vergangenheit mit Hilfsverb (Perfekt)', '''
olen nähnyt|olen aina halunnut|olen asunut|oletko koskaan tehnyt|ei ole vielä suudellut|en ole lukenut|en ole voinut|en ole tottunut :: Hier steht eine Form von olla zusammen mit einem Partizip wie nähnyt, tehnyt oder lukenut. Das Perfekt verbindet Vergangenes mit der Gegenwart; in der Verneinung steht en/ei + ole + Partizip.
''',1)
entries('Müssen und Sollen', '''
minun täytyy :: Die Person steht im Genitiv: minun = „mein/von mir“. Minun täytyy + Grundform bedeutet „ich muss …“. täytyy bleibt dabei unverändert.
meidän pitäisi|sinun pitäisi :: pitäisi heißt hier „sollte“. Die Person steht im Genitiv: meidän = „wir“, sinun = „du“ in dieser Konstruktion. Danach folgt die Grundform des Verbs.
minun olisi pitänyt :: olisi pitänyt drückt eine nicht erfüllte Pflicht in der Vergangenheit aus: „ich hätte … sollen“. Danach steht die Grundform, hier ottaa.
''',1)
entries('Bedingung und Nebensatz', '''
jos :: jos bedeutet „wenn/falls“ und leitet eine Bedingung ein. Ein Konditional ist nicht automatisch nötig: Auch das Präsens kann eine mögliche künftige Situation beschreiben.
että :: että bedeutet „dass“ und leitet hier einen Nebensatz ein. Das finnische Verb muss darin nicht wie im Deutschen ans Satzende.
jossa :: jossa heißt „in dem/in der“. Es ist die -ssa-Form des Relativpronomens joka und bezieht sich hier auf einen zuvor genannten Ort.
''',3)
entries('Möglichkeit und höfliche Bitte (Konditional)', '''
voisitko :: voi-si-t-ko: „könntest du?“. -isi- kennzeichnet den Konditional, -t die du-Form und -ko die Frage. So wird eine Bitte höflicher.
haluaisitko :: „Möchtest du?“ ist die Frageform des Konditionals von haluta. Die Endung verbindet -isi- (würde), -t (du) und -ko (Frage).
haluaisin :: „Ich möchte / ich würde gern“: Konditional von haluta. -isi- bezeichnet die Möglichkeitsform, -n die ich-Form.
tekisin :: tehdä → tekisin: „ich würde machen“. Der Konditional verwendet -isi-; der Verbstamm verändert sich dabei.
tekisi|pitäisi :: Nach dem Verneinungsverb steht die Konditionalform ohne persönliche Endung: en tekisi = „ich würde nicht machen“, ei pitäisi = „würde nicht mögen/sollen“, je nach Konstruktion.
olisi|osaisit|laittaisitko :: Hier drückt -isi- eine Möglichkeit, Vorstellung oder höfliche Bitte aus. Vergleiche olisi „wäre“, osaisit „du könntest“ und laittaisitko „würdest du … einschalten/legen?“.
''',2)
entries('Verneinte Vergangenheit', '''
en löytänyt|en kestänyt|en ollut|en odottanut|en puhunut|en laulanut|en juonut|en syönyt :: Die verneinte einfache Vergangenheit besteht aus en („ich nicht“) und dem Partizip des Hauptverbs. Deshalb heißt es etwa en puhunut, nicht en puhuin.
''',1)
entries('Verneinung', '''
en|etkö|ei|emme|enkä :: Finnisch hat ein veränderliches Verneinungsverb: en = ich nicht, et = du nicht, ei = er/sie/es nicht, emme = wir nicht. Etkö fragt „… du nicht?“, enkä verbindet „und ich nicht“. Die Form des folgenden Verbs richtet sich nach Zeitform und Konstruktion.
''',6)
entries('Aufforderung', '''
älä :: älä + Verb ist ein Verbot oder eine verneinte Aufforderung an eine Person: „Tu … nicht!“. Ein direktes Objekt steht dabei im Partitiv, etwa ovea.
anna :: Anna ist die Aufforderung an eine Person: „Gib!“. Grundform: antaa. Bei dieser Form entfällt das t des starken Stamms.
tule :: tule ist die Aufforderung „komm!“ von tulla. Das Personalpronomen wird dabei normalerweise weggelassen.
maista :: maista bedeutet „koste/probier!“, die Aufforderungsform von maistaa.
petaa :: petaa ist die Aufforderung von pedata: „mach (das Bett)!“. sänky bleibt hier als ganzes Objekt in der Grundform.
yritä :: yritä ist die Aufforderung „versuch!“ von yrittää. Hier wird daraus „versuch, nicht zu lachen“.
ota :: ota ist die Aufforderung „nimm!“ von ottaa. tt wird in dieser Form zu t.
soita :: soita ist die Aufforderung „ruf an!“ von soittaa. Der Empfänger wird mit -lle angegeben.
mene :: mene ist die Aufforderung „geh!“ von mennä. In mene nukkumaan bezeichnet das zweite Verb das Ziel: schlafen gehen.
tulkaa|yrittäkää :: Die Endung -kaa/-kää richtet eine Aufforderung an mehrere Personen oder höflich an eine Person: tulkaa „kommt/kommen Sie“, yrittäkää „versucht/versuchen Sie“.
''',3)
entries('Gemeinsamer Vorschlag', '''
leikitään|aloitetaan|mennään|pidetään|puhutaan|levätään|nähdään :: Diese Passivform wird hier als gemeinsamer Vorschlag oder feste Wendung verwendet: etwa mennään „gehen wir!“, pidetään „machen/halten wir“ oder nähdään „wir sehen uns“. Eine handelnde Person wird nicht ausdrücklich genannt.
''',2)
entries('Passiv in der Vergangenheit', '''
huijattiin|tehtiin :: Die Passivform der Vergangenheit nennt nicht, wer gehandelt hat: huijattiin „man hat betrogen“, tehtiin „man hat gemacht“. Sie wird oft mit einem deutschen Passiv übersetzt.
''',2)
entries('Mögen mit -sta/-stä', '''
pidän|pidätkö|pidättekö|pidittekö|en pidä :: pitää im Sinn von „mögen“ verlangt die -sta/-stä-Form (Elativ). Lerne Verb und Ergänzung zusammen: pidän siitä = „ich mag das“.
''',2)
entries('Vergleichen', '''
vahvempi|nuorempi|kylmempi|rikkaampi :: Die Form auf -mpi ist der Komparativ: stärker, jünger, kälter oder reicher. Die Vergleichsperson/-sache steht hier im Partitiv, etwa sinua „als du“ oder minua „als ich“.
älykkäämpi :: -mpi bildet den Komparativ „intelligenter“. kuin leitet den Vergleich ein: „als“. älykäs verändert seinen Stamm zu älykkää-.
parempi :: parempi ist die unregelmäßige Steigerung von hyvä: „besser“. Lerne hyvä – parempi – paras zusammen.
paras :: paras bedeutet „der/die/das Beste“. Die Steigerung von hyvä ist unregelmäßig: hyvä – parempi – paras.
pisin :: pisin ist der Superlativ von pitkä: „der/die/das längste/größte“. luokan gibt hier die Vergleichsgruppe an: „der Klasse“.
useammin :: useammin ist die Steigerung des Adverbs usein: „öfter“. kuin bedeutet im anschließenden Vergleich „als“.
''',2)
entries('Richtung beim zweiten Verb', '''
uimaan|istumaan|nukkumaan|haistamaan :: Die Form auf -maan/-mään ist der sogenannte dritte Infinitiv im Illativ. Sie steht hier nach dem ersten Verb: etwa oppia uimaan „schwimmen lernen“ oder mennä nukkumaan „schlafen gehen“.
nauramatta :: -matta/-mättä bedeutet bei einem Verb „ohne zu …“. olla nauramatta heißt hier „nicht lachen“ beziehungsweise „ohne zu lachen bleiben“.
''',3)
entries('Ort: wo? (Inessiv)', '''
espanjassa|bostonissa|yliopistossa|suihkussa|koulussa|varjossa :: -ssa/-ssä bezeichnet hier einen Ort, an dem etwas stattfindet: „in/bei …“. Es beantwortet die Frage missä? („wo?“), nicht „wohin?“.
huoneessaan :: huone → huoneessa („im Zimmer“) → huoneessaan („in seinem/ihrem Zimmer“). Nach der Ortsendung folgt hier eine Besitzendung, die auf das Satzsubjekt verweist.
suunnitelmassamme :: suunnitelma-ssa-mme: „in unserem Plan“. -ssa bedeutet „in“, -mme bedeutet „unser“.
''',4)
entries('Ort oder Zeitpunkt mit -lla/-llä', '''
pöydällä :: pöytä → pöydällä: „auf dem Tisch“. -llä bezeichnet hier eine Oberfläche; im Stamm wird t zu d.
aamulla :: aamu → aamulla: „am Morgen“. Die Endung -lla wird auch für bestimmte Zeitangaben verwendet.
lomalla :: loma → lomalla: „im Urlaub“. Diese feste Verbindung verwendet die -lla-Form.
maatilalla :: maatila → maatilalla: „auf einem Bauernhof“. Der Ort steht hier in der -lla-Form.
tällä viikolla :: „In dieser Woche“: Sowohl tämä als auch viikko stehen in der -lla-Form. Begleiter und Nomen stimmen im Fall überein.
''',4)
entries('Richtung: wohin? (Illativ)', '''
kauppaan|pankkiin|puutarhaan|hotelliin|bostoniin|huoneeseen|parturiin :: Diese Form bezeichnet ein Ziel: „in/zu …“. Häufig werden dafür der letzte Vokal verlängert und -n angehängt, wie pankki → pankkiin.
kotiin :: kotiin bedeutet „nach Hause“ und bezeichnet eine Richtung. Vergleiche kotona „zu Hause“ für den Aufenthaltsort.
''',4)
entries('Empfänger oder Ziel mit -lle (Allativ)', '''
minulle|sinulle|hänelle|meille|tomille|marille|teille :: Die -lle-Form bezeichnet hier den Empfänger oder die Person, für die etwas bestimmt ist: minulle „mir/für mich“, hänelle „ihm/ihr“.
sohvalle :: sohva → sohvalle: „aufs Sofa“. -lle bezeichnet hier ein Ziel auf einer Oberfläche; vergleiche sohvalla „auf dem Sofa“.
''',4)
entries('Ausgangspunkt oder Thema mit -sta/-stä', '''
huoneesta :: huone → huoneesta: „aus dem Zimmer“. -sta/-stä beantwortet hier die Frage „woher?“.
bostonista|tomista|minusta|sinusta|uutisesta :: Diese -sta/-stä-Form kann „aus/von/über“ bedeuten. Welche deutsche Form passt, hängt vom Verb oder Ausdruck ab: etwa puhua minusta „über mich sprechen“ oder ylpeä sinusta „stolz auf dich“.
''',7)
entries('Besitzendung', '''
lasini|kissani|tyttäreni|veljeäni|kissaani|elämääni|vuoroni|kelloni :: -ni bedeutet „mein“. Es kann auch auf eine Fallendung folgen: etwa kissa-a-ni = „meine Katze“ im Partitiv.
laukkusi|autosi|juomasi|isäsi|kirjeesi|viestini|sanakirjaasi :: Die angehängte Besitzendung nennt den Besitzer: -si „dein“, -ni „mein“. In der Wortform können davor weitere Änderungen für den Fall stehen.
silmänsä|aikaansa :: Hier verweist die Besitzendung auf das Subjekt: silmänsä = „seine/ihre Augen“, aikaansa = „seine/ihre Zeit“. Die genaue Zahl und der Fall ergeben sich auch aus dem Satz.
''',5)
entries('Grundform nach einem Verb', '''
haluan|haluatko|haluaa|halusi|halua|osaatko|osaa|osaat|voinko|voitko|voit|saattaa :: Wenn ein weiteres Verb folgt, steht es hier in der Grundform: etwa haluan nukkua „ich will schlafen“, osaa korjata „kann reparieren“ oder voit luottaa „du kannst vertrauen“.
''',8)
entries('Partitiv: Sprache, Menge oder Objekt', '''
ranskaa|turkkia|arabiaa|matematiikkaa :: Die Fach- oder Sprachbezeichnung steht hier im Partitiv. Diese Form folgt in diesen Beispielen auf Verben wie lernen, sprechen, verstehen oder lieben.
lihaa|kalaa|kananmunaa|maitoa|kahvia|ruokaa|leipää|olutta|lunta :: Dieses Wort steht hier im Partitiv. Bei Lebensmitteln und Stoffen bezeichnet er oft eine nicht abgegrenzte Menge: etwa maitoa „Milch/etwas Milch“.
lukee kirjaa|kirjoittaa romaania :: Das Partitivobjekt betrachtet hier die Tätigkeit als Verlauf, ohne ein abgeschlossenes Ganzes hervorzuheben: etwa lukea kirjaa „ein Buch lesen / gerade darin lesen“.
sinua|minua|heitä|meitä :: Dies ist die Partitivform eines Personalpronomens: sinua „dich“, minua „mich“, heitä „sie“, meitä „uns“. Der Fall wird hier von der Satzkonstruktion beziehungsweise dem Verb verlangt.
''',8)
entries('Verb mit Partitivobjekt', '''
rakastan|rakastaa :: rakastaa („lieben“) verlangt ein Objekt im Partitiv: etwa sinua („dich“) oder merta („das Meer“). Lerne diesen Fall zusammen mit dem Verb.
etsin :: etsiä („suchen“) verwendet hier ein Partitivobjekt: etwa työtä („Arbeit“) oder veljeäni („meinen Bruder“). etsin ist die ich-Form im Präsens.
''',4)
entries('W-Frage', '''
missä :: missä fragt „wo?“, also nach einem Aufenthaltsort. Ein Fragewort braucht hier kein zusätzliches -ko/-kö am Verb.
minne :: minne fragt „wohin?“ und damit nach einer Richtung. Vergleiche missä „wo?“.
mistä :: mistä fragt je nach Zusammenhang „woher?“, „woraus?“ oder „worüber?“.
mitä :: mitä ist eine Form von mikä („was“) im Partitiv. Sie fragt hier nach dem Gegenstand oder Inhalt der Handlung.
miten|kuinka :: miten und kuinka fragen nach dem „Wie“. In Kombination mit einem Mengen- oder Eigenschaftswort entsteht etwa „wie viele“ oder „wie lang“.
kuka|ketkä :: kuka fragt „wer?“ im Singular, ketkä „wer?“ bei mehreren Personen. Dazu passt hier ein Verb im Singular beziehungsweise Plural.
miksi :: miksi fragt nach dem Grund: „warum?“.
''',9)
entries('Sein (olla)', '''
olen :: olen ist die ich-Form von olla: „ich bin“. Das Pronomen minä kann meistens entfallen, weil -n die Person bereits zeigt.
olet :: olet ist die du-Form von olla: „du bist“. -t kennzeichnet hier die zweite Person Singular.
olemme :: olemme bedeutet „wir sind“. Die Endung -mme kennzeichnet die erste Person Plural.
ovat :: ovat bedeutet „sie sind“. Es ist die Form von olla für mehrere Personen oder Dinge.
''',10)
# Explicitly selected past-tense forms, not a heuristic based on final letters.
rule('opiskelin|pesin|opiskeli|opetti|ostit|paistoi|meni|aukaisin|synnyit|tulin|joi|söi|luit|luki|oppi|sulki|kirjoitin|olin|tuli|käänsi|oli|menivät|nukahti|punastuivat|yllättyivät|istuutuivat|myönsi|yritimme|seurasiko|puhkesi|otti|hyppäsin|hävisitkö|itkitkö|sairastuin|vilustuin|nukahdinko|lupasin|heräsin|puhuitko|haukkui|nauroiko|saitko|keskeytinkö|voittivat|löysin|auttoi|ilahduin|näin|seurasin|olitko|kasvoin|näin|lähdin|tiesin|join|avasin|söin|nukkuivat|lauloin|pidittekö|otin|lauloi|soitti|pyöräili|heilutti|avasi|palasi|sammutti|tein|lepäsin|kertoi|ostin|olit|soitin|satoi|tapasin|opiskelitko|luin|autoin|sanoitko|halusit|antoi|annoinko|myi|oliko|kasvoit|uskoin|sanoi|soitit|luulin', 'Einfache Vergangenheit (Imperfekti)', 'Diese Verbform erzählt von einer vergangenen Handlung oder Situation. Oft ist ein -i- erkennbar; der Stamm kann sich verändern, etwa nähdä → näin („ich sah“). Eine deutsche Perfektübersetzung ist ebenfalls möglich.',7)
# Exact present forms with person-specific explanations.
rule('opiskelen|kuuntelen|etsin|rakastan|ymmärrän|syön|matkustan|tanssin|käyn|painan|menen|uskon|kerron|tiedän|aivastelen|puhunko|toivon|luulen|teen|avaan|pysyn','Ich-Form im Präsens','Die Endung -n kennzeichnet hier „ich“. Ein zusätzliches minä ist meist nicht nötig. Finnisch verwendet das Präsens je nach Zusammenhang auch für zukünftige Handlungen.',10)
rule('opiskelee|kutoo|laulaa|maksaa|juo|lukee|kirjoittaa|sulaa|opettaa|rakastaa|ajaa|opettelee|tuntee|kiinnostaa|pelaa|syö|itkevät|tykkää|tuhlaa|kuulostaa|haittaa|alkaa|ymmärtää|sataa|sopii','Verb im Präsens','Das Verb beschreibt hier eine gegenwärtige oder allgemeine Handlung. Anders als im Deutschen gibt es im Finnischen keine besondere Verlaufsform für „gerade etwas tun“.',11)
rule('tapaamme|tarvitsemme|opiskelemme|teemme|menemme','Wir-Form im Präsens','Die Endung -mme kennzeichnet „wir“. Das Pronomen me kann ergänzend stehen, muss aber nicht wiederholt werden.',8)
rule('nukkuvat|tanssivat|myyvät|katsovat|kulkevat','Mehrzahl beim Verb','Die Endung -vat/-vät kennzeichnet hier die dritte Person Plural: Mehrere Personen oder Dinge handeln. Das Verb stimmt in der Standardsprache mit dem Subjekt überein.',8)
# Whitelisted question forms: never treat arbitrary words ending in ko as verbs.
rule('onko|syötkö|nukkuvatko|nukkuuko|asutteko|paljonko|toimiiko|olemmeko|maistuuko|viihdytkö|pidätkö|tunnetko|tarvitsemmeko|pidättekö|sopiiko|haittaako|pystytkö|ehditkö|haluatko|osaatko','Ja/Nein- oder Mengenfrage','Die angehängte Fragepartikel -ko/-kö macht hier eine Frage: on → onko („ist …?“), syöt → syötkö („isst du?“). Bei paljonko entsteht die Mengenfrage „wie viel?“.',8)

# Dedicated notes take precedence where a sentence needs a specific explanation.
SPECIAL={}
def special(id,focus,title,text): SPECIAL.setdefault(str(id),[]).append({'focus':focus,'title':title,'text':text})
# The remaining exact sentence annotations are kept separately for easy review.
extra=ROOT/'sources/grammar-specific.tsv'
if extra.exists():
    for line in extra.read_text().splitlines():
        if line and not line.startswith('#'): special(*line.split('\t',3))

def notes_for(s):
    notes=list(SPECIAL.get(str(s['id']),[]));seen={n['title'] for n in notes}
    for form,title,text,priority in sorted(rules,key=lambda r:(r[3],-len(r[0]))):
        match=re.search(r'(?<!\w)'+re.escape(form)+r'(?!\w)',s['text'],re.I)
        if match and title not in seen:
            notes.append({'focus':match.group(),'title':title,'text':text});seen.add(title)
        if len(notes)>=3:break
    return notes
if __name__=='__main__':
    if (ROOT/'sources/grammar-baseline.json').exists():
        from build_import_grammar import build
        raise SystemExit(0 if build() else 1)
    deck=json.loads((ROOT/'dist/sentences.json').read_text())
    cards=deck['sentences']+deck.get('archived_sentences',[])
    notes={str(s['id']):{'sentence':s['text'],'notes':notes_for(s)} for s in cards if notes_for(s)}
    out={'description':'Von KI formulierte Lernhilfen; keine vollständige Satzanalyse. Zuordnung über ausdrücklich ausgewählte Wörter und Konstruktionen.', 'reference':'https://uusikielemme.fi/finnish-grammar','sentences':notes}
    (ROOT/'dist/grammar.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    missing=[s for s in deck['sentences'] if str(s['id']) not in notes]
    print('Active coverage:',len(deck['sentences'])-len(missing),'/',len(deck['sentences']))
    for s in missing:print(s['id'],s['text'])
