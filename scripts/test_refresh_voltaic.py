"""Rank boundaries and upstream consistency checks for the public snapshot."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("refresh_voltaic", Path(__file__).with_name("refresh-voltaic.py"))
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)


class ScenarioMetricsTests(unittest.TestCase):
    def metrics(self, score, rank):
        return refresh.scenario_metrics({"score": score * 100, "scenario_rank": rank,
                                         "rank_maxes": [100, 200, 300, 400]})

    def test_unranked_and_zero(self):
        self.assertEqual(self.metrics(0, 0)["rank_progress"], 0)
        self.assertEqual(self.metrics(99, 0)["score_to_next"], 1)

    def test_exact_thresholds(self):
        for rank in range(1, 5):
            result = self.metrics(rank * 100, rank)
            self.assertEqual(result["rank"], refresh.RANKS[rank])
            self.assertEqual(result["rank_progress"], rank)

    def test_fractional_score_and_display_units(self):
        result = self.metrics(224.3, 2)
        self.assertEqual(result["score"], 224.3)
        self.assertEqual(result["rank_progress"], 2.243)
        self.assertEqual(result["score_to_next"], 75.7)

    def test_gold_is_capped_without_inventing_next_rank(self):
        result = self.metrics(472.25, 4)
        self.assertEqual(result["rank_progress"], 4)
        self.assertIsNone(result["next_rank"])
        self.assertIsNone(result["score_to_next"])

    def test_mismatched_upstream_rank_rejected(self):
        with self.assertRaises(ValueError):
            self.metrics(224.3, 3)

    def test_invalid_thresholds_and_nonfinite_scores_rejected(self):
        for thresholds in ([100, 100, 300, 400], [100, 200, 300], [0, 100, 200, 300]):
            with self.assertRaises(ValueError):
                refresh.scenario_metrics({"score": 1, "scenario_rank": 0, "rank_maxes": thresholds})
        with self.assertRaises(ValueError):
            self.metrics(float("nan"), 0)


if __name__ == "__main__":
    unittest.main()
