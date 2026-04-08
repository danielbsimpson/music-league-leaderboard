"""Quick smoke-test: load data and run headline generation."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from music_league_stats import load_data_from_dirs
from ui.tab_headlines import _gather_metrics, assign_headlines

DATA_DIRS = [
    os.path.join(os.path.dirname(__file__), "data", "t5_league_current"),
    os.path.join(os.path.dirname(__file__), "data", "t5_league1"),
]

data = load_data_from_dirs(DATA_DIRS)
metrics = _gather_metrics(data)
headlines = assign_headlines(data, metrics)

for h in headlines:
    print(f"--- {h.name} ---")
    print(f"  ✅  {h.positive_headline}")
    print(f"      {h.positive_reason}")
    print(f"  😂  {h.funny_headline}")
    print(f"      {h.funny_reason}")
    print()

print("DONE — all headlines generated without errors.")
