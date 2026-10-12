"""Unit tests for the dictionary converter (stdlib unittest).

Run from the repository root:
    scripts/.venv/Scripts/python.exe -m unittest discover -s scripts -v
"""
import unittest

from convert_freedict import (
    assign_ranks,
    clean_transcription,
    clean_translation,
    select_translations,
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


class SelectTranslationsTest(unittest.TestCase):
    def test_dedupes_after_cleaning(self):
        self.assertEqual(
            select_translations(['в [[сеть|сети́]]', 'в сети́', 'онла́йн']),
            ['в сети́', 'онла́йн'],
        )

    def test_drops_values_that_become_empty(self):
        self.assertEqual(select_translations(['[[x|]]', '', 'да']), ['да'])
        self.assertEqual(select_translations(['[[x|]]']), [])

    def test_caps_after_dedupe(self):
        raw = ['[[a]]', 'a', 'b', '[[b]]', 'c', 'd', 'e', 'f']
        self.assertEqual(select_translations(raw), ['a', 'b', 'c', 'd', 'e'])

    def test_keeps_the_original_order(self):
        self.assertEqual(select_translations(['в', 'а', 'б']), ['в', 'а', 'б'])


class AssignRanksTest(unittest.TestCase):
    def test_ranks_by_frequency_then_lowercase_term_keeping_list_order(self):
        frequencies = {'cat': 0.5, 'Bee': 0.2, 'ant': 0.2, 'zzz': 0.0, 'Yak': 0.0}
        words = [{'term': term} for term in ['zzz', 'Bee', 'cat', 'Yak', 'ant']]

        assign_ranks(words, lambda term: frequencies[term])

        self.assertEqual(
            [(word['term'], word['rank']) for word in words],
            [('zzz', 5), ('Bee', 3), ('cat', 1), ('Yak', 4), ('ant', 2)],
        )

    def test_ranks_are_dense_and_unique(self):
        words = [{'term': f'w{index}'} for index in range(50)]

        assign_ranks(words, lambda term: 0.0)

        self.assertEqual(sorted(word['rank'] for word in words), list(range(1, 51)))


if __name__ == '__main__':
    unittest.main()
