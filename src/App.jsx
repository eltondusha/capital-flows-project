import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  ReferenceArea,
} from 'recharts';
import { Globe, SlidersHorizontal, TrendingUp, Landmark, RefreshCw } from 'lucide-react';

const COLORS = ['#2563eb', '#dc2626', '#16a34a'];
const COUNTRY_LABELS = ['A', 'B', 'C'];
const SCENARIOS = [
  { id: 'hype', name: 'Scenario 1: Hype' },
  { id: 'tidal', name: 'Scenario 2: Tidal Flow' },
  { id: 'logjam', name: 'Scenario 3: Logjam' },
  { id: 'gulf', name: 'Scenario 4: The Gulf' },
];

const DEFAULTS_2C = {
  T: 60,
  T_SIM: 40,
  l: 3,
  sigma: 0.4,
  delta: 0.05,
  gamma: 0.33,
  rTarget: 0.04,
  bStart: 0.001,
  steepnessGen: 0.8,
  targetYRatio: 1.5,
  A0_B: 1.0,
  L: [5.0, 2.5],
  omega: [0.001, 0.002],
  tau: [0.001, 0.002],
};

const DEFAULTS_3C = {
  T: 60,
  T_SIM: 40,
  l: 3,
  sigma: 0.4,
  delta: 0.05,
  gamma: 0.33,
  rTarget: 0.04,
  bStart: 0.001,
  steepnessGen: 0.8,
  targetY_A_to_C: 2.0,
  targetY_B_to_C: 1.5,
  A0_C: 1.0,
  L: [5.0, 3.0, 1.0],
  omega: [0.001, 0.001, 0.0],
  tau: [0.0, 0.001, 0.001],
};

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function clampMin(x, eps = 1e-12) {
  return Math.max(eps, x);
}

function fzero(func, low, high, iterations = 120) {
  let a = low;
  let b = high;
  let fa = func(a);
  let fb = func(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return (a + b) / 2;
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) return Math.abs(fa) < Math.abs(fb) ? a : b;
  let mid = (a + b) / 2;
  for (let i = 0; i < iterations; i += 1) {
    mid = (a + b) / 2;
    const fm = func(mid);
    if (!Number.isFinite(fm)) return mid;
    if (Math.abs(fm) < 1e-10 || Math.abs(b - a) < 1e-10) return mid;
    if (fa * fm <= 0) {
      b = mid;
      fb = fm;
    } else {
      a = mid;
      fa = fm;
    }
  }
  return mid;
}

function bisectRoot(fun, a, b, tol = 1e-10, maxit = 200) {
  let low = a;
  let high = b;
  let flow = fun(low);
  let fhigh = fun(high);
  if (Math.abs(flow) < tol) return low;
  if (Math.abs(fhigh) < tol) return high;
  if (Math.sign(flow) === Math.sign(fhigh)) return (low + high) / 2;
  for (let it = 0; it < maxit; it += 1) {
    const mid = 0.5 * (low + high);
    const fmid = fun(mid);
    if (Math.abs(fmid) < tol || 0.5 * (high - low) < tol) return mid;
    if (Math.sign(fmid) === Math.sign(flow)) {
      low = mid;
      flow = fmid;
    } else {
      high = mid;
      fhigh = fmid;
    }
  }
  return 0.5 * (low + high);
}

function getY(k, bt, rho, gamma, A, L) {
  if (k <= 0) return 0;
  const kEff = clampMin(k);
  const taskAgg = clampMin((bt ** (1 - rho)) * (kEff ** rho) + ((1 - bt) ** (1 - rho)) * (L ** rho));
  return A * (kEff ** gamma) * (taskAgg ** ((1 - gamma) / rho));
}

function getR(k, bt, rho, gamma, A, L, delta) {
  const kEff = clampMin(k);
  const taskAgg = clampMin((bt ** (1 - rho)) * (kEff ** rho) + ((1 - bt) ** (1 - rho)) * (L ** rho));
  const share = ((bt ** (1 - rho)) * (kEff ** rho)) / taskAgg;
  const yOverK = getY(kEff, bt, rho, gamma, A, L) / kEff;
  return (gamma + (1 - gamma) * share) * yOverK - delta;
}

function getMpl(k, bt, rho, gamma, A, L) {
  const kEff = clampMin(k);
  const X = clampMin((bt ** (1 - rho)) * (kEff ** rho) + ((1 - bt) ** (1 - rho)) * (L ** rho));
  const y = A * (kEff ** gamma) * (X ** ((1 - gamma) / rho));
  return (1 - gamma) * (y / X) * ((1 - bt) ** (1 - rho)) * (L ** (rho - 1));
}

function extendPath(arr, l) {
  const tail = Array(l + 2).fill(arr[arr.length - 1]);
  return [...arr, ...tail];
}

function buildScenarioPaths2C(id, t, bStart, steepnessGen) {
  const hypeRealizedMax = 0.1;
  const hypePercPeak = 0.4;
  const hypeTroughDepth = 0.05;
  const tidalMax = 0.5;
  const tidalLagB = 10;
  const tidalMidpoint = 15;
  const tidalSteepness = 0.45;
  const logjamMax = 0.5;
  const logjamPlateauDur = 8;
  const logjamLagB = 8;
  const logjamMid1 = 8;
  const logjamMid2 = logjamMid1 + 8 + logjamPlateauDur;
  const gulfMax = 0.9;
  const gulfPlateauGap = 10;
  const gulfLeakageB = 0.1;
  const gulfMid1 = 10;
  const gulfMid2 = gulfMid1 + gulfPlateauGap + 5;

  const betaA1 = t.map((x) => bStart + (hypeRealizedMax - bStart) * sigmoid(steepnessGen * (x - 5)));
  const sPeak = t.map((x) => sigmoid(2.5 * (x - 3)) * (1 / (1 + Math.exp(1.8 * (x - 7)))));
  const sTrough = t.map((x) => sigmoid(1.2 * (x - 10)) * (1 / (1 + Math.exp(0.6 * (x - 20)))));
  const betaPercA1 = betaA1.map((v, i) => Math.max(1e-6, v + hypePercPeak * sPeak[i] - hypeTroughDepth * sTrough[i]));
  const betaB1 = [...betaA1];

  const betaA2 = t.map((x) => bStart + tidalMax * sigmoid(tidalSteepness * (x - tidalMidpoint)));
  const betaB2 = t.map((_, i) => (i < tidalLagB ? bStart : betaA2[i - tidalLagB]));

  const betaA3 = t.map((x) => bStart + 0.2 * sigmoid(steepnessGen * (x - logjamMid1)) + (logjamMax - 0.2) * sigmoid(steepnessGen * (x - logjamMid2)));
  const betaB3 = t.map((_, i) => (i < logjamLagB ? bStart : betaA3[i - logjamLagB]));

  const betaA4 = t.map((x) => bStart + 0.4 * sigmoid(0.8 * (x - gulfMid1)) + (gulfMax - 0.4) * sigmoid(0.8 * (x - gulfMid2)));
  const betaB4 = betaA4.map((v) => v * gulfLeakageB);

  const map = {
    hype: [betaA1, betaB1, betaPercA1, betaB1],
    tidal: [betaA2, betaB2, betaA2, betaB2],
    logjam: [betaA3, betaB3, betaA3, betaB3],
    gulf: [betaA4, betaB4, betaA4, betaB4],
  };
  return map[id] || map.hype;
}

function buildScenarioPaths3C(id, t, bStart, steepnessGen) {
  const hypeRealizedMax = 0.1;
  const hypePercPeak = 0.4;
  const hypeTroughDepth = 0.05;
  const tidalMax = 0.5;
  const tidalLagB = 10;
  const tidalLagC = 20;
  const tidalMidpoint = 15;
  const tidalSteepness = 0.45;
  const logjamMax = 0.5;
  const logjamPlateauDur = 8;
  const logjamLagB = 8;
  const logjamMid1 = 8;
  const logjamMid2 = logjamMid1 + 8 + logjamPlateauDur;
  const gulfMax = 0.9;
  const gulfPlateauGap = 10;
  const gulfLeakageB = 0.1;
  const gulfLeakageC = 0.02;
  const gulfMid1 = 10;
  const gulfMid2 = gulfMid1 + gulfPlateauGap + 5;

  const betaA1 = t.map((x) => bStart + (hypeRealizedMax - bStart) * sigmoid(steepnessGen * (x - 5)));
  const sPeak = t.map((x) => sigmoid(2.5 * (x - 3)) * (1 / (1 + Math.exp(1.8 * (x - 7)))));
  const sTrough = t.map((x) => sigmoid(1.2 * (x - 10)) * (1 / (1 + Math.exp(0.6 * (x - 20)))));
  const betaPercA1 = betaA1.map((v, i) => Math.max(1e-6, v + hypePercPeak * sPeak[i] - hypeTroughDepth * sTrough[i]));
  const betaB1 = [...betaA1];
  const betaC1 = t.map(() => bStart);

  const betaA2 = t.map((x) => bStart + tidalMax * sigmoid(tidalSteepness * (x - tidalMidpoint)));
  const betaB2 = t.map((_, i) => (i < tidalLagB ? bStart : betaA2[i - tidalLagB]));
  const betaC2 = t.map((_, i) => (i < tidalLagC ? bStart : betaA2[i - tidalLagC]));

  const betaA3 = t.map((x) => bStart + 0.2 * sigmoid(steepnessGen * (x - logjamMid1)) + (logjamMax - 0.2) * sigmoid(steepnessGen * (x - logjamMid2)));
  const betaB3 = t.map((_, i) => (i < logjamLagB ? bStart : betaA3[i - logjamLagB]));
  const betaC3 = t.map((_, i) => (i < 2 * logjamLagB ? bStart : betaA3[i - 2 * logjamLagB]));

  const betaA4 = t.map((x) => bStart + 0.4 * sigmoid(0.8 * (x - gulfMid1)) + (gulfMax - 0.4) * sigmoid(0.8 * (x - gulfMid2)));
  const betaB4 = betaA4.map((v) => v * gulfLeakageB);
  const betaC4 = betaA4.map((v) => v * gulfLeakageC);

  const map = {
    hype: [betaA1, betaB1, betaC1, betaPercA1, betaB1, betaC1],
    tidal: [betaA2, betaB2, betaC2, betaA2, betaB2, betaC2],
    logjam: [betaA3, betaB3, betaC3, betaA3, betaB3, betaC3],
    gulf: [betaA4, betaB4, betaC4, betaA4, betaB4, betaC4],
  };
  return map[id] || map.hype;
}

function solve2CMarketExact(V, bt, delta, A, L, gamma, rho, w, tau) {
  const tol = 1e-10;
  const VA = Math.max(V[0], 0);
  const VB = Math.max(V[1], 0);
  if (VA + VB <= tol) {
    return { K: [0, 0], P: [[0, 0], [0, 0]], autarky: true, regime: 0 };
  }
  const rAaut = getR(VA, bt[0], rho, gamma, A[0], L[0], delta);
  const rBaut = getR(VB, bt[1], rho, gamma, A[1], L[1], delta);
  const gapA = rAaut - (rBaut - w[1] - tau[0]);
  const gapB = rBaut - (rAaut - w[0] - tau[1]);

  if (gapA >= -tol && gapB >= -tol) {
    return { K: [VA, VB], P: [[VA, 0], [0, VB]], autarky: true, regime: 0 };
  }

  if (gapA < -tol && gapB >= -tol) {
    const f = (x) => getR(VA - x, bt[0], rho, gamma, A[0], L[0], delta) - (getR(VB + x, bt[1], rho, gamma, A[1], L[1], delta) - w[1] - tau[0]);
    const x = VA <= tol ? 0 : (f(VA) < 0 ? VA : bisectRoot(f, 0, VA));
    return { K: [VA - x, VB + x], P: [[VA - x, x], [0, VB]], autarky: false, regime: 1 };
  }

  const f = (x) => getR(VB - x, bt[1], rho, gamma, A[1], L[1], delta) - (getR(VA + x, bt[0], rho, gamma, A[0], L[0], delta) - w[0] - tau[1]);
  const x = VB <= tol ? 0 : (f(VB) < 0 ? VB : bisectRoot(f, 0, VB));
  return { K: [VA + x, VB - x], P: [[VA, 0], [x, VB - x]], autarky: false, regime: -1 };
}

function repairPortfolio(Pin, V) {
  const n = V.length;
  if (!Pin || Pin.length !== n) {
    return V.map((v, i) => Array.from({ length: n }, (_, j) => (i === j ? v : 0)));
  }
  const P = Pin.map((row) => row.map((x) => Math.max(0, Number.isFinite(x) ? x : 0)));
  for (let i = 0; i < n; i += 1) {
    const rowSum = P[i].reduce((a, b) => a + b, 0);
    if (rowSum <= 1e-14) {
      for (let j = 0; j < n; j += 1) P[i][j] = i === j ? V[i] : 0;
    } else {
      for (let j = 0; j < n; j += 1) P[i][j] *= V[i] / rowSum;
    }
  }
  return P;
}

function netReturn(owner, loc, Kloc, bt, delta, A, L, gamma, rho, w, tau) {
  let val = getR(Kloc, bt[loc], rho, gamma, A[loc], L[loc], delta);
  if (owner !== loc) val -= w[loc] + tau[owner];
  return val;
}

function solve3CMarketNumeric(V, bt, delta, A, L, gamma, rho, w, tau, Pinit) {
  const n = V.length;
  const tolMove = 1e-10;
  const tolSupport = 1e-8;
  const maxOuter = 500;
  const Vpos = V.map((x) => Math.max(0, x));
  if (Vpos.reduce((a, b) => a + b, 0) <= tolMove) {
    return { K: Array(n).fill(0), P: Array.from({ length: n }, () => Array(n).fill(0)), pureAutarky: true };
  }
  const P = repairPortfolio(Pinit, Vpos);
  let K = Array.from({ length: n }, (_, j) => P.reduce((sum, row) => sum + row[j], 0));

  for (let outer = 0; outer < maxOuter; outer += 1) {
    let bestGap = tolMove;
    let best = null;
    for (let i = 0; i < n; i += 1) {
      for (let a = 0; a < n; a += 1) {
        if (P[i][a] <= tolMove) continue;
        const netA = netReturn(i, a, K[a], bt, delta, A, L, gamma, rho, w, tau);
        for (let b = 0; b < n; b += 1) {
          if (b === a) continue;
          const netB = netReturn(i, b, K[b], bt, delta, A, L, gamma, rho, w, tau);
          const gap = netB - netA;
          if (gap > bestGap) {
            bestGap = gap;
            best = { i, a, b };
          }
        }
      }
    }
    if (!best) break;
    const maxMove = P[best.i][best.a];
    const f = (x) => netReturn(best.i, best.b, K[best.b] + x, bt, delta, A, L, gamma, rho, w, tau) - netReturn(best.i, best.a, K[best.a] - x, bt, delta, A, L, gamma, rho, w, tau);
    const xStar = maxMove <= tolMove ? 0 : (f(maxMove) >= 0 ? maxMove : bisectRoot(f, 0, maxMove, 1e-12, 200));
    if (xStar <= tolMove) break;
    P[best.i][best.a] -= xStar;
    P[best.i][best.b] += xStar;
    K[best.a] -= xStar;
    K[best.b] += xStar;
  }

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (Math.abs(P[i][j]) < 1e-12) P[i][j] = 0;
    }
  }
  K = Array.from({ length: n }, (_, j) => P.reduce((sum, row) => sum + row[j], 0));
  let pureAutarky = true;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i !== j && P[i][j] > tolSupport) pureAutarky = false;
    }
  }
  return { K, P, pureAutarky };
}

function calibrate2C(params) {
  const rho = (params.sigma - 1) / params.sigma;
  const fRB = (k) => getR(k, params.bStart, rho, params.gamma, params.A0_B, 1, params.delta) - params.rTarget;
  const kB = fzero(fRB, 0.01, 1000);
  const yB = getY(kB, params.bStart, rho, params.gamma, params.A0_B, 1);
  const yTargetA = yB * params.targetYRatio;
  const findA0A = (aGuess) => {
    const k = fzero((kk) => getR(kk, params.bStart, rho, params.gamma, aGuess, 1, params.delta) - params.rTarget, 0.01, 2000);
    return getY(k, params.bStart, rho, params.gamma, aGuess, 1) - yTargetA;
  };
  const A0A = fzero(findA0A, 0.1, 10);
  const kA = fzero((k) => getR(k, params.bStart, rho, params.gamma, A0A, 1, params.delta) - params.rTarget, 0.01, 2000);
  const sBaseA = (params.delta * kA) / getY(kA, params.bStart, rho, params.gamma, A0A, 1);
  const sBaseB = (params.delta * kB) / getY(kB, params.bStart, rho, params.gamma, params.A0_B, 1);
  return { rho, A0: [A0A, params.A0_B], kSS: [kA, kB], sBase: [sBaseA, sBaseB] };
}

function calibrate3C(params) {
  const rho = (params.sigma - 1) / params.sigma;
  const kC = fzero((k) => getR(k, params.bStart, rho, params.gamma, params.A0_C, 1, params.delta) - params.rTarget, 0.01, 1000);
  const yC = getY(kC, params.bStart, rho, params.gamma, params.A0_C, 1);
  const yTargetB = yC * params.targetY_B_to_C;
  const yTargetA = yC * params.targetY_A_to_C;
  const A0B = fzero((aGuess) => {
    const k = fzero((kk) => getR(kk, params.bStart, rho, params.gamma, aGuess, 1, params.delta) - params.rTarget, 0.01, 2000);
    return getY(k, params.bStart, rho, params.gamma, aGuess, 1) - yTargetB;
  }, 0.1, 10);
  const A0A = fzero((aGuess) => {
    const k = fzero((kk) => getR(kk, params.bStart, rho, params.gamma, aGuess, 1, params.delta) - params.rTarget, 0.01, 2000);
    return getY(k, params.bStart, rho, params.gamma, aGuess, 1) - yTargetA;
  }, 0.1, 10);
  const kB = fzero((k) => getR(k, params.bStart, rho, params.gamma, A0B, 1, params.delta) - params.rTarget, 0.01, 2000);
  const kA = fzero((k) => getR(k, params.bStart, rho, params.gamma, A0A, 1, params.delta) - params.rTarget, 0.01, 2000);
  const sBase = [
    (params.delta * kA) / getY(kA, params.bStart, rho, params.gamma, A0A, 1),
    (params.delta * kB) / getY(kB, params.bStart, rho, params.gamma, A0B, 1),
    (params.delta * kC) / getY(kC, params.bStart, rho, params.gamma, params.A0_C, 1),
  ];
  return { rho, A0: [A0A, A0B, params.A0_C], kSS: [kA, kB, kC], sBase };
}

function simulate2C(scenarioId, params) {
  const { rho, A0, kSS, sBase } = calibrate2C(params);
  const t = Array.from({ length: params.T + 1 }, (_, i) => i);
  const [betaA, betaB, betaPA, betaPB] = buildScenarioPaths2C(scenarioId, t, params.bStart, params.steepnessGen);
  const bA_r = extendPath(betaA, params.l);
  const bB_r = extendPath(betaB, params.l);
  const bP_A = extendPath(betaPA, params.l);
  const bP_B = extendPath(betaPB, params.l);
  let P = [
    [kSS[0] * params.L[0], 0],
    [0, kSS[1] * params.L[1]],
  ];
  const pipeA = Array(params.tLength || params.T + 1 + params.l + 5).fill(params.delta * P[0][0]);
  const pipeB = Array(params.tLength || params.T + 1 + params.l + 5).fill(params.delta * P[1][1]);
  const chart = [];

  for (let i = 0; i <= params.T_SIM; i += 1) {
    const K = [P[0][0] + P[1][0], P[0][1] + P[1][1]];
    const V = [P[0][0] + P[0][1], P[1][0] + P[1][1]];
    const bt = [bA_r[i], bB_r[i]];
    const perceived = [bP_A[Math.min(i + params.l, bP_A.length - 1)], bP_B[Math.min(i + params.l, bP_B.length - 1)]];
    const Y = K.map((k, c) => getY(k, bt[c], rho, params.gamma, A0[c], params.L[c]));
    const rReal = K.map((k, c) => getR(k, bt[c], rho, params.gamma, A0[c], params.L[c], params.delta));
    const mpl = K.map((k, c) => getMpl(k, bt[c], rho, params.gamma, A0[c], params.L[c]));

    const offshore = [V[0] > 0 ? P[0][1] / V[0] : 0, V[1] > 0 ? P[1][0] / V[1] : 0];
    const niip = [P[0][1] - P[1][0], P[1][0] - P[0][1]];
    const foreignIncome = [P[0][1] * Math.max(0, rReal[1] - params.omega[1] - params.tau[0]), P[1][0] * Math.max(0, rReal[0] - params.omega[0] - params.tau[1])];
    const gni = [mpl[0] * params.L[0] + P[0][0] * rReal[0] + foreignIncome[0], mpl[1] * params.L[1] + P[1][1] * rReal[1] + foreignIncome[1]];

    chart.push({
      period: i,
      autarky: +(P[0][1] < 1e-8 && P[1][0] < 1e-8),
      beta_A: bt[0], beta_B: bt[1], beta_A_perc: bP_A[i],
      output_A: Y[0] / Y[0] * 100, output_B: Y[1] / chart[0]?.__YB0 || 100,
      output_A_raw: Y[0], output_B_raw: Y[1],
      r_A: rReal[0], r_B: rReal[1],
      mpl_A: mpl[0], mpl_B: mpl[1],
      niip_A: niip[0], niip_B: niip[1],
      offshore_A: offshore[0] * 100, offshore_B: offshore[1] * 100,
      gni_A: gni[0], gni_B: gni[1],
      __YB0: chart[0]?.__YB0 || Y[1],
      regime: P[0][1] > 1e-8 ? 1 : (P[1][0] > 1e-8 ? -1 : 0),
    });

    const futureReturns = [
      getR(K[0], perceived[0], rho, params.gamma, A0[0], params.L[0], params.delta),
      getR(K[1], perceived[1], rho, params.gamma, A0[1], params.L[1], params.delta),
    ];
    const sRate = sBase.map((s, c) => Math.max(0.02, Math.min(0.5, s * (1 + 0.25 * (futureReturns[c] - params.rTarget) / params.rTarget))));
    pipeA[i + params.l] = sRate[0] * Y[0];
    pipeB[i + params.l] = sRate[1] * Y[1];

    const investmentNext = [pipeA[i], pipeB[i]];
    const Vnext = [Math.max(0, (1 - params.delta) * V[0] + investmentNext[0]), Math.max(0, (1 - params.delta) * V[1] + investmentNext[1])];
    const solved = solve2CMarketExact(Vnext, bt, params.delta, A0, params.L, params.gamma, rho, params.omega, params.tau);
    P = solved.P;
  }

  const yA0 = chart[0]?.output_A_raw || 1;
  const yB0 = chart[0]?.output_B_raw || 1;
  chart.forEach((d) => {
    d.output_A = (d.output_A_raw / yA0) * 100;
    d.output_B = (d.output_B_raw / yB0) * 100;
    delete d.__YB0;
  });
  return { chart, meta: { A0, kSS, sBase } };
}

function simulate3C(scenarioId, params) {
  const { rho, A0, kSS, sBase } = calibrate3C(params);
  const t = Array.from({ length: params.T + 1 }, (_, i) => i);
  const [betaA, betaB, betaC, betaPA, betaPB, betaPC] = buildScenarioPaths3C(scenarioId, t, params.bStart, params.steepnessGen);
  const bR = [extendPath(betaA, params.l), extendPath(betaB, params.l), extendPath(betaC, params.l)];
  const bP = [extendPath(betaPA, params.l), extendPath(betaPB, params.l), extendPath(betaPC, params.l)];
  let P = [
    [kSS[0] * params.L[0], 0, 0],
    [0, kSS[1] * params.L[1], 0],
    [0, 0, kSS[2] * params.L[2]],
  ];
  const pipe = Array.from({ length: 3 }, (_, c) => Array(params.T + params.l + 10).fill(params.delta * P[c][c]));
  const chart = [];

  for (let i = 0; i <= params.T_SIM; i += 1) {
    const K = Array.from({ length: 3 }, (_, j) => P.reduce((sum, row) => sum + row[j], 0));
    const V = P.map((row) => row.reduce((a, b) => a + b, 0));
    const bt = bR.map((row) => row[i]);
    const futureBt = bP.map((row) => row[Math.min(i + params.l, row.length - 1)]);
    const Y = K.map((k, c) => getY(k, bt[c], rho, params.gamma, A0[c], params.L[c]));
    const rReal = K.map((k, c) => getR(k, bt[c], rho, params.gamma, A0[c], params.L[c], params.delta));
    const mpl = K.map((k, c) => getMpl(k, bt[c], rho, params.gamma, A0[c], params.L[c]));
    const offshore = V.map((v, owner) => (v > 0 ? (v - P[owner][owner]) / v : 0));
    const niip = [
      (P[0][1] + P[0][2]) - (P[1][0] + P[2][0]),
      (P[1][0] + P[1][2]) - (P[0][1] + P[2][1]),
      (P[2][0] + P[2][1]) - (P[0][2] + P[1][2]),
    ];
    const foreignIncome = [0, 1, 2].map((owner) => {
      let sum = 0;
      for (let loc = 0; loc < 3; loc += 1) {
        if (owner !== loc) sum += P[owner][loc] * Math.max(0, rReal[loc] - params.omega[loc] - params.tau[owner]);
      }
      return sum;
    });
    const gni = [0, 1, 2].map((c) => mpl[c] * params.L[c] + P[c][c] * rReal[c] + foreignIncome[c]);
    const pureAutarky = [0, 1, 2].every((a) => [0, 1, 2].every((b) => a === b || P[a][b] < 1e-8));

    chart.push({
      period: i,
      autarky: +pureAutarky,
      beta_A: bt[0], beta_B: bt[1], beta_C: bt[2], beta_A_perc: bP[0][i],
      output_A_raw: Y[0], output_B_raw: Y[1], output_C_raw: Y[2],
      r_A: rReal[0], r_B: rReal[1], r_C: rReal[2],
      niip_A: niip[0], niip_B: niip[1], niip_C: niip[2],
      offshore_A: offshore[0] * 100, offshore_B: offshore[1] * 100, offshore_C: offshore[2] * 100,
      gni_A: gni[0], gni_B: gni[1], gni_C: gni[2],
    });

    const futureReturns = [0, 1, 2].map((c) => getR(K[c], futureBt[c], rho, params.gamma, A0[c], params.L[c], params.delta));
    const sRate = sBase.map((s, c) => Math.max(0.02, Math.min(0.5, s * (1 + 0.25 * (futureReturns[c] - params.rTarget) / params.rTarget))));
    for (let c = 0; c < 3; c += 1) pipe[c][i + params.l] = sRate[c] * Y[c];

    const Vnext = V.map((v, c) => Math.max(0, (1 - params.delta) * v + pipe[c][i]));
    const solved = solve3CMarketNumeric(Vnext, bt, params.delta, A0, params.L, params.gamma, rho, params.omega, params.tau, P);
    P = solved.P;
  }

  const base = [chart[0]?.output_A_raw || 1, chart[0]?.output_B_raw || 1, chart[0]?.output_C_raw || 1];
  chart.forEach((d) => {
    d.output_A = (d.output_A_raw / base[0]) * 100;
    d.output_B = (d.output_B_raw / base[1]) * 100;
    d.output_C = (d.output_C_raw / base[2]) * 100;
  });
  return { chart, meta: { A0, kSS, sBase } };
}

function ControlCard({ title, icon, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        {icon}
        <span>{title}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Slider({ label, value, onChange, min, max, step = 0.001 }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span className="font-mono">{Number(value).toFixed(3)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-slate-800"
      />
    </label>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="h-72">{children}</div>
    </div>
  );
}

function shadeAreas(data) {
  const out = [];
  let start = null;
  data.forEach((d, i) => {
    if (d.autarky === 1 && start === null) start = d.period;
    const nextAut = i < data.length - 1 ? data[i + 1].autarky : 0;
    if (start !== null && (d.autarky === 1 && nextAut === 0)) {
      out.push({ x1: start, x2: d.period });
      start = null;
    }
  });
  return out;
}

function SummaryStat({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-800">{value}</div>
    </div>
  );
}

export default function App() {
  const [countryCount, setCountryCount] = useState(2);
  const [scenario, setScenario] = useState('hype');
  const [omega, setOmega] = useState([0.001, 0.002, 0.0]);
  const [tau, setTau] = useState([0.001, 0.002, 0.001]);
  const [lag, setLag] = useState(3);

  const data = useMemo(() => {
    if (countryCount === 2) {
      return simulate2C(scenario, { ...DEFAULTS_2C, omega: omega.slice(0, 2), tau: tau.slice(0, 2), l: lag });
    }
    return simulate3C(scenario, { ...DEFAULTS_3C, omega, tau, l: lag });
  }, [countryCount, scenario, omega, tau, lag]);

  const chart = data.chart;
  const shades = shadeAreas(chart);
  const last = chart[chart.length - 1] || {};
  const labels = COUNTRY_LABELS.slice(0, countryCount);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-slate-900 to-slate-700 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm text-slate-300"><Globe size={16} /> Capital Flows Project</div>
              <h1 className="text-3xl font-bold">Task-based automation, taxes, and cross-border capital reallocation</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                This update folds your new MATLAB logic into the web app: exact two-country corner solutions, a numeric three-country portfolio solver, source taxes on foreigners, residence taxes on outbound investors, and the four scenario paths.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCountryCount(2);
                setScenario('hype');
                setOmega([0.001, 0.002, 0.0]);
                setTau([0.001, 0.002, 0.001]);
                setLag(3);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
            >
              <RefreshCw size={16} /> Reset defaults
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
          <div className="space-y-4">
            <ControlCard title="Model" icon={<Landmark size={16} />}>
              <div className="grid grid-cols-2 gap-2">
                {[2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCountryCount(n)}
                    className={`rounded-xl px-3 py-2 text-sm font-medium ${countryCount === n ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                  >
                    {n} countries
                  </button>
                ))}
              </div>
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <Slider label="Installation lag (l)" value={lag} onChange={setLag} min={1} max={8} step={1} />
            </ControlCard>

            <ControlCard title="Policy wedges" icon={<SlidersHorizontal size={16} />}>
              {labels.map((label, i) => (
                <div key={label} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Country {label}</div>
                  <Slider
                    label={`Source tax on foreigners (omega_${label})`}
                    value={omega[i]}
                    onChange={(v) => setOmega((prev) => prev.map((x, idx) => (idx === i ? v : x)))}
                    min={0}
                    max={0.05}
                    step={0.001}
                  />
                  <Slider
                    label={`Residence tax on own investors abroad (tau_${label})`}
                    value={tau[i]}
                    onChange={(v) => setTau((prev) => prev.map((x, idx) => (idx === i ? v : x)))}
                    min={0}
                    max={0.05}
                    step={0.001}
                  />
                </div>
              ))}
            </ControlCard>
          </div>

          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryStat label="Terminal output index A" value={(last.output_A || 0).toFixed(1)} />
              <SummaryStat label="Terminal NIIP A" value={(last.niip_A || 0).toFixed(2)} />
              <SummaryStat label="Terminal offshore share A" value={`${(last.offshore_A || 0).toFixed(1)}%`} />
              <SummaryStat label="Autarky periods" value={chart.reduce((s, d) => s + d.autarky, 0)} />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard title="Automation paths">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {shades.map((s, idx) => <ReferenceArea key={idx} x1={s.x1} x2={s.x2} fill="#cbd5e1" fillOpacity={0.35} />)}
                    <Line type="monotone" dataKey="beta_A" stroke={COLORS[0]} dot={false} strokeWidth={2} name="A realized" />
                    <Line type="monotone" dataKey="beta_A_perc" stroke={COLORS[0]} dot={false} strokeDasharray="5 5" name="A perceived" />
                    <Line type="monotone" dataKey="beta_B" stroke={COLORS[1]} dot={false} strokeWidth={2} name="B realized" />
                    {countryCount === 3 && <Line type="monotone" dataKey="beta_C" stroke={COLORS[2]} dot={false} strokeWidth={2} name="C realized" />}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Output index (t = 0 equals 100)">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {shades.map((s, idx) => <ReferenceArea key={idx} x1={s.x1} x2={s.x2} fill="#cbd5e1" fillOpacity={0.35} />)}
                    <Line type="monotone" dataKey="output_A" stroke={COLORS[0]} dot={false} strokeWidth={2} name="A" />
                    <Line type="monotone" dataKey="output_B" stroke={COLORS[1]} dot={false} strokeWidth={2} name="B" />
                    {countryCount === 3 && <Line type="monotone" dataKey="output_C" stroke={COLORS[2]} dot={false} strokeWidth={2} name="C" />}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Returns on installed capital">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="r_A" stroke={COLORS[0]} dot={false} strokeWidth={2} name="A" />
                    <Line type="monotone" dataKey="r_B" stroke={COLORS[1]} dot={false} strokeWidth={2} name="B" />
                    {countryCount === 3 && <Line type="monotone" dataKey="r_C" stroke={COLORS[2]} dot={false} strokeWidth={2} name="C" />}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Net international investment position">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="niip_A" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.12} name="A" />
                    <Area type="monotone" dataKey="niip_B" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.12} name="B" />
                    {countryCount === 3 && <Area type="monotone" dataKey="niip_C" stroke={COLORS[2]} fill={COLORS[2]} fillOpacity={0.12} name="C" />}
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Offshore capital share (%)">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="offshore_A" stroke={COLORS[0]} dot={false} strokeWidth={2} name="A" />
                    <Line type="monotone" dataKey="offshore_B" stroke={COLORS[1]} dot={false} strokeWidth={2} name="B" />
                    {countryCount === 3 && <Line type="monotone" dataKey="offshore_C" stroke={COLORS[2]} dot={false} strokeWidth={2} name="C" />}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Gross national income">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="gni_A" stroke={COLORS[0]} dot={false} strokeWidth={2} name="A" />
                    <Line type="monotone" dataKey="gni_B" stroke={COLORS[1]} dot={false} strokeWidth={2} name="B" />
                    {countryCount === 3 && <Line type="monotone" dataKey="gni_C" stroke={COLORS[2]} dot={false} strokeWidth={2} name="C" />}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><TrendingUp size={16} /> What changed in this version</div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm text-slate-600">
                <div className="rounded-xl bg-slate-50 p-3">Two-country solver now respects exact autarky and corner-flow cases instead of a smooth interior approximation.</div>
                <div className="rounded-xl bg-slate-50 p-3">Three-country allocation uses repeated pairwise exact transfers, which allows split portfolios and endogenous support patterns.</div>
                <div className="rounded-xl bg-slate-50 p-3">Both source taxes on foreigners and residence taxes on outbound investors are exposed directly in the UI.</div>
                <div className="rounded-xl bg-slate-50 p-3">Scenario paths mirror the MATLAB files: Hype, Tidal Flow, Logjam, and The Gulf.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
