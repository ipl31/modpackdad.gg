(() => {
    'use strict';
    let report;
    const $ = id => document.getElementById(id);
    const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const number = value => Number(value).toLocaleString('en-US', {maximumFractionDigits: 2});
    const rankClass = rank => `rank-${rank.toLowerCase()}`;
    const date = value => new Intl.DateTimeFormat('en-US', {dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC'}).format(new Date(value)) + ' UTC';
    const remaining = row => row.next_rank ? row.rank_index + 1 - row.rank_progress : Infinity;

    function renderRadar() {
        const skills = report.skills;
        const center = 240, radius = 158;
        const point = (index, scale) => {
            const angle = -Math.PI / 2 + index * Math.PI * 2 / skills.length;
            return [center + Math.cos(angle) * radius * scale, center + Math.sin(angle) * radius * scale];
        };
        const points = scale => skills.map((_, i) => point(i, scale).join(',')).join(' ');
        const rings = [1, 2, 3, 4].map(rank => `<polygon points="${points(rank / 4)}" fill="none" stroke="#ffffff20"/><text class="ring-label" x="248" y="${center - radius * rank / 4 - 5}">${report.ranks[rank]}</text>`).join('');
        const axes = skills.map((skill, i) => {
            const [x, y] = point(i, 1), [lx, ly] = point(i, 1.22);
            return `<line x1="240" y1="240" x2="${x}" y2="${y}" stroke="#ffffff15"/><text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${escape(skill.name)}</text>`;
        }).join('');
        const values = skills.map((skill, i) => point(i, skill.rank_progress / 4).join(',')).join(' ');
        const dots = skills.map((skill, i) => {
            const [x, y] = point(i, skill.rank_progress / 4);
            return `<circle cx="${x}" cy="${y}" r="4" fill="#00d4e5"><title>${escape(skill.name)}: ${escape(skill.rank)} · ${escape(skill.best_scenario)}</title></circle>`;
        }).join('');
        $('radar').innerHTML = `<svg class="radar" viewBox="0 0 480 480" role="img" aria-labelledby="radar-title radar-desc"><title id="radar-title">Voltaic skill profile</title><desc id="radar-desc">${skills.map(skill => `${escape(skill.name)}: ${escape(skill.rank)}`).join('. ')}. Best scenario in each skill; Gold is capped at the outer ring.</desc>${rings}${axes}<polygon points="${values}" fill="#00d4e526" stroke="#00d4e5" stroke-width="2"/>${dots}</svg>`;
        $('skill-list').innerHTML = skills.map(skill => `<li><span>${escape(skill.name)}</span><strong class="${rankClass(skill.rank)}">${escape(skill.rank)}</strong></li>`).join('');
    }

    function renderScenarios() {
        const query = $('scenario-search').value.trim().toLowerCase();
        const category = $('category-filter').value;
        const sort = $('scenario-sort').value;
        const rows = report.scenarios.filter(row => row.name.toLowerCase().includes(query) && (category === 'all' || row.category === category));
        if (sort === 'rank') rows.sort((a, b) => b.rank_progress - a.rank_progress);
        if (sort === 'next') rows.sort((a, b) => remaining(a) - remaining(b));
        if (sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));
        $('result-count').textContent = `${rows.length} of ${report.scenarios.length} scenarios`;
        $('scenario-list').innerHTML = rows.length ? rows.map(row => `<article class="scenario-card">
            <p class="eyebrow">${escape(row.category)} / ${escape(row.skill)}</p>
            <h3>${escape(row.name)}</h3>
            <div class="score-line"><strong>${number(row.score)}</strong><span class="rank-badge ${rankClass(row.rank)}">${escape(row.rank)}</span></div>
            <div class="thresholds" aria-label="Rank score thresholds">${row.thresholds.map((threshold, i) => `<div class="threshold ${rankClass(report.ranks[i + 1])} ${row.score >= threshold ? 'reached' : ''}"><span>${escape(report.ranks[i + 1])}</span><strong>${number(threshold)}</strong></div>`).join('')}</div>
            <p class="next-rank">${row.next_rank ? `${number(row.score_to_next)} more score to ${escape(row.next_rank)} (${number(row.next_threshold)}).` : 'Gold reached · highest rank in Novice.'}</p>
        </article>`).join('') : '<p>No scenarios match these filters.</p>';
    }

    function render() {
        $('overall-rank').textContent = report.overall.rank;
        $('overall-rank').className = rankClass(report.overall.rank);
        $('energy').textContent = number(report.overall.energy);
        $('position').textContent = '#' + number(report.overall.leaderboard_position);
        const ranked = report.scenarios.filter(row => row.rank_index > 0).length;
        $('ranked-count').textContent = `${ranked} / ${report.scenarios.length}`;
        $('snapshot-date').textContent = `Snapshot captured ${date(report.captured_at)}`;
        $('verified-date').textContent = report.score_verified_at ? `EVXL last verified the overall scores ${date(report.score_verified_at)}.` : 'EVXL did not supply an overall score verification date.';
        renderRadar();
        $('distribution').innerHTML = report.ranks.map(rank => `<div class="distribution-row ${rankClass(rank)}"><span>${escape(rank)}</span><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${report.distribution[rank] / report.scenarios.length * 100}%"></div></div><strong aria-label="${report.distribution[rank]} ${escape(rank)} scenarios">${report.distribution[rank]}</strong></div>`).join('');
        const closest = report.scenarios.filter(row => row.next_rank).sort((a, b) => remaining(a) - remaining(b))[0];
        $('closest-name').textContent = closest.name;
        $('closest-detail').textContent = `${number(closest.score_to_next)} score to ${closest.next_rank} · current best ${number(closest.score)}`;
        renderScenarios();
        $('dashboard').hidden = false;
    }

    ['scenario-search', 'category-filter', 'scenario-sort'].forEach(id => {
        $(id).addEventListener(id === 'scenario-search' ? 'input' : 'change', () => { if (report) renderScenarios(); });
    });
    fetch('../data/voltaic-s55-novice.json').then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }).then(data => {
        if (!Array.isArray(data.scenarios) || data.scenarios.length !== 21 || data.skills.length !== 9) throw new Error('Invalid ranking snapshot');
        report = data;
        render();
    }).catch(error => {
        $('snapshot-date').textContent = 'The ranking snapshot could not be loaded. View the latest results on EVXL using the link alongside this message.';
        $('dashboard').hidden = true;
        console.error('Voltaic snapshot:', error);
    });
})();
