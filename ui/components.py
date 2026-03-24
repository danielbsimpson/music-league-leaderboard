"""
ui/components.py
-----------------
Shared visual primitives reused across all tab modules:
  - CSS injection
  - bar_chart()   – Plotly horizontal/vertical bar
  - stat_tile()   – single HTML card
  - tile_group()  – labelled column of stacked tiles
"""

from __future__ import annotations

import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

ACCENT = "#1DB954"  # Spotify green

CHART_BASE = dict(
    plot_bgcolor="rgba(0,0,0,0)",
    paper_bgcolor="rgba(0,0,0,0)",
    font_color="#ccc",
    margin=dict(l=10, r=10, t=40, b=10),
)


def inject_css() -> None:
    """Inject global app CSS once per session."""
    st.markdown(
        f"""
        <style>
            h1 {{ color: {ACCENT}; }}
            .stTabs [data-baseweb="tab"] {{ font-size: 0.95rem; }}
        </style>
        """,
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Chart helpers
# ---------------------------------------------------------------------------

def bar_chart(
    labels: list[str],
    values: list[int | float],
    title: str,
    color: str = ACCENT,
    horizontal: bool = True,
) -> go.Figure:
    """Return a styled Plotly bar chart."""
    orientation = "h" if horizontal else "v"
    x, y = (values, labels) if horizontal else (labels, values)
    fig = px.bar(
        x=x, y=y,
        orientation=orientation,
        title=title,
        color_discrete_sequence=[color],
    )
    fig.update_layout(
        **CHART_BASE,
        title_font_size=15,
        xaxis=dict(showgrid=False, title=""),
        yaxis=dict(showgrid=False, title=""),
        showlegend=False,
    )
    if horizontal:
        fig.update_yaxes(autorange="reversed")
    return fig


def chart_layout(**extra) -> dict:
    """Return a merged update_layout dict for non-bar charts."""
    return {**CHART_BASE, **extra}


# ---------------------------------------------------------------------------
# Tile helpers
# ---------------------------------------------------------------------------

def stat_tile(icon: str, name: str, sub: str, bg: str, text: str = "#f0f0f0") -> str:
    """Return an HTML string for a single stat card (icon | name | sub-label)."""
    return f"""<div style="
            background:{bg};
            border-radius:10px;
            padding:0.6rem 0.85rem;
            box-shadow:0 2px 6px rgba(0,0,0,0.35);
            display:flex;
            align-items:center;
            gap:0.6rem;
        ">
        <div style="font-size:1.4rem;line-height:1;flex-shrink:0">{icon}</div>
        <div style="min-width:0">
            <div style="font-size:0.92rem;font-weight:700;color:{text};
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{name}</div>
            <div style="font-size:0.76rem;color:{text};opacity:0.75;margin-top:1px">{sub}</div>
        </div>
    </div>"""


def tile_group(label: str, tiles_html: list[str]) -> str:
    """Wrap stacked tiles in a labelled flex column."""
    inner = "\n".join(
        f'<div style="padding:0 0 5px 0">{t}</div>'
        for t in tiles_html
    )
    return f"""<div style="display:flex;flex-direction:column;gap:0">
        <div style="font-size:0.78rem;font-weight:600;color:#aaa;
                    text-transform:uppercase;letter-spacing:0.05em;
                    margin-bottom:6px">{label}</div>
        {inner}
    </div>"""
