#!/usr/bin/env python3
"""Refresh ModPackDad's Viscose S2 Easier public benchmark snapshot."""
import importlib.util
import json
import math
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location('voltaic', Path(__file__).with_name('refresh-voltaic.py'))
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
RANKS = ['Unranked', 'Lemming', 'Hare', 'Ermine', 'Puffin', 'Penguin', 'Fox', 'Mammoth', 'Orca', 'Seal']
GROUPS = {'Arm': 'Control Tracking', 'Wrist': 'Control Tracking', 'Fingertip': 'Control Tracking', 'Blending': 'Control Tracking', 'Control': 'Reactive Tracking', 'Speed': 'Reactive Tracking', 'Reading': 'Reactive Tracking', 'Speed ': 'Flick Tech', 'Stability': 'Flick Tech', 'Micro': 'Flick Tech', 'Post-Flick': 'Flick Tech', 'Reading ': 'Click Timing', 'Precision': 'Click Timing', 'Stability ': 'Click Timing'}
SCORES_URL = v.SCORES_URL.replace('2835', '2335')
RANK_URL = v.RANK_URL.replace('2835', '2335')
PROFILE = f'https://evxl.app/u/{v.STEAM_ID}/Viscose%20Benchmarks%20S2/Easier?tab=charts'

def build_report(benchmark, leaderboard):
    players = leaderboard['data']
    if len(players) != 1:
        raise ValueError('Expected one matching player')
    p = players[0]
    if (str(p['steamId']) != v.STEAM_ID or p['benchmarkId'] != 2335
            or p['benchmarkName'] != 'Viscose Benchmarks S2' or p['difficultyName'] != 'Easier'
            or not 0 <= p['rank'] < len(RANKS) or p['rankName'] != RANKS[p['rank']]
            or p['position'] < 1):
        raise ValueError('Unexpected player or benchmark rank')
    if set(benchmark['categories']) != set(GROUPS):
        raise ValueError('Unexpected skill groups')
    rows, skills = [], []
    for skill, category in GROUPS.items():
        skill_rows = []
        for name, raw in benchmark['categories'][skill]['scenarios'].items():
            score, thresholds = raw['score'] / 100, raw['rank_maxes']
            if (not math.isfinite(score) or score < 0 or len(thresholds) != 9
                    or any(not math.isfinite(t) or t <= 0 for t in thresholds)
                    or any(a >= b for a, b in zip(thresholds, thresholds[1:]))):
                raise ValueError('Invalid score or thresholds')
            rank = sum(score >= t for t in thresholds)
            if rank != raw['scenario_rank']:
                raise ValueError('Upstream rank disagrees with thresholds')
            next_score = thresholds[rank] if rank < 9 else None
            lower = thresholds[rank-1] if rank else 0
            progress = rank + (score-lower)/(next_score-lower) if rank < 9 else 9
            row = dict(name=name, category=category, skill=skill.strip(), score=score, thresholds=thresholds,
                       rank=RANKS[rank], rank_index=rank, rank_progress=progress,
                       next_rank=RANKS[rank+1] if rank < 9 else None, next_threshold=next_score,
                       score_to_next=round(next_score-score, 8) if rank < 9 else None)
            rows.append(row)
            skill_rows.append(row)
        best = max(skill_rows, key=lambda r:r['rank_progress'])
        skills.append(dict(name=f'{category} / {skill.strip()}', category=category, best_scenario=best['name'], rank=best['rank'], rank_progress=best['rank_progress']))
    if len(rows) != 39 or len({r['name'] for r in rows}) != 39:
        raise ValueError('Expected 39 unique scenarios')
    return dict(player='ModPackDad', steam_id=v.STEAM_ID, season='Viscose Benchmarks S2', difficulty='Easier', benchmark_id=2335,
                captured_at=datetime.now(timezone.utc).isoformat(timespec='seconds'), score_verified_at=p.get('scoreVerifiedAt'),
                source_profile=PROFILE, source_urls=[RANK_URL,SCORES_URL], overall=dict(rank=p['rankName'],leaderboard_position=p['position']),
                ranks=RANKS, distribution={rank:sum(r['rank']==rank for r in rows) for rank in RANKS}, skills=skills, scenarios=rows)

def main():
    report = build_report(v.fetch(SCORES_URL), v.fetch(RANK_URL))
    output = Path(__file__).resolve().parents[1]/'aim/data/viscose-s2-easier.json'
    payload = json.dumps(report, indent=2, allow_nan=False)+'\n'
    temp = output.with_suffix('.tmp')
    temp.write_text(payload, encoding='utf-8')
    temp.replace(output)
    print(f"Updated {len(report['scenarios'])} scenarios: {report['overall']['rank']}")

if __name__ == '__main__':
    main()
