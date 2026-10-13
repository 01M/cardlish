"""Unit tests for the topic builder (stdlib unittest); none of them needs the WordNet data.

Run from the repository root:
    scripts/.venv/Scripts/python.exe -m unittest discover -s scripts -v
"""
import json
import unittest
from pathlib import Path

from build_topics import (
    MIN_TOPIC_SIZE,
    OVERRIDE_FIELDS,
    OVERRIDE_REASONS,
    RANK_CUTOFF,
    TOPIC_SLUGS,
    TOPICS,
    apply_topic_overrides,
    filter_by_rank,
    load_overrides,
    oewn_sense_key,
    override_problems,
    serialise_topics,
    small_topics,
)

DICTIONARY_PATH = Path(__file__).parent.parent / 'src' / 'assets' / 'dictionary.json'
TOPICS_TEST = ['food', 'animal']


def override(topic, key, action, reason='wrong-sense'):
    return {'topic': topic, 'key': key, 'action': action, 'reason': reason}


class FilterByRankTest(unittest.TestCase):
    def test_keeps_keys_up_to_the_cutoff_inclusive(self):
        ranks = {'apple': 1, 'pear': RANK_CUTOFF, 'quince': RANK_CUTOFF + 1}
        membership = {'food': {'apple', 'pear', 'quince'}, 'animal': set()}

        self.assertEqual(
            filter_by_rank(membership, ranks),
            {'food': {'apple', 'pear'}, 'animal': set()},
        )

    def test_uses_the_given_cutoff(self):
        self.assertEqual(filter_by_rank({'food': {'a', 'b'}}, {'a': 1, 'b': 3}, cutoff=2), {'food': {'a'}})


class ApplyOverridesTest(unittest.TestCase):
    automatic = {'food': {'apple', 'must'}, 'animal': {'cat'}}
    keys = {'apple', 'must', 'cat', 'cake', 'monday'}

    def test_removes_and_adds(self):
        result = apply_topic_overrides(
            self.automatic,
            [override('food', 'must', 'remove'), override('food', 'cake', 'add', 'missed-member')],
            self.keys,
            TOPICS_TEST,
        )

        self.assertEqual(result, {'food': {'apple', 'cake'}, 'animal': {'cat'}})
        self.assertEqual(self.automatic['food'], {'apple', 'must'})

    def test_an_add_may_bring_in_a_key_above_the_cutoff(self):
        result = apply_topic_overrides(
            {'food': set(), 'animal': set()}, [override('food', 'monday', 'add', 'calendar')], self.keys, TOPICS_TEST,
        )

        self.assertEqual(result['food'], {'monday'})

    def test_reports_every_problem_at_once(self):
        overrides = [
            override('drinks', 'apple', 'remove'),
            override('food', 'unknown', 'add', 'missed-member'),
            override('food', 'cat', 'remove'),
            override('food', 'apple', 'add', 'missed-member'),
            override('animal', 'cat', 'remove', 'boring'),
            override('animal', 'cake', 'drop'),
            override('food', 'must', 'remove'),
            override('food', 'must', 'remove'),
            {'topic': 'food', 'key': 'apple', 'action': 'remove'},
            'not an object',
        ]

        with self.assertRaises(ValueError) as caught:
            apply_topic_overrides(self.automatic, overrides, self.keys, TOPICS_TEST)

        message = str(caught.exception)
        for expected in [
            '#0 (drinks/apple): unknown topic',
            '#1 (food/unknown): key not in dictionary.json',
            '#2 (food/cat): stale remove (not in the automatic set)',
            '#3 (food/apple): stale add (already in the automatic set)',
            "#4 (animal/cat): unknown reason 'boring'",
            '#5 (animal/cake): action must be "add" or "remove"',
            '#7 (food/must): duplicate decision',
            '#8 (food/apple): fields must be exactly',
            '#9: must be an object',
        ]:
            self.assertIn(expected, message)
        self.assertNotIn('#6', message)

    def test_rejects_a_non_list(self):
        self.assertEqual(override_problems({}, {}, set(), TOPICS_TEST), ['overrides must be a list'])


class SerialiseTopicsTest(unittest.TestCase):
    def test_table_order_sorted_keys_lf_and_small_topics_left_out(self):
        membership = {'animal': {'cat', 'ant', 'bee'}, 'food': {'pear', 'apple'}, 'plant': set()}

        text = serialise_topics(membership, ['food', 'animal', 'plant'], min_size=2)

        self.assertEqual(
            text,
            '{\n  "food": [\n    "apple",\n    "pear"\n  ],\n  "animal": [\n    "ant",\n    "bee",\n    "cat"\n  ]\n}\n',
        )
        self.assertNotIn('\r', text)
        self.assertEqual(serialise_topics(membership, ['food', 'animal', 'plant'], min_size=3),
                         '{\n  "animal": [\n    "ant",\n    "bee",\n    "cat"\n  ]\n}\n')

    def test_identical_for_the_same_input_in_any_order(self):
        first = serialise_topics({'food': {'b', 'a', 'c'}}, ['food'], min_size=1)
        second = serialise_topics({'food': set(['c', 'a', 'b'])}, ['food'], min_size=1)

        self.assertEqual(first, second)

    def test_keeps_non_ascii_keys_readable(self):
        self.assertIn('"café"', serialise_topics({'food': {'café'}}, ['food'], min_size=1))

    def test_lists_small_topics(self):
        self.assertEqual(small_topics({'food': {'a'}, 'animal': {'a', 'b'}}, min_size=2), ['food'])


class SenseKeyTest(unittest.TestCase):
    def test_converts_oewn_sense_ids_to_princeton_sense_keys(self):
        self.assertEqual(oewn_sense_key('oewn-bank__1.17.01..'), 'bank%1:17:01::')
        self.assertEqual(oewn_sense_key('oewn-red__5.00.01.chromatic.00'), 'red%5:00:01:chromatic:00')
        self.assertEqual(oewn_sense_key('oewn-o-apos-clock__4.02.00..'), "o'clock%4:02:00::")
        self.assertEqual(oewn_sense_key('oewn-well--known__5.00.00.known.00'), 'well-known%5:00:00:known:00')
        self.assertEqual(oewn_sense_key('oewn-Monday__1.28.00..'), 'monday%1:28:00::')


class TopicTableTest(unittest.TestCase):
    def test_slugs_are_unique_and_every_topic_has_roots(self):
        self.assertEqual(len(TOPIC_SLUGS), len(set(TOPIC_SLUGS)))
        for slug, title, roots, excluded, _ in TOPICS:
            self.assertTrue(title.strip(), slug)
            self.assertTrue(roots, slug)
            for synset_id, label in roots + excluded:
                self.assertRegex(synset_id, r'^oewn-\d{8}-[nvars]$')
                self.assertTrue(label.strip())


class RealOverridesFileTest(unittest.TestCase):
    """Structure of scripts/data/topic_overrides.json; staleness is checked by the build."""

    def test_every_decision_is_well_formed_and_unique(self):
        overrides = load_overrides()
        dictionary_keys = {
            card['term'].strip().lower()
            for card in json.loads(DICTIONARY_PATH.read_text(encoding='utf-8'))
        }

        self.assertIsInstance(overrides, list)
        problems = []
        for index, item in enumerate(overrides):
            if not isinstance(item, dict) or set(item) != OVERRIDE_FIELDS:
                problems.append((index, 'fields'))
                continue
            if item['topic'] not in TOPIC_SLUGS:
                problems.append((index, 'topic'))
            if item['key'] not in dictionary_keys:
                problems.append((index, 'key'))
            if item['action'] not in ('add', 'remove'):
                problems.append((index, 'action'))
            if item['reason'] not in OVERRIDE_REASONS:
                problems.append((index, 'reason'))
        self.assertEqual(problems, [])
        decisions = [(item['topic'], item['key']) for item in overrides]
        self.assertEqual(len(decisions), len(set(decisions)))

    def test_file_has_one_decision_per_line(self):
        lines = (Path(__file__).parent / 'data' / 'topic_overrides.json').read_text(encoding='utf-8').splitlines()

        self.assertEqual(lines[0], '[' if len(lines) > 1 else '[]')
        for line in lines[1:-1]:
            self.assertRegex(line, r'^  \{.*\},?$')

    def test_minimum_topic_size_is_positive(self):
        self.assertGreater(MIN_TOPIC_SIZE, 0)

    def test_the_sources_entry_states_the_current_decision_counts(self):
        overrides = load_overrides()
        sources_path = Path(__file__).parent.parent / 'src' / 'data' / 'sources.json'
        sources = json.loads(sources_path.read_text(encoding='utf-8'))
        entry = next(source for source in sources if source['key'] == 'manual-corrections')
        adds = sum(item['action'] == 'add' for item in overrides)
        removes = sum(item['action'] == 'remove' for item in overrides)

        self.assertIn(
            f'Число ручных решений о составе тематических разделов: {len(overrides)}'
            f' (добавлено слов — {adds}, убрано — {removes})',
            entry['changesRu'],
        )


if __name__ == '__main__':
    unittest.main()
