"""
Music League Stats — Streamlit App
====================================
Thin orchestrator: sidebar, data loading, tab dispatch, and report download.

Run with:
    streamlit run app.py
"""

from __future__ import annotations

import os
import streamlit as st

from music_league_stats import (
    LeagueData,
    load_data_from_dirs,
    generate_report_text,
)
from ui.components import inject_css
from ui import (
    tab_leaderboard,
    tab_fan_map,
    tab_trends,
    tab_blowouts,
    tab_comments,
    tab_economy,
)

# ---------------------------------------------------------------------------
# Page config & global CSS
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="🎵 T5 Music League Stats",
    page_icon="🎵",
    layout="wide",
    initial_sidebar_state="expanded",
)
inject_css()

# ---------------------------------------------------------------------------
# League discovery
# ---------------------------------------------------------------------------
REQUIRED_FILES = {"competitors.csv", "rounds.csv", "submissions.csv", "votes.csv"}
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR  = os.path.join(BASE_DIR, "data")

discovered: list[str] = []
if os.path.isdir(DATA_DIR):
    for entry in sorted(os.scandir(DATA_DIR), key=lambda e: e.name):
        if entry.is_dir():
            present = {f.name for f in os.scandir(entry.path) if f.is_file()}
            if REQUIRED_FILES.issubset(present):
                discovered.append(entry.path)

if not discovered:
    st.error(
        "No league data folders found inside the `data/` directory. "
        "Create a `data/` folder next to app.py and place each league "
        "season as a subfolder containing competitors.csv, rounds.csv, "
        "submissions.csv, and votes.csv."
    )
    st.stop()

folder_names = [os.path.basename(d) for d in discovered]

# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------
st.sidebar.title("🎵 Music League Stats")
st.sidebar.markdown("---")

st.sidebar.subheader("League Mode")
mode = st.sidebar.radio(
    "View",
    ["Single League", "Cumulative (multiple leagues)"],
    index=1,
)

if mode == "Single League":
    chosen_name  = st.sidebar.selectbox("Select league", folder_names)
    chosen_dirs  = [discovered[folder_names.index(chosen_name)]]
else:
    chosen_names = st.sidebar.multiselect(
        "Select leagues to combine",
        folder_names,
        default=folder_names,
    )
    if not chosen_names:
        st.warning("Please select at least one league.")
        st.stop()
    chosen_dirs = [discovered[folder_names.index(n)] for n in chosen_names]

st.sidebar.markdown("---")

# ---------------------------------------------------------------------------
# Data loading (cached — switching tabs is instant)
# ---------------------------------------------------------------------------
@st.cache_data(show_spinner="Loading league data...")
def get_data(dirs: tuple[str, ...]) -> LeagueData:
    return load_data_from_dirs(list(dirs))


data  = get_data(tuple(chosen_dirs))
comp  = data.competitors
subs  = data.submissions
vts   = data.votes

scope_label = (
    " + ".join(os.path.basename(d) for d in chosen_dirs)
    if len(chosen_dirs) > 1
    else os.path.basename(chosen_dirs[0])
)

# ---------------------------------------------------------------------------
# Report download
# ---------------------------------------------------------------------------
st.sidebar.subheader("Export Report")

@st.cache_data(show_spinner="Generating report...")
def _cached_report(dirs: tuple[str, ...]) -> str:
    d = get_data(dirs)
    return generate_report_text(d)

report_text = _cached_report(tuple(chosen_dirs))
st.sidebar.download_button(
    label="Download .txt report",
    data=report_text.encode("utf-8"),
    file_name=f"music_league_stats_{scope_label.replace(' ', '_').replace('+', 'and')}.txt",
    mime="text/plain",
)

st.sidebar.markdown("---")
st.sidebar.info("Tip: switch tabs above to explore each stat category.")

# ---------------------------------------------------------------------------
# Page header
# ---------------------------------------------------------------------------
st.title("🎵 Music League Stats")
st.caption(
    f"{len(chosen_dirs)} leagues  ·  "
    f"{len(data.rounds)} rounds  ·  "
    f"{data.competitors['ID'].nunique()} competitors  ·  "
    f"{len(data.submissions)} submissions  ·  "
    f"{int(data.votes['Points'].sum()):,} points given"
)

# ---------------------------------------------------------------------------
# Tabs -- each delegates entirely to its own module
# ---------------------------------------------------------------------------
tabs = st.tabs([
    "Leaderboard",
    "Song Stats",
    "Fan Map",
    "Trends",
    "Comments",
    "Economy",
])

with tabs[0]:
    tab_leaderboard.render(data)

with tabs[1]:
    tab_blowouts.render(data)

with tabs[2]:
    tab_fan_map.render(data)

with tabs[3]:
    tab_trends.render(data)

with tabs[4]:
    tab_comments.render(data)

with tabs[5]:
    tab_economy.render(data)
