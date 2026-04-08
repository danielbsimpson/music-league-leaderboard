"""
fetch_submission_genres.py
==========================
For every league folder under the `data/` directory, reads `submissions.csv`,
`competitors.csv`, and `rounds.csv`, then queries the Spotify API to retrieve
genre information for each submitted track.

Output: `submission_genres.csv` written into each league folder.

Columns in output CSV:
    spotify_uri    – Spotify track URI
    title          – Song title
    artist(s)      – Artist(s) as listed in submissions.csv
    submitter_name – Player name (joined from competitors.csv)
    round_name     – Round name (joined from rounds.csv)
    genres         – Pipe-separated list of genres (from Spotify artist objects)

How genres are sourced:
    Spotify does not expose genres at the track level.  Genres live on Artist
    objects.  This script calls GET /v1/tracks/{id} to discover the artist IDs
    for each track, then calls GET /v1/artists/{id} to retrieve genres.
    The genres for all artists on a track are merged, de-duplicated, and stored
    as a pipe-separated string (e.g. "rock|pop").
    If no genres are found for a track, the cell is left blank.

Authentication:
    Uses the Spotify Client Credentials flow via raw HTTP requests.
    No browser login or redirect URI required.

    Credentials are read from:
        C:\\Users\\dan63030s\\Documents\\data\\spotify\\credentials.txt

    The file should contain:
        SPOTIPY_CLIENT_ID=your_client_id
        SPOTIPY_CLIENT_SECRET=your_client_secret

    Lines starting with '#' and blank lines are ignored.

Usage:
    python data/fetch_submission_genres.py
"""

from __future__ import annotations

import os
import sys
import time
import pathlib
import textwrap
from typing import Optional

import requests
import pandas as pd

# ---------------------------------------------------------------------------
# Load credentials from local file outside the repository
# ---------------------------------------------------------------------------
CREDENTIALS_FILE = pathlib.Path(r"C:\Users\dan63030s\Documents\data\spotify\credentials.txt")


def _load_credentials_from_file(path: pathlib.Path) -> dict[str, str]:
    creds: dict[str, str] = {}
    if not path.exists():
        return creds
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                creds[key.strip()] = value.strip()
    return creds


_file_creds = _load_credentials_from_file(CREDENTIALS_FILE)
if _file_creds:
    print(f"[info] Loaded credentials from {CREDENTIALS_FILE}")
else:
    print(f"[warn] Credentials file not found or empty: {CREDENTIALS_FILE}")

CLIENT_ID = _file_creds.get("SPOTIPY_CLIENT_ID") or os.environ.get("SPOTIPY_CLIENT_ID", "")
CLIENT_SECRET = _file_creds.get("SPOTIPY_CLIENT_SECRET") or os.environ.get("SPOTIPY_CLIENT_SECRET", "")

if not CLIENT_ID or not CLIENT_SECRET:
    sys.exit(
        textwrap.dedent(
            f"""\
            [error] Spotify credentials not found.

            Expected a credentials file at:
                {CREDENTIALS_FILE}

            The file should contain:
                SPOTIPY_CLIENT_ID=your_client_id
                SPOTIPY_CLIENT_SECRET=your_client_secret

            Get credentials at: https://developer.spotify.com/dashboard
            """
        )
    )

# ---------------------------------------------------------------------------
# Spotify API client (Client Credentials, no browser/redirect needed)
# ---------------------------------------------------------------------------

class SpotifyClient:
    """Minimal Spotify Web API client using Client Credentials flow."""

    TOKEN_URL = "https://accounts.spotify.com/api/token"
    API_BASE  = "https://api.spotify.com/v1"

    def __init__(self, client_id: str, client_secret: str) -> None:
        self._client_id     = client_id
        self._client_secret = client_secret
        self._token: str    = ""
        self._token_expiry  = 0.0
        self._session       = requests.Session()

    def _refresh_token(self) -> None:
        resp = self._session.post(
            self.TOKEN_URL,
            data={"grant_type": "client_credentials"},
            auth=(self._client_id, self._client_secret),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        self._token = data["access_token"]
        self._token_expiry = time.time() + data.get("expires_in", 3600) - 60

    def _headers(self) -> dict[str, str]:
        if time.time() >= self._token_expiry:
            self._refresh_token()
        return {"Authorization": f"Bearer {self._token}"}

    def get(self, path: str, params: dict | None = None, retries: int = 4) -> dict:
        """GET {API_BASE}/{path} with automatic token refresh and retry on 429."""
        url = f"{self.API_BASE}/{path}"
        for attempt in range(retries):
            resp = self._session.get(url, headers=self._headers(),
                                     params=params, timeout=10)
            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 5))
                print(f"[rate-limit] 429 – waiting {retry_after}s ...")
                time.sleep(retry_after + 1)
                continue
            if resp.status_code == 401:
                self._token_expiry = 0  # force token refresh
                continue
            resp.raise_for_status()
            return resp.json()
        resp.raise_for_status()
        return {}


sp = SpotifyClient(CLIENT_ID, CLIENT_SECRET)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_track_id(uri: str) -> Optional[str]:
    """Return the bare track ID from a 'spotify:track:<id>' URI."""
    parts = str(uri).strip().split(":")
    if len(parts) == 3 and parts[1] == "track":
        return parts[2]
    return None


def fetch_artist_ids_for_tracks(track_ids: list[str]) -> dict[str, list[str]]:
    """Fetch tracks one at a time. Returns track_id -> [artist_id, ...]"""
    track_to_artists: dict[str, list[str]] = {}
    total = len(track_ids)
    for idx, tid in enumerate(track_ids, 1):
        try:
            data = sp.get(f"tracks/{tid}")
            artist_ids = [a["id"] for a in data.get("artists", []) if a.get("id")]
            track_to_artists[tid] = artist_ids
        except Exception as exc:
            print(f"[warn] Could not fetch track {tid}: {exc!s:.100}")
        if idx % 10 == 0 or idx == total:
            print(f"    {idx}/{total} tracks fetched ...", end="\r")
        time.sleep(0.07)
    print()
    return track_to_artists


def fetch_genres_for_artists(artist_ids: list[str]) -> dict[str, list[str]]:
    """Fetch artists one at a time. Returns artist_id -> [genre, ...]"""
    artist_to_genres: dict[str, list[str]] = {}
    unique_ids = list(dict.fromkeys(artist_ids))
    total = len(unique_ids)
    for idx, aid in enumerate(unique_ids, 1):
        try:
            data = sp.get(f"artists/{aid}")
            artist_to_genres[aid] = data.get("genres", [])
        except Exception as exc:
            print(f"[warn] Could not fetch artist {aid}: {exc!s:.100}")
        if idx % 10 == 0 or idx == total:
            print(f"    {idx}/{total} artists fetched ...", end="\r")
        time.sleep(0.07)
    print()
    return artist_to_genres


# ---------------------------------------------------------------------------
# Per-league processing
# ---------------------------------------------------------------------------

def get_genres_for_league(league_dir: pathlib.Path) -> None:
    subs_path   = league_dir / "submissions.csv"
    comp_path   = league_dir / "competitors.csv"
    rounds_path = league_dir / "rounds.csv"

    if not subs_path.exists():
        print(f"[skip] No submissions.csv in {league_dir}")
        return

    print(f"\n{'='*60}")
    print(f"Processing: {league_dir.name}")
    print(f"{'='*60}")

    subs   = pd.read_csv(subs_path)
    comps  = pd.read_csv(comp_path)   if comp_path.exists()   else pd.DataFrame(columns=["ID", "Name"])
    rounds = pd.read_csv(rounds_path) if rounds_path.exists() else pd.DataFrame(columns=["ID", "Name"])

    subs.columns   = subs.columns.str.strip()
    comps.columns  = comps.columns.str.strip()
    rounds.columns = rounds.columns.str.strip()

    comp_map:  dict[str, str] = dict(zip(comps["ID"].astype(str),  comps["Name"].astype(str)))
    round_map: dict[str, str] = dict(zip(rounds["ID"].astype(str), rounds["Name"].astype(str)))

    subs["_track_id"] = subs["Spotify URI"].apply(extract_track_id)
    valid_track_ids   = subs["_track_id"].dropna().unique().tolist()

    print(f"  Submissions  : {len(subs)}")
    print(f"  Unique tracks: {len(valid_track_ids)}")

    print("  Fetching artist IDs from Spotify ...")
    track_to_artist_ids = fetch_artist_ids_for_tracks(valid_track_ids)

    all_artist_ids = list(dict.fromkeys(
        aid for aids in track_to_artist_ids.values() for aid in aids
    ))
    print(f"  Unique artists: {len(all_artist_ids)}")

    print("  Fetching artist genres from Spotify ...")
    artist_to_genres = fetch_genres_for_artists(all_artist_ids)

    def genres_for_track(track_id: Optional[str]) -> str:
        if not track_id:
            return ""
        seen: set[str] = set()
        result = []
        for aid in track_to_artist_ids.get(track_id, []):
            for g in artist_to_genres.get(aid, []):
                if g not in seen:
                    seen.add(g)
                    result.append(g)
        return "|".join(result)

    output_rows = [
        {
            "spotify_uri":    row["Spotify URI"],
            "title":          row.get("Title", ""),
            "artist(s)":      row.get("Artist(s)", ""),
            "submitter_name": comp_map.get(str(row.get("Submitter ID", "")), str(row.get("Submitter ID", ""))),
            "round_name":     round_map.get(str(row.get("Round ID", "")), str(row.get("Round ID", ""))),
            "genres":         genres_for_track(row["_track_id"]),
        }
        for _, row in subs.iterrows()
    ]

    out_df   = pd.DataFrame(output_rows)
    out_path = league_dir / "submission_genres.csv"
    out_df.to_csv(out_path, index=False, encoding="utf-8")

    with_genres    = (out_df["genres"] != "").sum()
    without_genres = (out_df["genres"] == "").sum()
    print(f"  [done] Written -> {out_path}")
    print(f"  Tracks with genres   : {with_genres}")
    print(f"  Tracks without genres: {without_genres}  (some artists have no genre data on Spotify)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    data_dir = pathlib.Path(__file__).resolve().parent

    league_dirs = sorted(
        [d for d in data_dir.iterdir() if d.is_dir()],
        key=lambda p: p.name,
    )

    if not league_dirs:
        sys.exit(f"[error] No sub-folders found in {data_dir}")

    print(f"Found {len(league_dirs)} league folder(s): {[d.name for d in league_dirs]}")

    for league_dir in league_dirs:
        get_genres_for_league(league_dir)

    print("\nAll done!")


if __name__ == "__main__":
    main()
