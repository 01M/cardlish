"""Unit tests for the shared data version (stdlib unittest).

Run from the repository root:
    scripts/.venv/Scripts/python.exe -m unittest discover -s scripts -v
"""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from data_version import data_version, version_path, write_data_version

ASSETS_DIR = Path(__file__).parent.parent / 'src' / 'assets'


class DataVersionTest(unittest.TestCase):
    def test_hashes_the_dictionary_a_newline_and_the_topics(self):
        expected = hashlib.sha256(b'[1]\n' + b'\n' + b'{}\n').hexdigest()[:16]

        self.assertEqual(data_version(b'[1]\n', b'{}\n'), expected)
        self.assertRegex(expected, r'^[0-9a-f]{16}$')

    def test_ignores_crlf_line_endings_in_both_files(self):
        self.assertEqual(
            data_version(b'[\r\n  1\r\n]\r\n', b'{\r\n}\r\n'),
            data_version(b'[\n  1\n]\n', b'{\n}\n'),
        )

    def test_changes_when_either_file_changes(self):
        base = data_version(b'[1]\n', b'{"a": []}\n')

        self.assertNotEqual(data_version(b'[2]\n', b'{"a": []}\n'), base)
        self.assertNotEqual(data_version(b'[1]\n', b'{"b": []}\n'), base)

    def test_the_separator_keeps_the_two_files_apart(self):
        self.assertNotEqual(data_version(b'ab', b'c'), data_version(b'a', b'bc'))

    def test_version_path_sits_next_to_the_dictionary(self):
        self.assertEqual(
            version_path(Path('src') / 'assets' / 'dictionary.json'),
            Path('src') / 'assets' / 'dictionary.version.json',
        )


class WriteDataVersionTest(unittest.TestCase):
    def write(self, directory, topics=b'{\n  "food": []\n}\n'):
        dictionary = Path(directory) / 'dictionary.json'
        dictionary.write_bytes(b'[\n  1\n]\n')
        (Path(directory) / 'topics.json').write_bytes(topics)
        return write_data_version(dictionary, Path(directory) / 'topics.json')

    def test_writes_the_version_file_next_to_the_dictionary(self):
        with tempfile.TemporaryDirectory() as directory:
            output = self.write(directory)
            content = output.read_bytes()

        self.assertEqual(output.name, 'dictionary.version.json')
        self.assertNotIn(b'\r\n', content)
        self.assertEqual(
            json.loads(content), {'version': data_version(b'[\n  1\n]\n', b'{\n  "food": []\n}\n')}
        )

    def test_two_runs_are_byte_identical(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            self.assertEqual(self.write(first).read_bytes(), self.write(second).read_bytes())

    def test_fails_loudly_without_the_topics_file(self):
        with tempfile.TemporaryDirectory() as directory:
            dictionary = Path(directory) / 'dictionary.json'
            dictionary.write_bytes(b'[]\n')

            with self.assertRaises(FileNotFoundError):
                write_data_version(dictionary, Path(directory) / 'topics.json')
            self.assertFalse(version_path(dictionary).exists())


class ShippedVersionTest(unittest.TestCase):
    def test_the_shipped_version_matches_the_shipped_files(self):
        shipped = json.loads((ASSETS_DIR / 'dictionary.version.json').read_text(encoding='utf-8'))

        self.assertEqual(
            shipped,
            {'version': data_version(
                (ASSETS_DIR / 'dictionary.json').read_bytes(), (ASSETS_DIR / 'topics.json').read_bytes()
            )},
            'dictionary.version.json is stale: rerun scripts/convert_freedict.py or scripts/build_topics.py',
        )


if __name__ == '__main__':
    unittest.main()
