"""Rebuild the 4x100 deck with licensed Finnish audio and German-first sources.

The immutable baseline preserves existing IDs, levels and previous translations.
The TSV contains German adaptations made for this app from direct English links.
Removed baseline cards remain available as archived review/favorite records.
"""
import json
from pathlib import Path
from collections import Counter

TEXT_LICENSES = {'CC BY 2.0 FR', 'CC0 1.0'}
AUDIO_LICENSES = {'CC BY 4.0', 'CC BY-NC 4.0', 'CC BY-SA 4.0', 'CC0 1.0'}
NATIVE = {
    1: [5402434, 3553431, 409663],
    2: [6669729, 5550501, 7082223, 6909022, 5606550, 5321792, 4941473, 4935863, 4155295, 4139339, 3553412, 3319404],
    3: [4149792, 3484402, 2119080, 3553440],
    4: [6936075, 3319346, 3319316, 6909578, 5384343, 6930587],
}
FIELDS = ('id', 'text', 'lang', 'license', 'owner')

def valid_translation(t):
    return t.get('is_direct') and not t.get('is_unapproved') and t.get('license') in TEXT_LICENSES

def main():
    baseline = json.loads(Path('sources/baseline-deck.json').read_text())['sentences']
    raw = {s['id']: s for s in json.loads(Path('sources/audio-candidates.json').read_text())}
    selections = [(level, sid, None) for level, ids in NATIVE.items() for sid in ids]
    for row in Path('sources/english-to-german.tsv').read_text().splitlines():
        level, sid, german = row.split('\t', 2)
        selections.append((int(level), int(sid), german))
    assert len({sid for _, sid, _ in selections}) == len(selections)
    assert not ({s['id'] for s in baseline} & {sid for _, sid, _ in selections})
    additions = []
    for level, sid, german in selections:
        s = raw[sid]
        assert s['lang'] == 'fin' and not s['is_unapproved'] and s['license'] in TEXT_LICENSES
        audios = [{**a, 'download_url': f'https://api.tatoeba.org/v1/audios/{a["id"]}/file'}
                  for a in s['audios'] if a.get('license') in AUDIO_LICENSES]
        assert audios, sid
        direct_de = [t for t in s['translations'] if t['lang'] == 'deu' and valid_translation(t)]
        if direct_de:
            translations = [{k: t[k] for k in FIELDS} for t in direct_de]
        else:
            assert german, f'Missing German adaptation: {sid}'
            eng = next(t for t in s['translations'] if t['lang'] == 'eng' and valid_translation(t))
            translations = [{
                'id': None, 'text': german, 'lang': 'deu', 'license': eng['license'],
                'owner': None, 'origin': 'english_bridge',
                'source': {k: eng[k] for k in FIELDS},
                'adapted_by': 'ChatGPT', 'adapted_on': '2026-09-10',
            }]
        additions.append({**{k: s[k] for k in FIELDS}, 'level': level, 'translations': translations, 'audios': audios})
    active = []
    for level in range(1, 5):
        previous = [s for s in baseline if s['level'] == level]
        with_audio = [s for s in previous if s['audios']] + [s for s in additions if s['level'] == level]
        assert len(with_audio) <= 100
        # Native German versions come before English-based German adaptations.
        with_audio.sort(key=lambda s: s['translations'][0].get('origin') == 'english_bridge')
        active += with_audio + [s for s in previous if not s['audios']][:100 - len(with_audio)]
    active_ids = {s['id'] for s in active}
    archived = [s for s in baseline if s['id'] not in active_ids]
    assert len(active) == len(active_ids) == len({s['text'] for s in active}) == 400
    assert Counter(s['level'] for s in active) == {1: 100, 2: 100, 3: 100, 4: 100}
    assert all(s in active or s in archived for s in baseline)
    metadata = {
        'source': 'https://api.tatoeba.org/v1/sentences', 'retrieved': '2026-09-10',
        'level_method': 'Editorial estimate; not official CEFR.',
        'selection': 'Licensed Finnish audio first; direct German preferred; otherwise app-created German adaptation of direct English translation.',
        'sentences': active, 'archived_sentences': archived,
    }
    Path('dist/sentences.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
    print('Active:', len(active), 'Audio:', sum(bool(s['audios']) for s in active),
          'English bridge:', sum(s['translations'][0].get('origin') == 'english_bridge' for s in active),
          'Archived:', len(archived))
    for level in range(1, 5):
        print('Level', level, 'audio', sum(s['level'] == level and bool(s['audios']) for s in active))

if __name__ == '__main__':
    main()
