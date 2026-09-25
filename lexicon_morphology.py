"""German learner labels for Voikko analyses.

Only used when preparing or merging lexicon annotations (requires libvoikko).
`build_lexicon.py build` reads the finished TSV and does not need Voikko.
"""
import re

CASES = {
    'nimento': 'Nominativ',
    'omanto': 'Genitiv',
    'osanto': 'Partitiv',
    'sisaolento': 'Inessiv „in“',
    'sisaeronto': 'Elativ „aus“',
    'sisatulento': 'Illativ „in … hinein“',
    'ulkoolento': 'Adessiv „auf, bei“',
    'ulkoeronto': 'Ablativ „von … weg“',
    'ulkotulento': 'Allativ „auf … zu, an“',
    'olento': 'Essiv „als“',
    'tulento': 'Translativ „zu … (werden)“',
    'vajanto': 'Abessiv „ohne“',
    'seuranto': 'Komitativ „mit“',
    'keinonto': 'Instruktiv',
    'kohdanto': 'Akkusativ',
}
POS = {
    'nimisana': 'Nomen', 'laatusana': 'Adjektiv', 'nimisana_laatusana': 'Adjektiv',
    'asemosana': 'Pronomen', 'lukusana': 'Zahlwort', 'teonsana': 'Verb',
    'seikkasana': 'Adverb', 'suhdesana': 'Postposition', 'sidesana': 'Konjunktion',
    'huudahdussana': 'Ausruf', 'etunimi': 'Name', 'sukunimi': 'Name',
    'paikannimi': 'Ortsname', 'nimi': 'Name', 'kieltosana': 'Verneinungsverb',
    'lyhenne': 'Abkürzung', 'etuliite': 'Vorsilbe',
}
PERSONS = {
    ('1', 'singular'): '1. Person Sg. (minä)', ('2', 'singular'): '2. Person Sg. (sinä)',
    ('3', 'singular'): '3. Person Sg. (hän)', ('1', 'plural'): '1. Person Pl. (me)',
    ('2', 'plural'): '2. Person Pl. (te)', ('3', 'plural'): '3. Person Pl. (he)',
}
NEG_PERSONS = {
    ('1', 'singular'): 'en = ich nicht', ('2', 'singular'): 'et = du nicht',
    ('3', 'singular'): 'ei = er/sie/es nicht', ('1', 'plural'): 'emme = wir nicht',
    ('2', 'plural'): 'ette = ihr nicht', ('3', 'plural'): 'eivät = sie nicht',
}
POSSESSIVE = {'1s': 'mein', '2s': 'dein', '3': 'sein/ihr', '1p': 'unser', '2p': 'euer'}
FOCUS = {'kin': '+ -kin „auch“', 'kaan': '+ -kaan/-kään „auch nicht, (nicht) einmal“'}
PARTICIPLES = {
    'present_active': 'Partizip Präsens aktiv (-va/-vä)',
    'past_active': 'Partizip Perfekt aktiv (-nut/-nyt)',
    'present_passive': 'Partizip Präsens passiv (-tava/-tävä)',
    'past_passive': 'Partizip Perfekt passiv (-tu/-ty)',
    'agent': 'Agens-Partizip (-ma/-mä)',
    'negation': 'Verneinendes Partizip (-maton/-mätön)',
}
MA_INF = {
    'sisatulento': '3. Infinitiv -maan/-mään „(um) zu“',
    'sisaolento': '3. Infinitiv -massa/-mässä „beim …, am …“',
    'sisaeronto': '3. Infinitiv -masta/-mästä „vom …“',
    'ulkoolento': '3. Infinitiv -malla/-mällä „indem, durch“',
    'vajanto': '3. Infinitiv -matta/-mättä „ohne zu“',
    'keinonto': '3. Infinitiv -man/-män „muss (tun)“',
}


def verb_lemma(analysis):
    """Participles and agent forms carry their own BASEFORM; the verb is in WORDBASES."""
    bases = analysis.get('WORDBASES', '')
    if analysis.get('PARTICIPLE'):
        match = re.search(r'\(([^)+]+)\)', bases)
        if match:
            return match.group(1)
    return analysis.get('BASEFORM', '')


def compound_parts(analysis):
    parts = [m for m in re.findall(r'\+[^+(]*\(([^)]+)\)', analysis.get('WORDBASES', ''))]
    parts = [p for p in parts if len(p) > 1 and not p.startswith('+')]
    return parts if len(parts) >= 2 else []


def clitics(analysis):
    out = []
    if analysis.get('POSSESSIVE') in POSSESSIVE:
        out.append(f"+ Possessivendung „{POSSESSIVE[analysis['POSSESSIVE']]}“")
    if analysis.get('FOCUS') in FOCUS:
        out.append(FOCUS[analysis['FOCUS']])
    if analysis.get('KYSYMYSLIITE') == 'true':
        out.append('+ Frageendung -ko/-kö')
    return out


def nominal_detail(analysis):
    parts = []
    case = analysis.get('SIJAMUOTO')
    if case == 'kerrontosti':
        return ['Adverbform (-sti) „auf … Weise“']
    if case in CASES:
        number = analysis.get('NUMBER')
        parts.append(CASES[case] + (' Plural' if number == 'plural' else ' Singular' if number == 'singular' and case != 'keinonto' else ''))
    comparison = analysis.get('COMPARISON')
    if comparison == 'comparative':
        parts.append('Komparativ')
    elif comparison == 'superlative':
        parts.append('Superlativ')
    return parts


def label(analysis, word):
    cls = analysis.get('CLASS', '')
    pos = POS.get(cls, 'Wort')
    mood, tense = analysis.get('MOOD'), analysis.get('TENSE')
    person, number = analysis.get('PERSON'), analysis.get('NUMBER')
    details = []
    if cls == 'kieltosana':
        if (person, number) in NEG_PERSONS:
            details.append(NEG_PERSONS[(person, number)])
        elif mood == 'imperative':
            details.append('Verbot (älä/älkää)')
    elif analysis.get('PARTICIPLE'):
        pos = 'Verbform'
        details.append(PARTICIPLES.get(analysis['PARTICIPLE'], 'Partizip'))
        case = analysis.get('SIJAMUOTO')
        if case and case != 'nimento':
            details += nominal_detail(analysis)
        elif number == 'plural':
            details.append('Plural')
    elif cls == 'teonsana':
        if mood == 'A-infinitive':
            details.append('Grundform (Infinitiv)' if not analysis.get('POSSESSIVE') else '1. Infinitiv, lange Form -akseen „um zu“')
        elif mood == 'E-infinitive':
            case = analysis.get('SIJAMUOTO')
            details.append('2. Infinitiv -essa/-essä „während, beim“' if case == 'sisaolento' else '2. Infinitiv -en „indem, …end“')
        elif mood == 'MA-infinitive':
            details.append(MA_INF.get(analysis.get('SIJAMUOTO'), '3. Infinitiv (-ma/-mä)'))
        elif mood == 'MINEN-infinitive':
            details.append('Verbalnomen (-minen) „das …“')
        else:
            if person == '4':
                details.append('Passiv (Umgangssprache auch: wir-Form)')
            elif (person, number) in PERSONS:
                details.append(PERSONS[(person, number)])
            if mood == 'imperative':
                details.insert(0, 'Imperativ')
                if person == '2' and number == 'singular':
                    details.append('auch Verneinungsform nach ei')
            elif mood == 'conditional':
                details.append('Konditional „würde“')
            elif mood == 'potential':
                details.append('Potential „wohl, wahrscheinlich“')
            elif tense == 'past_imperfective':
                details.append('Imperfekt (Vergangenheit)')
            elif tense == 'present_simple':
                details.append('Präsens')
    else:
        details += nominal_detail(analysis)
    details += clitics(analysis)
    return ' · '.join([pos] + details)


def candidates(voikko, word):
    seen, out = set(), []
    for analysis in voikko.analyze(word):
        lemma = verb_lemma(analysis)
        text = label(analysis, word)
        parts = compound_parts(analysis)
        key = (lemma, text)
        if key in seen:
            continue
        seen.add(key)
        out.append({'lemma': lemma, 'label': text, 'parts': parts, 'class': analysis.get('CLASS', ''),
                    'case': analysis.get('SIJAMUOTO', ''), 'number': analysis.get('NUMBER', ''),
                    'mood': analysis.get('MOOD', ''), 'participle': analysis.get('PARTICIPLE', '')})
    return out
