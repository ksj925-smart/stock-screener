"""종목별 최근 3개월(최대 CHART_DAYS영업일) 종가 시계열을 docs/series/{code}.json으로 생성한다.

B안(SPEC v1.3 확정): screener.json에 시계열을 인라인하지 않고 종목별 개별 파일로 분리.
종목 클릭 시 해당 파일 1개만 fetch → 첫 로딩(screener.json)은 경량 유지.

⚠️ 이 파일들은 git에 커밋하지 않는다(.gitignore로 docs/series/ 제외).
   매 배포 시 GitHub Actions가 생성해 Pages 아티팩트에 포함해 배포하므로
   git 히스토리에 누적되지 않는다(슬라이딩 윈도우 전량 변경 문제 회피).

규제 원칙: SPEC.md 3장 참고. 매매신호·마커·목표가·지지선·판단 라벨 등
   해석을 유도하는 필드는 넣지 않는다.

2026-08-XX 앱인토스 승인(SPEC.md 부록 A)으로 지표 6종(RSI20·MFI·CCI·ADX·
-DI·ATR)과 볼린저밴드(20일 이동평균 ± 2표준편차) 필드 추가가 허용됨 — 계산된
수치와 객관적 정의만, 밴드는 선 값만(중앙 이동평균선은 미표시), 매수/매도
판단 필드·+DI는 넣지 않는다(+DI는 승인 범위 밖).

포맷(자기완결형):
  {"b": 기준일, "d": [날짜...], "p": [종가...],
   "rsi20": .., "mfi": .., "cci": .., "adx": .., "mdi": .., "atr": ..,
   "bm": [중앙선...], "bu": [상단...], "bl": [하단...]}
  종목마다 신규상장·거래정지로 날짜 벡터가 달라 날짜를 파일에 함께 담는다
  (날짜 공유 파일은 부정확). name·code는 screener.json에 이미 있어 생략.

  스냅샷 지표(rsi20~atr)는 기준일(b) 시점 값 1개뿐이고, bm/bu/bl은 d/p와
  같은 길이의 병렬 배열이다(차트 전체 구간에 밴드를 그려야 하므로). 계산은
  CACHE_DAYS(전체 캐시, 최대 85일)를 써서 tail(CHART_DAYS=60일)보다 앞선
  구간까지 참고하고, 출력은 tail 길이에 맞춰 자른다 — 그래야 화면에 보이는
  첫 날부터 밴드가 끊기지 않는다(60+19=79 ≤ 85).
"""

import json
import os

from config import (
    ADX_PERIOD,
    ADX_WINDOW,
    ATR_PERIOD,
    ATR_WINDOW,
    BB_PERIOD,
    BB_STDDEV_MULT,
    CCI_PERIOD,
    MFI_PERIOD,
    PRICE_CACHE_PATH,
    RSI20_PERIOD,
    RSI20_WINDOW,
)
from indicators import adx, atr, bollinger_series, cci, is_flat, mfi, rsi

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

        # 캐시 행 = [날짜, 종가, 고가, 저가, 거래량] (2026-08 확장). 지표는
        # tail이 아니라 series(캐시 전체, 최대 85일)를 기준으로 계산해야
        # tail 앞부분에서도 이동평균·Wilder 평활에 필요한 과거 구간이 있다.
        full_closes = [row[1] for row in series]
        full_highs = [row[2] for row in series]
        full_lows = [row[3] for row in series]
        full_vols = [row[4] for row in series]

        rsi20_val = rsi(full_closes[-RSI20_WINDOW:], period=RSI20_PERIOD)
        mfi_val = mfi(full_highs, full_lows, full_closes, full_vols, MFI_PERIOD)
        cci_val = cci(full_highs, full_lows, full_closes, CCI_PERIOD)
        atr_val = atr(
            full_highs[-ATR_WINDOW:], full_lows[-ATR_WINDOW:],
            full_closes[-ATR_WINDOW:], ATR_PERIOD,
        )
        adx_result = adx(
            full_highs[-ADX_WINDOW:], full_lows[-ADX_WINDOW:],
            full_closes[-ADX_WINDOW:], ADX_PERIOD,
        )
        adx_val, mdi_val = adx_result if adx_result else (None, None)

        # 거래정지 추정(is_flat, screener.json 'h' 필드와 같은 판정 함수 재사용,
        # 최근 15거래일 무변동 여부만 본다) — 6개 지표를 전부 통일해서 null 처리한다.
        # 개별 함수만 믿으면 안 되는 이유: RSI20·MFI·CCI는 짧은 창이라 자체적으로
        # None이 나오지만, ADX_WINDOW(60일)처럼 창이 긴 지표는 최근 15일은
        # 무변동이어도 창 앞쪽 45일에 실제 거래가 있었으면 '거래정지 이전
        # 추세'를 반영한 숫자가 그대로 나와 버린다(실측: 011000 종목에서
        # ADX=26.1이 찍힘 — h=1인데 숫자가 있어 다른 지표의 "—"와 불일치).
        # ATR도 같은 이유(무변동 → True Range 0 → 수학적으로 유효한 0)로 값이
        # 남는다. 상세 화면 한 종목 안에서 지표 6개가 "일부는 —, 일부는 숫자"로
        # 갈리면 "그래도 일부 지표는 신호가 있다"는 오해를 살 수 있어, 하나라도
        # 최근 무변동이면 전부 None으로 맞춘다(RSI가 100 대신 None을 반환하도록
        # 만든 것과 같은 원칙).
        if is_flat(full_closes):
            rsi20_val = mfi_val = cci_val = atr_val = adx_val = mdi_val = None

        # 볼린저밴드: series 전체로 계산한 뒤 tail 길이만큼만 잘라 낸다.
        # bollinger_series()는 입력과 같은 길이를 반환하므로 인덱스가 그대로 맞는다.
        bb_full = bollinger_series(full_closes, BB_PERIOD, BB_STDDEV_MULT)
        bb_tail = bb_full[-len(tail):]

        payload = {
            "b": tail[-1][0],  # 기준일(마지막 종가 날짜) — UI "기준일 표기"용
            "d": [row[0] for row in tail],  # 날짜 축
            # 종가는 원 단위 정수로 내보낸다. 캐시에는 리베이스(÷5 등) 때문에
            # 소수가 남아 있는데(예: 11011.6209), 그대로 서빙하면 툴팁에
            # "10,924.523원"처럼 찍혀 백만 단위로 오인된다.
            # ⚠️ 캐시 자체는 소수를 유지한다 — 반복 리베이스의 누적 오차와
            #    Wilder 평활 창 값 변화를 막기 위해서다. 계산은 소수, 출력은 정수.
            "p": [round(row[1]) for row in tail],
            "rsi20": rsi20_val,
            "mfi": mfi_val,
            "cci": cci_val,
            "adx": adx_val,
            "mdi": mdi_val,
            "atr": atr_val,
            "bm": [b[0] if b else None for b in bb_tail],
            "bu": [b[1] if b else None for b in bb_tail],
            "bl": [b[2] if b else None for b in bb_tail],
        }
        with open(os.path.join(SERIES_DIR, f"{code}.json"), "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        written += 1

    print(f"series 생성 완료: {written}개 → docs/series/ (최대 {CHART_DAYS}영업일)")


if __name__ == "__main__":
    main()
