/**
 * data.js — All league data loading and statistics computation.
 * Ported from music_league_stats.py.
 *
 * Exports:
 *   loadLeagueData(dirs, basePath)  -> LeagueData object
 *   generateReportText(data)        -> string
 *   formatName(fullName)            -> string
 *   nameMap(competitors)            -> Map<id, displayName>
 *   pointsPerSubmission(subs, votes)
 *   voterCountPerSubmission(votes)
 *   top3Winners(data, n)
 *   topPodiumAppearances(data, n)
 *   mostMisunderstood(data, n)
 *   playerRoundAverages(data)
 *   uniqueVotersPerPlayer(data)
 *   mostUniversallyLiked(data, n)
 *   biggestFans(data, targetName)
 *   leastCompatible(data, targetName)
 *   mostGenerousVoter(data)
 *   mostConsistentSubmitter(data)
 *   mostVolatileSubmitter(data)
 *   biggestBlowout(data)
 *   mostTalkatativeCommenter(data)
 *   funniestComment(data)
 *   pointEconomySummary(data)
 *   zeroPointsIncidents(data)
 *   top3CommentWinners(data, n)
 *   mostSubmittedSongs(data, n)
 *   mostArtistAppearances(data, n)
 *   submissionTimingStats(data)
 *   voteTimingStats(data)
 *   timingPerRound(data)
 *   gatherHeadlineMetrics(data)
 */

// ── CSV loading ───────────────────────────────────────────────────────────

function parseCsv(text) {
  const result = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  });
  return result.data;
}

async function fetchCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  return parseCsv(await res.text());
}

async function loadSingleDir(dir, basePath) {
  const base = basePath.replace(/\/?$/, '/') + dir + '/';
  const [competitors, rounds, submissions, votes] = await Promise.all([
    fetchCsv(base + 'competitors.csv'),
    fetchCsv(base + 'rounds.csv'),
    fetchCsv(base + 'submissions.csv'),
    fetchCsv(base + 'votes.csv'),
  ]);

  // Normalise column names
  submissions.forEach(s => {
    if ('Spotify URI' in s) { s.SpotifyURI = s['Spotify URI']; delete s['Spotify URI']; }
    else if (!s.SpotifyURI) s.SpotifyURI = '';
  });
  votes.forEach(v => {
    if ('Spotify URI' in v) { v.SpotifyURI = v['Spotify URI']; delete v['Spotify URI']; }
    if ('Points Assigned' in v) { v.Points = v['Points Assigned']; delete v['Points Assigned']; }
    v.Points = Number(v.Points || 0);
  });

  return { competitors, rounds, submissions, votes };
}

export async function loadLeagueData(dirs, basePath = '../data/') {
  const allDfs = await Promise.all(dirs.map(d => loadSingleDir(d, basePath)));

  // De-duplicate competitors by ID
  const compMap = new Map();
  allDfs.forEach(d => d.competitors.forEach(c => { if (!compMap.has(c.ID)) compMap.set(c.ID, c); }));
  const competitors = [...compMap.values()];

  // De-duplicate rounds by ID
  const roundMap = new Map();
  allDfs.forEach(d => d.rounds.forEach(r => { if (!roundMap.has(r.ID)) roundMap.set(r.ID, r); }));
  const rounds = [...roundMap.values()];

  // De-duplicate submissions by (SpotifyURI, Round ID)
  const subMap = new Map();
  allDfs.forEach(d => d.submissions.forEach(s => {
    const key = `${s.SpotifyURI}|||${s['Round ID']}`;
    if (!subMap.has(key)) subMap.set(key, s);
  }));
  const submissions = [...subMap.values()];

  // De-duplicate votes by (SpotifyURI, Voter ID, Round ID)
  const voteMap = new Map();
  allDfs.forEach(d => d.votes.forEach(v => {
    const key = `${v.SpotifyURI}|||${v['Voter ID']}|||${v['Round ID']}`;
    if (!voteMap.has(key)) voteMap.set(key, v);
  }));
  const votes = [...voteMap.values()];

  return {
    competitors,
    rounds,
    submissions,
    votes,
    leagueRounds: allDfs.map(d => d.rounds),
    leagueNames:  dirs.map(d => d.split('/').pop()),
  };
}

// ── Name helpers ──────────────────────────────────────────────────────────

export function formatName(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(/[\s.]+/).filter(p => p);
  if (parts.length < 2) return fullName.charAt(0).toUpperCase() + fullName.slice(1);
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase() +
    ' ' + parts[parts.length - 1][0].toUpperCase() + '.';
}

export function nameMap(competitors) {
  const m = new Map();
  competitors.forEach(c => m.set(c.ID, formatName(c.Name)));
  return m;
}

// ── Core computation helpers ──────────────────────────────────────────────

export function pointsPerSubmission(submissions, votes) {
  // Sum votes per (Round ID, SpotifyURI)
  const pts = new Map();
  for (const v of votes) {
    const key = `${v['Round ID']}|||${v.SpotifyURI}`;
    pts.set(key, (pts.get(key) || 0) + Number(v.Points || 0));
  }
  return submissions.map(s => ({
    ...s,
    TotalPoints: pts.get(`${s['Round ID']}|||${s.SpotifyURI}`) || 0,
  }));
}

export function voterCountPerSubmission(votes) {
  // Count distinct voters per (Round ID, SpotifyURI) where Points > 0
  const vc = new Map();
  for (const v of votes) {
    if (Number(v.Points) <= 0) continue;
    const key = `${v['Round ID']}|||${v.SpotifyURI}`;
    if (!vc.has(key)) vc.set(key, new Set());
    vc.get(key).add(v['Voter ID']);
  }
  const result = new Map();
  vc.forEach((voters, key) => result.set(key, voters.size));
  return result;
}

// ── Leaderboard stats ─────────────────────────────────────────────────────

export function top3Winners(data, topN = 5) {
  const names = nameMap(data.competitors);
  const pps   = pointsPerSubmission(data.submissions, data.votes);
  const totals = new Map();
  pps.forEach(p => {
    const id = p['Submitter ID'];
    totals.set(id, (totals.get(id) || 0) + p.TotalPoints);
  });
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id, pts], i) => ({ rank: i + 1, name: names.get(id) || id, points: pts }));
}

export function topPodiumAppearances(data, topN = 3) {
  const names = nameMap(data.competitors);
  const pps   = pointsPerSubmission(data.submissions, data.votes);
  const appearances = new Map();

  // Group pps by Round ID
  const byRound = new Map();
  pps.forEach(p => {
    if (!byRound.has(p['Round ID'])) byRound.set(p['Round ID'], []);
    byRound.get(p['Round ID']).push(p);
  });

  for (const [, entries] of byRound) {
    const sorted = [...entries].sort((a, b) => b.TotalPoints - a.TotalPoints);
    sorted.slice(0, topN).forEach(e => {
      const id = e['Submitter ID'];
      appearances.set(id, (appearances.get(id) || 0) + 1);
    });
  }

  return [...appearances.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ name: names.get(id) || id, podium_appearances: count }));
}

export function mostMisunderstood(data, topN = 5) {
  const names = nameMap(data.competitors);
  const pps   = pointsPerSubmission(data.submissions, data.votes);

  // Identify submitters in the most recent league
  let recentSubmitters;
  if (data.leagueRounds && data.leagueRounds.length > 1) {
    let latestDate = 0;
    let mostRecentRoundIds = null;
    data.leagueRounds.forEach(lr => {
      const roundIds = new Set(lr.map(r => r.ID));
      const latest = data.submissions
        .filter(s => roundIds.has(s['Round ID']))
        .reduce((max, s) => Math.max(max, new Date(s.Created).getTime()), 0);
      if (latest > latestDate) { latestDate = latest; mostRecentRoundIds = roundIds; }
    });
    recentSubmitters = new Set(
      data.submissions.filter(s => mostRecentRoundIds?.has(s['Round ID'])).map(s => s['Submitter ID'])
    );
  } else {
    recentSubmitters = new Set(data.submissions.map(s => s['Submitter ID']));
  }

  const totals = new Map();
  pps.forEach(p => {
    const id = p['Submitter ID'];
    if (recentSubmitters.has(id)) totals.set(id, (totals.get(id) || 0) + p.TotalPoints);
  });

  return [...totals.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, topN)
    .map(([id, pts], i) => ({ rank: i + 1, name: names.get(id) || id, points: pts }));
}

export function playerRoundAverages(data) {
  const names = nameMap(data.competitors);
  const pps   = pointsPerSubmission(data.submissions, data.votes);
  const sums  = new Map();  // id -> {sum, count}
  pps.forEach(p => {
    const id = p['Submitter ID'];
    if (!sums.has(id)) sums.set(id, { sum: 0, count: 0 });
    const e = sums.get(id);
    e.sum   += p.TotalPoints;
    e.count += 1;
  });
  return [...sums.entries()]
    .map(([id, { sum, count }]) => ({
      name:       names.get(id) || id,
      avg_points: Math.round((sum / count) * 100) / 100,
      rounds:     count,
    }))
    .sort((a, b) => b.avg_points - a.avg_points);
}

export function uniqueVotersPerPlayer(data) {
  const names     = nameMap(data.competitors);
  const uriToSub  = new Map(data.submissions.map(s => [s.SpotifyURI, s['Submitter ID']]));
  const roundName = new Map(data.rounds.map(r => [r.ID, r.Name]));
  const roundOrder = [...data.rounds]
    .sort((a, b) => new Date(a.Created) - new Date(b.Created))
    .map(r => r.Name);

  // Count unique voters per (submitter, round)
  const perRound = new Map(); // key: `${submitterId}|||${roundId}` -> Set<voterId>
  for (const v of data.votes) {
    if (Number(v.Points) <= 0) continue;
    const submitterId = uriToSub.get(v.SpotifyURI);
    if (!submitterId) continue;
    if (submitterId === v['Voter ID']) continue; // no self-votes
    const key = `${submitterId}|||${v['Round ID']}`;
    if (!perRound.has(key)) perRound.set(key, new Set());
    perRound.get(key).add(v['Voter ID']);
  }

  // Build pivot: player -> round -> uniqueVoters
  const pivot = new Map();
  const allRoundNames = new Set();
  for (const [key, voters] of perRound) {
    const [submitterId, roundId] = key.split('|||');
    const playerName = names.get(submitterId) || submitterId;
    const rName      = roundName.get(roundId)  || roundId;
    allRoundNames.add(rName);
    if (!pivot.has(playerName)) pivot.set(playerName, new Map());
    pivot.get(playerName).set(rName, voters.size);
  }

  // Build totals
  const totals = [];
  for (const [player, rounds] of pivot) {
    let total = 0;
    rounds.forEach(v => total += v);
    totals.push({ Player: player, TotalUniqueVoters: total });
  }
  totals.sort((a, b) => b.TotalUniqueVoters - a.TotalUniqueVoters);

  // Ordered round names
  const orderedRounds = roundOrder.filter(r => allRoundNames.has(r));

  return { pivot, totals, orderedRounds };
}

export function zeroPointsIncidents(data) {
  const names = nameMap(data.competitors);
  const pps   = pointsPerSubmission(data.submissions, data.votes);
  const zeros = pps.filter(p => p.TotalPoints === 0);
  const byPerson = new Map();
  zeros.forEach(p => byPerson.set(p['Submitter ID'], (byPerson.get(p['Submitter ID']) || 0) + 1));
  return {
    total: zeros.length,
    byPerson: [...byPerson.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => ({ name: names.get(id) || id, zero_rounds: n })),
  };
}

// ── Song stats ─────────────────────────────────────────────────────────────

export function mostUniversallyLiked(data, topN = 10) {
  const names = nameMap(data.competitors);
  const pps   = pointsPerSubmission(data.submissions, data.votes);
  const vc    = voterCountPerSubmission(data.votes);

  const enriched = pps.map(p => ({
    title:        p.Title || '',
    artist:       p['Artist(s)'] || '',
    submitted_by: names.get(p['Submitter ID']) || p['Submitter ID'],
    total_points: p.TotalPoints,
    voter_count:  vc.get(`${p['Round ID']}|||${p.SpotifyURI}`) || 0,
  }));

  const byPoints = [...enriched].sort((a, b) => b.total_points - a.total_points).slice(0, topN);
  const byVoters = [...enriched].sort((a, b) => b.voter_count  - a.voter_count).slice(0, topN);

  return { byPoints, byVoters };
}

export function biggestBlowout(data) {
  const names = nameMap(data.competitors);
  const pps   = pointsPerSubmission(data.submissions, data.votes);
  const byRound = new Map();
  pps.forEach(p => {
    if (!byRound.has(p['Round ID'])) byRound.set(p['Round ID'], []);
    byRound.get(p['Round ID']).push(p);
  });

  const roundName = new Map(data.rounds.map(r => [r.ID, r.Name]));
  const results = [];
  for (const [rid, entries] of byRound) {
    const sorted = [...entries].sort((a, b) => b.TotalPoints - a.TotalPoints);
    if (sorted.length < 2) continue;
    const [first, second] = sorted;
    results.push({
      round:          roundName.get(rid) || rid,
      winner:         names.get(first['Submitter ID'])  || first['Submitter ID'],
      winner_song:    first.Title || '',
      winner_points:  first.TotalPoints,
      second_place:   names.get(second['Submitter ID']) || second['Submitter ID'],
      second_points:  second.TotalPoints,
      margin:         first.TotalPoints - second.TotalPoints,
    });
  }
  return results.sort((a, b) => b.margin - a.margin);
}

export function mostSubmittedSongs(data, topN = 10) {
  const counts = new Map(); // `${title}|||${artist}` -> count
  data.submissions.forEach(s => {
    const key = `${s.Title || ''}|||${s['Artist(s)'] || ''}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([key, count], i) => {
      const [title, artist] = key.split('|||');
      return { rank: i + 1, title, artist, count };
    });
}

export function mostArtistAppearances(data, topN = 10) {
  const counts = new Map();
  data.submissions.forEach(s => {
    const artistStr = s['Artist(s)'] || '';
    artistStr.split(',').map(a => a.trim()).filter(Boolean).forEach(a => {
      counts.set(a, (counts.get(a) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([artist, count], i) => ({ rank: i + 1, artist, count }));
}

// ── Fan Map stats ─────────────────────────────────────────────────────────

export function biggestFans(data, targetName) {
  const names   = nameMap(data.competitors);
  const invMap  = new Map([...names.entries()].map(([k, v]) => [v, k]));
  const targetId = invMap.get(targetName);
  if (!targetId) return [];

  const targetTracks = new Set(
    data.submissions.filter(s => s['Submitter ID'] === targetId).map(s => s.SpotifyURI)
  );
  const totals = new Map();
  data.votes.forEach(v => {
    if (!targetTracks.has(v.SpotifyURI)) return;
    if (v['Voter ID'] === targetId) return;
    const n = Number(v.Points || 0);
    totals.set(v['Voter ID'], (totals.get(v['Voter ID']) || 0) + n);
  });
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, pts]) => ({ voter: names.get(id) || id, points_given: pts }));
}

export function leastCompatible(data, targetName) {
  return biggestFans(data, targetName).sort((a, b) => a.points_given - b.points_given);
}

export function allVotesMatrix(data) {
  const names  = nameMap(data.competitors);
  const uriToSub = new Map(data.submissions.map(s => [s.SpotifyURI, s['Submitter ID']]));
  const edges  = new Map(); // `voterName|||receiverName` -> total points

  data.votes.forEach(v => {
    const receiverId = uriToSub.get(v.SpotifyURI);
    if (!receiverId) return;
    if (receiverId === v['Voter ID']) return;
    const vName = names.get(v['Voter ID']) || v['Voter ID'];
    const rName = names.get(receiverId)     || receiverId;
    const key   = `${vName}|||${rName}`;
    edges.set(key, (edges.get(key) || 0) + Number(v.Points || 0));
  });

  return [...edges.entries()].map(([key, pts]) => {
    const [voterName, receiverName] = key.split('|||');
    return { voterName, receiverName, points: pts };
  });
}

export function mostGenerousVoter(data) {
  const names     = nameMap(data.competitors);
  const uriToSub  = new Map(data.submissions.map(s => [s.SpotifyURI, s['Submitter ID']]));

  // spread per (voterId, roundId)
  const spread = new Map(); // `voterId|||roundId` -> Set<receiverId>
  data.votes.forEach(v => {
    if (Number(v.Points) <= 0) return;
    const recv = uriToSub.get(v.SpotifyURI);
    if (!recv) return;
    const key = `${v['Voter ID']}|||${v['Round ID']}`;
    if (!spread.has(key)) spread.set(key, new Set());
    spread.get(key).add(recv);
  });

  // avg distinct recipients per voter
  const voterCounts = new Map();  // voterId -> { sum, rounds }
  spread.forEach((recvSet, key) => {
    const voterId = key.split('|||')[0];
    if (!voterCounts.has(voterId)) voterCounts.set(voterId, { sum: 0, rounds: 0 });
    const e = voterCounts.get(voterId);
    e.sum    += recvSet.size;
    e.rounds += 1;
  });

  return [...voterCounts.entries()]
    .map(([id, { sum, rounds }]) => ({
      voter: names.get(id) || id,
      avg_distinct_recipients_per_round: Math.round((sum / rounds) * 100) / 100,
    }))
    .sort((a, b) => b.avg_distinct_recipients_per_round - a.avg_distinct_recipients_per_round);
}

// ── Trends stats ──────────────────────────────────────────────────────────

export function mostConsistentSubmitter(data) {
  const names = nameMap(data.competitors);
  const pps   = pointsPerSubmission(data.submissions, data.votes);

  // Variance: group points by submitter
  const grouped = new Map();
  pps.forEach(p => {
    const id = p['Submitter ID'];
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(p.TotalPoints);
  });

  const result = [];
  grouped.forEach((pts, id) => {
    if (pts.length < 2) return;
    const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
    const variance = pts.reduce((a, b) => a + (b - mean) ** 2, 0) / (pts.length - 1);
    result.push({ name: names.get(id) || id, variance: Math.round(variance * 100) / 100 });
  });

  return result.sort((a, b) => a.variance - b.variance);
}

export function mostVolatileSubmitter(data) {
  return [...mostConsistentSubmitter(data)].reverse();
}

export function halfVsHalf(data, roundIds) {
  const names = nameMap(data.competitors);
  const pps   = pointsPerSubmission(data.submissions, data.votes);
  const mid   = Math.floor(roundIds.length / 2);
  const firstIds  = new Set(roundIds.slice(0, mid));
  const secondIds = new Set(roundIds.slice(mid));

  const firstSums  = new Map();  // id -> {sum, count}
  const secondSums = new Map();
  pps.forEach(p => {
    const id  = p['Submitter ID'];
    const rid = p['Round ID'];
    if (firstIds.has(rid)) {
      if (!firstSums.has(id)) firstSums.set(id, { sum: 0, count: 0 });
      firstSums.get(id).sum   += p.TotalPoints;
      firstSums.get(id).count += 1;
    }
    if (secondIds.has(rid)) {
      if (!secondSums.has(id)) secondSums.set(id, { sum: 0, count: 0 });
      secondSums.get(id).sum   += p.TotalPoints;
      secondSums.get(id).count += 1;
    }
  });

  const allIds = new Set([...firstSums.keys(), ...secondSums.keys()]);
  return [...allIds]
    .map(id => {
      const f = firstSums.get(id);
      const s = secondSums.get(id);
      if (!f || !s) return null;
      const firstAvg  = Math.round((f.sum / f.count) * 100) / 100;
      const secondAvg = Math.round((s.sum / s.count) * 100) / 100;
      return {
        player:      names.get(id) || id,
        firstAvg,
        secondAvg,
        improvement: Math.round((secondAvg - firstAvg) * 100) / 100,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.improvement - a.improvement);
}

export function pointsOverTime(data) {
  const names  = nameMap(data.competitors);
  const pps    = pointsPerSubmission(data.submissions, data.votes);
  const roundsOrdered = [...data.rounds]
    .sort((a, b) => new Date(a.Created) - new Date(b.Created));
  const roundName = new Map(data.rounds.map(r => [r.ID, r.Name]));
  const orderedNames = roundsOrdered.map(r => r.Name);

  // Group points by (player, roundName)
  const byPlayerRound = new Map(); // playerName -> Map<roundName, pts>
  pps.forEach(p => {
    const player = names.get(p['Submitter ID']) || p['Submitter ID'];
    const rName  = roundName.get(p['Round ID']) || p['Round ID'];
    if (!byPlayerRound.has(player)) byPlayerRound.set(player, new Map());
    byPlayerRound.get(player).set(rName, p.TotalPoints);
  });

  // Convert to series: [{player, rounds: [{round, points}]}]
  const series = [];
  byPlayerRound.forEach((roundMap, player) => {
    series.push({
      player,
      rounds: orderedNames
        .filter(rn => roundMap.has(rn))
        .map(rn => ({ round: rn, points: roundMap.get(rn) })),
    });
  });

  return { series, orderedRounds: orderedNames };
}

// ── Comments stats ────────────────────────────────────────────────────────

export function mostTalkatativeCommenter(data) {
  const names  = nameMap(data.competitors);

  const voteComments = new Map();
  data.votes.forEach(v => {
    if (v.Comment && v.Comment.trim()) {
      const id = v['Voter ID'];
      voteComments.set(id, (voteComments.get(id) || 0) + 1);
    }
  });

  const subComments = new Map();
  data.submissions.forEach(s => {
    if (s.Comment && s.Comment.trim()) {
      const id = s['Submitter ID'];
      subComments.set(id, (subComments.get(id) || 0) + 1);
    }
  });

  return [...new Set([...data.competitors.map(c => c.ID)])]
    .map(id => {
      const vc = voteComments.get(id) || 0;
      const sc = subComments.get(id)  || 0;
      return { name: names.get(id) || id, vote_comments: vc, sub_comments: sc, total: vc + sc };
    })
    .sort((a, b) => b.total - a.total);
}

export function top3CommentWinners(data, topN = null) {
  const names   = nameMap(data.competitors);
  const uriToSub = new Map(data.submissions.map(s => [s.SpotifyURI, s['Submitter ID']]));

  const counts = new Map();
  data.votes.forEach(v => {
    if (!v.Comment || !v.Comment.trim()) return;
    const recv = uriToSub.get(v.SpotifyURI);
    if (recv) counts.set(recv, (counts.get(recv) || 0) + 1);
  });

  const all = data.competitors.map(c => ({
    rank: 0,
    name: names.get(c.ID) || c.ID,
    comments_received: counts.get(c.ID) || 0,
  })).sort((a, b) => b.comments_received - a.comments_received);

  const limited = topN ? all.slice(0, topN) : all;
  return limited.map((e, i) => ({ ...e, rank: i + 1 }));
}

export function funniestComment(data) {
  const names  = nameMap(data.competitors);
  const uriToSong = new Map(
    data.submissions.map(s => [s.SpotifyURI, `${s.Title || ''} – ${s['Artist(s)'] || ''}`])
  );

  const result = [];
  data.votes.forEach(v => {
    if (v.Comment && v.Comment.trim()) {
      result.push({
        author:  names.get(v['Voter ID']) || v['Voter ID'],
        source:  'vote',
        context: uriToSong.get(v.SpotifyURI) || v.SpotifyURI,
        comment: v.Comment,
      });
    }
  });
  data.submissions.forEach(s => {
    if (s.Comment && s.Comment.trim()) {
      result.push({
        author:  names.get(s['Submitter ID']) || s['Submitter ID'],
        source:  'submission',
        context: `${s.Title || ''} – ${s['Artist(s)'] || ''}`,
        comment: s.Comment,
      });
    }
  });
  return result;
}

export function topCommentedSongs(data, topN = 5) {
  const names    = nameMap(data.competitors);
  const uriToSub = new Map(data.submissions.map(s => [s.SpotifyURI, s['Submitter ID']]));
  const uriToSong = new Map(
    data.submissions.map(s => [s.SpotifyURI, `${s.Title || ''} – ${s['Artist(s)'] || ''}`])
  );

  const counts = new Map();
  const commentsByUri = new Map();
  data.votes.forEach(v => {
    if (!v.Comment || !v.Comment.trim()) return;
    const uri = v.SpotifyURI;
    counts.set(uri, (counts.get(uri) || 0) + 1);
    if (!commentsByUri.has(uri)) commentsByUri.set(uri, []);
    commentsByUri.get(uri).push({ author: names.get(v['Voter ID']) || v['Voter ID'], comment: v.Comment });
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([uri, count]) => ({
      uri,
      song:      uriToSong.get(uri) || uri,
      submitter: names.get(uriToSub.get(uri)) || uriToSub.get(uri) || '?',
      count,
      comments:  commentsByUri.get(uri) || [],
    }));
}

// ── Economy stats ─────────────────────────────────────────────────────────

export function pointEconomySummary(data) {
  const pps   = pointsPerSubmission(data.submissions, data.votes);
  const byRound = new Map();
  pps.forEach(p => byRound.set(p['Round ID'], (byRound.get(p['Round ID']) || 0) + p.TotalPoints));
  const totals  = [...byRound.values()];
  const total   = totals.reduce((a, b) => a + b, 0);
  return {
    total_points_distributed: total,
    num_rounds:               data.rounds.length,
    avg_points_per_round:     Math.round((total / totals.length) * 100) / 100,
    avg_points_per_submission:Math.round((total / pps.length) * 100) / 100,
    min_points_in_round:      Math.min(...totals),
    max_points_in_round:      Math.max(...totals),
  };
}

export function pointsPerRound(data) {
  const pps  = pointsPerSubmission(data.submissions, data.votes);
  const roundName = new Map(data.rounds.map(r => [r.ID, r.Name]));
  const byRound = new Map();
  pps.forEach(p => byRound.set(p['Round ID'], (byRound.get(p['Round ID']) || 0) + p.TotalPoints));

  return [...data.rounds]
    .sort((a, b) => new Date(a.Created) - new Date(b.Created))
    .map(r => ({ round: r.Name, points: byRound.get(r.ID) || 0 }));
}

export function voteDistribution(data) {
  const counts = new Map();
  data.votes.forEach(v => {
    const pts = Number(v.Points || 0);
    if (pts > 0) counts.set(pts, (counts.get(pts) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([pts, freq]) => ({ points: pts, frequency: freq }));
}

const QUANTILE_BUCKETS = [
  { label: 'Top 10%',    upper: 0.10 },
  { label: '10–25%',     upper: 0.25 },
  { label: '25–50%',     upper: 0.50 },
  { label: 'Bottom 50%', upper: 1.00 },
];

export function quantileShares(data) {
  const pps      = pointsPerSubmission(data.submissions, data.votes);
  const roundName = new Map(data.rounds.map(r => [r.ID, r.Name]));
  const roundOrder = [...data.rounds]
    .sort((a, b) => new Date(a.Created) - new Date(b.Created))
    .map(r => r.ID);

  const rows = [];
  roundOrder.forEach(rid => {
    const grp = pps.filter(p => p['Round ID'] === rid)
      .sort((a, b) => b.TotalPoints - a.TotalPoints);
    const total = grp.reduce((s, p) => s + p.TotalPoints, 0);
    if (!total) return;
    const n = grp.length;
    let prev = 0;
    QUANTILE_BUCKETS.forEach(b => {
      const lo = Math.floor(prev * n);
      const hi = Math.min(Math.max(Math.floor(b.upper * n), lo + 1), n);
      const bPts = grp.slice(lo, hi).reduce((s, p) => s + p.TotalPoints, 0);
      rows.push({
        round:    roundName.get(rid) || rid,
        roundId:  rid,
        quantile: b.label,
        points:   bPts,
        pct:      Math.round((100 * bPts / total) * 10) / 10,
      });
      prev = b.upper;
    });
  });
  return { rows, buckets: QUANTILE_BUCKETS.map(b => b.label) };
}

export function playerQuantileFlow(data) {
  const names    = nameMap(data.competitors);
  const pps      = pointsPerSubmission(data.submissions, data.votes);
  const roundOrder = [...data.rounds]
    .sort((a, b) => new Date(a.Created) - new Date(b.Created))
    .map(r => r.ID);

  // Build bucket map: uri+roundId -> bucketLabel
  const bucketMap = new Map();
  roundOrder.forEach(rid => {
    const grp = pps.filter(p => p['Round ID'] === rid)
      .sort((a, b) => b.TotalPoints - a.TotalPoints);
    const total = grp.reduce((s, p) => s + p.TotalPoints, 0);
    if (!total) return;
    const n = grp.length;
    let prev = 0;
    QUANTILE_BUCKETS.forEach(b => {
      const lo = Math.floor(prev * n);
      const hi = Math.min(Math.max(Math.floor(b.upper * n), lo + 1), n);
      grp.slice(lo, hi).forEach(p => bucketMap.set(`${p.SpotifyURI}|||${rid}`, b.label));
      prev = b.upper;
    });
  });

  // Sum points each voter sent to each bucket
  const flow = new Map(); // `voterName|||bucketLabel` -> pts
  data.votes.forEach(v => {
    if (Number(v.Points) <= 0) return;
    const bucket = bucketMap.get(`${v.SpotifyURI}|||${v['Round ID']}`);
    if (!bucket) return;
    const vName = names.get(v['Voter ID']) || v['Voter ID'];
    const key   = `${vName}|||${bucket}`;
    flow.set(key, (flow.get(key) || 0) + Number(v.Points));
  });

  return [...flow.entries()].map(([key, pts]) => {
    const [voterName, bucket] = key.split('|||');
    return { voterName, bucket, points: pts };
  });
}

// ── Timing stats ──────────────────────────────────────────────────────────

function inferRoundDeadlines(data) {
  // submission_deadline = last submission timestamp in that round
  // vote_deadline       = last vote timestamp in that round
  const subDeadlines  = new Map();
  const voteDeadlines = new Map();

  data.submissions.forEach(s => {
    const t = new Date(s.Created).getTime();
    if (!subDeadlines.has(s['Round ID']) || t > subDeadlines.get(s['Round ID'])) {
      subDeadlines.set(s['Round ID'], t);
    }
  });
  data.votes.forEach(v => {
    const t = new Date(v.Created).getTime();
    if (!voteDeadlines.has(v['Round ID']) || t > voteDeadlines.get(v['Round ID'])) {
      voteDeadlines.set(v['Round ID'], t);
    }
  });

  const deadlines = new Map();
  data.rounds.forEach(r => {
    const sd = subDeadlines.get(r.ID);
    const vd = voteDeadlines.get(r.ID);
    deadlines.set(r.ID, {
      roundId:             r.ID,
      roundName:           r.Name,
      submissionDeadline:  sd || null,
      voteDeadline:        vd || null,
      playlistOpen:        sd || null,
    });
  });
  return deadlines;
}

export function submissionTimingStats(data) {
  const names     = nameMap(data.competitors);
  const deadlines = inferRoundDeadlines(data);

  const perPlayer = new Map(); // id -> [hoursBefore, ...]
  data.submissions.forEach(s => {
    const dl = deadlines.get(s['Round ID']);
    if (!dl || !dl.submissionDeadline) return;
    const ts = new Date(s.Created).getTime();
    const hoursBefore = (dl.submissionDeadline - ts) / 3600000;
    if (!perPlayer.has(s['Submitter ID'])) perPlayer.set(s['Submitter ID'], []);
    perPlayer.get(s['Submitter ID']).push(hoursBefore);
  });

  return [...perPlayer.entries()]
    .map(([id, hrs]) => ({
      player_id:                id,
      player_name:              names.get(id) || id,
      avg_hours_before_deadline: Math.round((hrs.reduce((a, b) => a + b, 0) / hrs.length) * 100) / 100,
      min_hours_before_deadline: Math.round(Math.min(...hrs) * 100) / 100,
      max_hours_before_deadline: Math.round(Math.max(...hrs) * 100) / 100,
      rounds_submitted:          hrs.length,
    }))
    .sort((a, b) => a.avg_hours_before_deadline - b.avg_hours_before_deadline);
}

export function voteTimingStats(data) {
  const names     = nameMap(data.competitors);
  const deadlines = inferRoundDeadlines(data);

  // One vote timestamp per (voterId, roundId) = max timestamp
  const perVoterRound = new Map();
  data.votes.forEach(v => {
    const t   = new Date(v.Created).getTime();
    const key = `${v['Voter ID']}|||${v['Round ID']}`;
    if (!perVoterRound.has(key) || t > perVoterRound.get(key)) perVoterRound.set(key, t);
  });

  const perPlayer = new Map(); // id -> {afterPlaylist: [], beforeDeadline: []}
  perVoterRound.forEach((ts, key) => {
    const [voterId, roundId] = key.split('|||');
    const dl = deadlines.get(roundId);
    if (!dl || !dl.playlistOpen || !dl.voteDeadline) return;
    const hoursAfter  = Math.max((ts - dl.playlistOpen)  / 3600000, 0);
    const hoursBefore = (dl.voteDeadline - ts) / 3600000;
    if (!perPlayer.has(voterId)) perPlayer.set(voterId, { after: [], before: [] });
    perPlayer.get(voterId).after.push(hoursAfter);
    perPlayer.get(voterId).before.push(hoursBefore);
  });

  return [...perPlayer.entries()]
    .map(([id, { after, before }]) => ({
      player_id:                        id,
      player_name:                      names.get(id) || id,
      avg_hours_after_playlist:         Math.round((after.reduce((a, b) => a + b, 0) / after.length)   * 100) / 100,
      min_hours_after_playlist:         Math.round(Math.min(...after) * 100) / 100,
      max_hours_after_playlist:         Math.round(Math.max(...after) * 100) / 100,
      avg_hours_before_vote_deadline:   Math.round((before.reduce((a, b) => a + b, 0) / before.length) * 100) / 100,
      rounds_voted:                     after.length,
    }))
    .sort((a, b) => a.avg_hours_after_playlist - b.avg_hours_after_playlist);
}

export function timingPerRound(data) {
  const names     = nameMap(data.competitors);
  const deadlines = inferRoundDeadlines(data);
  const rows = [];

  data.submissions.forEach(s => {
    const dl = deadlines.get(s['Round ID']);
    if (!dl || !dl.submissionDeadline) return;
    const hoursBefore = (dl.submissionDeadline - new Date(s.Created).getTime()) / 3600000;
    rows.push({
      player_id:               s['Submitter ID'],
      player_name:             names.get(s['Submitter ID']) || s['Submitter ID'],
      round_id:                s['Round ID'],
      round_name:              dl.roundName,
      sub_hours_before_deadline: Math.round(hoursBefore * 100) / 100,
      vote_hours_after_playlist: null,
      vote_hours_before_deadline: null,
    });
  });

  // Add vote timing
  const perVoterRound = new Map();
  data.votes.forEach(v => {
    const t   = new Date(v.Created).getTime();
    const key = `${v['Voter ID']}|||${v['Round ID']}`;
    if (!perVoterRound.has(key) || t > perVoterRound.get(key)) perVoterRound.set(key, t);
  });

  perVoterRound.forEach((ts, key) => {
    const [voterId, roundId] = key.split('|||');
    const dl = deadlines.get(roundId);
    if (!dl || !dl.playlistOpen || !dl.voteDeadline) return;
    rows.push({
      player_id:                  voterId,
      player_name:                names.get(voterId) || voterId,
      round_id:                   roundId,
      round_name:                 dl.roundName,
      sub_hours_before_deadline:  null,
      vote_hours_after_playlist:  Math.max((ts - dl.playlistOpen )  / 3600000, 0),
      vote_hours_before_deadline: (dl.voteDeadline - ts) / 3600000,
    });
  });

  return rows;
}

// ── Headlines metrics ─────────────────────────────────────────────────────

export function gatherHeadlineMetrics(data) {
  const names    = nameMap(data.competitors);
  const allNames = [...names.values()];

  // Initialise all metrics to 0 for every player
  const metrics = {};
  const metricKeys = [
    'total_points', 'avg_points_per_round', 'most_misunderstood',
    'podium_appearances', 'fewest_podiums',
    'most_consistent', 'most_volatile',
    'most_generous', 'least_generous',
    'earliest_submitter', 'latest_submitter',
    'fastest_voter', 'slowest_voter',
    'most_talkative', 'most_commented_on', 'least_commented_on',
    'most_zeros', 'fewest_zeros',
    'most_unique_artists', 'least_unique_artists',
  ];
  metricKeys.forEach(k => { metrics[k] = {}; allNames.forEach(n => { metrics[k][n] = 0; }); });

  // total_points
  const pps = pointsPerSubmission(data.submissions, data.votes);
  const totals = new Map();
  pps.forEach(p => totals.set(p['Submitter ID'], (totals.get(p['Submitter ID']) || 0) + p.TotalPoints));
  totals.forEach((pts, id) => { const n = names.get(id); if (n) metrics.total_points[n] = pts; });

  // avg_points_per_round
  playerRoundAverages(data).forEach(e => { metrics.avg_points_per_round[e.name] = e.avg_points; });

  // most_misunderstood (inverted total)
  const maxPts = Math.max(...Object.values(metrics.total_points), 1);
  allNames.forEach(n => { metrics.most_misunderstood[n] = maxPts - (metrics.total_points[n] || 0); });

  // podium_appearances
  const podium = topPodiumAppearances(data, 3);
  const maxPodiums = Math.max(...podium.map(e => e.podium_appearances), 1);
  podium.forEach(e => {
    metrics.podium_appearances[e.name] = e.podium_appearances;
    metrics.fewest_podiums[e.name]     = maxPodiums + 1 - e.podium_appearances;
  });

  // consistency
  const con = mostConsistentSubmitter(data);
  const maxVar = Math.max(...con.map(e => e.variance), 1);
  con.forEach(e => {
    metrics.most_consistent[e.name] = maxVar - e.variance;
    metrics.most_volatile[e.name]   = e.variance;
  });

  // generosity
  const gen = mostGenerousVoter(data);
  const maxGen = Math.max(...gen.map(e => e.avg_distinct_recipients_per_round), 1);
  gen.forEach(e => {
    metrics.most_generous[e.voter]  = e.avg_distinct_recipients_per_round;
    metrics.least_generous[e.voter] = maxGen - e.avg_distinct_recipients_per_round;
  });

  // timing
  try {
    const subStats = submissionTimingStats(data);
    subStats.forEach(r => {
      if (!r.player_name || !(r.player_name in metrics.earliest_submitter)) return;
      metrics.earliest_submitter[r.player_name] =  r.avg_hours_before_deadline;
      metrics.latest_submitter[r.player_name]   = -r.avg_hours_before_deadline;
    });
    const voteStats = voteTimingStats(data);
    const maxH = Math.max(...voteStats.map(r => r.avg_hours_after_playlist), 1);
    voteStats.forEach(r => {
      if (!r.player_name || !(r.player_name in metrics.fastest_voter)) return;
      metrics.fastest_voter[r.player_name] = maxH - r.avg_hours_after_playlist;
      metrics.slowest_voter[r.player_name] = r.avg_hours_after_playlist;
    });
  } catch (_) {}

  // comments
  mostTalkatativeCommenter(data).forEach(e => { metrics.most_talkative[e.name] = e.total; });
  const recv = top3CommentWinners(data).map((e, _, arr) => e);
  const maxRecv = Math.max(...recv.map(e => e.comments_received), 1);
  recv.forEach(e => {
    metrics.most_commented_on[e.name]  = e.comments_received;
    metrics.least_commented_on[e.name] = maxRecv - e.comments_received;
  });

  // zeros
  const zeros = zeroPointsIncidents(data);
  zeros.byPerson.forEach(e => { metrics.most_zeros[e.name] = e.zero_rounds; });
  const maxZ = Math.max(...Object.values(metrics.most_zeros), 1);
  allNames.forEach(n => { metrics.fewest_zeros[n] = maxZ - (metrics.most_zeros[n] || 0); });

  // artist variety
  const artistCounts = new Map(); // playerName -> Set<artist>
  data.submissions.forEach(s => {
    const pName = names.get(s['Submitter ID']);
    if (!pName) return;
    if (!artistCounts.has(pName)) artistCounts.set(pName, new Set());
    (s['Artist(s)'] || '').split(',').map(a => a.trim()).filter(Boolean)
      .forEach(a => artistCounts.get(pName).add(a));
  });
  const maxArtists = Math.max(...[...artistCounts.values()].map(s => s.size), 1);
  artistCounts.forEach((artists, player) => {
    metrics.most_unique_artists[player]  = artists.size;
    metrics.least_unique_artists[player] = maxArtists - artists.size;
  });

  return metrics;
}

const HEADLINE_CATALOGUE = [
  { metric_key: 'total_points',         positive: '🏆 The Undisputed Champion',              funny: '📊 Lives in Spreadsheets',                       positive_for_top: true  },
  { metric_key: 'avg_points_per_round', positive: '📈 Round-by-Round Royalty',               funny: '🤓 Suspiciously Consistent',                     positive_for_top: true  },
  { metric_key: 'most_misunderstood',   positive: '🎭 Ahead of Their Time',                  funny: '😅 Songs for an Audience of Zero',               positive_for_top: false },
  { metric_key: 'podium_appearances',   positive: '🥇 Podium Elite',                         funny: '🪆 Collects Trophies Like Magnets',              positive_for_top: true  },
  { metric_key: 'fewest_podiums',       positive: '🌱 The Dark Horse',                       funny: "🏳️ The Podium's Biggest Stranger",              positive_for_top: true  },
  { metric_key: 'most_consistent',      positive: '🎯 Steady as a Metronome',                funny: '🤖 Literally a Bot',                             positive_for_top: true  },
  { metric_key: 'most_volatile',        positive: '🎆 Wildcard of the Week',                 funny: '🎲 Vibes-Based Submissions Only',                positive_for_top: true  },
  { metric_key: 'most_generous',        positive: '💝 Spreads the Love',                     funny: "🧁 Can't Say No to Anyone",                     positive_for_top: true  },
  { metric_key: 'least_generous',       positive: '🧐 Selective Taste Curator',             funny: '🥶 Points Are Rationed Here',                    positive_for_top: true  },
  { metric_key: 'earliest_submitter',   positive: '⏰ First to the Party',                  funny: "😤 Submits Before the Theme Is Even Announced", positive_for_top: true  },
  { metric_key: 'latest_submitter',     positive: '🎸 Lives for the Deadline Drama',        funny: '🚒 Submitted While the Server Was on Fire',     positive_for_top: true  },
  { metric_key: 'fastest_voter',        positive: '⚡ Lightning-Quick Listener',            funny: '🙈 Did They Even Listen?',                       positive_for_top: true  },
  { metric_key: 'slowest_voter',        positive: '🎧 Deep Listener, Savours Every Note',   funny: '🐢 Votes Arrive by Carrier Pigeon',             positive_for_top: true  },
  { metric_key: 'most_talkative',       positive: '💬 Voice of the League',                 funny: '📢 Needs a Word Limit',                          positive_for_top: true  },
  { metric_key: 'most_commented_on',    positive: '🎤 The Crowd Favourite',                 funny: '🧲 People Have Opinions About This One',         positive_for_top: true  },
  { metric_key: 'least_commented_on',   positive: '🌙 Silent Icon',                         funny: '👻 Songs Vanish Without a Trace',                positive_for_top: true  },
  { metric_key: 'most_zeros',           positive: '🔥 Fearless Risk-Taker',                 funny: '💀 Points? Never Heard of Them',                 positive_for_top: true  },
  { metric_key: 'fewest_zeros',         positive: '🛡️ Zero-Point-Free Zone',               funny: '📋 Has Never Failed Anyone, Ever',               positive_for_top: true  },
  { metric_key: 'most_unique_artists',  positive: '🌍 Musical Explorer',                    funny: '🗺️ Spotify Library: Entire Planet',             positive_for_top: true  },
  { metric_key: 'least_unique_artists', positive: '🎵 Devoted to the Classics',             funny: "🔁 Has One Favourite Band and Isn't Sorry",     positive_for_top: true  },
];

export function assignHeadlines(data) {
  const metrics = gatherHeadlineMetrics(data);
  const names   = [...nameMap(data.competitors).values()];

  // For each player, find the metric where they rank highest
  const used  = { positive: new Set(), funny: new Set() };
  const headlines = {};
  names.forEach(n => headlines[n] = { positive: null, funny: null });

  // Score each player on each metric (1 = best, length = worst)
  // Assign greedily: pick highest-score unused metric per player for each slot
  function getRanked(metricKey) {
    const vals = metrics[metricKey];
    return [...names].sort((a, b) => (vals[b] || 0) - (vals[a] || 0));
  }

  // Positive headlines: pick the metric with the most extreme rank for each player
  names.forEach(player => {
    let bestScore = -Infinity;
    let bestH = null;
    for (const def of HEADLINE_CATALOGUE) {
      if (used.positive.has(def.metric_key)) continue;
      const ranked = getRanked(def.metric_key);
      const rank   = ranked.indexOf(player);
      if (rank === 0) {
        const score = (metrics[def.metric_key][player] || 0);
        if (score > bestScore) { bestScore = score; bestH = def; }
      }
    }
    if (bestH) {
      headlines[player].positive = bestH.positive;
      used.positive.add(bestH.metric_key);
    }
  });

  // Funny headlines: use a different set
  names.forEach(player => {
    let bestScore = -Infinity;
    let bestH = null;
    for (const def of HEADLINE_CATALOGUE) {
      if (used.funny.has(def.metric_key)) continue;
      const ranked = getRanked(def.metric_key);
      const rank   = ranked.indexOf(player);
      if (rank === 0 || rank === names.length - 1) {
        const isBottom = rank === names.length - 1;
        const score    = (metrics[def.metric_key][player] || 0);
        if (score > bestScore) { bestScore = score; bestH = def; }
      }
    }
    if (bestH) {
      headlines[player].funny = bestH.funny;
      used.funny.add(bestH.metric_key);
    }
    // Fallback headlines
    if (!headlines[player].positive) headlines[player].positive = '🎵 League Member';
    if (!headlines[player].funny)    headlines[player].funny    = '🎲 Mysteriously Average';
  });

  return headlines;
}

// ── Report generator ──────────────────────────────────────────────────────

export function generateReportText(data) {
  const lines = ['T5 Music League Stats Report', '='.repeat(50), ''];

  const names = nameMap(data.competitors);

  lines.push(`Leagues:      ${data.leagueNames.join(', ')}`);
  lines.push(`Rounds:       ${data.rounds.length}`);
  lines.push(`Competitors:  ${data.competitors.length}`);
  lines.push(`Submissions:  ${data.submissions.length}`);
  lines.push(`Total votes:  ${data.votes.length}`);
  lines.push('');

  // Top winners
  lines.push('TOP WINNERS');
  lines.push('-'.repeat(30));
  top3Winners(data, 10).forEach(w => lines.push(`  ${w.rank}. ${w.name}: ${w.points} pts`));
  lines.push('');

  // Podium appearances
  lines.push('PODIUM APPEARANCES (top-3 finishes per round)');
  lines.push('-'.repeat(30));
  topPodiumAppearances(data, 3).forEach((e, i) =>
    lines.push(`  ${i + 1}. ${e.name}: ${e.podium_appearances}x`)
  );
  lines.push('');

  // Song stats
  lines.push('MOST UNIVERSALLY LIKED (by points)');
  lines.push('-'.repeat(30));
  mostUniversallyLiked(data, 5).byPoints.forEach((s, i) =>
    lines.push(`  ${i + 1}. ${s.title} – ${s.artist} (${s.total_points} pts, ${s.voter_count} voters)`)
  );
  lines.push('');

  // Blowouts
  lines.push('BIGGEST BLOWOUTS');
  lines.push('-'.repeat(30));
  biggestBlowout(data).slice(0, 5).forEach((b, i) =>
    lines.push(`  ${i + 1}. ${b.round}: ${b.winner} beat ${b.second_place} by ${b.margin} pts`)
  );
  lines.push('');

  return lines.join('\n');
}
