"""Dialogues per level and learning-path topic.

  python build_dialogs.py check N   # validate sources/dialogs/level-N.json
  python build_dialogs.py build     # all levels -> dist/dialogs.json

Dialogues are written and reviewed as AI texts (Claude) following
sources/dialogs/INSTRUCTIONS.md; word analysis for their lines lives in
sources/lexicon-annotations.tsv like every sentence (ids "d:<dialog-id>:<line>").
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / 'sources' / 'dialogs'
OUT = ROOT / 'dist' / 'dialogs.json'
TOPICS = ['hello', 'time', 'cafe', 'family', 'travel', 'shopping', 'health', 'nature', 'feelings', 'work', 'slang', 'romance', 'emergency']
LEVELS = [1, 2, 3, 4, 5, 6]


def load(level):
    path = SRC / f'level-{level}.json'
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else None


def validate(level, dialogs):
    errors = []
    sentences = json.loads((ROOT / 'dist' / 'sentences.json').read_text(encoding='utf-8'))
    texts = {s['id']: s['text'] for s in sentences['sentences'] + sentences.get('archived_sentences', [])}
    if not isinstance(dialogs, list) or len(dialogs) != len(TOPICS):
        return [f'Level {level}: genau {len(TOPICS)} Dialoge erwartet']
    for topic, d in zip(TOPICS, dialogs):
        where = f"Level {level}/{topic}"
        if d.get('id') != f'l{level}-{topic}' or d.get('level') != level or d.get('topic') != topic:
            errors.append(f'{where}: id/level/topic stimmen nicht (erwartet l{level}-{topic})')
        for field in ('title', 'scene'):
            if not isinstance(d.get(field), str) or not d[field].strip():
                errors.append(f'{where}: {field} fehlt')
        speakers = d.get('speakers')
        if not isinstance(speakers, dict) or not 2 <= len(speakers) <= 3 or any(not v.get('name') or not v.get('role') for v in speakers.values()):
            errors.append(f'{where}: speakers mit name/role für 2–3 Personen')
            speakers = {}
        lines = d.get('lines')
        if not isinstance(lines, list) or not 6 <= len(lines) <= 10:
            errors.append(f'{where}: 6–10 Zeilen erwartet')
            lines = []
        used = set()
        for i, line in enumerate(lines):
            if line.get('s') not in speakers:
                errors.append(f'{where} Zeile {i + 1}: unbekannte Person {line.get("s")!r}')
            used.add(line.get('s'))
            for field in ('fi', 'de'):
                if not isinstance(line.get(field), str) or not line[field].strip():
                    errors.append(f'{where} Zeile {i + 1}: {field} fehlt')
            if re.search(r'\b(Tomi?|Mari)\b', line.get('fi', '')):
                errors.append(f'{where} Zeile {i + 1}: bitte keine Tatoeba-Namen')
        if speakers and used != set(speakers):
            errors.append(f'{where}: nicht alle Personen sprechen')
        fi_all = ' '.join(l.get('fi', '') for l in lines)
        norm = lambda t: re.sub(r'\s+', ' ', t).strip()
        for sid in d.get('reuses', []):
            if sid not in texts:
                errors.append(f'{where}: reuses {sid} unbekannt')
            elif norm(texts[sid]).rstrip('.!?') not in norm(fi_all):
                errors.append(f'{where}: Lernpfad-Satz {sid} ({texts[sid]}) steht nicht wörtlich im Dialog')
        if not isinstance(d.get('phrases', []), list) or not isinstance(d.get('doubts', []), list):
            errors.append(f'{where}: phrases/doubts müssen Listen sein')
    return errors


def check(level):
    dialogs = load(level)
    if dialogs is None:
        print(f'sources/dialogs/level-{level}.json fehlt'); sys.exit(1)
    errors = validate(level, dialogs)
    lines = sum(len(d.get('lines', [])) for d in dialogs)
    print('\n'.join(errors) if errors else f'OK: Level {level}, {len(dialogs)} Dialoge, {lines} Zeilen')
    sys.exit(1 if errors else 0)


def all_dialogs():
    out = []
    for level in LEVELS:
        dialogs = load(level)
        if dialogs:
            out += dialogs
    return out


def lines_as_sentences():
    """Dialogue lines in the shape build_lexicon.py expects."""
    return [{'id': f"d:{d['id']}:{i}", 'text': line['fi'], 'level': d['level'],
             'translations': [{'text': line['de']}]}
            for d in all_dialogs() for i, line in enumerate(d['lines'])]


def build():
    dialogs, errors = [], []
    for level in LEVELS:
        found = load(level)
        if found is None:
            continue
        errors += validate(level, found)
        dialogs += found
    if errors:
        print('\n'.join(errors)); sys.exit(1)
    OUT.write_text(json.dumps({
        'description': 'Alltagsdialoge je Level und Lernpfad-Thema, mit KI (Claude) geschrieben und gegengelesen. Keine muttersprachliche Prüfung.',
        'dialogs': [{k: d[k] for k in ('id', 'level', 'topic', 'title', 'scene', 'speakers', 'lines', 'reuses', 'phrases')} for d in dialogs],
    }, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{len(dialogs)} Dialoge, {sum(len(d["lines"]) for d in dialogs)} Zeilen, {OUT.stat().st_size // 1024} KB')


if __name__ == '__main__':
    if sys.argv[1] == 'check':
        check(int(sys.argv[2]))
    else:
        build()
