/**
 * tabs/economy.js — 💰 Point Economy tab
 */

import {
  pointEconomySummary, pointsPerRound, voteDistribution,
  quantileShares, playerQuantileFlow, nameMap, pointsPerSubmission,
} from '../data.js';

import {
  el, sectionHeader, sectionCaption, divider,
  metricTile, makeBarChart, makeStackedBarChart, makeDonutChart,
  makeSankey, htmlTable,
  ACCENT, BUCKET_COLORS, PALETTE,
} from '../charts.js';

function hexToRgba(hex, alpha = 0.4) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const BUCKET_LABELS = ['Top 10%', '10–25%', '25–50%', 'Bottom 50%'];

export function renderEconomy(container, data) {
  container.appendChild(sectionHeader('💰 Point Economy'));

  // ── Summary metrics ─────────────────────────────────────────────────────
  const pe  = pointEconomySummary(data);
  const mRow = el('div', 'grid-5');
  [
    ['Total Points Distributed',  pe.total_points_distributed.toLocaleString()],
    ['Rounds Played',             pe.num_rounds],
    ['Avg Points / Round',        pe.avg_points_per_round],
    ['Avg Points / Submission',   pe.avg_points_per_submission],
    ['Min → Max Per Round',       `${pe.min_points_in_round} → ${pe.max_points_in_round}`],
  ].forEach(([label, value]) => mRow.appendChild(metricTile(label, value)));
  container.appendChild(mRow);
  container.appendChild(divider());

  // ── Points per round ────────────────────────────────────────────────────
  const ppr = pointsPerRound(data);
  makeBarChart(container,
    ppr.map(r => r.round),
    ppr.map(r => r.points),
    { color: ACCENT, horizontal: false, title: 'Total points distributed per round', xLabel: 'Round' }
  );
  container.appendChild(divider());

  // ── Vote distribution ───────────────────────────────────────────────────
  container.appendChild(sectionHeader('🎲 Vote Distribution'));
  const vd = voteDistribution(data);
  makeBarChart(container,
    vd.map(d => String(d.points)),
    vd.map(d => d.frequency),
    { color: '#ffd166', horizontal: false, title: 'How often each point value was used', xLabel: 'Points' }
  );
  container.appendChild(divider());

  // ── Quantile share section ──────────────────────────────────────────────
  container.appendChild(sectionHeader('📊 Vote Share by Quantile'));
  container.appendChild(sectionCaption(
    'Submissions in each round are ranked by points received and grouped into percentile bands. ' +
    'The chart shows what share of that round\'s total points each band captured.'
  ));

  // View toggle
  const viewRadios = el('div', 'view-toggle');
  const views = ['Per Round', 'Per Player', 'Overall (donut)', 'Player → Quantile (Sankey)'];
  views.forEach((v, i) => {
    const lbl = document.createElement('label');
    const inp = document.createElement('input');
    inp.type = 'radio'; inp.name = 'economy-view'; inp.value = v; if (i === 0) inp.checked = true;
    const span = document.createElement('span');
    span.textContent = v;
    lbl.appendChild(inp); lbl.appendChild(span);
    viewRadios.appendChild(lbl);
  });
  container.appendChild(viewRadios);

  const viewPanel = el('div');
  container.appendChild(viewPanel);

  viewRadios.addEventListener('change', (e) => {
    renderQuantileView(viewPanel, data, e.target.value);
  });
  renderQuantileView(viewPanel, data, 'Per Round');
}

function renderQuantileView(container, data, view) {
  container.innerHTML = '';

  const { rows, buckets } = quantileShares(data);

  if (view === 'Per Round') {
    const roundNames = [...new Set(rows.map(r => r.round))];
    const datasets = BUCKET_LABELS.map((label, i) => ({
      label,
      data:  roundNames.map(round => {
        const found = rows.find(r => r.round === round && r.quantile === label);
        return found ? found.pct : 0;
      }),
      color: BUCKET_COLORS[i],
    }));
    makeStackedBarChart(container, roundNames, datasets, {
      title:  '% of round\'s total points captured by each quantile',
      yLabel: '% of round points',
      maxY:   100,
    });

  } else if (view === 'Per Player') {
    const flow     = playerQuantileFlow(data);
    const names    = nameMap(data.competitors);
    const pps      = pointsPerSubmission(data.submissions, data.votes);

    // Order players by total points received
    const totals = new Map();
    pps.forEach(p => totals.set(p['Submitter ID'], (totals.get(p['Submitter ID']) || 0) + p.TotalPoints));
    const playerOrder = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => names.get(id) || id)
      .filter(n => flow.some(f => f.voterName === n));

    // Per-player % per bucket
    const playerTotals = new Map();
    flow.forEach(f => playerTotals.set(f.voterName, (playerTotals.get(f.voterName) || 0) + f.points));

    const datasets = BUCKET_LABELS.map((label, i) => ({
      label,
      data: playerOrder.map(player => {
        const pts = flow.find(f => f.voterName === player && f.bucket === label)?.points || 0;
        const tot = playerTotals.get(player) || 1;
        return Math.round((pts / tot) * 1000) / 10;
      }),
      color: BUCKET_COLORS[i],
    }));

    makeStackedBarChart(container, playerOrder, datasets, {
      title:  '% of each player\'s votes that went to each quantile band',
      yLabel: '% of votes cast',
      maxY:   100,
    });

  } else if (view === 'Overall (donut)') {
    const totByBucket = BUCKET_LABELS.map(label =>
      rows.filter(r => r.quantile === label).reduce((s, r) => s + r.points, 0)
    );
    makeDonutChart(container, BUCKET_LABELS, totByBucket, BUCKET_COLORS, {
      title: 'Overall share of all points by quantile', height: 360,
    });

  } else if (view === 'Player → Quantile (Sankey)') {
    const flow = playerQuantileFlow(data);
    const names = nameMap(data.competitors);
    const pps   = pointsPerSubmission(data.submissions, data.votes);

    const totals = new Map();
    pps.forEach(p => totals.set(p['Submitter ID'], (totals.get(p['Submitter ID']) || 0) + p.TotalPoints));
    const voterOrder = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => names.get(id) || id)
      .filter(n => flow.some(f => f.voterName === n));

    const nodes = [
      ...voterOrder.map(n    => ({ id: 'v_' + n, name: n, color: ACCENT })),
      ...BUCKET_LABELS.map((b, i) => ({ id: 'b_' + b, name: b, color: BUCKET_COLORS[i] })),
    ];
    const links = flow.map(f => ({
      source: 'v_' + f.voterName,
      target: 'b_' + f.bucket,
      value:  f.points,
      color:  hexToRgba(BUCKET_COLORS[BUCKET_LABELS.indexOf(f.bucket)] || '#888'),
    }));

    makeSankey(container, nodes, links, {
      width:  700,
      height: Math.max(400, voterOrder.length * 36 + 80),
    });
  }
}
