"""Prepare the reviewed starter selection from current Tatoeba API snapshots.

Usage: python prepare_data.py ../all-audio-pairs.json ../basic-pairs.json
Text is preserved; level assignments are editorial estimates, not official CEFR.
Only Finnish audio with an explicit Creative Commons license is embedded.
"""
import json
import sys
from pathlib import Path

LEVELS = {
    1: [3215025,1614474,752738,3374632,409605,5642917,1966416,1970852,5002569,5084733,6829049,879595,354158,1969748,1971964,3569375,875108,879616,3756698,4955086],
    2: [6771678,5792445,4562291,4516863,4176159,3874605,2390587,6673283,6671928,6584454,6166445,3569367,1962853,2132753,879573,879632,879634,879601,6581760,335657],
    3: [7083488,1971875,7083464,7083425,7074818,4949433,3374375,5402420,5380916,4727823,1969719,1969951,6930583,5731516,4172346,335692,354133,5769154,5557099,6584421],
    4: [6712786,6450534,5391823,5378434,4935458,6864152,5387110,3484420,3319531,354179,335995,335992,3553421,5082784,4139355,1960255,335579,335649,5381394,2502066],
}

# Expansion to fifty distinct Finnish sentences per level.
EXTRA = {
    1: [1012592,4332474,3170244,2757289,2746013,13785175,13678361,13632080,13622687,13608205,13434578,12328090,12153348,10363246,10336256,8774024,8620816,8335692,7839921,7524511,5970215,1804243,8613875,5427659,4849982,4340855,3493271,3324807,3016146,13682177],
    2: [10652939,5147544,773331,13040988,12147617,9556757,8214759,6976467,3523981,3248057,3210460,3086594,2826384,2766931,2662074,2430235,2135470,1185132,8213070,3877580,3381396,3233837,792983,2311397,3350687,13628814,13431173,8031808,11560576,10482519],
    3: [7006792,6633712,5402427,5402242,5391140,5074559,4263076,3319535,2614261,12734373,5535325,3856005,3851974,3793720,3515409,3079740,2832332,2786555,2601978,1259142,13940966,13632081,6838040,3398843,3394851,1160360,4110737,1186576,10289223,7844296],
    4: [5142772,3569346,6970621,6930589,5391151,5321794,4125175,4060533,4260373,335577,335605,335643,335779,354153,3278536,2806970,12735818,10989629,4425371,3394643,3261061,12658452,12492371,12280558,10968876,10968864,3419067,3352542,10820207,8274984],
}
for level, extra in EXTRA.items():
    LEVELS[level].extend(extra)
    assert len(LEVELS[level]) == 50 and len(set(LEVELS[level])) == 50

EXPANSION = {
    1: [7950124,7837579,3796279,3742575,2662249,1160191,778578,2951209,10336251,3381322,
        11769149,10327479,10048522,3622004,3602227,3337584,3226105,3226095,3214318,2396782,
        2346900,1634219,1612427,1609434,1164027,10464463,10359711,2664195,1575592,809835,
        12410371,2205741,10655836,9954656,9672836,7785196,6837404,6856574,10928129,9687409,
        10666622,10666621,7894989,3774818,3774812,3007917,8613911,3966422,7799395,3877596],
    2: [10631794,10349406,3324141,3084818,2787405,1575755,1023154,6163075,3391240,1617440,
        10048496,2662101,1716297,12231814,3408433,13607445,2675533,
        3602194,3350750,3084863,1189392,2305854,2884819,2305875,
        6733698,6695314,5399038,5320526,6594126,5274550,4340818,3871034,3686066,2780307,
        7799663,8645540,2599724,10708975,2599712,3382260,
        10722177,3226235,3107861,2680546,1031653,3227984,2682512,1181703,3419161,3376292],
    3: [13607581,13461326,13438491,12729642,12726892,12467429,11955162,11900772,11068311,11062266,
        11059834,10631788,4003506,3785055,3380789,3377550,3297145,3277967,3261825,3254429,
        3114946,3035101,2809777,3412753,3633330,1012534,3851971,4828453,2122036,1160237,
        3156085,1160704,936792,2156269,12496989,4193491,12392875,12102192,10288660,6084697,
        3392775,6567926,5254020,5048814,3319534,4261427,4259099,3553446,3525673,3319315],
    4: [13595597,3078074,12020753,10900740,3297134,2675540,2277975,355137,
        12725744,1014531,3368367,2127238,1088765,13627902,13604634,12725749,1616277,4727831,
        12297027,3435592,3290925,3276577,2626788,2156277,4181211,756281,1222384,3163573,
        12772776,11884980,11786940,3277269,3247006,2168588,1761532,13361215,10638805,10351300,
        13614070,10742423,10651539,3229031,2661835,12735884,11062254,2201591,2126850,3334808,4148294,3641012],
}
for level, extra in EXPANSION.items():
    LEVELS[level].extend(extra)
    assert len(LEVELS[level]) == 100 and len(set(LEVELS[level])) == 100

def main():
    records = {}
    for path in sys.argv[1:]:
        payload = json.loads(Path(path).read_text())
        for sentence in payload if isinstance(payload, list) else payload['data']:
            records[sentence['id']] = sentence
    sentences = []
    fields = ('id', 'text', 'lang', 'license', 'owner')
    for level, ids in LEVELS.items():
        for sid in ids:
            raw = records[sid]
            assert raw['lang'] == 'fin' and not raw['is_unapproved']
            assert raw['license'] in ('CC BY 2.0 FR', 'CC0 1.0')
            sentence = {k: raw[k] for k in fields}
            sentence['level'] = level
            sentence['translations'] = [{k: t[k] for k in fields} for t in raw['translations'] if t['lang'] == 'deu' and t['is_direct'] and not t['is_unapproved'] and t['license'] in ('CC BY 2.0 FR','CC0 1.0')]
            sentence['audios'] = [a for a in raw.get('audios', []) if a.get('license') in ('CC BY 4.0','CC BY-NC 4.0','CC BY-SA 4.0','CC0 1.0')]
            # The API currently returns singular /audio/ URLs (404).
            # Use the stable plural /audios/{id}/file route in its OpenAPI schema.
            sentence['audios'] = [{**a, 'download_url': f'https://api.tatoeba.org/v1/audios/{a["id"]}/file'} for a in sentence['audios']]
            assert sentence['translations']
            sentences.append(sentence)
    assert len({s['id'] for s in sentences}) == len(sentences)
    assert len(sentences) == 400
    assert len({s['text'] for s in sentences}) == 400
    output = {'source': 'https://api.tatoeba.org/v1/sentences', 'retrieved': '2026-09-10', 'level_method': 'Editorial estimate; Level 1–2 basic, Level 3–4 everyday Finnish. Not official CEFR.', 'sentences': sentences}
    Path('dist/sentences.json').write_text(json.dumps(output, ensure_ascii=False, indent=2))
    Path('sources').mkdir(exist_ok=True)
    Path('sources/tatoeba-snapshot.json').write_text(json.dumps([records[s['id']] for s in sentences], ensure_ascii=False, indent=2))
    print(f'{len(sentences)} sentences; {sum(bool(s["audios"]) for s in sentences)} with licensed Finnish audio.')
    for level in LEVELS:
        print(f'Level {level}: {sum(s["level"] == level for s in sentences)} sentences')

if __name__ == '__main__':
    main()
