"""RSI(14) 자체 계산 — Wilder 평활 방식 (SPEC 7장)"""

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
