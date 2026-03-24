"""
ui/tab_blowouts.py
-------------------
Renders the 💥 Biggest Blowouts tab.
"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from music_league_stats import LeagueData, biggest_blowout
from ui.components import bar_chart


def render(data: LeagueData) -> None:
    comp = data.competitors
    rds  = data.rounds
    subs = data.submissions
    vts  = data.votes

    st.header("💥 Biggest Blowouts")
    st.caption("Rounds where the winner had the largest margin over 2nd place.")

    blowouts = biggest_blowout(subs, vts, rds, comp)
    blow_df = pd.DataFrame(blowouts).rename(columns={
        "round":         "Round",
        "winner":        "Winner",
        "winner_song":   "Winning Song",
        "winner_points": "Winner Pts",
        "second_place":  "2nd Place",
        "second_points": "2nd Pts",
        "margin":        "Margin",
    })

    st.plotly_chart(
        bar_chart(
            blow_df["Round"].tolist(),
            blow_df["Margin"].tolist(),
            "Winning margin per round (1st − 2nd place points)",
            color="#ffd166",
        ),
        width="stretch",
    )
    st.dataframe(blow_df, width="stretch", hide_index=True)
