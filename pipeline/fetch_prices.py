"""주식시세정보 API에서 전종목 D-1 종가·시총·등락률을 수집한다.

공공데이터 갱신은 '기준일자 + 영업일 하루 뒤 13시 이후'이므로(SPEC 4장),
오늘부터 최대 10일을 거슬러 올라가며 데이터가 있는 가장 최근 기준일을 찾는다.
"""

import datetime as dt
import json
import re
import sys

from api_client import fetch_all_pages
from config import PRICE_API

# 스팩 종목명 패턴 (예: "디비금융제14호스팩", "KB제32호스팩")
_SPAC_RE = re.compile(r"스팩")
# 우선주 종목명 패턴 (예: "삼성전자우", "하이트진로2우B", "유한양행우",
# "CJ4우(전환)", "DL이앤씨2우(전환)").
#
# 2026-08 수정: 기존 정규식 r"우[A-C]?$"는 "우"(+옵션 A~C 클래스)로 끝나는
# 이름만 잡아서, "우" 뒤에 "(전환)" 같은 괄호 접미사가 붙는 전환우선주를
# 놓쳤다(전수 스캔으로 CJ4우(전환)·DL이앤씨2우(전환) 2종목 확인, LESSONS_LEARNED.md
# 참고). "(\([^)]*\))?"를 옵션으로 추가해 "우"/"우[A-C]" 뒤에 괄호 접미사가
# 있어도 끝까지 매칭하도록 확장했다. 전종목 재검증(2763종목) 결과 과잉
# 매칭(정상 종목이 실수로 걸러짐) 없음을 확인했다.
_PREF_RE = re.compile(r"우[A-C]?(\([^)]*\))?$")


def is_excluded(name: str) -> bool:
    """스크리너 제외 대상(스팩·우선주) 판정.

    사용자 확정 원칙: 지표가 구조적으로 계산 불가하거나 원천 왜곡되는 종목만 제외.
    - 스팩: 사업·실적 없음 → PER/PBR 무의미.
    - 우선주: 재무를 모회사 보통주 기준으로 산출 → 우선주 가격 지표 왜곡.
    리츠·은행·보험 등 업종 특성상 해석만 다른 종목은 제외하지 않는다.
    (ETF·ETN은 주식시세정보 API가 반환하지 않아 원천 배제, KONEX는 mrktCtg에서 제외)
    """
    return bool(_SPAC_RE.search(name) or _PREF_RE.search(name))


def fetch_latest_prices() -> tuple[str, list[dict]]:
    """(기준일자 YYYY-MM-DD, 종목 리스트) 반환"""
    today = dt.date.today()
    for back in range(1, 11):
        bas_dt = (today - dt.timedelta(days=back)).strftime("%Y%m%d")
        items = fetch_all_pages(PRICE_API, {"basDt": bas_dt})
        if items:
            stocks = []
            for it in items:
                # 필드명 검증 완료(2026-08, 실제 응답 basDt=20260807로 확인):
                # basDt/srtnCd/itmsNm/mrktCtg/clpr/fltRt/mrktTotAmt/lstgStCnt +
                # hipr/lopr/trqu(고가/저가/거래량, MFI·CCI·ADX·ATR용, SPEC.md 부록 A).
                mkt = it.get("mrktCtg", "")
                if mkt not in ("KOSPI", "KOSDAQ"):
                    continue  # KONEX 등 제외
                if is_excluded(it.get("itmsNm", "")):
                    continue  # 스팩·우선주 제외 (사용자 확정 원칙)
                try:
                    stocks.append(
                        {
                            "code": it["srtnCd"][-6:],
                            "name": it["itmsNm"],
                            "market": 0 if mkt == "KOSPI" else 1,
                            "close": int(it["clpr"]),
                            "rate": float(it.get("fltRt") or 0),
                            # 시가총액: 원 → 조 단위
                            "cap": round(int(it["mrktTotAmt"]) / 1e12, 4),
                            "shares": int(it.get("lstgStCnt") or 0),
                            # 거래 없는 날(0)이 실제로 관측됨(예: 신규상장 직후) —
                            # 값 자체는 0을 그대로 두고, 0 나누기 방어는 indicators.py에서 한다.
                            "high": int(it.get("hipr") or 0),
                            "low": int(it.get("lopr") or 0),
                            "volume": int(it.get("trqu") or 0),
                        }
                    )
                except (KeyError, ValueError):
                    continue
            base_date = f"{bas_dt[:4]}-{bas_dt[4:6]}-{bas_dt[6:]}"
            return base_date, stocks
    sys.exit("최근 10일 내 시세 데이터를 찾지 못했습니다.")


if __name__ == "__main__":
    base_date, stocks = fetch_latest_prices()
    print(f"기준일 {base_date}, {len(stocks)}종목 수집")
    print(json.dumps(stocks[:3], ensure_ascii=False, indent=2))
