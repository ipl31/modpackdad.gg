#!/usr/bin/env python3
"""Refresh the public Voltaic S5.5 Novice snapshot; no credentials required."""
import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

STEAM_ID = "76561197968707740"
BENCHMARK_ID = 2835
PROFILE = f"https://evxl.app/u/{STEAM_ID}/Voltaic%20S5.5/Novice?tab=charts"
SCORES_URL = f"https://kovaaks.com/webapp-backend/benchmarks/player-progress-rank-benchmark?benchmarkId={BENCHMARK_ID}&steamId={STEAM_ID}&page=0&max=100"
RANK_URL = f"https://api.evxl.app/leaderboard?benchmarkId={BENCHMARK_ID}&page=0&max=1&steamIdSearch={STEAM_ID}"
RANKS = ["Unranked", "Iron", "Bronze", "Silver", "Gold"]
GROUPS = {
    "Dynamic": "Clicking", "Static": "Clicking", "Linear": "Clicking",
    "Precise": "Tracking", "Reactive": "Tracking", "Control": "Tracking",
    "Speed": "Switching", "Evasive": "Switching", "Stability": "Switching",
}


def scenario_metrics(raw):
    # KovaaK's endpoint stores scores in hundredths; thresholds use display units.
    score = raw["score"] / 100
    thresholds = raw["rank_maxes"]
    if (not math.isfinite(score) or score < 0 or len(thresholds) != 4
            or any(not math.isfinite(t) or t <= 0 for t in thresholds)
            or any(a >= b for a, b in zip(thresholds, thresholds[1:]))):
        raise ValueError("Invalid score or rank thresholds")
    rank = sum(score >= cutoff for cutoff in thresholds)
    if rank != raw["scenario_rank"]:
        raise ValueError("Score thresholds and upstream scenario rank disagree")
    next_threshold = thresholds[rank] if rank < 4 else None
    lower = thresholds[rank - 1] if rank else 0
    progress = rank + (score - lower) / (next_threshold - lower) if rank < 4 else 4
    return {
        "score": score, "rank": RANKS[rank], "rank_index": rank,
        "rank_progress": round(progress, 8), "thresholds": thresholds,
        "next_rank": RANKS[rank + 1] if rank < 4 else None,
        "next_threshold": next_threshold,
        "score_to_next": round(next_threshold - score, 8) if rank < 4 else None,
    }


def build_report(benchmark, leaderboard):
    players = leaderboard["data"]
    if len(players) != 1:
        raise ValueError("Expected one matching player")
    player = players[0]
    if (str(player["steamId"]) != STEAM_ID or player["benchmarkId"] != BENCHMARK_ID
            or player["benchmarkName"] != "Voltaic S5.5" or player["difficultyName"] != "Novice"
            or not 0 <= player["rank"] < len(RANKS)
            or player["rankName"] != RANKS[player["rank"]]
            or not math.isfinite(player["energy"]) or player["energy"] < 0
            or player["position"] < 1):
        raise ValueError("Unexpected player, benchmark, difficulty, or overall rank")
    if set(benchmark["categories"]) != set(GROUPS):
        raise ValueError("Unexpected benchmark skill groups")
    scenarios, skills = [], []
    for skill, category in GROUPS.items():
        skill_rows = []
        for name, raw in benchmark["categories"][skill]["scenarios"].items():
            row = {"name": name, "category": category, "skill": skill, **scenario_metrics(raw)}
            scenarios.append(row)
            skill_rows.append(row)
        best = max(skill_rows, key=lambda row: row["rank_progress"])
        skills.append({"name": skill, "category": category, "best_scenario": best["name"],
                       "rank": best["rank"], "rank_progress": best["rank_progress"]})
    if len(scenarios) != 21 or len({row["name"] for row in scenarios}) != 21:
        raise ValueError("Expected 21 unique Novice scenarios")
    return {
        "player": "ModPackDad", "steam_id": STEAM_ID,
        "season": "Voltaic S5.5", "difficulty": "Novice", "benchmark_id": BENCHMARK_ID,
        "captured_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "score_verified_at": player.get("scoreVerifiedAt"),
        "source_profile": PROFILE, "source_urls": [RANK_URL, SCORES_URL],
        "overall": {"rank": player["rankName"], "energy": player["energy"],
                    "leaderboard_position": player["position"]},
        "ranks": RANKS,
        "distribution": {rank: Counter(row["rank"] for row in scenarios)[rank] for rank in RANKS},
        "skills": skills, "scenarios": scenarios,
        "method": "Overall rank, energy, and leaderboard position are reported by EVXL. Scenario scores and thresholds come from KovaaK's public benchmark endpoint, with scores divided by 100 for display. Skill profile shows the highest scenario rank progress in each skill, interpolated between rank thresholds and capped at Gold. It is not the overall rank formula. This is a captured snapshot, not a live feed or a historical trend.",
    }


def fetch(url):
    request = Request(url, headers={"User-Agent": "modpackdad.gg benchmark snapshot"})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def main():
    report = build_report(fetch(SCORES_URL), fetch(RANK_URL))
    output = Path(__file__).resolve().parents[1] / "aim/data/voltaic-s55-novice.json"
    # Validate everything before replacing the previous snapshot.
    payload = json.dumps(report, indent=2, allow_nan=False) + "\n"
    temporary = output.with_suffix(".tmp")
    temporary.write_text(payload, encoding="utf-8")
    temporary.replace(output)
    print(f"Updated {len(report['scenarios'])} scenarios: {report['overall']['rank']}, {report['overall']['energy']} energy")


if __name__ == "__main__":
    main()
