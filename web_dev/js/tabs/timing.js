/**
 * tabs/timing.js — ⏱️ Timing tab
 */

import {
  submissionTimingStats, voteTimingStats,
  timingPerRound,
} from '../data.js';

import {
  el, sectionHeader, sectionCaption, divider,
  recordTile, makeBarChart, makeScatter, htmlTable,
  ACCENT, PALETTE,
} from '../charts.js';

export function renderTiming(container, data) {
  container.appendChild(sectionHeader('⏱️ Submission & Voting Timing'));
  container.appendChild(sectionCaption(
    'Timings are relative to each round\'s inferred deadline (= latest submission/vote in that round).'
  ));

  // submissionTimingStats returns array sorted asc by avg_hours_before_deadline
  // (lowest = latest submitter, highest = earliest)
  const subStats  = submissionTimingStats(data);  // [{player_name, avg_hours_before_deadline, min_hours_before_deadline, max_hours_before_deadline, rounds_submitted}]
  // voteTimingStats returns array sorted asc by avg_hours_after_playlist
  const voteStats = voteTimingStats(data);         // [{player_name, avg_hours_after_playlist, avg_hours_before_vote_deadline, rounds_voted}]

  // ── Record tiles: find global extremes ─────────────────────────────────
  const perRound  = timingPerRound(data);
  const subRows   = perRound.filter(e => e.sub_hours_before_deadline  != null);
  const voteRows  = perRound.filter(e => e.vote_hours_before_deadline != null);

  const fastest_sub  = subRows.length  ? subRows.reduce((a, b)  => b.sub_hours_before_deadline  > a.sub_hours_before_deadline  ? b : a) : null;
  const slowest_sub  = subRows.length  ? subRows.reduce((a, b)  => b.sub_hours_before_deadline  < a.sub_hours_before_deadline  ? b : a) : null;
  const fastest_vote = voteRows.length ? voteRows.reduce((a, b) => b.vote_hours_before_deadline > a.vote_hours_before_deadline ? b : a) : null;
  const slowest_vote = voteRows.length ? voteRows.reduce((a, b) => b.vote_hours_before_deadline < a.vote_hours_before_deadline ? b : a) : null;

  const rRow = el('div', 'grid-4');
  if (fastest_sub)  rRow.appendChild(recordTile('⚡',    fastest_sub.player_name,  `${Math.round(fastest_sub.sub_hours_before_deadline)}h before deadline`,  fastest_sub.round_name,  '#0a1e14', ACCENT));
  if (slowest_sub)  rRow.appendChild(recordTile('🐢',    slowest_sub.player_name,  `${Math.round(slowest_sub.sub_hours_before_deadline)}h before deadline`,  slowest_sub.round_name,  '#2a0e0e', '#e05252'));
  if (fastest_vote) rRow.appendChild(recordTile('⚡️🗳️', fastest_vote.player_name, `${Math.round(fastest_vote.vote_hours_before_deadline)}h before deadline`, fastest_vote.round_name, '#0a1814', ACCENT));
  if (slowest_vote) rRow.appendChild(recordTile('🐌🗳️', slowest_vote.player_name, `${Math.round(slowest_vote.vote_hours_before_deadline < 0 ? 0 : slowest_vote.vote_hours_before_deadline)}h before deadline`, slowest_vote.round_name, '#1e0a2e', '#b47bff'));
  container.appendChild(rRow);
  container.appendChild(divider());

  // ── Submission timing bar ───────────────────────────────────────────────
  container.appendChild(sectionHeader('📅 Submission Timing — Hours Before Deadline'));
  const subSorted = [...subStats].sort((a, b) => b.avg_hours_before_deadline - a.avg_hours_before_deadline);
  makeBarChart(container,
    subSorted.map(e => e.player_name),
    subSorted.map(e => e.avg_hours_before_deadline),
    { color: '#ffd166', xLabel: 'Avg Hours Before Deadline', title: 'Average submission lead time per player (higher = earlier)' }
  );
  container.appendChild(htmlTable(
    ['Player', 'Avg Hrs Before Deadline', 'Min Hrs', 'Max Hrs', 'Submissions'],
    subSorted.map(e => ({
      Player: e.player_name,
      'Avg Hrs Before Deadline': e.avg_hours_before_deadline,
      'Min Hrs': e.min_hours_before_deadline,
      'Max Hrs': e.max_hours_before_deadline,
      Submissions: e.rounds_submitted,
    }))
  ));
  container.appendChild(divider());

  // ── Vote timing: fastest listeners & last-minute voters ────────────────
  container.appendChild(sectionHeader('🗳️ Vote Timing'));
  {
    const grid = el('div', 'grid-2');

    // Fastest listeners = highest avg_hours_before_vote_deadline (voted furthest ahead of deadline)
    const fastSorted = [...voteStats].sort((a, b) => b.avg_hours_before_vote_deadline - a.avg_hours_before_vote_deadline);
    const fastWrap = el('div');
    fastWrap.appendChild(el('h4', 'section-header', '⚡ Fastest Listeners'));
    makeBarChart(fastWrap,
      fastSorted.map(e => e.player_name),
      fastSorted.map(e => e.avg_hours_before_vote_deadline),
      { color: ACCENT, xLabel: 'Avg Hrs Before Vote Deadline' });
    grid.appendChild(fastWrap);

    // Latest voters = lowest avg_hours_before_vote_deadline
    const lateSorted = [...voteStats].sort((a, b) => a.avg_hours_before_vote_deadline - b.avg_hours_before_vote_deadline);
    const lateWrap = el('div');
    lateWrap.appendChild(el('h4', 'section-header', '⏰ Latest Deadline Voters'));
    makeBarChart(lateWrap,
      lateSorted.map(e => e.player_name),
      lateSorted.map(e => e.avg_hours_before_vote_deadline),
      { color: '#e05252', xLabel: 'Avg Hrs Before Vote Deadline' });
    grid.appendChild(lateWrap);

    container.appendChild(grid);
  }
  container.appendChild(htmlTable(
    ['Player', 'Avg Hrs After Playlist', 'Avg Hrs Before Vote Deadline', 'Votes Cast'],
    voteStats.map(e => ({
      Player: e.player_name,
      'Avg Hrs After Playlist': e.avg_hours_after_playlist,
      'Avg Hrs Before Vote Deadline': e.avg_hours_before_vote_deadline,
      'Votes Cast': e.rounds_voted,
    }))
  ));
  container.appendChild(divider());

  // ── Per-round scatter ───────────────────────────────────────────────────
  container.appendChild(sectionHeader('🔬 Per-Round Scatter: Submission vs Vote Timing'));
  container.appendChild(sectionCaption(
    'Each dot is one round for one player. X = submission lead time (hrs), Y = vote lead time (hrs).'
  ));

  // Combine sub rows and vote rows per (player, round) for the scatter
  const combMap = new Map();
  perRound.forEach(e => {
    if (!e.player_name || !e.round_name) return;
    const key = `${e.player_name}|||${e.round_name}`;
    if (!combMap.has(key)) combMap.set(key, { player: e.player_name, round: e.round_name, sub: null, vote: null });
    const rec = combMap.get(key);
    if (e.sub_hours_before_deadline  != null) rec.sub  = e.sub_hours_before_deadline;
    if (e.vote_hours_before_deadline != null) rec.vote = e.vote_hours_before_deadline;
  });
  const combined     = [...combMap.values()].filter(e => e.sub != null && e.vote != null);
  const playerNames  = [...new Set(combined.map(e => e.player))];
  const seriesArr    = playerNames.map((player, i) => ({
    player,
    color:  PALETTE[i % PALETTE.length],
    points: combined
      .filter(e => e.player === player)
      .map(e => ({ x: e.sub, y: e.vote, label: e.round })),
  }));

  if (seriesArr.some(s => s.points.length > 0)) {
    makeScatter(container, seriesArr, {
      width:        680,
      height:       400,
      xLabel:       'Submission Lead Time (hrs before deadline)',
      yLabel:       'Vote Lead Time (hrs before deadline)',
      title:        'Submission vs Vote Timing by Player per Round',
      showZeroLine: true,
    });
  } else {
    container.appendChild(el('p', 'caption', 'Not enough combined submission + vote timing data.'));
  }
}
