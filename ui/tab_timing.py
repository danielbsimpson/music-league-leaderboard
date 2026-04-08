"""
ui/tab_timing.py
-----------------
Renders the ⏱️ Submission & Voting Timing tab.

Metrics shown:
  • Submission timing  – how many hours before Monday deadline each player submits
  • Voting turnaround  – how many hours after the playlist opens each player votes
  • Vote deadline rush – how many hours before Friday deadline votes are cast
  • Record holders     – fastest voter, latest submitter, earliest submitter, etc.
  • Per-round scatter  – drill-down view per player / per round
"""

from __future__ import annotations

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from music_league_stats import (
    LeagueData,
    _name_map,
    submission_timing_stats,
    vote_timing_stats,
    timing_per_round,
)
from ui.components import CHART_BASE, ACCENT


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hms(hours: float) -> str:
    """Format a float number of hours as 'Xh Ym'."""
    if pd.isna(hours):
        return "—"
    h = int(hours)
    m = int(round((hours - h) * 60))
    return f"{h}h {m:02d}m"


def _medal(rank: int) -> str:
    return ["🥇", "🥈", "🥉"][rank] if rank < 3 else f"#{rank + 1}"


def _bar(
    df: pd.DataFrame,
    x_col: str,
    y_col: str,
    title: str,
    color: str = ACCENT,
    x_label: str = "",
    vline: float | None = None,
) -> go.Figure:
    """Simple horizontal bar chart."""
    fig = px.bar(
        df,
        x=x_col,
        y=y_col,
        orientation="h",
        title=title,
        color_discrete_sequence=[color],
    )
    fig.update_layout(
        **CHART_BASE,
        xaxis=dict(title=x_label),
        yaxis=dict(title="", autorange="reversed"),
        showlegend=False,
    )
    if vline is not None:
        fig.add_vline(x=vline, line_dash="dash", line_color="#888", opacity=0.7)
    return fig


# ---------------------------------------------------------------------------
# Main render
# ---------------------------------------------------------------------------

def render(data: LeagueData) -> None:
    comp  = data.competitors
    rds   = data.rounds
    subs  = data.submissions
    vts   = data.votes

    st.header("⏱️ Submission & Voting Timing")
    st.caption(
        "Deadlines are inferred from the data: the submission deadline is "
        "end-of-day **Monday** of the latest submission week; the vote deadline "
        "is end-of-day **Friday** of the latest vote week. "
        "Hours are positive = early, negative = late."
    )

    # ------------------------------------------------------------------ compute
    sub_stats  = submission_timing_stats(subs, vts, rds, comp)
    vote_stats = vote_timing_stats(subs, vts, rds, comp)
    detail     = timing_per_round(subs, vts, rds, comp)

    if sub_stats.empty or vote_stats.empty:
        st.warning("Not enough timing data to display — check that submissions and votes CSVs contain timestamps.")
        return

    # ================================================================ SECTION 1
    # Trophy cabinet – record holders
    # ================================================================
    st.subheader("🏆 Record Holders")

    # Derive records from per-round detail
    detail_clean = detail.dropna(subset=["player_name"])

    # Fastest voter: smallest hours_after_playlist (per-round level)
    if "vote_hours_after_playlist" in detail_clean.columns:
        fastest_vote_row = detail_clean.dropna(subset=["vote_hours_after_playlist"]).nsmallest(1, "vote_hours_after_playlist")
        slowest_vote_row = detail_clean.dropna(subset=["vote_hours_after_playlist"]).nlargest(1, "vote_hours_after_playlist")
    else:
        fastest_vote_row = pd.DataFrame()
        slowest_vote_row = pd.DataFrame()

    # Earliest submitter: most hours before deadline (per-round)
    if "sub_hours_before_deadline" in detail_clean.columns:
        earliest_sub_row = detail_clean.dropna(subset=["sub_hours_before_deadline"]).nlargest(1, "sub_hours_before_deadline")
        latest_sub_row   = detail_clean.dropna(subset=["sub_hours_before_deadline"]).nsmallest(1, "sub_hours_before_deadline")
    else:
        earliest_sub_row = pd.DataFrame()
        latest_sub_row   = pd.DataFrame()

    c1, c2, c3, c4 = st.columns(4)

    with c1:
        st.markdown("**⚡ Fastest Single Vote**")
        if not fastest_vote_row.empty:
            r = fastest_vote_row.iloc[0]
            st.metric(
                r["player_name"],
                _hms(r["vote_hours_after_playlist"]) + " after playlist drop",
                help=f"Round: {r['round_name']}",
            )
        else:
            st.write("—")

    with c2:
        st.markdown("**🐌 Slowest Single Vote**")
        if not slowest_vote_row.empty:
            r = slowest_vote_row.iloc[0]
            st.metric(
                r["player_name"],
                _hms(r["vote_hours_after_playlist"]) + " after playlist drop",
                help=f"Round: {r['round_name']}",
            )
        else:
            st.write("—")

    with c3:
        st.markdown("**🌅 Earliest Single Submission**")
        if not earliest_sub_row.empty:
            r = earliest_sub_row.iloc[0]
            st.metric(
                r["player_name"],
                _hms(r["sub_hours_before_deadline"]) + " before deadline",
                help=f"Round: {r['round_name']}",
            )
        else:
            st.write("—")

    with c4:
        st.markdown("**🔥 Latest Single Submission**")
        if not latest_sub_row.empty:
            r = latest_sub_row.iloc[0]
            hrs = r["sub_hours_before_deadline"]
            label = (_hms(abs(hrs)) + (" late!" if hrs < 0 else " before deadline"))
            st.metric(r["player_name"], label, help=f"Round: {r['round_name']}")
        else:
            st.write("—")

    st.divider()

    # ================================================================ SECTION 2
    # Average submission timing
    # ================================================================
    st.subheader("📬 Submission Timing — Avg Hours Before Monday Deadline")
    st.caption(
        "Positive = submitted early. A lower bar = cuts it closer to the wire."
    )

    sub_sorted = sub_stats.sort_values("avg_hours_before_deadline", ascending=True).copy()
    sub_sorted["label"] = sub_sorted["avg_hours_before_deadline"].apply(_hms)

    fig_sub_avg = _bar(
        sub_sorted,
        x_col="avg_hours_before_deadline",
        y_col="player_name",
        title="Average hours before submission deadline",
        color=ACCENT,
        x_label="Hours before deadline (avg)",
        vline=0,
    )
    st.plotly_chart(fig_sub_avg, width="stretch", key="timing_sub_avg")

    # min / max table
    sub_table = sub_stats[
        ["player_name", "avg_hours_before_deadline",
         "min_hours_before_deadline", "max_hours_before_deadline", "rounds_submitted"]
    ].sort_values("avg_hours_before_deadline").copy()
    sub_table.columns = ["Player", "Avg hrs before deadline", "Fastest (most hrs)", "Latest (fewest hrs)", "Rounds"]
    sub_table["Avg hrs before deadline"] = sub_table["Avg hrs before deadline"].apply(lambda x: round(x, 1))
    sub_table["Fastest (most hrs)"]      = sub_table["Fastest (most hrs)"].apply(lambda x: round(x, 1))
    sub_table["Latest (fewest hrs)"]     = sub_table["Latest (fewest hrs)"].apply(lambda x: round(x, 1))

    with st.expander("📋 Full submission timing table"):
        st.dataframe(sub_table, use_container_width=True, hide_index=True)

    st.divider()

    # ================================================================ SECTION 3
    # Average vote turnaround
    # ================================================================
    st.subheader("🎧 Voting Turnaround — Avg Hours After Playlist Drop")
    st.caption(
        "How long after the submission window closes (playlist becomes available) "
        "did each person listen through and cast their votes?"
    )

    vote_sorted_fast = vote_stats.sort_values("avg_hours_after_playlist", ascending=True).copy()

    col_fast, col_late = st.columns(2)

    with col_fast:
        st.markdown("**Quickest listeners** (fewest hours)")
        fig_vote_fast = _bar(
            vote_sorted_fast,
            x_col="avg_hours_after_playlist",
            y_col="player_name",
            title="Avg hours after playlist to cast votes",
            color="#1DB954",
            x_label="Hours",
        )
        st.plotly_chart(fig_vote_fast, width="stretch", key="timing_vote_fast")

    with col_late:
        st.markdown("**Latest voters** (most hours before Friday deadline)")
        vote_sorted_deadline = vote_stats.sort_values("avg_hours_before_vote_deadline", ascending=True).copy()
        fig_vote_deadline = _bar(
            vote_sorted_deadline,
            x_col="avg_hours_before_vote_deadline",
            y_col="player_name",
            title="Avg hours before vote deadline",
            color="#ffd166",
            x_label="Hours before deadline (avg)",
            vline=0,
        )
        st.plotly_chart(fig_vote_deadline, width="stretch", key="timing_vote_deadline")

    # full table
    vote_table = vote_stats[
        ["player_name",
         "avg_hours_after_playlist", "min_hours_after_playlist", "max_hours_after_playlist",
         "avg_hours_before_vote_deadline", "rounds_voted"]
    ].sort_values("avg_hours_after_playlist").copy()
    vote_table.columns = [
        "Player",
        "Avg hrs after playlist", "Fastest vote (min hrs)", "Slowest vote (max hrs)",
        "Avg hrs before deadline", "Rounds voted",
    ]
    for col in ["Avg hrs after playlist", "Fastest vote (min hrs)", "Slowest vote (max hrs)", "Avg hrs before deadline"]:
        vote_table[col] = vote_table[col].apply(lambda x: round(x, 1))

    with st.expander("📋 Full vote timing table"):
        st.dataframe(vote_table, use_container_width=True, hide_index=True)

    st.divider()

    # ================================================================ SECTION 4
    # Combined leaderboard — podium callouts
    # ================================================================
    st.subheader("🎖️ Timing Podiums")

    def _podium(title: str, df: pd.DataFrame, col: str, ascending: bool, unit: str) -> None:
        st.markdown(f"**{title}**")
        ranked = df.nsmallest(3, col) if ascending else df.nlargest(3, col)
        for i, (_, row) in enumerate(ranked.iterrows()):
            st.write(f"{_medal(i)} **{row['player_name']}** — {_hms(row[col])} {unit}")

    p1, p2, p3, p4 = st.columns(4)

    with p1:
        _podium(
            title="⚡ Fastest avg voter",
            df=vote_stats,
            col="avg_hours_after_playlist",
            ascending=True,
            unit="after playlist",
        )

    with p2:
        _podium(
            title="🐢 Most patient listener",
            df=vote_stats,
            col="avg_hours_after_playlist",
            ascending=False,
            unit="after playlist",
        )

    with p3:
        _podium(
            title="🌅 Submits the earliest",
            df=sub_stats,
            col="avg_hours_before_deadline",
            ascending=False,
            unit="before deadline",
        )

    with p4:
        _podium(
            title="😬 Cuts it closest",
            df=sub_stats,
            col="avg_hours_before_deadline",
            ascending=True,
            unit="before deadline",
        )

    st.divider()

    # ================================================================ SECTION 5
    # Per-round scatter / heatmap drill-down
    # ================================================================
    st.subheader("📊 Per-Round Drill-Down")

    tab_sub, tab_vote = st.tabs(["Submission Timing by Round", "Vote Timing by Round"])

    round_order = (
        detail.dropna(subset=["submission_deadline"])
        .drop_duplicates("round_id")[["round_id", "round_name", "submission_deadline"]]
        .sort_values("submission_deadline")["round_name"]
        .tolist()
    )

    with tab_sub:
        sub_detail = detail.dropna(subset=["sub_hours_before_deadline", "player_name"]).copy()
        if sub_detail.empty:
            st.info("No per-round submission data available.")
        else:
            fig_sub_scatter = px.scatter(
                sub_detail,
                x="round_name",
                y="sub_hours_before_deadline",
                color="player_name",
                hover_data={"round_name": True, "player_name": True,
                            "sub_hours_before_deadline": ":.1f"},
                title="Hours before submission deadline — each dot is one round",
                labels={
                    "round_name": "Round",
                    "sub_hours_before_deadline": "Hrs before deadline",
                    "player_name": "Player",
                },
                category_orders={"round_name": round_order},
            )
            fig_sub_scatter.add_hline(y=0, line_dash="dash", line_color="#888", opacity=0.5)
            fig_sub_scatter.update_layout(
                **CHART_BASE,
                xaxis=dict(tickangle=-35),
                legend=dict(orientation="h", yanchor="bottom", y=-0.45, xanchor="left", x=0),
            )
            st.plotly_chart(fig_sub_scatter, width="stretch", key="timing_sub_scatter")

    with tab_vote:
        vote_detail = detail.dropna(subset=["vote_hours_after_playlist", "player_name"]).copy()
        if vote_detail.empty:
            st.info("No per-round vote data available.")
        else:
            fig_vote_scatter = px.scatter(
                vote_detail,
                x="round_name",
                y="vote_hours_after_playlist",
                color="player_name",
                hover_data={"round_name": True, "player_name": True,
                            "vote_hours_after_playlist": ":.1f"},
                title="Hours after playlist drop before voting — each dot is one round",
                labels={
                    "round_name": "Round",
                    "vote_hours_after_playlist": "Hrs after playlist",
                    "player_name": "Player",
                },
                category_orders={"round_name": round_order},
            )
            fig_vote_scatter.update_layout(
                **CHART_BASE,
                xaxis=dict(tickangle=-35),
                legend=dict(orientation="h", yanchor="bottom", y=-0.45, xanchor="left", x=0),
            )
            st.plotly_chart(fig_vote_scatter, width="stretch", key="timing_vote_scatter")

    # ================================================================ SECTION 6
    # Player deep-dive
    # ================================================================
    st.divider()
    st.subheader("🔍 Player Deep-Dive")

    all_names = sorted(detail_clean["player_name"].dropna().unique().tolist())
    selected_player = st.selectbox("Select a player", all_names, key="timing_player_select")

    if selected_player:
        p_detail = detail_clean[detail_clean["player_name"] == selected_player].copy()
        p_detail = p_detail.sort_values("submission_deadline")

        col_left, col_right = st.columns(2)

        with col_left:
            st.markdown(f"**{selected_player} — Submission timing per round**")
            if p_detail["sub_hours_before_deadline"].notna().any():
                p_sub = p_detail.dropna(subset=["sub_hours_before_deadline"])
                fig_p_sub = px.bar(
                    p_sub,
                    x="round_name",
                    y="sub_hours_before_deadline",
                    title="Hours before submission deadline",
                    color_discrete_sequence=[ACCENT],
                    category_orders={"round_name": round_order},
                )
                fig_p_sub.add_hline(y=0, line_dash="dash", line_color="#888", opacity=0.5)
                fig_p_sub.update_layout(
                    **CHART_BASE,
                    xaxis=dict(tickangle=-40, title=""),
                    yaxis=dict(title="Hrs before deadline"),
                )
                st.plotly_chart(fig_p_sub, width="stretch", key="timing_player_sub")
            else:
                st.info("No submission data for this player.")

        with col_right:
            st.markdown(f"**{selected_player} — Vote timing per round**")
            if p_detail["vote_hours_after_playlist"].notna().any():
                p_vote = p_detail.dropna(subset=["vote_hours_after_playlist"])
                fig_p_vote = px.bar(
                    p_vote,
                    x="round_name",
                    y="vote_hours_after_playlist",
                    title="Hours after playlist drop to vote",
                    color_discrete_sequence=["#ffd166"],
                    category_orders={"round_name": round_order},
                )
                fig_p_vote.update_layout(
                    **CHART_BASE,
                    xaxis=dict(tickangle=-40, title=""),
                    yaxis=dict(title="Hrs after playlist"),
                )
                st.plotly_chart(fig_p_vote, width="stretch", key="timing_player_vote")
            else:
                st.info("No vote timing data for this player.")

        # Summary stats for this player
        p_sub_stats  = sub_stats[sub_stats["player_name"] == selected_player]
        p_vote_stats = vote_stats[vote_stats["player_name"] == selected_player]

        ms1, ms2, ms3, ms4 = st.columns(4)
        if not p_sub_stats.empty:
            r = p_sub_stats.iloc[0]
            ms1.metric("Avg sub lead time",  _hms(r["avg_hours_before_deadline"]))
            ms2.metric("Earliest submission", _hms(r["max_hours_before_deadline"]) + " early")
        if not p_vote_stats.empty:
            r = p_vote_stats.iloc[0]
            ms3.metric("Avg vote turnaround", _hms(r["avg_hours_after_playlist"]))
            ms4.metric("Fastest vote",        _hms(r["min_hours_after_playlist"]) + " after drop")
