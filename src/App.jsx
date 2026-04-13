import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, AreaChart, Area, ReferenceArea
} from 'recharts';
import {
  Globe, Activity, TrendingUp, Zap, Info, LayoutGrid, ChevronDown
} from 'lucide-react';

/**
 * VERSION 1.8.3 - COSMETIC UI REFRESH
 * - UI: ParamSliders now show large explanations on top and technical labels at the bottom.
 * - Descriptions: Added/Updated explanations for every control.
 * - Logic Persistence: Maintained MATLAB-synced transition timing, dynamic baseline, and growth parity.
 */

// --- UTILITIES ---
const EPS = 1e-12;
const safeDiv = (num, den, fallback = 0) => (Math.abs(den) < EPS ? fallback : num / den);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

const bisect_root = (func, low, high, tol = 1e-12, max_iters = 200) => {
  let fLow = func(low);
  let fHigh = func(high);
  if (Math.abs(fLow) < tol) return low;
  if (Math.abs(fHigh) < tol) return high;
  if (fLow * fHigh > 0) return Math.abs(fLow) < Math.abs(fHigh) ? low : high;
  let mid = 0;
  for (let i = 0; i < max_iters; i++) {
    mid = (low + high) / 2;
    let fMid = func(mid);
    if (Math.abs(fMid) < tol || (high - low) / 2 < tol) return mid;
    if (fMid * fLow > 0) { low = mid; fLow = fMid; }
    else { high = mid; fHigh = fMid; }
  }
  return mid;
};

// --- MATH ENGINE ---
const get_y = (k, bt, rho, gamma, A, L) => {
  const k_eff = Math.max(k, EPS);
  const task_agg = Math.max(EPS, Math.pow(bt, 1 - rho) * Math.pow(k_eff, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho));
  return A * Math.pow(k_eff, gamma) * Math.pow(task_agg, (1 - gamma) / rho);
};

const get_r_phys = (k, bt, rho, gamma, A, L, delta) => {
  const k_eff = Math.max(k, EPS);
  const task_agg = Math.max(EPS, Math.pow(bt, 1 - rho) * Math.pow(k_eff, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho));
  const share = (Math.pow(bt, 1 - rho) * Math.pow(k_eff, rho)) / task_agg;
  const y_over_k = get_y(k_eff, bt, rho, gamma, A, L) / k_eff;
  return (gamma + (1 - gamma) * share) * y_over_k - delta;
};

const get_private_r = (k, bt, rho, gamma, A, L, delta, lambda) => {
  const mpk_gross = get_r_phys(k, bt, rho, gamma, A, L, 0);
  const mpk_no_ai = get_r_phys(k, 0, rho, gamma, A, L, 0);
  return (1 - lambda) * mpk_gross + lambda * mpk_no_ai - delta;
};

const get_ai_rent = (k, bt, rho, gamma, A, L, lambda) => {
  const y_beta = get_y(k, bt, rho, gamma, A, L);
  const y_no_ai = get_y(k, 0, rho, gamma, A, L);
  return lambda * (y_beta - y_no_ai);
};

const get_mpl = (k, bt, rho, gamma, A, L) => {
  const k_eff = Math.max(k, EPS);
  const task_agg = Math.max(EPS, Math.pow(bt, 1 - rho) * Math.pow(k_eff, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho));
  const y = get_y(k_eff, bt, rho, gamma, A, L);
  return (1 - gamma) * (y / task_agg) * Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho - 1);
};

const get_mpl_private = (k, bt, rho, gamma, A, L, lambda) => {
  const mpl_beta = get_mpl(k, bt, rho, gamma, A, L);
  const mpl_no_ai = get_mpl(k, 0, rho, gamma, A, L);
  return (1 - lambda) * mpl_beta + lambda * mpl_no_ai;
};

const repair_portfolio = (P_in, V_vec) => {
  const n = V_vec.length;
  return P_in.map((row, i) => {
    const cleanRow = row.map(v => Math.max(v, 0));
    const s = cleanRow.reduce((a, b) => a + b, 0);
    return s > 0 ? cleanRow.map(v => v * (V_vec[i] / s)) : cleanRow.map((v, idx) => idx === i ? V_vec[i] : 0);
  });
};

// --- SOLVERS ---
const solve_market_3c = (V_vec, bt, delta, A, L, gamma, rho, tau_vec, lambda, P_init = null) => {
  const n = V_vec.length;
  let P = P_init ? repair_portfolio(P_init, V_vec) : Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? V_vec[i] : 0)));
  let K = Array(n).fill(0).map((_, j) => P.reduce((s, r) => s + r[j], 0));

  for (let outer = 0; outer < 400; outer++) {
    let best_gap = 1e-10, best_i = -1, best_a = -1, best_b = -1;
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < n; a++) {
        if (P[i][a] <= 1e-10) continue;
        const r_a = get_private_r(K[a], bt[a], rho, gamma, A[a], L[a], delta, lambda) - (i === a ? 0 : tau_vec[i]);
        for (let b = 0; b < n; b++) {
          if (a === b) continue;
          const r_b = get_private_r(K[b], bt[b], rho, gamma, A[b], L[b], delta, lambda) - (i === b ? 0 : tau_vec[i]);
          if (r_b - r_a > best_gap) { best_gap = r_b - r_a; best_i = i; best_a = a; best_b = b; }
        }
      }
    }
    if (best_i === -1) break;
    const max_val = P[best_i][best_a];
    const f = (x) => (get_private_r(K[best_b] + x, bt[best_b], rho, gamma, A[best_b], L[best_b], delta, lambda) - (best_i === best_b ? 0 : tau_vec[best_i])) - 
                     (get_private_r(K[best_a] - x, bt[best_a], rho, gamma, A[best_a], L[best_a], delta, lambda) - (best_i === best_a ? 0 : tau_vec[best_i]));
    let x_star = f(max_val) >= 0 ? max_val : bisect_root(f, 0, max_val, 1e-12);
    P[best_i][best_a] -= x_star; P[best_i][best_b] += x_star;
    K[best_a] -= x_star; K[best_b] += x_star;
  }
  return { P, K };
};

const solve_market_2c = (V_vec, bt, delta, A, L, gamma, rho, tau_vec, lambda) => {
  const VA = Math.max(V_vec[0], 0), VB = Math.max(V_vec[1], 0);
  if (VA + VB <= 1e-10) return { P: [[0,0],[0,0]], K: [0,0] };
  const rA = get_private_r(VA, bt[0], rho, gamma, A[0], L[0], delta, lambda);
  const rB = get_private_r(VB, bt[1], rho, gamma, A[1], L[1], delta, lambda);
  const gapA = rA - (rB - tau_vec[0]);
  const gapB = rB - (rA - tau_vec[1]);
  if (gapA >= -1e-10 && gapB >= -1e-10) return { P: [[VA, 0], [0, VB]], K: [VA, VB] };
  if (gapA < -1e-10) {
    const f = (x) => get_private_r(VA - x, bt[0], rho, gamma, A[0], L[0], delta, lambda) - (get_private_r(VB + x, bt[1], rho, gamma, A[1], L[1], delta, lambda) - tau_vec[0]);
    const x = f(VA) < 0 ? VA : bisect_root(f, 0, VA, 1e-11);
    return { P: [[VA - x, x], [0, VB]], K: [VA - x, VB + x] };
  }
  const f = (x) => get_private_r(VB - x, bt[1], rho, gamma, A[1], L[1], delta, lambda) - (get_private_r(VA + x, bt[0], rho, gamma, A[0], L[0], delta, lambda) - tau_vec[1]);
  const x = f(VB) < 0 ? VB : bisect_root(f, 0, VB, 1e-11);
  return { P: [[VA, 0], [x, VB - x]], K: [VA + x, VB - x] };
};

// --- SIMULATION ---
const runSim = (mode, params) => {
  const { 
    sigma, delta, phi, gamma, r_target, l, periods: T_sim,
    target_y_ratio_A, target_y_ratio_B, L_ratio_A, L_ratio_B,
    tau1, tau2, tau3, g1, g2, g3, theta, lambda 
  } = params;

  const rho = (sigma - 1) / sigma;
  const n = mode === '2C' ? 2 : 3;
  const b_start = 0.0001;
  const L_vec = n === 2 ? [L_ratio_A, L_ratio_B] : [L_ratio_A, L_ratio_B, 1.0];
  const tau_vec = [tau1, tau2, tau3].slice(0, n);

  // Calibration Logic (lambda=0 initial baseline)
  const A0_Num = 1.0;
  const k_ss_Num = bisect_root((k) => get_private_r(k, b_start, rho, gamma, A0_Num, 1.0, delta, 0) - r_target, 0.01, 1000);
  const y_ss_Num = get_y(k_ss_Num, b_start, rho, gamma, A0_Num, 1.0);
  const findA0 = (ratio) => bisect_root((a) => {
    const k = bisect_root((kk) => get_private_r(kk, b_start, rho, gamma, a, 1.0, delta, 0) - r_target, 0.01, 2000);
    return get_y(k, b_start, rho, gamma, a, 1.0) - y_ss_Num * ratio;
  }, 0.01, 50.0);

  const A0_vec = n === 2 ? [findA0(target_y_ratio_A), A0_Num] : [findA0(target_y_ratio_A), findA0(target_y_ratio_B), A0_Num];
  const K_init_pc = A0_vec.map(a => bisect_root((k) => get_private_r(k, b_start, rho, gamma, a, 1.0, delta, 0) - r_target, 0.01, 2000));
  const s_base_vec = K_init_pc.map((ki, i) => (delta * ki) / Math.max(get_y(ki, b_start, rho, gamma, A0_vec[i], 1.0), EPS));

  // Beta Paths
  const T_full = Math.max(60, T_sim);
  const t_axis = Array.from({ length: T_full + 1 }, (_, i) => i);
  const flowMaxA = 0.25 + theta * (0.65 - 0.25);
  const flowMaxB = b_start + (1 - theta * 0.9) * (flowMaxA - b_start);
  const flowMaxC = b_start + (1 - theta * 0.9) * (flowMaxB - b_start);
  const getNormLogistic = (tt, lag, mid, steep) => {
    const raw = 1 / (1 + Math.exp(-steep * ((tt - lag) - mid)));
    const raw0 = 1 / (1 + Math.exp(-steep * ((0 - lag) - mid)));
    return (raw - raw0) / (1 - raw0);
  };
  const beta_paths = [
    t_axis.map(t => b_start + (flowMaxA - b_start) * getNormLogistic(t, 0, 10, 0.32)),
    t_axis.map(t => b_start + (flowMaxB - b_start) * getNormLogistic(t, 6, 10, 0.32)),
    ...(n === 3 ? [t_axis.map(t => b_start + (flowMaxC - b_start) * getNormLogistic(t, 12, 10, 0.32))] : [])
  ];
  const A_paths = A0_vec.map((a0, i) => Array.from({ length: T_full + l + 11 }, (_, t) => a0 * Math.pow(1 + [g1, g2, g3][i], t)));

  const solve_step = (V, bt, A_v, lmb, P_w = null) => (mode === '2C') ? solve_market_2c(V, bt, delta, A_v, L_vec, gamma, rho, tau_vec, lmb) : solve_market_3c(V, bt, delta, A_v, L_vec, gamma, rho, tau_vec, lmb, P_w);

  // --- 1. DYNAMIC NO-AI BASELINE ---
  const g_noai = Array.from({ length: n }, () => Array(T_full + 1).fill(0));
  let P_noai = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? K_init_pc[i] * L_vec[i] : 0)));
  const pipe_noai = Array.from({ length: n }, (_, i) => Array(T_full + l + 11).fill(delta * K_init_pc[i] * L_vec[i]));
  let Y_prev_noai = null;
  let P_gs_noai_next = null;

  for (let t = 0; t <= T_full; t++) {
    const K_current = Array(n).fill(0).map((_, j) => P_noai.reduce((s, r) => s + r[j], 0));
    const V_curr = P_noai.map(r => r.reduce((a, b) => a + b, 0));
    const A_curr = A_paths.map(p => p[t]);

    const Y_c = K_current.map((k, i) => get_y(k, 0, rho, gamma, A_curr[i], L_vec[i]));
    const r0_curr = K_current.map((k, i) => get_private_r(k, 0, rho, gamma, A_curr[i], L_vec[i], delta, 0));

    if (t > 0) Y_c.forEach((y, i) => g_noai[i][t] = Math.log(Math.max(y, EPS)) - Math.log(Math.max(Y_prev_noai[i], EPS)));
    Y_prev_noai = [...Y_c];

    if (t < T_full) {
      const labor0_inc = Y_c.map((y, i) => y - (r0_curr[i] + delta) * K_current[i]);
      const cap0_inc = Array.from({ length: n }, (_, owner) => {
        let inc = P_noai[owner][owner] * r0_curr[owner];
        for (let loc = 0; loc < n; loc++) if (owner !== loc) inc += P_noai[owner][loc] * (r0_curr[loc] - tau_vec[owner]);
        return inc;
      });
      const gov0 = Array.from({ length: n }, (_, owner) => tau_vec[owner] * P_noai[owner].reduce((s, v, loc) => s + (owner !== loc ? v : 0), 0));
      const GNI0 = Array.from({ length: n }, (_, i) => labor0_inc[i] + cap0_inc[i] + gov0[i]);

      const idx_f = Math.min(T_full, t + l);
      const A_f = A_paths.map(p => p[idx_f]);
      const V_fixed = V_curr.map((v, i) => {
        let pipe_survive = 0;
        if (l > 1) {
          for (let k = 0; k < l - 1; k++) pipe_survive += pipe_noai[i][t + 1 + k] * Math.pow(1 - delta, l - 1 - k);
        }
        return v * Math.pow(1 - delta, l) + pipe_survive;
      });

      let s_it = [...s_base_vec];
      for (let iter = 0; iter < 15; iter++) {
        const V_p = V_fixed.map((vf, i) => Math.max(vf + s_it[i] * GNI0[i], EPS));
        const fut = solve_step(V_p, Array(n).fill(0), A_f, 0, mode === '3C' ? P_gs_noai_next : null);
        if (mode === '3C') P_gs_noai_next = fut.P.map(r => [...r]);
        const rr_f = Array.from({ length: n }, (_, k) => get_private_r(fut.K[k], 0, rho, gamma, A_f[k], L_vec[k], delta, 0));
        const s_next = s_base_vec.map((sb, owner) => {
          let yld = 0;
          for (let loc = 0; loc < n; loc++) yld += fut.P[owner][loc] * (owner === loc ? rr_f[loc] : rr_f[loc] - tau_vec[owner]);
          return sb + phi * (yld / Math.max(V_p[owner], EPS) - r_target);
        });
        if (s_next.every((v, i) => Math.abs(v - s_it[i]) < 1e-6)) { s_it = s_next; break; }
        s_it = s_next;
      }

      pipe_noai.forEach((row, i) => { row[t + l] = s_it[i] * GNI0[i]; });
      P_noai = P_noai.map(row => row.map(v => v * (1 - delta)));
      for (let i = 0; i < n; i++) P_noai[i][i] += pipe_noai[i][t + 1];
      const V_new = P_noai.map(r => Math.max(sum(r), 0));
      const nextRes = solve_step(V_new, Array(n).fill(0), A_paths.map(p => p[t + 1]), 0, mode === '3C' ? P_gs_noai_next : null);
      if (mode === '3C') P_gs_noai_next = nextRes.P.map(r => [...r]);
      P_noai = nextRes.P.map(r => [...r]);
    }
  }

  // --- 2. MAIN SIMULATION ---
  let P_state = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? K_init_pc[i] * L_vec[i] : 0)));
  const pipe = Array.from({ length: n }, (_, i) => Array(T_full + l + 11).fill(delta * K_init_pc[i] * L_vec[i]));
  const history = [];
  let P_gs_frontier = null, P_gs_next = null;
  let Y_prev = null;

  for (let t = 0; t <= T_full; t++) {
    const V_curr = P_state.map(r => r.reduce((a, b) => a + b, 0));
    const bt_r = beta_paths.map(p => p[t]);
    const A_curr = A_paths.map(p => p[t]);

    const K_cl = Array(n).fill(0).map((_, j) => P_state.reduce((s, r) => s + r[j], 0));
    const Y = K_cl.map((k, i) => get_y(k, bt_r[i], rho, gamma, A_curr[i], L_vec[i]));
    const r_pr = K_cl.map((k, i) => get_private_r(k, bt_r[i], rho, gamma, A_curr[i], L_vec[i], delta, lambda));

    const shadow = solve_step(V_curr, Array(n).fill(Math.max(...bt_r)), A_curr, lambda, mode === '3C' ? P_gs_frontier : null);
    if (mode === '3C') P_gs_frontier = shadow.P.map(r => [...r]);

    const rents = K_cl.map((k, i) => get_ai_rent(k, bt_r[i], rho, gamma, A_curr[i], L_vec[i], lambda));
    const gross_cap_inc = K_cl.map((k, i) => (r_pr[i] + delta) * k);
    const lab_inc = Y.map((y, i) => y - rents[i] - gross_cap_inc[i]);

    const rev = Array(n).fill(0).map((_, owner) => {
      let off_w = 0;
      for (let loc = 0; loc < n; loc++) if (owner !== loc) off_w += P_state[owner][loc];
      return tau_vec[owner] * off_w;
    });

    const GNI_parts = Array.from({length: n}, (_, owner) => {
      let d_inc = P_state[owner][owner] * r_pr[owner];
      let f_inc = 0;
      for (let loc = 0; loc < n; loc++) if (owner !== loc) f_inc += P_state[owner][loc] * (r_pr[loc] - tau_vec[owner]);
      return { labor: lab_inc[owner]/L_vec[owner], dom_cap: d_inc/L_vec[owner], for_cap: f_inc/L_vec[owner], gov: rev[owner]/L_vec[owner] };
    });
    const GNI = GNI_parts.map((p, i) => (p.labor + p.dom_cap + p.for_cap + p.gov) * L_vec[i]);
    let g_curr = Array(n).fill(0);
    if (t > 0) g_curr = Y.map((y, i) => Math.log(Math.max(y, EPS)) - Math.log(Math.max(Y_prev[i], EPS)));

    history.push({
      t, rawY: [...Y], gni_parts: GNI_parts,
      beta1: bt_r[0], beta2: bt_r[1], beta3: n === 3 ? bt_r[2] : 0,
      y1: Y[0], y2: Y[1], y3: n === 3 ? Y[2] : 0,
      r1: r_pr[0] * 100, r2: r_pr[1] * 100, r3: n === 3 ? r_pr[2] * 100 : 0,
      aiGlobal: safeDiv(sum(rents), Math.abs(sum(GNI))) * 100,
      sh1: safeDiv(V_curr[0] / L_vec[0], V_curr.reduce((a, v, i) => a + v / L_vec[i], 0)) * 100,
      sh2: safeDiv(V_curr[1] / L_vec[1], V_curr.reduce((a, v, i) => a + v / L_vec[i], 0)) * 100,
      sh3: n === 3 ? safeDiv(V_curr[2] / L_vec[2], V_curr.reduce((a, v, i) => a + v / L_vec[i], 0)) * 100 : 0,
      outLab1: lab_inc[0]/Y[0], outCap1: gross_cap_inc[0]/Y[0], outAi1: rents[0]/Y[0],
      outLab2: lab_inc[1]/Y[1], outCap2: gross_cap_inc[1]/Y[1], outAi2: rents[1]/Y[1],
      outLab3: n === 3 ? lab_inc[2]/Y[2] : 0, outCap3: n === 3 ? gross_cap_inc[2]/Y[2] : 0, outAi3: n === 3 ? rents[2]/Y[2] : 0,
      sg1: (shadow.K[0]-K_cl[0])/Math.max(shadow.K[0], EPS)*100,
      sg2: (shadow.K[1]-K_cl[1])/Math.max(shadow.K[1], EPS)*100,
      sg3: n === 3 ? (shadow.K[2]-K_cl[2])/Math.max(shadow.K[2], EPS)*100 : 0,
      gni1: GNI[0], gni2: GNI[1], gni3: n === 3 ? GNI[2] : 0,
      rent1: safeDiv(GNI_parts[0].for_cap*L_vec[0], GNI[0])*100,
      rent2: safeDiv(GNI_parts[1].for_cap*L_vec[1], GNI[1])*100,
      rent3: n === 3 ? safeDiv(GNI_parts[2].for_cap*L_vec[2], GNI[2])*100 : 0,
      rg1: (r_pr[0] - g_curr[0]) * 100,
      rg2: (r_pr[1] - g_curr[1]) * 100,
      rg3: n === 3 ? (r_pr[2] - g_curr[2]) * 100 : 0,
      off1: safeDiv(V_curr[0] - P_state[0][0], V_curr[0]) * 100,
      off2: safeDiv(V_curr[1] - P_state[1][1], V_curr[1]) * 100,
      off3: n === 3 ? safeDiv(V_curr[2] - P_state[2][2], V_curr[2]) * 100 : 0,
      mpl1: get_mpl(K_cl[0], bt_r[0], rho, gamma, A_curr[0], L_vec[0]),
      mplp1: get_mpl_private(K_cl[0], bt_r[0], rho, gamma, A_curr[0], L_vec[0], lambda),
      mpl2: get_mpl(K_cl[1], bt_r[1], rho, gamma, A_curr[1], L_vec[1]),
      mplp2: get_mpl_private(K_cl[1], bt_r[1], rho, gamma, A_curr[1], L_vec[1], lambda),
      mpl3: n === 3 ? get_mpl(K_cl[2], bt_r[2], rho, gamma, A_curr[2], L_vec[2]) : 0,
      mplp3: n === 3 ? get_mpl_private(K_cl[2], bt_r[2], rho, gamma, A_curr[2], L_vec[2], lambda) : 0,
      ga1: g_curr[0] * 100, ga2: g_curr[1] * 100, ga3: n === 3 ? g_curr[2] * 100 : 0,
      gn1: g_noai[0][t] * 100, gn2: g_noai[1][t] * 100, gn3: n === 3 ? g_noai[2][t] * 100 : 0,
      rev1: safeDiv(rev[0], GNI[0]) * 100, rev2: safeDiv(rev[1], GNI[1]) * 100, rev3: n === 3 ? safeDiv(rev[2], GNI[2]) * 100 : 0
    });

    if (t < T_full) {
      const idx_f = Math.min(T_full, t + l);
      const V_fixed = V_curr.map((v, i) => v * Math.pow(1 - delta, l) + sum(Array.from({length: l-1}, (_, k) => pipe[i][t+1+k] * Math.pow(1-delta, l-1-k))));
      let s_it = [...s_base_vec]; 
      let P_f_gs = mode === '3C' ? P_gs_next : null;
      for (let iter = 0; iter < 15; iter++) {
        const V_p = V_fixed.map((vf, i) => Math.max(vf + s_it[i] * GNI[i], EPS));
        const fut = solve_step(V_p, beta_paths.map(p => p[idx_f]), A_paths.map(p => p[idx_f]), lambda, P_f_gs);
        if (mode === '3C') P_f_gs = fut.P.map(r => [...r]);
        const s_next = s_base_vec.map((sb, o) => {
          const rr_f = Array.from({ length: n }, (_, k) => get_private_r(fut.K[k], beta_paths[k][idx_f], rho, gamma, A_paths[k][idx_f], L_vec[k], delta, lambda));
          let yld = 0;
          for (let lc = 0; lc < n; lc++) yld += fut.P[o][lc] * (o === lc ? rr_f[lc] : rr_f[lc] - tau_vec[o]);
          return sb + phi * (yld / Math.max(V_p[o], EPS) - r_target);
        });
        if (s_next.every((v, i) => Math.abs(v - s_it[i]) < 1e-6)) { s_it = s_next; break; }
        s_it = s_next;
      }
      pipe.forEach((row, i) => { row[t+l] = s_it[i] * GNI[i]; });
      P_state = P_state.map(row => row.map(v => v * (1 - delta)));
      for (let i = 0; i < n; i++) P_state[i][i] += pipe[i][t + 1];
      const V_new = P_state.map(r => Math.max(sum(r), 0));
      const nextRes = solve_step(V_new, beta_paths.map(p => p[t + 1]), A_paths.map(p => p[t + 1]), lambda, mode === '3C' ? P_gs_next : null);
      if (mode === '3C') P_gs_next = nextRes.P.map(r => [...r]);
      P_state = nextRes.P.map(r => [...r]);
    }
    Y_prev = [...Y];
  }

  const dataShown = history.slice(0, T_sim);
  const h0 = dataShown[0], hlast = dataShown[dataShown.length-1];
  const span = T_sim - 1;
  const growth = [
    { label: 'Leader', val: Math.pow(safeDiv(hlast.rawY[0], h0.rawY[0], 1), 1/span)-1 },
    { label: 'Follower', val: Math.pow(safeDiv(hlast.rawY[1], h0.rawY[1], 1), 1/span)-1 }
  ];
  if (n === 3) growth.push({ label: 'Slow Adopter', val: Math.pow(safeDiv(hlast.rawY[2], h0.rawY[2], 1), 1/span)-1 });

  return { data: dataShown.map(h => ({ ...h, y1: safeDiv(h.y1, h0.y1)*100, y2: safeDiv(h.y2, h0.y2)*100, y3: safeDiv(h.y3, h0.y3)*100, gni1: safeDiv(h.gni1, h0.gni1)*100, gni2: safeDiv(h.gni2, h0.gni2)*100, gni3: safeDiv(h.gni3, h0.gni3)*100 })), growth, span };
};

// --- COMPONENTS ---
const ParamSlider = ({ label, val, min, max, step, onChange, icon, desc, disabled }) => (
  <div className={`space-y-2 ${disabled ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
    {desc && <p className="text-[10px] text-slate-600 font-bold leading-tight tracking-tight text-left mb-1 uppercase">{desc}</p>}
    <div className="relative flex items-center h-5">
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 shadow-sm" />
    </div>
    <div className="flex justify-between items-center text-[8px] font-black text-slate-400 tracking-tight text-left uppercase">
      <div className="flex items-center space-x-1">{icon}<span>{label}</span></div>
      <span className="font-mono text-blue-700 bg-blue-100/50 px-1.5 py-0.5 rounded-md border border-blue-200/50">{val}</span>
    </div>
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-300 p-2 text-[9px] font-bold shadow-xl text-left">
        <div className="mb-1 text-slate-400 uppercase tracking-widest border-b pb-1 text-left">Period {label}</div>
        {payload.filter(p => typeof p.value === 'number').map((entry, i) => (
          <div key={`${entry.dataKey}-${i}`} className="flex justify-between space-x-4 text-left">
            <span style={{ color: entry.color }}>{entry.name || entry.dataKey}:</span>
            <span className="font-mono">{entry.value.toFixed(2)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const ChartBlock = ({ title, children, desc }) => (
  <div className="bg-white p-3 border border-slate-300 shadow-sm rounded-sm flex flex-col h-full overflow-hidden text-left">
    <div className="text-[8px] font-black text-slate-500 uppercase tracking-tighter mb-2 border-b border-slate-50 pb-1 text-left">{title}</div>
    <div className="flex-1 min-h-[110px] text-left">{children}</div>
    {desc && <p className="mt-2 text-[7.5px] text-slate-400 font-bold uppercase border-t border-slate-50 pt-1 tracking-tight leading-tight text-left">{desc}</p>}
  </div>
);

const DecompositionSection = ({ title, labels, data }) => (
  <div className="bg-white p-6 border border-slate-300 rounded-sm shadow-sm space-y-6 text-left">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4 text-left">
      <h3 className="text-xs font-black uppercase text-slate-500 flex items-center text-left"><LayoutGrid className="w-4 h-4 mr-2" /> {title}</h3>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-[9px] font-black uppercase text-left">
        <div className="flex items-center space-x-2 text-left"><div className="w-2.5 h-2.5 bg-[#cc4c4c]" /><span>Labor</span></div>
        <div className="flex items-center space-x-2 text-left"><div className="w-2.5 h-2.5 bg-[#4c4ccc]" /><span>Home Cap</span></div>
        <div className="flex items-center space-x-2 text-left"><div className="w-2.5 h-2.5 bg-[#4ccc4c]" /><span>Foreign Cap</span></div>
        <div className="flex items-center space-x-2 text-left"><div className="w-2.5 h-2.5 bg-[#404040]" /><span>Gov Rev</span></div>
      </div>
    </div>
    <div className={`grid grid-cols-1 ${labels.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-6 text-left`}>
      {labels.map((label, cIdx) => (
        <div key={label} className="space-y-2 text-center text-left">
          <div className="text-[10px] font-bold text-slate-400 uppercase text-left">{label}</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={data.map(h => { 
              const parts = h.gni_parts[cIdx];
              const total = Math.max(parts.labor + parts.dom_cap + parts.for_cap + parts.gov, EPS);
              return { t: h.t, labor: parts.labor/total*100, dom: parts.dom_cap/total*100, for: parts.for_cap/total*100, gov: parts.gov/total*100 }; 
            })} margin={{ left: -30, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" hide /><YAxis fontSize={8} domain={[0, 100]} ticks={[0, 50, 100]} />
              <Area type="monotone" dataKey="labor" stackId="1" stroke="#cc4c4c" fill="#cc4c4c" isAnimationActive={false} />
              <Area type="monotone" dataKey="dom" stackId="1" stroke="#4c4ccc" fill="#4c4ccc" isAnimationActive={false} />
              <Area type="monotone" dataKey="for" stackId="1" stroke="#4ccc4c" fill="#4ccc4c" isAnimationActive={false} />
              <Area type="monotone" dataKey="gov" stackId="1" stroke="#404040" fill="#404040" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  </div>
);

// --- MAIN APP ---
const MODE_PRESETS = {
  '2C': { target_y_ratio_A: 1.5, target_y_ratio_B: 1.5, L_ratio_A: 5.0, L_ratio_B: 2.5, g1: 0.012, g2: 0.005, g3: 0.001, theta: 0.0, lambda: 0.0, periods: 25, tau1: 0, tau2: 0, tau3: 0 },
  '3C': { target_y_ratio_A: 2.0, target_y_ratio_B: 1.5, L_ratio_A: 5.0, L_ratio_B: 3.0, g1: 0.012, g2: 0.005, g3: 0.001, theta: 0.0, lambda: 0.0, periods: 25, tau1: 0, tau2: 0, tau3: 0.02 }
};

const App = () => {
  const [mode, setMode] = useState('3C');
  const [activeParamCategory, setActiveParamCategory] = useState('temporal');
  const [params, setParams] = useState({
    sigma: 0.4, delta: 0.05, phi: 0.25, gamma: 0.33, r_target: 0.02, 
    l: 3, ...MODE_PRESETS['3C']
  });

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setParams(prev => ({ ...prev, ...MODE_PRESETS[nextMode] }));
  };

  const { data, growth, span } = useMemo(() => runSim(mode, params), [mode, params]);

  const chartDefs = useMemo(() => {
    const list = [
      { title: "1. Adoption Path (β)", lines: [{ k: "beta1", c: "#2563eb" }, { k: "beta2", c: "#dc2626" }, { k: "beta3", c: "#16a34a" }], desc: "Logistic diffusion starting exactly at β₀." },
      { title: "2. Output Index (Y)", lines: [{ k: "y1", c: "#2563eb" }, { k: "y2", c: "#dc2626" }, { k: "y3", c: "#16a34a" }], desc: "Real GDP per capita indexed to period 0." },
      { title: "3. Realized Returns (%)", lines: [{ k: "r1", c: "#2563eb" }, { k: "r2", c: "#dc2626" }, { k: "r3", c: "#16a34a" }], desc: "Net private return after AI capture and depreciation." },
      { title: "4. Global AI Revenue (% NI)", lines: [{ k: "aiGlobal", c: "#404040" }], desc: "Global monopoly rents as % of world national income." },
      ...(mode === '2C' ? [{ title: "5. Wealth Share % (p.c.)", lines: [{ k: "sh1", c: "#2563eb" }], desc: "Leader share of global per-capita wealth." }] : [{ title: "5. Wealth Share % (p.c.)", lines: [{ k: "sh1", c: "#2563eb" }, { k: "sh2", c: "#dc2626" }, { k: "sh3", c: "#16a34a" }], desc: "Share of global per-capita wealth." }]),
      { title: "6. Output Shares (L/K/AI)", lines: [
        { k: "outLab1", c: "#2563eb" }, { k: "outLab2", c: "#dc2626" }, { k: "outLab3", c: "#16a34a" },
        { k: "outCap1", c: "#2563eb", d: "6 4" }, { k: "outCap2", c: "#dc2626", d: "6 4" }, { k: "outCap3", c: "#16a34a", d: "6 4" },
        { k: "outAi1", c: "#2563eb", d: "2 3" }, { k: "outAi2", c: "#dc2626", d: "2 3" }, { k: "outAi3", c: "#16a34a", d: "2 3" }
      ], desc: "Output decomposition: Labor (solid), Capital (dashed), AI (dotted)." },
      ...(mode === '2C' ? [{ title: "7. Starvation Gap (%)", lines: [{ k: "sg2", c: "#dc2626" }], ref: 0, desc: "Follower capital deficiency relative to the frontier." }] : [{ title: "7. Starvation Gap (%)", lines: [{ k: "sg1", c: "#2563eb" }, { k: "sg2", c: "#dc2626" }, { k: "sg3", c: "#16a34a" }], ref: 0, desc: "Capital deficiency relative to the frontier." }]),
      { title: "8. National Income Index", lines: [{ k: "gni1", c: "#2563eb" }, { k: "gni2", c: "#dc2626" }, { k: "gni3", c: "#16a34a" }], desc: "Total National Income (GNI) indexed to t=0." },
      { title: "9. Rentier Index", lines: [{ k: "rent1", c: "#2563eb" }, { k: "rent2", c: "#dc2626" }, { k: "rent3", c: "#16a34a" }], desc: "% of income from foreign capital returns." },
      { title: "10. R - G (%)", lines: [{ k: "rg1", c: "#2563eb" }, { k: "rg2", c: "#dc2626" }, { k: "rg3", c: "#16a34a" }], ref: 0, desc: "Gap between private returns and output growth." },
      { title: "11. Offshore Capital %", lines: [{ k: "off1", c: "#2563eb" }, { k: "off2", c: "#dc2626" }, { k: "off3", c: "#16a34a" }], desc: "% of domestic wealth invested abroad." },
      { title: "12. MPL vs MPL Private", lines: [
        { k: "mpl1", c: "#2563eb" }, { k: "mpl2", c: "#dc2626" }, { k: "mpl3", c: "#16a34a" },
        { k: "mplp1", c: "#2563eb", d: "6 4" }, { k: "mplp2", c: "#dc2626", d: "6 4" }, { k: "mplp3", c: "#16a34a", d: "6 4" }
      ], desc: "Physical MPL (solid) vs Private MPL (dashed)." },
      { title: "13. Growth Rate: AI vs No-AI", lines: [
        { k: "ga1", c: "#2563eb" }, { k: "ga2", c: "#dc2626" }, { k: "ga3", c: "#16a34a" },
        { k: "gn1", c: "#2563eb", d: "6 4" }, { k: "gn2", c: "#dc2626", d: "6 4" }, { k: "gn3", c: "#16a34a", d: "6 4" }
      ], desc: "Log growth with AI (solid) vs counterfactual (dashed)." }
    ];
    return list.map(c => ({
      ...c,
      lines: c.lines.filter(l => mode === '3C' || !l.k.endsWith('3'))
    }));
  }, [mode]);

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900 text-[11px]">
      <aside className="w-80 bg-white border-r border-slate-300 flex flex-col shadow-xl z-20 overflow-y-auto pb-20 text-left">
        <div className="p-4 border-b border-slate-200 bg-slate-900 text-white font-black uppercase tracking-widest text-[11px] flex items-center space-x-2 text-left">
          <Globe className="w-5 h-5 text-blue-400" /><span>Sim Engine v1.8.3</span>
        </div>
        <div className="p-5 space-y-6 text-left">
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
            <button onClick={() => switchMode('2C')} className={`py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${mode === '2C' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>2-Country</button>
            <button onClick={() => switchMode('3C')} className={`py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${mode === '3C' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>3-Country</button>
          </div>
          <div className="pt-2 space-y-4">
            <div className="bg-indigo-50/70 p-4 rounded-xl border border-indigo-100 space-y-4 text-left">
              <div className="flex items-center space-x-2 text-indigo-700 font-black text-[10px] uppercase"><Zap className="w-4 h-4" /><span>Core Logic</span></div>
              <ParamSlider label="Theta" val={params.theta} min={0} max={1} step={0.01} onChange={v => setParams({...params, theta:v})} desc="Gap Between Countries: Scales the adoption lag across borders." />
              <ParamSlider label="Lambda" val={params.lambda} min={0} max={1} step={0.01} onChange={v => setParams({...params, lambda:v})} desc="Value Capture: Percentage of added value captured by AI providers." />
            </div>
          </div>
          <div className="space-y-3 pt-2 border-t border-slate-100 text-left">
            <div className="relative">
              <select value={activeParamCategory} onChange={(e) => setActiveParamCategory(e.target.value)} className="w-full p-2 text-xs font-black uppercase border border-slate-200 rounded-lg appearance-none bg-white pr-10 cursor-pointer shadow-sm text-left">
                <option value="temporal">Temporal Setup</option>
                <option value="size">Size and Calibration</option>
                <option value="frictions">Capital Controls</option>
                <option value="growth">Growth Rates</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            <div className="bg-slate-50 p-4 rounded-xl space-y-5 border border-slate-200 shadow-sm text-left">
              {activeParamCategory === 'temporal' && (<>
                <ParamSlider label="Gestation Lag (l)" val={params.l} min={1} max={5} step={1} onChange={v => setParams({...params, l: v})} desc="Production Delay: Years required for investment to become productive capital." />
                <ParamSlider label="Periods" val={params.periods} min={10} max={100} step={1} onChange={v => setParams({...params, periods: v})} desc="Horizon Length: Total duration of the simulation in years." />
              </>)}
              {activeParamCategory === 'size' && (<>
                <ParamSlider label="Target Ratio (A)" val={params.target_y_ratio_A} min={1} max={5} step={0.1} onChange={v => setParams({...params, target_y_ratio_A: v})} desc="Relative GDP (Leader): Target initial per-capita output ratio." />
                {mode === '3C' && <ParamSlider label="Target Ratio (B)" val={params.target_y_ratio_B} min={1} max={5} step={0.1} onChange={v => setParams({...params, target_y_ratio_B: v})} desc="Relative GDP (Follower): Target initial per-capita output ratio." />}
                <ParamSlider label="Labour Ratio (A)" val={params.L_ratio_A} min={1} max={10} step={0.1} onChange={v => setParams({...params, L_ratio_A: v})} desc="Labor Pool (Leader): Relative size of labor force." />
                <ParamSlider label="Labour Ratio (B)" val={params.L_ratio_B} min={0.1} max={10} step={0.1} onChange={v => setParams({...params, L_ratio_B: v})} desc="Labor Pool (Follower): Relative size of labor force." />
              </>)}
              {activeParamCategory === 'frictions' && (<>
                <ParamSlider label="Resid. Tax (Leader)" val={params.tau1} min={0} max={0.1} step={0.001} onChange={v => setParams({...params, tau1: v})} desc="Residence Tax (A): Friction rate on offshore wealth." />
                <ParamSlider label="Resid. Tax (Follower)" val={params.tau2} min={0} max={0.1} step={0.001} onChange={v => setParams({...params, tau2: v})} desc="Residence Tax (B): Friction rate on offshore wealth." />
                {mode === '3C' && <ParamSlider label="Resid. Tax (Slow Adopter)" val={params.tau3} min={0} max={0.1} step={0.001} onChange={v => setParams({...params, tau3: v})} desc="Residence Tax (C): Friction rate on offshore wealth." />}
              </>)}
              {activeParamCategory === 'growth' && (<>
                <ParamSlider label="Growth Leader" val={params.g1} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, g1: v})} desc="Base Growth (A): Long-run productivity rate excluding AI." />
                <ParamSlider label="Growth Follower" val={params.g2} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, g2: v})} desc="Base Growth (B): Long-run productivity rate excluding AI." />
                {mode === '3C' && <ParamSlider label="Growth Slow Adopter" val={params.g3} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, g3: v})} desc="Base Growth (C): Long-run productivity rate excluding AI." />}
              </>)}
            </div>
          </div>
          <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-100 shadow-inner space-y-4 text-left">
            <div className="flex items-center space-x-2 text-emerald-600 font-black text-[10px] uppercase"><TrendingUp className="w-4 h-4" /><span>Annualized Growth (Y)</span></div>
            {growth.map(g => (
              <div key={g.label} className="flex justify-between items-center text-[10px] font-black border-b border-emerald-100/50 pb-1">
                <span className="text-slate-500 uppercase">{g.label}</span><span className="text-emerald-700 font-mono">{(g.val*100).toFixed(2)}%</span>
              </div>
            ))}
            <p className="text-[7.5px] text-slate-400 font-bold leading-tight uppercase">Computed over {span} yearly intervals.</p>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-10 bg-white border-b border-slate-300 px-6 flex items-center justify-between shadow-sm shrink-0">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em]">International Capital Dynamics - AI Rents Mode</h2>
          <div className="flex items-center space-x-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100"><Activity className="w-3 h-3" /><span className="text-[9px] font-black uppercase">{mode} DYNAMICS</span></div>
        </header>
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth text-left text-left text-left">
          <div className="bg-white border border-slate-300 p-5 rounded-sm shadow-sm flex flex-col gap-4 lg:flex-row lg:items-start text-left">
            <div className="bg-indigo-600 p-2 rounded text-white w-fit"><Info className="w-4 h-4" /></div>
            <div className="flex-1 text-[11px] text-slate-600 leading-relaxed max-w-4xl text-left">
              <h3 className="text-[10px] font-black uppercase text-slate-800 tracking-widest mb-2">AI Rents suite</h3>
              <span className="text-left">Synchronized with <i>two_country_simple.m</i> and <i>three_country_simple.m</i>. The engine uses calibrated savings rules, a full dynamic no-AI baseline, and residence-based tax frictions.</span>
            </div>
            <div className="flex flex-col space-y-3 lg:pl-6 lg:border-l border-slate-100 shrink-0 text-left">
              <div className="flex items-center space-x-3 text-left"><svg width="24" height="2"><line x1="0" y1="1" x2="24" y2="1" stroke="#2563eb" strokeWidth="2.5" /></svg><span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Leader</span></div>
              <div className="flex items-center space-x-3 text-left"><svg width="24" height="2"><line x1="0" y1="1" x2="24" y2="1" stroke="#dc2626" strokeWidth="2.5" /></svg><span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Follower</span></div>
              {mode === '3C' && <div className="flex items-center space-x-3 text-left text-left"><svg width="24" height="2"><line x1="0" y1="1" x2="24" y2="1" stroke="#16a34a" strokeWidth="2.5" /></svg><span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Slow Adopter</span></div>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 text-left">
            {chartDefs.map((chart, i) => (
              <ChartBlock key={i} title={chart.title} desc={chart.desc}>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={data} margin={{ left: -30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="t" fontSize={8} />
                    <YAxis fontSize={8} tickFormatter={t => t.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
                    <Tooltip content={<CustomTooltip />} />
                    {chart.ref !== undefined && <ReferenceLine y={chart.ref} stroke="#94a3b8" />}
                    {chart.lines.map((l, li) => (
                      <Line key={`${l.k}-${li}`} type="monotone" dataKey={l.k} stroke={l.c} strokeWidth={2} strokeDasharray={l.d} dot={false} isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartBlock>
            ))}
          </div>
          <DecompositionSection title="GNI Decomposition (Figure 2)" labels={mode === '2C' ? ['Leader', 'Follower'] : ['Leader', 'Follower', 'Slow Adopter']} data={data} />
        </div>
      </main>
    </div>
  );
};

export default App;