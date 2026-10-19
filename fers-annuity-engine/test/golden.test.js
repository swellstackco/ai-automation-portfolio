import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  spanThrough, ageOn, plusOneDay, addYmd, sickLeaveCredit, mra, fersFactor, fersSpecialFactor,
  csrsFactor, ageReductionFactor, csrsEarlyFactor, mraPlus10Factor, applyFactor, estimate,
  fersSurvivor, csrsSurvivor, supplementMonthly, earningsTest, parseDate, classify,
} from '../src/engine.js';

const D = (s) => parseDate(s);
const m6 = (micro) => (micro / 1e6).toFixed(6);
const usd = (cents) => (cents / 100).toFixed(2);
const wm = (t) => [t[0], t[1]];

test('G1 Chris Morgan (OPM FERS Example 1)', () => {
  const birth = D('1964-03-15');
  assert.deepEqual(ageOn(birth, plusOneDay(D('2024-07-30'))), [60, 4, 16]);          // G1a
  const svc = addYmd(spanThrough(D('1982-12-30'), D('1986-03-29')),
                     spanThrough(D('1994-05-23'), D('1997-05-22')),
                     spanThrough(D('1999-08-15'), D('2024-07-30')));
  assert.deepEqual(wm(svc), [31, 2]);                                                 // G1b
  const f = fersFactor(31 * 12 + 2);
  assert.equal(m6(f), '0.311667');                                                    // G1c
  const basic = applyFactor(5322100, f);
  assert.equal(usd(basic), '16587.23');                                               // G1d (exact fraction would give .21)
  const full = fersSurvivor(basic, 'full');
  assert.equal(usd(full.payable), '14928.51');                                        // G1e
  assert.equal(Math.floor(full.payable / 1200), 1244);                                // G1f
  assert.equal(Math.floor(full.survivor / 1200), 691);                                // G1g
});

test('G2 Lea Williams (OPM FERS Example 2, 47 full months under 62)', () => {
  const birth = D('1975-09-10');
  const age = ageOn(birth, { y: 2033, m: 10, d: 1 });
  assert.deepEqual(age, [58, 0, 21]);                                                 // G2a
  const basic = applyFactor(9378100, fersFactor(13 * 12 + 6));
  assert.equal(usd(basic), '12660.44');                                               // G2b
  const af = ageReductionFactor(age);
  assert.equal(m6(af), '0.804167');                                                   // G2c (47 months)
  const reduced = applyFactor(basic, af);
  assert.equal(usd(reduced), '10181.11');                                             // G2d
  const part = fersSurvivor(reduced, 'partial');
  assert.equal(usd(part.payable), '9672.05');                                         // G2e
  assert.equal(Math.floor(part.payable / 1200), 806);                                 // G2f
  assert.equal(Math.floor(part.survivor / 1200), 212);                                // G2g
  // G3 postponed to 62, no reduction
  const post = fersSurvivor(basic, 'partial');
  assert.equal(usd(post.payable), '12027.42');
  assert.equal(Math.floor(post.payable / 1200), 1002);
  assert.equal(Math.floor(post.survivor / 1200), 263);
});

test('G2 end to end through estimate()', () => {
  const r = estimate({ system: 'FERS', category: 'regular', path: 'voluntary', birth: D('1975-09-10'),
    rscd: D('2020-04-01'), sep: D('2033-09-30'), hours: 0, high3: 93781 });
  assert.equal(r.kind, 'mraPlus10');
  assert.deepEqual(r.service.total, [13, 6, 0]);
  assert.equal(usd(r.basicCents), '12660.44');
  assert.equal(m6(r.reductionMicro), '0.804167');
  assert.equal(usd(r.payableCents), '10181.11');
  assert.equal(r.monthly, 848);
});

test('G4 service arithmetic', () => {
  assert.deepEqual(spanThrough(D('1965-07-09'), D('1995-08-24')), [30, 1, 16]);
  assert.deepEqual(spanThrough(D('1962-06-09'), D('1964-06-18')), [2, 0, 10]);
  assert.deepEqual(sickLeaveCredit(1571), [0, 9, 1]);
  assert.deepEqual(wm(addYmd([30, 1, 16], [2, 0, 10], [0, 9, 1])), [32, 10]);
  assert.deepEqual(spanThrough(D('1972-01-06'), D('1977-02-28')), [5, 1, 25]);        // last day of Feb counts as 31
});

test('G5 sick leave chart', () => {
  assert.deepEqual(sickLeaveCredit(2000), [0, 11, 15]);
  assert.deepEqual(sickLeaveCredit(1500), [0, 8, 19]);                                // next higher entry 1,501
  assert.deepEqual(sickLeaveCredit(835), [0, 4, 24]);
  assert.deepEqual(sickLeaveCredit(441), [0, 2, 16]);
  assert.deepEqual(sickLeaveCredit(2087), [1, 0, 0]);
  assert.deepEqual(sickLeaveCredit(2500), [1, 2, 12]);
});

test('G15 age reduction factors', () => {
  assert.equal(m6(ageReductionFactor([55, 0, 1])), '0.654167');
  assert.equal(m6(ageReductionFactor([61, 11, 5])), '1.000000');
  assert.equal(m6(ageReductionFactor([60, 2, 1])), '0.912500');                       // Chart 8 misprints 0.913500
  assert.equal(m6(ageReductionFactor([62, 0, 0])), '1.000000');
  assert.equal(m6(ageReductionFactor([58, 0, 0])), '0.800000');                       // exactly 48 months
});

test('G17 / G18 special provision', () => {
  const b = applyFactor(12000000, fersSpecialFactor(25 * 12));
  assert.equal(usd(b), '46800.00');
  assert.equal(Math.floor(b / 1200), 3900);
  assert.equal(usd(applyFactor(10000000, fersSpecialFactor(240))), '34000.00');
  assert.equal(usd(applyFactor(10000000, fersSpecialFactor(300))), '39000.00');       // never 1.1%
});

test('G19-21, G36 CSRS', () => {
  const b = applyFactor(10000000, csrsFactor(30 * 12));
  assert.equal(usd(b), '56250.00');
  assert.equal(Math.floor(b / 1200), 4687);
  assert.equal(usd(applyFactor(10000000, csrsFactor(42 * 12))), '80000.00');          // 80% cap
  assert.equal(m6(csrsFactor(44 * 12, 12)), '0.820000');                              // G6: 43 y + 1 y sick = 82%
  const early = applyFactor(5625000, csrsEarlyFactor([52, 6, 0]));
  assert.equal(usd(early), '53437.50');
  assert.equal(Math.floor(early / 1200), 4453);
  assert.equal(usd(applyFactor(10000000, csrsFactor(300, 0, true))), '60000.00');     // G36
  const s1 = csrsSurvivor(1400000, 1400000);
  assert.deepEqual([usd(s1.payable), usd(s1.survivor)], ['12870.00', '7700.00']);     // G7
  const s2 = csrsSurvivor(1400000, 300000);
  assert.deepEqual([usd(s2.payable), usd(s2.survivor)], ['13925.00', '1650.00']);     // G8
});

test('G12-14, G22-25 FERS thresholds', () => {
  assert.equal(usd(applyFactor(13000000, fersFactor(21 * 12 + 6))), '27950.00');      // G12
  assert.equal(usd(applyFactor(15000000, fersFactor(22 * 12 + 6, true))), '37125.00');// G13
  assert.equal(usd(applyFactor(8000000, fersFactor(60))), '4000.00');                 // G22
  assert.equal(usd(applyFactor(10000000, fersFactor(240, true))), '22000.00');        // G23
  assert.equal(usd(applyFactor(10000000, fersFactor(19 * 12 + 11))), '19916.70');     // G24
  assert.equal(usd(applyFactor(10000000, fersFactor(300))), '25000.00');              // G24b
  assert.equal(usd(applyFactor(9000000, fersFactor(240))), '18000.00');               // G25
});

test('G26 MRA by birth year', () => {
  assert.deepEqual([1947, 1948, 1952, 1953, 1964, 1965, 1969, 1970, 1985].map(mra),
    [[55, 0], [55, 2], [55, 10], [56, 0], [56, 0], [56, 2], [56, 10], [57, 0], [57, 0]]);
});

test('G23/G24 through estimate(): 1.1% needs 20y0m at 62', () => {
  const base = { system: 'FERS', category: 'regular', path: 'voluntary', birth: D('1960-01-15'), high3: 100000, hours: 0 };
  const a = estimate({ ...base, rscd: D('2002-02-01'), sep: D('2022-01-31') });        // 20y0m, age 62y0m16d
  assert.equal(a.kind, 'immediateUnreduced');
  assert.equal(usd(a.payableCents), '22000.00');
  const b = estimate({ ...base, rscd: D('2002-03-01'), sep: D('2022-01-31') });        // 19y11m
  assert.equal(usd(b.payableCents), '19916.70');
});

test('G27 MRA+10 waiver at 20 years and 60', () => {
  assert.equal(m6(mraPlus10Factor([20, 0, 0], [60, 0, 1])), '1.000000');
  assert.equal(m6(mraPlus10Factor([19, 11, 0], [60, 0, 1])), '0.904167');
  assert.equal(m6(mraPlus10Factor([30, 0, 0], [56, 0, 1])), '1.000000');
});

test('G10, G28 supplement and earnings test (numbers quoted in the guides)', () => {
  assert.equal(supplementMonthly(2112, 33, 0).dollars, 1742);
  assert.equal(supplementMonthly(2000, 29, 6).years, 30);
  assert.equal(supplementMonthly(2000, 29, 5).years, 29);
  assert.deepEqual(earningsTest(14400, 34480), { payable: 9400, reduction: 5000 });
  assert.deepEqual(earningsTest(14400, 60000), { payable: 0, reduction: 14400 });
  assert.deepEqual(earningsTest(14400, 24480), { payable: 14400, reduction: 0 });
});

test('classification guards', () => {
  const base = { system: 'FERS', category: 'regular', path: 'voluntary' };
  // age 62 with 5 years -> unreduced; age under MRA -> not eligible
  assert.equal(classify({ ...base, birth: D('1960-01-15'), sep: D('2022-01-31'), eligSvc: [5, 0, 0] }), 'immediateUnreduced');
  assert.equal(classify({ ...base, birth: D('1990-01-15'), sep: D('2030-01-31'), eligSvc: [15, 0, 0] }), 'notEligible');
  assert.equal(classify({ ...base, category: 'special', birth: D('1980-01-15'), sep: D('2030-01-31'), eligSvc: [20, 0, 0] }), 'specialImmediate');
});
