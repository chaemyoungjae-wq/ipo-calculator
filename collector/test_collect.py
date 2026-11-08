import unittest

import lxml.html

import collect
import sources


def rows_of(html: str) -> list[list[str]]:
    return [c for c in (sources._cells(tr) for tr in lxml.html.fromstring(html).xpath("//tr")) if c]


class ValueParsing(unittest.TestCase):
    def test_date_range_short_and_full(self):
        self.assertEqual(sources.date_range("2026.12.30~01.02"), ("2026-12-30", "2027-01-02"))
        self.assertEqual(sources.date_range("2026.09.16 ~ 2026.09.17"), ("2026-09-16", "2026-09-17"))

    def test_competition(self):
        text = "1343.32:1 (비례 2687:1)"
        self.assertEqual(sources.competition(text), "1343.32:1")
        self.assertEqual(sources.proportional(text), "2687:1")
        self.assertIsNone(sources.competition(""))


class FloatParsing(unittest.TestCase):
    def test_uses_shareholder_total_not_other_totals(self):
        rows = [
            ["구분", "유통가능물량"],
            ["합계", "106,196,000"],
            ["합계", "2,317건", "1,889,842,000주", "100%"],
            ["합계", "7,300,000", "100", "9,566,000", "100", "7,393,110", "77.29", "2,172,890", "22.71", "-"],
        ]
        self.assertEqual(sources.parse_float(rows), (2172890, 22.71))

    def test_rejects_inconsistent_ratio(self):
        rows = [["유통가능"], ["합계", "1,000", "100", "900", "90", "500", "99.00"]]
        self.assertEqual(sources.parse_float(rows), (None, None))


class Underwriters(unittest.TestCase):
    def test_table(self):
        rows = [["인수회사", "주식수", "청약한도", "기타"],
                ["한국투자증권", "675,000 ~ 810,000 주", "11,000 ~ 13,000 주", "대표주관"],
                ["BNK투자증권", "75,000 ~ 90,000 주", "7,500 ~ 9,000 주", "인수"],
                ["주요일정", "수요예측일", "2026.11.30"]]
        self.assertEqual(sources.parse_underwriters(rows, {}), [
            {"name": "한국투자증권", "limit": 13000}, {"name": "BNK투자증권", "limit": 9000}])

    def test_single_row(self):
        rows = [["주간사", "대신증권", "주식수: 550,000 주 / 청약한도: 18,000~22,000 주"]]
        self.assertEqual(sources.parse_underwriters(rows, {"주간사": "대신증권"}),
                         [{"name": "대신증권", "limit": 22000}])


class Detail(unittest.TestCase):
    def test_lockup_is_unknown_before_demand_forecast(self):
        doc = lxml.html.fromstring("<table><tr><td>기관경쟁률</td><td></td><td>의무보유확약</td><td>0.00%</td></tr></table>")
        self.assertIsNone(sources.parse_detail(doc, 1)["lockupPct"])


class Prices(unittest.TestCase):
    base = {"open": 45000, "high": 45000, "low": 45000, "close": 45000}

    def test_restores_split_adjusted_price(self):
        r = collect.reconcile_prices(self.base, 90000, 90000)
        self.assertEqual((r["open"], r["high"], r["close"], r["priceCheck"]), (90000, 90000, 90000, False))

    def test_flags_open_mismatch_when_close_agrees(self):
        p = {"open": 41700, "high": 42200, "low": 27000, "close": 27650}
        r = collect.reconcile_prices(p, 47170, 27650)
        self.assertEqual((r["open"], r["priceCheck"]), (41700, True))

    def test_same_prices_untouched(self):
        self.assertFalse(collect.reconcile_prices(self.base, 45000, 45000)["priceCheck"])


class Merge(unittest.TestCase):
    def test_empty_new_values_keep_old(self):
        self.assertEqual(collect.merge({"price": 100, "code": "A"}, {"price": None, "code": "B"}),
                         {"price": 100, "code": "B"})


if __name__ == "__main__":
    unittest.main()
