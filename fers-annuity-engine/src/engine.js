// Federal retirement (FERS/CSRS) annuity engine: the OPM rules for gross basic annuity.
// Cross-checked against test/oracle.py. Money is integer cents; accrual/reduction factors are integers in
// millionths (six places, the way OPM's charts print them). No floats touch a dollar amount.
// Dates are {y, m, d} (month 1-12). Spans/ages are [years, months, days] with OPM's 30-day months.

export const CHART2 = [
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
];

/** Round half up for non-negative integers: n/d. */
export const divRound = (n, d) => Math.floor((2 * n + d) / (2 * d));

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Lexicographic compare of [y,m,d] tuples (missing parts = 0). */
export function cmp(a, b) {
  for (let i = 0; i < 3; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** OPM "day after separation": the last day of ANY month counts as 31 (C50 50A2.1-3D). */
export function plusOneDay({ y, m, d }) {
  return { y, m, d: d >= daysInMonth(y, m) ? 31 : d + 1 };
}

/** [y,m,d] from start to end with 30-day months; end already carries its +1 day. */
export function ymdDiff(start, end) {
  let d = end.d - start.d, m = end.m - start.m, y = end.y - start.y;
  if (d < 0) { d += 30; m -= 1; }
  if (m < 0) { m += 12; y -= 1; }
  if (d >= 30) { d -= 30; m += 1; }
  if (m >= 12) { m -= 12; y += 1; }
  return [y, m, d];
}

export function addYmd(...parts) {
  let y = 0, m = 0, d = 0;
  for (const p of parts) { y += p[0]; m += p[1]; d += p[2]; }
  m += Math.floor(d / 30); d %= 30;
  y += Math.floor(m / 12); m %= 12;
  return [y, m, d];
}

/** Service in a period of creditable service, retirement day counted. */
export const spanThrough = (start, end) => ymdDiff(start, plusOneDay(end));

/** Age on a date (pass the commencing date, or plusOneDay(separation)). */
export const ageOn = (birth, date) => ymdDiff(birth, date);

/** Hours -> [years, months, days] by Chart 2; next higher entry when not on the chart. */
export function sickLeaveCredit(hours) {
  const h = Math.max(0, Math.floor(hours));
  const years = Math.floor(h / 2087), rem = h % 2087;
  if (rem === 0) return [years, 0, 0];
  let best = null;
  for (let d = 0; d < 30; d++) for (let m = 0; m < 12; m++) {
    const v = CHART2[d][m];
    if (v >= rem && (best === null || v < best[0])) best = [v, m, d];
  }
  return [years, best[1], best[2]];
}

/** Minimum retirement age as [years, months]. */
export function mra(birthYear) {
  if (birthYear < 1948) return [55, 0];
  if (birthYear <= 1952) return [55, 2 * (birthYear - 1947)];
  if (birthYear <= 1964) return [56, 0];
  if (birthYear <= 1969) return [56, 2 * (birthYear - 1964)];
  return [57, 0];
}

// ---- factors, in millionths ----
/** FERS 1% (or 1.1%) per year of service. totalMonths = whole months of service. */
export function fersFactor(totalMonths, bump = false) {
  return divRound(totalMonths * (bump ? 11000 : 10000), 12);
}
/** FERS special provision: 1.7% x first 20 years + 1% x the rest. */
export function fersSpecialFactor(totalMonths) {
  return divRound(17000 * Math.min(totalMonths, 240) + 10000 * Math.max(totalMonths - 240, 0), 12);
}
/** CSRS: 1.5% x 5 + 1.75% x 5 + 2% x rest, 80% cap, then sick leave at 2% a year on top. */
export function csrsFactor(totalMonths, sickMonths = 0, special = false) {
  const reg = totalMonths - sickMonths;
  const num = special
    ? 25000 * Math.min(reg, 240) + 20000 * Math.max(reg - 240, 0)
    : 15000 * Math.min(reg, 60) + 17500 * Math.max(Math.min(reg, 120) - 60, 0) + 20000 * Math.max(reg - 120, 0);
  return divRound(Math.min(num, 800000 * 12) + 20000 * sickMonths, 12);
}
const fullMonthsUnder = (limitYears, [y, m, d]) =>
  Math.max(0, (limitYears - y) * 12 - m - (d > 0 ? 1 : 0));
/** FERS: 5/12 of 1% per FULL month under 62 at the commencing date. */
export const ageReductionFactor = (age) => 1000000 - divRound(fullMonthsUnder(62, age) * 12500, 3);
/** CSRS early: 1/6 of 1% per full month under 55. */
export const csrsEarlyFactor = (age) => 1000000 - divRound(fullMonthsUnder(55, age) * 5000, 3);
/** MRA+10 reduction waivers: 30 years, or 20 years and commencing at 60+ (sick leave never counts). */
export function mraPlus10Factor(eligSvc, age) {
  if (cmp(eligSvc, [30, 0, 0]) >= 0) return 1000000;
  if (cmp(eligSvc, [20, 0, 0]) >= 0 && age[0] >= 60) return 1000000;
  return ageReductionFactor(age);
}

/** cents x factor(millionths) -> cents, half up. */
export const applyFactor = (cents, micro) => divRound(cents * micro, 1000000);

// ---- eligibility ----
export const KIND_LABEL = {
  immediateUnreduced: 'Immediate, unreduced',
  specialImmediate: 'Immediate, special provision',
  early: 'Early retirement (VERA / DSR)',
  mraPlus10: 'MRA+10, reduced for age',
  notEligible: 'Not eligible for an immediate annuity',
};

/**
 * input: { system:'FERS'|'CSRS', category:'regular'|'special', path:'voluntary'|'early',
 *          birth:{y,m,d}, sep:{y,m,d}, eligSvc:[y,m,d] }   (eligSvc = service WITHOUT sick leave)
 */
export function classify({ system, category, path, birth, sep, eligSvc }) {
  const age = ageOn(birth, plusOneDay(sep));
  const svc = eligSvc;
  const m = mra(birth.y);
  const ge = (a, b) => cmp(a, b) >= 0;
  if (system === 'CSRS') {
    if (category === 'special' && ge(age, [50, 0, 0]) && ge(svc, [20, 0, 0])) return 'specialImmediate';
    if ((ge(age, [62, 0, 0]) && ge(svc, [5, 0, 0])) || (ge(age, [60, 0, 0]) && ge(svc, [20, 0, 0])) ||
        (ge(age, [55, 0, 0]) && ge(svc, [30, 0, 0]))) return 'immediateUnreduced';
    if (path === 'early' && ((ge(age, [50, 0, 0]) && ge(svc, [20, 0, 0])) || ge(svc, [25, 0, 0]))) return 'early';
    return 'notEligible';
  }
  if (category === 'special' && ((ge(age, [50, 0, 0]) && ge(svc, [20, 0, 0])) || ge(svc, [25, 0, 0]))) return 'specialImmediate';
  if ((ge(age, [62, 0, 0]) && ge(svc, [5, 0, 0])) || (ge(age, [60, 0, 0]) && ge(svc, [20, 0, 0])) ||
      (ge(age, [m[0], m[1], 0]) && ge(svc, [30, 0, 0]))) return 'immediateUnreduced';
  if (path === 'early' && ((ge(age, [50, 0, 0]) && ge(svc, [20, 0, 0])) || ge(svc, [25, 0, 0]))) return 'early';
  if (ge(age, [m[0], m[1], 0]) && ge(svc, [10, 0, 0])) return 'mraPlus10';
  return 'notEligible';
}

// ---- dates ----
export function commencingDate(system, sep) {
  const nextMonth = sep.m === 12 ? { y: sep.y + 1, m: 1, d: 1 } : { y: sep.y, m: sep.m + 1, d: 1 };
  if (system === 'CSRS' && sep.d <= 3) {
    const t = new Date(Date.UTC(sep.y, sep.m - 1, sep.d + 1));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  return nextMonth;
}
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const o = { y: +m[1], m: +m[2], d: +m[3] };
  const t = new Date(Date.UTC(o.y, o.m - 1, o.d));
  return t.getUTCMonth() + 1 === o.m && t.getUTCDate() === o.d ? o : null;
}
export const lastDayOf = (y, m) => ({ y, m, d: daysInMonth(y, m) });

// ---- the estimate ----
const wholeMonths = (t) => t[0] * 12 + t[1];

/**
 * input: { system, category, path, birth, rscd, sep, hours, high3 }   (high3 in dollars)
 * returns { kind, ageSep, ageCommence, service:{span, sick, total, elig}, factorMicro, reductionMicro,
 *           basicCents, payableCents, annual, monthly, commencing, rows[] } ; monthly is null when not eligible.
 */
export function estimate(input) {
  const { system, category = 'regular', path = 'voluntary', birth, rscd, sep } = input;
  const span = spanThrough(rscd, sep);
  const sick = sickLeaveCredit(input.hours || 0);
  const total = addYmd(span, sick);
  const totalMonths = wholeMonths(total);
  const eligSvc = span;
  const kind = classify({ system, category, path, birth, sep, eligSvc });
  const ageSep = ageOn(birth, plusOneDay(sep));
  const commencing = commencingDate(system, sep);
  const ageCommence = ageOn(birth, commencing);
  const high3Cents = Math.round((input.high3 || 0) * 100);
  const out = { kind, ageSep, ageCommence, commencing, service: { span, sick, total, elig: eligSvc }, rows: [] };
  if (kind === 'notEligible' || totalMonths <= 0) { out.monthly = null; out.annual = null; return out; }

  let factor, rule, ruleWhy;
  if (system === 'FERS') {
    if (category === 'special' && kind === 'specialImmediate') {
      factor = fersSpecialFactor(totalMonths); rule = '1.7% for the first 20 years, 1% after'; ruleWhy = 'special';
    } else {
      const bump = cmp(ageSep, [62, 0, 0]) >= 0 && cmp(total, [20, 0, 0]) >= 0;
      factor = fersFactor(totalMonths, bump);
      rule = bump ? '1.1% per year (age 62+ with 20+ years)' : '1.0% per year';
      ruleWhy = bump ? 'bump' : 'one';
    }
  } else {
    const special = category === 'special' && kind === 'specialImmediate';
    factor = csrsFactor(totalMonths, wholeMonths(sick), special);
    rule = special ? '2.5% x 20 years, 2% after' : '1.5% / 1.75% / 2% tiers, 80% cap';
    ruleWhy = 'csrs';
  }
  const basic = applyFactor(high3Cents, factor);
  let reduction = 1000000, payable = basic;
  if (system === 'FERS' && kind === 'mraPlus10') reduction = mraPlus10Factor(eligSvc, ageCommence);
  if (system === 'CSRS' && kind === 'early') reduction = csrsEarlyFactor(ageCommence);
  if (reduction !== 1000000) payable = applyFactor(basic, reduction);
  out.factorMicro = factor; out.reductionMicro = reduction;
  out.basicCents = basic; out.payableCents = payable;
  out.annual = payable / 100;
  out.monthly = Math.floor(payable / 1200);
  out.ruleLabel = rule; out.ruleWhy = ruleWhy;
  return out;
}

/** First month-end separation date (from `from`, to age 70) whose result satisfies pred(kind, ageSep). */
export function earliestSeparation(base, from, pred) {
  const end = base.birth.y + 70;
  let y = from.y, m = from.m;
  while (y <= end) {
    const sep = lastDayOf(y, m);
    if (cmp([sep.y, sep.m, sep.d], [base.rscd.y, base.rscd.m, base.rscd.d]) > 0) {
      const eligSvc = spanThrough(base.rscd, sep);
      const kind = classify({ ...base, sep, eligSvc });
      if (pred(kind, ageOn(base.birth, plusOneDay(sep)))) return sep;
    }
    m++; if (m > 12) { m = 1; y++; }
  }
  return null;
}

// ---- helpers for later-tier rows; used by tests and to verify numbers quoted in guides ----
/** FERS survivor election: full = 10% of whole annuity, partial = 10% of half. Returns cents. */
export function fersSurvivor(annuityCents, election) {
  if (election === 'none') return { payable: annuityCents, reduction: 0, survivor: 0 };
  const base = election === 'full' ? annuityCents : divRound(annuityCents, 2);
  const reduction = divRound(base, 10), survivor = divRound(base, 2);
  return { payable: annuityCents - reduction, reduction, survivor };
}
/** CSRS survivor reduction: 2.5% of the first $3,600 of base + 10% of the rest; survivor 55% of base. */
export function csrsSurvivor(annuityCents, baseCents) {
  const first = Math.min(baseCents, 360000), rest = Math.max(baseCents - 360000, 0);
  const reduction = divRound(first * 25 + rest * 100, 1000);
  return { payable: annuityCents - reduction, reduction, survivor: divRound(baseCents * 55, 100) };
}
/** Monthly supplement (whole dollars): SSA estimate at 62 x service years (nearest year, max 40) / 40. */
export function supplementMonthly(ssAt62, svcYears, svcMonths) {
  const yrs = Math.min(svcYears + (svcMonths >= 6 ? 1 : 0), 40);
  return { dollars: Math.floor((ssAt62 * yrs) / 40), years: yrs };
}
/** Earnings test: $1 off for every $2 over the exempt amount, never more than the supplement. Dollars. */
export function earningsTest(annualSupplement, earnings, exempt = 24480) {
  const reduction = Math.min(Math.max((earnings - exempt) / 2, 0), annualSupplement);
  return { payable: annualSupplement - reduction, reduction };
}
