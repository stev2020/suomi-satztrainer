"""Word lookup (tap a word) for every active and archived sentence.

  python build_lexicon.py prepare   # needs libvoikko: batches for sentences not yet in the TSV
  python build_lexicon.py check NNN # validate one answers file while annotating
  python build_lexicon.py merge     # add answers to sources/lexicon-annotations.tsv (keeps existing rows)
  python build_lexicon.py build     # no Voikko: TSV -> dist/lexicon.json (validates coverage)

Morphology comes from Voikko (candidate analyses); the choice in context, the German
meaning and the short contextual rendering are AI annotations (Claude), reviewed
by rules below. Annotations are bound to the exact sentence text.
"""
import csv
import json
import pathlib
import sys
import unicodedata

ROOT = pathlib.Path(__file__).parent
WORK = ROOT / 'sources' / 'lexicon-work'
TSV = ROOT / 'sources' / 'lexicon-annotations.tsv'
OUT = ROOT / 'dist' / 'lexicon.json'
BATCH_SIZE = 200
FIELDS = ['sentence_id', 'index', 'token', 'lemma', 'meaning', 'form', 'here', 'parts', 'pos', 'case', 'number']


def strip_edges(word):
    is_ps = lambda ch: unicodedata.category(ch)[0] in 'PS'
    start, end = 0, len(word)
    while start < end and is_ps(word[start]):
        start += 1
    while end > start and is_ps(word[end - 1]):
        end -= 1
    return word[start:end]


def tokens(text):
    """Mirror of sentenceWords() in dist/word-practice.mjs."""
    text = unicodedata.normalize('NFC', str(text))
    return [w for w in (strip_edges(chunk) for chunk in text.split()) if w]


def all_sentences():
    payload = json.loads((ROOT / 'dist' / 'sentences.json').read_text(encoding='utf-8'))
    cards = payload['sentences'] + payload.get('archived_sentences', [])
    return [c for c in cards if c.get('translations')]


def voikko():
    import libvoikko
    return libvoikko.Voikko('fi')


def prepare():
    from lexicon_morphology import candidates
    v = voikko()
    done = existing_rows()
    cards = sorted((c for c in all_sentences()
                    if any(done.get(f"{c['id']}:{i}", {}).get('token') != t for i, t in enumerate(tokens(c['text'])))),
                   key=lambda c: (c['level'], c['id']))
    for old in (WORK / 'batches').glob('*.txt') if (WORK / 'batches').exists() else []:
        old.unlink()
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / 'batches').mkdir(exist_ok=True)
    (WORK / 'answers').mkdir(exist_ok=True)
    cache = {}
    index = {}
    for n in range(0, len(cards), BATCH_SIZE):
        lines = []
        for card in cards[n:n + BATCH_SIZE]:
            lines.append(f"#{card['id']} | {card['text']} | {card['translations'][0]['text']}")
            for i, tok in enumerate(tokens(card['text'])):
                if tok not in cache:
                    cache[tok] = candidates(v, tok) or candidates(v, tok.lower())
                cands = cache[tok]
                index[f"{card['id']}:{i}"] = {'token': tok, 'candidates': cands}
                shown = ' | '.join(f"[{chr(97 + k)}] {c['lemma']} = {c['label']}" for k, c in enumerate(cands)) or '(keine Analyse)'
                lines.append(f"  {i} {tok}: {shown}")
        (WORK / 'batches' / f'{n // BATCH_SIZE:03d}.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    (WORK / 'candidates.json').write_text(json.dumps(index, ensure_ascii=False), encoding='utf-8')
    print(f'{len(cards)} sentences, {len(index)} tokens, {len(cache)} forms, {(len(cards) - 1) // BATCH_SIZE + 1} batches')


def existing_rows():
    if not TSV.exists():
        return {}
    with TSV.open(encoding='utf-8') as f:
        return {f"{r['sentence_id']}:{r['index']}": r for r in csv.DictReader(f, delimiter='\t')}


def merge():
    """Add answers for the prepared batches to the existing TSV (existing rows are kept)."""
    cand = json.loads((WORK / 'candidates.json').read_text(encoding='utf-8'))
    rows, errors = existing_rows(), []
    for path in sorted((WORK / 'answers').glob('*.tsv')):
        for lineno, raw in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            if not raw.strip() or raw.startswith('#'):
                continue
            cols = raw.split('\t')
            if len(cols) < 5:
                errors.append(f'{path.name}:{lineno}: zu wenige Spalten'); continue
            cols += [''] * (8 - len(cols))
            sid, idx, tok, choice, lemma, meaning, form, here = [c.strip() for c in cols[:8]]
            key = f'{sid}:{idx}'
            info = cand.get(key)
            if not info:
                errors.append(f'{path.name}:{lineno}: unbekannter Token {key}'); continue
            if tok != info['token']:
                errors.append(f'{path.name}:{lineno}: Token {tok!r} ≠ {info["token"]!r}'); continue
            picked = None
            if choice and choice != '-':
                k = ord(choice[0]) - 97
                if len(choice) != 1 or not 0 <= k < len(info['candidates']):
                    errors.append(f'{path.name}:{lineno}: ungültige Wahl {choice}'); continue
                picked = info['candidates'][k]
                lemma = lemma or picked['lemma']
                if lemma != picked['lemma']:
                    errors.append(f'{path.name}:{lineno}: Grundform {lemma} passt nicht zu [{choice}] {picked["lemma"]}'); continue
                form = form or picked['label']
            if not lemma or not meaning or not form:
                errors.append(f'{path.name}:{lineno}: Grundform, Bedeutung oder Form fehlt'); continue
            rows[key] = {'sentence_id': sid, 'index': idx, 'token': tok, 'lemma': lemma, 'meaning': meaning,
                         'form': form, 'here': '' if here == meaning else here,
                         'parts': '+'.join(picked['parts']) if picked else '',
                         'pos': (picked or {}).get('class', ''), 'case': (picked or {}).get('case', ''),
                         'number': (picked or {}).get('number', '')}
    missing = [k for k in cand if k not in rows]
    for k in missing[:40]:
        errors.append(f'fehlt: {k} {cand[k]["token"]}')
    if errors:
        print('\n'.join(errors[:200])); print(f'{len(errors)} Fehler, {len(missing)} fehlende Tokens')
    live = {f"{c['id']}:{i}" for c in all_sentences() for i, _ in enumerate(tokens(c['text']))}
    order = sorted((r for k, r in rows.items() if k in live), key=lambda r: (int(r['sentence_id']), int(r['index'])))
    with TSV.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, delimiter='\t', lineterminator='\n')
        w.writeheader(); w.writerows(order)
    print(f'{len(order)} Zeilen geschrieben')
    if errors:
        sys.exit(1)


def build():
    cards = all_sentences()
    with TSV.open(encoding='utf-8') as f:
        rows = list(csv.DictReader(f, delimiter='\t'))
    by_sentence = {}
    for r in rows:
        by_sentence.setdefault(int(r['sentence_id']), {})[int(r['index'])] = r
    lemmas, lemma_index, forms, form_index, sentences, errors = [], {}, [], {}, {}, []
    for card in cards:
        toks, ann = tokens(card['text']), by_sentence.get(card['id'], {})
        entry = []
        for i, tok in enumerate(toks):
            r = ann.get(i)
            if not r or r['token'] != tok:
                errors.append(f"{card['id']}:{i} {tok}"); continue
            lk = (r['lemma'], r['meaning'])
            if lk not in lemma_index:
                lemma_index[lk] = len(lemmas); lemmas.append([r['lemma'], r['meaning']])
            fk = r['form']
            if fk not in form_index:
                form_index[fk] = len(forms); forms.append(fk)
            item = [lemma_index[lk], form_index[fk]]
            if r['here'] or r['parts']:
                item.append(r['here'])
            if r['parts']:
                item.append(r['parts'])
            entry.append(item)
        sentences[str(card['id'])] = {'s': card['text'], 'w': entry}
    if errors:
        print('Fehlende Annotationen:', len(errors), errors[:20]); sys.exit(1)
    OUT.write_text(json.dumps({
        'description': 'Wortanalyse je Satz: Grundform und Form nach Voikko, Auswahl im Kontext und deutsche Bedeutung als KI-Annotation (Claude). Keine vollständige linguistische Prüfung.',
        'fields': {'lemmas': '[Grundform, Bedeutung]', 'w': '[Lemma-Index, Form-Index, hier?, Wortteile?]'},
        'lemmas': lemmas, 'forms': forms, 'sentences': sentences,
    }, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{len(sentences)} Sätze, {len(lemmas)} Einträge, {len(forms)} Formen, {OUT.stat().st_size // 1024} KB')


def check(batch):
    """Validate one answers file against its batch (used while annotating)."""
    cand = json.loads((WORK / 'candidates.json').read_text(encoding='utf-8'))
    wanted = []
    for raw in (WORK / 'batches' / f'{batch}.txt').read_text(encoding='utf-8').splitlines():
        if raw.startswith('#'):
            sid = raw[1:].split(' | ')[0]
        else:
            wanted.append(f"{sid}:{raw.split()[0]}")
    path = WORK / 'answers' / f'{batch}.tsv'
    seen, errors = set(), []
    for lineno, raw in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        if not raw.strip() or raw.startswith('#'):
            continue
        cols = (raw.split('\t') + [''] * 8)[:8]
        sid, idx, tok, choice, lemma, meaning, form, here = [c.strip() for c in cols]
        key = f'{sid}:{idx}'
        info = cand.get(key)
        if not info:
            errors.append(f'Z{lineno}: unbekannter Token {key}'); continue
        if key in seen:
            errors.append(f'Z{lineno}: doppelt {key}')
        seen.add(key)
        if tok != info['token']:
            errors.append(f'Z{lineno}: Token {tok!r} statt {info["token"]!r}')
        if choice and choice != '-':
            k = ord(choice[0]) - 97
            if len(choice) != 1 or not 0 <= k < len(info['candidates']):
                errors.append(f'Z{lineno}: ungültige Wahl {choice!r} für {tok}')
            elif lemma and lemma != info['candidates'][k]['lemma']:
                errors.append(f'Z{lineno}: Grundform {lemma} ≠ [{choice}] {info["candidates"][k]["lemma"]}')
        elif not (lemma and form):
            errors.append(f'Z{lineno}: bei „-“ sind Grundform und Form Pflicht ({tok})')
        if not meaning:
            errors.append(f'Z{lineno}: Bedeutung fehlt ({tok})')
    missing = [k for k in wanted if k not in seen]
    errors += [f'fehlt: {k} {cand[k]["token"]}' for k in missing]
    print('\n'.join(errors[:80]) if errors else f'OK: {len(seen)} Tokens')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    if sys.argv[1] == 'check':
        check(sys.argv[2])
    else:
        {'prepare': prepare, 'merge': merge, 'build': build}[sys.argv[1]]()
