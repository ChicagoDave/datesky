#!/usr/bin/env python3
"""
Brand-name candidate generator.

Generates pronounceable 6-8 letter invented words for brand brainstorming.
Stitches CVCV-pattern syllables with optional onset clusters, biases towards
soft vowel endings, filters profanity-adjacent substrings, skips real English
words found in /usr/share/dict/words.

Usage:
    python scripts/name-gen.py [count]

Defaults to 60 candidates. One per line, capitalized.

Owner: brainstorming utility — not part of the app.
"""

import os
import random
import sys

# Soft consonant palette — m, n, s, l, h, r, g, t, w only.
SINGLE_C = list("mnslhrgtw")

# Onset clusters built only from the soft palette.
CLUSTER_C = [
    "gl", "gr", "sl", "sm", "sn", "st", "sw", "tr", "tw",
    "sh", "th", "thr", "shr",
]

# Single vowels — boost a, e, o slightly for softer overall feel.
SINGLE_V = list("aeiou") + ["a", "e", "o"]

# Smooth vowel digraphs.
DIGRAPH_V = ["ae", "ai", "au", "ea", "ei", "eo", "ia", "ie", "io", "oa", "ou"]

# Substring blocklist — anything name contains these is filtered out.
BLOCK = {
    "fuck", "shit", "cock", "dick", "cunt", "twat", "fag", "nig", "kike",
    "bitch", "ass", "tits", "wank", "spic", "anal", "anus", "porn", "rape",
    "kill", "nazi", "isis", "piss", "fart", "turd", "jizz", "slut", "whore",
    "homo", "tard", "dyke", "coon", "chink", "gook", "wog",
}


def _syllable(use_cluster):
    """One syllable: (cluster | single) consonant + single vowel. Ends in vowel."""
    onset = random.choice(CLUSTER_C) if use_cluster else random.choice(SINGLE_C)
    return onset + random.choice(SINGLE_V)


def gen_name():
    """Build 3 syllables with at most one cluster, yielding length 6 or 7."""
    # Pattern weights: cluster at start is most natural; cluster mid is OK; no cluster is fine.
    patterns = [
        (False, False, False),  # 6 letters — simple CVCVCV
        (False, False, False),
        (True,  False, False),  # 7 letters — cluster at start
        (True,  False, False),
        (False, True,  False),  # 7 letters — cluster mid
    ]
    p = random.choice(patterns)
    return _syllable(p[0]) + _syllable(p[1]) + _syllable(p[2])


def is_clean(name, real_words):
    """Reject if profanity-adjacent, real English word, or out of length range."""
    nl = name.lower()
    if any(b in nl for b in BLOCK):
        return False
    if nl in real_words:
        return False
    if len(name) < 6 or len(name) > 7:
        return False
    return True


def load_real_words():
    """Load system wordlist for real-word filtering. Empty set if not found."""
    path = "/usr/share/dict/words"
    if not os.path.exists(path):
        return set()
    with open(path) as f:
        return {w.strip().lower() for w in f if w.strip()}


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    real_words = load_real_words()

    seen = set()
    output = []
    tries = 0
    while len(output) < count and tries < count * 200:
        tries += 1
        n = gen_name()
        if n in seen or not is_clean(n, real_words):
            continue
        seen.add(n)
        output.append(n.capitalize())

    for n in output:
        print(n)


if __name__ == "__main__":
    main()
