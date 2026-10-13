"""Version of the data the app syncs into its database: dictionary.json and topics.json.

Shared by convert_freedict.py and build_topics.py: each rewrites src/assets/dictionary.version.json
at the end of its run, using the other file as it currently exists. The app runs its dictionary
sync (words and topic membership) whenever this value differs from the one it stored.
"""
import hashlib
import json
from pathlib import Path


def lf(data):
    """CRLF -> LF, so a Windows checkout with CRLF line endings hashes the same."""
    return data.replace(b'\r\n', b'\n')


def data_version(dictionary_bytes, topics_bytes):
    """First 16 hex chars of sha256 over the LF-normalised dictionary.json bytes, a single "\\n",
    then the LF-normalised topics.json bytes (src/assets/dictionary.test.ts computes the same)."""
    return hashlib.sha256(lf(dictionary_bytes) + b'\n' + lf(topics_bytes)).hexdigest()[:16]


def version_path(dictionary_path):
    """dictionary.json -> dictionary.version.json in the same directory."""
    dictionary = Path(dictionary_path)
    return dictionary.with_name(f'{dictionary.stem}.version.json')


def write_data_version(dictionary_path, topics_path):
    """Write dictionary.version.json next to dictionary.json from both files as they are now
    (a missing file fails loudly). Returns the path written."""
    version = data_version(Path(dictionary_path).read_bytes(), Path(topics_path).read_bytes())
    output = version_path(dictionary_path)
    output.write_bytes((json.dumps({'version': version}, indent=2) + '\n').encode('utf-8'))
    return output
