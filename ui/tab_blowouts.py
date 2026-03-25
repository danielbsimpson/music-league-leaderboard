"""
ui/tab_blowouts.py
-------------------
Renders the 🎵 Songs tab — blowouts, most-submitted songs, and artist appearances.
"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from music_league_stats import (
    LeagueData,
    biggest_blowout,
    most_submitted_songs,
    most_artist_appearances,
)
from ui.components import bar_chart


def render(data: LeagueData) -> None:
    comp = data.competitors
    rds  = data.rounds
    subs = data.submissions
    vts  = data.votes

    st.header("🎵 Songs")

    # --------------------------------------------------- biggest blowouts
    st.subheader("💥 Biggest Blowouts")
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

    st.divider()

    # --------------------------------------------------- most submitted songs
    st.subheader("🔁 Most Submitted Songs")
    st.caption("Songs that appeared in submissions more than once across all rounds.")

    repeated = most_submitted_songs(subs)
    if repeated:
        rep_df = pd.DataFrame(repeated).rename(columns={
            "rank":   "Rank",
            "title":  "Title",
            "artist": "Artist(s)",
            "count":  "Times Submitted",
        })
        st.plotly_chart(
            bar_chart(
                (rep_df["Title"] + " — " + rep_df["Artist(s)"]).tolist(),
                rep_df["Times Submitted"].tolist(),
                "Most Submitted Songs",
                color="#c77dff",
            ),
            width="stretch",
        )
        st.dataframe(rep_df, hide_index=True, width="stretch")
    else:
        st.info("No song was submitted more than once. 🎉")

    st.divider()

    # --------------------------------------------------- most artist appearances
    st.subheader("🎤 Most Artist Appearances")
    st.caption("Artists whose songs appear most frequently across all submissions.")

    artists = most_artist_appearances(subs)
    if artists:
        art_df = pd.DataFrame(artists).rename(columns={
            "rank":   "Rank",
            "artist": "Artist",
            "count":  "Appearances",
        })
        st.plotly_chart(
            bar_chart(
                art_df["Artist"].tolist(),
                art_df["Appearances"].tolist(),
                "Most Frequent Artists",
                color="#f4a261",
            ),
            width="stretch",
        )
        st.dataframe(art_df, hide_index=True, width="stretch")
    else:
        st.info("No artist data available.")
