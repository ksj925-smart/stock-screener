import unittest

from indicators import period_return, volume_ratio
from price_cache import append_prices, record_event


def stock(close, rate):
    return {"code": "000001", "close": close, "rate": rate, "high": close, "low": close, "volume": 10}


def base_cache():
    return {"000001": [["2026-10-05", 1000, 1000, 1000, 5]]}


class RebaseEventTest(unittest.TestCase):
    def test_over_tolerance_records_event(self):
        # 5:1 병합: 전일가 1000 → 조정 전일가 200 이어야 하는데 API 기준 200, 오늘 종가 210(+5%)
        ev = {}
        append_prices(base_cache(), "2026-10-06", [stock(210, 5.0)], ev)
        self.assertEqual(ev, {"000001": ["2026-10-06"]})

    def test_under_tolerance_records_nothing(self):
        ev = {}
        append_prices(base_cache(), "2026-10-06", [stock(1030, 3.0)], ev)  # 1030/1.03 = 1000
        append_prices(base_cache(), "2026-10-06", [stock(1040, 3.0)], ev)  # 조정전일 ≈1009.7 (1%)
        self.assertEqual(ev, {})

    def test_rerun_no_duplicates(self):
        ev = {}
        cache = base_cache()
        append_prices(cache, "2026-10-06", [stock(210, 5.0)], ev)
        append_prices(cache, "2026-10-06", [stock(210, 5.0)], ev)  # 같은 날 재실행
        self.assertEqual(ev, {"000001": ["2026-10-06"]})
        self.assertFalse(record_event(ev, "000001", "2026-10-06"))

    def test_without_events_arg_still_works(self):
        append_prices(base_cache(), "2026-10-06", [stock(210, 5.0)])


class IndicatorTest(unittest.TestCase):
    def test_volume_ratio(self):
        v = [10] * 40 + [20] * 20
        self.assertAlmostEqual(volume_ratio(v), 2.0)
        self.assertIsNone(volume_ratio(v[1:]))  # 59행
        self.assertIsNone(volume_ratio([10] * 39 + [0] + [20] * 20))  # 구간 내 0
        self.assertIsNone(volume_ratio([10] * 40 + [None] + [20] * 19))
        self.assertAlmostEqual(volume_ratio([99] * 5 + v), 2.0)  # 60개만 사용

    def test_period_return(self):
        c = list(range(100, 161))  # 61개: -61 → 100, 최근 160
        self.assertAlmostEqual(period_return(c), 60.0)
        self.assertIsNone(period_return(c[1:]))
        self.assertIsNone(period_return([0] + [5] * 60))


if __name__ == "__main__":
    unittest.main()
