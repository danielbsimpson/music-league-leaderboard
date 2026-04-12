/**
 * tabs/fanmap.js — 🤝 Fan Map tab
 */

import {
  biggestFans, leastCompatible, allVotesMatrix,
  nameMap,
} from '../data.js';

import {
  el, sectionHeader, sectionCaption, divider,
  makeBarChart, makeSankey, htmlTable,
  ACCENT, PALETTE,
} from '../charts.js';

function hexToRgba(hex, alpha = 0.4) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function renderFanMap(container, data) {
  const names = nameMap(data.competitors);
  const allPlayerNames = [...new Set([...names.values()])].sort();

  // ── Target player selector ─────────────────────────────────────────────
  container.appendChild(sectionHeader('🤝 Fan Map'));
  const ctrlRow = el('div', 'panel-control-row');
  ctrlRow.appendChild(el('span', 'panel-label', '🎯 Target player:'));
  const sel = document.createElement('select');
  sel.className = 'panel-select';
  allPlayerNames.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n; opt.textContent = n;
    sel.appendChild(opt);
  });
  // Default to "Daniel" if present
  const danielOpt = allPlayerNames.find(n => n.toLowerCase().startsWith('daniel'));
  if (danielOpt) sel.value = danielOpt;
  ctrlRow.appendChild(sel);
  container.appendChild(ctrlRow);
  container.appendChild(sectionCaption("Select a player to see who are their biggest fans and least compatible matches."));

  const fansSection    = el('div');
  const sankeySection  = el('div');
  const fullSection    = el('div');

  container.appendChild(fansSection);
  container.appendChild(divider());
  container.appendChild(sankeySection);
  container.appendChild(divider());
  container.appendChild(fullSection);

  sel.addEventListener('change', () => refresh(sel.value));

  function refresh(targetName) {
    renderFansCompat(fansSection, data, targetName);
    renderPlayerSankey(sankeySection, data, targetName);
    renderFullSankey(fullSection, data);
  }

  refresh(sel.value);
}

function renderFansCompat(container, data, targetName) {
  container.innerHTML = '';
  const grid = el('div', 'grid-2');

  // Biggest fans
  const leftWrap = el('div');
  leftWrap.appendChild(el('h4', 'section-header', `💚 Biggest Fans of ${targetName}`));
  const fans = biggestFans(data, targetName).slice(0, 5);
  if (fans.length) {
    makeBarChart(leftWrap,
      fans.map(f => f.voter),
      fans.map(f => f.points_given),
      { color: ACCENT, xLabel: 'Points Given', title: `Top 5 — points given to ${targetName}` }
    );
    leftWrap.appendChild(htmlTable(
      ['Voter', 'Points Given'],
      fans.map(f => ({ Voter: f.voter, 'Points Given': f.points_given }))
    ));
  } else {
    leftWrap.appendChild(el('p', 'caption', 'No voting data found.'));
  }
  grid.appendChild(leftWrap);

  // Least compatible
  const rightWrap = el('div');
  rightWrap.appendChild(el('h4', 'section-header', `💔 Least Compatible with ${targetName}`));
  const compat = leastCompatible(data, targetName).slice(0, 5);
  if (compat.length) {
    makeBarChart(rightWrap,
      compat.map(f => f.voter),
      compat.map(f => f.points_given),
      { color: '#e05252', xLabel: 'Points Given', title: `Bottom 5 — points given to ${targetName}` }
    );
    rightWrap.appendChild(htmlTable(
      ['Voter', 'Points Given'],
      compat.map(f => ({ Voter: f.voter, 'Points Given': f.points_given }))
    ));
  } else {
    rightWrap.appendChild(el('p', 'caption', 'No voting data found.'));
  }
  grid.appendChild(rightWrap);

  container.appendChild(grid);
}

function renderPlayerSankey(container, data, targetName) {
  container.innerHTML = '';
  container.appendChild(el('h4', 'section-header', `🎵 How ${targetName} Voted`));
  container.appendChild(sectionCaption(`Points sent by ${targetName} to every other player across all rounds.`));

  const names = nameMap(data.competitors);
  const invMap = new Map([...names.entries()].map(([k, v]) => [v, k]));
  const targetId = invMap.get(targetName);
  if (!targetId) { container.appendChild(el('p', 'caption', 'Player not found.')); return; }

  const uriToSub = new Map(data.submissions.map(s => [s.SpotifyURI, s['Submitter ID']]));
  const edges    = new Map(); // receiverName -> total points

  data.votes.forEach(v => {
    if (v['Voter ID'] !== targetId) return;
    const recv = uriToSub.get(v.SpotifyURI);
    if (!recv || recv === targetId) return;
    const rName = names.get(recv) || recv;
    edges.set(rName, (edges.get(rName) || 0) + Number(v.Points || 0));
  });

  if (edges.size === 0) {
    container.appendChild(el('p', 'caption', `No voting data found for ${targetName}.`));
    return;
  }

  const receivers = [...edges.entries()].sort((a, b) => b[1] - a[1]);
  const receiverColors = Object.fromEntries(receivers.map(([n], i) => [n, PALETTE[i % PALETTE.length]]));

  const nodes = [
    { id: '__voter__', name: targetName, color: ACCENT },
    ...receivers.map(([n]) => ({ id: n, name: n, color: receiverColors[n] })),
  ];
  const links = receivers.map(([n, pts]) => ({
    source: '__voter__',
    target: n,
    value:  pts,
    color:  hexToRgba(receiverColors[n]),
  }));

  makeSankey(container, nodes, links, {
    width:  700,
    height: Math.max(380, receivers.length * 36 + 60),
  });
}

function renderFullSankey(container, data) {
  container.innerHTML = '';
  container.appendChild(el('h4', 'section-header', '🗺️ Full Points-Given Matrix'));
  container.appendChild(sectionCaption('Rows = voter  ·  Columns = submitter who received the points'));

  const edges = allVotesMatrix(data);
  if (edges.length === 0) { container.appendChild(el('p', 'caption', 'No data.')); return; }

  // Order: voters by total sent, receivers by total received
  const totalSent = new Map();
  const totalRecv = new Map();
  edges.forEach(e => {
    totalSent.set(e.voterName, (totalSent.get(e.voterName) || 0) + e.points);
    totalRecv.set(e.receiverName, (totalRecv.get(e.receiverName) || 0) + e.points);
  });

  const voters    = [...totalSent.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const receivers = [...totalRecv.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);

  const receiverColors = Object.fromEntries(receivers.map((n, i) => [n, PALETTE[i % PALETTE.length]]));
  const nodes = [
    ...voters.map(n    => ({ id: 'v_' + n, name: n, color: '#888888' })),
    ...receivers.map(n => ({ id: 'r_' + n, name: n, color: receiverColors[n] })),
  ];
  const links = edges.map(e => ({
    source: 'v_' + e.voterName,
    target: 'r_' + e.receiverName,
    value:  e.points,
    color:  hexToRgba(receiverColors[e.receiverName] || '#888'),
  }));

  makeSankey(container, nodes, links, {
    width:  700,
    height: Math.max(400, Math.max(voters.length, receivers.length) * 28 + 60),
  });
}
