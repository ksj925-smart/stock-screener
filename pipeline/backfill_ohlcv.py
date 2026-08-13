"""고가·저가·거래량 + CACHE_DAYS(85) 워밍업용 과거 시세 백필 (1회성).

backfill_prices.py(RSI(14) 워밍업, 30영업일)와 동일한 패턴을 재사용한다.
차이는 두 가지뿐이다:
  1. 종가·등락률뿐 아니라 고가·저가·거래량도 함께 모은다 (MFI·CCI·ADX·ATR용).
  2. CACHE_DAYS가 65→85로 늘어난 만큼(SPEC.md 부록 A), 볼린저밴드를 60일
     차트 전체 구간에 그리는 데 필요한 깊이까지 한 번에 채운다.

이 스크립트는 캐시를 처음부터(빈 dict) 다시 쌓아 완전히 덮어쓴다 —
backfill_prices.py와 동일한 전략이다. append_prices()의 자본변경 리베이스
로직이 collected 구간(과거→현재 순서로 append)에 대해 그대로 다시 적용되므로,
이 85영업일 창 안에서 일어난 액면분할·병합은 처음부터 다시 올바르게 리베이스된다
(그보다 오래된 과거의 리베이스 상태는 이 창 밖이라 애초에 무관하다).

호출 비용: CACHE_DAYS(85) 영업일 ≈ 119 캘린더일(주말 제외, 공휴일은 빈 응답)
           ≈ 85~95콜. 개발계정 10,000건/일 한도의 1% 미만.
"""

import datetime as dt
import sys

import requests

from config import (
    API_KEY,
    CACHE_DAYS,
    PRICE_API,
    PRICE_CACHE_PATH,
    REQUEST_TIMEOUT,
)
from fetch_prices import is_excluded
from price_cache import append_prices, save_cache

# 전종목이 한 페이지에 들어오도록 넉넉히 (basDt당 1콜). 실측 totalCount ≈ 2,880.
FULL_ROWS = 4000

# 거슬러 올라가며 훑을 최대 캘린더 일수.
# CACHE_DAYS(85)영업일 ≈ 119일이라 backfill_prices.py의 110일 한도로는 부족했다
# (그 파일은 65영업일 기준으로 산정됨). 140일이면 설·추석 같은 긴 연휴가 낀
# 시기에도 85영업일을 안전하게 확보한다. 주말은 조회조차 안 하므로 실제 API
# 호출은 영업일 수(≈85~100콜)에 그치고, 개발계정 10,000콜/일 한도 대비 1% 미만이다.
SCAN_LIMIT_DAYS = 140


def fetch_day(bas_dt: str) -> dict[str, dict] | None:
    """basDt 하루치 { '005930': {'close':.., 'rate':.., 'high':.., 'low':.., 'volume':..}, .. }.

    등락률(fltRt)을 함께 받는 이유: 백필 구간 안에서 일어난 액면분할·병합을
    감지해 소급 리베이스하려면 '조정된 전일가'(clpr/(1+fltRt/100))가 필요하다.
    종가만 받으면 분할 경계에 점프가 남아 차트 스케일이 깨진다.
    """
    query = {
        "serviceKey": API_KEY,
        "resultType": "json",
        "numOfRows": FULL_ROWS,
        "pageNo": 1,
        "basDt": bas_dt,
    }
    try:
        res = requests.get(PRICE_API, params=query, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        body = res.json().get("response", {}).get("body", {})
        items = body.get("items", {}).get("item", [])
        if isinstance(items, dict):
            items = [items]
    except (requests.RequestException, ValueError):
        return None
    if not items:
        return None  # 주말·공휴일
    out = {}
    for it in items:
        mkt = it.get("mrktCtg", "")
        if mkt not in ("KOSPI", "KOSDAQ"):
            continue
        name = it.get("itmsNm", "")
        if is_excluded(name):
            continue
        try:
            out[it["srtnCd"][-6:]] = {
                "close": int(it["clpr"]),
                "rate": float(it.get("fltRt") or 0),
                "high": int(it.get("hipr") or 0),
                "low": int(it.get("lopr") or 0),
                "volume": int(it.get("trqu") or 0),
            }
        except (KeyError, ValueError):
            continue
    return out


def main() -> None:
    if not API_KEY:
        sys.exit("환경변수 DATA_GO_KR_API_KEY가 설정되지 않았습니다.")

    days_needed = CACHE_DAYS
    collected: list[tuple[str, dict[str, dict]]] = []
    day = dt.date.today()
    scanned = 0
    while len(collected) < days_needed and scanned < SCAN_LIMIT_DAYS:
        scanned += 1
        day -= dt.timedelta(days=1)
        if day.weekday() >= 5:  # 토(5)·일(6)은 조회 안 함
            continue
        bas_dt = day.strftime("%Y%m%d")
        prices = fetch_day(bas_dt)
        if not prices:
            continue  # 공휴일 등
        base_date = f"{bas_dt[:4]}-{bas_dt[4:6]}-{bas_dt[6:]}"
        collected.append((base_date, prices))
        print(f"  {base_date}: {len(prices)}종목 수집 ({len(collected)}/{days_needed})")

    # 과거→현재 시간순으로 정렬해 캐시에 쌓는다 (지표 계산은 오래된 것부터 필요)
    collected.reverse()
    cache: dict[str, list[list]] = {}
    for base_date, prices in collected:
        stocks = [
            {"code": code, **v}
            for code, v in prices.items()
        ]
        cache = append_prices(cache, base_date, stocks)

    save_cache(cache)
    print(
        f"완료: {len(collected)}영업일 백필(고가·저가·거래량 포함), "
        f"{len(cache)}종목 → {PRICE_CACHE_PATH}\n"
        f"      (조회 시도 {scanned}일, 개발계정 10,000콜/일 한도 대비 무시할 수준)"
    )
    if len(collected) < days_needed:
        print(
            f"경고: 목표 {days_needed}영업일 중 {len(collected)}일만 수집됨. "
            "과거 데이터 보존 기간을 확인하세요.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
