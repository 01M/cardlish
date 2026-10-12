"""Unit tests for the dictionary converter (stdlib unittest).

Run from the repository root:
    scripts/.venv/Scripts/python.exe -m unittest discover -s scripts -v
"""
import json
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from convert_freedict import (
    accent_labels,
    apply_overrides,
    assign_ranks,
    build_cards,
    choose_transcription,
    clean_transcription,
    clean_translation,
    dedupe_translations,
    load_overrides,
    merge_translations,
    override_problems,
    read_entries,
)


class CleanTranslationTest(unittest.TestCase):
    def test_plain_link_keeps_its_text(self):
        self.assertEqual(clean_translation('[[кита́йский]] [[англи́йский]]'), 'кита́йский англи́йский')

    def test_piped_link_keeps_the_label(self):
        self.assertEqual(clean_translation('в [[самоволка|самово́лке]]'), 'в самово́лке')

    def test_adjacent_links_and_suffixes(self):
        self.assertEqual(clean_translation('[[поставщи́к]][[интерне́т]]а'), 'поставщи́кинтерне́та')
        self.assertEqual(clean_translation('[[интерне́т]]а'), 'интерне́та')

    def test_nested_links_resolve_from_the_inside_out(self):
        self.assertEqual(clean_translation('[[a [[b|c]] d]]'), 'a c d')

    def test_empty_label_gives_empty_text(self):
        self.assertEqual(clean_translation('[[target|]]'), '')

    def test_text_without_markup_passes_through(self):
        for text in ['охо́тно', 'пол-', 'CD-ROM', '(разг.) ба́тюшка', '[ˈbluː]']:
            self.assertEqual(clean_translation(text), text)

    def test_collapses_whitespace(self):
        self.assertEqual(clean_translation('  [[a]]   [[b]] '), 'a b')


class CleanTranscriptionTest(unittest.TestCase):
    def test_drops_annotations_after_the_ipa(self):
        self.assertEqual(
            clean_transcription('/ˈeɪ.pəɹn/<q:obsolete><ref:{{R:Jespersen MEGoHP|I|9.72|275}}>'),
            '/ˈeɪ.pəɹn/',
        )
        self.assertEqual(clean_transcription('/ˈpostʃə(r)/<q:by analogy with [[post]]>'), '/ˈpostʃə(r)/')
        self.assertEqual(clean_transcription('/twɛlf/ [tʰw̥ɛɫʷf]<a:th-fronting>'), '/twɛlf/ [tʰw̥ɛɫʷf]')

    def test_annotation_only_becomes_empty(self):
        self.assertEqual(clean_transcription('<a:RP>'), '')

    def test_plain_ipa_passes_through(self):
        for text in ['/ˈæpl/', '[ˈbluːˌɹeɪ]', '/ˈjaʊ.i/, /ˈjɑ.ɔɪ/']:
            self.assertEqual(clean_transcription(text), text)


class DedupeTranslationsTest(unittest.TestCase):
    def test_keeps_first_positions_and_order(self):
        self.assertEqual(dedupe_translations(['в', 'а', 'в', 'б', 'а']), ['в', 'а', 'б'])

    def test_unstressed_duplicate_of_a_stressed_variant_is_dropped(self):
        self.assertEqual(
            dedupe_translations(['абисси́нский', 'абиссинский']), ['абисси́нский']
        )

    def test_stressed_variant_replaces_an_earlier_unstressed_one_in_place(self):
        self.assertEqual(
            dedupe_translations(['химия', 'нау́ка', 'хи́мия']), ['хи́мия', 'нау́ка']
        )

    def test_variants_stressed_differently_collapse_into_the_first(self):
        self.assertEqual(dedupe_translations(['а́ншлюс', 'аншлю́с', 'аншлюс']), ['а́ншлюс'])

    def test_equal_strings_in_different_normal_forms_are_duplicates(self):
        composed = 'й'  # U+0439
        decomposed = 'й'
        self.assertEqual(dedupe_translations([composed, decomposed]), [composed])

    def test_stress_on_letters_with_a_precomposed_form(self):
        # г + U+0301 composes to ѓ under NFC; the key still drops the stress
        self.assertEqual(dedupe_translations(['го', 'ѓо']), ['ѓо'])

    def test_yo_and_ye_stay_different(self):
        self.assertEqual(dedupe_translations(['всё', 'все']), ['всё', 'все'])


class MergeTranslationsTest(unittest.TestCase):
    def test_round_robin_across_entries(self):
        self.assertEqual(
            merge_translations([['бег', 'пробе́жка'], ['бежа́ть', 'убега́ть'], ['ход']]),
            ['бег', 'бежа́ть', 'ход', 'пробе́жка', 'убега́ть'],
        )

    def test_caps_after_dedupe(self):
        self.assertEqual(
            merge_translations([['a', 'b', 'c', 'd'], ['a', 'b', 'e', 'f']]),
            ['a', 'b', 'c', 'e', 'd'],
        )

    def test_stress_dedupe_applies_across_entries(self):
        self.assertEqual(
            merge_translations([['мочь'], ['мо́чь', 'уме́ть']]), ['мо́чь', 'уме́ть']
        )

    def test_empty_input(self):
        self.assertEqual(merge_translations([]), [])


BRITISH_FIRST = (('RP',), ('GA', 'GenAm'))
AMERICAN_FIRST = (('GA', 'GenAm'), ('RP',))


class ChooseTranscriptionTest(unittest.TestCase):
    def test_follows_the_preference_then_falls_back_to_the_first(self):
        pronunciations = ['/ə/<a:US>', '/ɑ/<a:GA>', '/ɒ/<a:RP>']
        self.assertEqual(choose_transcription(pronunciations, BRITISH_FIRST), '/ɒ/')
        self.assertEqual(choose_transcription(pronunciations, AMERICAN_FIRST), '/ɑ/')
        self.assertEqual(choose_transcription(['/ə/<a:UK>', '/ɑ/<a:GenAm>'], BRITISH_FIRST), '/ɑ/')
        self.assertEqual(choose_transcription(['/ə/<a:UK>', '/ɑ/<a:US>'], BRITISH_FIRST), '/ə/')

    def test_takes_the_first_matching_pronunciation_in_order(self):
        self.assertEqual(choose_transcription(['/a/<a:RP>', '/b/<a:RP>'], BRITISH_FIRST), '/a/')

    def test_reads_label_lists(self):
        self.assertEqual(
            choose_transcription(['/x/', '/ˈbeɪ.sɪs/<a:RP,GA>'], BRITISH_FIRST), '/ˈbeɪ.sɪs/'
        )

    def test_ignores_labels_inside_nested_markup(self):
        self.assertEqual(
            choose_transcription(['/a/', '/b/<a:<<GA>> in fast speech>'], AMERICAN_FIRST), '/a/'
        )

    def test_skips_pronunciations_that_are_empty_after_the_cut(self):
        self.assertEqual(choose_transcription(['<a:RP>', '', '/c/'], BRITISH_FIRST), '/c/')
        self.assertEqual(choose_transcription([], BRITISH_FIRST), '')

    def test_accent_labels(self):
        self.assertEqual(accent_labels('/x/<a:RP,GA><ref:{{R:OED}}>'), {'RP', 'GA'})
        self.assertEqual(accent_labels('/x/'), set())


def entry(term, translations, *pronunciations):
    return {'term': term, 'translations': translations, 'pronunciations': list(pronunciations)}


class BuildCardsTest(unittest.TestCase):
    def test_lowercase_entry_wins_over_capitalised_ones(self):
        cards = build_cards([entry('Apple', ['Эпл']), entry('apple', ['я́блоко'])])

        self.assertEqual(
            [(card['term'], card['translation']) for card in cards], [('apple', 'я́блоко')]
        )

    def test_only_capitalised_entries_keep_the_first_spelling_and_merge(self):
        cards = build_cards([entry('IT', ['ИТ']), entry('It', ['информатика'])])

        self.assertEqual(
            [(card['term'], card['translation']) for card in cards], [('IT', 'ИТ, информатика')]
        )

    def test_merges_entries_of_a_headword_round_robin(self):
        cards = build_cards([
            entry('can', ['бидо́н', 'жбан', 'ле́йка']),
            entry('can', ['мочь', 'смочь']),
            entry('can', ['консерви́ровать']),
        ])

        self.assertEqual(cards[0]['translation'], 'бидо́н, мочь, консерви́ровать, жбан, смочь')

    def test_transcription_is_the_first_non_empty_one(self):
        cards = build_cards([
            entry('Light', ['Лайт'], '/laɪt/'),
            entry('light', ['свет']),
            entry('light', ['лёгкий'], '<a:dated>', '/lait/'),
        ])

        self.assertEqual(cards[0]['transcription'], '/lait/')

    def test_transcription_uses_the_accent_preference_across_merged_entries(self):
        # Relies on the module's ACCENT_PREFERENCE (General American)
        cards = build_cards([
            entry('either', ['любо́й'], '/ˈaɪðə/<a:RP>'),
            entry('either', ['и́ли'], '/ˈiðɚ/<a:GA>'),
        ])

        self.assertEqual(cards[0]['transcription'], '/ˈiðɚ/')

    def test_without_a_general_american_label_the_first_pronunciation_wins(self):
        cards = build_cards([
            entry('either', ['любо́й'], '/ˈaɪðə/'),
            entry('either', ['и́ли'], '/ˈaɪðə/<a:RP>', '/ˈiðɚ/<a:US>'),
        ])

        self.assertEqual(cards[0]['transcription'], '/ˈaɪðə/')

    def test_cards_follow_the_first_entry_of_each_group(self):
        cards = build_cards([
            entry('Bee', ['Би']), entry('ant', ['мураве́й']), entry('bee', ['пчела́']),
        ])

        self.assertEqual([card['term'] for card in cards], ['bee', 'ant'])


class ReadEntriesTest(unittest.TestCase):
    TEI = """<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>
      <entry><form><orth>light</orth><pron>/laɪt/&lt;a:UK&gt;</pron></form>
        <gramGrp><pos>n</pos></gramGrp>
        <sense><cit type="trans" xml:lang="ru"><quote>[[свет]]</quote><quote>[[x|]]</quote></cit></sense>
      </entry>
      <entry><form><orth>light</orth></form><gramGrp><pos>pn</pos></gramGrp>
        <sense><cit type="trans" xml:lang="ru"><quote>Лайт</quote></cit></sense></entry>
      <entry><form><orth>ice cream</orth></form><gramGrp><pos>n</pos></gramGrp>
        <sense><cit type="trans" xml:lang="ru"><quote>моро́женое</quote></cit></sense></entry>
      <entry><form><orth>gone</orth></form><gramGrp><pos>adj</pos></gramGrp>
        <sense><cit type="trans" xml:lang="ru"><quote>[[x|]]</quote></cit></sense></entry>
    </body></text></TEI>"""

    def test_cleans_and_filters_entries(self):
        tree = ET.ElementTree(ET.fromstring(self.TEI))

        self.assertEqual(
            list(read_entries(tree)),
            [{'term': 'light', 'translations': ['свет'], 'pronunciations': ['/laɪt/<a:UK>']}],
        )


def card(term, translation, transcription='', rank=1):
    return {
        'term': term, 'translation': translation, 'transcription': transcription,
        'example': '', 'rank': rank,
    }


def override(key, reason='проверка', **fields):
    return {'key': key, 'reason': reason, **fields}


class ApplyOverridesTest(unittest.TestCase):
    def cards(self):
        return [card('i', 'ай, и', '/aɪ/', 7), card('can', 'бидо́н, мочь', '/kæn/', 36)]

    def assert_rejected(self, overrides, *messages):
        cards = self.cards()
        with self.assertRaises(ValueError) as raised:
            apply_overrides(cards, overrides)
        for message in messages:
            self.assertIn(message, str(raised.exception))
        self.assertEqual(cards, self.cards())

    def test_replaces_only_the_given_fields(self):
        cards = self.cards()

        apply_overrides(cards, [override('can', translations=['мочь', 'уме́ть', 'ба́нка'])])

        self.assertEqual(cards[1], card('can', 'мочь, уме́ть, ба́нка', '/kæn/', 36))
        self.assertEqual(cards[0], self.cards()[0])

    def test_term_and_transcription_overrides_keep_the_rank(self):
        cards = self.cards()

        apply_overrides(cards, [override('i', term='I', translations=['я'], transcription='/aɪ/ ')])

        self.assertEqual(cards[0], card('I', 'я', '/aɪ/ ', 7))

    def test_items_may_contain_commas(self):
        cards = self.cards()

        apply_overrides(cards, [override('can', translations=['всё, что уго́дно'])])

        self.assertEqual(cards[1]['translation'], 'всё, что уго́дно')

    def test_reports_every_problem_at_once_and_applies_nothing(self):
        self.assert_rejected(
            [
                override('missing', translations=['x']),
                override('can', translations=['мочь']),
                override('can', translations=['уме́ть']),
                override('i', term='Me'),
                override('i', reason='  ', translations=['я']),
            ],
            "'missing': unknown key",
            "'can': duplicate key",
            "'i': term 'Me' does not match the key in lowercase",
            "'i': empty reason",
        )

    def test_rejects_a_stale_override(self):
        self.assert_rejected(
            [override('can', translations=['бидо́н', 'мочь'], transcription='/kæn/')],
            "'can': identical to the generated card (stale)",
        )

    def test_rejects_bad_translation_lists(self):
        self.assert_rejected([override('can', translations=[])], '1..5 items')
        self.assert_rejected(
            [override('can', translations=['а', 'б', 'в', 'г', 'д', 'е'])], '1..5 items'
        )
        self.assert_rejected(
            [override('can', translations=['мочь', 'мо́чь'])], 'duplicates'
        )
        self.assert_rejected(
            [override('can', translations=['мочь', ' уме́ть'])], 'non-empty trimmed strings'
        )

    def test_rejects_unknown_fields_and_empty_overrides(self):
        self.assert_rejected(
            [override('can', transcripton='/kæn/')], 'unknown fields', 'nothing to override'
        )
        self.assert_rejected([override('can', transcription='')], 'non-empty string')


class RealOverridesFileTest(unittest.TestCase):
    def test_every_override_is_well_formed_and_keys_are_unique(self):
        overrides = load_overrides()

        self.assertIsInstance(overrides, list)
        problems = [
            (item.get('key'), problem)
            for item in overrides
            for problem in override_problems(item)
        ]
        self.assertEqual(problems, [])
        keys = [item['key'] for item in overrides]
        self.assertEqual(len(keys), len(set(keys)))

    def test_the_sources_entry_states_the_current_counts(self):
        overrides = load_overrides()
        sources_path = Path(__file__).parent.parent / 'src' / 'data' / 'sources.json'
        sources = json.loads(sources_path.read_text(encoding='utf-8'))
        entry = next(source for source in sources if source['key'] == 'manual-corrections')

        def count(field):
            return sum(field in item for item in overrides)

        self.assertIn(
            f'Число исправленных карточек: {len(overrides)} (переводы — {count("translations")},'
            f' транскрипции — {count("transcription")}, написание — {count("term")})',
            entry['changesRu'],
        )


class AssignRanksTest(unittest.TestCase):
    def test_ranks_by_frequency_then_lowercase_term_keeping_list_order(self):
        frequencies = {'cat': 0.5, 'bee': 0.2, 'ant': 0.2, 'zzz': 0.0, 'yak': 0.0}
        words = [{'term': term} for term in ['zzz', 'bee', 'cat', 'yak', 'ant']]

        assign_ranks(words, lambda term: frequencies[term])

        self.assertEqual(
            [(word['term'], word['rank']) for word in words],
            [('zzz', 5), ('bee', 3), ('cat', 1), ('yak', 4), ('ant', 2)],
        )

    def test_plain_lowercase_words_rank_before_everything_else(self):
        frequencies = {
            'rare': 0.001, 'so-so': 0.5, 'IT': 0.9, 'Monday': 0.2, "don't": 0.3,
            'zzz': 0.0, 'cat': 0.01,
        }
        words = [{'term': term} for term in frequencies]

        assign_ranks(words, lambda term: frequencies[term])

        self.assertEqual(
            [word['term'] for word in sorted(words, key=lambda word: word['rank'])],
            ['cat', 'rare', 'IT', 'so-so', "don't", 'Monday', 'zzz'],
        )

    def test_ranks_are_dense_and_unique(self):
        words = [{'term': f'w{index}'} for index in range(50)]

        assign_ranks(words, lambda term: 0.0)

        self.assertEqual(sorted(word['rank'] for word in words), list(range(1, 51)))


if __name__ == '__main__':
    unittest.main()
