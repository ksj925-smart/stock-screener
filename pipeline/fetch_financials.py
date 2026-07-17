"""기업재무정보 API → BPS·EPS 산출 (분기 1회만 실행, SPEC 7-2)

흐름:
  1. KRX상장종목정보로 종목코드 → 법인등록번호(crno) 매핑
  2. 기업재무정보(요약재무제표)에서 자본총계·당기순이익 조회
  3. BPS = 자본총계 / 상장주식수, EPS = 당기순이익 / 상장주식수
     (상장주식수는 시세 데이터의 lstgStCnt 사용)

⚠️ TODO(검증): 이 API의 오퍼레이션·필드명(enpTcptAmt, enpCrtmNpf 등)은
   API 키 수령 후 실제 응답으로 반드시 검증할 것 (SPEC 8장 Phase1-8).
   종목당 1회 호출이므로 분기 1회 × 약 2,600건 → 개발계정(10,000건/일)으로 충분.
"""

import datetime as dt
import json
import os
import sys
import time

import requests

from api_client import fetch_all_pages
from config import API_KEY, FINANCE_API, FINANCIALS_PATH, LISTED_API, REQUEST_TIMEOUT
from fetch_prices import fetch_latest_prices


def fetch_crno_map() -> dict[str, str]:
    """종목코드(6자리) → 법인등록번호 매핑"""
    today = dt.date.today()
    for back in range(1, 11):
        bas_dt = (today - dt.timedelta(days=back)).strftime("%Y%m%d")
        items = fetch_all_pages(LISTED_API, {"basDt": bas_dt})
        if items:
            return {
                it["srtnCd"][-6:]: it["crno"]
                for it in items
                # 외국법인은 crno가 더미('0000000000000')로 내려와 전부 같은
                # (엉뚱한) 재무가 붙는다 — 매핑에서 제외해 PBR/PER 결측 처리.
                if it.get("srtnCd")
                and it.get("crno")
                and it["crno"].strip("0") != ""
            }
    sys.exit("KRX 상장종목정보를 가져오지 못했습니다.")


def _to_float(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def select_financials(rows: list[dict]) -> dict | None:
    """요약재무제표 행들에서 자본총계·당기순이익을 고른다. (방법론: 연결 유지)

    정책(사용자 확정 2026-07-12): **연결(110) 재무제표를 사용**한다.
      자본총계가 있는 연결 행을 채택하고, 그 행의 당기순이익을 **그대로** 쓴다.
      순이익이 "0"이어도 0으로 둔다(→ EPS≤0 → PER null).

    ⚠️ 별도(120) 폴백은 하지 않는다. 이유:
      API는 '필드 부재(=데이터 구멍)'와 '실제 값 0'을 구분하지 못하고 둘 다
      문자열 "0"으로 반환한다(SPEC 8장 Phase1-8 전수 확인: KEY_ABSENT/빈문자열 전무).
      따라서 '연결 순이익이 0이면 별도로 대체'하면 진짜 breakeven 회사에까지
      별도 순이익이 잘못 붙어 틀린 PER이 나온다. 결측이 틀린 값보다 낫다.
      대상 2,578 중 이 구멍 추정 14건은 PER만 결측(PBR은 정상)으로 감수한다.

    단, **연결 행 자체가 (또는 그 자본총계가) 없어 쓸 수 없는 회사는 별도를 쓴다.**
    이건 연결이 있는데 별도를 고르는 '우회'가 아니라, 유일하게 존재하는 데이터를
    쓰는 것이다. (정렬상 연결이 먼저이므로, 연결에 자본총계가 있으면 항상 연결이 선택됨.)
    """
    # 표시통화가 원화가 아닌 재무제표(예: 두산밥캣 USD)는 제외 — 원 단위로
    # 오독하면 PBR/PER이 환율 배수(~1,400배)로 왜곡된다. 환산 대신 결측 처리.
    rows = [r for r in rows if r.get("curCd", "KRW") == "KRW"]
    # 연결(110) 우선 정렬 → 자본총계가 있는 첫 재무제표를 채택
    rows = sorted(
        rows, key=lambda r: 0 if str(r.get("fnclDcd", "")).startswith("110") else 1
    )
    for r in rows:
        eq = _to_float(r.get("enpTcptAmt"))  # 자본총계
        if eq:
            ni = _to_float(r.get("enpCrtmNpf"))  # 당기순이익 (음수=적자, 0/부재=0 처리)
            return {"equity": eq, "netIncome": ni or 0.0}
    return None


def fetch_summary(crno: str, accept_years: list[str]) -> dict | None:
    """법인 1개의 요약재무제표에서 '가용한 최신 결산연도'의 자본총계/당기순이익을 얻는다.

    bizYear를 지정하지 않고 전 연도를 받아(회사당 보통 연 2행 × 10년 내외),
    accept_years(최신 연도 우선 정렬)를 순회하며 처음 채택 가능한 연도를 쓴다.
    → 최신 결산 미제출 회사는 자동으로 직전 연도로 폴백되고, 어느 연도를
    썼는지 결과에 "y"로 남긴다(디버깅용). accept_years 밖의 낡은 재무는
    쓰지 않는다(결측이 낡은 값보다 낫다).
    """
    query = {
        "serviceKey": API_KEY,
        "resultType": "json",
        "numOfRows": 100,
        "pageNo": 1,
        "crno": crno,
    }
    try:
        res = requests.get(FINANCE_API, params=query, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        body = res.json().get("response", {}).get("body", {})
        rows = body.get("items", {}).get("item", [])
        if isinstance(rows, dict):
            rows = [rows]
        for year in accept_years:
            picked = select_financials([r for r in rows if r.get("bizYear") == year])
            if picked:
                picked["y"] = year
                return picked
        return None
    except (requests.RequestException, ValueError, KeyError):
        return None


def main() -> None:
    # 스크리너에 실제로 노출되는 종목(스팩·우선주·KONEX 제외)만 재무를 수집한다.
    # → 재무 없는 스팩 등으로 결측률이 부풀려지는 것을 막고, 불필요한 API 호출도 줄인다.
    _, stocks = fetch_latest_prices()
    target_codes = {s["code"] for s in stocks}

    crno_map = {c: crno for c, crno in fetch_crno_map().items() if c in target_codes}
    # 가용한 최신 결산연도를 자동 선택: 최신(작년) 우선, 미제출이면 직전 연도 폴백.
    # 그보다 낡은 재무는 결측 처리 (연도를 하드코딩하지 않으므로 해마다 자동 갱신됨).
    this_year = dt.date.today().year
    accept_years = [str(this_year - 1), str(this_year - 2)]
    print(
        f"대상 {len(target_codes)}종목 중 crno 매핑 {len(crno_map)}건, "
        f"결산연도 {accept_years[0]}(폴백 {accept_years[1]}) 재무 수집 시작"
    )

    out: dict[str, dict] = {}
    for i, (code, crno) in enumerate(crno_map.items(), 1):
        data = fetch_summary(crno, accept_years)
        if data:
            out[code] = data
        if i % 100 == 0:
            print(f"  {i}/{len(crno_map)} 처리, 수집 {len(out)}건")
        time.sleep(0.1)

    os.makedirs(os.path.dirname(FINANCIALS_PATH), exist_ok=True)
    with open(FINANCIALS_PATH, "w", encoding="utf-8") as f:
        json.dump(
            {"updated": dt.date.today().isoformat(), "t": out},
            f,
            ensure_ascii=False,
        )
    no_crno = len(target_codes) - len(crno_map)
    missing = len(crno_map) - len(out)
    year_dist = {y: sum(1 for v in out.values() if v["y"] == y) for y in accept_years}
    print(
        f"완료: {len(out)}건 저장 | crno 매핑 실패 {no_crno}건 | "
        f"재무 결측 {missing}건 | 연도 분포 {year_dist} | "
        f"대상 {len(target_codes)}종목 ({FINANCIALS_PATH})"
    )


if __name__ == "__main__":
    main()
