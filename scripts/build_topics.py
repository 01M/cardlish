"""Build topic membership for dictionary cards from Open English WordNet.

Writes src/assets/topics.json: { "<slug>": ["<dict_key>", ...] } — slugs in TOPICS order,
keys sorted. Membership is computed from the WordNet hypernym hierarchy (rule f below),
limited to cards with rank <= RANK_CUTOFF, then hand-curated with
scripts/data/topic_overrides.json. Topics with fewer than MIN_TOPIC_SIZE members are not
written. The app does not read topics.json yet.

Data (downloaded once into the gitignored WN_DATA_DIR by the `wn` package):
    oewn:2025   Open English WordNet 2025 (CC BY 4.0) — hierarchy and sense order
    omw-en:2.0  Princeton WordNet 3.0 (WordNet License) — sense usage (SemCor) counts

Usage (from the repository root):
    scripts/.venv/Scripts/python.exe scripts/build_topics.py src/assets/dictionary.json src/assets/topics.json
    ... --review <path>   also write the curation candidates (rule f + rule c additions)
"""
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
WN_DATA_DIR = SCRIPTS_DIR / '.wn_data'
OVERRIDES_PATH = SCRIPTS_DIR / 'data' / 'topic_overrides.json'
WORDNET = 'oewn:2025'
COUNTS_LEXICON = 'omw-en:2.0'

# Only cards with rank <= RANK_CUTOFF come from the automatic mapping; an explicit "add"
# override may bring in any card (e.g. weekday and month names, ranked above 20000)
RANK_CUTOFF = 20000
# A topic with fewer members after curation is not written
MIN_TOPIC_SIZE = 40

# slug, Russian working title, roots, excluded subtrees, map adjectives (via attribute /
# derivation / pertainym links to nouns). Roots are stable OEWN synset ids; the label is
# only a comment. Every id must exist in WORDNET (checked at start-up).
TOPICS = [
    ('food', 'Еда и напитки', [
        ('oewn-00021445-n', 'food, nutrient'),
        ('oewn-07571428-n', 'solid food'),
        ('oewn-03466051-n', 'foodstuff, grocery'),
        ('oewn-07721456-n', 'produce, green goods'),
        ('oewn-01170802-v', 'eat: take in solid food'),
        ('oewn-01168667-v', 'eat: eat a meal'),
        ('oewn-01172332-v', 'drink: take in liquids'),
        ('oewn-01669533-v', 'cook: prepare a hot meal'),
        ('oewn-01668067-v', 'cook: prepare for eating by applying heat'),
    ], [], False),
    ('animal', 'Животные', [
        ('oewn-00015568-n', 'animal'),
    ], [('oewn-02474393-n', 'hominid')], False),
    ('plant', 'Растения', [
        ('oewn-00017402-n', 'plant, flora'),
        ('oewn-13107668-n', 'plant part'),
    ], [], False),
    ('body', 'Части тела', [
        ('oewn-05227735-n', 'body part'),
        ('oewn-05245085-n', 'body covering'),
    ], [], False),
    ('clothing', 'Одежда и украшения', [
        ('oewn-03055525-n', 'clothing'),
        ('oewn-03385713-n', 'footwear, footgear'),
        ('oewn-03602662-n', 'jewelry'),
    ], [], False),
    ('home', 'Дом и быт', [
        ('oewn-02916498-n', 'building, edifice'),
        ('oewn-04112987-n', 'room'),
        ('oewn-03551520-n', 'housing, lodging'),
        ('oewn-03410635-n', 'furniture'),
        ('oewn-03533443-n', 'home appliance'),
        ('oewn-04389081-n', 'tableware'),
        ('oewn-03626258-n', 'kitchen utensil'),
    ], [], False),
    ('transport', 'Транспорт и дороги', [
        ('oewn-03105141-n', 'conveyance, transport'),
        ('oewn-08693705-n', 'urban area'),
        ('oewn-04433753-n', 'thoroughfare'),
        ('oewn-04103160-n', 'road, route'),
    ], [], False),
    ('occupation', 'Профессии', [
        ('oewn-09655706-n', 'worker'),
        ('oewn-10499838-n', 'professional'),
    ], [], False),
    ('family', 'Семья', [
        ('oewn-10255246-n', 'relative, relation'),
        ('oewn-07986853-n', 'family, family unit'),
    ], [], False),
    ('colour', 'Цвета', [
        ('oewn-04963771-n', 'color'),
    ], [], True),
    ('time', 'Время', [
        ('oewn-15137796-n', 'time period'),
        ('oewn-15179734-n', 'time unit'),
    ], [], False),
    ('weather', 'Погода', [
        ('oewn-11545095-n', 'weather, atmospheric condition'),
        ('oewn-11445694-n', 'atmospheric phenomenon'),
    ], [], False),
    ('emotion', 'Чувства и эмоции', [
        ('oewn-00026390-n', 'feeling'),
    ], [], True),
    ('health', 'Здоровье и медицина', [
        ('oewn-14075528-n', 'ill health'),
        ('oewn-14323139-n', 'symptom'),
        ('oewn-03745652-n', 'medicine, medication'),
        ('oewn-10184702-n', 'health professional'),
        ('oewn-03545775-n', 'hospital'),
    ], [], False),
    ('school', 'Школа и учёба', [
        ('oewn-08293263-n', 'educational institution'),
        ('oewn-04153115-n', 'school, schoolhouse'),
        ('oewn-10065521-n', 'educator'),
        ('oewn-10685137-n', 'student, pupil'),
        ('oewn-00891150-n', 'lesson'),
        ('oewn-00884975-n', 'education, instruction, teaching'),
        ('oewn-00830768-v', 'teach'),
        ('oewn-00599310-v', 'learn: gain knowledge or skills'),
        ('oewn-00608800-v', 'study: be a student'),
        ('oewn-00601387-v', 'learn, study: be a student of a subject'),
    ], [], False),
    ('sport', 'Спорт и игры', [
        ('oewn-00524569-n', 'sport, athletics'),
        ('oewn-09839665-n', 'athlete'),
        ('oewn-04292284-n', 'sports equipment'),
        ('oewn-03971038-n', 'plaything, toy'),
        ('oewn-00456623-n', 'game: contest with rules'),
    ], [], False),
    ('music', 'Музыка и танцы', [
        ('oewn-07034009-n', 'music'),
        ('oewn-03806455-n', 'musical instrument'),
        ('oewn-10360025-n', 'musician, instrumentalist'),
        ('oewn-10359679-n', 'musician: composer or conductor'),
        ('oewn-01728928-v', 'play: play on an instrument'),
        ('oewn-01734912-v', 'sing'),
        ('oewn-07033652-n', 'dance: art form'),
        ('oewn-00429255-n', 'dancing'),
    ], [], False),
    ('money', 'Деньги и покупки', [
        ('oewn-13405730-n', 'money'),
        ('oewn-13407086-n', 'currency'),
        ('oewn-13299398-n', 'payment: sum paid'),
        ('oewn-01122769-n', 'payment: act of paying'),
        ('oewn-03753653-n', 'mercantile establishment, store'),
        ('oewn-08071473-n', 'financial institution'),
        ('oewn-13324337-n', 'price'),
        ('oewn-02211988-v', 'buy, purchase'),
        ('oewn-02247246-v', 'sell'),
        ('oewn-02256551-v', 'pay'),
    ], [], False),
    ('technology', 'Техника и компьютеры', [
        ('oewn-03086983-n', 'computer'),
        ('oewn-06578068-n', 'software'),
        ('oewn-03089375-n', 'computer network'),
        ('oewn-03283159-n', 'electronic equipment'),
    ], [], False),
    ('nature', 'Природа и ландшафт', [
        ('oewn-09310874-n', 'geological formation'),
        ('oewn-09248053-n', 'body of water'),
        ('oewn-09358822-n', 'landmass'),
    ], [], False),
    ('travel', 'Путешествия', [
        ('oewn-00296527-n', 'travel, traveling'),
        ('oewn-10737780-n', 'tourist'),
        ('oewn-10423621-n', 'passenger'),
        ('oewn-02777635-n', 'baggage, luggage'),
        ('oewn-03547513-n', 'hotel'),
        ('oewn-01849662-v', 'travel, journey'),
    ], [], False),
]

TOPIC_SLUGS = [slug for slug, *_ in TOPICS]

# Rule f: when senses 1 and 2 of a word belong to these topics, both are taken (regular
# polysemy: banana the plant / the fruit, chicken the bird / the meat, liver the organ / the food)
REGULAR_POLYSEMY_TOPICS = {'food', 'plant', 'animal', 'body'}

# Allowed "reason" values of topic overrides
OVERRIDE_REASONS = {
    'wrong-sense': 'the topic sense is not the commonly used one',
    'translation-mismatch': 'the card translation describes another sense',
    'slang': 'the topic sense is slang',
    'rare-jargon': 'technical or rare term, not useful in a learner topic',
    'off-topic': 'the WordNet sense is right but outside the topic as titled',
    'vulgar': 'vulgar, sexual, offensive or slur item',
    'missed-member': 'a common member the automatic rule missed',
    'calendar': 'weekday or month name',
}
OVERRIDE_FIELDS = {'topic', 'key', 'action', 'reason'}


# ---------------------------------------------------------------- pure helpers

def filter_by_rank(membership, ranks, cutoff=RANK_CUTOFF):
    """Keep only keys whose rank is <= cutoff: {topic: set(keys)}."""
    return {topic: {key for key in keys if ranks[key] <= cutoff} for topic, keys in membership.items()}


def override_problems(overrides, automatic, dictionary_keys, topics=TOPIC_SLUGS):
    """Every problem of the override list against the automatic membership, as strings."""
    if not isinstance(overrides, list):
        return ['overrides must be a list']
    problems = []
    seen = set()
    for index, item in enumerate(overrides):
        where = f'#{index}'
        if not isinstance(item, dict):
            problems.append(f'{where}: must be an object')
            continue
        where = f'#{index} ({item.get("topic")}/{item.get("key")})'
        fields = set(item)
        if fields != OVERRIDE_FIELDS:
            problems.append(f'{where}: fields must be exactly {sorted(OVERRIDE_FIELDS)}, got {sorted(fields)}')
            continue
        topic, key, action, reason = item['topic'], item['key'], item['action'], item['reason']
        if topic not in topics:
            problems.append(f'{where}: unknown topic')
            continue
        if key not in dictionary_keys:
            problems.append(f'{where}: key not in dictionary.json')
        if action not in ('add', 'remove'):
            problems.append(f'{where}: action must be "add" or "remove"')
        if reason not in OVERRIDE_REASONS:
            problems.append(f'{where}: unknown reason {reason!r}')
        if (topic, key) in seen:
            problems.append(f'{where}: duplicate decision')
        seen.add((topic, key))
        members = automatic.get(topic, set())
        if action == 'remove' and key not in members:
            problems.append(f'{where}: stale remove (not in the automatic set)')
        if action == 'add' and key in members:
            problems.append(f'{where}: stale add (already in the automatic set)')
    return problems


def apply_topic_overrides(automatic, overrides, dictionary_keys, topics=TOPIC_SLUGS):
    """Apply hand decisions to the automatic membership; fail with every problem at once."""
    problems = override_problems(overrides, automatic, dictionary_keys, topics)
    if problems:
        raise ValueError('Invalid topic overrides:\n  ' + '\n  '.join(problems))
    result = {topic: set(automatic.get(topic, set())) for topic in topics}
    for item in overrides:
        if item['action'] == 'add':
            result[item['topic']].add(item['key'])
        else:
            result[item['topic']].discard(item['key'])
    return result


def small_topics(membership, min_size=MIN_TOPIC_SIZE):
    return [topic for topic, keys in membership.items() if len(keys) < min_size]


def serialise_topics(membership, topics=TOPIC_SLUGS, min_size=MIN_TOPIC_SIZE):
    """Stable JSON text: topics in table order (small ones left out), keys sorted, LF, one key
    per line so that diffs show single membership changes."""
    data = {topic: sorted(membership[topic]) for topic in topics
            if len(membership.get(topic, ())) >= min_size}
    return json.dumps(data, ensure_ascii=False, indent=2) + '\n'


def load_overrides(path=OVERRIDES_PATH):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def to_dict_key(term):
    return term.strip().lower()


# ---------------------------------------------------------------- WordNet mapping

def oewn_sense_key(sense_id):
    """OEWN sense id -> Princeton sense key: oewn-bank__1.17.01.. -> bank%1:17:01::"""
    body = sense_id[len('oewn-'):]
    lemma, _, tail = body.partition('__')
    lemma = lemma.replace('-apos-', "'").replace('--', '-')
    parts = tail.split('.')
    return f'{lemma.lower()}%{parts[0]}:{parts[1]}:{parts[2]}:{parts[3]}:{parts[4]}'


class TopicMapper:
    def __init__(self, data_dir=WN_DATA_DIR):
        import wn  # only needed with the WordNet data, not by the unit tests

        wn.config.data_directory = str(data_dir)
        self.wordnet = wn.Wordnet(WORDNET)
        self.counts_lexicon = wn.Wordnet(COUNTS_LEXICON)
        missing = []
        for slug, _, roots, excluded, _ in TOPICS:
            for synset_id, label in roots + excluded:
                try:
                    self.wordnet.synset(synset_id)
                except wn.Error:
                    missing.append(f'{slug}: {synset_id} ({label})')
        if missing:
            raise ValueError(f'Root synsets missing in {WORDNET}:\n  ' + '\n  '.join(missing))
        self.roots = {slug: {sid for sid, _ in roots} for slug, _, roots, _, _ in TOPICS}
        self.excluded = {slug: {sid for sid, _ in excluded} for slug, _, _, excluded, _ in TOPICS}
        self.adjective_topics = {slug for slug, *_, adjectives in TOPICS if adjectives}
        self._ancestors = {}

    def ancestors(self, synset):
        """The synset and all its class hypernyms (instance hypernyms excluded)."""
        if synset.id not in self._ancestors:
            result = {synset.id}
            stack = [synset]
            while stack:
                for hyper in stack.pop().hypernyms():
                    if hyper.id not in result:
                        result.add(hyper.id)
                        stack.append(hyper)
            self._ancestors[synset.id] = result
        return self._ancestors[synset.id]

    @staticmethod
    def adjective_targets(sense):
        synsets = [sense.synset()] + sense.synset().get_related('similar')
        targets = [t for ss in synsets for t in ss.get_related('attribute')]
        for relation in ('derivation', 'pertainym'):
            targets += [t.synset() for t in sense.get_related(relation)]
        return [t for t in targets if t.pos == 'n']

    def topics_of(self, senses):
        found = set()
        for sense in senses:
            is_adjective = sense.word().pos in ('a', 's')
            synsets = self.adjective_targets(sense) if is_adjective else [sense.synset()]
            for synset in synsets:
                ancestors = self.ancestors(synset)
                for slug, roots in self.roots.items():
                    if is_adjective and slug not in self.adjective_topics:
                        continue
                    if ancestors & roots and not ancestors & self.excluded[slug]:
                        found.add(slug)
        return found

    def usage_counts(self, lemma):
        counts = {}
        for sense in self.counts_lexicon.senses(lemma):
            key = sense.metadata().get('identifier')
            if key:
                counts[key] = sum(sense.counts())
        return counts

    def chosen_senses(self, key, rank):
        """(rule f senses, rule c senses) of a dictionary key; per WordNet part of speech:
        rule c — first two senses or any sense with a usage count;
        rule f — dominant parts of speech only (>= 10% of the lemma's counts, or a first
        sense with >= 3 counts, or a lemma with < 3 counts in total); the first sense,
        senses with count >= 2 and >= 25% of the part of speech, the second sense of a
        rare card (rank > 5000) with <= 3 senses, and the second sense when senses 1 and 2
        form a regular-polysemy pair (REGULAR_POLYSEMY_TOPICS)."""
        senses = self.wordnet.senses(key)
        counts = self.usage_counts(key)
        by_pos = defaultdict(list)
        for sense in senses:
            pos = 'a' if sense.word().pos in ('a', 's') else sense.word().pos
            by_pos[pos].append((sense, counts.get(oewn_sense_key(sense.id), 0)))
        pos_total = {pos: sum(count for _, count in items) for pos, items in by_pos.items()}
        lemma_total = sum(pos_total.values())

        rule_f, rule_c = [], []
        for pos, items in by_pos.items():
            for index, (sense, count) in enumerate(items):
                if index < 2 or count > 0:
                    rule_c.append(sense)
            dominant = (lemma_total < 3 or pos_total[pos] >= 0.10 * lemma_total
                        or items[0][1] >= 3)
            if not dominant:
                continue
            regular_pair = (
                len(items) > 1
                and bool(self.topics_of([items[0][0]]) & REGULAR_POLYSEMY_TOPICS)
                and bool(self.topics_of([items[1][0]]) & REGULAR_POLYSEMY_TOPICS)
            )
            for index, (sense, count) in enumerate(items):
                strong = count >= 2 and count >= 0.25 * pos_total[pos]
                rare_second = index == 1 and rank > 5000 and len(items) <= 3
                if index == 0 or strong or rare_second or (index == 1 and regular_pair):
                    rule_f.append(sense)
        return rule_f, rule_c

    def map_cards(self, cards):
        """{slug: set(keys)} for rule f and for rule c, over all cards."""
        rule_f = {slug: set() for slug in TOPIC_SLUGS}
        rule_c = {slug: set() for slug in TOPIC_SLUGS}
        for card in cards:
            key = to_dict_key(card['term'])
            senses_f, senses_c = self.chosen_senses(key, card['rank'])
            for slug in self.topics_of(senses_f):
                rule_f[slug].add(key)
            for slug in self.topics_of(senses_c):
                rule_c[slug].add(key)
        return rule_f, rule_c


def write_review(path, automatic, candidates, cards_by_key):
    """Curation sheet: per topic, automatic members and rule-c additions with translations."""
    lines = []
    for slug, title, *_ in TOPICS:
        extra = candidates[slug] - automatic[slug]
        lines.append(f'## {slug} — {title}: {len(automatic[slug])} automatic, {len(extra)} rule-c additions')
        for key in sorted(automatic[slug] | extra, key=lambda k: cards_by_key[k]['rank']):
            card = cards_by_key[key]
            mark = ' ' if key in automatic[slug] else '+'
            lines.append(f'{mark} {key} #{card["rank"]} — {card["translation"]}')
        lines.append('')
    Path(path).write_text('\n'.join(lines), encoding='utf-8', newline='\n')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description='Build topic membership (topics.json) from Open English WordNet.')
    parser.add_argument('dictionary', help='Path to src/assets/dictionary.json')
    parser.add_argument('output', help='Output topics.json path')
    parser.add_argument('--review', help='Also write the curation candidates to this path')
    args = parser.parse_args()

    cards = json.loads(Path(args.dictionary).read_text(encoding='utf-8'))
    cards_by_key = {to_dict_key(card['term']): card for card in cards}
    ranks = {key: card['rank'] for key, card in cards_by_key.items()}

    rule_f, rule_c = TopicMapper().map_cards(cards)
    automatic = filter_by_rank(rule_f, ranks)
    candidates = {slug: automatic[slug] | filter_by_rank(rule_c, ranks)[slug] for slug in TOPIC_SLUGS}
    if args.review:
        write_review(args.review, automatic, candidates, cards_by_key)

    final = apply_topic_overrides(automatic, load_overrides(), set(cards_by_key))
    Path(args.output).write_bytes(serialise_topics(final).encode('utf-8'))
    for slug in TOPIC_SLUGS:
        note = '' if len(final[slug]) >= MIN_TOPIC_SIZE else f'  (not written: < {MIN_TOPIC_SIZE})'
        print(f'{slug}: {len(automatic[slug])} automatic -> {len(final[slug])}{note}')
    print(f'Wrote {args.output}')


if __name__ == '__main__':
    main()
