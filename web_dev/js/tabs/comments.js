/**
 * tabs/comments.js — 💬 Comments tab
 */

import {
  mostTalkatativeCommenter, top3CommentWinners,
  funniestComment, topCommentedSongs,
} from '../data.js';

import {
  el, sectionHeader, divider,
  makeBarChart, htmlTable, expander, ACCENT,
} from '../charts.js';

export function renderComments(container, data) {
  container.appendChild(sectionHeader('💬 Comments'));

  // ── Most talkative & most received ─────────────────────────────────────
  {
    const grid = el('div', 'grid-2');

    const talkWrap = el('div');
    talkWrap.appendChild(el('h4', 'section-header', '🗣️ Most Talkative'));
    const talk = mostTalkatativeCommenter(data);
    makeBarChart(talkWrap, talk.map(e => e.name), talk.map(e => e.total),
      { color: '#b47bff', xLabel: 'Comments Made', title: 'Total comments made' });
    talkWrap.appendChild(htmlTable(
      ['Player', 'Vote Comments', 'Sub Comments', 'Total'],
      talk.map(e => ({
        Player: e.name, 'Vote Comments': e.vote_comments,
        'Sub Comments': e.sub_comments, Total: e.total,
      }))
    ));
    grid.appendChild(talkWrap);

    const recvWrap = el('div');
    recvWrap.appendChild(el('h4', 'section-header', '📬 Most Comments Received'));
    const recv = top3CommentWinners(data);
    makeBarChart(recvWrap, recv.map(e => e.name), recv.map(e => e.comments_received),
      { color: ACCENT, xLabel: 'Comments Received', title: 'Comments received on submitted songs' });
    recvWrap.appendChild(htmlTable(
      ['Rank', 'Player', 'Comments Received'],
      recv.map(e => ({ Rank: e.rank, Player: e.name, 'Comments Received': e.comments_received }))
    ));
    grid.appendChild(recvWrap);

    container.appendChild(grid);
  }
  container.appendChild(divider());

  // ── Songs with most comments ────────────────────────────────────────────
  container.appendChild(sectionHeader('🎵 Songs with Most Comments Received'));

  const topSongs = topCommentedSongs(data, 5);
  if (topSongs.length > 0) {
    makeBarChart(container,
      topSongs.map(s => s.song),
      topSongs.map(s => s.count),
      { color: '#ffd166', xLabel: 'Comments Received', title: 'Top 5 most commented-on songs', horizontal: true }
    );

    topSongs.forEach(song => {
      const commentTable = htmlTable(
        ['Comment Text'],
        song.comments.map(c => ({ 'Comment Text': `${c.author}: ${c.comment}` }))
      );
      container.appendChild(expander(
        `💬 ${song.song}  ·  submitted by ${song.submitter}  ·  ${song.count} comment(s)`,
        commentTable
      ));
    });
  }
  container.appendChild(divider());

  // ── All comments search ─────────────────────────────────────────────────
  container.appendChild(sectionHeader('😂 All Comments'));

  const searchRow = el('div', 'panel-control-row');
  const searchInput = document.createElement('input');
  searchInput.type        = 'text';
  searchInput.className   = 'panel-search';
  searchInput.placeholder = '🔍 Search comments…';
  searchRow.appendChild(searchInput);
  container.appendChild(searchRow);

  const tableWrap = el('div');
  container.appendChild(tableWrap);

  const allComments = funniestComment(data);

  function renderAll(filter = '') {
    tableWrap.innerHTML = '';
    const filtered = filter
      ? allComments.filter(c =>
          [c.author, c.source, c.context, c.comment]
            .some(v => String(v).toLowerCase().includes(filter.toLowerCase()))
        )
      : allComments;

    tableWrap.appendChild(htmlTable(
      ['Author', 'Source', 'Song', 'Comment'],
      filtered.map(c => ({ Author: c.author, Source: c.source, Song: c.context, Comment: c.comment }))
    ));
  }

  searchInput.addEventListener('input', () => renderAll(searchInput.value));
  renderAll();
}
