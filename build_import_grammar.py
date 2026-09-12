"""Complete grammar notes with curated exact forms and sentence-specific overrides.

Preserves the previous notes. Never guesses a word's case from a suffix.
Sources contain authored German explanations, not scraped reference text.
"""
import json
import re
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent

def load_rules():
    rules = []
    for line in (ROOT / 'sources/grammar-extra-verbs.tsv').read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        tense, lemma, meaning, forms = line.split('\t')
        for form in forms.split('|'):
            time_note = {'past': 'Die Form steht im Imperfekti, der einfachen Vergangenheit.',
                         'present': 'Die Form steht im Präsens; je nach Zusammenhang kann dieses auch auf die Zukunft verweisen.',
                         'ambiguous': 'Präsens und einfache Vergangenheit können bei dieser Form gleich aussehen. Zeitangaben und Zusammenhang bestimmen die zeitliche Lesart.'}[tense]
            question_note = ' Die angehängte Fragepartikel -ko/-kö macht daraus eine Frage.' if form.endswith(('ko', 'kö')) else ''
            rules.append((5, form, ('Vergangenheit: ' if tense == 'past' else 'Verbform: ') + lemma,
                          f'{lemma} bedeutet „{meaning}“; {form} ist eine gebeugte Form dieses Verbs. {time_note}{question_note}'))
    for line in (ROOT / 'sources/grammar-import-rules.tsv').read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        priority, forms, title, text = line.split('\t')
        for form in forms.split('|'):
            rules.append((int(priority), form, title, text))
    # Only explicit paradigms; no analysis of unknown suffixes. Ambiguous words
    # (e.g. tuli = fire/came, teen = tea-genitive/I do) need sentence notes instead.
    ambiguous = {'tuli', 'eli', 'etsi', 'oppi', 'tanssi', 'näin', 'soitin', 'vastaan', 'ajan', 'teen', 'palaan'}
    persons = ['erste Person Singular (ich)', 'zweite Person Singular (du)',
               'dritte Person Singular (er/sie/es)', 'erste Person Plural (wir)',
               'zweite Person Plural (ihr/höfliches Sie)', 'dritte Person Plural (sie)']
    for line in (ROOT / 'sources/grammar-verb-paradigms.tsv').read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        lemma, meaning, present, past = [v.strip() for v in line.split(';')]
        present = [v.strip() for v in present.split(',')]
        past = past.split(',')
        for i, form in enumerate(present):
            title = 'Verbform: ' + lemma
            text = f'{form} gehört zu {lemma} („{meaning}“): {persons[i]} im Präsens. Die Verbform zeigt die Person; das Präsens kann je nach Zusammenhang auch Zukünftiges bezeichnen.'
            if form in past:
                text = f'{form} gehört zu {lemma} („{meaning}“), {persons[i]}. Präsens und einfache Vergangenheit haben hier dieselbe Form; Zeitangaben und Zusammenhang zeigen, welche Zeit gemeint ist.'
            # Do not mislabel an imperative or connegative as third person.
            if i == 2 and form == present[0][:-1]:
                continue
            if form == lemma:
                text = f'{lemma} bedeutet „{meaning}“. Diese Form ist sowohl die Grundform (Infinitiv) als auch die dritte Person Singular im Präsens. Nach einem Modalverb steht meist der Infinitiv; als eigenes gebeugtes Verb beschreibt sie die Handlung einer Person oder Sache.'
            if form not in ambiguous:
                rules.append((5, form, title, text))
            question = form + ('ko' if any(c in form for c in 'aou') else 'kö')
            rules.append((3, question, 'Verbfrage: ' + lemma,
                          f'{question} = {form} + Fragepartikel -ko/-kö. Die Grundform ist {lemma} („{meaning}“); die gebeugte Form trägt die Personeninformation ({persons[i]}).'))
        for i, form in zip([0, 2], past):
            if form in present or form in ambiguous:
                continue
            rules.append((5, form, 'Vergangenheit: ' + lemma,
                          f'{lemma} („{meaning}“) → {form}: {persons[i]} im Imperfekti, der einfachen Vergangenheit. Auf Deutsch ist oft auch eine Übersetzung mit „hat/ist …“ üblich.'))
        if lemma not in present:
            rules.append((10, lemma, 'Infinitiv: ' + lemma,
                          f'{lemma} („{meaning}“) ist die Grundform des Verbs. Sie nennt die Tätigkeit, ohne selbst eine Person auszudrücken; nach Verben wie „wollen“ oder „können“ wird diese Infinitivform verwendet.'))
    return [(re.compile((r'^' + re.escape(form[1:]) if form.startswith('^') else r'(?<!\w)' + re.escape(form)) + r'(?!\w)', re.I), title, text)
            for priority, form, title, text in sorted(rules, key=lambda r: (r[0], -len(r[1])))]

def build():
    deck = json.loads((ROOT / 'dist/sentences.json').read_text())
    cards = deck['sentences'] + deck.get('archived_sentences', [])
    baseline = json.loads((ROOT / 'sources/grammar-baseline.json').read_text())
    rules = load_rules()
    specific = {}
    path = ROOT / 'sources/grammar-import-specific.tsv'
    if path.exists():
        for line in path.read_text().splitlines():
            if line and not line.startswith('#'):
                sid, focus, title, text = line.split('\t')
                specific.setdefault(sid, []).append(dict(focus=focus, title=title, text=text))
    result = {}
    missing = []
    for s in cards:
        sid = str(s['id'])
        old = baseline['sentences'].get(sid)
        if old and old['sentence'] == s['text']:
            result[sid] = old
            continue
        notes = list(specific.get(sid, []))
        seen = {n['title'] for n in notes}
        for pattern, title, text in rules:
            # A reviewed sentence override is complete, so generic matches cannot
            # contradict an idiom or a locally ambiguous form.
            if sid in specific or len(notes) >= 3:
                break
            match = pattern.search(s['text'])
            if match and title not in seen:
                notes.append(dict(focus=match.group(), title=title, text=text))
                seen.add(title)
        if not notes:
            missing.append(s)
            continue
        for n in notes:
            assert n['focus'].casefold() in s['text'].casefold(), (sid, n)
        result[sid] = dict(sentence=s['text'], notes=notes, method='curated_exact_forms_and_sentence_notes')
    output = dict(description='KI-formulierte Lernhilfen zu konkreten Wortformen und Konstruktionen; keine vollständige Satzanalyse.',
                  reference='https://uusikielemme.fi/finnish-grammar', sentences=result)
    print('Coverage:', len(result), '/', len(cards), 'Notes:', dict(Counter(len(v['notes']) for v in result.values())))
    (ROOT.parent / 'grammar-uncovered.json').write_text(json.dumps(missing, ensure_ascii=False, indent=2))
    if missing:
        print('Missing:', len(missing))
        return False
    assert len(result) == len(cards)
    (ROOT / 'dist/grammar.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    return True

if __name__ == '__main__':
    raise SystemExit(0 if build() else 1)
