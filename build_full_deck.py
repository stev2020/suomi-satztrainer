"""Build all 4,253 Finnish audio-source sentences, retaining all previous cards.
Pinned to the 2026-09-05 Tatoeba exports, checked 2026-09-10.
Run python build_full_deck.py. Existing grammar annotations remain unchanged.
"""
import json,copy,collections
from pathlib import Path
from level_import import assign
ROOT=Path(__file__).parent
FIELDS=('id','text','lang','owner','license')
def _tsv(name):
 lines=[l for l in (ROOT/'sources'/name).read_text().splitlines() if l and not l.startswith('#')]
 head=lines[0].split('\t')
 return [dict(zip(head,l.split('\t'))) for l in lines[1:]]
def apply_corrections(cards,archived):
 """Reviewed fixes (2026-09-25): wrong German translations are replaced by app adaptations
 from the Finnish sentence; Finnish sentences with errors are archived (text and audio stay unchanged)."""
 byid={s['id']:s for s in cards}
 for row in _tsv('translation-corrections.tsv'):
  s=byid[int(row['sentence_id'])];i=int(row['index']);old=s['translations'][i]
  assert old['text']==row['current'],(s['id'],old['text'],row['current'])
  s['translations'][i]={'id':None,'text':row['corrected'],'lang':'deu','owner':None,'license':'CC BY 2.0 FR','origin':'finnish_adaptation',
   'source':{k:s[k] for k in FIELDS},'adapted_by':'Claude','adapted_on':'2026-09-25','corrects':{k:old.get(k) for k in ('id','text','owner','origin')}}
 remove={int(r['sentence_id']):r['reason'] for r in _tsv('sentence-archive.tsv')}
 for sid,reason in remove.items():
  assert sid in byid,sid
  byid[sid]['archive_reason']='Fehler im finnischen Satz: '+reason
 return [s for s in cards if s['id'] not in remove],archived+[byid[sid] for sid in sorted(remove)]
def main():
 rows=json.loads((ROOT/'sources/full-audio-candidates.json').read_text())
 previous=json.loads((ROOT/'sources/pre-full-import-deck.json').read_text())
 known={s['id']:s for s in previous['sentences']+previous.get('archived_sentences',[])}
 translations={int(l.split('\t',1)[0]):l.split('\t',1)[1] for l in (ROOT/'sources/import-german.tsv').read_text().splitlines()}
 other={s['id']:s for s in json.loads((ROOT/'sources/other-language-candidates.json').read_text())['data']}
 cards=[]
 for raw in rows:
  sid=raw['id']
  if sid in known:
   s=copy.deepcopy(known[sid]);s['audio_source_available']=True
   # Keep all previous text, level and translation decisions. Add newly found licensed audio only.
   if not s['audios']:s['audios']=raw['audios']
   s['level_assessment']={'status':'previous','method':'previous-editorial-selection'}
  else:
   s={k:raw[k] for k in FIELDS};s['level'],s['level_assessment']=assign(s['text']);s['audios']=raw['audios'];s['audio_source_available']=True
   if raw['direct_de']:
    s['translations']=raw['direct_de'][:3]
   elif raw['via_en']:
    # Preserve exact original text and its two direct edges, without claiming direct German linkage.
    candidate=min(raw['via_en'],key=lambda c:(c['german']['owner'] is None,len(c['german']['text']),c['german']['id']))
    s['translations']=[{**candidate['german'],'origin':'tatoeba_via_english','source':candidate['english'],'link_path':[sid,candidate['english']['id'],candidate['german']['id']]}]
   else:
    assert sid in translations,sid
    if raw['direct_en']:
     source=raw['direct_en'][0];origin='english_bridge'
    else:
     source={k:s[k] for k in FIELDS};origin='finnish_adaptation'
    s['translations']=[{'id':None,'text':translations[sid],'lang':'deu','owner':None,'license':'CC BY 2.0 FR','origin':origin,'source':source,'adapted_by':'ChatGPT','adapted_on':'2026-09-11'}]
    if sid in other:s['translation_crosschecks']=[{k:t[k] for k in FIELDS} for t in other[sid]['translations'] if t['lang']!='fin']
  s['audio_status']='licensed' if s['audios'] else 'license_missing'
  cards.append(s)
 imported={s['id'] for s in cards}
 # Keep prior non-audio cards in their former role, preserving all favorite/review IDs.
 cards.extend(copy.deepcopy(s) for s in previous['sentences'] if s['id'] not in imported)
 archived=[copy.deepcopy(s) for s in previous.get('archived_sentences',[]) if s['id'] not in imported]
 # Additional beginner cards retain real Tatoeba IDs and direct German links.
 expansion=json.loads((ROOT/'sources/level1-expansion.json').read_text())['sentences']
 existing_ids={s['id'] for s in cards+archived}
 normalize=lambda text:text.casefold().strip('.!? ')
 existing_texts={normalize(s['text']) for s in cards+archived}
 for s in expansion:
  assert s['id'] not in existing_ids and normalize(s['text']) not in existing_texts
  assert s['level']==1 and s['lang']=='fin'
  existing_ids.add(s['id']);existing_texts.add(normalize(s['text']))
  cards.append(copy.deepcopy(s))
 # Level fill (2026-09-25): AI-reviewed Tatoeba sentences with direct German links for Level 1/2 and 6.
 fill=json.loads((ROOT/'sources/level-fill-2026-09-25.json').read_text())['sentences']
 for s in fill:
  assert s['id'] not in existing_ids and normalize(s['text']) not in existing_texts, s['id']
  assert s['level'] in (1,2,6) and s['lang']=='fin' and s['translations']
  existing_ids.add(s['id']);existing_texts.add(normalize(s['text']))
  card=copy.deepcopy(s);card.pop('topic',None);cards.append(card)
 cards,archived=apply_corrections(cards,archived)
 cards.sort(key=lambda s:(s['level'],s['id']))
 out={'source':'https://tatoeba.org/en/downloads','retrieved':'2026-09-11','export_date':'2026-09-05','level_method':'Previous editorial levels retained; new levels provisionally estimated from vocabulary and grammar. Not certified CEFR.','levels':[{'id':n,'title':f'Level {n}'} for n in range(1,7)],'import_summary':{'audio_source_sentences':len(rows),'licensed_audio_sentences':sum(bool(s['audios']) for s in cards),'unlicensed_audio_sentences':sum(s.get('audio_status')=='license_missing' for s in cards),'previous_active_sentences':len(previous['sentences'])},'sentences':cards,'archived_sentences':archived}
 assert len(rows)==4253 and len(imported)==4253
 assert len({s['id'] for s in cards+archived})==len(cards+archived)
 assert all(s['translations'] and all(t['lang']=='deu' and t['text'].strip() for t in s['translations']) for s in cards)
 assert all(a['license'] for s in cards for a in s['audios'])
 assert all(sid in {s['id'] for s in cards+archived} for sid in known)
 (ROOT/'dist/sentences.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n')
 print('active',len(cards),'archive',len(archived),'audio',sum(bool(s['audios']) for s in cards),'levels',collections.Counter(s['level'] for s in cards))
 print('translation types',collections.Counter(s['translations'][0].get('origin','direct') for s in cards))
if __name__=='__main__':main()
