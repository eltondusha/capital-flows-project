import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, AreaChart, Area, ReferenceArea
} from 'recharts';
import {
  Globe, Activity, TrendingUp, Zap, Info, LayoutGrid, ChevronDown
} from 'lucide-react';

/**
 * VERSION 1.1.4 - UI & LOGIC PATCH
 * - Fixed visibility of 'Abstract' button text
 * - Fixed Y-Axis for GNI Decomposition (explicit 0-100 scale)
 * - Restored Growth Rate parameter sliders and explanations
 * - Added dropdown arrow to category selector
 */

// --- DATA & CONSTANTS ---
const COUNTRY_DATA = {
  'USA': { pop: 335, gdp_pc: 80000, name: 'United States' },
  'CHN': { pop: 1410, gdp_pc: 12500, name: 'China' },
  'DEU': { pop: 84, gdp_pc: 52000, name: 'Germany' },
  'IND': { pop: 1430, gdp_pc: 2500, name: 'India' },
  'BRA': { pop: 215, gdp_pc: 9000, name: 'Brazil' },
  'JPN': { pop: 125, gdp_pc: 34000, name: 'Japan' },
  'GBR': { pop: 67, gdp_pc: 46000, name: 'United Kingdom' },
  'FRA': { pop: 68, gdp_pc: 41000, name: 'France' },
  'NGA': { pop: 220, gdp_pc: 2200, name: 'Nigeria' },
  'IDN': { pop: 275, gdp_pc: 4500, name: 'Indonesia' },
  'ROW': { pop: 3500, gdp_pc: 5000, name: 'Rest of World' } 
};

const SCENARIOS = [
  { id: 'hype', name: 'Scenario 1: Hype' },
  { id: 'tidal', name: 'Scenario 2: Tidal Flow' },
  { id: 'logjam', name: 'Scenario 3: Logjam' },
  { id: 'gulf', name: 'Scenario 4: The Gulf' }
];

// --- NUMERICAL UTILITIES ---
const bisect_root = (func, low, high, tol = 1e-10, max_iters = 100) => {
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
    else { high = mid; }
  }
  return mid;
};

// --- MATH ENGINE ---
const get_y = (k, bt, rho, gamma, A, L) => {
  const k_eff = Math.max(k, 1e-12);
  const task_agg = Math.max(1e-12, Math.pow(bt, 1 - rho) * Math.pow(k_eff, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho));
  return A * Math.pow(k_eff, gamma) * Math.pow(task_agg, (1 - gamma) / rho);
};

const get_r = (k, bt, rho, gamma, A, L, delta) => {
  const k_eff = Math.max(k, 1e-12);
  const task_agg = Math.max(1e-12, Math.pow(bt, 1 - rho) * Math.pow(k_eff, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho));
  const share = (Math.pow(bt, 1 - rho) * Math.pow(k_eff, rho)) / task_agg;
  const y_over_k = get_y(k_eff, bt, rho, gamma, A, L) / k_eff;
  return (gamma + (1 - gamma) * share) * y_over_k - delta;
};

const net_return = (owner, loc, K_loc, bt, delta, A, L, gamma, rho, w_vec, tau_vec) => {
  const phys_r = get_r(K_loc, bt[loc], rho, gamma, A[loc], L[loc], delta);
  return owner === loc ? phys_r : phys_r - w_vec[loc] - tau_vec[owner];
};

const solve_market = (V_vec, bt, delta, A, L, gamma, rho, w_vec, tau_vec, P_init = null) => {
  const n = V_vec.length;
  let P = Array.from({ length: n }, (_, i) => {
    let row = Array(n).fill(0);
    if (P_init && P_init[i]) {
      const sum = P_init[i].reduce((a, b) => a + b, 0);
      row = P_init[i].map(v => sum > 0 ? v * (V_vec[i] / sum) : 0);
    } else { row[i] = V_vec[i]; }
    return row;
  });
  const max_outer = 150;
  const tol_move = 1e-9;
  for (let outer = 0; outer < max_outer; outer++) {
    let best_gap = tol_move;
    let best_i = -1, best_a = -1, best_b = -1;
    let K = Array(n).fill(0).map((_, j) => P.reduce((sum, row) => sum + row[j], 0));
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < n; a++) {
        if (P[i][a] <= tol_move) continue;
        const ret_a = net_return(i, a, K[a], bt, delta, A, L, gamma, rho, w_vec, tau_vec);
        for (let b = 0; b < n; b++) {
          if (a === b) continue;
          const ret_b = net_return(i, b, K[b], bt, delta, A, L, gamma, rho, w_vec, tau_vec);
          const gap = ret_b - ret_a;
          if (gap > best_gap) { best_gap = gap; best_i = i; best_a = a; best_b = b; }
        }
      }
    }
    if (best_i === -1) break;
    const max_val = P[best_i][best_a];
    const f = (x) => net_return(best_i, best_b, K[best_b] + x, bt, delta, A, L, gamma, rho, w_vec, tau_vec) -
                     net_return(best_i, best_a, K[best_a] - x, bt, delta, A, L, gamma, rho, w_vec, tau_vec);
    let x_star = (f(max_val) >= 0) ? max_val : bisect_root(f, 0, max_val, 1e-11);
    P[best_i][best_a] -= x_star;
    P[best_i][best_b] += x_star;
  }
  return { P, K: Array(n).fill(0).map((_, j) => P.reduce((sum, row) => sum + row[j], 0)) };
};

// --- UI COMPONENTS ---
const VisualLegendItem = ({ color, label, type }) => (
  <div className="flex items-center space-x-3">
    <svg width="24" height="2" className="overflow-visible">
      <line x1="0" y1="1" x2="24" y2="1" stroke={color} strokeWidth="2.5" strokeDasharray={type === 'dashed' ? "4 2" : type === 'short-dash' ? "2 2" : "0"} />
    </svg>
    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">{label}</span>
  </div>
);

const ParamSlider = ({ label, val, min, max, step, onChange, icon, desc, disabled }) => (
  <div className={`space-y-2 animate-in fade-in slide-in-from-left-2 duration-300 ${disabled ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
    <div className="flex justify-between items-center text-[9px] font-black text-slate-600 tracking-tight text-left">
      <div className="flex items-center space-x-1">{icon}<span>{label.toUpperCase()}</span></div>
      <span className="font-mono text-blue-700 bg-blue-100/50 px-1.5 py-0.5 rounded-md border border-blue-200/50">{val}</span>
    </div>
    <div className="relative flex items-center h-5">
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 shadow-sm" />
    </div>
    {desc && <p className="text-[8.5px] text-slate-400 font-bold italic leading-tight tracking-tight pl-1 text-left">{desc}</p>}
  </div>
);

const ChartBlock = ({ title, children, desc }) => (
  <div className="bg-white p-3 border border-slate-300 shadow-sm rounded-sm flex flex-col h-full overflow-hidden text-center text-left">
    <div className="text-[8px] font-black text-slate-500 uppercase tracking-tighter mb-2 flex justify-between border-b border-slate-50 pb-1">{title}</div>
    <div className="flex-1 min-h-[100px]">{children}</div>
    {desc && <p className="mt-2 text-[7px] text-slate-400 font-bold uppercase border-t border-slate-50 pt-1 tracking-tight leading-tight">{desc}</p>}
  </div>
);

const formatYAxis = (tick) => {
  if (Math.abs(tick) < 0.001 && tick !== 0) return tick.toExponential(1);
  return tick.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-300 p-2 text-[9px] font-bold shadow-xl text-left">
        <div className="mb-1 text-slate-400 uppercase tracking-widest border-b pb-1">Period {label}</div>
        {payload.map((entry, i) => (
          <div key={i} className="flex justify-between space-x-4">
            <span style={{ color: entry.color }}>{entry.name || entry.dataKey}:</span>
            <span className="font-mono">{entry.value.toFixed(3)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// --- MAIN APP ---
const App = () => {
  const [mode, setMode] = useState('3C'); 
  const [calibrationMode, setCalibrationMode] = useState('abstract'); 
  const [activeScenario, setActiveScenario] = useState('tidal');
  const [activeParamCategory, setActiveParamCategory] = useState('temporal');
  const [leaderCode, setLeaderCode] = useState('USA');
  const [followerCode, setFollowerCode] = useState('CHN');

  const [params, setParams] = useState({
    sigma: 0.4, delta: 0.05, phi: 0.25, gamma: 0.33,
    r_target: 0.04, l: 3, periods: 40,
    target_y_ratio_A: 2.0, target_y_ratio_B: 1.5,
    L_ratio_A: 5.0, L_ratio_B: 3.0,
    w1: 0.001, w2: 0.001, w3: 0.000,
    tau1: 0.0, tau2: 0.001, tau3: 0.001,
    g1: 0, g2: 0, g3: 0,
    hype_realized_max: 0.1, hype_perc_peak: 0.40, hype_trough_depth: 0.05,
    tidal_max: 0.50, tidal_lag_B: 10, tidal_midpoint: 15, tidal_steepness: 0.45,
    logjam_max: 0.50, logjam_lag_B: 8, logjam_mid1: 8, logjam_plateau: 8,
    gulf_max: 0.90, gulf_leakage_B: 0.10, gulf_leakage_C: 0.02, gulf_mid1: 10, gulf_plateau_gap: 10
  });

  const simulationResults = useMemo(() => {
    const { 
      sigma, delta, phi, gamma, r_target, l, w1, w2, w3, tau1, tau2, tau3, periods: T_sim,
      target_y_ratio_A, target_y_ratio_B, L_ratio_A, L_ratio_B, g1, g2, g3,
      hype_realized_max, hype_perc_peak, hype_trough_depth,
      tidal_max, tidal_lag_B, tidal_midpoint, tidal_steepness,
      logjam_max, logjam_lag_B, logjam_mid1, logjam_plateau,
      gulf_max, gulf_leakage_B, gulf_leakage_C, gulf_mid1, gulf_plateau_gap
    } = params;

    const rho = (sigma - 1) / sigma;
    const T_full = 100;
    const n = mode === '2C' ? 2 : 3;
    const b_start = 0.001;

    let L_vec, final_y_ratio_A, final_y_ratio_B;
    if (calibrationMode === 'real') {
      const leader = COUNTRY_DATA[leaderCode];
      const follower = COUNTRY_DATA[followerCode];
      const row = COUNTRY_DATA['ROW'];
      L_vec = n === 2 ? [leader.pop/row.pop, follower.pop/row.pop] : [leader.pop/row.pop, follower.pop/row.pop, 1.0];
      final_y_ratio_A = leader.gdp_pc / row.gdp_pc;
      final_y_ratio_B = follower.gdp_pc / row.gdp_pc;
    } else {
      L_vec = n === 2 ? [L_ratio_A, L_ratio_B] : [L_ratio_A, L_ratio_B, 1.0];
      final_y_ratio_A = target_y_ratio_A;
      final_y_ratio_B = target_y_ratio_B;
    }

    const w_vec = n === 2 ? [w1, w2] : [w1, w2, w3];
    const tau_vec = n === 2 ? [tau1, tau2] : [tau1, tau2, tau3];

    // Calibration
    const A0_numeraire = 1.0;
    const k_ss_num = bisect_root((k) => get_r(k, b_start, rho, gamma, A0_numeraire, 1.0, delta) - r_target, 0.01, 1000);
    const y_ss_num = get_y(k_ss_num, b_start, rho, gamma, A0_numeraire, 1.0);
    const findA0 = (target_ratio) => {
      const target_y = y_ss_num * target_ratio;
      return bisect_root((a_guess) => {
        const k_local = bisect_root((k) => get_r(k, b_start, rho, gamma, a_guess, 1.0, delta) - r_target, 0.01, 2000);
        return get_y(k_local, b_start, rho, gamma, a_guess, 1.0) - target_y;
      }, 0.01, 50.0);
    };

    const A0_A = findA0(final_y_ratio_A);
    const A0_B = findA0(final_y_ratio_B);
    const A0_vec = n === 2 ? [A0_A, A0_numeraire] : [A0_A, A0_B, A0_numeraire];
    const K_init_pc = A0_vec.map(a => bisect_root((k) => get_r(k, b_start, rho, gamma, a, 1.0, delta) - r_target, 0.01, 2000));
    const s_base_vec = K_init_pc.map((ki, i) => (delta * ki) / Math.max(get_y(ki, b_start, rho, gamma, A0_vec[i], 1.0), 1e-12));

    const t_axis = Array.from({ length: T_full + 1 }, (_, i) => i);
    const beta_paths = Array.from({ length: n }, () => Array(T_full + 1).fill(b_start));
    let beta_perc_L = Array(T_full + 1).fill(b_start);

    // Scenario Paths
    if (activeScenario === 'hype') {
      const bL = t_axis.map(t => b_start + (hype_realized_max - b_start) / (1 + Math.exp(-0.8 * (t - 5))));
      const sp = t_axis.map(t => (1 / (1 + Math.exp(-2.5 * (t - 3)))) * (1 / (1 + Math.exp(1.8 * (t - 7)))));
      const st = t_axis.map(t => (1 / (1 + Math.exp(-1.2 * (t - 10)))) * (1 / (1 + Math.exp(0.6 * (t - 20)))));
      beta_paths[0] = bL; beta_paths[1] = [...bL]; if (n === 3) beta_paths[2] = Array(T_full+1).fill(b_start);
      beta_perc_L = bL.map((v, i) => Math.max(1e-6, v + (hype_perc_peak * sp[i]) - (hype_trough_depth * st[i])));
    } else if (activeScenario === 'tidal') {
      const bL = t_axis.map(t => b_start + tidal_max / (1 + Math.exp(-tidal_steepness * (t - tidal_midpoint))));
      beta_paths[0] = bL;
      beta_paths[1] = t_axis.map((_, t) => t < tidal_lag_B ? b_start : bL[Math.max(0, t - Math.round(tidal_lag_B))]);
      if (n === 3) beta_paths[2] = t_axis.map((_, t) => t < 2 * tidal_lag_B ? b_start : bL[Math.max(0, t - Math.round(2 * tidal_lag_B))]);
      beta_perc_L = [...bL];
    } else if (activeScenario === 'logjam') {
      const m2 = logjam_mid1 + logjam_plateau;
      const bL = t_axis.map(t => b_start + (0.2 / (1 + Math.exp(-0.8 * (t - logjam_mid1)))) + (logjam_max - 0.2) / (1 + Math.exp(-0.8 * (t - m2))));
      beta_paths[0] = bL;
      beta_paths[1] = t_axis.map((_, t) => t < logjam_lag_B ? b_start : bL[Math.max(0, t - Math.round(logjam_lag_B))]);
      if (n === 3) beta_paths[2] = t_axis.map((_, t) => t < 2 * logjam_lag_B ? b_start : bL[Math.max(0, t - Math.round(2 * logjam_lag_B))]);
      beta_perc_L = [...bL];
    } else {
      const gulf_mid2 = gulf_mid1 + gulf_plateau_gap + 5;
      const bL = t_axis.map(t => b_start + (0.4 / (1 + Math.exp(-0.8 * (t - gulf_mid1)))) + (gulf_max - 0.4) / (1 + Math.exp(-0.8 * (t - gulf_mid2))));
      beta_paths[0] = bL;
      beta_paths[1] = bL.map(v => b_start + (v - b_start) * gulf_leakage_B);
      if (n === 3) beta_paths[2] = bL.map(v => b_start + (v - b_start) * gulf_leakage_C);
      beta_perc_L = [...bL];
    }

    let P = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? K_init_pc[i] * L_vec[i] : 0)));
    const pipe = Array.from({ length: n }, (_, i) => Array(T_full + l + 11).fill(delta * K_init_pc[i] * L_vec[i]));
    const history = [];
    const b_paths_ext = beta_paths.map(p => [...p, ...Array(l + 10).fill(p[T_full])]);
    const b_perc_ext = [...beta_perc_L, ...Array(l + 10).fill(beta_perc_L[T_full])];
    const A_paths_ext = A0_vec.map((a0, i) => Array.from({ length: T_full + l + 11 }, (_, t) => a0 * Math.pow(1 + [g1, g2, g3][i], t)));

    for (let t = 0; t < T_sim; t++) {
      const K_curr = Array(n).fill(0).map((_, j) => P.reduce((sum, row) => sum + row[j], 0));
      const V_curr = P.map(row => row.reduce((a, b) => a + b, 0));
      
      let autarkyCount = 0;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (r !== c && Math.abs(P[r][c]) > 1e-8) autarkyCount++;
        }
      }
      const isAutarky = autarkyCount === 0;

      const bt_r = beta_paths.map(p => p[t]);
      const A_curr = A0_vec.map((a0, i) => a0 * Math.pow(1 + [g1, g2, g3][i], t));
      const Y = Array(n).fill(0).map((_, i) => get_y(K_curr[i], bt_r[i], rho, gamma, A_curr[i], L_vec[i]));
      const r_phys = Array(n).fill(0).map((_, i) => get_r(K_curr[i], bt_r[i], rho, gamma, A_curr[i], L_vec[i], delta));
      const shadow = solve_market(V_curr, Array(n).fill(Math.max(...bt_r)), delta, A_curr, L_vec, gamma, rho, w_vec, tau_vec);
      const starvation = shadow.K.map((kf, i) => (kf - K_curr[i]) / (kf + 1e-12));
      const labor_inc = Y.map((y, i) => y - (r_phys[i] + delta) * K_curr[i]);
      
      const GNI_parts = Array.from({length: n}, (_, owner) => {
        let dom = P[owner][owner] * r_phys[owner];
        let for_inc = 0;
        for (let loc = 0; loc < n; loc++) if (owner !== loc) for_inc += P[owner][loc] * (r_phys[loc] - w_vec[loc] - tau_vec[owner]);
        return { labor: labor_inc[owner]/L_vec[owner], dom_cap: dom/L_vec[owner], for_cap: for_inc/L_vec[owner] };
      });
      const GNI = labor_inc.map((li, i) => li + GNI_parts[i].dom_cap*L_vec[i] + GNI_parts[i].for_cap*L_vec[i]);
      const endPeriodRev = Array(n).fill(0).map((_, i) => (K_curr[i] - P[i][i]) * w_vec[i] + (V_curr[i] - P[i][i]) * tau_vec[i]);
      const offshore = V_curr.map((v, i) => (v - P[i][i]) / Math.max(v, 1e-12));

      if (t < T_sim - 1) {
        const idx_f = Math.min(T_full, t + l);
        const bt_f = b_paths_ext.map((p, i) => i === 0 ? b_perc_ext[idx_f] : p[idx_f]);
        const A_f = A_paths_ext.map(p => p[idx_f]);
        const V_fixed = V_curr.map((v) => v * Math.pow(1 - delta, l));
        let s_guess = s_base_vec;
        for (let iter = 0; iter < 10; iter++) {
          const V_proj = V_fixed.map((vf, i) => vf + s_guess[i] * GNI[i]);
          const future = solve_market(V_proj, bt_f, delta, A_f, L_vec, gamma, rho, w_vec, tau_vec);
          const r_phys_f = future.K.map((kf, i) => get_r(kf, bt_f[i], rho, gamma, A_f[i], L_vec[i], delta));
          const s_new = s_base_vec.map((sb, owner) => {
            let total_inc = 0;
            for (let loc = 0; loc < n; loc++) total_inc += future.P[owner][loc] * (owner === loc ? r_phys_f[loc] : r_phys_f[loc] - w_vec[loc] - tau_vec[owner]);
            return sb + phi * (total_inc / Math.max(V_proj[owner], 1e-12) - r_target);
          });
          if (s_new.every((v, i) => Math.abs(v - s_guess[i]) < 1e-5)) break;
          s_guess = s_new.map((v, i) => v * 0.5 + s_guess[i] * 0.5);
        }
        pipe.forEach((row, i) => { row[t + l] = s_guess[i] * GNI[i]; });
        P = P.map(row => row.map(v => v * (1 - delta)));
        for (let i = 0; i < n; i++) P[i][i] += pipe[i][t + 1];
        P = solve_market(P.map(r => r.reduce((a, b) => a + b, 0)), b_paths_ext.map(p => p[t + 1]), delta, A_paths_ext.map(p => p[t+1]), L_vec, gamma, rho, w_vec, tau_vec, P).P;
      }
      history.push({
        t, rawK: [...K_curr], rawRev: endPeriodRev, rawY: [...Y], rawGNI: [...GNI], isAutarky,
        beta1: bt_r[0], beta2: bt_r[1], beta3: n === 3 ? bt_r[2] : 0, betaP: activeScenario === 'hype' ? b_perc_ext[t] : null,
        r1: r_phys[0] * 100, r2: r_phys[1] * 100, r3: n === 3 ? r_phys[2] * 100 : 0,
        sh1: (V_curr[0]/L_vec[0]) / (V_curr.reduce((a,b,idx)=>a+(b/L_vec[idx]), 0) + 1e-12) * 100,
        sh2: (V_curr[1]/L_vec[1]) / (V_curr.reduce((a,b,idx)=>a+(b/L_vec[idx]), 0) + 1e-12) * 100,
        sh3: n === 3 ? (V_curr[2]/L_vec[2]) / (V_curr.reduce((a,b,idx)=>a+(b/L_vec[idx]), 0) + 1e-12) * 100 : 0,
        ls1: (labor_inc[0] / (GNI[0] || 1)) * 100, ls2: (labor_inc[1] / (GNI[1] || 1)) * 100, ls3: n === 3 ? (labor_inc[2] / (GNI[2] || 1)) * 100 : 0,
        sg2: starvation[1] * 100, sg3: n === 3 ? starvation[2] * 100 : 0,
        rent1: (GNI_parts[0].for_cap * L_vec[0] / (GNI[0] || 1)) * 100, rent2: (GNI_parts[1].for_cap * L_vec[1] / (GNI[1] || 1)) * 100, rent3: n === 3 ? (GNI_parts[2].for_cap * L_vec[2] / (GNI[2] || 1)) * 100 : 0,
        off1: offshore[0] * 100, off2: offshore[1] * 100, off3: n === 3 ? offshore[2] * 100 : 0,
        gni_parts: GNI_parts
      });
    }

    const h0 = history[0];
    return history.map(h => ({
      ...h,
      k1: (h.rawK[0] / (h0.rawK[0] || 1)) * 100, k2: (h.rawK[1] / (h0.rawK[1] || 1)) * 100, k3: n === 3 ? (h.rawK[2] / (h0.rawK[2] || 1)) * 100 : 0,
      rev1: (h.rawRev[0] / (h.rawGNI[0] || 1)) * 100, rev2: (h.rawRev[1] / (h.rawGNI[1] || 1)) * 100, rev3: n === 3 ? (h.rawRev[2] / (h.rawGNI[2] || 1)) * 100 : 0,
      y1: (h.rawY[0] / (h0.rawY[0] || 1)) * 100, y2: (h.rawY[1] / (h0.rawY[1] || 1)) * 100, y3: n === 3 ? (h.rawY[2] / (h0.rawY[2] || 1)) * 100 : 0,
      gni1: (h.rawGNI[0] / (h0.rawGNI[0] || 1)) * 100, gni2: (h.rawGNI[1] / (h0.rawGNI[1] || 1)) * 100, gni3: n === 3 ? (h.rawGNI[2] / (h0.rawGNI[2] || 1)) * 100 : 0
    }));
  }, [mode, activeScenario, params, calibrationMode, leaderCode, followerCode]);

  const autarkyBands = useMemo(() => {
    const bands = [];
    let start = null;
    simulationResults.forEach((d) => {
      if (d.isAutarky && start === null) start = d.t;
      else if (!d.isAutarky && start !== null) {
        bands.push({ x1: start, x2: d.t - 1 });
        start = null;
      }
    });
    if (start !== null) bands.push({ x1: start, x2: simulationResults[simulationResults.length - 1].t });
    return bands;
  }, [simulationResults]);

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900 text-[11px]">
      <aside className="w-80 bg-white border-r border-slate-300 flex flex-col shadow-xl z-20 overflow-y-auto scrollbar-hide pb-20 text-left">
        <div className="p-4 border-b border-slate-200 flex items-center space-x-3 bg-slate-900 text-white font-black uppercase tracking-widest text-[11px] shrink-0">
          <Globe className="w-5 h-5 text-blue-400" /><span>Sim Engine v1.1.4</span>
        </div>
        <div className="p-5 space-y-6">
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
            <button onClick={() => setCalibrationMode('abstract')} className={`py-1.5 text-[9px] font-black uppercase rounded-md transition-all ${calibrationMode === 'abstract' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Abstract</button>
            <button onClick={() => setCalibrationMode('real')} className={`py-1.5 text-[9px] font-black uppercase rounded-md transition-all ${calibrationMode === 'real' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Real-World</button>
          </div>
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
            <button onClick={() => setMode('2C')} className={`py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${mode === '2C' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>2-Country</button>
            <button onClick={() => setMode('3C')} className={`py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${mode === '3C' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>3-Country</button>
          </div>
          <div className="space-y-1 pt-4">
             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active Scenario</label>
             <div className="grid grid-cols-1 gap-2">{SCENARIOS.map(s => (
                <button key={s.id} onClick={() => setActiveScenario(s.id)} className={`w-full p-2.5 text-left rounded-lg border text-[10px] font-bold transition-all ${activeScenario === s.id ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>{s.name.toUpperCase()}</button>
              ))}</div>
          </div>
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="relative">
              <select value={activeParamCategory} onChange={(e) => setActiveParamCategory(e.target.value)} className="w-full p-2 text-xs font-black uppercase border border-slate-200 rounded-lg appearance-none bg-white pr-10 cursor-pointer shadow-sm">
                  <option value="temporal">Temporal Setup</option>
                  <option value="size">Size and Calibration</option>
                  <option value="frictions">Capital Controls</option>
                  <option value="growth">Growth Rates</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            <div className="bg-slate-50 p-4 rounded-xl space-y-5 border border-slate-200 shadow-sm text-left">
              {activeParamCategory === 'temporal' && (<><ParamSlider label="Gestation Lag" val={params.l} min={1} max={10} step={1} onChange={v => setParams({...params, l: v})} desc="Years for capital to become productive." /><ParamSlider label="Sim Periods" val={params.periods} min={20} max={60} step={1} onChange={v => setParams({...params, periods: v})} /></>)}
              {activeParamCategory === 'size' && (<>
                  <ParamSlider label="Target Leader" val={params.target_y_ratio_A} min={1} max={5} step={0.1} disabled={calibrationMode === 'real'} onChange={v => setParams({...params, target_y_ratio_A: v})} desc="Output index relative to ROW." />
                  {mode === '3C' && <ParamSlider label="Target Follower" val={params.target_y_ratio_B} min={1} max={4} step={0.1} disabled={calibrationMode === 'real'} onChange={v => setParams({...params, target_y_ratio_B: v})} desc="Output index relative to ROW." />}
                  <ParamSlider label="Labour Ratio Leader" val={params.L_ratio_A} min={1} max={10} step={0.1} disabled={calibrationMode === 'real'} onChange={v => setParams({...params, L_ratio_A: v})} desc="Labour size relative to ROW." />
                  <ParamSlider label="Labour Ratio Follower" val={params.L_ratio_B} min={1} max={10} step={0.1} disabled={calibrationMode === 'real'} onChange={v => setParams({...params, L_ratio_B: v})} desc="Labour size relative to ROW." />
                </>)}
              {activeParamCategory === 'frictions' && (<>
                  <ParamSlider label="Source Tax Leader" val={params.w1} min={0} max={0.1} step={0.001} onChange={v => setParams({...params, w1: v})} desc="Tax on incoming foreign capital." />
                  <ParamSlider label="Source Tax Follower" val={params.w2} min={0} max={0.1} step={0.001} onChange={v => setParams({...params, w2: v})} desc="Tax on incoming foreign capital." />
                  {mode === '3C' && <ParamSlider label="Source Tax ROW" val={params.w3} min={0} max={0.1} step={0.001} onChange={v => setParams({...params, w3: v})} desc="Tax on incoming foreign capital." />}
                  <ParamSlider label="Resid. Tax Leader" val={params.tau1} min={0} max={0.1} step={0.001} onChange={v => setParams({...params, tau1: v})} desc="Tax on own residents' foreign profit." />
                  <ParamSlider label="Resid. Tax Follower" val={params.tau2} min={0} max={0.1} step={0.001} onChange={v => setParams({...params, tau2: v})} desc="Tax on own residents' foreign profit." />
                  {mode === '3C' && <ParamSlider label="Resid. Tax ROW" val={params.tau3} min={0} max={0.1} step={0.001} onChange={v => setParams({...params, tau3: v})} desc="Tax on own residents' foreign profit." />}
                </>)}
              {activeParamCategory === 'growth' && (<>
                  <ParamSlider label="Growth Leader" val={params.g1} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, g1: v})} desc="Leader benchmark productivity growth." />
                  <ParamSlider label="Growth Follower" val={params.g2} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, g2: v})} desc="Follower benchmark productivity growth." />
                  {mode === '3C' && <ParamSlider label="Growth ROW" val={params.g3} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, g3: v})} desc="Laggard benchmark productivity growth." />}
                </>)}
            </div>
          </div>
          <div className="pt-4 border-t border-slate-100">
            <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-100/80 shadow-inner space-y-4 text-left">
              <div className="flex items-center space-x-2.5 pb-2 border-b border-amber-100"><Zap className="w-4 h-4 text-amber-500" /><span className="text-[10px] font-black uppercase text-slate-500">Scenario Logic</span></div>
              {activeScenario === 'hype' && (<><ParamSlider label="Realized Max" val={params.hype_realized_max} min={0.01} max={0.3} step={0.01} onChange={v => setParams({...params, hype_realized_max: v})} desc="The true long-term automation level." /><ParamSlider label="Peak Perception" val={params.hype_perc_peak} min={0.1} max={0.8} step={0.05} onChange={v => setParams({...params, hype_perc_peak: v})} desc="Level of market over-optimism." /><ParamSlider label="Trough Depth" val={params.hype_trough_depth} min={0} max={0.2} step={0.01} onChange={v => setParams({...params, hype_trough_depth: v})} desc="Severity of correction post-bubble." /></>)}
              {activeScenario === 'tidal' && (<><ParamSlider label="Saturation" val={params.tidal_max} min={0.1} max={0.9} step={0.05} onChange={v => setParams({...params, tidal_max: v})} desc="Maximum tech adoption ceiling." /><ParamSlider label="Follower Lag" val={params.tidal_lag_B} min={0} max={20} step={1} onChange={v => setParams({...params, tidal_lag_B: v})} desc="Years before Follower implementation." /><ParamSlider label="Diffusion Steepness" val={params.tidal_steepness} min={0.1} max={0.8} step={0.05} onChange={v => setParams({...params, tidal_steepness: v})} desc="Speed of tech catch-up wave." /></>)}
              {activeScenario === 'logjam' && (<><ParamSlider label="Saturation" val={params.logjam_max} min={0.1} max={0.9} step={0.05} onChange={v => setParams({...params, logjam_max: v})} desc="Final ceiling for machine tasks." /><ParamSlider label="Plateau Duration" val={params.logjam_plateau} min={2} max={15} step={1} onChange={v => setParams({...params, logjam_plateau: v})} desc="Years of stall due to regulations." /></>)}
              {activeScenario === 'gulf' && (<><ParamSlider label="Max Saturation" val={params.gulf_max} min={0.5} max={1.0} step={0.05} onChange={v => setParams({...params, gulf_max: v})} desc="Frontier adoption ceiling." /><ParamSlider label="Leakage Follower" val={params.gulf_leakage_B} min={0} max={0.5} step={0.01} onChange={v => setParams({...params, gulf_leakage_B: v})} desc="% of frontier tech available to Follower." />{mode === '3C' && <ParamSlider label="Leakage ROW" val={params.gulf_leakage_C} min={0} max={0.2} step={0.01} onChange={v => setParams({...params, gulf_leakage_C: v})} desc="% available to Laggard." />}<ParamSlider label="Plateau Gap" val={params.gulf_plateau_gap} min={0} max={25} step={1} onChange={v => setParams({...params, gulf_plateau_gap: v})} desc="Years between breakthroughs." /></>)}
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-10 bg-white border-b border-slate-300 px-6 flex items-center justify-between shadow-sm shrink-0">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em]">Live Modeling Interface</h2>
          <div className="flex items-center space-x-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100"><Activity className="w-3 h-3" /><span className="text-[9px] font-black uppercase">{mode} DYNAMICS</span></div>
        </header>
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
          <div className="bg-white border border-slate-300 p-5 rounded-sm shadow-sm flex items-start space-x-4 shrink-0 text-left">
            <div className="bg-indigo-600 p-2 rounded text-white"><Info className="w-4 h-4" /></div>
            <div className="flex-1 text-[11px] text-slate-600 leading-relaxed max-w-4xl">
              <h3 className="text-[10px] font-black uppercase text-slate-800 tracking-widest mb-2">Model Context</h3>
              <span>This simulator models international capital flows triggered by asymmetric technological adoption. When a <span className="font-bold text-blue-600">Leader</span> automates tasks, its domestic returns surge, pulling investment away from other regions until technology diffuses.</span>
            </div>
            <div className="flex flex-col space-y-3 pl-6 border-l border-slate-100 shrink-0">
              <VisualLegendItem color="#2563eb" label="Leader" type="solid" /><VisualLegendItem color="#dc2626" label="Follower" type="solid" />{mode === '3C' && <VisualLegendItem color="#000000" label="Laggard" type="dashed" />}
              <div className="flex items-center space-x-3"><div className="w-6 h-2 bg-slate-200" /><span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Autarky</span></div>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {[ 
              { title: "Tech Adoption (β)", k: "beta1", k2: "beta2", k3: "beta3", h: "betaP" }, 
              { title: "Output Index (Y)", k: "y1", k2: "y2", k3: "y3" }, 
              { title: "Realized Returns (%)", k: "r1", k2: "r2", k3: "r3" }, 
              { title: "Wealth Share % (p.c.)", k: "sh1", k2: "sh2", k3: "sh3" }, 
              { title: "Labour Share GNI", k: "ls1", k2: "ls2", k3: "ls3" }, 
              { title: "Starvation Gap (%)", k: "sg2", k2: "sg3", ref: 0 }, 
              { title: "GNI Index", k: "gni1", k2: "gni2", k3: "gni3" }, 
              { title: "Rentier Index (% GNI)", k: "rent1", k2: "rent2", k3: "rent3" }, 
              { title: "Gov Revenue / GNI (%)", k: "rev1", k2: "rev2", k3: "rev3" }, 
              { title: "Offshore Capital (%)", k: "off1", k2: "off2", k3: "off3" }
            ].map((chart, i) => (
              <ChartBlock key={i} title={chart.title}>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={simulationResults} margin={{ left: -30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} tickFormatter={formatYAxis} /><Tooltip content={<CustomTooltip />} />
                    {autarkyBands.map((b, idx) => <ReferenceArea key={idx} x1={b.x1} x2={b.x2} fill="#94a3b8" fillOpacity={0.1} stroke="none" />)}
                    {chart.ref !== undefined && <ReferenceLine y={chart.ref} stroke="#94a3b8" />}
                    <Line type="monotone" dataKey={chart.k} stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey={chart.k2} stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false} />
                    {mode === '3C' && chart.k3 && <Line type="monotone" dataKey={chart.k3} stroke="#000000" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />}
                    {chart.h && <Line type="monotone" dataKey={chart.h} stroke="#2563eb" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />}
                  </LineChart>
                </ResponsiveContainer>
              </ChartBlock>
            ))}
          </div>
          <div className="bg-white p-6 border border-slate-300 rounded-sm shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b pb-4 shrink-0 text-left"><h3 className="text-xs font-black uppercase text-slate-500 flex items-center"><LayoutGrid className="w-4 h-4 mr-2" /> GNI Decomposition</h3>
              <div className="flex space-x-6">
                <div className="flex items-center space-x-2"><div className="w-2.5 h-2.5 bg-[#cc4c4c]" /><span className="text-[9px] font-black uppercase">Labor</span></div>
                <div className="flex items-center space-x-2"><div className="w-2.5 h-2.5 bg-[#4c4ccc]" /><span className="text-[9px] font-black uppercase">Home Capital</span></div>
                <div className="flex items-center space-x-2"><div className="w-2.5 h-2.5 bg-[#4ccc4c]" /><span className="text-[9px] font-black uppercase">Foreign Capital</span></div>
              </div>
            </div>
            <div className={`grid ${mode === '2C' ? 'grid-cols-2' : 'grid-cols-3'} gap-6`}>
              {[...Array(mode === '2C' ? 2 : 3)].map((_, c) => (
                <div key={c} className="space-y-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase text-center">{c === 0 ? "Leader" : (c === 1 ? "Follower" : "Laggard")}</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={simulationResults.map(h => { 
                      const parts = h.gni_parts[c];
                      const total = Math.max(parts.labor + parts.dom_cap + parts.for_cap, 1e-12);
                      return { t: h.t, labor: (parts.labor/total)*100, dom_cap: (parts.dom_cap/total)*100, for_cap: (parts.for_cap/total)*100 }; 
                    })} margin={{ left: -30 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="t" hide />
                      <YAxis fontSize={8} domain={[0, 100]} ticks={[0, 50, 100]} />
                      {autarkyBands.map((b, idx) => <ReferenceArea key={idx} x1={b.x1} x2={b.x2} fill="#000" fillOpacity={0.05} stroke="none" />)}
                      <Area type="monotone" dataKey="labor" stackId="1" stroke="#cc4c4c" fill="#cc4c4c" isAnimationActive={false} />
                      <Area type="monotone" dataKey="dom_cap" stackId="1" stroke="#4c4ccc" fill="#4c4ccc" isAnimationActive={false} />
                      <Area type="monotone" dataKey="for_cap" stackId="1" stroke="#4ccc4c" fill="#4ccc4c" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;