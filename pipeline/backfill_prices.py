"""RSI(14) 워밍업용 과거 종가 백필 (1회성, SPEC 7장 보완).

문제: 매일 파이프라인이 종가를 1봉씩 누적하므로 RSI(14)는 14영업일 후에야 나온다.
      → 출시가 3주 밀린다.
해결: 주식시세정보 API는 과거 basDt 조회를 지원하고(2024년까지 확인),
      numOfRows를 크게 주면 전종목이 1콜에 온다(basDt 1일 = API 1콜).
      → 오늘부터 거슬러 올라가며 CACHE_DAYS(기본 30) 영업일치 종가를 모아
        price_cache.json을 채운다. 출시일부터 RSI가 바로 계산된다.

호출 비용: CACHE_DAYS 영업일 ≈ 30~45콜 (주말은 weekday로 건너뜀, 공휴일은 빈 응답).
           개발계정 10,000건/일 한도의 0.5% 미만. 완전히 안전.

주의: fetch_prices와 동일한 필터(KOSPI·KOSDAQ, 스팩·우선주 제외)를 적용해
      스크리너 유니버스와 캐시 종목을 일치시킨다.
"""

import datetime as dt
import json
import sys

import requests

from config import (
    API_KEY,
    CACHE_DAYS,
    PAGE_SIZE,
    PRICE_API,
    PRICE_CACHE_PATH,
    REQUEST_TIMEOUT,
)
from fetch_prices import is_excluded
from price_cache import append_prices, save_cache

# 전종목이 한 페이지에 들어오도록 넉넉히 (basDt당 1콜). 실측 totalCount ≈ 2,880.
FULL_ROWS = max(PAGE_SIZE, 4000)


def fetch_day(bas_dt: str) -> dict[str, dict] | None:
    """basDt 하루치 종가·등락률 { '005930': {'close':70500,'rate':-1.2}, ... }.

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
            }
        except (KeyError, ValueError):
            continue
    return out


def main() -> None:
    days_needed = CACHE_DAYS
    # (base_date, {code: {'close':..,'rate':..}})
    collected: list[tuple[str, dict[str, dict]]] = []
    day = dt.date.today()
    scanned = 0
    # 넉넉히 90일 이내에서 영업일 days_needed개를 찾는다 (공휴일 여유 포함)
    while len(collected) < days_needed and scanned < 90:
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

    # 과거→현재 시간순으로 정렬해 캐시에 쌓는다 (RSI는 오래된 것부터 필요)
    collected.reverse()
    # ⚠️ 매일 append와 똑같이 append_prices를 태운다. 직접 배열에 쌓으면
    #    백필 구간 안의 액면분할·병합이 조정되지 않아 차트에 점프가 남는다
    #    (예: 5:1 병합 종목의 과거 종가가 현재가의 1/5로 찍힘).
    #    같은 함수를 재사용해 두 경로의 리베이스 동작이 갈리지 않게 한다.
    cache: dict[str, list[list]] = {}
    for base_date, prices in collected:
        stocks = [
            {"code": code, "close": v["close"], "rate": v["rate"]}
            for code, v in prices.items()
        ]
        cache = append_prices(cache, base_date, stocks)

    save_cache(cache)
    print(
        f"완료: {len(collected)}영업일 백필, {len(cache)}종목 → {PRICE_CACHE_PATH}\n"
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
