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


# 캐시 전일 종가와 API 조정 전일가의 허용 오차. fltRt 반올림 오차는 0.1% 미만이고
# 병합·분할·감자·무상증자는 수십~수백% 차이라 5%면 오탐 없이 구분된다.
REBASE_TOLERANCE = 0.05


def append_prices(cache: dict, base_date: str, stocks: list[dict]) -> dict:
    """오늘 종가를 증분 append하고 CACHE_DAYS 초과분은 절삭한다.

    자본변경(액면병합·분할·감자·무상증자 등) 감지 시 캐시를 리베이스한다:
    API의 fltRt는 KRX 조정 기준가 대비 등락률이므로 clpr/(1+fltRt/100)이
    '조정된 전일가'다. 이 값이 캐시의 전일 종가와 크게 어긋나면 그 비율로
    과거 종가 전체를 환산해 수정주가처럼 연속성을 유지한다. 이렇게 하지
    않으면 병합 경계일에 가짜 등락(예: 한탑 5:1 병합 +329%)이 생겨 RSI가
    왜곡된다.
    """
    rebased = 0
    for s in stocks:
        series = cache.setdefault(s["code"], [])
        if series and series[-1][0] == base_date:
            continue  # 같은 날 중복 실행 방어
        if series:
            prev_cached = series[-1][1]
            implied_prev = s["close"] / (1 + s["rate"] / 100)
            if prev_cached > 0 and implied_prev > 0:
                factor = implied_prev / prev_cached
                if abs(factor - 1) > REBASE_TOLERANCE:
                    for row in series:
                        row[1] = round(row[1] * factor, 4)
                    rebased += 1
        series.append([base_date, s["close"]])
        if len(series) > CACHE_DAYS:
            del series[: len(series) - CACHE_DAYS]
    if rebased:
        print(f"자본변경 감지 → 종가 캐시 리베이스 {rebased}종목")
    return cache


def save_cache(cache: dict) -> None:
    os.makedirs(os.path.dirname(PRICE_CACHE_PATH), exist_ok=True)
    with open(PRICE_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))
