# 🎵 Music League Stats

A Streamlit web app that turns exported [Music League](https://musicleague.com/) data into rich interactive stats, charts, and downloadable reports.

---

## Table of Contents

1. [Features](#features)
2. [Project Structure](#project-structure)
3. [Setup & Running Locally](#setup--running-locally)
4. [Adding or Updating League Data](#adding-or-updating-league-data)
5. [CSV Format Reference](#csv-format-reference)
6. [App Tabs Overview](#app-tabs-overview)
7. [How to Expand the App](#how-to-expand-the-app)
8. [Deploying to Streamlit Community Cloud](#deploying-to-streamlit-community-cloud)

---

## Features

- **Multi-league support** — load one league or combine multiple leagues into a cumulative view
- **7 interactive tabs** — leaderboard, top songs, fan map, trends, blowouts, comments, point economy
- **Sidebar controls** — switch between single/cumulative mode, choose a target player for fan analysis
- **Downloadable report** — export a full plain-text `.txt` stats report from the sidebar
- **Dark-themed UI** — Spotify-green accent, responsive Plotly charts

---

## Project Structure

```
music_league/
│
├── app.py                      # Streamlit app entry point (thin orchestrator)
├── music_league_stats.py       # All stat functions + data loading + report generator
│
├── ui/                         # Modular tab renderers
│   ├── __init__.py
│   ├── components.py           # Shared UI primitives (CSS, bar_chart, stat_tile)
│   ├── tab_leaderboard.py      # 🏆 Leaderboard tab
│   ├── tab_top_songs.py        # ❤️ Top Songs tab
│   ├── tab_fan_map.py          # 🤝 Fan Map tab
│   ├── tab_trends.py           # 📈 Trends & Consistency tab
│   ├── tab_blowouts.py         # 💥 Biggest Blowouts tab
│   ├── tab_comments.py         # 💬 Comments tab
│   └── tab_economy.py          # 💰 Point Economy tab
│
├── data/                       # All league season data lives here
│   ├── season_1/               # One subfolder per league season
│   │   ├── competitors.csv
│   │   ├── rounds.csv
│   │   ├── submissions.csv
│   │   └── votes.csv
│   └── season_2/
│       ├── competitors.csv
│       ├── rounds.csv
│       ├── submissions.csv
│       └── votes.csv
│
├── requirements.txt            # Python dependencies
└── README.md
```

> **League data folders** are auto-discovered from the `data/` directory. Any subfolder inside `data/` that contains all four required CSV files will automatically appear in the sidebar as a selectable league.

---

## Setup & Running Locally

### Prerequisites

- Python 3.10+
- A virtual environment (recommended)

### Install dependencies

```powershell
# Create and activate a virtual environment (Windows)
python -m venv .venv
.venv\Scripts\Activate.ps1

# Install packages
pip install -r requirements.txt
```

### Run the app

```powershell
streamlit run app.py
```

The app will open at `http://localhost:8501`.

> **Windows note:** If you see emoji rendering issues in the terminal, prefix the command with `$env:PYTHONUTF8=1 ;` before running.

### `requirements.txt`

```
pandas
streamlit
plotly
```

---

## Adding or Updating League Data

### Adding a new league season

1. Export your league data from [musicleague.com](https://musicleague.com/) (Settings → Export Data).
2. Create a new subfolder inside `data/`, e.g. `data/season_3/`.
3. Place the four exported CSV files inside it:
   ```
   data/
   └── season_3/
       ├── competitors.csv
       ├── rounds.csv
       ├── submissions.csv
       └── votes.csv
   ```
4. Restart (or hot-reload) the app — the new league will appear automatically in the sidebar.

### Cumulative view (multiple leagues)

In the sidebar, switch the radio button from **Single League** to **Cumulative**, then check all the leagues you want to combine. Stats like "Most Improved" automatically scope the first/last 5 rounds *per league* before averaging, so results remain meaningful across seasons.

### Renaming a league

The display name shown in the sidebar is the folder name. Simply rename the folder inside `data/` (e.g. `data/season_1` → `data/Season 1 — The OG Crew`) and restart the app.

---

## CSV Format Reference

These match the export format from Music League. **Do not rename columns.**

### `competitors.csv`

| Column | Description |
|--------|-------------|
| `ID` | Unique player UUID |
| `Name` | Display name |

### `rounds.csv`

| Column | Description |
|--------|-------------|
| `ID` | Unique round UUID |
| `Created` | ISO 8601 timestamp |
| `Name` | Round title |
| `Description` | Round prompt |
| `Playlist URL` | Spotify playlist link |

### `submissions.csv`

| Column | Description |
|--------|-------------|
| `Spotify URI` | Track identifier (e.g. `spotify:track:...`) |
| `Title` | Song title |
| `Album` | Album name |
| `Artist(s)` | Artist name(s) |
| `Submitter ID` | UUID matching `competitors.csv` |
| `Created` | ISO 8601 timestamp |
| `Comment` | Optional submitter note |
| `Round ID` | UUID matching `rounds.csv` |
| `Visible To Voters` | `Yes` / `No` |

### `votes.csv`

| Column | Description |
|--------|-------------|
| `Spotify URI` | Track identifier matching `submissions.csv` |
| `Voter ID` | UUID matching `competitors.csv` |
| `Created` | ISO 8601 timestamp |
| `Points Assigned` | Integer point value given |
| `Comment` | Optional vote comment |
| `Round ID` | UUID matching `rounds.csv` |

---

## App Tabs Overview

| Tab | What it shows |
|-----|---------------|
| 🏆 **Leaderboard** | Total points ranking, per-round heatmap, zero-point incidents |
| ❤️ **Top Songs** | Most liked songs by total points and by number of voters |
| 🤝 **Fan Map** | Who gives the most points to a target player, least compatible pairings, full points matrix |
| 📈 **Trends** | Consistency/volatility rankings, most improved (early vs. late rounds), points-over-time line chart |
| 💥 **Blowouts** | Rounds with the largest winning margin (1st vs. 2nd place) |
| 💬 **Comments** | Most talkative voters, most commented-on songs, searchable full comment table |
| 💰 **Economy** | Total points distributed, averages, points-per-round bar, vote value distribution |

---

## How to Expand the App

### Adding a new stat function

1. Open `music_league_stats.py`.
2. Add your function. It should accept `LeagueData` fields as arguments (e.g. `submissions`, `votes`, `competitors`) and return a list of dicts or a scalar.
3. Add the result to `generate_report_text()` if you want it included in the `.txt` download.

### Adding a new tab

1. Create `ui/tab_mynewtab.py` with a `render(data: LeagueData) -> None` function.
2. Import it in `app.py`:
   ```python
   from ui import tab_mynewtab
   ```
3. Add a new tab to the `st.tabs(...)` list in `app.py` and call `tab_mynewtab.render(data)` inside its `with` block.

### Changing the color scheme

Edit `ui/components.py`:

```python
ACCENT = "#1DB954"   # change to any hex color
```

`CHART_BASE` controls the dark chart background. Update `plot_bgcolor` / `paper_bgcolor` there to change the chart canvas color.

---

## Deploying to Streamlit Community Cloud

1. Push the project to a **public** (or private, with access granted) GitHub repository.
2. Include a `requirements.txt` in the repo root:
   ```
   pandas
   streamlit
   plotly
   ```
3. Also include your league data folder(s) in the repo, or use [Streamlit secrets](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/secrets-management) to load data from a remote source.
4. Go to [share.streamlit.io](https://share.streamlit.io), click **New app**, point it at your repo and `app.py`.
5. Click **Deploy** — done.

> **Note on data privacy:** If your league data contains real names, be mindful of hosting it in a public repo. Consider anonymizing names in the CSVs or using a private repository with restricted access.
