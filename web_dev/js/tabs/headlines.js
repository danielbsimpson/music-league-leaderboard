/**
 * tabs/headlines.js — 📰 Headlines tab
 *
 * assignHeadlines(data) returns: { playerName: { positive: 'text', funny: 'text' }, ... }
 */

import { assignHeadlines } from '../data.js';
import { el, sectionHeader, sectionCaption } from '../charts.js';

export function renderHeadlines(container, data) {
  container.appendChild(sectionHeader('📰 Player Headlines'));
  container.appendChild(sectionCaption(
    'Each player gets a personalized headline based on their performance metrics this season.'
  ));

  const headlineMap = assignHeadlines(data); // { playerName: { positive, funny } }

  if (!headlineMap || Object.keys(headlineMap).length === 0) {
    container.appendChild(el('p', 'banner banner-info', 'Not enough data to generate headlines.'));
    return;
  }

  const grid = el('div', 'headlines-grid');

  Object.entries(headlineMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([player, { positive, funny }]) => {
      const card = el('div', 'headline-card');
      card.appendChild(el('div', 'headline-player', player));

      if (positive) {
        const row = el('div', 'headline-row');
        row.appendChild(el('span', 'headline-text headline-positive', positive));
        card.appendChild(row);
      }
      if (funny) {
        const row = el('div', 'headline-row');
        row.appendChild(el('span', 'headline-text headline-funny', funny));
        card.appendChild(row);
      }

      grid.appendChild(card);
    });

  container.appendChild(grid);
}
