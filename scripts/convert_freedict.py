"""Convert the FreeDict eng-rus TEI archive into the app's dictionary JSON.

Run from the repository root with the pipeline venv (see scripts/requirements.txt):
    scripts/.venv/Scripts/python.exe scripts/convert_freedict.py \
        path/to/freedict-eng-rus-2025.11.23.src.tar.xz src/assets/dictionary.json
"""
import argparse
import json
import re
import tarfile
import xml.etree.ElementTree as ET
from pathlib import Path

from wordfreq import word_frequency

NAMESPACE = {'tei': 'http://www.tei-c.org/ns/1.0'}
ALLOWED_POS = {'n', 'noun', 'v', 'verb', 'adj', 'adjective', 'adv', 'adverb'}
WORD_PATTERN = re.compile(r"^[A-Za-z][A-Za-z'-]*$")
MAX_TRANSLATIONS = 5

# Wiki link without nested brackets: [[target]] or [[target|label]]
WIKI_LINK = re.compile(r'\[\[([^\[\]|]*)(?:\|([^\[\]]*))?\]\]')


def text_of(element):
    return ' '.join(''.join(element.itertext()).split()) if element is not None else ''


def clean_translation(text):
    """Replace wiki links with their visible text: [[target|label]] -> label, [[word]] -> word.

    Repeats until nothing changes, so links inside links are resolved from the inside out.
    """
    previous = None
    while previous != text:
        previous = text
        text = WIKI_LINK.sub(
            lambda match: match.group(2) if match.group(2) is not None else match.group(1),
            text,
        )
    return ' '.join(text.split())


def clean_transcription(text):
    """Drop WikDict annotations that follow the IPA, e.g. '/ˈeɪ.pəɹn/<q:obsolete><ref:{{R:…}}>'."""
    return text.split('<', 1)[0].strip()


def select_translations(raw_translations):
    """Clean every translation, then drop empty ones and duplicates, then keep the first five."""
    cleaned = (clean_translation(value) for value in raw_translations)
    unique = list(dict.fromkeys(value for value in cleaned if value))
    return unique[:MAX_TRANSLATIONS]


def frequency_of(term):
    """Raw (not rounded to Zipf) English frequency of the lowercase headword; 0.0 when unknown."""
    return word_frequency(term.lower(), 'en', wordlist='large', minimum=0.0)


def assign_ranks(words, frequency):
    """Add a unique, dense `rank` 1..N to every word without changing the list order.

    Higher frequency ranks first; equal frequencies (zero included, so unknown words come
    last) are ordered by the lowercase term.
    """
    by_rank = sorted(words, key=lambda word: (-frequency(word['term']), word['term'].lower()))
    for rank, word in enumerate(by_rank, start=1):
        word['rank'] = rank


def read_tei(archive_path):
    with tarfile.open(archive_path, 'r:xz') as archive:
        xml_member = next(
            member for member in archive.getmembers()
            if member.name.endswith('.tei') and not member.name.endswith('freedict-P5.tei')
        )
        with archive.extractfile(xml_member) as xml_file:
            return ET.parse(xml_file)


def convert(archive_path):
    tree = read_tei(archive_path)

    words = []
    seen = set()
    for entry in tree.findall('.//tei:entry', NAMESPACE):
        term = text_of(entry.find('./tei:form/tei:orth', NAMESPACE))
        pos = text_of(entry.find('./tei:gramGrp/tei:pos', NAMESPACE)).lower()
        if (
            not term
            or not WORD_PATTERN.fullmatch(term)
            or pos not in ALLOWED_POS
            or term.lower() in seen
        ):
            continue

        raw_translations = []
        for citation in entry.findall('.//tei:cit[@type="trans"]', NAMESPACE):
            if citation.get('{http://www.w3.org/XML/1998/namespace}lang') == 'ru':
                raw_translations.extend(
                    text_of(quote)
                    for quote in citation.findall('./tei:quote', NAMESPACE)
                )

        translations = select_translations(raw_translations)
        if not translations:
            continue

        pronunciations = [
            pronunciation
            for pronunciation in (
                clean_transcription(text_of(pron))
                for pron in entry.findall('./tei:form/tei:pron', NAMESPACE)
            )
            if pronunciation
        ]
        seen.add(term.lower())
        words.append({
            'term': term,
            'translation': ', '.join(translations),
            'transcription': pronunciations[0] if pronunciations else '',
            'example': '',
        })
    assign_ranks(words, frequency_of)
    return words


def write_json(words, output_path):
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    # LF on every OS, so the generated file is byte-identical everywhere
    output.write_text(
        json.dumps(words, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
        newline='\n',
    )


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Convert FreeDict eng-rus TEI into English Cards JSON.')
    parser.add_argument('archive', help='Path to the FreeDict .src.tar.xz archive')
    parser.add_argument('output', help='Output JSON path')
    args = parser.parse_args()
    words = convert(args.archive)
    write_json(words, args.output)
    print(f'Created {args.output}: {len(words)} entries')
