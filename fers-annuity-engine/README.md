# FERS / CSRS annuity engine

**Problem.** Federal retirement estimates are rules-heavy: service time in OPM's 30-day months, sick leave credit, age-based reductions, survivor elections, the FERS supplement. Small rounding differences produce wrong dollar amounts, so "close enough" floating-point math is not acceptable.

**What it does.** A dependency-free JavaScript engine that computes a gross basic annuity the way OPM's published examples do. Money is integer cents, accrual and reduction factors are integers in millionths, and no float ever touches a dollar amount.

**How it is tested (the interesting part).**
- `test/golden.test.js`: worked examples from OPM's public retirement guidance, asserted line by line (service span, accrual factor, annuity, survivor reduction), plus edge cases (80% CSRS cap, 1.1% accrual only at age 62+ with 20+ years, special-provisions factor).
- `test/oracle-crosscheck.test.js`: runs 600 pseudo-random cases through both the JS engine and an independent Python reference (`test/oracle.py`, decimal arithmetic) and requires exact agreement.

**Run.**

    npm test        # Node 18+ and python3, no installs

**Stack.** JavaScript (ES modules), Node's built-in test runner, Python 3 standard library for the oracle.

Educational estimates only, not retirement advice.
