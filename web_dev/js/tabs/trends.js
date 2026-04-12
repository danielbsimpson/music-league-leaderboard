/**
 * tabs/trends.js — 📈 Trends & Consistency tab
 */

import {
  mostConsistentSubmitter, mostVolatileSubmitter,
  halfVsHalf, pointsOverTime,
} from '../data.js';

import {
  el, sectionHeader, sectionCaption, divider,
  makeBarChart, makeGroupedBarChart, makeLineChart, htmlTable,
  ACCENT, PALETTE,
} from '../charts.js';

export function renderTrends(container, data) {
  container.appendChild(sectionHeader('📈 Trends & Consistency'));

  // ── Consistency / Volatility ────────────────────────────────────────────
  {
    const grid = el('div', 'grid-2');

    const conWrap = el('div');
    conWrap.appendChild(el('h4', 'section-header', '📏 Most Consistent (Lowest Variance)'));
    const con = mostConsistentSubmitter(data);
    makeBarChart(conWrap, con.map(e => e.name), con.map(e => e.variance),
      { color: ACCENT, xLabel: 'Variance', title: 'Points variance (lower = more consistent)' });
    grid.appendChild(conWrap);

    const volWrap = el('div');
    volWrap.appendChild(el('h4', 'section-header', '🎢 Most Volatile (Highest Variance)'));
    const vol = mostVolatileSubmitter(data);
    makeBarChart(volWrap, vol.map(e => e.name), vol.map(e => e.variance),
      { color: '#e05252', xLabel: 'Variance', title: 'Points variance (higher = more volatile)' });
    grid.appendChild(volWrap);

    container.appendChild(grid);
  }
  container.appendChild(divider());

  // ── Most Improved ───────────────────────────────────────────────────────
  container.appendChild(sectionHeader('📈 Most Improved'));

  const isCumulative = data.leagueRounds && data.leagueRounds.length > 1;

  if (isCumulative) {
    // Current league vs. all combined
    const currentRds = [...data.leagueRounds[data.leagueRounds.length - 1]]
      .sort((a, b) => new Date(a.Created) - new Date(b.Created))
      .map(r => r.ID);

    const allRds = [...data.rounds]
      .sort((a, b) => new Date(a.Created) - new Date(b.Created))
      .map(r => r.ID);

    const curLabel   = data.leagueNames[data.leagueNames.length - 1];
    const nCur       = currentRds.length;
    const nAll       = allRds.length;

    const grid = el('div', 'grid-2');

    // Current league
    const curWrap = el('div');
    curWrap.appendChild(el('p', 'caption', `🗓️ Current League — ${curLabel}`));
    curWrap.appendChild(el('p', 'caption', `${nCur} rounds split into two halves (rounds 1–${Math.floor(nCur/2)} vs ${Math.floor(nCur/2)+1}–${nCur})`));
    const curImproved = halfVsHalf(data, currentRds);
    renderImprovedChart(curWrap, curImproved);
    grid.appendChild(curWrap);

    // All combined
    const allWrap = el('div');
    allWrap.appendChild(el('p', 'caption', '📚 Cumulative — all leagues'));
    allWrap.appendChild(el('p', 'caption', `${nAll} rounds split into two halves (rounds 1–${Math.floor(nAll/2)} vs ${Math.floor(nAll/2)+1}–${nAll})`));
    const allImproved = halfVsHalf(data, allRds);
    renderImprovedChart(allWrap, allImproved);
    grid.appendChild(allWrap);

    container.appendChild(grid);
  } else {
    const rdsOrdered = [...data.rounds]
      .sort((a, b) => new Date(a.Created) - new Date(b.Created))
      .map(r => r.ID);
    const n = rdsOrdered.length;
    container.appendChild(el('p', 'caption', `${n} rounds split into two halves (rounds 1–${Math.floor(n/2)} vs ${Math.floor(n/2)+1}–${n})`));
    const improved = halfVsHalf(data, rdsOrdered);
    renderImprovedChart(container, improved);
  }
  container.appendChild(divider());

  // ── Points Over Time ────────────────────────────────────────────────────
  container.appendChild(sectionHeader('📉 Points Over Time (per player)'));
  const { series, orderedRounds } = pointsOverTime(data);
  if (series.length > 0) {
    makeLineChart(container, orderedRounds, series, {
      title: 'Points scored each round',
      height: 380,
    });
  }
}

function renderImprovedChart(container, improved) {
  if (!improved.length) { container.appendChild(el('p', 'caption', 'Not enough data for improvement comparison.')); return; }

  makeGroupedBarChart(
    container,
    improved.map(e => e.player),
    [
      { label: 'First Half Avg',  data: improved.map(e => e.firstAvg),  color: '#888888' },
      { label: 'Second Half Avg', data: improved.map(e => e.secondAvg), color: ACCENT },
    ],
    { title: 'First half vs second half average', yLabel: 'Avg pts / round', height: 340 }
  );
  container.appendChild(htmlTable(
    ['Player', 'First Half Avg', 'Second Half Avg', 'Improvement'],
    improved.map(e => ({
      Player: e.player,
      'First Half Avg':  e.firstAvg,
      'Second Half Avg': e.secondAvg,
      Improvement:       e.improvement,
    }))
  ));
}
