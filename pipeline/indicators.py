"""RSI(14) + 지표 테이블 5종·볼린저밴드 계산 — Wilder 평활 방식
(SPEC 7장, SPEC.md 부록 A)"""

from config import RSI_PERIOD


def is_flat(closes: list[float], period: int = RSI_PERIOD) -> bool:
    """RSI 윈도우(최근 period+1 종가) 동안 가격이 한 번도 변하지 않았는지.

    거래정지 '추정' 신호다. 시세 API에 거래정지 플래그가 없어 가격 무변동을
    프록시로 쓴다. RSI 결측 판정과 screener.json의 'h' 필드가 같은 이 함수를
    쓰므로 두 값이 어긋날 일이 없다. 데이터가 부족하면 판정하지 않는다(False).
    """
    if len(closes) < period + 1:
        return False
    return len(set(closes[-(period + 1):])) == 1


def rsi(closes: list[float], period: int = RSI_PERIOD) -> float | None:
    """종가 시계열(과거→최신)로 RSI를 계산한다. 데이터 부족 시 None."""
    if len(closes) < period + 1:
        return None

    # 거래정지 등으로 RSI 윈도우 전체에 가격 변동이 없으면 계산 불가(결측).
    # avg_gain=avg_loss=0이라 수학적으로 정의되지 않는데, 아래 avg_loss==0
    # 분기만으로는 100이 반환되어 'RSI 높은 순' 최상단을 오염시킨다.
    if is_flat(closes, period):
        return None

    gains, losses = [], []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0.0))
        losses.append(max(-diff, 0.0))

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - 100 / (1 + rs), 1)


def _safe_hl(high: float, low: float, close: float) -> tuple[float, float]:
    """고가·저가가 0(거래 없음/데이터 없음 — 예: 신규상장 직후·거래정지일)이면
    종가로 대체한다. 그대로 두면 True Range가 '|0 - 전일종가|'로 튀어
    ATR·ADX·CCI·MFI가 그 날 하루 때문에 폭주한다. 실측(2026-08-07 API 응답)에서
    거래 없는 날은 hipr·lopr·trqu가 전부 "0"으로 온다는 걸 확인했다."""
    if high <= 0 or low <= 0:
        return close, close
    return high, low


def true_range(highs: list[float], lows: list[float], closes: list[float]) -> list[float]:
    """TR_i = max(H-L, |H-C_prev|, |L-C_prev|). 길이는 입력보다 1 짧다(전일
    종가가 필요). atr()·adx()가 공유하는 내부 유틸이라 별도로 노출한다."""
    tr = []
    for i in range(1, len(closes)):
        h, l = _safe_hl(highs[i], lows[i], closes[i])
        tr.append(max(h - l, abs(h - closes[i - 1]), abs(l - closes[i - 1])))
    return tr


def _wilder_series(values: list[float], period: int) -> list[float]:
    """Wilder 평활의 전체 시계열을 반환한다(rsi()는 마지막 값만 필요하지만,
    adx()는 DI 평활 결과를 다시 DX→ADX로 한 번 더 평활해야 해서 중간 단계
    전체가 필요하다). 길이 = len(values) - period + 1. 데이터 부족 시 빈 리스트."""
    if len(values) < period:
        return []
    series = [sum(values[:period]) / period]
    for v in values[period:]:
        series.append((series[-1] * (period - 1) + v) / period)
    return series


def atr(highs: list[float], lows: list[float], closes: list[float], period: int) -> int | None:
    """ATR — True Range를 Wilder 평활. 원 단위 정수로 반올림해 반환한다
    (build_series.py의 '종가는 원 단위 정수' 관행과 통일). 데이터 부족 시 None."""
    series = _wilder_series(true_range(highs, lows, closes), period)
    if not series:
        return None
    return round(series[-1])


def adx(
    highs: list[float], lows: list[float], closes: list[float], period: int
) -> tuple[float, float] | None:
    """(ADX, -DI) 튜플. +DI는 계산 과정에서 나오지만 반환하지 않는다 — 이번
    승인 범위(ADX·-DI)가 아니라, 값을 만들어 두면 나중에 실수로 노출되기
    쉽다. 데이터 부족(아래 참고) 또는 분모가 0인 구간이면 None.

    ⚠️ 호출자는 반드시 config.ADX_WINDOW(=60)로 슬라이싱한 highs/lows/closes를
    넘겨야 한다. RSI(14)가 RSI_WINDOW=30(2.14×period) 고정 창을 쓰는 것과
    "짧은 창을 쓰면 Wilder 평활 시드가 흔들린다"는 문제는 같지만, ADX는
    DI 평활 → DX 평활의 이중 Wilder 구조라 RSI보다 훨씬 더 긴 창이 필요하다.

    실측 근거(2026-08, 삼성전자 005930, period=14, 같은 기준일 기준 창
    크기만 바꿔가며 비교):

        window=30  ADX=39.7  -DI=34.3
        window=45  ADX=27.4  -DI=33.6
        window=60  ADX=25.9  -DI=33.5   ← 채택
        window=85  ADX=26.9  -DI=33.5

    -DI는 창 크기와 거의 무관하게 안정적이다(33.1~35.2, 단일 Wilder 평활이라
    ATR·RSI와 비슷한 수렴 속도). ADX는 window=30에서 39.7, window=85에서
    26.9로 47% 차이가 나 — RSI_WINDOW=30을 그대로 재사용했다면 이중 평활
    burn-in 부족으로 조용히 틀린 값을 냈을 것이다(경고나 예외 없이).
    window=45 이상부터 24.4~27.4 범위로 수렴해 60을 채택했다(85와의 차이가
    26.9→25.9로 4% 미만 — CACHE_DAYS=85 전체를 쓰는 것과 사실상 동등하면서,
    신규상장 종목이 지표를 더 일찍 받을 수 있도록 창은 최소한으로 늘렸다).

    burn-in 최소 요구량은 이론상 약 2×period(=28, DM/TR 평활 period개 +
    DX 누적 period개)이지만, 이는 "값이 나오는" 최소치일 뿐 "값이 수렴하는"
    지점이 아니다 — 이 함수가 사용 가능한 결과를 반환하는 것과, 그 결과가
    안정적인 것은 다른 문제다(LESSONS_LEARNED.md 참고)."""
    n = len(closes)
    plus_dm, minus_dm = [], []
    for i in range(1, n):
        h_prev, l_prev = _safe_hl(highs[i - 1], lows[i - 1], closes[i - 1])
        h, l = _safe_hl(highs[i], lows[i], closes[i])
        up = h - h_prev
        down = l_prev - l
        plus_dm.append(up if (up > down and up > 0) else 0.0)
        minus_dm.append(down if (down > up and down > 0) else 0.0)

    tr_s = _wilder_series(true_range(highs, lows, closes), period)
    plus_s = _wilder_series(plus_dm, period)
    minus_s = _wilder_series(minus_dm, period)
    if not tr_s or not plus_s or not minus_s:
        return None

    dx: list[float] = []
    for t, p, m in zip(tr_s, plus_s, minus_s):
        if t == 0:
            continue  # 무변동 구간(거래정지 추정) — 그 날은 DX 계산에서 제외
        p_di, m_di = 100 * p / t, 100 * m / t
        if p_di + m_di == 0:
            continue
        dx.append(100 * abs(p_di - m_di) / (p_di + m_di))

    adx_s = _wilder_series(dx, period)
    if not adx_s or tr_s[-1] == 0:
        return None
    final_minus_di = 100 * minus_s[-1] / tr_s[-1]
    return round(adx_s[-1], 1), round(final_minus_di, 1)


def mfi(
    highs: list[float], lows: list[float], closes: list[float],
    volumes: list[float], period: int,
) -> float | None:
    """MFI — (고가+저가+종가)/3의 등락 방향으로 거래대금(가격×거래량)을
    양/음으로 나눠 비율을 낸다. period+1개의 H/L/C/V가 필요(방향 비교에
    +1). 데이터 부족 시 None."""
    n = period + 1
    if min(len(closes), len(highs), len(lows), len(volumes)) < n:
        return None
    hs, ls, cs, vs = highs[-n:], lows[-n:], closes[-n:], volumes[-n:]
    tp = []
    for h, l, c in zip(hs, ls, cs):
        sh, sl = _safe_hl(h, l, c)
        tp.append((sh + sl + c) / 3)

    pos = neg = 0.0
    for i in range(1, n):
        flow = tp[i] * vs[i]
        if tp[i] > tp[i - 1]:
            pos += flow
        elif tp[i] < tp[i - 1]:
            neg += flow
        # tp[i] == tp[i-1]이면 어느 쪽에도 더하지 않는다(표준 정의)
    if pos == 0 and neg == 0:
        # 거래량 자체가 0인 구간(신규상장 직후 등) — '자금 흐름 100'이 아니라 결측.
        return None
    if neg == 0:
        return 100.0
    mfr = pos / neg
    return round(100 - 100 / (1 + mfr), 1)


def cci(highs: list[float], lows: list[float], closes: list[float], period: int) -> float | None:
    """CCI — Wilder 평활이 아니라 단순 이동평균·평균편차 기반이라, RSI·ADX와
    달리 정확히 period개만 있으면 계산된다(burn-in 불필요). 데이터 부족 시 None."""
    if min(len(closes), len(highs), len(lows)) < period:
        return None
    hs, ls, cs = highs[-period:], lows[-period:], closes[-period:]
    tp = []
    for h, l, c in zip(hs, ls, cs):
        sh, sl = _safe_hl(h, l, c)
        tp.append((sh + sl + c) / 3)
    sma_tp = sum(tp) / period
    mean_dev = sum(abs(x - sma_tp) for x in tp) / period
    if mean_dev == 0:
        # 무변동 구간(거래정지 추정) — 분모 0. RSI의 is_flat()과 같은 계열의 결측.
        return None
    return round((tp[-1] - sma_tp) / (0.015 * mean_dev), 1)


def bollinger_series(
    closes: list[float], period: int, mult: float
) -> list[tuple[int, int, int] | None]:
    """입력과 같은 길이의 (중심선, 상단, 하단) 배열을 반환한다 — RSI류와 달리
    '최신값 1개'가 아니라 차트 전체 구간에 밴드를 그려야 하기 때문이다.
    앞쪽 (period-1)개는 표준편차를 구할 과거 구간이 부족해 None(그 구간은
    차트에 종가 라인만 보이고 밴드는 안 그려진다). 원 단위 정수로 반올림."""
    out: list[tuple[int, int, int] | None] = []
    for i in range(len(closes)):
        if i + 1 < period:
            out.append(None)
            continue
        window = closes[i + 1 - period : i + 1]
        mid = sum(window) / period
        variance = sum((x - mid) ** 2 for x in window) / period
        std = variance**0.5
        out.append((round(mid), round(mid + mult * std), round(mid - mult * std)))
    return out
