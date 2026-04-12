/**
 * charts.js — Reusable chart creation utilities.
 *
 * Exports:
 *   makeBarChart(container, labels, values, opts)   -> Chart.js instance
 *   makeLineChart(container, series, opts)          -> Chart.js instance
 *   makeDonutChart(container, labels, values, opts) -> Chart.js instance
 *   makeGroupedBarChart(container, groups, opts)    -> Chart.js instance
 *   makeHeatmap(container, data, opts)              -> D3 SVG
 *   makeSankey(container, nodes, links, opts)       -> D3 SVG
 *   makeScatter(container, series, opts)            -> D3 SVG
 *   destroyChart(chart)                             -> void
 *   htmlTable(cols, rows)                           -> HTMLElement
 *   el(tag, cls, text)                              -> HTMLElement
 *   sectionHeader(text)                             -> HTMLElement
 *   sectionCaption(text)                            -> HTMLElement
 *   divider()                                       -> HTMLElement
 *   statTile(icon, name, value, bg)                 -> HTMLElement
 *   tileGroup(title, tiles)                         -> HTMLElement
 *   metricTile(label, value)                        -> HTMLElement
 *   recordTile(icon, player, metric, round, bg, accentColor) -> HTMLElement
 *   expander(header, content)                       -> HTMLElement
 */

export const ACCENT  = '#1DB954';
export const PALETTE = [
  '#1DB954', '#ffd166', '#ef476f', '#118ab2', '#06d6a0',
  '#f4a261', '#e76f51', '#a8dadc', '#c77dff', '#ff6b6b',
  '#4ecdc4', '#ffe66d', '#ff9f1c', '#2ec4b6', '#e71d36',
];
export const BUCKET_COLORS = ['#1DB954', '#ffd166', '#ef476f', '#888888'];

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false, labels: { color: '#ccc' } },
    tooltip: {
      backgroundColor: 'rgba(15,18,27,.95)',
      titleColor: '#dde1ea',
      bodyColor: '#8b92a5',
      borderColor: '#2e3340',
      borderWidth: 1,
    },
  },
  scales: {
    x: { ticks: { color: '#8b92a5' }, grid: { color: 'rgba(255,255,255,.05)' } },
    y: { ticks: { color: '#8b92a5' }, grid: { color: 'rgba(255,255,255,.05)' } },
  },
};

// ── DOM helpers ───────────────────────────────────────────────────────────

export function el(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls)  e.className   = cls;
  if (text) e.textContent = text;
  return e;
}

export function sectionHeader(text) { return el('h3', 'section-header', text); }
export function sectionCaption(text) { return el('p', 'section-caption', text); }
export function divider() { return el('hr', 'section-divider'); }

export function statTile(icon, name, value, bg = '#21252e') {
  const tile = el('div', 'stat-tile');
  tile.style.background = bg;
  tile.innerHTML = `<span class="tile-icon">${icon}</span><span class="tile-name">${esc(name)}</span><span class="tile-value">${esc(value)}</span>`;
  return tile;
}

export function tileGroup(title, tiles) {
  const g = el('div', 'tile-group');
  const h = el('div', 'tile-group-title', title);
  g.appendChild(h);
  tiles.forEach(t => g.appendChild(t));
  return g;
}

export function metricTile(label, value) {
  const d = el('div', 'metric-tile');
  d.innerHTML = `<div class="metric-label">${esc(label)}</div><div class="metric-value">${esc(String(value))}</div>`;
  return d;
}

export function recordTile(icon, player, metric, round, bg = '#1a2a1a', accentColor = ACCENT) {
  const d = el('div', 'record-tile');
  d.style.background = bg;
  d.innerHTML =
    `<div class="record-tile-icon">${icon}</div>` +
    `<div class="record-tile-player">${esc(player)}</div>` +
    `<div class="record-tile-metric" style="color:${accentColor}">${esc(metric)}</div>` +
    `<div class="record-tile-round">${esc(round)}</div>`;
  return d;
}

export function expander(headerText, contentEl) {
  const wrap = el('div', 'expander');
  const head = el('div', 'expander-header');
  head.innerHTML = `<span>${esc(headerText)}</span><span class="expander-chevron">▼</span>`;
  const body = el('div', 'expander-body');
  body.appendChild(contentEl);
  wrap.appendChild(head);
  wrap.appendChild(body);
  head.addEventListener('click', () => wrap.classList.toggle('open'));
  return wrap;
}

export function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Chart containers ──────────────────────────────────────────────────────

function chartWrap(title) {
  const wrap = el('div', 'chart-container');
  if (title) wrap.appendChild(el('div', 'chart-title', title));
  return wrap;
}

function canvasInWrap(wrap, height = 300) {
  // Chart.js with responsive:true + maintainAspectRatio:false reads the *parent*
  // container size. Without a fixed-height intermediate div the chart grows in a
  // resize loop. The sizer div breaks that cycle.
  const sizer = document.createElement('div');
  sizer.style.position = 'relative';
  sizer.style.width    = '100%';
  sizer.style.height   = height + 'px';
  const c = document.createElement('canvas');
  sizer.appendChild(c);
  wrap.appendChild(sizer);
  return c;
}

// ── Bar chart (Chart.js) ──────────────────────────────────────────────────

export function makeBarChart(container, labels, values, opts = {}) {
  const height  = Math.max(320, labels.length * 32 + 80);
  const wrap    = chartWrap(opts.title || '');
  const canvas  = canvasInWrap(wrap, height);
  container.appendChild(wrap);

  const color    = opts.color || ACCENT;
  const isHoriz  = opts.horizontal !== false;

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: Array.isArray(color) ? color : labels.map(() => color),
        borderWidth: 0,
        borderRadius: 3,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: isHoriz ? 'y' : 'x',
      maintainAspectRatio: false,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: ctx => ` ${ctx.formattedValue}${opts.unit ? ' ' + opts.unit : ''}`,
          },
        },
      },
      scales: isHoriz
        ? {
            x: { ...CHART_DEFAULTS.scales.x, title: { display: !!opts.xLabel, text: opts.xLabel || '', color: '#8b92a5' } },
            y: { ...CHART_DEFAULTS.scales.y, ticks: { color: '#8b92a5', autoSkip: false } },
          }
        : {
            x: { ...CHART_DEFAULTS.scales.x, ticks: { color: '#8b92a5', maxRotation: 45 } },
            y: { ...CHART_DEFAULTS.scales.y },
          },
    },
  });

  return chart;
}

// ── Grouped bar chart ─────────────────────────────────────────────────────

export function makeGroupedBarChart(container, players, datasets, opts = {}) {
  // datasets: [{label, data, color}]
  const wrap   = chartWrap(opts.title || '');
  const canvas = canvasInWrap(wrap, opts.height || 320);
  container.appendChild(wrap);

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: players,
      datasets: datasets.map(d => ({
        label: d.label,
        data:  d.data,
        backgroundColor: d.color,
        borderWidth: 0,
        borderRadius: 3,
      })),
    },
    options: {
      ...CHART_DEFAULTS,
      maintainAspectRatio: false,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: {
          display: true,
          labels: { color: '#ccc', boxWidth: 12 },
        },
      },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x, ticks: { maxRotation: 45, color: '#8b92a5' } },
        y: { ...CHART_DEFAULTS.scales.y, title: { display: !!opts.yLabel, text: opts.yLabel || '', color: '#8b92a5' } },
      },
    },
  });
  return chart;
}

// ── Stacked bar chart ─────────────────────────────────────────────────────

export function makeStackedBarChart(container, labels, datasets, opts = {}) {
  const wrap   = chartWrap(opts.title || '');
  const canvas = canvasInWrap(wrap, opts.height || 320);
  container.appendChild(wrap);

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map(d => ({
        label: d.label,
        data:  d.data,
        backgroundColor: d.color,
        borderWidth: 0,
      })),
    },
    options: {
      ...CHART_DEFAULTS,
      maintainAspectRatio: false,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: true, labels: { color: '#ccc', boxWidth: 12 } },
      },
      scales: {
        x: {
          ...CHART_DEFAULTS.scales.x,
          stacked: true,
          ticks: { color: '#8b92a5', maxRotation: 45 },
        },
        y: {
          ...CHART_DEFAULTS.scales.y,
          stacked: true,
          max: opts.maxY || undefined,
          title: { display: !!opts.yLabel, text: opts.yLabel || '', color: '#8b92a5' },
        },
      },
    },
  });
  return chart;
}

// ── Line chart (Chart.js) ─────────────────────────────────────────────────

export function makeLineChart(container, roundLabels, series, opts = {}) {
  // series: [{player, rounds: [{round, points}]}]
  const wrap   = chartWrap(opts.title || '');
  const canvas = canvasInWrap(wrap, opts.height || 340);
  container.appendChild(wrap);

  const datasets = series.map((s, i) => ({
    label:            s.player,
    data:             roundLabels.map(r => {
      const found = s.rounds.find(x => x.round === r);
      return found != null ? found.points : null;
    }),
    borderColor:      PALETTE[i % PALETTE.length],
    backgroundColor:  PALETTE[i % PALETTE.length] + '33',
    pointRadius:      4,
    pointHoverRadius: 6,
    tension:          0.3,
    spanGaps:         true,
    borderWidth:      2,
  }));

  const chart = new Chart(canvas, {
    type: 'line',
    data: { labels: roundLabels, datasets },
    options: {
      ...CHART_DEFAULTS,
      maintainAspectRatio: false,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: true, labels: { color: '#ccc', boxWidth: 12, usePointStyle: true } },
      },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x, ticks: { color: '#8b92a5', maxRotation: 45 } },
        y: { ...CHART_DEFAULTS.scales.y },
      },
    },
  });
  return chart;
}

// ── Donut chart ───────────────────────────────────────────────────────────

export function makeDonutChart(container, labels, values, colors, opts = {}) {
  const wrap   = chartWrap(opts.title || '');
  const canvas = canvasInWrap(wrap, opts.height || 320);
  container.appendChild(wrap);

  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }],
    },
    options: {
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: '#ccc', boxWidth: 12 },
        },
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.formattedValue} pts (${
              Math.round(ctx.parsed / ctx.dataset.data.reduce((a, b) => a + b, 0) * 1000) / 10
            }%)`,
          },
        },
      },
    },
  });
  return chart;
}

// ── D3 heatmap ────────────────────────────────────────────────────────────

export function makeHeatmap(container, rowLabels, colLabels, matrix, opts = {}) {
  /**
   * matrix[i][j] = value for row i, col j
   * colLabels, rowLabels are arrays
   */
  const MARGIN   = { top: 30, right: 20, bottom: 110, left: 120 };
  const cellW    = opts.cellW || 44;
  const cellH    = opts.cellH || 28;
  const width    = cellW * colLabels.length + MARGIN.left + MARGIN.right;
  const height   = cellH * rowLabels.length + MARGIN.top  + MARGIN.bottom;

  const wrap = el('div', 'd3-container');
  container.appendChild(wrap);

  // Tooltip
  let tooltip = document.querySelector('.d3-tooltip');
  if (!tooltip) {
    tooltip = el('div', 'd3-tooltip');
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
  }

  const svg = d3.select(wrap)
    .append('svg')
    .attr('width',  width)
    .attr('height', height);

  const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

  const xScale = d3.scaleBand().domain(colLabels).range([0, cellW * colLabels.length]).padding(0.04);
  const yScale = d3.scaleBand().domain(rowLabels).range([0, cellH * rowLabels.length]).padding(0.04);

  const flat  = matrix.flat().filter(v => v != null);
  const [vMin, vMax] = d3.extent(flat);
  const colorScale = d3.scaleLinear()
    .domain([vMin, vMax])
    .range(opts.colorRange || ['#0a1f14', ACCENT]);

  // Cells
  rowLabels.forEach((row, ri) => {
    colLabels.forEach((col, ci) => {
      const val = matrix[ri][ci];
      if (val == null) return;
      g.append('rect')
        .attr('x',      xScale(col))
        .attr('y',      yScale(row))
        .attr('width',  xScale.bandwidth())
        .attr('height', yScale.bandwidth())
        .attr('rx', 2).attr('ry', 2)
        .attr('fill', colorScale(val))
        .on('mouseover', (event) => {
          tooltip.style.display = 'block';
          tooltip.textContent = `${row} × ${col}: ${val}`;
        })
        .on('mousemove', (event) => {
          tooltip.style.left = (event.clientX + 12) + 'px';
          tooltip.style.top  = (event.clientY - 28) + 'px';
        })
        .on('mouseleave', () => { tooltip.style.display = 'none'; });

      // Cell value label if cell big enough
      if (cellW >= 30 && cellH >= 20) {
        g.append('text')
          .attr('x', xScale(col) + xScale.bandwidth() / 2)
          .attr('y', yScale(row) + yScale.bandwidth() / 2 + 4)
          .attr('text-anchor', 'middle')
          .attr('font-size', '10px')
          .attr('fill', val > (vMin + vMax) / 2 ? '#fff' : '#ccc')
          .text(val);
      }
    });
  });

  // X axis
  g.append('g')
    .attr('transform', `translate(0,${cellH * rowLabels.length})`)
    .call(d3.axisBottom(xScale).tickSize(0))
    .selectAll('text')
    .attr('fill', '#8b92a5')
    .attr('font-size', '10px')
    .attr('transform', 'rotate(-35)')
    .attr('text-anchor', 'end')
    .attr('dy', '-0.3em');

  g.select('.domain').attr('stroke', 'none');

  // Y axis
  g.append('g')
    .call(d3.axisLeft(yScale).tickSize(0))
    .selectAll('text')
    .attr('fill', '#8b92a5')
    .attr('font-size', '11px');

  g.selectAll('.domain').attr('stroke', 'none');

  if (opts.title) {
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 18)
      .attr('text-anchor', 'middle')
      .attr('fill', '#8b92a5')
      .attr('font-size', '12px')
      .text(opts.title);
  }

  return svg;
}

// ── D3 Sankey ─────────────────────────────────────────────────────────────

export function makeSankey(container, nodes, links, opts = {}) {
  /**
   * nodes: [{id, name, color?, x?}]
   * links: [{source: id, target: id, value, color?}]
   */
  const width  = opts.width  || 700;
  const height = Math.max(opts.height || 400, nodes.length * 22 + 60);
  const MARGIN = { top: 10, right: 30, bottom: 10, left: 30 };

  const wrap = el('div', 'd3-container');
  wrap.style.overflowX = 'auto';
  container.appendChild(wrap);

  const svg = d3.select(wrap)
    .append('svg')
    .attr('width',  Math.max(width,  400))
    .attr('height', height);

  const { sankey, sankeyLinkHorizontal } = d3;

  const sk = sankey()
    .nodeId(d => d.id)
    .nodeWidth(14)
    .nodePadding(opts.nodePadding || 10)
    .extent([
      [MARGIN.left,  MARGIN.top],
      [width - MARGIN.right, height - MARGIN.bottom],
    ]);

  // Deep-copy nodes/links so d3-sankey can mutate them
  const graph = sk({
    nodes: nodes.map(n => ({ ...n })),
    links: links.map(l => ({ ...l })),
  });

  // Tooltip
  let tooltip = document.querySelector('.d3-tooltip');
  if (!tooltip) {
    tooltip = el('div', 'd3-tooltip');
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
  }

  // Links
  svg.append('g')
    .selectAll('path')
    .data(graph.links)
    .join('path')
    .attr('d', sankeyLinkHorizontal())
    .attr('stroke',       d => d.color || 'rgba(100,100,100,.3)')
    .attr('stroke-width', d => Math.max(1, d.width))
    .attr('fill',         'none')
    .attr('opacity',      0.6)
    .on('mouseover', (event, d) => {
      tooltip.style.display = 'block';
      tooltip.textContent   = `${d.source.name} → ${d.target.name}: ${d.value}`;
    })
    .on('mousemove', (event) => {
      tooltip.style.left = (event.clientX + 12) + 'px';
      tooltip.style.top  = (event.clientY - 28) + 'px';
    })
    .on('mouseleave', () => { tooltip.style.display = 'none'; });

  // Nodes
  const nodeG = svg.append('g').selectAll('g').data(graph.nodes).join('g');

  nodeG.append('rect')
    .attr('x',      d => d.x0)
    .attr('y',      d => d.y0)
    .attr('height', d => Math.max(1, d.y1 - d.y0))
    .attr('width',  d => d.x1 - d.x0)
    .attr('fill',   d => d.color || ACCENT)
    .attr('rx', 2).attr('ry', 2)
    .on('mouseover', (event, d) => {
      tooltip.style.display = 'block';
      tooltip.textContent   = `${d.name}: ${d.value}`;
    })
    .on('mousemove', (event) => {
      tooltip.style.left = (event.clientX + 12) + 'px';
      tooltip.style.top  = (event.clientY - 28) + 'px';
    })
    .on('mouseleave', () => { tooltip.style.display = 'none'; });

  // Labels
  nodeG.append('text')
    .attr('x',             d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
    .attr('y',             d => (d.y1 + d.y0) / 2)
    .attr('dy',            '0.35em')
    .attr('text-anchor',   d => d.x0 < width / 2 ? 'start' : 'end')
    .attr('fill',          '#ccc')
    .attr('font-size',     '11px')
    .text(d => d.name);

  return svg;
}

// ── D3 scatter ────────────────────────────────────────────────────────────

export function makeScatter(container, series, opts = {}) {
  /**
   * series: [{player, color, points: [{x, y, label}]}]
   */
  const MARGIN = { top: 20, right: 20, bottom: 60, left: 60 };
  const width  = (opts.width  || 700) - MARGIN.left - MARGIN.right;
  const height = (opts.height || 400) - MARGIN.top  - MARGIN.bottom;

  const wrap = el('div', 'd3-container');
  container.appendChild(wrap);

  const allPts = series.flatMap(s => s.points);

  const xScale = d3.scaleLinear()
    .domain(d3.extent(allPts, d => d.x)).nice()
    .range([0, width]);
  const yScale = d3.scaleLinear()
    .domain(d3.extent(allPts, d => d.y)).nice()
    .range([height, 0]);

  const svg = d3.select(wrap).append('svg')
    .attr('width',  width  + MARGIN.left + MARGIN.right)
    .attr('height', height + MARGIN.top  + MARGIN.bottom);

  const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

  // Grid lines
  g.append('g').attr('class', 'grid')
    .call(d3.axisLeft(yScale).tickSize(-width).tickFormat(''))
    .selectAll('line').attr('stroke', 'rgba(255,255,255,.05)');
  g.select('.grid .domain').remove();

  // Zero line
  if (opts.showZeroLine) {
    g.append('line').attr('x1', xScale(0)).attr('x2', xScale(0))
      .attr('y1', 0).attr('y2', height).attr('stroke', '#888').attr('stroke-dasharray', '4,4');
  }

  // Let tooltip be shared
  let tooltip = document.querySelector('.d3-tooltip');
  if (!tooltip) {
    tooltip = el('div', 'd3-tooltip');
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
  }

  // Points
  series.forEach(s => {
    g.selectAll(null)
      .data(s.points)
      .join('circle')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r',  5)
      .attr('fill', s.color || ACCENT)
      .attr('opacity', 0.75)
      .on('mouseover', (event, d) => {
        tooltip.style.display = 'block';
        tooltip.textContent   = `${s.player}\n${d.round || ''}\n${opts.xLabel || 'x'}: ${Math.round(d.x * 10) / 10}\n${opts.yLabel || 'y'}: ${Math.round(d.y * 10) / 10}`;
      })
      .on('mousemove', (event) => {
        tooltip.style.left = (event.clientX + 12) + 'px';
        tooltip.style.top  = (event.clientY - 28) + 'px';
      })
      .on('mouseleave', () => { tooltip.style.display = 'none'; });
  });

  // Axes
  g.append('g').attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale))
    .selectAll('text').attr('fill', '#8b92a5');
  g.append('g')
    .call(d3.axisLeft(yScale))
    .selectAll('text').attr('fill', '#8b92a5');

  g.selectAll('.domain').attr('stroke', '#2e3340');

  // Axis labels
  if (opts.xLabel) {
    g.append('text').attr('x', width / 2).attr('y', height + 44)
      .attr('text-anchor', 'middle').attr('fill', '#8b92a5').attr('font-size', '11px')
      .text(opts.xLabel);
  }
  if (opts.yLabel) {
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', -46)
      .attr('text-anchor', 'middle').attr('fill', '#8b92a5').attr('font-size', '11px')
      .text(opts.yLabel);
  }

  // Legend
  if (series.length > 1) {
    const legend = g.append('g').attr('transform', `translate(${width - 10}, 0)`);
    series.forEach((s, i) => {
      const row = legend.append('g').attr('transform', `translate(0,${i * 18})`);
      row.append('circle').attr('r', 5).attr('fill', s.color || ACCENT);
      row.append('text').attr('x', 8).attr('dy', '.35em').attr('fill', '#ccc').attr('font-size', '10px').text(s.player);
    });
  }

  return svg;
}

// ── HTML table ────────────────────────────────────────────────────────────

export function htmlTable(cols, rows) {
  /**
   * cols: ['Col1', 'Col2', ...]
   * rows: [{Col1: val, Col2: val, ...}]
   */
  const wrap = el('div', 'data-table-wrap');
  const tbl  = el('table', 'data-table');
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  cols.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  });
  thead.appendChild(tr);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    cols.forEach(c => {
      const td = document.createElement('td');
      td.textContent = row[c] != null ? String(row[c]) : '';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  return wrap;
}

export function destroyChart(chart) {
  if (chart && typeof chart.destroy === 'function') chart.destroy();
}
