// Property check: the JS engine must agree with the independent Python reference (test/oracle.py) on random inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  sickLeaveCredit, fersFactor, fersSpecialFactor, csrsFactor, ageReductionFactor, csrsEarlyFactor,
  applyFactor, spanThrough, ageOn, plusOneDay,
} from '../src/engine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let seed = 12345;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };

test('JS engine == Python oracle on 600 random cases', () => {
  const cases = [];
  for (let i = 0; i < 600; i++) {
    const months = 60 + rnd(40 * 12);
    cases.push({
      hours: rnd(5000), months, high3c: 3000000 + rnd(20000000), sickM: rnd(36),
      ageY: 50 + rnd(15), ageM: rnd(12), ageD: rnd(30),
      by: 1950 + rnd(50), bm: 1 + rnd(12), bd: 1 + rnd(28),
      sy: 1985 + rnd(30), sm: 1 + rnd(12), sd: 1 + rnd(28),
      ey: 2016 + rnd(20), em: 1 + rnd(12), ed: 1 + rnd(28),
    });
  }
  const py = `
import sys, json
sys.path.insert(0, ${JSON.stringify(here)})
import oracle as o
from decimal import Decimal as D
out = []
for c in json.load(sys.stdin):
    y, m = divmod(c['months'], 12)
    h3 = D(c['high3c']) / 100
    sick = o.sick_leave_credit(c['hours'])
    f1 = o.rf(o.factor("0.01", y, m)); f11 = o.rf(o.factor("0.011", y, m))
    sp = o.fers_basic(h3, y, m, 50, special=True)[1]
    sy, sm = divmod(c['sickM'], 12)
    cs = o.csrs_basic(h3, y, m, sick_years=sy, sick_months=sm)[1]
    csp = o.csrs_basic(h3, y, m, special=True)[1]
    ar = o.age_reduction_factor(c['ageY'], c['ageM'], c['ageD'])
    ce = o.csrs_early_factor(c['ageY'], c['ageM'], c['ageD'])
    b = o.cents(h3 * f1)
    red = o.cents(b * ar)
    sp1 = o.plus_one_day((c['sy'], c['sm'], c['sd'])); ep = o.plus_one_day((c['ey'], c['em'], c['ed']))
    span = o.ymd_diff((c['sy'], c['sm'], c['sd']), ep)
    age = o.age_at((c['by'], c['bm'], c['bd']), ep)
    out.append(dict(sick=list(sick), f1=int(f1*10**6), f11=int(f11*10**6), sp=int(sp*10**6), cs=int(cs*10**6),
      csp=int(csp*10**6), ar=int(ar*10**6), ce=int(ce*10**6), basic=int(b*100), red=int(red*100), span=list(span), age=list(age)))
print(json.dumps(out))
`;
  const r = spawnSync('python3', ['-I', '-c', py], { input: JSON.stringify(cases), encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  const exp = JSON.parse(r.stdout);
  cases.forEach((c, i) => {
    const e = exp[i], tag = JSON.stringify(c);
    assert.deepEqual(sickLeaveCredit(c.hours), e.sick, 'sick ' + tag);
    assert.equal(fersFactor(c.months), e.f1, 'f1 ' + tag);
    assert.equal(fersFactor(c.months, true), e.f11, 'f11 ' + tag);
    assert.equal(fersSpecialFactor(c.months), e.sp, 'special ' + tag);
    assert.equal(csrsFactor(c.months + c.sickM, c.sickM), e.cs, 'csrs ' + tag);
    assert.equal(csrsFactor(c.months, 0, true), e.csp, 'csrs special ' + tag);
    assert.equal(ageReductionFactor([c.ageY, c.ageM, c.ageD]), e.ar, 'age red ' + tag);
    assert.equal(csrsEarlyFactor([c.ageY, c.ageM, c.ageD]), e.ce, 'csrs early ' + tag);
    const basic = applyFactor(c.high3c, fersFactor(c.months));
    assert.equal(basic, e.basic, 'basic ' + tag);
    assert.equal(applyFactor(basic, ageReductionFactor([c.ageY, c.ageM, c.ageD])), e.red, 'reduced ' + tag);
    const s = { y: c.sy, m: c.sm, d: c.sd }, en = { y: c.ey, m: c.em, d: c.ed };
    assert.deepEqual(spanThrough(s, en), e.span, 'span ' + tag);
    assert.deepEqual(ageOn({ y: c.by, m: c.bm, d: c.bd }, plusOneDay(en)), e.age, 'age ' + tag);
  });
});

test('the Python oracle itself still passes its golden table', () => {
  const r = spawnSync('python3', ['-I', path.join(here, 'oracle.py')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ALL \d+ GOLDEN CHECKS PASS/);
});
