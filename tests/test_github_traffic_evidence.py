import unittest
from unittest.mock import patch

from scripts.github_traffic_evidence import (
    build_comparison,
    make_summary,
    normalize_traffic,
    upload_private_archive,
)


class TrafficEvidenceTests(unittest.TestCase):
    def test_utc_daily_and_rolling_uniques_are_distinct(self):
        raw = {
            "count": 9,
            "uniques": 2,
            "clones": [
                {"timestamp": "2026-10-20T00:00:00Z", "count": 4, "uniques": 2},
                {"timestamp": "2026-10-19T00:00:00Z", "count": 5, "uniques": 2},
            ],
        }
        parsed = normalize_traffic(raw, "clones")
        self.assertEqual(parsed["rolling_14d_count"], 9)
        self.assertEqual(parsed["rolling_14d_uniques"], 2)
        self.assertEqual(parsed["daily"][0]["date"], "2026-10-19")
        self.assertNotEqual(sum(x["uniques"] for x in parsed["daily"]), parsed["rolling_14d_uniques"])

    def test_reject_invalid_traffic(self):
        with self.assertRaises(ValueError):
            normalize_traffic({"count": 1, "uniques": 1, "clones": []}, "views")
        with self.assertRaises(ValueError):
            normalize_traffic(
                {"count": 1, "uniques": 1,
                 "clones": [{"timestamp": "2026-10-19T00:00:00Z", "count": 1, "uniques": 2}]},
                "clones",
            )

    def test_comparison_does_not_infer_external_clones(self):
        clones = {"daily": [{"date": "2026-10-20", "count": 20, "uniques": 5}]}
        views = {"daily": [{"date": "2026-10-21", "count": 4, "uniques": 2}]}
        comparison = build_comparison(clones, views, {"2026-10-20": 8, "2026-10-21": 2})
        self.assertEqual(comparison[0]["clones"], 20)
        self.assertEqual(comparison[0]["action_workflow_runs"], 8)
        self.assertIsNone(comparison[1]["clones"])
        self.assertNotIn("external_cloners", comparison[0])
        self.assertNotIn("ci_clones", comparison[0])

    def test_refuse_public_archive(self):
        with patch("scripts.github_traffic_evidence.request_json", return_value={"private": False}) as call:
            with self.assertRaisesRegex(ValueError, "PRIVATE"):
                upload_private_archive("example/public", "token", "snapshots/test.json", b"{}")
            self.assertEqual(call.call_count, 1)

    def test_summary_warns_about_identity(self):
        snap = {
            "repository": "demo/repo",
            "collected_at_utc": "2026-11-02T00:00:00+00:00",
            "clones": {"rolling_14d_count": 120, "rolling_14d_uniques": 7},
            "views": {"rolling_14d_count": 2, "rolling_14d_uniques": 1},
            "daily_comparison": [{"date_utc": "2026-11-01", "clones": 10,
                                  "unique_cloners": 3, "action_workflow_runs": 5}],
        }
        summary = make_summary(snap, "artifact")
        self.assertIn("120", summary)
        self.assertIn("不能證明誰複製", summary)


if __name__ == "__main__":
    unittest.main()
