"""새 영업일 시세가 나왔는지만 싸게 확인한다 (조기 종료 판정).

크론을 하루 4회로 늘리면 대부분의 실행은 '이미 최신'이다. 그때마다 전종목
페이지네이션을 돌고 266KB 파일을 다시 써서 커밋하면, updated_at만 바뀐 커밋이
하루 4개씩 쌓여 리포가 불필요하게 비대해진다(블롭이 매번 새로 저장된다).

그래서 여기서 basDt별 totalCount만 1건씩 조회해 최신 데이터 날짜를 확인하고,
현재 base_date보다 새 데이터가 없으면 빌드·커밋 자체를 건너뛴다. 조회는
페이지당 1행이라 전종목 수집(3페이지 × 1000행)보다 훨씬 가볍다.

신선도 요약(verify_freshness)은 빌드를 건너뛰든 말든 항상 돈다 — 조기 종료가
관측을 가려서는 안 되기 때문이다.
"""

import datetime as dt
import json
import os
import sys

import requests

from config import API_KEY, OUTPUT_PATH, PRICE_API, REQUEST_TIMEOUT

KST = dt.timezone(dt.timedelta(hours=9))
MAX_BACK_DAYS = 10


def current_base_date() -> str | None:
    try:
        with open(OUTPUT_PATH, encoding="utf-8") as f:
            return json.load(f)["meta"]["base_date"]
    except (OSError, ValueError, KeyError):
        return None  # 파일이 없거나 깨졌으면 무조건 빌드해야 한다


def latest_available_date() -> str | None:
    """API에 시세가 존재하는 가장 최근 날짜. 없으면 None."""
    if not API_KEY:
        sys.exit("환경변수 DATA_GO_KR_API_KEY가 설정되지 않았습니다.")

    today = dt.datetime.now(KST).date()
    # back=0(오늘)부터 훑는다. 러너 시각(UTC)이 KST보다 하루 뒤일 수 있어서다.
    for back in range(0, MAX_BACK_DAYS + 1):
        day = today - dt.timedelta(days=back)
        query = {
            "serviceKey": API_KEY,
            "resultType": "json",
            "numOfRows": 1,  # totalCount만 보면 되므로 1행이면 충분
            "pageNo": 1,
            "basDt": day.strftime("%Y%m%d"),
        }
        try:
            res = requests.get(PRICE_API, params=query, timeout=REQUEST_TIMEOUT)
            res.raise_for_status()
            body = res.json().get("response", {}).get("body", {})
            if int(body.get("totalCount", 0) or 0) > 0:
                return day.isoformat()
        except (requests.RequestException, ValueError):
            # 일시적 오류로 전체 실행을 죽이지 않는다. 다음 날짜로 넘어가고,
            # 끝까지 실패하면 '새 데이터 없음'으로 처리된다. 이 경우에도
            # verify_freshness가 지연을 계속 관측하므로 사각지대는 없다.
            continue
    return None


def main() -> None:
    current = current_base_date()
    latest = latest_available_date()

    if current is None:
        has_new, reason = True, "기존 screener.json 없음 → 빌드 필요"
    elif latest is None:
        has_new, reason = False, "API에서 시세를 찾지 못함 (일시 오류 또는 미발행)"
        print("::warning::시세 API에서 데이터를 찾지 못했습니다. 빌드를 건너뜁니다.")
    elif latest > current:
        has_new, reason = True, f"새 데이터 발견: {current} → {latest}"
    else:
        has_new, reason = False, f"이미 최신 ({current}) — 빌드·커밋 건너뜀"

    print(f"현재 기준일: {current} / API 최신: {latest}")
    print(f"판정: has_new={str(has_new).lower()} — {reason}")

    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"has_new={str(has_new).lower()}\n")


if __name__ == "__main__":
    main()
