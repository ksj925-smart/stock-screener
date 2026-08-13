"""일별 종가·고가·저가·거래량 누적 캐시 — CACHE_DAYS(85)영업일치 유지 (SPEC 7장)

구조: { "005930": [["2026-07-09", 70500, 71200, 69800, 1234567], ...] }
      행 = [날짜, 종가, 고가, 저가, 거래량]. 고가·저가·거래량은 MFI·CCI·ADX·ATR
      계산용으로 2026-08 추가됨(SPEC.md 부록 A). 종가만 쓰던 시절 코드(예:
      backfill_prices.py)가 이 필드 없이 append_prices를 호출해도 죽지 않도록
      append_prices는 .get(key, 0)으로 기본값 0을 채운다 — 그 경우 해당 행은
      고가·저가·거래량이 0으로 기록되어 신규 지표 계산에서 결측 취급된다.

초기 백필은 backfill_ohlcv.py(H/L/V + CACHE_DAYS 전량, SPEC.md 부록 A)로 채우거나,
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
    """오늘 종가·고가·저가·거래량을 증분 append하고 CACHE_DAYS 초과분은 절삭한다.

    자본변경(액면병합·분할·감자·무상증자 등) 감지 시 캐시를 리베이스한다:
    API의 fltRt는 KRX 조정 기준가 대비 등락률이므로 clpr/(1+fltRt/100)이
    '조정된 전일가'다. 이 값이 캐시의 전일 종가와 크게 어긋나면 그 비율로
    과거 종가·고가·저가 전체를 환산해 수정주가처럼 연속성을 유지한다. 이렇게
    하지 않으면 병합 경계일에 가짜 등락(예: 한탑 5:1 병합 +329%)이 생겨 RSI가
    왜곡된다. 고가·저가도 같은 비율로 리베이스해야 ATR·ADX의 True Range가
    경계일에 튀지 않는다.
    ⚠️ 거래량(row[4])은 리베이스하지 않는다 — 액면분할과 거래량의 관계는
    가격처럼 단순 비례하지 않고, 이 프로젝트는 거래량을 과거로 역보정한
    전례가 없다. MFI가 리베이스 경계 근처(최근 14거래일 이내)에서 일시적으로
    부정확할 수 있음을 알려진 한계로 남긴다.
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
                        row[2] = round(row[2] * factor, 4)
                        row[3] = round(row[3] * factor, 4)
                    rebased += 1
        series.append(
            [
                base_date,
                s["close"],
                s.get("high", 0),
                s.get("low", 0),
                s.get("volume", 0),
            ]
        )
        if len(series) > CACHE_DAYS:
            del series[: len(series) - CACHE_DAYS]
    if rebased:
        print(f"자본변경 감지 → 종가 캐시 리베이스 {rebased}종목")
    return cache


def save_cache(cache: dict) -> None:
    os.makedirs(os.path.dirname(PRICE_CACHE_PATH), exist_ok=True)
    with open(PRICE_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))
