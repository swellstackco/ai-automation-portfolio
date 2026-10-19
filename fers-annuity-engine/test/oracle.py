#!/usr/bin/env python3
"""Reference oracle for the OPM FERS/CSRS rules, written separately from the JS engine to cross-check it.
Encodes the rules so every golden number is machine-checked.
Run: python3 -I oracle.py   -> prints the golden table and asserts the OPM handbook anchors.

"""
from decimal import Decimal, ROUND_HALF_UP, ROUND_FLOOR
from datetime import date
import math

D = Decimal
def cents(x): return D(x).quantize(D("0.01"), rounding=ROUND_HALF_UP)
def floor_dollar(x): return int(D(x).to_integral_value(rounding=ROUND_FLOOR))

# ---- Chart 2 (CSRS/FERS Handbook ch.50 §50C1.1-1): hours -> (months, days); row = days 0..29, col = months 0..11
CHART2 = [
[0,174,348,522,696,870,1044,1217,1391,1565,1739,1913],
[6,180,354,528,701,875,1049,1223,1397,1571,1745,1919],
[12,186,359,533,707,881,1055,1229,1403,1577,1751,1925],
[17,191,365,539,713,887,1061,1235,1409,1583,1757,1930],
[23,197,371,545,719,893,1067,1241,1415,1588,1762,1936],
[29,203,377,551,725,899,1072,1246,1420,1594,1768,1942],
[35,209,383,557,730,904,1078,1252,1426,1600,1774,1948],
[41,214,388,562,736,910,1084,1258,1432,1606,1780,1954],
[46,220,394,568,742,916,1090,1264,1438,1612,1786,1959],
[52,226,400,574,748,922,1096,1270,1444,1617,1791,1965],
[58,232,406,580,754,928,1101,1275,1449,1623,1797,1971],
[64,238,412,586,759,933,1107,1281,1455,1629,1803,1977],
[70,243,417,591,765,939,1113,1287,1461,1635,1809,1983],
[75,249,423,597,771,945,1119,1293,1467,1641,1815,1988],
[81,255,429,603,777,951,1125,1299,1472,1646,1820,1994],
[87,261,435,609,783,957,1130,1304,1478,1652,1826,2000],
[93,267,441,615,788,962,1136,1310,1484,1658,1832,2006],
[99,272,446,620,794,968,1142,1316,1490,1664,1838,2012],
[104,278,452,626,800,974,1148,1322,1496,1670,1844,2017],
[110,284,458,632,806,980,1154,1328,1501,1675,1849,2023],
[116,290,464,638,812,986,1159,1333,1507,1681,1855,2029],
[122,296,470,643,817,991,1165,1339,1513,1687,1861,2035],
[128,301,475,649,823,997,1171,1345,1519,1693,1867,2041],
[133,307,481,655,829,1003,1177,1351,1525,1699,1873,2046],
[139,313,487,661,835,1009,1183,1357,1530,1704,1878,2052],
[146,319,493,667,841,1015,1188,1362,1536,1710,1884,2058],
[151,325,499,672,846,1020,1194,1368,1542,1716,1890,2064],
[157,330,504,678,852,1026,1200,1374,1548,1722,1896,2070],
[162,336,510,684,858,1032,1206,1380,1554,1728,1901,2075],
[168,342,516,690,864,1038,1212,1386,1559,1733,1907,2081],
]
def sick_leave_credit(hours):
    """Returns (years, months, days). Rule: 2,087 h = 1 year; if hours not on chart use next HIGHER entry (ch.50 §50A2.1-3F)."""
    years, rem = divmod(int(hours), 2087)
    if rem == 0: return (years, 0, 0)
    best = None
    for d in range(30):
        for m in range(12):
            h = CHART2[d][m]
            if h >= rem and (best is None or h < best[0]): best = (h, m, d)
    return (years, best[1], best[2])

# ---- OPM date arithmetic: 30-day months; "day after separation" is the commencing/age reference (ch.50 §50A2.1-2B and examples)
def ymd_diff(start, end_plus_one):
    """(y,m,d) from start (y,m,d) to end (y,m,d) where end already has +1 day applied, borrowing 30 days / 12 months."""
    y1,m1,d1 = start; y2,m2,d2 = end_plus_one
    d = d2 - d1; m = m2 - m1; y = y2 - y1
    if d < 0: d += 30; m -= 1
    if m < 0: m += 12; y -= 1
    if d >= 30: d -= 30; m += 1
    if m >= 12: m -= 12; y += 1
    return (y, m, d)
def plus_one_day(ymd):
    # OPM C50 §50A2.1-3D: "if the ending date of a period of service is the last day of any month, simply use 31"
    # (e.g. 1-6-72 through 2-28-77 = 5-1-25). Otherwise the day after; borrowing handles the rest.
    import calendar
    y,m,d = ymd; return (y, m, 31 if d >= calendar.monthrange(y, m)[1] else d+1)
def add_ymd(*parts):
    y=m=d=0
    for (py,pm,pd) in parts: y+=py; m+=pm; d+=pd
    m += d // 30; d %= 30; y += m // 12; m %= 12
    return (y,m,d)
def whole_months(ymd): return (ymd[0], ymd[1])   # drop days (ch.50 §50A2.1-2B)
def age_at(birth, on_date): return ymd_diff(birth, on_date)   # on_date = commencing date = separation + 1

# ---- MRA (OPM FERS eligibility page; 5 USC 8412(h))
def mra(birth_year):
    if birth_year < 1948: return (55,0)
    if 1948 <= birth_year <= 1952: return (55, 2*(birth_year-1947))
    if 1953 <= birth_year <= 1964: return (56,0)
    if 1965 <= birth_year <= 1969: return (56, 2*(birth_year-1964))
    return (57,0)

# ---- Accrual factors (ch.50 Chart 6/7: factor rounded to 6 decimals)
def factor(pct, years, months): return D(pct) * (D(years) + D(months)/D(12))
def rf(x): return D(x).quantize(D("0.000001"), rounding=ROUND_HALF_UP)

def fers_basic(high3, years, months, age_years_at_sep, special=False):
    """FERS basic annuity (ch.50 §50B3.1-1; OPM computation page). special = LEO/FF/CBPO/NMC/ATC 1.7%/1%."""
    if special:
        f = rf(D("0.017")*min(D(years)+D(months)/12, D(20)) + D("0.01")*max(D(years)+D(months)/12-D(20), D(0)))
    elif age_years_at_sep >= 62 and (years, months) >= (20, 0):
        f = rf(factor("0.011", years, months))
    else:
        f = rf(factor("0.01", years, months))
    return cents(D(high3) * f), f

def csrs_basic(high3, years, months, special=False, sick_years=0, sick_months=0):
    """CSRS general formula 1.5/1.75/2 (OPM CSRS computation page), 80% cap before sick leave (ch.50 §50A3.1-2)."""
    t = D(years) + D(months)/12
    if special:
        pct = D("0.025")*min(t, D(20)) + D("0.02")*max(t-20, D(0))
    else:
        pct = D("0.015")*min(t,5) + D("0.0175")*max(min(t,10)-5,0) + D("0.02")*max(t-10,0)
    pct = min(pct, D("0.80"))
    sl = D(sick_years) + D(sick_months)/12
    pct += D("0.02")*sl if not special else D("0.02")*sl   # sick leave credit is NOT capped (Tom example: 82%)
    return cents(D(high3)*rf(pct)), rf(pct)

def age_reduction_factor(age_y, age_m, age_d=1):
    """FERS MRA+10 / early deferred: 5/12 of 1% per FULL month under 62 at the commencing date (ch.50 §50B3.1-3B).
    A partial month (age_d > 0) is not a full month under 62, so it is not counted: Chart 8 rows are 'age ... and at least 1 day over'."""
    months_under = (62-age_y)*12 - age_m - (1 if age_d > 0 else 0)
    months_under = max(0, months_under)
    return rf(1 - D(months_under)*D(5)/D(12)/D(100))

def mra10_factor(years, months, age_y, age_m, age_d=1):
    """No reduction when service >= 30 y, or >= 20 y and commencing at 60 or later (ch.50 §50B3.1-3B(2),(3))."""
    if (years, months) >= (30, 0): return D("1.000000")
    if (years, months) >= (20, 0) and age_y >= 60: return D("1.000000")
    return age_reduction_factor(age_y, age_m, age_d)

def csrs_early_factor(age_y, age_m, age_d=1):
    """CSRS early/discontinued: 1/6 of 1% per full month under 55 (ch.50 §50A3.1-3A; 2%/yr). Same full-month rule."""
    months_under = max(0, (55-age_y)*12 - age_m - (1 if age_d > 0 else 0))
    return rf(1 - D(months_under)/D(6)/D(100))

def fers_survivor(annuity_after_age, election):
    """election: 'none' | 'partial' (25%) | 'full' (50%). Reduction 10% of base; base = annuity (full) or half of it (partial).
    Order per ch.50 FERS Example 2: age reduction first, survivor base from the reduced annuity."""
    if election == "none": return cents(annuity_after_age), D(0), D(0)
    base = cents(annuity_after_age) if election == "full" else cents(D(annuity_after_age)*D("0.5"))
    red = cents(base*D("0.10")); surv = cents(base*D("0.50"))
    return cents(D(annuity_after_age)-red), red, surv

def csrs_survivor(annuity, base):
    """CSRS: 2.5% of first $3,600 of base + 10% over; survivor = 55% of base (ch.50 §50B3.1-4 D/F)."""
    red = cents(D("0.025")*min(D(base),3600) + D("0.10")*max(D(base)-3600,0))
    return cents(D(annuity)-red), red, cents(D(base)*D("0.55"))

def insurable_interest_pct(years_younger):
    for lim,p in ((5,10),(10,15),(15,20),(20,25),(25,30),(30,35)):
        if years_younger < lim: return p
    return 40

def supplement(ss_at_62_monthly, fers_civilian_years, fers_civilian_months):
    """Ch.51 §51A2.1-2 D: SS estimate at 62 x (FERS civilian service rounded to nearest whole year, max 40)/40, round down to dollar."""
    yrs = int(fers_civilian_years + (1 if fers_civilian_months >= 6 else 0)); yrs = min(yrs, 40)
    return floor_dollar(D(ss_at_62_monthly) * D(yrs) / D(40)), yrs

def earnings_test(annual_supplement, earnings, exempt=24480):
    """$1 for every $2 over the exempt amount; reduction cannot exceed the supplement (ch.51 §51A3.1-1 C; 2026 exempt $24,480)."""
    red = max(D(0), (D(earnings)-D(exempt))/2); red = min(red, D(annual_supplement))
    return cents(D(annual_supplement)-red), cents(red)

def fers_cola(cpiw):  # 5 USC 8462(b): <=2 -> CPI; 2..3 -> 2; >3 -> CPI-1
    c = D(cpiw)
    return c if c <= 2 else (D(2) if c <= 3 else c-1)

def csrs_offset(ss_monthly_at_62, offset_years, offset_months, ss_attributable=None):
    """Lesser of SS attributable to offset service, or SS x (offset years rounded nearest, half up)/40 (ch.50 §50A3.1-4)."""
    yrs = offset_years + (1 if offset_months >= 6 else 0)
    frac = cents(D(ss_monthly_at_62)*D(yrs)/D(40))
    return frac if ss_attributable is None else min(frac, cents(ss_attributable))

def proration_factor(total_years, parttime):  # parttime = [(years, hours_per_week)]
    full = D(total_years)*2087
    actual = full - sum(D(y)*2087*(1-D(h)/40) for y,h in parttime)
    return (actual/full*100).quantize(D("1"), rounding=ROUND_HALF_UP)/100

def tsp_fv(balance, annual_contrib, rate, years):
    r = D(rate); n = years
    g = (1+r)**n
    return cents(D(balance)*g + D(annual_contrib)*((g-1)/r))

def lump_sum_leave(hours, annual_salary): return cents(D(hours)*(D(annual_salary)/2087))

# ======================= GOLDEN CASES =======================
rows = []
def G(id_, desc, got, expect, source):
    ok = (got == expect)
    rows.append((id_, desc, got, expect, source, ok))
    assert ok, f"{id_}: got {got!r} expected {expect!r}"

# G1 OPM ch.50 FERS Example 1 (Chris Morgan)
svc = add_ymd(ymd_diff((1982,12,30),plus_one_day((1986,3,29))), ymd_diff((1994,5,23),plus_one_day((1997,5,22))), ymd_diff((1999,8,15),plus_one_day((2024,7,30))))
age = age_at((1964,3,15), plus_one_day((2024,7,30)))
G("G1a","Chris Morgan age at separation", age, (60,4,16), "ch.50 FERS Ex.1 step 1")
G("G1b","Chris Morgan total service (days dropped)", whole_months(svc), (31,2), "ch.50 FERS Ex.1 step 4")
b,f = fers_basic(53221, 31, 2, 60)
G("G1c","Chris Morgan accrual factor", f, D("0.311667"), "ch.50 Chart 6")
G("G1d","Chris Morgan unreduced basic annuity", b, D("16587.23"), "ch.50 FERS Ex.1 step 5d")
a,red,surv = fers_survivor(b, "full")
G("G1e","Chris Morgan annuity after full survivor reduction", a, D("14928.51"), "ch.50 FERS Ex.1 step 6c")
G("G1f","Chris Morgan monthly annuity (floor)", floor_dollar(a/12), 1244, "ch.50 FERS Ex.1 step 6d")
G("G1g","Chris Morgan survivor monthly", floor_dollar(surv/12), 691, "ch.50 FERS Ex.1 step 7b")
# G2 OPM ch.50 FERS Example 2 (Lea Williams, MRA+10, half base)
age = age_at((1975,9,10), plus_one_day((2033,9,30)))
G("G2a","Lea Williams age at commencing date", age, (58,0,21), "ch.50 FERS Ex.2 step 1")
b,f = fers_basic(93781, 13, 6, 58)
G("G2b","Lea Williams unreduced basic", b, D("12660.44"), "ch.50 FERS Ex.2 step 5d")
af = age_reduction_factor(58,0,21)
G("G2c","Age reduction factor 58y0m21d (47 full months x 5/12%)", af, D("0.804167"), "ch.50 Chart 8")
r = cents(b*af)
G("G2d","Lea Williams reduced annuity", r, D("10181.11"), "ch.50 FERS Ex.2 step 6b")
a,red,surv = fers_survivor(r, "partial")
G("G2e","Lea Williams after partial survivor reduction", a, D("9672.05"), "ch.50 FERS Ex.2 step 6e")
G("G2f","Lea Williams monthly", floor_dollar(a/12), 806, "ch.50 FERS Ex.2 step 6f")
G("G2g","Lea Williams survivor monthly", floor_dollar(surv/12), 212, "ch.50 FERS Ex.2 step 7b")
# G3 OPM ch.50 FERS Example 5 (postponed to 62: no age reduction)
a,red,surv = fers_survivor(D("12660.44"), "partial")
G("G3a","Lea postponed: annual after partial survivor", a, D("12027.42"), "ch.50 FERS Ex.5 step 6c")
G("G3b","Lea postponed: monthly", floor_dollar(a/12), 1002, "ch.50 FERS Ex.5 step 6d")
G("G3c","Lea postponed: survivor monthly", floor_dollar(surv/12), 263, "ch.50 FERS Ex.5 step 7b")
# G4 service credit arithmetic
civ = ymd_diff((1965,7,9), plus_one_day((1995,8,24))); mil = ymd_diff((1962,6,9), plus_one_day((1964,6,18)))
G("G4a","Civilian 7-9-65..8-24-95", civ, (30,1,16), "ch.50 §50A2.1-2B example")
G("G4b","Military 6-9-62..6-18-64", mil, (2,0,10), "ch.50 §50A2.1-2B example")
G("G4c","1571 h sick leave", sick_leave_credit(1571), (0,9,1), "ch.50 §50A2.1-2B example / Chart 2")
G("G4d","Total service, days dropped", whole_months(add_ymd(civ, mil, (0,9,1))), (32,10), "ch.50 §50A2.1-2B example")
G("G4e","Last day of Feb counts as 31: 1-6-72..2-28-77", ymd_diff((1972,1,6),plus_one_day((1977,2,28))), (5,1,25), "ch.50 §50A2.1-3D example (M1)")
# G5 sick leave chart
G("G5a","2000 h sick leave", sick_leave_credit(2000), (0,11,15), "ch.50 §50A2.1-3F")
G("G5b","1500 h -> next higher 1501", sick_leave_credit(1500), (0,8,19), "ch.50 §50A2.1-3F")
G("G5c","835 h", sick_leave_credit(835), (0,4,24), "RI 83-8 example")
G("G5d","441 h", sick_leave_credit(441), (0,2,16), "RI 83-8 example")
G("G5e","2087 h = 1 year", sick_leave_credit(2087), (1,0,0), "5 USC 8415(l) / ch.50 §50A2.1-3F")
G("G5f","2500 h = 1 y + 413 h -> 2 m 12 d (417)", sick_leave_credit(2500), (1,2,12), "Chart 2, derived")
# G6 CSRS 80% cap + sick leave
b,pct = csrs_basic(100000, 43, 0, sick_years=1)
G("G6","Tom: 43 y CSRS + 1 y sick leave = 82%", pct, D("0.820000"), "ch.50 §50A3.1-2A example")
# G7/G8 CSRS survivor
a,red,surv = csrs_survivor(14000, 14000)
G("G7","CSRS full survivor on $14,000 -> $12,870, survivor $7,700", (a,red,surv), (D("12870.00"),D("1130.00"),D("7700.00")), "ch.50 §50B3.1-4 D Ex.1 / F")
a,red,surv = csrs_survivor(14000, 3000)
G("G8","CSRS partial base $3,000 -> $13,925, survivor $1,650", (a,red,surv), (D("13925.00"),D("75.00"),D("1650.00")), "ch.50 §50B3.1-4 D Ex.2 / F")
# G9 CSRS offset
G("G9","CSRS Offset: 6 y offset, SS $500 -> lesser($100, $75) = $75", csrs_offset(500, 6, 0, 100), D("75.00"), "ch.50 §50A3.1-4C example")
G("G9b","CSRS Offset: 3 y 8 m rounds to 4; $600 x 4/40 = $60 vs $50 attributable -> $50", csrs_offset(600, 3, 8, 50), D("50.00"), "Federal Times 2011-09-21 (OPM method)")
# G10 supplement
s,y = supplement(2112, 33, 0)
G("G10","Supplement: $2,112 x 33/40 = $1,742", s, 1742, "ch.51 §51B1.3-2 Example 1 line 4d")
G("G10b","Supplement years 29 y 6 m rounds to 30", supplement(2000, 29, 6)[1], 30, "ch.51 §51A2.1-2 D (nearest whole)")
G("G10c","Supplement years 29 y 5 m rounds to 29", supplement(2000, 29, 5)[1], 29, "ch.51 §51A2.1-2 D")
# G11 insurable interest
G("G11","Insurable interest 18 y younger -> 25% -> $3,000 on $12,000", (insurable_interest_pct(18), cents(12000*D(insurable_interest_pct(18))/100)), (25, D("3000.00")), "ch.50 §50B3.1-4 G")
# G12-13 published examples
G("G12","1% x $130,000 x 21.5 y (age 60) = $27,950", fers_basic(130000, 21, 6, 60)[0], D("27950.00"), "stwserve.com FERS basic gross annuity")
G("G13","1.1% x $150,000 x 22.5 y (age 63) = $37,125", fers_basic(150000, 22, 6, 63)[0], D("37125.00"), "stwserve.com FERS basic gross annuity")
# G14 part-time proration (published)
G("G14","Part-time: $100,000 x 37% x 93% = $34,410", cents(D(100000)*rf(factor("0.01",37,0))*D("0.93")), D("34410.00"), "fedsmith.com part-time high-3 article; ch.55 §55B2.1-1")
# G15 Chart 8 spot checks
G("G15a","Age factor 55y0m", age_reduction_factor(55,0), D("0.654167"), "ch.50 Chart 8")
G("G15b","Age factor 61y11m+1d -> 0 full months -> 1.0", age_reduction_factor(61,11,5), D("1.000000"), "ch.50 Chart 8 (61/11 = 1.000000)")
G("G15e","Age factor exactly 58y0m0d -> 48 months -> 0.80", age_reduction_factor(58,0,0), D("0.800000"), "ch.50 §50B3.1-3B rule")
G("G15c","Age factor 60y2m+1d = 21 months (Chart 8 misprints 0.913500; computed is right)", age_reduction_factor(60,2,1), D("0.912500"), "ch.50 §50B3.1-3B rule")
G("G15d","Age factor 62y0m = no reduction", age_reduction_factor(62,0,0), D("1.000000"), "ch.50 §50B3.1-3B")
# G17-18 special provisions
G("G17","LEO $120,000, 25 y, age 50: 1.7%x20 + 1%x5 = 39% -> $46,800 / $3,900 mo", (fers_basic(120000,25,0,50,special=True)[0], floor_dollar(fers_basic(120000,25,0,50,special=True)[0]/12)), (D("46800.00"), 3900), "OPM FERS computation page (special provision)")
G("G18","Special $100,000, 20 y 0 m -> 34% -> $34,000", fers_basic(100000,20,0,50,special=True)[0], D("34000.00"), "OPM FERS computation page")
G("G18b","Special at 62 with 25 y uses 1.7/1, NOT 1.1 -> $39,000 on $100k", fers_basic(100000,25,0,62,special=True)[0], D("39000.00"), "ch.50 §50B3.1-1B NOTE 1")
# G19-21 CSRS
G("G19","CSRS $100,000, 30 y -> 56.25% -> $56,250 / $4,687 mo", (csrs_basic(100000,30,0)[0], floor_dollar(csrs_basic(100000,30,0)[0]/12)), (D("56250.00"), 4687), "OPM CSRS computation page")
G("G20","CSRS 42 y capped at 80% -> $80,000", csrs_basic(100000,42,0)[0], D("80000.00"), "ch.50 §50A3.1-2")
G("G21","CSRS VERA age exactly 52y6m0d: 30 full months x 1/6% = 5% -> $53,437.50 / $4,453 mo", (cents(D("56250")*csrs_early_factor(52,6,0)), floor_dollar(cents(D("56250")*csrs_early_factor(52,6,0))/12)), (D("53437.50"), 4453), "ch.50 §50A3.1-3A")
G("G36","CSRS special 2.5%x20 + 2%x5 = 60% -> $60,000", csrs_basic(100000,25,0,special=True)[0], D("60000.00"), "OPM CSRS computation page")
# G22-25 FERS thresholds
G("G22","FERS 62/5: $80,000 x 1% x 5 = $4,000; no supplement at 62", fers_basic(80000,5,0,62)[0], D("4000.00"), "OPM eligibility page; ch.50 §50B3.1-1B NOTE 2")
G("G23","FERS 62 with 20y0m -> 1.1% -> $22,000", fers_basic(100000,20,0,62)[0], D("22000.00"), "ch.50 §50B3.1-1B")
G("G24","FERS 62 with 19y11m -> 1% -> $19,916.70", fers_basic(100000,19,11,62)[0], D("19916.70"), "ch.50 §50B3.1-1B (20 years required)")
G("G24b","FERS 61y11m at separation with 25 y -> 1% -> $25,000 (age at separation, not commencing)", fers_basic(100000,25,0,61)[0], D("25000.00"), "OPM computation page: 'at separation'")
G("G25","FERS 60/20: $90,000 x 20 y -> $18,000 unreduced", fers_basic(90000,20,0,60)[0], D("18000.00"), "OPM eligibility page")
# G26 MRA
G("G26","MRA by birth year", [mra(y) for y in (1947,1948,1952,1953,1964,1965,1969,1970,1985)], [(55,0),(55,2),(55,10),(56,0),(56,0),(56,2),(56,10),(57,0),(57,0)], "OPM FERS eligibility page")
# G27 20y at 60 -> no reduction
G("G27","MRA+10 with 20y0m commencing 60y0m1d -> 1.0 by rule; with 19y11m -> 0.904167", (mra10_factor(20,0,60,0,1), mra10_factor(19,11,60,0,1)), (D("1.000000"), D("0.904167")), "ch.50 §50B3.1-3B(2)")
# G28 earnings test 2026
G("G28a","Supplement $14,400/yr, earnings $34,480 -> reduction $5,000 -> $9,400", earnings_test(14400, 34480), (D("9400.00"), D("5000.00")), "ch.51 §51A3.1-1C; SSA 2026 exempt $24,480")
G("G28b","Earnings $60,000 -> reduction capped at $14,400 -> $0", earnings_test(14400, 60000), (D("0.00"), D("14400.00")), "ch.51 §51A3.1-1C Note 1")
G("G28c","Earnings at exempt amount -> no reduction", earnings_test(14400, 24480), (D("14400.00"), D("0.00")), "ch.51 §51A3.1-1B")
# G30 COLA
G("G30","FERS COLA from CPI-W 2.8/1.5/3.5/2.0 ; CSRS 2.8", ([fers_cola(x) for x in ("2.8","1.5","3.5","2.0")], D("2.8")), ([D("2"),D("1.5"),D("2.5"),D("2.0")], D("2.8")), "5 USC 8462(b); OPM COLA FAQ 2026 (CSRS 2.8%, FERS 2.0%)")
# G31 part-time factor
pf = proration_factor(30, [(5,20)])
G("G31","30 y with 5 y at 20 h/wk -> 92% -> $27,600", (pf, cents(D(100000)*rf(factor("0.01",30,0))*pf)), (D("0.92"), D("27600.00")), "ch.55 §55A1.1-2F, §55B2.1-1B (nearest percent)")
# G32 partial survivor
a,red,surv = fers_survivor(30000, "partial")
G("G32","FERS partial on $30,000 -> $28,500; survivor $7,500 ($625/mo)", (a, red, floor_dollar(surv/12)), (D("28500.00"), D("1500.00"), 625), "ch.52 §52B (25%/5%); ch.50 FERS Ex.2 pattern")
# G33 TSP
fv = tsp_fv(200000, 15000, "0.06", 10)
G("G33","TSP $200k + $15k/yr @6% x 10 y -> $555,881.46; 4% -> $22,235.26/yr -> $1,852 mo", (fv, floor_dollar(cents(fv*D("0.04"))/12)), (D("555881.46"), 1852), "arithmetic (end-of-year contributions)")
# G34 lump sum leave
G("G34","240 h annual leave x $104,350/2087 = $12,000", lump_sum_leave(240, 104350), D("12000.00"), "5 USC 5551; 2,087-hour divisor (5 USC 5504)")
# G35 deferred
G("G35a","Deferred: 15 y, $70,000, commence 62 -> $10,500 (1%, see §4.9 open question)", fers_basic(70000,15,0,50)[0], D("10500.00"), "OPM types-of-retirement page")
G("G35b","Deferred, born 1976-03-15, commence 2033-04-01 (57y0m17d): 59 full months -> 0.754167 -> $7,918.75", cents(D("10500")*age_reduction_factor(*age_at((1976,3,15),(2033,4,1)))), D("7918.75"), "OPM types-of-retirement page; Chart 8")

if __name__ == "__main__":
    print(f"ALL {len(rows)} GOLDEN CHECKS PASS\n")
    print("| # | Case | Expected | Source |\n|---|---|---|---|")
    for id_, desc, got, exp, src, ok in rows:
        print(f"| {id_} | {desc} | `{exp}` | {src} |")
