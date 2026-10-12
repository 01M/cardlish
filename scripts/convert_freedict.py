"""Convert the FreeDict eng-rus TEI archive into the app's dictionary JSON.

Run from the repository root with the pipeline venv (see scripts/requirements.txt):
    scripts/.venv/Scripts/python.exe scripts/convert_freedict.py \
        path/to/freedict-eng-rus-2025.11.23.src.tar.xz src/assets/dictionary.json
"""
import argparse
import json
import re
import tarfile
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

from wordfreq import word_frequency

NAMESPACE = {'tei': 'http://www.tei-c.org/ns/1.0'}
# Parts of speech as the TEI names them. Excluded: pn (proper nouns), prefix, suffix,
# phraseologicalunit, proverb, symbol and entries without a part of speech
ALLOWED_POS = {
    # content words
    'n', 'v', 'adj', 'adv',
    # closed-class function words
    'pronoun', 'preposition', 'postposition', 'conjunction', 'determiner', 'numeral',
    'interjection', 'particle',
}
WORD_PATTERN = re.compile(r"^[A-Za-z][A-Za-z'-]*$")
MAX_TRANSLATIONS = 5
STRESS_MARK = '́'

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


def without_stress(text):
    """Comparison key: the text without U+0301 stress marks, in NFC."""
    decomposed = unicodedata.normalize('NFD', text)
    return unicodedata.normalize('NFC', decomposed.replace(STRESS_MARK, ''))


def has_stress(text):
    # NFD, because NFC can fold the mark into a precomposed letter (г + U+0301 -> ѓ)
    return STRESS_MARK in unicodedata.normalize('NFD', text)


def dedupe_translations(translations):
    """Drop duplicates, keeping the first position of each translation.

    Translations are equal when they match after NFC with stress marks (U+0301) removed. The
    kept text is the first variant with a stress mark: a later stressed variant replaces an
    earlier unstressed one in place. Variants stressed differently (а́ншлюс / аншлю́с, and also
    homographs such as за́мок / замо́к) collapse into the first one.
    """
    result = []
    positions = {}
    for translation in translations:
        key = without_stress(translation)
        if key not in positions:
            positions[key] = len(result)
            result.append(translation)
        elif has_stress(translation) and not has_stress(result[positions[key]]):
            result[positions[key]] = translation
    return result


def merge_translations(translation_lists):
    """Round-robin across entries (first of each, then second of each, ...), dedupe, cap at 5."""
    interleaved = [
        translations[position]
        for position in range(max((len(translations) for translations in translation_lists), default=0))
        for translations in translation_lists
        if position < len(translations)
    ]
    return dedupe_translations(interleaved)[:MAX_TRANSLATIONS]


def build_cards(entries):
    """Merge eligible source entries into one card per lowercase headword.

    `entries` are dicts with `term`, `translations` (cleaned, non-empty) and `transcription`
    ('' when missing), in source order. When a group has entries spelled in lowercase, its
    capitalised entries are dropped. The card keeps the spelling of its first remaining entry,
    merges the translations of all remaining entries and takes the first non-empty
    transcription. Cards come in the order of each group's first entry.
    """
    groups = {}
    for entry in entries:
        groups.setdefault(entry['term'].lower(), []).append(entry)

    cards = []
    for key, group in groups.items():
        kept = [entry for entry in group if entry['term'] == key] or group
        cards.append({
            'term': kept[0]['term'],
            'translation': ', '.join(merge_translations([entry['translations'] for entry in kept])),
            'transcription': next(
                (entry['transcription'] for entry in kept if entry['transcription']), ''
            ),
            'example': '',
        })
    return cards


def frequency_of(term):
    """Raw (not rounded to Zipf) English frequency of the lowercase headword; 0.0 when unknown."""
    return word_frequency(term.lower(), 'en', wordlist='large', minimum=0.0)


PLAIN_WORD = re.compile(r'^[a-z]+$')


def assign_ranks(words, frequency):
    """Add a unique, dense `rank` 1..N to every word without changing the list order.

    Group 1 — plain lowercase words (^[a-z]+$) with a non-zero frequency — ranks before
    group 2 — everything else: hyphenated, with an apostrophe, capitalised or unknown to
    wordfreq. Within a group: higher frequency first, then the lowercase term.
    """
    def sort_key(word):
        term = word['term']
        word_frequency_value = frequency(term)
        group = 1 if PLAIN_WORD.fullmatch(term) and word_frequency_value > 0 else 2
        return (group, -word_frequency_value, term.lower())

    for rank, word in enumerate(sorted(words, key=sort_key), start=1):
        word['rank'] = rank


def read_tei(archive_path):
    with tarfile.open(archive_path, 'r:xz') as archive:
        xml_member = next(
            member for member in archive.getmembers()
            if member.name.endswith('.tei') and not member.name.endswith('freedict-P5.tei')
        )
        with archive.extractfile(xml_member) as xml_file:
            return ET.parse(xml_file)


def read_entries(tree):
    """Eligible source entries in file order: a single-word headword, an allowed part of speech
    and at least one Russian translation left after cleanup."""
    for entry in tree.findall('.//tei:entry', NAMESPACE):
        term = text_of(entry.find('./tei:form/tei:orth', NAMESPACE))
        pos = text_of(entry.find('./tei:gramGrp/tei:pos', NAMESPACE)).lower()
        if not term or not WORD_PATTERN.fullmatch(term) or pos not in ALLOWED_POS:
            continue

        translations = []
        for citation in entry.findall('.//tei:cit[@type="trans"]', NAMESPACE):
            if citation.get('{http://www.w3.org/XML/1998/namespace}lang') == 'ru':
                translations.extend(
                    clean_translation(text_of(quote))
                    for quote in citation.findall('./tei:quote', NAMESPACE)
                )
        translations = [translation for translation in translations if translation]
        if not translations:
            continue

        transcription = next(
            (
                pronunciation
                for pronunciation in (
                    clean_transcription(text_of(pron))
                    for pron in entry.findall('./tei:form/tei:pron', NAMESPACE)
                )
                if pronunciation
            ),
            '',
        )
        yield {'term': term, 'translations': translations, 'transcription': transcription}


def convert(archive_path):
    words = build_cards(read_entries(read_tei(archive_path)))
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
