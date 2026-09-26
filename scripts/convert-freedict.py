import argparse
import json
import re
import tarfile
import xml.etree.ElementTree as ET
from pathlib import Path

NAMESPACE = {'tei': 'http://www.tei-c.org/ns/1.0'}
ALLOWED_POS = {'n', 'noun', 'v', 'verb', 'adj', 'adjective', 'adv', 'adverb'}
WORD_PATTERN = re.compile(r"^[A-Za-z][A-Za-z'-]*$")


def text_of(element):
    return ' '.join(''.join(element.itertext()).split()) if element is not None else ''


def convert(archive_path, output_path, limit):
    with tarfile.open(archive_path, 'r:xz') as archive:
        xml_member = next(
            member for member in archive.getmembers()
            if member.name.endswith('.tei') and not member.name.endswith('freedict-P5.tei')
        )
        with archive.extractfile(xml_member) as xml_file:
            tree = ET.parse(xml_file)

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

        translations = []
        for citation in entry.findall('.//tei:cit[@type="trans"]', NAMESPACE):
            if citation.get('{http://www.w3.org/XML/1998/namespace}lang') == 'ru':
                translations.extend(
                    text_of(quote)
                    for quote in citation.findall('./tei:quote', NAMESPACE)
                )

        translations = list(dict.fromkeys(value for value in translations if value))
        if not translations:
            continue

        pronunciations = [
            text_of(pron)
            for pron in entry.findall('./tei:form/tei:pron', NAMESPACE)
            if text_of(pron)
        ]
        seen.add(term.lower())
        words.append({
            'term': term,
            'translation': ', '.join(translations[:5]),
            'transcription': pronunciations[0] if pronunciations else '',
            'example': '',
        })
        if len(words) >= limit:
            break

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_text(
        json.dumps(words, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    print(f'Created {output_path}: {len(words)} entries')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Convert FreeDict TEI XML to English Cards JSON.')
    parser.add_argument('archive', help='Path to the FreeDict .src.tar.xz archive')
    parser.add_argument('output', help='Output JSON path')
    parser.add_argument('--limit', type=int, default=5000, help='Maximum number of entries')
    args = parser.parse_args()
    convert(args.archive, args.output, args.limit)
