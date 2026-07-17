"""RSI(14) 자체 계산 — Wilder 평활 방식 (SPEC 7장)"""

from config import RSI_PERIOD


def rsi(closes: list[float], period: int = RSI_PERIOD) -> float | None:
    """종가 시계열(과거→최신)로 RSI를 계산한다. 데이터 부족 시 None."""
    if len(closes) < period + 1:
        return None

    # 거래정지 등으로 RSI 윈도우 전체에 가격 변동이 없으면 계산 불가(결측).
    # avg_gain=avg_loss=0이라 수학적으로 정의되지 않는데, 아래 avg_loss==0
    # 분기만으로는 100이 반환되어 'RSI 높은 순' 최상단을 오염시킨다.
    if len(set(closes[-(period + 1):])) == 1:
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
