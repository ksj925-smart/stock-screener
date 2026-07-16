"""매일 실행되는 메인 엔트리 — screener.json 생성 (SPEC 7-1 스키마)

  1. 전종목 D-1 시세 수집 (fetch_prices)
  2. 종가 캐시 append (price_cache)
  3. RSI(14) 계산 (indicators)
  4. financials.json(분기 1회 갱신)에서 BPS·EPS → PBR·PER 산출
  5. docs/screener.json 저장 (GitHub Pages로 서빙)

결측 처리(SPEC 5-1): 재무 미제출·신규상장 등으로 값이 없으면 null.
적자(EPS<=0)면 PER은 null → 프론트의 '적자 회사 빼고 보기' 토글이 걸러낸다.
자체 점수·순위 필드는 절대 추가하지 말 것 (SPEC 3-3 절대 금지 목록).
"""

import datetime as dt
import json
import os

from config import FINANCIALS_PATH, OUTPUT_PATH
from fetch_prices import fetch_latest_prices
from indicators import rsi
from price_cache import append_prices, load_cache, save_cache


def load_financials() -> dict[str, dict]:
    if not os.path.exists(FINANCIALS_PATH):
        print("경고: financials.json 없음 — PBR/PER는 전부 null로 출력됩니다.")
        return {}
    with open(FINANCIALS_PATH, encoding="utf-8") as f:
        return json.load(f).get("t", {})


def main() -> None:
    base_date, stocks = fetch_latest_prices()
    print(f"기준일 {base_date}, 시세 {len(stocks)}종목")

    cache = append_prices(load_cache(), base_date, stocks)
    save_cache(cache)

    fin = load_financials()

    out, excluded = [], 0
    for s in stocks:
        closes = [c for _, c in cache.get(s["code"], [])]
        rsi_val = rsi(closes)

        pbr = per = None
        f = fin.get(s["code"])
        if f and s["shares"] > 0:
            bps = f["equity"] / s["shares"]
            eps = f["netIncome"] / s["shares"]
            if bps > 0:
                pbr = round(s["close"] / bps, 2)
            if eps > 0:
                per = round(s["close"] / eps, 1)
        if pbr is None and per is None and rsi_val is None:
            excluded += 1

        out.append(
            {
                "c": s["code"],
                "n": s["name"],
                "m": s["market"],
                "p": s["close"],
                "r": round(s["rate"], 2),
                "cap": round(s["cap"], 2),
                "rsi": rsi_val,
                "pbr": pbr,
                "per": per,
            }
        )

    payload = {
        "meta": {
            "base_date": base_date,
            "updated_at": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "count": len(out),
            "excluded": excluded,
        },
        "t": out,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f"완료: {len(out)}종목, {size_kb:.0f}KB → {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
