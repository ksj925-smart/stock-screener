"""일별 종가 누적 캐시 — RSI(14) 계산용 30영업일치 유지 (SPEC 7장)

구조: { "005930": [["2026-07-09", 70500], ["2026-07-10", 71000], ...] }
초기 백필은 fetch_prices의 기준일 탐색을 날짜별로 여러 번 돌려 채우거나,
매일 파이프라인이 돌며 자연히 누적된다 (개발계정 트래픽으로 충분, SPEC 7-2).
"""

import json
import os

from config import CACHE_DAYS, PRICE_CACHE_PATH


def load_cache() -> dict[str, list[list]]:
    if not os.path.exists(PRICE_CACHE_PATH):
        return {}
    with open(PRICE_CACHE_PATH, encoding="utf-8") as f:
        return json.load(f)


def append_prices(cache: dict, base_date: str, stocks: list[dict]) -> dict:
    """오늘 종가를 증분 append하고 CACHE_DAYS 초과분은 절삭한다."""
    for s in stocks:
        series = cache.setdefault(s["code"], [])
        if series and series[-1][0] == base_date:
            continue  # 같은 날 중복 실행 방어
        series.append([base_date, s["close"]])
        if len(series) > CACHE_DAYS:
            del series[: len(series) - CACHE_DAYS]
    return cache


def save_cache(cache: dict) -> None:
    os.makedirs(os.path.dirname(PRICE_CACHE_PATH), exist_ok=True)
    with open(PRICE_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))
