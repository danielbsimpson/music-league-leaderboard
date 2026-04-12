/**
 * tabs/songs.js — 🎵 Song Stats tab
 */

import {
  mostUniversallyLiked, biggestBlowout,
  mostSubmittedSongs, mostArtistAppearances,
} from '../data.js';

import {
  el, sectionHeader, sectionCaption, divider,
  makeBarChart, htmlTable, ACCENT,
} from '../charts.js';

export function renderSongs(container, data) {
  container.appendChild(sectionHeader('🎵 Song Stats'));

  // ── Top N slider ────────────────────────────────────────────────────────
  const ctrlRow = el('div', 'panel-control-row');
  ctrlRow.innerHTML = `<span class="panel-label">Show top </span>`;
  const rangeInput = document.createElement('input');
  rangeInput.type      = 'range'; rangeInput.min = 3; rangeInput.max = 20; rangeInput.value = 10;
  rangeInput.className = 'panel-range'; rangeInput.id = 'songs-topn';
  const rangeLabel = el('span', 'panel-label', '10');
  rangeInput.addEventListener('input', () => { rangeLabel.textContent = rangeInput.value; refresh(); });
  ctrlRow.appendChild(rangeInput);
  ctrlRow.appendChild(rangeLabel);
  ctrlRow.appendChild(el('span', 'panel-label', 'songs'));
  container.appendChild(ctrlRow);

  // Containers for lazy re-render
  const likedSection     = el('div');
  const blowoutSection   = el('div');
  const repeatedSection  = el('div');
  const artistsSection   = el('div');

  container.appendChild(likedSection);
  container.appendChild(divider());
  container.appendChild(blowoutSection);
  container.appendChild(divider());
  container.appendChild(repeatedSection);
  container.appendChild(divider());
  container.appendChild(artistsSection);

  function refresh() {
    const topN = Number(rangeInput.value);
    renderLiked(likedSection, data, topN);
    renderBlowouts(blowoutSection, data);
    renderRepeated(repeatedSection, data);
    renderArtists(artistsSection, data);
  }

  refresh();
}

function renderLiked(container, data, topN) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('❤️ Most Universally Liked Songs'));
  const { byPoints, byVoters } = mostUniversallyLiked(data, topN);

  const grid = el('div', 'grid-2');

  // By Points
  const leftWrap = el('div');
  leftWrap.appendChild(el('p', 'caption', 'By Total Points'));
  makeBarChart(leftWrap,
    byPoints.map(s => `${s.title} — ${s.artist}`),
    byPoints.map(s => s.total_points),
    { color: ACCENT, xLabel: 'Points', title: 'Most points received', horizontal: true }
  );
  leftWrap.appendChild(htmlTable(
    ['Title', 'Artist', 'Submitted By', 'Points', 'Voters'],
    byPoints.map(s => ({
      Title: s.title, Artist: s.artist, 'Submitted By': s.submitted_by,
      Points: s.total_points, Voters: s.voter_count,
    }))
  ));
  grid.appendChild(leftWrap);

  // By Voters
  const rightWrap = el('div');
  rightWrap.appendChild(el('p', 'caption', 'By Number of Voters'));
  makeBarChart(rightWrap,
    byVoters.map(s => `${s.title} — ${s.artist}`),
    byVoters.map(s => s.voter_count),
    { color: '#b47bff', xLabel: 'Voters', title: 'Most distinct voters', horizontal: true }
  );
  rightWrap.appendChild(htmlTable(
    ['Title', 'Artist', 'Submitted By', 'Points', 'Voters'],
    byVoters.map(s => ({
      Title: s.title, Artist: s.artist, 'Submitted By': s.submitted_by,
      Points: s.total_points, Voters: s.voter_count,
    }))
  ));
  grid.appendChild(rightWrap);

  container.appendChild(grid);
}

function renderBlowouts(container, data) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('💥 Biggest Blowouts'));
  container.appendChild(sectionCaption('Rounds where the winner had the largest margin over 2nd place.'));

  const blowouts = biggestBlowout(data);
  makeBarChart(container,
    blowouts.map(b => b.round),
    blowouts.map(b => b.margin),
    { color: '#ffd166', horizontal: false, xLabel: 'Round', title: 'Winning margin per round (1st − 2nd place pts)' }
  );
  container.appendChild(htmlTable(
    ['Round', 'Winner', 'Winning Song', 'Winner Pts', '2nd Place', '2nd Pts', 'Margin'],
    blowouts.map(b => ({
      Round: b.round, Winner: b.winner, 'Winning Song': b.winner_song,
      'Winner Pts': b.winner_points, '2nd Place': b.second_place,
      '2nd Pts': b.second_points, Margin: b.margin,
    }))
  ));
}

function renderRepeated(container, data) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('🔁 Most Submitted Songs'));
  container.appendChild(sectionCaption('Songs submitted more than once across all rounds.'));

  const repeated = mostSubmittedSongs(data);
  if (repeated.length === 0) {
    container.appendChild(el('p', 'banner banner-success', 'No song was submitted more than once. 🎉'));
    return;
  }
  makeBarChart(container,
    repeated.map(s => `${s.title} — ${s.artist}`),
    repeated.map(s => s.count),
    { color: '#c77dff', xLabel: 'Times Submitted', title: 'Most Submitted Songs', horizontal: true }
  );
  container.appendChild(htmlTable(
    ['Rank', 'Title', 'Artist(s)', 'Times Submitted'],
    repeated.map(s => ({ Rank: s.rank, Title: s.title, 'Artist(s)': s.artist, 'Times Submitted': s.count }))
  ));
}

function renderArtists(container, data) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('🎤 Most Artist Appearances'));
  container.appendChild(sectionCaption("Artists appearing most frequently across all submissions."));

  const artists = mostArtistAppearances(data);
  makeBarChart(container,
    artists.map(a => a.artist),
    artists.map(a => a.count),
    { color: '#ef476f', xLabel: 'Appearances', title: 'Most Artist Appearances', horizontal: true }
  );
  container.appendChild(htmlTable(
    ['Rank', 'Artist', 'Appearances'],
    artists.map(a => ({ Rank: a.rank, Artist: a.artist, Appearances: a.count }))
  ));
}
