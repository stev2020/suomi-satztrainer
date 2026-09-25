"""Level fill (25 September 2026): reviewed Tatoeba sentences for Level 1/2 and 6.

  python build_level_fill.py check <BATCH>   # validate one review/notes pair
  python build_level_fill.py assemble        # reviews -> sources/level-fill-2026-09-25.json + grammar notes

Candidates come from the Tatoeba per-language exports of 25 September 2026
(fin_sentences_detailed, deu_sentences_detailed, fin-deu_links): Finnish sentences with a
direct German link, absent from the active deck and archive by ID and normalized text.
Each candidate was reviewed by AI (correctness, translation, level, topic) following
sources/level-fill-instructions.md; kept sentences got 1-3 grammar notes.
"""
import collections
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent
WORK = ROOT / 'sources' / 'level-fill-work'
OUT = ROOT / 'sources' / 'level-fill-2026-09-25.json'
NOTES = ROOT / 'sources' / 'grammar-import-specific.tsv'
TOPICS = {'hello', 'time', 'cafe', 'family', 'travel', 'shopping', 'health', 'nature', 'feelings', 'work', 'slang', 'romance', 'emergency', '-'}
LIMITS = {'L2': 10000, 'L1': 10000, 'L6': 10000}  # all reviewed keeps are used


def candidates():
    return {int(k): v for k, v in json.loads((WORK / 'candidates.json').read_text(encoding='utf-8')).items()}


def batch_ids(batch):
    return [int(line[1:].split(' ')[0]) for line in (WORK / 'batches' / f'{batch}.txt').read_text(encoding='utf-8').splitlines() if line.startswith('#')]


def read_review(batch, cands):
    rows, errors = {}, []
    allowed_levels = {'1', '2'} if batch.startswith('L2') else {'6'}
    for n, raw in enumerate((WORK / 'review' / f'{batch}.tsv').read_text(encoding='utf-8').splitlines(), 1):
        if not raw.strip():
            continue
        cols = (raw.split('\t') + [''] * 6)[:6]
        sid, decision, level, topic, de_ids, reason = [c.strip() for c in cols]
        if not sid.isdigit() or int(sid) not in cands:
            errors.append(f'Z{n}: unbekannte ID {sid}'); continue
        sid = int(sid)
        if sid in rows:
            errors.append(f'Z{n}: doppelt {sid}')
        if decision == 'reject':
            if not reason:
                errors.append(f'Z{n}: Grund fehlt')
            rows[sid] = {'decision': 'reject', 'reason': reason}
            continue
        if decision != 'keep':
            errors.append(f'Z{n}: Entscheidung keep/reject'); continue
        if level not in allowed_levels:
            errors.append(f'Z{n}: Level {level} nicht erlaubt ({"/".join(sorted(allowed_levels))})')
        if topic not in TOPICS:
            errors.append(f'Z{n}: Thema {topic!r} unbekannt')
        known = {d for d, _, _ in cands[sid]['tr']}
        ids = [int(x) for x in de_ids.replace(' ', '').split(',') if x.isdigit()]
        if not ids or any(i not in known for i in ids):
            errors.append(f'Z{n}: de-IDs {de_ids!r} passen nicht zu {sorted(known)}')
        rows[sid] = {'decision': 'keep', 'level': int(level) if level.isdigit() else 0, 'topic': topic, 'de': ids, 'reason': reason}
    return rows, errors


def read_notes(batch, cands):
    notes, errors = collections.defaultdict(list), []
    path = WORK / 'review' / f'{batch}.notes.tsv'
    if not path.exists():
        return notes, ['Hinweisdatei fehlt']
    for n, raw in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        if not raw.strip() or raw.startswith('#'):
            continue
        cols = raw.split('\t')
        if len(cols) != 4 or not all(c.strip() for c in cols):
            errors.append(f'Hinweise Z{n}: genau 4 nichtleere Spalten'); continue
        sid, focus, title, text = [c.strip() for c in cols]
        if not sid.isdigit() or int(sid) not in cands:
            errors.append(f'Hinweise Z{n}: unbekannte ID {sid}'); continue
        if focus.casefold() not in cands[int(sid)]['text'].casefold():
            errors.append(f'Hinweise Z{n}: Fokus {focus!r} steht nicht im Satz'); continue
        notes[int(sid)].append((focus, title, text))
    return notes, errors


def check(batch):
    cands = candidates()
    rows, errors = read_review(batch, cands)
    notes, note_errors = read_notes(batch, cands)
    errors += note_errors
    wanted = batch_ids(batch)
    errors += [f'fehlt: {sid}' for sid in wanted if sid not in rows]
    for sid, row in rows.items():
        if row['decision'] == 'keep' and not 1 <= len(notes.get(sid, [])) <= 3:
            errors.append(f'{sid}: 1–3 Grammatikhinweise erwartet, {len(notes.get(sid, []))} gefunden')
        if row['decision'] == 'reject' and notes.get(sid):
            errors.append(f'{sid}: abgelehnt, aber Hinweise vorhanden')
    kept = sum(r['decision'] == 'keep' for r in rows.values())
    print('\n'.join(errors[:60]) if errors else f'OK: {len(rows)} geprüft, {kept} behalten')
    sys.exit(1 if errors else 0)


def assemble():
    cands = candidates()
    chosen, all_notes, stats = [], {}, collections.Counter()
    for path in sorted((WORK / 'review').glob('L*.tsv')):
        if path.name.endswith('.notes.tsv'):
            continue
        batch = path.stem
        rows, errors = read_review(batch, cands)
        notes, note_errors = read_notes(batch, cands)
        assert not errors and not note_errors, (batch, errors[:5], note_errors[:5])
        for sid, row in rows.items():
            stats[(batch[:2], row['decision'])] += 1
            if row['decision'] == 'keep':
                chosen.append((sid, row))
                all_notes[sid] = notes[sid]
    # Balance: cap per level, preferring sentences with a learning-path topic, then shorter ones.
    by_level = collections.defaultdict(list)
    for sid, row in chosen:
        by_level[row['level']].append((sid, row))
    selected = []
    for level, items in by_level.items():
        items.sort(key=lambda x: (x[1]['topic'] == '-', len(cands[x[0]]['text']), x[0]))
        selected += items[:LIMITS[f'L{level}']]
    records, seen_texts = [], set()
    for sid, row in sorted(selected, key=lambda x: (x[1]['level'], x[0])):
        c = cands[sid]
        key = c['text'].casefold().strip('.!? ')
        if key in seen_texts:  # same text by several contributors: keep the first (lowest ID)
            stats[('dup', 'skip')] += 1
            continue
        seen_texts.add(key)
        tr = {d: (t, o) for d, t, o in c['tr']}
        records.append({'id': sid, 'lang': 'fin', 'text': c['text'], 'owner': c['owner'], 'license': 'CC BY 2.0 FR',
                        'translations': [{'id': d, 'lang': 'deu', 'text': tr[d][0], 'owner': tr[d][1], 'license': 'CC BY 2.0 FR'} for d in row['de']],
                        'audios': [], 'level': row['level'], 'topic': row['topic'],
                        'level_assessment': {'status': 'estimated', 'method': 'reviewed-level-fill-2026-09-25'}})
    OUT.write_text(json.dumps({
        'source': 'https://tatoeba.org/en/downloads', 'export_date': '2026-09-25', 'selected_on': '2026-09-25',
        'description': 'Reviewed Finnish sentences with direct German Tatoeba links for Level 1/2 and Level 6, absent from the previous deck and archive. Text and attribution preserved; no audio. AI-reviewed classification, not certified CEFR.',
        'review_stats': {f'{k[0]} {k[1]}': v for k, v in sorted(stats.items())},
        'sentences': records}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    # Grammar notes: replace any earlier lines for these IDs, append new ones.
    ids = {str(r['id']) for r in records}
    kept_lines = [l for l in NOTES.read_text(encoding='utf-8').splitlines() if not (l and not l.startswith('#') and l.split('\t')[0] in ids)]
    for r in records:
        for focus, title, text in all_notes[r['id']]:
            kept_lines.append('\t'.join([str(r['id']), focus, title, text]))
    NOTES.write_text('\n'.join(kept_lines) + '\n', encoding='utf-8')
    print('Prüfung:', dict(stats))
    print('Übernommen:', collections.Counter(r['level'] for r in records), 'Themen:', collections.Counter(r['topic'] for r in records).most_common())


if __name__ == '__main__':
    if sys.argv[1] == 'check':
        check(sys.argv[2])
    else:
        assemble()
