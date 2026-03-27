"""
ui/tab_trends.py
-----------------
Renders the 📈 Trends & Consistency tab.
"""

from __future__ import annotations

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from music_league_stats import (
    LeagueData,
    most_consistent_submitter,
    most_volatile_submitter,
    _points_per_submission,
    _name_map,
)
from ui.components import bar_chart, CHART_BASE, ACCENT


def render(data: LeagueData) -> None:
    comp  = data.competitors
    rds   = data.rounds
    subs  = data.submissions
    vts   = data.votes
    names = _name_map(comp)

    st.header("📈 Trends & Consistency")

    # ----------------------------------------- consistency / volatility
    col_con, col_vol = st.columns(2)

    with col_con:
        st.subheader("📏 Most Consistent (Lowest Variance)")
        con = most_consistent_submitter(subs, vts, comp)
        con_df = pd.DataFrame(con).rename(columns={"name": "Player", "variance": "Variance"})
        st.plotly_chart(
            bar_chart(con_df["Player"].tolist(), con_df["Variance"].tolist(),
                      "Points variance (lower = more consistent)", color=ACCENT,
                      x_label="Variance", y_label="Player"),
            width="stretch",
            key="trends_consistent",
        )

    with col_vol:
        st.subheader("🎢 Most Volatile (Highest Variance)")
        vol = most_volatile_submitter(subs, vts, comp)
        vol_df = pd.DataFrame(vol).rename(columns={"name": "Player", "variance": "Variance"})
        st.plotly_chart(
            bar_chart(vol_df["Player"].tolist(), vol_df["Variance"].tolist(),
                      "Points variance (higher = more volatile)", color="#e05252",
                      x_label="Variance", y_label="Player"),
            width="stretch",
            key="trends_volatile",
        )

    st.divider()

    # ---------------------------------------------------- most improved
    st.subheader("📈 Most Improved")

    is_cumulative = len(data.league_rounds) > 1

    def _half_vs_half(
        round_ids_ordered: list[str],
        label_early: str = "First Half Avg",
        label_late: str  = "Second Half Avg",
        title: str       = "First half vs second half average",
        chart_key: str   = "trends_improved",
    ) -> tuple[go.Figure, pd.DataFrame]:
        """
        Split round_ids_ordered into two halves, compute per-player averages
        in each half, return a grouped bar Figure and a summary DataFrame.
        """
        pps_all = _points_per_submission(subs, vts)
        mid     = len(round_ids_ordered) // 2
        first_ids  = set(round_ids_ordered[:mid])
        second_ids = set(round_ids_ordered[mid:])

        first_avg = (
            pps_all[pps_all["Round ID"].isin(first_ids)]
            .groupby("Submitter ID")["TotalPoints"].mean()
            .rename("FirstAvg")
        )
        second_avg = (
            pps_all[pps_all["Round ID"].isin(second_ids)]
            .groupby("Submitter ID")["TotalPoints"].mean()
            .rename("SecondAvg")
        )
        combined = pd.concat([first_avg, second_avg], axis=1).dropna()
        combined["Improvement"] = combined["SecondAvg"] - combined["FirstAvg"]
        combined["Player"] = combined.index.map(names)
        combined = combined.sort_values("Improvement", ascending=False).reset_index(drop=True)

        fig = go.Figure()
        fig.add_trace(go.Bar(
            name=label_early, x=combined["Player"], y=combined["FirstAvg"].round(2),
            marker_color="#888",
        ))
        fig.add_trace(go.Bar(
            name=label_late, x=combined["Player"], y=combined["SecondAvg"].round(2),
            marker_color=ACCENT,
        ))
        fig.update_layout(
            **CHART_BASE,
            barmode="group",
            title=title,
            xaxis=dict(title=""),
            yaxis=dict(title="Avg pts / round"),
            legend=dict(bgcolor="rgba(0,0,0,0)"),
        )
        out_df = combined[["Player", "FirstAvg", "SecondAvg", "Improvement"]].rename(columns={
            "FirstAvg": label_early, "SecondAvg": label_late,
        }).round(2)
        return fig, out_df

    if is_cumulative:
        # ---- Current league: split its rounds in half ----
        current_rds = (
            data.league_rounds[-1]
            .copy()
            .assign(Created=lambda df: pd.to_datetime(df["Created"], utc=True))
            .sort_values("Created")
        )
        current_name = data.league_names[-1]
        current_round_ids = current_rds["ID"].tolist()

        # ---- Cumulative: split ALL rounds (chronological) in half ----
        all_rds_sorted = (
            rds.copy()
            .assign(Created=lambda df: pd.to_datetime(df["Created"], utc=True))
            .sort_values("Created")
        )
        all_round_ids = all_rds_sorted["ID"].tolist()

        col_cur, col_cum = st.columns(2)

        with col_cur:
            st.markdown(f"**🗓️ Current League — {current_name}**")
            n_rounds = len(current_round_ids)
            st.caption(
                f"{n_rounds} rounds split into two halves "
                f"(rounds 1–{n_rounds // 2} vs {n_rounds // 2 + 1}–{n_rounds})"
            )
            fig_cur, df_cur = _half_vs_half(
                current_round_ids,
                label_early="First Half Avg",
                label_late="Second Half Avg",
                title=f"{current_name}: first vs second half",
                chart_key="trends_improved_current",
            )
            st.plotly_chart(fig_cur, width="stretch", key="trends_improved_current")
            st.dataframe(df_cur, width="stretch", hide_index=True)

        with col_cum:
            st.markdown("**📚 Cumulative — all leagues**")
            n_all = len(all_round_ids)
            st.caption(
                f"{n_all} rounds split into two halves "
                f"(rounds 1–{n_all // 2} vs {n_all // 2 + 1}–{n_all})"
            )
            fig_cum, df_cum = _half_vs_half(
                all_round_ids,
                label_early="First Half Avg",
                label_late="Second Half Avg",
                title="All leagues combined: first vs second half",
                chart_key="trends_improved_cumulative",
            )
            st.plotly_chart(fig_cum, width="stretch", key="trends_improved_cumulative")
            st.dataframe(df_cum, width="stretch", hide_index=True)

    else:
        # Single league: split its rounds in half
        rds_sorted = (
            rds.copy()
            .assign(Created=lambda df: pd.to_datetime(df["Created"], utc=True))
            .sort_values("Created")
        )
        round_ids = rds_sorted["ID"].tolist()
        n_rounds  = len(round_ids)
        st.caption(
            f"{n_rounds} rounds split into two halves "
            f"(rounds 1–{n_rounds // 2} vs {n_rounds // 2 + 1}–{n_rounds})"
        )
        fig_imp, imp_df = _half_vs_half(
            round_ids,
            title="First half vs second half average",
            chart_key="trends_improved_single",
        )
        st.plotly_chart(fig_imp, width="stretch", key="trends_improved_single")
        st.dataframe(imp_df, width="stretch", hide_index=True)

    st.divider()

    # ---------------------------------------- points over time (line)
    st.subheader("📉 Points Over Time (per player)")
    pps = _points_per_submission(subs, vts)
    rounds_sorted = (
        rds.copy()
        .assign(Created=lambda df: pd.to_datetime(df["Created"], utc=True))
        .sort_values("Created")
        [["ID", "Name"]]
        .rename(columns={"ID": "Round ID", "Name": "RoundName"})
    )
    pps_time = (
        pps.merge(rounds_sorted, on="Round ID")
        .assign(Player=lambda df: df["Submitter ID"].map(names))
    )
    fig_line = px.line(
        pps_time,
        x="RoundName", y="TotalPoints", color="Player",
        markers=True,
        category_orders={"RoundName": rounds_sorted["RoundName"].tolist()},
        title="Points scored each round",
    )
    fig_line.update_layout(
        **CHART_BASE,
        xaxis=dict(tickangle=-40, title=""),
        yaxis=dict(title=""),
        legend=dict(bgcolor="rgba(0,0,0,0)"),
    )
    st.plotly_chart(fig_line, width="stretch", key="trends_over_time")
