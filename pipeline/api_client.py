"""공공데이터포털 공통 호출 유틸 — 페이지네이션 처리 (종목별 개별 호출 금지, SPEC 7-2)"""

import sys
import time

import requests

from config import API_KEY, PAGE_SIZE, REQUEST_TIMEOUT


def fetch_all_pages(url: str, params: dict, max_pages: int = 50) -> list[dict]:
    """numOfRows/pageNo 페이지네이션으로 전체 item을 수집한다."""
    if not API_KEY:
        sys.exit("환경변수 DATA_GO_KR_API_KEY가 설정되지 않았습니다.")

    items: list[dict] = []
    page = 1
    while page <= max_pages:
        query = {
            "serviceKey": API_KEY,
            "resultType": "json",
            "numOfRows": PAGE_SIZE,
            "pageNo": page,
            **params,
        }
        res = requests.get(url, params=query, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        body = res.json().get("response", {}).get("body", {})
        chunk = body.get("items", {})
        rows = chunk.get("item", []) if isinstance(chunk, dict) else []
        if isinstance(rows, dict):  # 결과 1건이면 dict로 오는 경우 방어
            rows = [rows]
        items.extend(rows)

        total = int(body.get("totalCount", 0) or 0)
        if page * PAGE_SIZE >= total or not rows:
            break
        page += 1
        time.sleep(0.2)  # 과도한 호출 방지
    return items
