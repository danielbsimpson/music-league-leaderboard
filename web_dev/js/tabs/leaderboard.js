/**
 * tabs/leaderboard.js — 🏆 Leaderboard tab
 */

import {
  top3Winners, topPodiumAppearances, mostMisunderstood,
  playerRoundAverages, uniqueVotersPerPlayer, zeroPointsIncidents,
  pointsPerSubmission, nameMap,
} from '../data.js';

import {
  el, sectionHeader, sectionCaption, divider,
  statTile, tileGroup, makeBarChart, makeHeatmap, htmlTable, ACCENT,
} from '../charts.js';

const WINNER_STYLES  = [
  { bg: '#2a220a', icon: '🥇' }, { bg: '#1a2228', icon: '🥈' }, { bg: '#2a1a0a', icon: '🥉' },
  { bg: '#0a1e14', icon: '4️⃣' }, { bg: '#0d2019', icon: '5️⃣' },
];
const PODIUM_COLORS = ['#0a1e14','#0e2418','#152e1e','#1a3824','#1f3e28'];
const MISUND_COLORS = ['#2a0a0a','#301010','#361616','#3a1c1c','#3e2020'];
const AVG_COLORS    = ['#0a1626','#0e1c30','#12223a','#162842','#1a2e4a'];

export function renderLeaderboard(container, data) {
  // ── Stat tiles ──────────────────────────────────────────────────────────
  const winners = top3Winners(data, 5);
  const podium  = topPodiumAppearances(data, 3).slice(0, 5);
  const misund  = mostMisunderstood(data, 5);
  const avgs    = playerRoundAverages(data).slice(0, 5);

  const winTiles   = winners.map((w, i) => statTile(WINNER_STYLES[i].icon, w.name, `${w.points} pts`, WINNER_STYLES[i].bg));
  const podTiles   = podium.map((e, i)  => statTile('🎯', e.name, `${e.podium_appearances}× top-3`, PODIUM_COLORS[i]));
  const avgTiles   = avgs.map((e, i)    => statTile('📈', e.name, `${e.avg_points} avg · ${e.rounds} rounds`, AVG_COLORS[i]));
  const misTiles   = misund.map((e, i)  => statTile('💔', e.name, `${e.points} pts`, MISUND_COLORS[i]));

  const tileRow = el('div', 'grid-4');
  tileRow.appendChild(tileGroup('🏆 Top 5 Winners',           winTiles));
  tileRow.appendChild(tileGroup('🥇 Top Podium Appearances',  podTiles));
  tileRow.appendChild(tileGroup('📈 Top by Round Average',    avgTiles));
  tileRow.appendChild(tileGroup('😥 Most Misunderstood',      misTiles));
  container.appendChild(tileRow);
  container.appendChild(divider());

  // ── Total Points bar ────────────────────────────────────────────────────
  container.appendChild(sectionHeader('Total Points — All Competitors'));
  const names  = nameMap(data.competitors);
  const pps    = pointsPerSubmission(data.submissions, data.votes);
  const totals = new Map();
  pps.forEach(p => totals.set(p['Submitter ID'], (totals.get(p['Submitter ID']) || 0) + p.TotalPoints));
  const sortedTotals = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  makeBarChart(container,
    sortedTotals.map(([id]) => names.get(id) || id),
    sortedTotals.map(([, v]) => v),
    { color: ACCENT, xLabel: 'Points', title: 'Total Points — All Competitors' }
  );
  container.appendChild(divider());

  // ── Per-round heatmap ───────────────────────────────────────────────────
  container.appendChild(sectionHeader('📊 Points Per Round Heatmap'));
  {
    const roundNameMap = new Map(data.rounds.map(r => [r.ID, r.Name]));
    const roundOrder   = [...data.rounds]
      .sort((a, b) => new Date(a.Created) - new Date(b.Created))
      .map(r => r.Name);

    // Build player × round matrix
    const playerNames = sortedTotals.map(([id]) => names.get(id) || id);
    const playerIndex = new Map(playerNames.map((n, i) => [n, i]));

    const matrix = playerNames.map(() => roundOrder.map(() => 0));
    pps.forEach(p => {
      const playerName = names.get(p['Submitter ID']);
      const roundName  = roundNameMap.get(p['Round ID']);
      if (playerName && roundName) {
        const ri = playerIndex.get(playerName);
        const ci = roundOrder.indexOf(roundName);
        if (ri !== undefined && ci !== -1) matrix[ri][ci] = p.TotalPoints;
      }
    });

    makeHeatmap(container, playerNames, roundOrder, matrix, {
      title: 'Points earned per player per round',
      cellW: Math.max(30, Math.min(50, Math.floor(700 / Math.max(roundOrder.length, 1)))),
      cellH: 26,
      colorRange: ['#0a1a10', ACCENT],
    });
  }
  container.appendChild(divider());

  // ── Zero points incidents ───────────────────────────────────────────────
  container.appendChild(sectionHeader('0️⃣ Zero Points Incidents'));
  const zpi = zeroPointsIncidents(data);
  const zMetric = el('p', 'caption', `Total zero-point rounds across all players: ${zpi.total}`);
  container.appendChild(zMetric);
  if (zpi.byPerson.length > 0) {
    makeBarChart(container,
      zpi.byPerson.map(e => e.name),
      zpi.byPerson.map(e => e.zero_rounds),
      { color: '#e05252', xLabel: 'Zero-Point Rounds', title: 'Zero-point rounds per player' }
    );
  }
  container.appendChild(divider());

  // ── Average Points Per Round ────────────────────────────────────────────
  container.appendChild(sectionHeader('📈 Average Points Per Round'));
  const avgAll = playerRoundAverages(data);
  makeBarChart(container,
    avgAll.map(e => e.name),
    avgAll.map(e => e.avg_points),
    { color: '#7ec8e3', xLabel: 'Avg Points / Round', title: 'Average Points Per Round — All Competitors' }
  );
  container.appendChild(htmlTable(
    ['Rank', 'Player', 'Avg Pts / Round', 'Rounds'],
    avgAll.map((e, i) => ({ Rank: i + 1, Player: e.name, 'Avg Pts / Round': e.avg_points, Rounds: e.rounds }))
  ));
  container.appendChild(divider());

  // ── Unique Voters ───────────────────────────────────────────────────────
  container.appendChild(sectionHeader('👥 Unique Voters'));
  container.appendChild(sectionCaption(
    'Distinct voters who gave each player ≥1 point, counted per round.'
  ));
  const { pivot, totals: uvTotals, orderedRounds } = uniqueVotersPerPlayer(data);
  makeBarChart(container,
    uvTotals.map(e => e.Player),
    uvTotals.map(e => e.TotalUniqueVoters),
    { color: '#c77dff', xLabel: 'Total Unique Voters', title: 'Total Unique Voters Per Player (summed across rounds)' }
  );

  // Unique voters heatmap
  container.appendChild(sectionHeader('🗓️ Unique Voters Per Round Heatmap'));
  const uvPlayers = uvTotals.map(e => e.Player);
  const uvMatrix  = uvPlayers.map(player => {
    const rowMap = pivot.get(player) || new Map();
    return orderedRounds.map(col => rowMap.get(col) || 0);
  });
  makeHeatmap(container, uvPlayers, orderedRounds, uvMatrix, {
    title: 'Unique voters per player per round',
    cellW: Math.max(30, Math.min(50, Math.floor(700 / Math.max(orderedRounds.length, 1)))),
    cellH: 26,
    colorRange: ['#0e0a1e', '#c77dff'],
  });
}
