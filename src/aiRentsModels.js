export const AI_RENTS_2C_DEFAULTS = {
  periods: 25,
  l: 3,
  target_y_ratio_A: 1.5,
  L_ratio_A: 5.0,
  w1: 0.0,
  w2: 0.0,
  tau1: 0.0,
  tau2: 0.0,
  g1: 0.012,
  g2: 0.005,
  theta: 0.0,
  lambda: 0.0,
};

export const AI_RENTS_3C_DEFAULTS = {
  periods: 25,
  l: 3,
  target_y_ratio_A: 2.0,
  target_y_ratio_B: 1.5,
  L_ratio_A: 5.0,
  L_ratio_B: 3.0,
  w1: 0.0,
  w2: 0.0,
  w3: 0.0,
  tau1: 0.0,
  tau2: 0.0,
  tau3: 0.0,
  g1: 0.012,
  g2: 0.005,
  g3: 0.001,
  theta: 0.0,
  lambda: 0.2,
};

const EPS = 1e-12;
const MAX_SAVINGS_ITERS = 25;
const MAX_MARKET_ITERS = 300;

const clampMin = (x, min = EPS) => (Number.isFinite(x) ? Math.max(x, min) : min);
const safeDiv = (num, den, fallback = 0) => {
  if (!Number.isFinite(num) || !Number.isFinite(den) || Math.abs(den) < EPS) return fallback;
  return num / den;
};
const sum = (arr) => arr.reduce((acc, value) => acc + value, 0);
const range = (n) => Array.from({ length: n }, (_, i) => i);
const cloneMatrix = (matrix) => matrix.map((row) => [...row]);
const zeroMatrix = (rows, cols) => Array.from({ length: rows }, () => Array(cols).fill(0));
const zeroSeries = (n, len) => Array.from({ length: n }, () => Array(len).fill(0));
const rowSums = (matrix) => matrix.map((row) => sum(row));
const colSums = (matrix) => matrix[0].map((_, col) => matrix.reduce((acc, row) => acc + row[col], 0));
const extendWithTail = (series, extra) => [...series, ...Array(extra).fill(series[series.length - 1])];
const annualizedRate = (startValue, endValue, yearsSpan) => {
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue) || startValue <= 0 || endValue <= 0) return 0;
  if (!Number.isFinite(yearsSpan) || yearsSpan <= 0) return 0;
  return Math.pow(endValue / startValue, 1 / yearsSpan) - 1;
};

const bisectRoot = (fun, a, b, tol = 1e-12, maxit = 200) => {
  let low = a;
  let high = b;
  let fLow = fun(low);
  let fHigh = fun(high);

  if (Math.abs(fLow) < tol) return low;
  if (Math.abs(fHigh) < tol) return high;
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh)) {
    return Math.abs(fLow) < Math.abs(fHigh) ? low : high;
  }
  if (Math.sign(fLow) === Math.sign(fHigh)) {
    return Math.abs(fLow) < Math.abs(fHigh) ? low : high;
  }

  let mid = 0.5 * (low + high);
  for (let it = 0; it < maxit; it += 1) {
    mid = 0.5 * (low + high);
    const fMid = fun(mid);
    if (Math.abs(fMid) < tol || 0.5 * (high - low) < tol) return mid;
    if (Math.sign(fMid) === Math.sign(fLow)) {
      low = mid;
      fLow = fMid;
    } else {
      high = mid;
      fHigh = fMid;
    }
  }
  return mid;
};

const getY = (k, bt, rho, gamma, A, L) => {
  const kEff = Math.max(k, EPS);
  const taskAgg = Math.max(
    EPS,
    Math.pow(bt, 1 - rho) * Math.pow(kEff, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho),
  );
  const value = A * Math.pow(kEff, gamma) * Math.pow(taskAgg, (1 - gamma) / rho);
  return k <= 0 ? 0 : value;
};

const getPhysicalReturn = (k, bt, rho, gamma, A, L, delta) => {
  const kEff = Math.max(k, EPS);
  const taskAgg = Math.max(
    EPS,
    Math.pow(bt, 1 - rho) * Math.pow(kEff, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho),
  );
  const share = (Math.pow(bt, 1 - rho) * Math.pow(kEff, rho)) / taskAgg;
  const yOverK = getY(kEff, bt, rho, gamma, A, L) / kEff;
  return (gamma + (1 - gamma) * share) * yOverK - delta;
};

const getAiRent = (k, bt, rho, gamma, A, L, lambda) => {
  const yBeta = getY(k, bt, rho, gamma, A, L);
  const yNoAi = getY(k, 0, rho, gamma, A, L);
  return lambda * (yBeta - yNoAi);
};

const getPrivateReturn = (k, bt, rho, gamma, A, L, delta, lambda) => {
  const mpkGross = getPhysicalReturn(k, bt, rho, gamma, A, L, 0);
  const mpkNoAi = getPhysicalReturn(k, 0, rho, gamma, A, L, 0);
  return (1 - lambda) * mpkGross + lambda * mpkNoAi - delta;
};

const getMpl = (k, bt, rho, gamma, A, L) => {
  const kEff = Math.max(k, EPS);
  const taskAgg = Math.max(
    EPS,
    Math.pow(bt, 1 - rho) * Math.pow(kEff, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho),
  );
  const y = getY(kEff, bt, rho, gamma, A, L);
  return (1 - gamma) * (y / taskAgg) * Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho - 1);
};

const getMplPrivate = (k, bt, rho, gamma, A, L, lambda) => {
  const mplBeta = getMpl(k, bt, rho, gamma, A, L);
  const mplNoAi = getMpl(k, 0, rho, gamma, A, L);
  return (1 - lambda) * mplBeta + lambda * mplNoAi;
};

const solve2cMarketExact = (VVec, bt, delta, A, L, gamma, rho, w, tau, lambda) => {
  const tol = 1e-10;
  const V_A = Math.max(VVec[0], 0);
  const V_B = Math.max(VVec[1], 0);

  if (V_A + V_B <= tol) {
    return {
      K: [0, 0],
      P: [[0, 0], [0, 0]],
      autFlags: [true, true],
      regime: 0,
    };
  }

  const rAAut = getPrivateReturn(V_A, bt[0], rho, gamma, A[0], L[0], delta, lambda);
  const rBAut = getPrivateReturn(V_B, bt[1], rho, gamma, A[1], L[1], delta, lambda);

  const gapA = rAAut - (rBAut - w[1] - tau[0]);
  const gapB = rBAut - (rAAut - w[0] - tau[1]);

  if (gapA >= -tol && gapB >= -tol) {
    return {
      K: [V_A, V_B],
      P: [[V_A, 0], [0, V_B]],
      autFlags: [true, true],
      regime: 0,
    };
  }

  if (gapA < -tol && gapB >= -tol) {
    const f = (x) => (
      getPrivateReturn(V_A - x, bt[0], rho, gamma, A[0], L[0], delta, lambda)
      - (getPrivateReturn(V_B + x, bt[1], rho, gamma, A[1], L[1], delta, lambda) - w[1] - tau[0])
    );

    let x = 0;
    if (V_A > tol) {
      x = f(V_A) < 0 ? V_A : bisectRoot(f, 0, V_A, 1e-10, 200);
    }
    const K_A = V_A - x;
    const K_B = V_B + x;
    return {
      K: [K_A, K_B],
      P: [[K_A, x], [0, V_B]],
      autFlags: [
        Math.abs(K_A - V_A) < Math.max(1e-9, 0.005 * Math.max(V_A, 1)),
        Math.abs(K_B - V_B) < Math.max(1e-9, 0.005 * Math.max(V_B, 1)),
      ],
      regime: 1,
    };
  }

  if (gapB < -tol && gapA >= -tol) {
    const f = (x) => (
      getPrivateReturn(V_B - x, bt[1], rho, gamma, A[1], L[1], delta, lambda)
      - (getPrivateReturn(V_A + x, bt[0], rho, gamma, A[0], L[0], delta, lambda) - w[0] - tau[1])
    );

    let x = 0;
    if (V_B > tol) {
      x = f(V_B) < 0 ? V_B : bisectRoot(f, 0, V_B, 1e-10, 200);
    }
    const K_B = V_B - x;
    const K_A = V_A + x;
    return {
      K: [K_A, K_B],
      P: [[V_A, 0], [x, K_B]],
      autFlags: [
        Math.abs(K_A - V_A) < Math.max(1e-9, 0.005 * Math.max(V_A, 1)),
        Math.abs(K_B - V_B) < Math.max(1e-9, 0.005 * Math.max(V_B, 1)),
      ],
      regime: -1,
    };
  }

  if (gapA < gapB) {
    const f = (x) => (
      getPrivateReturn(V_A - x, bt[0], rho, gamma, A[0], L[0], delta, lambda)
      - (getPrivateReturn(V_B + x, bt[1], rho, gamma, A[1], L[1], delta, lambda) - w[1] - tau[0])
    );
    const x = V_A <= tol ? 0 : (f(V_A) < 0 ? V_A : bisectRoot(f, 0, V_A, 1e-10, 200));
    const K_A = V_A - x;
    const K_B = V_B + x;
    return {
      K: [K_A, K_B],
      P: [[K_A, x], [0, V_B]],
      autFlags: [
        Math.abs(K_A - V_A) < Math.max(1e-9, 0.005 * Math.max(V_A, 1)),
        Math.abs(K_B - V_B) < Math.max(1e-9, 0.005 * Math.max(V_B, 1)),
      ],
      regime: 1,
    };
  }

  const f = (x) => (
    getPrivateReturn(V_B - x, bt[1], rho, gamma, A[1], L[1], delta, lambda)
    - (getPrivateReturn(V_A + x, bt[0], rho, gamma, A[0], L[0], delta, lambda) - w[0] - tau[1])
  );
  const x = V_B <= tol ? 0 : (f(V_B) < 0 ? V_B : bisectRoot(f, 0, V_B, 1e-10, 200));
  const K_B = V_B - x;
  const K_A = V_A + x;
  return {
    K: [K_A, K_B],
    P: [[V_A, 0], [x, K_B]],
    autFlags: [
      Math.abs(K_A - V_A) < Math.max(1e-9, 0.005 * Math.max(V_A, 1)),
      Math.abs(K_B - V_B) < Math.max(1e-9, 0.005 * Math.max(V_B, 1)),
    ],
    regime: -1,
  };
};

const repairPortfolio = (PIn, VVec) => {
  const n = VVec.length;
  if (!PIn || !Array.isArray(PIn) || PIn.length !== n || PIn.some((row) => !Array.isArray(row) || row.length !== n)) {
    const P = zeroMatrix(n, n);
    for (let i = 0; i < n; i += 1) P[i][i] = VVec[i];
    return P;
  }

  const P = PIn.map((row) => row.map((value) => Math.max(Number.isFinite(value) ? value : 0, 0)));
  for (let i = 0; i < n; i += 1) {
    const rowSum = sum(P[i]);
    if (rowSum <= 1e-14) {
      P[i] = Array(n).fill(0);
      P[i][i] = VVec[i];
    } else {
      const scale = VVec[i] / rowSum;
      P[i] = P[i].map((value) => value * scale);
    }
  }
  return P;
};

const netReturn3c = (owner, loc, KLoc, bt, delta, A, L, gamma, rho, w, tau, lambda) => {
  let value = getPrivateReturn(KLoc, bt[loc], rho, gamma, A[loc], L[loc], delta, lambda);
  if (owner !== loc) value -= w[loc] + tau[owner];
  return value;
};

const solve3cMarketNumeric = (VVecInput, bt, delta, A, L, gamma, rho, w, tau, lambda, PInit = null) => {
  const tolMove = 1e-10;
  const tolSupport = 1e-8;
  const n = VVecInput.length;
  const VVec = VVecInput.map((value) => Math.max(value, 0));

  if (sum(VVec) <= tolMove) {
    return {
      K: Array(n).fill(0),
      P: zeroMatrix(n, n),
      autFlags: Array(n).fill(true),
      supportMask: zeroMatrix(n, n).map((row) => row.map(() => false)),
    };
  }

  let P = repairPortfolio(PInit, VVec);
  let K = colSums(P);

  for (let outer = 0; outer < MAX_MARKET_ITERS; outer += 1) {
    let bestGap = tolMove;
    let bestI = -1;
    let bestA = -1;
    let bestB = -1;

    for (let i = 0; i < n; i += 1) {
      for (let a = 0; a < n; a += 1) {
        if (P[i][a] <= tolMove) continue;
        const netA = netReturn3c(i, a, K[a], bt, delta, A, L, gamma, rho, w, tau, lambda);
        for (let b = 0; b < n; b += 1) {
          if (b === a) continue;
          const netB = netReturn3c(i, b, K[b], bt, delta, A, L, gamma, rho, w, tau, lambda);
          const gap = netB - netA;
          if (gap > bestGap) {
            bestGap = gap;
            bestI = i;
            bestA = a;
            bestB = b;
          }
        }
      }
    }

    if (bestI === -1) break;

    const maxMove = P[bestI][bestA];
    const f = (x) => (
      netReturn3c(bestI, bestB, K[bestB] + x, bt, delta, A, L, gamma, rho, w, tau, lambda)
      - netReturn3c(bestI, bestA, K[bestA] - x, bt, delta, A, L, gamma, rho, w, tau, lambda)
    );

    let xStar = 0;
    if (maxMove > tolMove) {
      xStar = f(maxMove) >= 0 ? maxMove : bisectRoot(f, 0, maxMove, 1e-12, 200);
    }
    if (xStar <= tolMove) break;

    P[bestI][bestA] -= xStar;
    P[bestI][bestB] += xStar;
    K[bestA] -= xStar;
    K[bestB] += xStar;
  }

  P = P.map((row) => row.map((value) => (Math.abs(value) < 1e-12 ? 0 : value)));
  K = colSums(P);
  const supportMask = P.map((row) => row.map((value) => value > tolSupport));
  const autFlags = Array.from({ length: n }, (_, c) => {
    const outflow = sum(P[c]) - P[c][c];
    const inflow = K[c] - P[c][c];
    const tolScale = Math.max(1e-9, 0.005 * Math.max(VVec[c], 1));
    return outflow < tolScale && inflow < tolScale;
  });

  return { K, P, autFlags, supportMask };
};

const noAi2cBaseline = ({
  timeLen, l, delta, phi, gamma, rho, rTarget,
  APathA, APathB, LVec, wVec, tauVec,
  kSsA, kSsB, sBaseVec,
}) => {
  const gNoAi = zeroSeries(2, timeLen);
  const gNoAiGlobal = Array(timeLen).fill(0);

  let P0 = [[kSsA * LVec[0], 0], [0, kSsB * LVec[1]]];
  const pipeA0 = Array(timeLen + l).fill(delta * P0[0][0]);
  const pipeB0 = Array(timeLen + l).fill(delta * P0[1][1]);

  let YPrev = null;
  let YGlobalPrev = 0;

  for (let i = 0; i < timeLen; i += 1) {
    const KCurrent = colSums(P0);
    const ACurrent = [APathA[i], APathB[i]];
    const YCurrent = [0, 0];
    const rCurrent = [0, 0];

    for (let k = 0; k < 2; k += 1) {
      YCurrent[k] = getY(KCurrent[k], 0, rho, gamma, ACurrent[k], LVec[k]);
      rCurrent[k] = getPrivateReturn(KCurrent[k], 0, rho, gamma, ACurrent[k], LVec[k], delta, 0);
    }

    if (i > 0 && YPrev) {
      gNoAi[0][i] = Math.log(clampMin(YCurrent[0])) - Math.log(clampMin(YPrev[0]));
      gNoAi[1][i] = Math.log(clampMin(YCurrent[1])) - Math.log(clampMin(YPrev[1]));
      gNoAiGlobal[i] = Math.log(clampMin(sum(YCurrent))) - Math.log(clampMin(YGlobalPrev));
    }

    if (i < timeLen - 1) {
      const laborInc = YCurrent.map((value, idx) => value - (rCurrent[idx] + delta) * KCurrent[idx]);
      const capInc = [
        P0[0][0] * rCurrent[0] + P0[0][1] * (rCurrent[1] - wVec[1] - tauVec[0]),
        P0[1][1] * rCurrent[1] + P0[1][0] * (rCurrent[0] - wVec[0] - tauVec[1]),
      ];
      const govSource = [P0[1][0] * wVec[0], P0[0][1] * wVec[1]];
      const govResid = [P0[0][1] * tauVec[0], P0[1][0] * tauVec[1]];
      const GNI0 = [
        laborInc[0] + capInc[0] + govSource[0] + govResid[0],
        laborInc[1] + capInc[1] + govSource[1] + govResid[1],
      ];

      const idxFuture = Math.min(timeLen - 1, i + l);
      const AFuture = [APathA[idxFuture], APathB[idxFuture]];

      let pipeSurviveA = 0;
      let pipeSurviveB = 0;
      if (l > 1) {
        for (let tauLag = 1; tauLag < l; tauLag += 1) {
          pipeSurviveA += pipeA0[i + tauLag] * Math.pow(1 - delta, l - tauLag);
          pipeSurviveB += pipeB0[i + tauLag] * Math.pow(1 - delta, l - tauLag);
        }
      }

      const VFixed = [
        sum(P0[0]) * Math.pow(1 - delta, l) + pipeSurviveA,
        sum(P0[1]) * Math.pow(1 - delta, l) + pipeSurviveB,
      ];

      let sGuess = [...sBaseVec];
      for (let iter = 0; iter < MAX_SAVINGS_ITERS; iter += 1) {
        const VProj = VFixed.map((value, idx) => Math.max(value + sGuess[idx] * GNI0[idx], EPS));
        const future = solve2cMarketExact(VProj, [0, 0], delta, AFuture, LVec, gamma, rho, wVec, tauVec, 0);
        const rrFA = getPrivateReturn(future.K[0], 0, rho, gamma, AFuture[0], LVec[0], delta, 0);
        const rrFB = getPrivateReturn(future.K[1], 0, rho, gamma, AFuture[1], LVec[1], delta, 0);
        const yieldA = (future.P[0][0] * rrFA + future.P[0][1] * (rrFB - wVec[1] - tauVec[0])) / Math.max(VProj[0], EPS);
        const yieldB = (future.P[1][1] * rrFB + future.P[1][0] * (rrFA - wVec[0] - tauVec[1])) / Math.max(VProj[1], EPS);
        const sNew = [
          sBaseVec[0] + phi * (yieldA - rTarget),
          sBaseVec[1] + phi * (yieldB - rTarget),
        ];
        if (Math.max(Math.abs(sNew[0] - sGuess[0]), Math.abs(sNew[1] - sGuess[1])) < 1e-6) {
          sGuess = sNew;
          break;
        }
        sGuess = sNew;
      }

      pipeA0[i + l] = sGuess[0] * GNI0[0];
      pipeB0[i + l] = sGuess[1] * GNI0[1];

      P0 = P0.map((row) => row.map((value) => value * (1 - delta)));
      P0[0][0] += pipeA0[i + 1];
      P0[1][1] += pipeB0[i + 1];

      const VNew = rowSums(P0).map((value) => Math.max(value, 0));
      P0 = solve2cMarketExact(VNew, [0, 0], delta, [APathA[i + 1], APathB[i + 1]], LVec, gamma, rho, wVec, tauVec, 0).P;
    }

    YPrev = [...YCurrent];
    YGlobalPrev = sum(YCurrent);
  }

  return { gNoAi, gNoAiGlobal };
};

export const simulateAIRents2C = (params) => {
  const {
    periods, l, target_y_ratio_A, L_ratio_A,
    w1, w2, tau1, tau2,
    g1, g2,
    theta, lambda,
  } = params;

  const gamma = 0.33;
  const sigma = 0.4;
  const rho = (sigma - 1) / sigma;
  const delta = 0.05;
  const phi = 0.25;
  const rTarget = 0.04;
  const bStart = 0.0001;
  const A0B = 1.0;
  const tidalMax = 0.25;
  const tidalLagB = 6;
  const tidalMidpoint = 10;
  const tidalSteepness = 0.32;
  const gulfMax = 0.65;
  const gulfLeakageB = 0.9;

  const displayPeriods = Math.max(5, Math.floor(periods));
  const horizon = Math.max(displayPeriods + l + 6, 36);
  const timeLen = horizon + 1;
  const timeAxis = range(timeLen);

  const L_A = L_ratio_A;
  const L_B = L_A / 2;
  const LVec = [L_A, L_B];
  const wVec = [w1, w2];
  const tauVec = [tau1, tau2];

  const kSsB = bisectRoot((k) => getPrivateReturn(k, bStart, rho, gamma, A0B, 1, delta, lambda) - rTarget, 0.01, 1000);
  const yBss = getY(kSsB, bStart, rho, gamma, A0B, 1);
  const yTargetA = yBss * target_y_ratio_A;

  const A0A = bisectRoot((aGuess) => {
    const kLocal = bisectRoot((k) => getPrivateReturn(k, bStart, rho, gamma, aGuess, 1, delta, lambda) - rTarget, 0.01, 2000);
    return getY(kLocal, bStart, rho, gamma, aGuess, 1) - yTargetA;
  }, 0.1, 10);

  const kSsA = bisectRoot((k) => getPrivateReturn(k, bStart, rho, gamma, A0A, 1, delta, lambda) - rTarget, 0.01, 2000);
  const yAss = getY(kSsA, bStart, rho, gamma, A0A, 1);
  const sBaseVec = [
    (delta * kSsA) / Math.max(yAss, EPS),
    (delta * kSsB) / Math.max(yBss, EPS),
  ];

  const APathA = timeAxis.map((t) => A0A * Math.pow(1 + g1, t));
  const APathB = timeAxis.map((t) => A0B * Math.pow(1 + g2, t));

  const beta0 = bStart;
  const flowMaxA = tidalMax + theta * (gulfMax - tidalMax);
  const flowLagB = tidalLagB;
  const flowMid = tidalMidpoint;
  const flowSteep = tidalSteepness;
  const flowLeakB = theta * gulfLeakageB;

  const logisticA0 = 1 / (1 + Math.exp(-flowSteep * (0 - flowMid)));
  const betaA = timeAxis.map((t) => {
    const logisticRaw = 1 / (1 + Math.exp(-flowSteep * (t - flowMid)));
    const logistic = (logisticRaw - logisticA0) / (1 - logisticA0);
    return beta0 + (flowMaxA - beta0) * logistic;
  });

  const logisticB0 = 1 / (1 + Math.exp(-flowSteep * ((0 - flowLagB) - flowMid)));
  const betaB = timeAxis.map((t) => {
    const logisticRaw = 1 / (1 + Math.exp(-flowSteep * ((t - flowLagB) - flowMid)));
    const logistic = (logisticRaw - logisticB0) / (1 - logisticB0);
    const betaBRaw = beta0 + (flowMaxA - beta0) * logistic;
    return beta0 + (1 - flowLeakB) * (betaBRaw - beta0);
  });

  const { gNoAi } = noAi2cBaseline({
    timeLen,
    l,
    delta,
    phi,
    gamma,
    rho,
    rTarget,
    APathA,
    APathB,
    LVec,
    wVec,
    tauVec,
    kSsA,
    kSsB,
    sBaseVec,
  });

  const n = 2;
  const GNIPartsAll = Array.from({ length: n }, () => Array.from({ length: timeLen }, () => ({ labor: 0, dom_cap: 0, for_cap: 0, gov: 0 })));
  const regimeAll = Array(timeLen).fill(0);
  const gV = zeroSeries(n, timeLen);
  const rgV = zeroSeries(n, timeLen);
  const mplV = zeroSeries(n, timeLen);
  const mplPrivV = zeroSeries(n, timeLen);
  const laborShareYV = zeroSeries(n, timeLen);
  const capitalShareYV = zeroSeries(n, timeLen);
  const aiShareYV = zeroSeries(n, timeLen);
  const VV = zeroSeries(n, timeLen);
  const KV = zeroSeries(n, timeLen);
  const YV = zeroSeries(n, timeLen);
  const YNetV = zeroSeries(n, timeLen);
  const aiRentV = zeroSeries(n, timeLen);
  const rPrivV = zeroSeries(n, timeLen);
  const GNIV = zeroSeries(n, timeLen);
  const aiRevGlobalPctGniV = Array(timeLen).fill(0);
  const rentierIdxV = zeroSeries(n, timeLen);
  const foreignInc = zeroSeries(n, timeLen);
  const offshoreRatioV = zeroSeries(n, timeLen);
  const starveGapV = Array(timeLen).fill(0);
  const pureAutarky = Array(timeLen).fill(false);

  let P = [[kSsA * L_A, 0], [0, kSsB * L_B]];
  const pipeA = Array(timeLen + l).fill(delta * P[0][0]);
  const pipeB = Array(timeLen + l).fill(delta * P[1][1]);
  let lastSavingsGuess = [...sBaseVec];

  const bAExt = extendWithTail(betaA, l + 4);
  const bBExt = extendWithTail(betaB, l + 4);

  for (let i = 0; i < timeLen; i += 1) {
    const KCurrent = colSums(P);
    const VCurrent = rowSums(P);
    KV[0][i] = KCurrent[0]; KV[1][i] = KCurrent[1];
    VV[0][i] = VCurrent[0]; VV[1][i] = VCurrent[1];

    const bCurrent = [bAExt[i], bBExt[i]];
    const maxBeta = Math.max(...bCurrent);
    const ACurrent = [APathA[i], APathB[i]];

    offshoreRatioV[0][i] = P[0][1] / Math.max(VCurrent[0], EPS);
    offshoreRatioV[1][i] = P[1][0] / Math.max(VCurrent[1], EPS);

    for (let k = 0; k < n; k += 1) {
      YV[k][i] = getY(KCurrent[k], bCurrent[k], rho, gamma, ACurrent[k], LVec[k]);
      aiRentV[k][i] = getAiRent(KCurrent[k], bCurrent[k], rho, gamma, ACurrent[k], LVec[k], lambda);
      YNetV[k][i] = YV[k][i] - aiRentV[k][i];
      rPrivV[k][i] = getPrivateReturn(KCurrent[k], bCurrent[k], rho, gamma, ACurrent[k], LVec[k], delta, lambda);
      mplV[k][i] = getMpl(KCurrent[k], bCurrent[k], rho, gamma, ACurrent[k], LVec[k]);
      mplPrivV[k][i] = getMplPrivate(KCurrent[k], bCurrent[k], rho, gamma, ACurrent[k], LVec[k], lambda);
      laborShareYV[k][i] = (mplPrivV[k][i] * LVec[k]) / Math.max(YV[k][i], EPS);
      capitalShareYV[k][i] = ((rPrivV[k][i] + delta) * KCurrent[k]) / Math.max(YV[k][i], EPS);
      aiShareYV[k][i] = aiRentV[k][i] / Math.max(YV[k][i], EPS);
    }

    const pAB = P[0][1];
    const pBA = P[1][0];
    const tolAut = 1e-10;
    const isAB = Math.abs(pAB) > tolAut;
    const isBA = Math.abs(pBA) > tolAut;
    pureAutarky[i] = !isAB && !isBA;
    regimeAll[i] = pureAutarky[i] ? 0 : (isAB && !isBA ? 1 : (!isAB && isBA ? -1 : (Math.abs(pAB) >= Math.abs(pBA) ? 1 : -1)));

    const shadow = solve2cMarketExact(VCurrent, [maxBeta, maxBeta], delta, ACurrent, LVec, gamma, rho, wVec, tauVec, lambda);
    starveGapV[i] = (shadow.K[1] - KCurrent[1]) / Math.max(shadow.K[1], EPS);

    const govSource = [P[1][0] * wVec[0], P[0][1] * wVec[1]];
    const govResid = [P[0][1] * tauVec[0], P[1][0] * tauVec[1]];
    const govTotal = [govSource[0] + govResid[0], govSource[1] + govResid[1]];

    const laborInc = [
      YNetV[0][i] - (rPrivV[0][i] + delta) * KCurrent[0],
      YNetV[1][i] - (rPrivV[1][i] + delta) * KCurrent[1],
    ];
    const capInc = [
      P[0][0] * rPrivV[0][i] + P[0][1] * (rPrivV[1][i] - wVec[1] - tauVec[0]),
      P[1][1] * rPrivV[1][i] + P[1][0] * (rPrivV[0][i] - wVec[0] - tauVec[1]),
    ];

    GNIV[0][i] = laborInc[0] + capInc[0] + govTotal[0];
    GNIV[1][i] = laborInc[1] + capInc[1] + govTotal[1];
    aiRevGlobalPctGniV[i] = 100 * sum([aiRentV[0][i], aiRentV[1][i]]) / Math.max(Math.abs(GNIV[0][i] + GNIV[1][i]), EPS);

    foreignInc[0][i] = P[0][1] * (rPrivV[1][i] - wVec[1] - tauVec[0]);
    foreignInc[1][i] = P[1][0] * (rPrivV[0][i] - wVec[0] - tauVec[1]);
    rentierIdxV[0][i] = foreignInc[0][i] / Math.max(Math.abs(GNIV[0][i]), EPS);
    rentierIdxV[1][i] = foreignInc[1][i] / Math.max(Math.abs(GNIV[1][i]), EPS);

    GNIPartsAll[0][i] = {
      labor: laborInc[0] / L_A,
      dom_cap: (P[0][0] * rPrivV[0][i]) / L_A,
      for_cap: (P[0][1] * (rPrivV[1][i] - wVec[1] - tauVec[0])) / L_A,
      gov: govTotal[0] / L_A,
    };
    GNIPartsAll[1][i] = {
      labor: laborInc[1] / L_B,
      dom_cap: (P[1][1] * rPrivV[1][i]) / L_B,
      for_cap: (P[1][0] * (rPrivV[0][i] - wVec[0] - tauVec[1])) / L_B,
      gov: govTotal[1] / L_B,
    };

    if (i > 0) {
      gV[0][i] = Math.log(clampMin(YV[0][i])) - Math.log(clampMin(YV[0][i - 1]));
      gV[1][i] = Math.log(clampMin(YV[1][i])) - Math.log(clampMin(YV[1][i - 1]));
    }
    rgV[0][i] = rPrivV[0][i] - gV[0][i];
    rgV[1][i] = rPrivV[1][i] - gV[1][i];

    if (i < timeLen - 1) {
      const idxFuture = Math.min(timeLen - 1, i + l);
      const bFuture = [bAExt[idxFuture], bBExt[idxFuture]];
      const AFuture = [APathA[idxFuture], APathB[idxFuture]];

      let pipeSurviveA = 0;
      let pipeSurviveB = 0;
      if (l > 1) {
        for (let tauLag = 1; tauLag < l; tauLag += 1) {
          pipeSurviveA += pipeA[i + tauLag] * Math.pow(1 - delta, l - tauLag);
          pipeSurviveB += pipeB[i + tauLag] * Math.pow(1 - delta, l - tauLag);
        }
      }

      const VFixed = [
        sum(P[0]) * Math.pow(1 - delta, l) + pipeSurviveA,
        sum(P[1]) * Math.pow(1 - delta, l) + pipeSurviveB,
      ];

      let sGuess = [...sBaseVec];
      for (let iter = 0; iter < MAX_SAVINGS_ITERS; iter += 1) {
        const VProj = VFixed.map((value, idx) => Math.max(value + sGuess[idx] * GNIV[idx][i], EPS));
        const future = solve2cMarketExact(VProj, bFuture, delta, AFuture, LVec, gamma, rho, wVec, tauVec, lambda);
        const rrFA = getPrivateReturn(future.K[0], bFuture[0], rho, gamma, AFuture[0], LVec[0], delta, lambda);
        const rrFB = getPrivateReturn(future.K[1], bFuture[1], rho, gamma, AFuture[1], LVec[1], delta, lambda);
        const yieldA = (future.P[0][0] * rrFA + future.P[0][1] * (rrFB - wVec[1] - tauVec[0])) / Math.max(VProj[0], EPS);
        const yieldB = (future.P[1][1] * rrFB + future.P[1][0] * (rrFA - wVec[0] - tauVec[1])) / Math.max(VProj[1], EPS);
        const sNew = [
          sBaseVec[0] + phi * (yieldA - rTarget),
          sBaseVec[1] + phi * (yieldB - rTarget),
        ];
        if (Math.max(Math.abs(sNew[0] - sGuess[0]), Math.abs(sNew[1] - sGuess[1])) < 1e-6) {
          sGuess = sNew;
          break;
        }
        sGuess = sNew;
      }

      lastSavingsGuess = [...sGuess];
      pipeA[i + l] = sGuess[0] * GNIV[0][i];
      pipeB[i + l] = sGuess[1] * GNIV[1][i];

      P = P.map((row) => row.map((value) => value * (1 - delta)));
      P[0][0] += pipeA[i + 1];
      P[1][1] += pipeB[i + 1];

      const VNew = rowSums(P).map((value) => Math.max(value, 0));
      P = solve2cMarketExact(VNew, [bAExt[i + 1], bBExt[i + 1]], delta, [APathA[i + 1], APathB[i + 1]], LVec, gamma, rho, wVec, tauVec, lambda).P;
    }
  }

  const yearsSpan = Math.max(1, displayPeriods - 1);
  const history = range(displayPeriods).map((t) => {
    const totalWealthPc = (VV[0][t] / L_A) + (VV[1][t] / L_B);
    return {
      t,
      isAutarky: pureAutarky[t],
      beta1: bAExt[t],
      beta2: bBExt[t],
      y1: 100 * safeDiv(YV[0][t], YV[0][0], 1),
      y2: 100 * safeDiv(YV[1][t], YV[1][0], 1),
      r1: rPrivV[0][t] * 100,
      r2: rPrivV[1][t] * 100,
      aiGlobal: aiRevGlobalPctGniV[t],
      sh1: 100 * safeDiv(VV[0][t] / L_A, totalWealthPc, 0),
      sh2: 100 * safeDiv(VV[1][t] / L_B, totalWealthPc, 0),
      outLab1: laborShareYV[0][t],
      outLab2: laborShareYV[1][t],
      outCap1: capitalShareYV[0][t],
      outCap2: capitalShareYV[1][t],
      outAi1: aiShareYV[0][t],
      outAi2: aiShareYV[1][t],
      sg2: starveGapV[t] * 100,
      gni1: 100 * safeDiv(GNIV[0][t], GNIV[0][0], 1),
      gni2: 100 * safeDiv(GNIV[1][t], GNIV[1][0], 1),
      rent1: rentierIdxV[0][t] * 100,
      rent2: rentierIdxV[1][t] * 100,
      rg1: rgV[0][t] * 100,
      rg2: rgV[1][t] * 100,
      off1: offshoreRatioV[0][t] * 100,
      off2: offshoreRatioV[1][t] * 100,
      mpl1: mplV[0][t],
      mpl2: mplV[1][t],
      mplp1: mplPrivV[0][t],
      mplp2: mplPrivV[1][t],
      g1: gV[0][t] * 100,
      g2: gV[1][t] * 100,
      g1NoAI: gNoAi[0][t] * 100,
      g2NoAI: gNoAi[1][t] * 100,
      gni_parts: [GNIPartsAll[0][t], GNIPartsAll[1][t]],
      rawY: [YV[0][t], YV[1][t]],
      regime: regimeAll[t],
    };
  });

  const annualizedGrowth = [
    { label: 'Leader', value: annualizedRate(YV[0][0], YV[0][displayPeriods - 1], yearsSpan) },
    { label: 'Follower', value: annualizedRate(YV[1][0], YV[1][displayPeriods - 1], yearsSpan) },
  ];

  return {
    history,
    annualizedGrowth,
    yearsSpan,
    meta: {
      mode: '2C',
      theta,
      lambda,
      growth: [g1, g2],
      countries: ['Leader', 'Follower'],
      lastSavingsGuess,
    },
  };
};

const noAi3cBaseline = ({
  timeLen, l, delta, phi, gamma, rho, rTarget,
  APaths, LVec, wVec, tauVec,
  KInit, sBaseVec,
}) => {
  const n = 3;
  const gNoAi = zeroSeries(n, timeLen);
  const gNoAiGlobal = Array(timeLen).fill(0);

  let P0 = [[KInit[0], 0, 0], [0, KInit[1], 0], [0, 0, KInit[2]]];
  const pipe0 = Array.from({ length: n }, (_, idx) => Array(timeLen + l).fill(delta * KInit[idx]));
  let P0GuessNext = cloneMatrix(P0);
  let YPrev = null;
  let YGlobalPrev = 0;

  for (let i = 0; i < timeLen; i += 1) {
    const KCurrent = colSums(P0);
    const VCurrent = rowSums(P0);
    const ACurrent = [APaths[0][i], APaths[1][i], APaths[2][i]];
    const YCurrent = [0, 0, 0];
    const rCurrent = [0, 0, 0];

    for (let k = 0; k < n; k += 1) {
      YCurrent[k] = getY(KCurrent[k], 0, rho, gamma, ACurrent[k], LVec[k]);
      rCurrent[k] = getPrivateReturn(KCurrent[k], 0, rho, gamma, ACurrent[k], LVec[k], delta, 0);
    }

    if (i > 0 && YPrev) {
      for (let k = 0; k < n; k += 1) {
        gNoAi[k][i] = Math.log(clampMin(YCurrent[k])) - Math.log(clampMin(YPrev[k]));
      }
      gNoAiGlobal[i] = Math.log(clampMin(sum(YCurrent))) - Math.log(clampMin(YGlobalPrev));
    }

    if (i < timeLen - 1) {
      const laborInc = YCurrent.map((value, idx) => value - (rCurrent[idx] + delta) * KCurrent[idx]);
      const capInc = Array(n).fill(0);
      for (let owner = 0; owner < n; owner += 1) {
        for (let loc = 0; loc < n; loc += 1) {
          const ret = owner === loc ? rCurrent[loc] : (rCurrent[loc] - wVec[loc] - tauVec[owner]);
          capInc[owner] += P0[owner][loc] * ret;
        }
      }

      const source = Array(n).fill(0);
      const resid = Array(n).fill(0);
      const KByLoc = colSums(P0);
      for (let loc = 0; loc < n; loc += 1) {
        source[loc] = wVec[loc] * (KByLoc[loc] - P0[loc][loc]);
      }
      for (let owner = 0; owner < n; owner += 1) {
        resid[owner] = tauVec[owner] * (sum(P0[owner]) - P0[owner][owner]);
      }
      const GNI0 = Array.from({ length: n }, (_, idx) => laborInc[idx] + capInc[idx] + source[idx] + resid[idx]);

      const idxFuture = Math.min(timeLen - 1, i + l);
      const AFuture = [APaths[0][idxFuture], APaths[1][idxFuture], APaths[2][idxFuture]];

      const pipeSurvive = Array(n).fill(0);
      if (l > 1) {
        for (let c = 0; c < n; c += 1) {
          for (let tauLag = 1; tauLag < l; tauLag += 1) {
            pipeSurvive[c] += pipe0[c][i + tauLag] * Math.pow(1 - delta, l - tauLag);
          }
        }
      }
      const VFixed = VCurrent.map((value, idx) => value * Math.pow(1 - delta, l) + pipeSurvive[idx]);

      let sGuess = [...sBaseVec];
      let P0GuessF = cloneMatrix(P0);
      for (let iter = 0; iter < MAX_SAVINGS_ITERS; iter += 1) {
        const VProj = VFixed.map((value, idx) => Math.max(value + sGuess[idx] * GNI0[idx], EPS));
        const future = solve3cMarketNumeric(VProj, [0, 0, 0], delta, AFuture, LVec, gamma, rho, wVec, tauVec, 0, P0GuessF);
        P0GuessF = cloneMatrix(future.P);

        const rrF = Array.from({ length: n }, (_, k) => getPrivateReturn(future.K[k], 0, rho, gamma, AFuture[k], LVec[k], delta, 0));
        const rYield = Array(n).fill(0);
        for (let owner = 0; owner < n; owner += 1) {
          let total = 0;
          for (let loc = 0; loc < n; loc += 1) {
            const ret = owner === loc ? rrF[loc] : (rrF[loc] - wVec[loc] - tauVec[owner]);
            total += future.P[owner][loc] * ret;
          }
          rYield[owner] = total / Math.max(VProj[owner], EPS);
        }

        const sNew = Array.from({ length: n }, (_, idx) => sBaseVec[idx] + phi * (rYield[idx] - rTarget));
        const diff = Math.max(...sNew.map((value, idx) => Math.abs(value - sGuess[idx])));
        sGuess = sNew;
        if (diff < 1e-6) break;
      }

      for (let c = 0; c < n; c += 1) {
        pipe0[c][i + l] = sGuess[c] * GNI0[c];
      }

      P0 = P0.map((row) => row.map((value) => value * (1 - delta)));
      for (let c = 0; c < n; c += 1) {
        P0[c][c] += pipe0[c][i + 1];
      }

      const VNew = rowSums(P0).map((value) => Math.max(value, 0));
      const next = solve3cMarketNumeric(VNew, [0, 0, 0], delta, [APaths[0][i + 1], APaths[1][i + 1], APaths[2][i + 1]], LVec, gamma, rho, wVec, tauVec, 0, P0GuessNext);
      P0 = cloneMatrix(next.P);
      P0GuessNext = cloneMatrix(next.P);
    }

    YPrev = [...YCurrent];
    YGlobalPrev = sum(YCurrent);
  }

  return { gNoAi, gNoAiGlobal };
};

export const simulateAIRents3C = (params) => {
  const {
    periods, l,
    target_y_ratio_A, target_y_ratio_B,
    L_ratio_A, L_ratio_B,
    w1, w2, w3,
    tau1, tau2, tau3,
    g1, g2, g3,
    theta, lambda,
  } = params;

  const gamma = 0.33;
  const sigma = 0.4;
  const rho = (sigma - 1) / sigma;
  const delta = 0.05;
  const phi = 0.25;
  const rTarget = 0.04;
  const bStart = 0.0001;
  const A0C = 1.0;
  const tidalMax = 0.25;
  const tidalLagB = 6;
  const tidalLagC = 12;
  const tidalMidpoint = 10;
  const tidalSteepness = 0.32;
  const gulfMax = 0.65;
  const gulfLeakageB = 0.9;
  const gulfLeakageC = 0.9;

  const displayPeriods = Math.max(5, Math.floor(periods));
  const horizon = Math.max(displayPeriods + l + 6, 36);
  const timeLen = horizon + 1;
  const timeAxis = range(timeLen);

  const L_A = L_ratio_A;
  const L_B = L_ratio_B;
  const L_C = 1.0;
  const LVec = [L_A, L_B, L_C];
  const wVec = [w1, w2, w3];
  const tauVec = [tau1, tau2, tau3];

  const kSsC = bisectRoot((k) => getPrivateReturn(k, bStart, rho, gamma, A0C, 1, delta, lambda) - rTarget, 0.01, 1000);
  const yCss = getY(kSsC, bStart, rho, gamma, A0C, 1);
  const yTargetA = yCss * target_y_ratio_A;
  const yTargetB = yCss * target_y_ratio_B;

  const solveA0 = (yTarget) => bisectRoot((aGuess) => {
    const kLocal = bisectRoot((k) => getPrivateReturn(k, bStart, rho, gamma, aGuess, 1, delta, lambda) - rTarget, 0.01, 2000);
    return getY(kLocal, bStart, rho, gamma, aGuess, 1) - yTarget;
  }, 0.1, 10);

  const A0A = solveA0(yTargetA);
  const A0B = solveA0(yTargetB);

  const kSsA = bisectRoot((k) => getPrivateReturn(k, bStart, rho, gamma, A0A, 1, delta, lambda) - rTarget, 0.01, 2000);
  const kSsB = bisectRoot((k) => getPrivateReturn(k, bStart, rho, gamma, A0B, 1, delta, lambda) - rTarget, 0.01, 2000);

  const yAss = getY(kSsA, bStart, rho, gamma, A0A, 1);
  const yBss = getY(kSsB, bStart, rho, gamma, A0B, 1);
  const sBaseVec = [
    (delta * kSsA) / Math.max(yAss, EPS),
    (delta * kSsB) / Math.max(yBss, EPS),
    (delta * kSsC) / Math.max(yCss, EPS),
  ];

  const APaths = [
    timeAxis.map((t) => A0A * Math.pow(1 + g1, t)),
    timeAxis.map((t) => A0B * Math.pow(1 + g2, t)),
    timeAxis.map((t) => A0C * Math.pow(1 + g3, t)),
  ];

  const beta0 = bStart;
  const flowMaxA = tidalMax + theta * (gulfMax - tidalMax);
  const flowLeakB = theta * gulfLeakageB;
  const flowLeakC = theta * gulfLeakageC;
  const logisticBaseA = 1 / (1 + Math.exp(-tidalSteepness * (0 - tidalMidpoint)));
  const logisticBaseB = 1 / (1 + Math.exp(-tidalSteepness * ((0 - tidalLagB) - tidalMidpoint)));
  const logisticBaseC = 1 / (1 + Math.exp(-tidalSteepness * ((0 - tidalLagC) - tidalMidpoint)));

  const betaA = timeAxis.map((t) => {
    const raw = 1 / (1 + Math.exp(-tidalSteepness * (t - tidalMidpoint)));
    const logistic = (raw - logisticBaseA) / (1 - logisticBaseA);
    return beta0 + (flowMaxA - beta0) * logistic;
  });
  const betaB = timeAxis.map((t) => {
    const raw = 1 / (1 + Math.exp(-tidalSteepness * ((t - tidalLagB) - tidalMidpoint)));
    const logistic = (raw - logisticBaseB) / (1 - logisticBaseB);
    const betaRaw = beta0 + (flowMaxA - beta0) * logistic;
    return beta0 + (1 - flowLeakB) * (betaRaw - beta0);
  });
  const betaC = timeAxis.map((t) => {
    const raw = 1 / (1 + Math.exp(-tidalSteepness * ((t - tidalLagC) - tidalMidpoint)));
    const logistic = (raw - logisticBaseC) / (1 - logisticBaseC);
    const betaRaw = beta0 + (flowMaxA - beta0) * logistic;
    return beta0 + (1 - flowLeakC) * (betaRaw - beta0);
  });

  const { gNoAi } = noAi3cBaseline({
    timeLen,
    l,
    delta,
    phi,
    gamma,
    rho,
    rTarget,
    APaths,
    LVec,
    wVec,
    tauVec,
    KInit: [kSsA * L_A, kSsB * L_B, kSsC * L_C],
    sBaseVec,
  });

  const n = 3;
  const GNIPartsAll = Array.from({ length: n }, () => Array.from({ length: timeLen }, () => ({ labor: 0, dom_cap: 0, for_cap: 0, gov: 0 })));
  const gV = zeroSeries(n, timeLen);
  const rgV = zeroSeries(n, timeLen);
  const mplV = zeroSeries(n, timeLen);
  const mplPrivV = zeroSeries(n, timeLen);
  const laborShareYV = zeroSeries(n, timeLen);
  const capitalShareYV = zeroSeries(n, timeLen);
  const aiShareYV = zeroSeries(n, timeLen);
  const VV = zeroSeries(n, timeLen);
  const KV = zeroSeries(n, timeLen);
  const YV = zeroSeries(n, timeLen);
  const YNetV = zeroSeries(n, timeLen);
  const aiRentV = zeroSeries(n, timeLen);
  const rPrivV = zeroSeries(n, timeLen);
  const GNIV = zeroSeries(n, timeLen);
  const aiRevGlobalPctGniV = Array(timeLen).fill(0);
  const rentierIdxV = zeroSeries(n, timeLen);
  const foreignInc = zeroSeries(n, timeLen);
  const offshoreRatioV = zeroSeries(n, timeLen);
  const starveGapV = zeroSeries(n, timeLen);
  const pureAutarky = Array(timeLen).fill(false);

  let P = [
    [kSsA * L_A, 0, 0],
    [0, kSsB * L_B, 0],
    [0, 0, kSsC * L_C],
  ];
  const pipe = Array.from({ length: n }, (_, idx) => Array(timeLen + l).fill(delta * P[idx][idx]));
  let PGuessFrontier = cloneMatrix(P);
  let PGuessNext = cloneMatrix(P);
  let lastSavingsGuess = [...sBaseVec];

  const betaExt = [extendWithTail(betaA, l + 4), extendWithTail(betaB, l + 4), extendWithTail(betaC, l + 4)];

  for (let i = 0; i < timeLen; i += 1) {
    const KCurrent = colSums(P);
    const VCurrent = rowSums(P);
    for (let c = 0; c < n; c += 1) {
      KV[c][i] = KCurrent[c];
      VV[c][i] = VCurrent[c];
      offshoreRatioV[c][i] = (sum(P[c]) - P[c][c]) / Math.max(VCurrent[c], EPS);
    }

    const bCurrent = [betaExt[0][i], betaExt[1][i], betaExt[2][i]];
    const maxBeta = Math.max(...bCurrent);
    const frontierBeta = [maxBeta, maxBeta, maxBeta];
    const ACurrent = [APaths[0][i], APaths[1][i], APaths[2][i]];

    for (let k = 0; k < n; k += 1) {
      YV[k][i] = getY(KCurrent[k], bCurrent[k], rho, gamma, ACurrent[k], LVec[k]);
      aiRentV[k][i] = getAiRent(KCurrent[k], bCurrent[k], rho, gamma, ACurrent[k], LVec[k], lambda);
      YNetV[k][i] = YV[k][i] - aiRentV[k][i];
      rPrivV[k][i] = getPrivateReturn(KCurrent[k], bCurrent[k], rho, gamma, ACurrent[k], LVec[k], delta, lambda);
      mplV[k][i] = getMpl(KCurrent[k], bCurrent[k], rho, gamma, ACurrent[k], LVec[k]);
      mplPrivV[k][i] = getMplPrivate(KCurrent[k], bCurrent[k], rho, gamma, ACurrent[k], LVec[k], lambda);
      laborShareYV[k][i] = (mplPrivV[k][i] * LVec[k]) / Math.max(YV[k][i], EPS);
      capitalShareYV[k][i] = ((rPrivV[k][i] + delta) * KCurrent[k]) / Math.max(YV[k][i], EPS);
      aiShareYV[k][i] = aiRentV[k][i] / Math.max(YV[k][i], EPS);
    }

    pureAutarky[i] = true;
    for (let owner = 0; owner < n; owner += 1) {
      for (let loc = 0; loc < n; loc += 1) {
        if (owner !== loc && Math.abs(P[owner][loc]) > 1e-8) {
          pureAutarky[i] = false;
        }
      }
    }

    const shadow = solve3cMarketNumeric(VCurrent, frontierBeta, delta, ACurrent, LVec, gamma, rho, wVec, tauVec, lambda, PGuessFrontier);
    PGuessFrontier = cloneMatrix(shadow.P);
    for (let c = 0; c < n; c += 1) {
      starveGapV[c][i] = (shadow.K[c] - KCurrent[c]) / Math.max(shadow.K[c], EPS);
    }

    const laborInc = Array(n).fill(0);
    const capInc = Array(n).fill(0);
    const source = Array(n).fill(0);
    const resid = Array(n).fill(0);

    for (let loc = 0; loc < n; loc += 1) {
      laborInc[loc] = YNetV[loc][i] - (rPrivV[loc][i] + delta) * KCurrent[loc];
      source[loc] = wVec[loc] * (KCurrent[loc] - P[loc][loc]);
    }
    for (let owner = 0; owner < n; owner += 1) {
      resid[owner] = tauVec[owner] * (sum(P[owner]) - P[owner][owner]);
      for (let loc = 0; loc < n; loc += 1) {
        const ret = owner === loc ? rPrivV[loc][i] : (rPrivV[loc][i] - wVec[loc] - tauVec[owner]);
        capInc[owner] += P[owner][loc] * ret;
      }
      GNIV[owner][i] = laborInc[owner] + capInc[owner] + source[owner] + resid[owner];
    }

    aiRevGlobalPctGniV[i] = 100 * sum([aiRentV[0][i], aiRentV[1][i], aiRentV[2][i]]) / Math.max(Math.abs(sum([GNIV[0][i], GNIV[1][i], GNIV[2][i]])), EPS);

    for (let owner = 0; owner < n; owner += 1) {
      let foreignTotal = 0;
      for (let loc = 0; loc < n; loc += 1) {
        if (owner === loc) continue;
        foreignTotal += P[owner][loc] * (rPrivV[loc][i] - wVec[loc] - tauVec[owner]);
      }
      foreignInc[owner][i] = foreignTotal;
      rentierIdxV[owner][i] = foreignTotal / Math.max(Math.abs(GNIV[owner][i]), EPS);
    }

    for (let owner = 0; owner < n; owner += 1) {
      let domCap = 0;
      let forCap = 0;
      for (let loc = 0; loc < n; loc += 1) {
        if (owner === loc) domCap += P[owner][loc] * rPrivV[loc][i];
        else forCap += P[owner][loc] * (rPrivV[loc][i] - wVec[loc] - tauVec[owner]);
      }
      const denom = LVec[owner];
      GNIPartsAll[owner][i] = {
        labor: laborInc[owner] / denom,
        dom_cap: domCap / denom,
        for_cap: forCap / denom,
        gov: (source[owner] + resid[owner]) / denom,
      };
    }

    if (i > 0) {
      for (let k = 0; k < n; k += 1) {
        gV[k][i] = Math.log(clampMin(YV[k][i])) - Math.log(clampMin(YV[k][i - 1]));
      }
    }
    for (let k = 0; k < n; k += 1) {
      rgV[k][i] = rPrivV[k][i] - gV[k][i];
    }

    if (i < timeLen - 1) {
      const idxFuture = Math.min(timeLen - 1, i + l);
      const bFuture = [betaExt[0][idxFuture], betaExt[1][idxFuture], betaExt[2][idxFuture]];
      const AFuture = [APaths[0][idxFuture], APaths[1][idxFuture], APaths[2][idxFuture]];

      const pipeSurvive = Array(n).fill(0);
      if (l > 1) {
        for (let c = 0; c < n; c += 1) {
          for (let tauLag = 1; tauLag < l; tauLag += 1) {
            pipeSurvive[c] += pipe[c][i + tauLag] * Math.pow(1 - delta, l - tauLag);
          }
        }
      }
      const VFixed = VCurrent.map((value, idx) => value * Math.pow(1 - delta, l) + pipeSurvive[idx]);

      let sGuess = [...sBaseVec];
      let PGuessF = cloneMatrix(PGuessNext);
      for (let iter = 0; iter < MAX_SAVINGS_ITERS; iter += 1) {
        const VProj = VFixed.map((value, idx) => Math.max(value + sGuess[idx] * GNIV[idx][i], EPS));
        const future = solve3cMarketNumeric(VProj, bFuture, delta, AFuture, LVec, gamma, rho, wVec, tauVec, lambda, PGuessF);
        PGuessF = cloneMatrix(future.P);
        const rrF = Array.from({ length: n }, (_, k) => getPrivateReturn(future.K[k], bFuture[k], rho, gamma, AFuture[k], LVec[k], delta, lambda));
        const rYield = Array(n).fill(0);
        for (let owner = 0; owner < n; owner += 1) {
          let total = 0;
          for (let loc = 0; loc < n; loc += 1) {
            const ret = owner === loc ? rrF[loc] : (rrF[loc] - wVec[loc] - tauVec[owner]);
            total += future.P[owner][loc] * ret;
          }
          rYield[owner] = total / Math.max(VProj[owner], EPS);
        }
        const sNew = Array.from({ length: n }, (_, idx) => sBaseVec[idx] + phi * (rYield[idx] - rTarget));
        const diff = Math.max(...sNew.map((value, idx) => Math.abs(value - sGuess[idx])));
        sGuess = sNew;
        if (diff < 1e-6) break;
      }

      lastSavingsGuess = [...sGuess];
      for (let c = 0; c < n; c += 1) {
        pipe[c][i + l] = sGuess[c] * GNIV[c][i];
      }

      P = P.map((row) => row.map((value) => value * (1 - delta)));
      for (let c = 0; c < n; c += 1) {
        P[c][c] += pipe[c][i + 1];
      }

      const VNew = rowSums(P).map((value) => Math.max(value, 0));
      const next = solve3cMarketNumeric(VNew, [betaExt[0][i + 1], betaExt[1][i + 1], betaExt[2][i + 1]], delta, [APaths[0][i + 1], APaths[1][i + 1], APaths[2][i + 1]], LVec, gamma, rho, wVec, tauVec, lambda, PGuessNext);
      P = cloneMatrix(next.P);
      PGuessNext = cloneMatrix(next.P);
    }
  }

  const yearsSpan = Math.max(1, displayPeriods - 1);
  const history = range(displayPeriods).map((t) => {
    const wealthPc = [VV[0][t] / L_A, VV[1][t] / L_B, VV[2][t] / L_C];
    const wealthPcSum = sum(wealthPc);
    return {
      t,
      isAutarky: pureAutarky[t],
      beta1: betaExt[0][t],
      beta2: betaExt[1][t],
      beta3: betaExt[2][t],
      y1: 100 * safeDiv(YV[0][t], YV[0][0], 1),
      y2: 100 * safeDiv(YV[1][t], YV[1][0], 1),
      y3: 100 * safeDiv(YV[2][t], YV[2][0], 1),
      r1: rPrivV[0][t] * 100,
      r2: rPrivV[1][t] * 100,
      r3: rPrivV[2][t] * 100,
      aiGlobal: aiRevGlobalPctGniV[t],
      sh1: 100 * safeDiv(wealthPc[0], wealthPcSum, 0),
      sh2: 100 * safeDiv(wealthPc[1], wealthPcSum, 0),
      sh3: 100 * safeDiv(wealthPc[2], wealthPcSum, 0),
      outLab1: laborShareYV[0][t],
      outLab2: laborShareYV[1][t],
      outLab3: laborShareYV[2][t],
      outCap1: capitalShareYV[0][t],
      outCap2: capitalShareYV[1][t],
      outCap3: capitalShareYV[2][t],
      outAi1: aiShareYV[0][t],
      outAi2: aiShareYV[1][t],
      outAi3: aiShareYV[2][t],
      sg1: starveGapV[0][t] * 100,
      sg2: starveGapV[1][t] * 100,
      sg3: starveGapV[2][t] * 100,
      gni1: 100 * safeDiv(GNIV[0][t], GNIV[0][0], 1),
      gni2: 100 * safeDiv(GNIV[1][t], GNIV[1][0], 1),
      gni3: 100 * safeDiv(GNIV[2][t], GNIV[2][0], 1),
      rent1: rentierIdxV[0][t] * 100,
      rent2: rentierIdxV[1][t] * 100,
      rent3: rentierIdxV[2][t] * 100,
      rg1: rgV[0][t] * 100,
      rg2: rgV[1][t] * 100,
      rg3: rgV[2][t] * 100,
      off1: offshoreRatioV[0][t] * 100,
      off2: offshoreRatioV[1][t] * 100,
      off3: offshoreRatioV[2][t] * 100,
      mpl1: mplV[0][t],
      mpl2: mplV[1][t],
      mpl3: mplV[2][t],
      mplp1: mplPrivV[0][t],
      mplp2: mplPrivV[1][t],
      mplp3: mplPrivV[2][t],
      g1: gV[0][t] * 100,
      g2: gV[1][t] * 100,
      g3: gV[2][t] * 100,
      g1NoAI: gNoAi[0][t] * 100,
      g2NoAI: gNoAi[1][t] * 100,
      g3NoAI: gNoAi[2][t] * 100,
      gni_parts: [GNIPartsAll[0][t], GNIPartsAll[1][t], GNIPartsAll[2][t]],
      rawY: [YV[0][t], YV[1][t], YV[2][t]],
    };
  });

  const annualizedGrowth = [
    { label: 'Leader', value: annualizedRate(YV[0][0], YV[0][displayPeriods - 1], yearsSpan) },
    { label: 'Follower', value: annualizedRate(YV[1][0], YV[1][displayPeriods - 1], yearsSpan) },
    { label: 'Laggard', value: annualizedRate(YV[2][0], YV[2][displayPeriods - 1], yearsSpan) },
  ];

  return {
    history,
    annualizedGrowth,
    yearsSpan,
    meta: {
      mode: '3C',
      theta,
      lambda,
      growth: [g1, g2, g3],
      countries: ['Leader', 'Follower', 'Laggard'],
      lastSavingsGuess,
    },
  };
};
