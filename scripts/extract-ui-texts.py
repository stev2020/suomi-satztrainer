#!/usr/bin/env python3
"""Sammelt deutsche Oberflächentexte aus dist/ für die Übersetzung.

Ausgabe: scripts/ui-texts.json – {"<deutscher Text>": ["datei", ...]}
Texte mit ${...} werden zu Mustern mit {0}, {1}, ...

Das ist ein Hilfswerkzeug für Übersetzende: Es findet Kandidaten, nicht jeden Text
perfekt. Was im Browser trotzdem deutsch bleibt, zeigt scripts/check-ui-language.mjs.
"""
import html, json, re, sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
# Lerninhalte, keine Oberfläche (werden später als Inhalte übersetzt):
SKIP_FILES = {'verbs-data.mjs', 'sw.js', 'supabase-config.js', 'i18n.mjs',
              # Rechtstexte bleiben vorerst deutsch (eigene Seiten ohne Übersetzung):
              'datenschutz.html', 'impressum.html'}
GERMAN = re.compile(r'[äöüÄÖÜß]|\b(der|die|das|und|oder|nicht|mit|für|von|zu|dein|deine|du|ist|sind|wird|Sätze|Satz|Wort|Wörter|Konto|Level|Übung|Klassenraum|bitte|noch|heute|alle|ein|eine|auf|im|den|dem|des|zum|zur|wie|was|neu|neue|Lernstand|Aufgabe|Lehrkraft)\b', re.I)
CODEISH = re.compile(r'^[\w.#\-\[\]=:"\'/ >*,()]+$')
TAG = re.compile(r'<[^>]*>')
PLACEHOLDER = re.compile(r'\$\{')


def norm(s):
    return re.sub(r'\s+', ' ', s).strip()


def looks_german(s):
    t = norm(html.unescape(s))
    if len(t) < 2 or not re.search(r'[A-Za-zÄÖÜäöü]{2}', t):
        return False
    if t.startswith(('http', './', '#', '.', '--')) or '=>' in t or '{' in t.replace('{0}', '').replace('{1}', '').replace('{2}', '').replace('{3}', '').replace('{4}', ''):
        return False
    if re.fullmatch(r'[a-z][a-zA-Z0-9]*', t):  # identifiers
        return False
    if re.fullmatch(r'[a-z0-9-]+( [a-z0-9-]+)*', t) and not GERMAN.search(t):  # css class lists
        return False
    if re.fullmatch(r'[A-ZÄÖÜ][a-zäöüß]{2,}[.!?…]?', t) and t not in NOT_UI:
        return True  # einzelne Wörter wie „Leicht“, „Spiele“
    return bool(GERMAN.search(t)) or (t[0].isupper() and ' ' in t)


NOT_UI = {'Enter', 'Escape', 'Space', 'Tab', 'Backspace', 'Error', 'Content', 'Type', 'Bearer', 'Authorization', 'Promise', 'Object', 'Array', 'Date', 'Math', 'Number', 'String', 'Boolean', 'Set', 'Map', 'Symbol', 'Infinity', 'Vanamo', 'Tatoeba', 'Supabase', 'Mustikka', 'Hyppy', 'Phaser', 'Arrow', 'Shift', 'Meta', 'Control', 'Alt', 'Unidentified', 'Dead', 'Home', 'End'}


def split_template(body):
    """Template-Literal in Textstücke zerlegen; ${...} (verschachtelt) wird zu {n}."""
    out, buf, i, n, depth = [], [], 0, 0, 0
    pieces = []
    while i < len(body):
        if body.startswith('${', i):
            # skip balanced expression
            j, d = i + 2, 1
            while j < len(body) and d:
                if body[j] == '{': d += 1
                elif body[j] == '}': d -= 1
                elif body[j] == '`':  # nested template: skip it
                    k = j + 1
                    while k < len(body) and body[k] != '`':
                        k += 2 if body[k] == '\\' else 1
                    j = k
                j += 1
            pieces.append(('expr', body[i:j]))
            i = j
        else:
            j = body.find('${', i)
            j = len(body) if j < 0 else j
            pieces.append(('text', body[i:j]))
            i = j
    # Ausdrücke durch Marker ersetzen, dann an HTML-Tags trennen, Marker je Stück neu nummerieren.
    flat = ''.join(val if kind == 'text' else '\x00' for kind, val in pieces)
    segs = []
    for seg in TAG.split(flat):
        k = 0
        def num(_):
            nonlocal k
            k += 1
            return '{%d}' % (k - 1)
        segs.append(re.sub('\x00', num, seg))
    return segs


STRING = re.compile(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`", re.S)


EXPR = re.compile(r'\$\{')


def template_exprs(body):
    """Die ${...}-Ausdrücke eines Template-Literals (für darin verschachtelte Texte)."""
    i = 0
    while True:
        i = body.find('${', i)
        if i < 0:
            return
        j, d = i + 2, 1
        while j < len(body) and d:
            if body[j] == '{': d += 1
            elif body[j] == '}': d -= 1
            j += 1
        yield body[i + 2:j - 1]
        i = j


def js_texts(src):
    for m in STRING.finditer(src):
        lit = m.group(0)
        body = lit[1:-1]
        if lit[0] == '`':
            for seg in split_template(body):
                yield seg
            for expr in template_exprs(body):
                yield from js_texts(expr)
        else:
            body = body.replace("\\'", "'").replace('\\"', '"').replace('\\n', ' ')
            for seg in TAG.split(body):
                yield seg


class HTMLTexts(HTMLParser):
    def __init__(self):
        super().__init__(); self.out = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style'): self.skip += 1
        for k in ('aria-label', 'placeholder', 'title', 'alt'):
            if a.get(k): self.out.append(a[k])
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.skip -= 1
    def handle_data(self, data):
        if not self.skip: self.out.append(data)


def main():
    found = {}
    for f in sorted(DIST.glob('*')):
        if f.name in SKIP_FILES or f.suffix not in ('.js', '.mjs', '.html'):
            continue
        src = f.read_text(encoding='utf-8')
        if f.suffix == '.html':
            p = HTMLTexts(); p.feed(src); texts = p.out
        else:
            texts = js_texts(src)
        for t in texts:
            t = norm(html.unescape(t))
            if looks_german(t):
                found.setdefault(t, [])
                if f.name not in found[t]:
                    found[t].append(f.name)
    out = ROOT / 'scripts' / 'ui-texts.json'
    out.write_text(json.dumps(dict(sorted(found.items())), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{len(found)} Texte → {out.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
