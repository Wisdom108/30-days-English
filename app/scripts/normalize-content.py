#!/usr/bin/env python3
"""Normalize src/data/lessons.json to one English standard (General American).

Conservative, high-confidence transforms only (never guess an IPA we don't know):
  1. IPA → GA: canonical map for documented cross-day conflicts; safe global
     shifts (/əʊ/→/oʊ/, /ɒ/→/ɑː/), remove syllable dots, word-final rhoticity
     for headwords ending in 'r'.
  2. Spelling → American on English prose (favourite→favorite, colour→color, …).
  3. POS tags → fixed enum with canonical ordering.
  4. Data glitches: '&amp;'→'&', remove duplicate day-3 'minute', ' .'→'.'.

Run: python3 scripts/normalize-content.py [--apply]
Without --apply it prints a report and writes nothing.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.normpath(os.path.join(HERE, "..", "src", "data", "lessons.json"))
APPLY = "--apply" in sys.argv

changes = []


def log(kind, before, after, where=""):
    if before != after:
        changes.append((kind, where, before, after))


# ---------------------------------------------------------------- IPA → GA
GA_IPA = {
    "because": "/bɪˈkɔz/", "boring": "/ˈbɔːrɪŋ/", "dinner": "/ˈdɪnər/",
    "doctor": "/ˈdɑːktər/", "early": "/ˈɜːrli/", "favorite": "/ˈfeɪvərɪt/",
    "favourite": "/ˈfeɪvərɪt/", "future": "/ˈfjuːtʃər/", "hobby": "/ˈhɑːbi/",
    "home": "/hoʊm/", "idea": "/aɪˈdiːə/", "job": "/dʒɑːb/", "kitchen": "/ˈkɪtʃən/",
    "listen": "/ˈlɪsən/", "moment": "/ˈmoʊmənt/", "morning": "/ˈmɔːrnɪŋ/",
    "never": "/ˈnevər/", "nurse": "/nɜːrs/", "old": "/oʊld/", "order": "/ˈɔːrdər/",
    "really": "/ˈriːəli/", "sorry": "/ˈsɑːri/", "start": "/stɑːrt/",
    "student": "/ˈstuːdənt/", "sure": "/ʃʊr/", "table": "/ˈteɪbəl/",
    "teacher": "/ˈtiːtʃər/", "together": "/təˈɡeðər/", "wash": "/wɑːʃ/",
    "water": "/ˈwɔːtər/", "weekend": "/ˈwiːkend/", "work": "/wɜːrk/",
}

# Merge the reviewed GA override table (rhoticity / BATH / CLOTH corrections),
# generated into scripts/ga-overrides.json. Keyed by lowercase word; authoritative.
_OVR = os.path.join(HERE, "ga-overrides.json")
if os.path.exists(_OVR):
    _extra = json.load(open(_OVR, encoding="utf-8"))
    GA_IPA.update({k.strip().lower(): v for k, v in _extra.items()})
    print(f"(loaded {len(_extra)} GA overrides from ga-overrides.json)")


def normalize_ipa(word, ipa):
    orig = ipa
    # safe global GA shifts
    s = ipa.replace("əʊ", "oʊ").replace("ɒ", "ɑː")
    # remove syllable dots inside the transcription (keep the outer slashes).
    # Dots are only ever syllable separators here, so strip all interior dots —
    # a char-class approach misses IPA symbols like ː, ŋ, ð, θ.
    if s.startswith("/") and s.endswith("/") and len(s) > 2:
        s = "/" + s[1:-1].replace(".", "") + "/"
    # word-final rhoticity for headwords spelled with a final 'r'
    w = word.strip().lower()
    if w.endswith("r"):
        s = re.sub(r"ə/$", "ər/", s)
        s = re.sub(r"ɜː/$", "ɜːr/", s)
        s = re.sub(r"ɔː/$", "ɔːr/", s)
    # authoritative per-word override for the documented conflict set
    if w in GA_IPA:
        s = GA_IPA[w]
    if s != orig:
        log("ipa", orig, s, w)
    return s


# ------------------------------------------------------------- spelling → US
SPELL = {
    r"\bfavourite\b": "favorite", r"\bFavourite\b": "Favorite",
    r"\bfavourites\b": "favorites",
    r"\bcolour\b": "color", r"\bColour\b": "Color", r"\bcolours\b": "colors",
    r"\bcolourful\b": "colorful",
    r"\bneighbour\b": "neighbor", r"\bNeighbour\b": "Neighbor",
    r"\bneighbours\b": "neighbors", r"\bneighbourhood\b": "neighborhood",
    r"\btravelled\b": "traveled", r"\btravelling\b": "traveling",
    r"\btraveller\b": "traveler", r"\btravellers\b": "travelers",
    r"\bcentre\b": "center", r"\bCentre\b": "Center", r"\bcentres\b": "centers",
    r"\brealise\b": "realize", r"\brealised\b": "realized",
    r"\brealising\b": "realizing", r"\bRealise\b": "Realize",
    r"\borganise\b": "organize", r"\borganised\b": "organized",
    r"\bapologise\b": "apologize", r"\bapologised\b": "apologized",
    r"\brecognise\b": "recognize", r"\brecognised\b": "recognized",
    r"\bgrey\b": "gray", r"\bGrey\b": "Gray",
    r"\bpractise\b": "practice", r"\bPractise\b": "Practice",
    r"\bpractised\b": "practiced", r"\bpractising\b": "practicing",
    r"\bfavour\b": "favor", r"\bbehaviour\b": "behavior",
    r"\bflavour\b": "flavor", r"\bhumour\b": "humor",
    r"\btheatre\b": "theater", r"\bmetre\b": "meter", r"\bmetres\b": "meters",
    r"\blitre\b": "liter", r"\bprogramme\b": "program",
}


def normalize_spelling(text, where=""):
    if not isinstance(text, str):
        return text
    orig = text
    for pat, rep in SPELL.items():
        text = re.sub(pat, rep, text)
    if text != orig:
        log("spelling", orig[:60], text[:60], where)
    return text


# ------------------------------------------------------------------- POS enum
POS_SYN = {
    "int.": "interj.", "interjection": "interj.", "interj.": "interj.",
    "filler": "interj.",
    "modal v.": "modal", "modal verb": "modal", "modal": "modal",
    "phrase": "phr.", "phr.": "phr.",
    "phr. v.": "phr.v.", "phr.v.": "phr.v.", "phrasal verb": "phr.v.",
    "v.-ing": "v.", "v. -ing": "v.", "gerund": "v.",
}
POS_ORDER = ["n.", "v.", "adj.", "adv.", "prep.", "conj.", "pron.", "det.", "num.", "modal", "interj.", "phr.", "phr.v."]


def _canon_part(x):
    x = x.strip()
    return POS_SYN.get(x, x)


def normalize_pos(pos):
    orig = pos
    p = pos.strip()
    if p in POS_SYN:
        p = POS_SYN[p]
    else:
        # strip parenthetical annotations, e.g. "n. (uncountable)" → "n."
        p = re.sub(r"\s*\([^)]*\)", "", p).strip()
        if "/" in p:
            parts = [_canon_part(x) for x in p.split("/")]
            parts.sort(key=lambda x: POS_ORDER.index(x) if x in POS_ORDER else 99)
            p = "/".join(parts)
        else:
            p = _canon_part(p)
    if p != orig:
        log("pos", orig, p, "")
    return p


# ------------------------------------------------------------------------ run
data = json.load(open(PATH, encoding="utf-8"))

for l in data:
    # data glitches: HTML entities
    for k in ("theme", "title_en", "title_zh"):
        if isinstance(l.get(k), str) and "&amp;" in l[k]:
            log("entity", l[k], l[k].replace("&amp;", "&"), f"day{l['day']}.{k}")
            l[k] = l[k].replace("&amp;", "&")

    # vocabulary: ipa, pos, spelling of word/examples; dedupe headwords
    seen = set()
    newvocab = []
    for v in l["vocabulary"]:
        w = v["word"]
        key = w.strip().lower()
        if key in seen:
            log("dup", w, "(removed)", f"day{l['day']}")
            continue
        seen.add(key)
        v["word"] = normalize_spelling(w, f"day{l['day']}.word")
        v["ipa"] = normalize_ipa(v["word"], v["ipa"])
        v["pos"] = normalize_pos(v["pos"])
        v["example_en"] = normalize_spelling(v["example_en"], f"day{l['day']}.ex")
        newvocab.append(v)
    l["vocabulary"] = newvocab

    # grammar examples
    l["grammarNote"]["point_en"] = normalize_spelling(l["grammarNote"]["point_en"])
    for ex in l["grammarNote"]["examples"]:
        ex["en"] = normalize_spelling(ex["en"])

    # listening: script + dictation (spelling + ' .' spacing + entity)
    L = l["listening"]
    L["title"] = normalize_spelling(L["title"])
    L["script"] = normalize_spelling(L["script"], f"day{l['day']}.script")
    for d in L["dictation"]:
        d["sentence"] = normalize_spelling(d["sentence"]).replace(" .", ".").replace(" ?", "?")
        d["answer"] = normalize_spelling(d["answer"])
    for qa in L["comprehension"]:
        qa["q"] = normalize_spelling(qa["q"]); qa["a"] = normalize_spelling(qa["a"])

    # speaking
    S = l["speaking"]
    S["shadowing"] = [{**sh, "text": normalize_spelling(sh["text"])} for sh in S["shadowing"]]
    S["miniDialogue"] = [{**m, "line": normalize_spelling(m["line"])} for m in S["miniDialogue"]]
    S["speakingTask"] = normalize_spelling(S["speakingTask"])

    # reading
    R = l["reading"]
    R["title"] = normalize_spelling(R["title"])
    R["passage"] = normalize_spelling(R["passage"], f"day{l['day']}.passage")
    for g in R["glossary"]:
        g["word"] = normalize_spelling(g["word"])
    for qa in R["comprehension"]:
        qa["q"] = normalize_spelling(qa["q"]); qa["a"] = normalize_spelling(qa["a"])

    # writing
    W = l["writing"]
    W["prompt"] = normalize_spelling(W["prompt"])
    W["usefulPhrases"] = [normalize_spelling(p) for p in W["usefulPhrases"]]
    W["modelAnswer"] = normalize_spelling(W["modelAnswer"])

# ------------------------------------------------------------------- report
by_kind = {}
for kind, where, b, a in changes:
    by_kind.setdefault(kind, 0)
    by_kind[kind] += 1
print("=== change summary ===")
for k, n in sorted(by_kind.items()):
    print(f"  {k}: {n}")
print(f"  TOTAL: {len(changes)}")
print("\n=== sample IPA changes ===")
for kind, where, b, a in [c for c in changes if c[0] == "ipa"][:25]:
    print(f"  {where}: {b} → {a}")
print("\n=== POS changes (unique) ===")
pos_seen = set()
for kind, where, b, a in [c for c in changes if c[0] == "pos"]:
    if (b, a) not in pos_seen:
        pos_seen.add((b, a)); print(f"  {b!r} → {a!r}")

if APPLY:
    json.dump(data, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n✅ wrote {PATH}")
else:
    print("\n(dry run — pass --apply to write)")
