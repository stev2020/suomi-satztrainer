"""Write the sentence deck in two forms.

sources/sentences-full.json  complete deck with all provenance (link paths,
                             adaptation notes, corrections, level reasons, …)
dist/sentences.json          what the app reads: only the fields it uses

The build scripts call write_outputs(deck). Run `python3 slim_deck.py` to
rebuild dist/sentences.json from sources/sentences-full.json.

Removed from dist (still in the full deck):
- per sentence: audio_source_available, translation_crosschecks, archive_reason,
  level_assessment unless "estimated" (then only the status, shown as
  "geschätzt"), audio_status unless "license_missing" (shown as a note)
- per translation: link_path, name_aligned, adapted_by, adapted_on, corrects,
  source when empty
- per audio: created, modified, download_url and attribution_url (the app
  derives both from the audio id and author, see audioURL() in app.js)
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent
FULL = ROOT / 'sources' / 'sentences-full.json'
DIST = ROOT / 'dist' / 'sentences.json'

SENTENCE_KEYS = ('id', 'text', 'lang', 'license', 'owner', 'level', 'translations', 'audios')
TRANSLATION_KEYS = ('id', 'text', 'lang', 'license', 'owner', 'origin', 'source')
AUDIO_KEYS = ('id', 'author', 'license')
TOP_KEYS = ('source', 'retrieved', 'export_date', 'level_method', 'levels', 'import_summary')


def audio_url(audio):
    return f"https://api.tatoeba.org/v1/audios/{audio['id']}/file"


def slim_sentence(s):
    out = {k: s[k] for k in SENTENCE_KEYS if k in s}
    out['translations'] = [{k: t[k] for k in TRANSLATION_KEYS if t.get(k) is not None or k in ('id', 'owner')}
                           for t in s.get('translations', [])]
    for audio in s.get('audios', []):
        # The app builds the download URL from the id; refuse to drop a URL it could not rebuild.
        assert 'download_url' not in audio or audio['download_url'] == audio_url(audio), audio
    out['audios'] = [{k: a[k] for k in AUDIO_KEYS if k in a} for a in s.get('audios', [])]
    if (s.get('level_assessment') or {}).get('status') == 'estimated':
        out['level_assessment'] = {'status': 'estimated'}
    if s.get('audio_status') == 'license_missing':
        out['audio_status'] = 'license_missing'
    return out


def slim(deck):
    out = {k: deck[k] for k in TOP_KEYS if k in deck}
    out['sentences'] = [slim_sentence(s) for s in deck['sentences']]
    out['archived_sentences'] = [slim_sentence(s) for s in deck.get('archived_sentences', [])]
    return out


def dump(data):
    return json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'


def write_outputs(deck):
    FULL.write_text(dump(deck), encoding='utf-8')
    DIST.write_text(dump(slim(deck)), encoding='utf-8')


if __name__ == '__main__':
    import sys
    deck = json.loads(FULL.read_text(encoding='utf-8'))
    expected = dump(slim(deck))
    if '--check' in sys.argv:
        # npm test: dist must be exactly the slim form of the full deck.
        if DIST.read_text(encoding='utf-8') != expected:
            sys.exit('FAIL: dist/sentences.json is not the slim form of sources/sentences-full.json. Run python3 slim_deck.py')
        print(f'PASS: dist/sentences.json matches the slim form of the full deck ({DIST.stat().st_size:,} of {FULL.stat().st_size:,} bytes).')
    else:
        DIST.write_text(expected, encoding='utf-8')
        print(f'{DIST.relative_to(ROOT)}: {DIST.stat().st_size:,} bytes (full: {FULL.stat().st_size:,})')
