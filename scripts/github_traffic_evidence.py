#!/usr/bin/env python3
"""Archive GitHub traffic snapshots without guessing the identity of cloners.

Stdlib-only; used by .github/workflows/github-traffic-evidence.yml.
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.github.com"
API_VERSION = "2022-11-28"
REPO_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def request_json(path: str, token: str, method: str = "GET", payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        API + path,
        data=data,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": "Bearer " + token,
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": "yorubay-traffic-evidence",
            **({"Content-Type": "application/json"} if data is not None else {}),
        },
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def normalize_traffic(payload: dict, array_key: str) -> dict:
    if not isinstance(payload, dict) or not isinstance(payload.get(array_key), list):
        raise ValueError(f"Invalid traffic response: missing {array_key} array")
    daily = {}
    for point in payload[array_key]:
        date = str(point["timestamp"])[:10]
        dt.date.fromisoformat(date)
        count = int(point["count"])
        uniques = int(point["uniques"])
        if min(count, uniques) < 0 or uniques > count:
            raise ValueError(f"Invalid traffic counts for {date}")
        daily[date] = {"date": date, "count": count, "uniques": uniques}
    total = int(payload["count"])
    overall_uniques = int(payload["uniques"])
    if min(total, overall_uniques) < 0 or overall_uniques > total:
        raise ValueError("Invalid rolling 14-day totals")
    return {
        "rolling_14d_count": total,
        "rolling_14d_uniques": overall_uniques,
        "daily": [daily[d] for d in sorted(daily)],
    }


def build_comparison(clones: dict, views: dict, action_runs: dict[str, int]) -> list[dict]:
    clone_days = {x["date"]: x for x in clones["daily"]}
    view_days = {x["date"]: x for x in views["daily"]}
    days = sorted(set(clone_days) | set(view_days))
    return [
        {
            "date_utc": date,
            "clones": clone_days.get(date, {}).get("count"),
            "unique_cloners": clone_days.get(date, {}).get("uniques"),
            "views": view_days.get(date, {}).get("count"),
            "unique_visitors": view_days.get(date, {}).get("uniques"),
            "action_workflow_runs": action_runs.get(date),
        }
        for date in days
    ]


def get_action_runs(repo: str, dates: list[str], token: str) -> dict[str, int]:
    result = {}
    for date in dates:
        # GitHub's endpoint provides total_count even with per_page=1.
        query = urllib.parse.urlencode({"created": date, "per_page": 1})
        payload = request_json(f"/repos/{repo}/actions/runs?{query}", token)
        result[date] = int(payload["total_count"])
    return result


def upload_private_archive(repo: str, token: str, path: str, content: bytes) -> str:
    if not REPO_PATTERN.fullmatch(repo):
        raise ValueError("TRAFFIC_ARCHIVE_REPO must be owner/name")
    metadata = request_json(f"/repos/{repo}", token)
    if metadata.get("private") is not True:
        raise ValueError("Archive destination must be PRIVATE; refusing to publish traffic data")
    safe_path = "/".join(urllib.parse.quote(part, safe="") for part in path.split("/"))
    contents_path = f"/repos/{repo}/contents/{safe_path}"
    try:
        request_json(contents_path, token)
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
    else:
        # Preserve evidence: never silently overwrite a snapshot.
        return "existing snapshot retained"
    request_json(
        contents_path,
        token,
        method="PUT",
        payload={
            "message": "archive: GitHub traffic snapshot " + path.rsplit("/", 1)[-1],
            "content": base64.b64encode(content).decode("ascii"),
        },
    )
    return "saved to private repository"


def make_summary(snapshot: dict, status: str) -> str:
    clones, views = snapshot["clones"], snapshot["views"]
    rows = sorted(snapshot["daily_comparison"], key=lambda x: x["date_utc"], reverse=True)
    lines = [
        "# GitHub Traffic 每日存證",
        "",
        f"- Repo: \`{snapshot['repository']}\`",
        f"- 擷取時間 (UTC): {snapshot['collected_at_utc']}",
        f"- 最近 14 天 Clone：**{clones['rolling_14d_count']:,}**；Unique cloners：**{clones['rolling_14d_uniques']:,}**",
        f"- 最近 14 天 Views：**{views['rolling_14d_count']:,}**；Unique visitors：**{views['rolling_14d_uniques']:,}**",
        f"- 保存狀態：{status}",
        "",
        "| UTC 日期 | Clone | Unique cloners | Actions workflow runs |",
        "|---|---:|---:|---:|",
    ]
    for row in rows:
        fmt = lambda value: "—" if value is None else str(value)
        lines.append(
            f"| {row['date_utc']} | {fmt(row['clones'])} | "
            f"{fmt(row['unique_cloners'])} | {fmt(row['action_workflow_runs'])} |"
        )
    lines += [
        "",
        "> 注意：Actions 執行次數並不等於 checkout/clone 次數；"
        "Unique cloners 不是人數或身分。這份資料只能分析趨勢，不能證明誰複製了原始碼。",
        "",
        "> 「14 天 Unique cloners」是跨日期去重的總數，不能直接將每日 unique 相加。",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    traffic_token = os.environ.get("GH_TRAFFIC_TOKEN", "")
    actions_token = os.environ.get("GITHUB_TOKEN", "")
    if not REPO_PATTERN.fullmatch(repository):
        raise RuntimeError("Missing/invalid GITHUB_REPOSITORY")
    if not traffic_token:
        raise RuntimeError("Missing GH_TRAFFIC_TOKEN; configure the TRAFFIC_READ_TOKEN Actions secret")
    if not actions_token:
        raise RuntimeError("Missing GITHUB_TOKEN (Actions read permission required)")
    archive_repo = os.environ.get("GH_ARCHIVE_REPO", "").strip()
    archive_token = os.environ.get("GH_ARCHIVE_TOKEN", "").strip()
    if not archive_repo or not archive_token:
        raise RuntimeError("Private archive REQUIRED: configure TRAFFIC_ARCHIVE_REPO and TRAFFIC_ARCHIVE_TOKEN")

    clones = normalize_traffic(
        request_json(f"/repos/{repository}/traffic/clones?per=day", traffic_token), "clones"
    )
    views = normalize_traffic(
        request_json(f"/repos/{repository}/traffic/views?per=day", traffic_token), "views"
    )
    dates = sorted({d["date"] for d in clones["daily"]} | {d["date"] for d in views["daily"]})
    if not dates:
        raise RuntimeError("Traffic API returned no daily rows; refusing to record an empty snapshot")
    action_runs = get_action_runs(repository, dates, actions_token)
    now = dt.datetime.now(dt.timezone.utc)
    day = now.date().isoformat()
    run_id = str(os.environ.get("GITHUB_RUN_ID", "local"))
    attempt = str(os.environ.get("GITHUB_RUN_ATTEMPT", "1"))
    snapshot = {
        "schema_version": 1,
        "repository": repository,
        "collected_at_utc": now.isoformat(timespec="seconds"),
        "source": "GitHub REST traffic + Actions workflow runs",
        "run": {"id": run_id, "attempt": attempt},
        "clones": clones,
        "views": views,
        "daily_comparison": build_comparison(clones, views, action_runs),
        "limits": [
            "GitHub traffic is available for only the rolling previous 14 days.",
            "All dates are UTC.",
            "Unique cloners are not identifiable people, and cannot be summed across days.",
            "Action workflow runs are not equivalent to action checkout steps.",
            "No individual or external clone attribution is possible from this data.",
        ],
    }
    out = pathlib.Path("traffic-evidence-output")
    out.mkdir(exist_ok=True)
    filename = f"traffic-{day}-run-{run_id}-attempt-{attempt}.json"
    content = (json.dumps(snapshot, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")
    (out / filename).write_bytes(content)

    location = f"traffic-snapshots/{day}/{filename}"
    status = upload_private_archive(archive_repo, archive_token, location, content)
    summary = make_summary(snapshot, status)
    upload_private_archive(archive_repo, archive_token, location[:-5] + ".md", summary.encode("utf-8"))
    # Public repository artifacts, logs and summaries can be read by others.
    # Never emit the protected traffic values to these surfaces.
    print("Traffic evidence stored in configured PRIVATE repository.")
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as f:
            f.write("### GitHub Traffic Evidence\n\nPrivate snapshot stored successfully. "
                    "Open the configured private archive repository to inspect statistics.\n")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as exc:
        # Do not print tokens/headers, or echo response bodies.
        print(f"GitHub API request failed (HTTP {exc.code})", file=sys.stderr)
        raise SystemExit(1) from None
    except Exception as exc:
        print(f"Traffic archive failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from None
