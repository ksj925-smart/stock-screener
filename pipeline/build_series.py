"""종목별 최근 3개월(최대 CHART_DAYS영업일) 종가 시계열을 docs/series/{code}.json으로 생성한다.

B안(SPEC v1.3 확정): screener.json에 시계열을 인라인하지 않고 종목별 개별 파일로 분리.
종목 클릭 시 해당 파일 1개만 fetch → 첫 로딩(screener.json)은 경량 유지.

⚠️ 이 파일들은 git에 커밋하지 않는다(.gitignore로 docs/series/ 제외).
   매 배포 시 GitHub Actions가 생성해 Pages 아티팩트에 포함해 배포하므로
   git 히스토리에 누적되지 않는다(슬라이딩 윈도우 전량 변경 문제 회피).

⚠️ 규제 제약(SPEC 3장): 순수 종가 시계열만 담는다. 매매신호·이동평균·밴드·
   마커·목표가·지지선·판단 라벨 등 해석을 유도하는 어떤 필드도 넣지 않는다.

포맷(자기완결형): {"b": 기준일, "d": [날짜...], "p": [종가...]}
  종목마다 신규상장·거래정지로 날짜 벡터가 달라 날짜를 파일에 함께 담는다
  (날짜 공유 파일은 부정확). name·code는 screener.json에 이미 있어 생략.
"""

import json
import os

from config import PRICE_CACHE_PATH

SERIES_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "series")
# 차트에 노출할 최대 영업일 수(약 3개월). 캐시(CACHE_DAYS)는 버퍼를 두고 더 길게 보관.
CHART_DAYS = 60


def main() -> None:
    with open(PRICE_CACHE_PATH, encoding="utf-8") as f:
        cache: dict[str, list[list]] = json.load(f)

    os.makedirs(SERIES_DIR, exist_ok=True)
    written = 0
    for code, series in cache.items():
        tail = series[-CHART_DAYS:]
        if not tail:
            continue
        payload = {
            "b": tail[-1][0],          # 기준일(마지막 종가 날짜) — UI "기준일 표기"용
            "d": [d for d, _ in tail],  # 날짜 축
            "p": [p for _, p in tail],  # 종가
        }
        with open(os.path.join(SERIES_DIR, f"{code}.json"), "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        written += 1

    print(f"series 생성 완료: {written}개 → docs/series/ (최대 {CHART_DAYS}영업일)")


if __name__ == "__main__":
    main()
