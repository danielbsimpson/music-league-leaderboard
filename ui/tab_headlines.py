"""
ui/tab_headlines.py
--------------------
Renders the 🗞️ Player Headlines tab.

For every player we compute one POSITIVE headline and one FUNNY headline
by examining where they rank on every metric available in the dataset.
The most extreme / distinctive rank on each metric wins.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd
import streamlit as st

from music_league_stats import (
    LeagueData,
    _name_map,
    _points_per_submission,
    top_podium_appearances,
    most_consistent_submitter,
    most_volatile_submitter,
    most_generous_voter,
    most_talkative_commenter,
    top_3_comment_winners,
    zero_points_incidents,
    biggest_fans,
    submission_timing_stats,
    vote_timing_stats,
    timing_per_round,
    player_round_averages,
    most_artist_appearances,
)


# ---------------------------------------------------------------------------
# Headline catalogue
# ---------------------------------------------------------------------------

@dataclass
class HeadlineDef:
    """One candidate headline definition."""
    metric_key: str          # Unique identifier used in scoring
    positive: str            # Positive headline text (awarded when player leads)
    funny: str               # Funny/silly headline text (awarded when player leads)
    positive_for_top: bool   # True  → positive = top rank, funny = bottom rank
                             # False → positive = bottom rank (e.g. lowest variance),
                             #         funny = top rank


# Each headline definition declares what winning this metric means.
# positive_for_top=True  means being #1 is good (most points, most podiums, etc.)
# positive_for_top=False means being #1 on this metric is the quirky/funny outcome
#                        (e.g. fastest voter is both braggable AND a bit suspicious)

HEADLINE_CATALOGUE: list[HeadlineDef] = [
    # ---- Points & performance ----
    HeadlineDef(
        metric_key="total_points",
        positive="🏆 The Undisputed Champion",
        funny="📊 Lives in Spreadsheets",
        positive_for_top=True,
    ),
    HeadlineDef(
        metric_key="avg_points_per_round",
        positive="📈 Round-by-Round Royalty",
        funny="🤓 Suspiciously Consistent",
        positive_for_top=True,
    ),
    HeadlineDef(
        metric_key="most_misunderstood",
        positive="🎭 Ahead of Their Time",
        funny="😅 Songs for an Audience of Zero",
        positive_for_top=False,  # bottom total points → positive spin
    ),
    HeadlineDef(
        metric_key="podium_appearances",
        positive="🥇 Podium Elite",
        funny="🪆 Collects Trophies Like Magnets",
        positive_for_top=True,
    ),
    HeadlineDef(
        metric_key="fewest_podiums",
        positive="🌱 The Dark Horse",
        funny="🏳️ The Podium's Biggest Stranger",
        positive_for_top=True,  # (this key is used for the bottom-podium player)
    ),

    # ---- Consistency ----
    HeadlineDef(
        metric_key="most_consistent",
        positive="🎯 Steady as a Metronome",
        funny="🤖 Literally a Bot",
        positive_for_top=True,
    ),
    HeadlineDef(
        metric_key="most_volatile",
        positive="🎆 Wildcard of the Week",
        funny="🎲 Vibes-Based Submissions Only",
        positive_for_top=True,
    ),

    # ---- Generosity & voting ----
    HeadlineDef(
        metric_key="most_generous",
        positive="💝 Spreads the Love",
        funny="🧁 Can't Say No to Anyone",
        positive_for_top=True,
    ),
    HeadlineDef(
        metric_key="least_generous",
        positive="🧐 Selective Taste Curator",
        funny="🥶 Points Are Rationed Here",
        positive_for_top=True,
    ),

    # ---- Timing: submitting ----
    HeadlineDef(
        metric_key="earliest_submitter",
        positive="⏰ First to the Party",
        funny="😤 Submits Before the Theme Is Even Announced",
        positive_for_top=True,
    ),
    HeadlineDef(
        metric_key="latest_submitter",
        positive="🎸 Lives for the Deadline Drama",
        funny="🚒 Submitted While the Server Was on Fire",
        positive_for_top=True,
    ),

    # ---- Timing: voting ----
    HeadlineDef(
        metric_key="fastest_voter",
        positive="⚡ Lightning-Quick Listener",
        funny="🙈 Did They Even Listen?",
        positive_for_top=True,
    ),
    HeadlineDef(
        metric_key="slowest_voter",
        positive="🎧 Deep Listener, Savours Every Note",
        funny="🐢 Votes Arrive by Carrier Pigeon",
        positive_for_top=True,
    ),

    # ---- Comments ----
    HeadlineDef(
        metric_key="most_talkative",
        positive="💬 Voice of the League",
        funny="📢 Needs a Word Limit",
        positive_for_top=True,
    ),
    HeadlineDef(
        metric_key="most_commented_on",
        positive="🎤 The Crowd Favourite",
        funny="🧲 People Have Opinions About This One",
        positive_for_top=True,
    ),
    HeadlineDef(
        metric_key="least_commented_on",
        positive="🌙 Silent Icon",
        funny="👻 Songs Vanish Without a Trace",
        positive_for_top=True,
    ),

    # ---- Zero points ----
    HeadlineDef(
        metric_key="most_zeros",
        positive="🔥 Fearless Risk-Taker",
        funny="💀 Points? Never Heard of Them",
        positive_for_top=True,
    ),
    HeadlineDef(
        metric_key="fewest_zeros",
        positive="🛡️ Zero-Point-Free Zone",
        funny="📋 Has Never Failed Anyone, Ever",
        positive_for_top=True,
    ),

    # ---- Artist variety ----
    HeadlineDef(
        metric_key="most_unique_artists",
        positive="🌍 Musical Explorer",
        funny="🗺️ Spotify Library: Entire Planet",
        positive_for_top=True,
    ),
    HeadlineDef(
        metric_key="least_unique_artists",
        positive="🎵 Devoted to the Classics",
        funny="🔁 Has One Favourite Band and Isn't Sorry",
        positive_for_top=True,
    ),
]


# ---------------------------------------------------------------------------
# Metric gathering
# ---------------------------------------------------------------------------

def _gather_metrics(data: LeagueData) -> dict[str, dict[str, float]]:
    """
    Return a dict mapping  metric_key → {player_name: score}
    where a HIGHER score means the player is MORE extreme on that metric.
    """
    comp = data.competitors
    subs = data.submissions
    vts  = data.votes
    rds  = data.rounds
    names = _name_map(comp)
    all_names = list(names.values())

    metrics: dict[str, dict[str, float]] = {k: {} for k in [
        "total_points", "avg_points_per_round", "most_misunderstood",
        "podium_appearances", "fewest_podiums",
        "most_consistent", "most_volatile",
        "most_generous", "least_generous",
        "earliest_submitter", "latest_submitter",
        "fastest_voter", "slowest_voter",
        "most_talkative", "most_commented_on", "least_commented_on",
        "most_zeros", "fewest_zeros",
        "most_unique_artists", "least_unique_artists",
    ]}

    # -- total points --
    pps = _points_per_submission(subs, vts)
    for pid, pts in pps.groupby("Submitter ID")["TotalPoints"].sum().items():
        name = names.get(pid)
        if name:
            metrics["total_points"][name] = float(pts)

    # -- avg points per round --
    for entry in player_round_averages(subs, vts, comp):
        metrics["avg_points_per_round"][entry["name"]] = entry["avg_points"]

    # -- most misunderstood (lowest total points → highest score here) --
    total_pts = metrics["total_points"]
    if total_pts:
        max_pts = max(total_pts.values()) + 1
        for name, pts in total_pts.items():
            metrics["most_misunderstood"][name] = max_pts - pts

    # -- podium appearances & fewest podiums --
    podium_list = top_podium_appearances(subs, vts, comp, rds)
    max_podiums = max((e["podium_appearances"] for e in podium_list), default=1)
    for entry in podium_list:
        metrics["podium_appearances"][entry["name"]] = float(entry["podium_appearances"])
        metrics["fewest_podiums"][entry["name"]] = float(max_podiums - entry["podium_appearances"] + 1)

    # -- consistency (lowest variance = most consistent = highest score) --
    con_list = most_consistent_submitter(subs, vts, comp)
    if con_list:
        max_var = max(e["variance"] for e in con_list) + 1
        for entry in con_list:
            metrics["most_consistent"][entry["name"]] = max_var - entry["variance"]
            metrics["most_volatile"][entry["name"]]   = entry["variance"]

    # -- generosity (avg distinct recipients per round) --
    gen_list = most_generous_voter(vts, subs, comp)
    if gen_list:
        max_gen = max(e["avg_distinct_recipients_per_round"] for e in gen_list) + 1
        for entry in gen_list:
            v = entry["avg_distinct_recipients_per_round"]
            metrics["most_generous"][entry["voter"]] = v
            metrics["least_generous"][entry["voter"]] = max_gen - v

    # -- submission timing --
    try:
        sub_stats = submission_timing_stats(subs, vts, rds, comp)
        if not sub_stats.empty:
            for _, row in sub_stats.iterrows():
                name = row["player_name"]
                if pd.isna(name):
                    continue
                avg = row["avg_hours_before_deadline"]
                metrics["earliest_submitter"][name] = float(avg)   # more hours = earlier
                metrics["latest_submitter"][name]   = float(-avg)  # fewer hours = later
    except Exception:
        pass

    # -- vote timing --
    try:
        vote_stats = vote_timing_stats(subs, vts, rds, comp)
        if not vote_stats.empty:
            if "avg_hours_after_playlist" in vote_stats.columns:
                max_h = vote_stats["avg_hours_after_playlist"].max() + 1
                for _, row in vote_stats.iterrows():
                    name = row["player_name"]
                    if pd.isna(name):
                        continue
                    h = row["avg_hours_after_playlist"]
                    metrics["fastest_voter"][name] = float(max_h - h)  # fewer hours = faster
                    metrics["slowest_voter"][name]  = float(h)
    except Exception:
        pass

    # -- comments --
    talk_list = most_talkative_commenter(vts, subs, comp)
    for entry in talk_list:
        metrics["most_talkative"][entry["name"]] = float(entry["total"])

    recv_list = top_3_comment_winners(subs, vts, comp, top_n=len(comp))
    if recv_list:
        max_recv = max(e["comments_received"] for e in recv_list) + 1
        for entry in recv_list:
            cr = entry["comments_received"]
            metrics["most_commented_on"][entry["name"]] = float(cr)
            metrics["least_commented_on"][entry["name"]] = float(max_recv - cr)

    # -- zero points incidents --
    zpi = zero_points_incidents_per_player(comp, subs, vts)
    if zpi:
        max_z = max(zpi.values()) + 1
        for name, z in zpi.items():
            metrics["most_zeros"][name]   = float(z)
            metrics["fewest_zeros"][name] = float(max_z - z)

    # -- artist variety (unique artists submitted) --
    variety = _artist_variety_per_player(subs, names)
    if variety:
        max_v = max(variety.values()) + 1
        for name, v in variety.items():
            metrics["most_unique_artists"][name]  = float(v)
            metrics["least_unique_artists"][name] = float(max_v - v)

    return metrics


def zero_points_incidents_per_player(
    comp: "pd.DataFrame",
    subs: "pd.DataFrame",
    vts: "pd.DataFrame",
) -> dict[str, int]:
    """Return {player_name: zero-point rounds count}."""
    from music_league_stats import _name_map, _points_per_submission
    names = _name_map(comp)
    pps   = _points_per_submission(subs, vts)
    zeros = pps[pps["TotalPoints"] == 0]
    result: dict[str, int] = {}
    for pid, count in zeros.groupby("Submitter ID").size().items():
        name = names.get(pid)
        if name:
            result[name] = int(count)
    return result


def _artist_variety_per_player(
    subs: "pd.DataFrame",
    names: dict[str, str],
) -> dict[str, int]:
    """Return {player_name: unique artist count}."""
    result: dict[str, int] = {}
    for pid, grp in subs.groupby("Submitter ID"):
        all_artists: set[str] = set()
        for artists_str in grp["Artist(s)"].dropna():
            for a in artists_str.split(","):
                stripped = a.strip()
                if stripped:
                    all_artists.add(stripped.lower())
        name = names.get(pid)
        if name:
            result[name] = len(all_artists)
    return result


# ---------------------------------------------------------------------------
# Metric category groups — positive and funny must come from different groups
# ---------------------------------------------------------------------------

# Each metric key is assigned to a category. The assignment algorithm will
# ensure the positive and funny headlines never share the same category.
_METRIC_CATEGORY: dict[str, str] = {
    # Performance
    "total_points":         "performance",
    "avg_points_per_round": "performance",
    "most_misunderstood":   "performance",
    "podium_appearances":   "performance",
    "fewest_podiums":       "performance",
    # Consistency
    "most_consistent":      "consistency",
    "most_volatile":        "consistency",
    # Voting behaviour
    "most_generous":        "voting",
    "least_generous":       "voting",
    # Submission timing
    "earliest_submitter":   "sub_timing",
    "latest_submitter":     "sub_timing",
    # Vote timing
    "fastest_voter":        "vote_timing",
    "slowest_voter":        "vote_timing",
    # Comments
    "most_talkative":       "comments",
    "most_commented_on":    "comments",
    "least_commented_on":   "comments",
    # Zeros
    "most_zeros":           "zeros",
    "fewest_zeros":         "zeros",
    # Artist variety
    "most_unique_artists":  "variety",
    "least_unique_artists": "variety",
}

# Preferred category order for the FUNNY headline (quirkiest first)
_FUNNY_CATEGORY_PRIORITY = [
    "vote_timing",
    "sub_timing",
    "zeros",
    "consistency",
    "voting",
    "variety",
    "comments",
    "performance",
]


# ---------------------------------------------------------------------------
# Headline assignment
# ---------------------------------------------------------------------------

@dataclass
class PlayerHeadlines:
    name: str
    positive_headline: str
    positive_reason: str   # short stat backing text
    funny_headline: str
    funny_reason: str


def _rank_one(scores: dict[str, float]) -> str | None:
    """Return the player name with the highest score, or None if empty."""
    if not scores:
        return None
    return max(scores, key=lambda k: scores[k])


def assign_headlines(
    data: LeagueData,
    metrics: dict[str, dict[str, float]],
) -> list[PlayerHeadlines]:
    """
    Global two-pass greedy assignment so every headline text is unique.

    Pass 1 — POSITIVE headlines:
      Build a priority queue of (rank, player, hdef, reason) across all
      metrics.  Process best-rank entries first; assign the positive headline
      to the player if they haven't been assigned one yet AND that headline
      text hasn't been claimed by another player.

    Pass 2 — FUNNY headlines:
      Same greedy approach, but for each player the funny headline must come
      from a different category than their positive one, and the funny headline
      text must not already be claimed.  Categories are tried in
      _FUNNY_CATEGORY_PRIORITY order so timing/behaviour quirks win over
      repeated performance stats.
    """
    names = list(_name_map(data.competitors).values())

    # Build every (rank, hdef, reason) tuple per player across all metrics
    player_candidates: dict[str, list[tuple[int, HeadlineDef, str]]] = {n: [] for n in names}

    for hdef in HEADLINE_CATALOGUE:
        scores = metrics.get(hdef.metric_key, {})
        if not scores:
            continue
        sorted_players = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        for rank, (player, score) in enumerate(sorted_players):
            if player not in names:
                continue
            reason = _reason_text(hdef.metric_key, player, score, metrics)
            player_candidates[player].append((rank, hdef, reason))

    # Sort each player's list best-rank first
    for n in names:
        player_candidates[n].sort(key=lambda x: x[0])

    # ------------------------------------------------------------------ Pass 1
    # Assign POSITIVE headlines greedily — best global rank wins first claim.
    # Build a flat list of (rank, player, hdef, reason), sort by rank, iterate.
    all_pos_entries: list[tuple[int, str, HeadlineDef, str]] = []
    for player, cands in player_candidates.items():
        for rank, hdef, reason in cands:
            all_pos_entries.append((rank, player, hdef, reason))
    all_pos_entries.sort(key=lambda x: x[0])

    assigned_pos: dict[str, tuple[HeadlineDef, str]] = {}   # player → (hdef, reason)
    claimed_pos_texts: set[str] = set()                      # headline text already used

    for rank, player, hdef, reason in all_pos_entries:
        if player in assigned_pos:
            continue  # already has a positive headline
        if hdef.positive in claimed_pos_texts:
            continue  # another player already has this headline text
        assigned_pos[player] = (hdef, reason)
        claimed_pos_texts.add(hdef.positive)

    # Any player still unassigned gets a generic fallback
    for name in names:
        if name not in assigned_pos:
            # Pick their best-ranked candidate whose text isn't claimed
            for rank, hdef, reason in player_candidates[name]:
                if hdef.positive not in claimed_pos_texts:
                    assigned_pos[name] = (hdef, reason)
                    claimed_pos_texts.add(hdef.positive)
                    break
            else:
                # Absolute last resort — duplicate allowed rather than no headline
                if player_candidates[name]:
                    _, hdef, reason = player_candidates[name][0]
                    assigned_pos[name] = (hdef, reason)

    # ------------------------------------------------------------------ Pass 2
    # Assign FUNNY headlines — must be a different category from the positive
    # headline, and the funny text must not already be claimed globally.
    # Try categories in _FUNNY_CATEGORY_PRIORITY order.

    claimed_fun_texts: set[str] = set()
    assigned_fun: dict[str, tuple[HeadlineDef, str]] = {}

    # Build per-player candidates grouped by category for quick lookup
    def _candidates_by_cat(player: str) -> dict[str, list[tuple[int, HeadlineDef, str]]]:
        by_cat: dict[str, list[tuple[int, HeadlineDef, str]]] = {}
        for rank, hdef, reason in player_candidates[player]:
            cat = _METRIC_CATEGORY.get(hdef.metric_key, "other")
            by_cat.setdefault(cat, []).append((rank, hdef, reason))
        return by_cat

    # Process players in order of their positive-headline rank (best performers first)
    # so the top scorers get first pick of funny headlines too.
    players_by_pos_rank = sorted(
        names,
        key=lambda n: assigned_pos[n][0].metric_key  # stable sort key
        if n in assigned_pos else "zzz",
    )
    # Actually sort by the rank value of their assigned positive metric
    def _pos_rank(name: str) -> int:
        if name not in assigned_pos:
            return 9999
        hdef, _ = assigned_pos[name]
        scores = metrics.get(hdef.metric_key, {})
        sorted_vals = sorted(scores.values(), reverse=True)
        player_score = scores.get(name)
        if player_score is None:
            return 9999
        try:
            return sorted_vals.index(player_score)
        except ValueError:
            return 9999

    players_ordered = sorted(names, key=_pos_rank)

    for name in players_ordered:
        pos_hdef, _ = assigned_pos.get(name, (None, None))
        pos_category = _METRIC_CATEGORY.get(pos_hdef.metric_key) if pos_hdef else None
        by_cat = _candidates_by_cat(name)

        found = False
        # Try each funny-priority category, skipping the positive category
        for cat in _FUNNY_CATEGORY_PRIORITY:
            if cat == pos_category:
                continue
            for rank, hdef, reason in by_cat.get(cat, []):
                if hdef.funny not in claimed_fun_texts:
                    assigned_fun[name] = (hdef, reason)
                    claimed_fun_texts.add(hdef.funny)
                    found = True
                    break
            if found:
                break

        if not found:
            # Fallback: any category different from positive
            for rank, hdef, reason in player_candidates[name]:
                cat = _METRIC_CATEGORY.get(hdef.metric_key)
                if cat != pos_category and hdef.funny not in claimed_fun_texts:
                    assigned_fun[name] = (hdef, reason)
                    claimed_fun_texts.add(hdef.funny)
                    found = True
                    break

        if not found:
            # Last resort: any unclaimed funny text regardless of category
            for rank, hdef, reason in player_candidates[name]:
                if hdef.funny not in claimed_fun_texts:
                    assigned_fun[name] = (hdef, reason)
                    claimed_fun_texts.add(hdef.funny)
                    found = True
                    break

        if not found and player_candidates[name]:
            # Absolute fallback — allow a duplicate rather than no headline
            _, hdef, reason = player_candidates[name][0]
            assigned_fun[name] = (hdef, reason)

    # ------------------------------------------------------------------ Build results
    results: list[PlayerHeadlines] = []
    for name in sorted(names):
        pos_hdef, pos_reason = assigned_pos.get(
            name, (None, "Solid all-round effort!")
        )
        fun_hdef, fun_reason = assigned_fun.get(
            name, (None, "A true mystery.")
        )
        results.append(PlayerHeadlines(
            name=name,
            positive_headline=pos_hdef.positive if pos_hdef else "🎵 A True Music League Competitor",
            positive_reason=pos_reason,
            funny_headline=fun_hdef.funny if fun_hdef else "🎭 Defies Simple Description",
            funny_reason=fun_reason,
        ))

    return results


def _reason_text(
    metric_key: str,
    player: str,
    score: float,
    metrics: dict[str, dict[str, float]],
) -> str:
    """Generate a short human-readable reason sentence."""
    # Helpers for rank suffix
    def _ordinal(n: int) -> str:
        if 11 <= n % 100 <= 13:
            return f"{n}th"
        return f"{n}{['th','st','nd','rd','th','th','th','th','th','th'][n % 10]}"

    s = metrics.get(metric_key, {})
    if not s:
        return ""

    sorted_vals = sorted(s.values(), reverse=True)
    rank = sorted_vals.index(score) + 1

    labels: dict[str, str] = {
        "total_points":        f"#{rank} overall with {int(score):,} total points",
        "avg_points_per_round":f"#{rank} avg {score:.1f} pts per round",
        "most_misunderstood":  f"Fewest total points — artistically ahead of their time",
        "podium_appearances":  f"{int(score)} top-3 finishes",
        "fewest_podiums":      f"Rarely on the podium — full of untapped potential",
        "most_consistent":     f"Lowest points variance — rock solid every round",
        "most_volatile":       f"Highest points variance — keeps everyone guessing",
        "most_generous":       f"Spreads points to {score:.1f} players per round on avg",
        "least_generous":      f"Highly selective — hoards those precious points",
        "earliest_submitter":  f"Submits {score:.0f}h before the last person on avg",
        "latest_submitter":    f"Cuts submission deadlines the closest",
        "fastest_voter":       f"Votes within moments of the playlist dropping",
        "slowest_voter":       f"Takes a full {score:.0f}h to cast votes on avg",
        "most_talkative":      f"{int(score)} total comments left across the league",
        "most_commented_on":   f"{int(score)} comments received on their songs",
        "least_commented_on":  f"Their songs pass in peaceful silence",
        "most_zeros":          f"{int(score)} zero-point round(s) — fearless",
        "fewest_zeros":        f"Rarely (if ever) scores zero — impressively safe",
        "most_unique_artists": f"Submitted songs by {int(score)} unique artists",
        "least_unique_artists":f"Deep loyalty — sticks to a tight artist roster",
    }
    return labels.get(metric_key, f"Score: {score:.1f}")


# ---------------------------------------------------------------------------
# HTML card
# ---------------------------------------------------------------------------

def _headline_card(ph: PlayerHeadlines) -> str:
    """Render a player headline card as an HTML string (no HTML comments)."""
    # Escape any angle brackets in dynamic text to prevent HTML injection
    def _esc(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    name     = _esc(ph.name)
    pos_h    = _esc(ph.positive_headline)
    pos_r    = _esc(ph.positive_reason)
    funny_h  = _esc(ph.funny_headline)
    funny_r  = _esc(ph.funny_reason)

    return (
        '<div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);'
        'border-radius:16px;padding:1.1rem 1.2rem 1rem 1.2rem;margin-bottom:0.75rem;'
        'box-shadow:0 4px 18px rgba(0,0,0,0.45);border-left:4px solid #1DB954;">'

        f'<div style="font-size:1.1rem;font-weight:800;color:#f0f0f0;'
        f'margin-bottom:0.65rem;letter-spacing:0.01em;">&#128100; {name}</div>'

        '<div style="background:rgba(29,185,84,0.12);border-radius:8px;'
        'padding:0.45rem 0.75rem;margin-bottom:0.45rem;">'
        f'<div style="font-size:1rem;font-weight:700;color:#e8ffe8;">{pos_h}</div>'
        f'<div style="font-size:0.72rem;color:#aaa;margin-top:3px;">{pos_r}</div>'
        '</div>'

        '<div style="background:rgba(255,193,7,0.10);border-radius:8px;'
        'padding:0.45rem 0.75rem;">'
        f'<div style="font-size:1rem;font-weight:700;color:#fff8e1;">{funny_h}</div>'
        f'<div style="font-size:0.72rem;color:#aaa;margin-top:3px;">{funny_r}</div>'
        '</div>'

        '</div>'
    )


# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------

def render(data: LeagueData) -> None:
    st.header("🗞️ Player Headlines")
    st.caption(
        "Every player gets two auto-generated headlines: a **positive** one celebrating "
        "their best metric, and a **funny** one based on their most quirky stat. "
        "Headlines are awarded based on who leads each metric across all selected leagues."
    )

    with st.spinner("Crunching every metric…"):
        metrics  = _gather_metrics(data)
        headlines = assign_headlines(data, metrics)

    st.divider()

    # ---- Layout: 2-column grid ----
    left_col, right_col = st.columns(2, gap="medium")

    left_html  = "".join(_headline_card(ph) for i, ph in enumerate(headlines) if i % 2 == 0)
    right_html = "".join(_headline_card(ph) for i, ph in enumerate(headlines) if i % 2 == 1)

    with left_col:
        st.markdown(left_html, unsafe_allow_html=True)
    with right_col:
        st.markdown(right_html, unsafe_allow_html=True)

    st.divider()

    # ---- Full metrics breakdown (expander) ----
    with st.expander("🔬 Raw metric scores (all players)", expanded=False):
        rows = []
        for ph in headlines:
            row: dict[str, Any] = {"Player": ph.name}
            for key, scores in metrics.items():
                row[key] = round(scores.get(ph.name, 0.0), 2)
            rows.append(row)
        if rows:
            st.dataframe(
                pd.DataFrame(rows).set_index("Player"),
                width="stretch",
            )
