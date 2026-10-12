"""Unit tests for the dictionary converter (stdlib unittest).

Run from the repository root:
    scripts/.venv/Scripts/python.exe -m unittest discover -s scripts -v
"""
import unittest
import xml.etree.ElementTree as ET

from convert_freedict import (
    assign_ranks,
    build_cards,
    clean_transcription,
    clean_translation,
    dedupe_translations,
    merge_translations,
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


def entry(term, translations, transcription=''):
    return {'term': term, 'translations': translations, 'transcription': transcription}


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
            entry('light', ['лёгкий'], '/lait/'),
        ])

        self.assertEqual(cards[0]['transcription'], '/lait/')

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
            [{'term': 'light', 'translations': ['свет'], 'transcription': '/laɪt/'}],
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
