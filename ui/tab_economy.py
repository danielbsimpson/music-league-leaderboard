"""
ui/tab_economy.py
------------------
Renders the 💰 Point Economy tab.
"""

from __future__ import annotations

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from music_league_stats import LeagueData, point_economy_summary, _points_per_submission
from ui.components import CHART_BASE, ACCENT

# Quantile buckets: (label, upper_bound_exclusive)
# Submissions in each round are ranked by points received and grouped into
# these percentile bands.  The top 10 % captures ~10 % of submissions etc.
_QUANTILE_BUCKETS = [
    ("Top 10%",    0.10),
    ("10–25%",     0.25),
    ("25–50%",     0.50),
    ("Bottom 50%", 1.00),
]
_BUCKET_COLORS = ["#1DB954", "#ffd166", "#ef476f", "#888888"]


def render(data: LeagueData) -> None:
    rds  = data.rounds
    subs = data.submissions
    vts  = data.votes

    st.header("💰 Point Economy")

    pe = point_economy_summary(subs, vts, rds)

    m1, m2, m3, m4, m5 = st.columns(5)
    m1.metric("Total Points Distributed",  pe["total_points_distributed"])
    m2.metric("Rounds Played",             pe["num_rounds"])
    m3.metric("Avg Points / Round",        pe["avg_points_per_round"])
    m4.metric("Avg Points / Submission",   pe["avg_points_per_submission"])
    m5.metric("Min → Max Per Round",
              f"{pe['min_points_in_round']} → {pe['max_points_in_round']}")

    st.divider()

    # ---------------------------------------- points per round bar
    pps = _points_per_submission(subs, vts)
    per_round = (
        pps.groupby("Round ID")["TotalPoints"]
        .sum()
        .reset_index()
        .merge(
            rds[["ID", "Name", "Created"]].rename(
                columns={"ID": "Round ID", "Name": "RoundName"}
            ),
            on="Round ID",
        )
        .sort_values("Created")
    )
    fig_eco = px.bar(
        per_round, x="RoundName", y="TotalPoints",
        title="Total points distributed per round",
        color_discrete_sequence=[ACCENT],
    )
    fig_eco.update_layout(
        **CHART_BASE,
        xaxis=dict(tickangle=-40, title=""),
        yaxis=dict(title=""),
        showlegend=False,
    )
    st.plotly_chart(fig_eco, width="stretch", key="economy_per_round")

    st.divider()

    # ----------------------------------------- vote distribution bar
    st.subheader("🎲 Vote Distribution")
    vote_dist = vts[vts["Points"] > 0]["Points"].value_counts().sort_index()
    fig_dist = px.bar(
        x=vote_dist.index.astype(str),
        y=vote_dist.values,
        title="How often each point value was used",
        color_discrete_sequence=["#ffd166"],
    )
    fig_dist.update_layout(
        **CHART_BASE,
        xaxis=dict(title=""),
        yaxis=dict(title=""),
        showlegend=False,
    )
    st.plotly_chart(fig_dist, width="stretch", key="economy_vote_dist")

    st.divider()

    # ----------------------------------------- quantile share section
    st.subheader("📊 Vote Share by Quantile")
    st.caption(
        "Submissions in each round are ranked by points received and grouped into "
        "percentile bands. The chart shows what share of that round's total points "
        "each band captured."
    )

    # Build per-round quantile share table
    pps_q = _points_per_submission(subs, vts).merge(
        rds[["ID", "Name", "Created"]].rename(
            columns={"ID": "Round ID", "Name": "RoundName", "Created": "RoundCreated"}
        ),
        on="Round ID",
    ).sort_values("RoundCreated")

    rows: list[dict] = []
    for round_id, grp in pps_q.groupby("Round ID", sort=False):
        round_name   = grp["RoundName"].iloc[0]
        round_total  = grp["TotalPoints"].sum()
        if round_total == 0:
            continue
        # Rank submissions within this round (highest points = rank 1)
        grp = grp.sort_values("TotalPoints", ascending=False).reset_index(drop=True)
        n = len(grp)
        prev_bound = 0.0
        for label, upper in _QUANTILE_BUCKETS:
            lo_idx = int(prev_bound * n)
            hi_idx = max(int(upper * n), lo_idx + 1)   # at least 1 submission
            hi_idx = min(hi_idx, n)
            bucket_pts = grp.iloc[lo_idx:hi_idx]["TotalPoints"].sum()
            rows.append({
                "RoundName":  round_name,
                "Created":    grp["RoundCreated"].iloc[0],
                "Quantile":   label,
                "Points":     bucket_pts,
                "PctOfRound": round(100 * bucket_pts / round_total, 1),
            })
            prev_bound = upper

    q_df = pd.DataFrame(rows).sort_values("Created")

    # ---- view toggle ----
    view = st.radio(
        "View",
        ["Per Round (stacked bar)", "Overall (donut)", "Player → Quantile (Sankey)"],
        horizontal=True,
        key="quantile_view",
    )

    if view == "Per Round (stacked bar)":
        fig_q = go.Figure()
        for (label, _), color in zip(_QUANTILE_BUCKETS, _BUCKET_COLORS):
            band = q_df[q_df["Quantile"] == label]
            fig_q.add_trace(go.Bar(
                x=band["RoundName"],
                y=band["PctOfRound"],
                name=label,
                marker_color=color,
                hovertemplate=(
                    "<b>%{x}</b><br>"
                    f"{label}: " + "%{y:.1f}%<extra></extra>"
                ),
            ))
        fig_q.update_layout(
            **CHART_BASE,
            barmode="stack",
            title="% of round's total points captured by each quantile",
            xaxis=dict(tickangle=-40, title=""),
            yaxis=dict(title="% of round points", range=[0, 100]),
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        )
        st.plotly_chart(fig_q, width="stretch", key="economy_quantile_bar")

    elif view == "Overall (donut)":
        overall = q_df.groupby("Quantile")["Points"].sum().reset_index()
        # Preserve bucket order
        bucket_order = [b[0] for b in _QUANTILE_BUCKETS]
        overall["Quantile"] = pd.Categorical(overall["Quantile"], categories=bucket_order, ordered=True)
        overall = overall.sort_values("Quantile")
        fig_donut = go.Figure(go.Pie(
            labels=overall["Quantile"],
            values=overall["Points"],
            hole=0.55,
            marker_colors=_BUCKET_COLORS,
            textinfo="label+percent",
            hovertemplate="<b>%{label}</b><br>%{value:,} pts  (%{percent})<extra></extra>",
            direction="clockwise",
            sort=False,
        ))
        fig_donut.update_layout(
            **CHART_BASE,
            title="Overall share of all points by quantile",
            legend=dict(orientation="h", yanchor="bottom", y=-0.1, xanchor="center", x=0.5),
        )
        st.plotly_chart(fig_donut, width="stretch", key="economy_quantile_donut")

    elif view == "Player → Quantile (Sankey)":
        from music_league_stats import _name_map
        voter_names = _name_map(data.competitors)

        # Assign quantile bucket label to every (round, submission) pair
        bucket_rows: list[dict] = []
        for round_id, grp in pps_q.groupby("Round ID", sort=False):
            if grp["TotalPoints"].sum() == 0:
                continue
            grp = grp.sort_values("TotalPoints", ascending=False).reset_index(drop=True)
            n = len(grp)
            prev_bound = 0.0
            for label, upper in _QUANTILE_BUCKETS:
                lo_idx = int(prev_bound * n)
                hi_idx = min(max(int(upper * n), lo_idx + 1), n)
                for uri in grp.iloc[lo_idx:hi_idx]["SpotifyURI"]:
                    bucket_rows.append({"SpotifyURI": uri, "Round ID": round_id, "Bucket": label})
                prev_bound = upper

        bucket_map = pd.DataFrame(bucket_rows)

        # Join votes → bucket assignments; keep only positive votes
        vts_sk = (
            vts[vts["Points"] > 0]
            .merge(bucket_map, on=["SpotifyURI", "Round ID"], how="inner")
            .copy()
        )
        vts_sk["VoterName"] = vts_sk["Voter ID"].map(voter_names)

        # Aggregate: voter → bucket → total points sent
        flow = (
            vts_sk.groupby(["VoterName", "Bucket"])["Points"]
            .sum()
            .reset_index()
        )

        # Order voters by total points they cast (descending)
        voter_order_s  = (
            flow.groupby("VoterName")["Points"]
            .sum().sort_values(ascending=False).index.tolist()
        )
        bucket_order_s = [b[0] for b in _QUANTILE_BUCKETS]

        s_nodes = voter_order_s + bucket_order_s
        s_idx   = {name: i for i, name in enumerate(s_nodes)}
        n_v, n_b = len(voter_order_s), len(bucket_order_s)

        s_sources = [s_idx[r["VoterName"]] for _, r in flow.iterrows()]
        s_targets = [s_idx[r["Bucket"]]    for _, r in flow.iterrows()]
        s_values  = flow["Points"].tolist()

        # Colour each link to match its target quantile bucket, with transparency
        bucket_color_map = {label: color for (label, _), color in zip(_QUANTILE_BUCKETS, _BUCKET_COLORS)}

        def _hex_to_rgba(hex_color: str, alpha: float = 0.4) -> str:
            h = hex_color.lstrip("#")
            r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
            return f"rgba({r},{g},{b},{alpha})"

        sk_link_colors = [
            _hex_to_rgba(bucket_color_map[r["Bucket"]])
            for _, r in flow.iterrows()
        ]

        node_x_s = [0.01] * n_v + [0.99] * n_b
        node_y_s = (
            [round((i + 1) / (n_v + 1), 3) for i in range(n_v)]
            + [round((i + 1) / (n_b + 1), 3) for i in range(n_b)]
        )
        node_colors_s = ["#1DB954"] * n_v + _BUCKET_COLORS[:n_b]

        fig_sk = go.Figure(go.Sankey(
            arrangement="fixed",
            node=dict(
                label     = s_nodes,
                x         = node_x_s,
                y         = node_y_s,
                color     = node_colors_s,
                pad       = 14,
                thickness = 18,
                line      = dict(color="rgba(0,0,0,0)", width=0),
            ),
            link=dict(
                source = s_sources,
                target = s_targets,
                value  = s_values,
                color  = sk_link_colors,
            ),
        ))
        fig_sk.update_layout(
            **{**CHART_BASE, "margin": dict(l=10, r=10, t=50, b=10)},
            title="Points flow: voter (left) → quantile band they fed (right)",
            height=max(400, n_v * 36 + 80),
        )
        st.plotly_chart(fig_sk, width="stretch", key="economy_quantile_sankey")
