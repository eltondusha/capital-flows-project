import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, AreaChart, Area
} from 'recharts';
import {
  Globe, Activity, TrendingUp, Layers, RefreshCw,
  ChevronRight, Database, TrendingDown, BookOpen, Zap, Timer, PauseCircle, LayoutGrid, ChevronDown, Clock, Scale
} from 'lucide-react';

// --- ROBUST NUMERICAL UTILITIES ---

const fzero = (func, low, high, iterations = 80) => {
  let fLow = func(low);
  let fHigh = func(high);
  if (fLow * fHigh > 0) return Math.abs(fLow) < Math.abs(fHigh) ? low : high;
  let mid = 0;
  for (let i = 0; i < iterations; i++) {
    mid = (low + high) / 2;
    let fMid = func(mid);
    if (fMid * fLow <= 0) high = mid;
    else { low = mid; fLow = fMid; }
  }
  return mid;
};

// --- MATH ENGINE ---

const get_y = (k, bt, rho, gamma, A, L) => {
  const task_agg = Math.max(1e-12, Math.pow(bt, 1 - rho) * Math.pow(k, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho));
  return A * Math.pow(k, gamma) * Math.pow(task_agg, (1 - gamma) / rho);
};

const get_r = (k, bt, rho, gamma, A, L, delta) => {
  if (k <= 1e-12) return 0.5;
  const task_agg = Math.max(1e-12, Math.pow(bt, 1 - rho) * Math.pow(k, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho));
  const share = (Math.pow(bt, 1 - rho) * Math.pow(k, rho)) / task_agg;
  const y_over_k = get_y(k, bt, rho, gamma, A, L) / k;
  return (gamma + (1 - gamma) * share) * y_over_k - delta;
};

const solve_ki_for_r = (target_r, bt, delta, A, L, gamma, rho) => {
  return fzero((k) => get_r(k, bt, rho, gamma, A, L, delta) - target_r, 1e-6, 1e8);
};

// --- MARKET SOLVERS ---

const solve_3c_market = (V_vec, bt, delta, A, L, gamma, rho, w) => {
  const get_Ki = (r_ref) => {
    return V_vec.map((v, i) => {
      const r_at_v = get_r(v, bt[i], rho, gamma, A[i], L[i], delta);
      if (r_at_v > r_ref + w[i]) return solve_ki_for_r(r_ref + w[i], bt[i], delta, A[i], L[i], gamma, rho);
      if (r_at_v < r_ref) return solve_ki_for_r(r_ref, bt[i], delta, A[i], L[i], gamma, rho);
      return v;
    });
  };
  const V_tot = V_vec.reduce((a, b) => a + b, 0);
  const r_star = fzero((r) => get_Ki(r).reduce((a, b) => a + b, 0) - V_tot, -0.049, 10.0);
  return get_Ki(r_star);
};

const solve_2c_market = (V_vec, bt, delta, A, L, gamma, rho, w) => {
  const V_tot = V_vec[0] + V_vec[1];
  const get_r_net = (k, v, b_idx) => {
    const rr = get_r(k, bt[b_idx], rho, gamma, A[b_idx], L[b_idx], delta);
    const tax_weight = 1 / (1 + Math.exp(-(k - v) / (0.01 * v)));
    return rr - tax_weight * w[b_idx];
  };
  const ka_star = fzero((ka) => get_r_net(ka, V_vec[0], 0) - get_r_net(V_tot - ka, V_vec[1], 1), 1e-9 * V_tot, 0.999 * V_tot);
  return [ka_star, V_tot - ka_star];
};

const SCENARIOS = [
  { id: 'hype', name: 'Scenario 1: Hype Cycle' },
  { id: 'tidal', name: 'Scenario 2: Tidal Flow' },
  { id: 'logjam', name: 'Scenario 3: Logjam' },
  { id: 'gulf', name: 'Scenario 4: The Gulf' }
];

const App = () => {
  const [activeView, setActiveView] = useState('dashboard');
  const [mode, setMode] = useState('3C'); 
  const [activeScenario, setActiveScenario] = useState('tidal');
  const [activeParamCategory, setActiveParamCategory] = useState('temporal');
  
  const [params, setParams] = useState({
    sigma: 0.4, delta: 0.05, phi: 0.25, gamma: 0.33,
    r_target: 0.04, l: 3, periods: 40,
    ratiolAtoB: 2, target_y_ratio_A: 2.0, target_y_ratio_B: 1.5,
    g1: 0, g2: 0, g3: 0,
    w1: 0.008, w2: 0.005, w3: 0.005,
    hype_realized_max: 0.1, hype_perc_peak: 0.40, hype_trough_depth: 0.05,
    tidal_max: 0.50, tidal_lag_B: 10, tidal_midpoint: 15, tidal_steepness: 0.45,
    logjam_max: 0.50, logjam_lag_B: 8, logjam_mid1: 8, logjam_plateau_dur: 8,
    gulf_max: 0.90, gulf_plateau_gap: 10, gulf_leakage_B: 0.10, gulf_mid1: 10
  });

  const simulationResults = useMemo(() => {
    const { 
      sigma, delta, phi, gamma, r_target, l, g1, g2, g3, w1, w2, w3, periods: T_sim,
      ratiolAtoB, target_y_ratio_A, target_y_ratio_B,
      hype_realized_max, hype_perc_peak, hype_trough_depth,
      tidal_max, tidal_lag_B, tidal_midpoint, tidal_steepness,
      logjam_max, logjam_lag_B, logjam_mid1, logjam_plateau_dur,
      gulf_max, gulf_plateau_gap, gulf_leakage_B, gulf_mid1
    } = params;

    const rho = (sigma - 1) / sigma;
    const T_full = 60;
    const n = mode === '2C' ? 2 : 3;
    const b_start = 0.001;

    const L_A = 5.0; 
    const L_C = 1.0;
    const L_B = mode === '2C' ? L_A / ratiolAtoB : 3.0;
    const L_vec = n === 2 ? [L_A, L_B] : [L_A, L_B, L_C];
    const w_vec = [w1, w2, w3];

    // Calibration
    const A0_numeraire = 1.0;
    const k_ss_num = solve_ki_for_r(r_target, b_start, delta, A0_numeraire, 1.0, gamma, rho);
    const y_ss_num = get_y(k_ss_num, b_start, rho, gamma, A0_numeraire, 1.0);
    
    const A0_vec = new Array(n);
    const targets = n === 2 ? [target_y_ratio_A] : [target_y_ratio_A, target_y_ratio_B];
    A0_vec[n - 1] = A0_numeraire;
    
    for (let i = 0; i < n - 1; i++) {
      const ty = y_ss_num * targets[i];
      A0_vec[i] = fzero((a) => get_y(solve_ki_for_r(r_target, b_start, delta, a, 1.0, gamma, rho), b_start, rho, gamma, a, 1.0) - ty, 0.1, 10.0);
    }

    const K_init_pc = A0_vec.map(a => solve_ki_for_r(r_target, b_start, delta, a, 1.0, gamma, rho));
    const Y_init_pc = K_init_pc.map((ki, i) => get_y(ki, b_start, rho, gamma, A0_vec[i], 1.0));
    const s_base_vec = K_init_pc.map((ki, i) => (delta * ki) / Y_init_pc[i]);
    const A_paths = A0_vec.map((a0, i) => Array.from({ length: T_full + 1 }, (_, t) => a0 * Math.pow(1 + [g1, g2, g3][i], t)));

    // Scenario Path Gen
    const t_axis = Array.from({ length: T_full + 1 }, (_, i) => i);
    const beta_paths = Array.from({ length: n }, () => Array(T_full + 1).fill(b_start));
    let beta_perc_L = Array(T_full + 1).fill(b_start);

    if (activeScenario === 'hype') {
      const bL = t_axis.map(t => b_start + (hype_realized_max - b_start) / (1 + Math.exp(-0.8 * (t - 5))));
      const sp = t_axis.map(t => (1 / (1 + Math.exp(-2.5 * (t - 3)))) * (1 / (1 + Math.exp(1.8 * (t - 7)))));
      const st = t_axis.map(t => (1 / (1 + Math.exp(-1.2 * (t - 10)))) * (1 / (1 + Math.exp(0.6 * (t - 20)))));
      beta_paths[0] = bL; beta_paths[1] = [...bL];
      beta_perc_L = bL.map((v, i) => Math.max(1e-6, v + (hype_perc_peak * sp[i]) - (hype_trough_depth * st[i])));
    } else if (activeScenario === 'tidal') {
      const bL = t_axis.map(t => b_start + tidal_max / (1 + Math.exp(-tidal_steepness * (t - tidal_midpoint))));
      beta_paths[0] = bL;
      beta_paths[1] = t_axis.map((_, t) => t < tidal_lag_B ? b_start : bL[t - Math.round(tidal_lag_B)]);
      if (n === 3) beta_paths[2] = t_axis.map((_, t) => t < 2 * tidal_lag_B ? b_start : bL[t - Math.round(2 * tidal_lag_B)]);
      beta_perc_L = [...bL];
    } else if (activeScenario === 'logjam') {
      const m2 = logjam_mid1 + 8 + logjam_plateau_dur;
      const bL = t_axis.map(t => b_start + (0.2 / (1 + Math.exp(-0.8 * (t - logjam_mid1)))) + (logjam_max - 0.2) / (1 + Math.exp(-0.8 * (t - m2))));
      beta_paths[0] = bL;
      beta_paths[1] = t_axis.map((_, t) => t < logjam_lag_B ? b_start : bL[t - Math.round(logjam_lag_B)]);
      if (n === 3) beta_paths[2] = t_axis.map((_, t) => t < 2 * logjam_lag_B ? b_start : bL[t - Math.round(2 * logjam_lag_B)]);
      beta_perc_L = [...bL];
    } else {
      const m2 = gulf_mid1 + 15;
      const bL = t_axis.map(t => b_start + (0.4 / (1 + Math.exp(-0.8 * (t - gulf_mid1)))) + (gulf_max - 0.4) / (1 + Math.exp(-0.8 * (t - m2))));
      beta_paths[0] = bL;
      beta_paths[1] = bL.map(v => v * gulf_leakage_B);
      if (n === 3) beta_paths[2] = bL.map(v => v * 0.02);
      beta_perc_L = [...bL];
    }

    // Simulation
    let P = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? K_init_pc[i] * L_vec[i] : 0)));
    const pipelines = Array.from({ length: n }, (_, i) => Array(T_full + l + 10).fill(delta * K_init_pc[i] * L_vec[i]));
    const history = [];
    let s_guess = [...s_base_vec];
    const b_paths_ext = beta_paths.map(p => [...p, ...Array(l + 10).fill(p[T_full])]);
    const b_perc_ext = [...beta_perc_L, ...Array(l + 10).fill(beta_perc_L[T_full])];
    let GNI_init = [];

    for (let t = 0; t < T_sim; t++) {
      const K_curr = Array(n).fill(0).map((_, j) => P.reduce((sum, row) => sum + row[j], 0));
      const V_curr = P.map(row => row.reduce((a, b) => a + b, 0));
      const A_t = A_paths.map(p => p[t]);
      const bt_r = beta_paths.map(p => p[t]);

      const Y = Array(n).fill(0).map((_, i) => get_y(K_curr[i], bt_r[i], rho, gamma, A_t[i], L_vec[i]));
      const r_real = Array(n).fill(0).map((_, i) => get_r(K_curr[i], bt_r[i], rho, gamma, A_t[i], L_vec[i], delta));
      
      const labor_inc = Y.map((y, i) => y - (r_real[i] + delta) * K_curr[i]);
      const GNI_parts = Array.from({length: n}, (_, k) => {
        const dom = P[k][k] * r_real[k];
        let for_inc = 0;
        for (let m = 0; m < n; m++) if (m !== k) for_inc += P[k][m] * (r_real[m] - w_vec[m]);
        return { labor: labor_inc[k] / L_vec[k], dom_cap: dom / L_vec[k], for_cap: for_inc / L_vec[k] };
      });
      const GNI = GNI_parts.map((p, i) => (p.labor + p.dom_cap + p.for_cap) * L_vec[i]);
      if (t === 0) GNI_init = [...GNI];

      // Starvation shadow (Damped smoothing pass)
      const bt_shadow = Array(n).fill(bt_r[0]);
      const Kf_shadow = n === 2 ? solve_2c_market(V_curr, bt_shadow, delta, A_t, L_vec, gamma, rho, w_vec) : solve_3c_market(V_curr, bt_shadow, delta, A_t, L_vec, gamma, rho, w_vec);
      const starvation = Kf_shadow.map((kf, i) => (kf - K_curr[i]) / (kf + 1e-12));

      // Foresight
      const idx_f = Math.min(T_full, t + l);
      const bt_f = b_paths_ext.map((p, i) => i === 0 ? b_perc_ext[idx_f] : p[idx_f]);
      const A_f = A_paths.map(p => p[idx_f]);
      const V_fixed = V_curr.map((v, i) => {
        let surv = v * Math.pow(1 - delta, l);
        for (let m = 1; m < l; m++) surv += pipelines[i][t + m] * Math.pow(1 - delta, l - m);
        return surv;
      });

      for (let iter = 0; iter < 40; iter++) {
        const V_proj = V_fixed.map((v, i) => v + s_guess[i] * GNI[i]);
        const K_f = mode === '2C' ? solve_2c_market(V_proj, bt_f, delta, A_f, L_vec, gamma, rho, w_vec) : solve_3c_market(V_proj, bt_f, delta, A_f, L_vec, gamma, rho, w_vec);
        const rr_f = K_f.map((k, i) => get_r(k, bt_f[i], rho, gamma, A_f[i], L_vec[i], delta));
        const V_world = V_proj.reduce((a, b) => a + b, 0);
        const r_yield = V_proj.map((_, owner) => {
          let yVal = 0;
          for (let loc = 0; loc < n; loc++) yVal += (K_f[loc] / V_world) * (rr_f[loc] - (owner !== loc ? w_vec[loc] : 0));
          return yVal;
        });
        const s_target = s_base_vec.map((sb, i) => Math.max(0, sb + phi * (r_yield[i] - r_target)));
        const s_new = s_guess.map((old, i) => old * 0.5 + s_target[i] * 0.5); // Stability damping
        if (Math.max(...s_new.map((v, i) => Math.abs(v - s_guess[i]))) < 1e-7) break;
        s_guess = s_new;
      }
      pipelines.forEach((p, i) => { p[t + l] = s_guess[i] * GNI[i]; });

      // Evolution
      const K_prev = [...K_curr];
      P = P.map(row => row.map(v => v * (1 - delta)));
      for (let i = 0; i < n; i++) P[i][i] += pipelines[i][t + 1];
      const V_new = P.map(row => row.reduce((a, b) => a + b, 0));
      const bt_next = b_paths_ext.map((p, i) => i === 0 ? b_perc_ext[t + 1] : p[t + 1]);
      const A_next = A_paths.map(p => p[Math.min(T_full, t + 1)]);
      const K_target = mode === '2C' ? solve_2c_market(V_new, bt_next, delta, A_next, L_vec, gamma, rho, w_vec) : solve_3c_market(V_new, bt_next, delta, A_next, L_vec, gamma, rho, w_vec);
      const V_tot_new = V_new.reduce((a, b) => a + b, 0);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (V_tot_new > 1e-9) P[r][c] = V_new[r] * (K_target[c] / V_tot_new);

      const v_pc = V_curr.map((v, i) => v / L_vec[i]);
      const wealth_sh = v_pc.map(v => (v / v_pc.reduce((a,b)=>a+b,0)) * 100);

      history.push({
        t, beta1: bt_r[0], beta2: bt_r[1], beta3: bt_r[2] || 0, betaP: activeScenario === 'hype' ? b_perc_ext[t] : null,
        Y1: (Y[0] / (Y_init_pc[0] * L_vec[0])) * 100, Y2: (Y[1] / (Y_init_pc[1] * L_vec[1])) * 100, Y3: n === 3 ? (Y[2] / (Y_init_pc[2] * L_vec[2])) * 100 : 0,
        r1: r_real[0] * 100, r2: r_real[1] * 100, r3: (r_real[2] || 0) * 100,
        s1: s_guess[0], s2: s_guess[1], s3: s_guess[2] || 0,
        sh1: wealth_sh[0], sh2: wealth_sh[1], sh3: wealth_sh[2] || 0,
        ls1: labor_inc[0] / GNI[0], ls2: labor_inc[1] / GNI[1], ls3: labor_inc[2] ? labor_inc[2] / GNI[2] : 0,
        sg1_raw: starvation[0] * 100, sg2_raw: starvation[1] * 100, sg3_raw: starvation[2] ? starvation[2] * 100 : 0,
        rent1: ((GNI_parts[0].for_cap * L_vec[0]) / GNI[0]) * 100, 
        rent2: ((GNI_parts[1].for_cap * L_vec[1]) / GNI[1]) * 100,
        rent3: n === 3 ? ((GNI_parts[2].for_cap * L_vec[2]) / GNI[2]) * 100 : 0,
        GNI1: GNI[0] / GNI_init[0] * 100, GNI2: GNI[1] / GNI_init[1] * 100, GNI3: (GNI[2] || 1) / (GNI_init[2] || 1) * 100,
        gni_parts: GNI_parts
      });
    }

    // Moving average pass for Starvation Gap smoothing
    return history.map((h, i) => {
      const get_avg = (k) => {
        let s = h[k], c = 1;
        if (i>0) { s += history[i-1][k]; c++; }
        if (i<history.length-1) { s += history[i+1][k]; c++; }
        return s/c;
      };
      return { ...h, sg1: get_avg('sg1_raw'), sg2: get_avg('sg2_raw'), sg3: get_avg('sg3_raw') };
    });
  }, [mode, activeScenario, params]);

  const activeScenarioInfo = SCENARIOS.find(s => s.id === activeScenario);

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
      <aside className="w-80 bg-white border-r border-slate-300 flex flex-col shadow-xl z-20">
        <div className="p-4 border-b border-slate-200 flex items-center space-x-3 bg-slate-900 text-white font-black uppercase tracking-widest text-[11px]">
          <Globe className="w-5 h-5 text-blue-400" /><span>Simulation Engine</span>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-8 scrollbar-hide">
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {['dashboard', 'about'].map(v => (
              <button key={v} onClick={() => setActiveView(v)} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-md transition-all ${activeView === v ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>{v}</button>
            ))}
          </div>
          
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
            {['2C', '3C'].map(m => (
              <button key={m} onClick={() => setMode(m)} className={`py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${mode === m ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>{m === '2C' ? '2-Country' : '3-Country'}</button>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2 tracking-tight">Active Scenario</label>
            {SCENARIOS.map(s => (
              <button key={s.id} onClick={() => setActiveScenario(s.id)} className={`w-full p-2.5 text-left rounded-lg border text-[10px] font-bold transition-all ${activeScenario === s.id ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>{s.name.toUpperCase()}</button>
            ))}
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-100">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1 tracking-tight">Adjust Parameters</label>
            <div className="relative">
              <select value={activeParamCategory} onChange={(e) => setActiveParamCategory(e.target.value)} className="w-full p-2 text-xs font-black uppercase border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 shadow-sm cursor-pointer">
                <option value="temporal">Temporal Setup</option>
                <option value="size">Size & Calibration</option>
                <option value="frictions">Capital Controls</option>
                <option value="growth">Growth Rates</option>
              </select>
              <ChevronDown className="absolute right-3 top-2.5 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            <div className="bg-slate-50 p-4 rounded-xl space-y-6 border border-slate-200 shadow-inner">
              {activeParamCategory === 'temporal' && (
                <>
                  <ParamSlider label="Periods" val={params.periods} min={10} max={60} step={1} onChange={v => setParams({...params, periods: v})} icon={<Timer className="w-3 h-3 text-blue-500" />} desc="Simulation calculation timeframe." />
                  <ParamSlider label="Gestation Lag" val={params.l} min={1} max={10} step={1} onChange={v => setParams({...params, l: v})} icon={<Clock className="w-3 h-3 text-indigo-500" />} desc="Wait time for machines to become productive." />
                </>
              )}
              {activeParamCategory === 'size' && (
                <>
                  {mode === '2C' && <ParamSlider label="Labour Ratio" val={params.ratiolAtoB} min={0.5} max={5} step={0.1} onChange={v => setParams({...params, ratiolAtoB: v})} icon={<Scale className="w-3 h-3 text-emerald-500" />} desc="Size of Country A relative to Country B." />}
                  {mode === '3C' && (
                    <>
                      <ParamSlider label="Labour Ratio A/C" val={params.ratiolAtoC} min={1} max={10} step={0.5} onChange={v => setParams({...params, ratiolAtoC: v})} icon={<Scale className="w-3 h-3 text-emerald-500" />} desc="Size of Leader relative to Laggard." />
                      <ParamSlider label="Labour Ratio B/C" val={params.ratiolBtoC} min={1} max={10} step={0.5} onChange={v => setParams({...params, ratiolBtoC: v})} desc="Size of Follower relative to Laggard." />
                    </>
                  )}
                  <ParamSlider label={mode === '2C' ? "Output Ratio" : "Leader Output Ratio"} val={params.target_y_ratio_A} min={1} max={4} step={0.05} onChange={v => setParams({...params, target_y_ratio_A: v})} icon={<Activity className="w-3 h-3 text-indigo-500" />} desc="Steady-state output target relative to numeraire." />
                  {mode === '3C' && <ParamSlider label="Follower Output Ratio" val={params.target_y_ratio_B} min={1} max={3} step={0.05} onChange={v => setParams({...params, target_y_ratio_B: v})} desc="Follower target relative to Laggard." />}
                </>
              )}
              {activeParamCategory === 'frictions' && (
                <>
                  <ParamSlider label="Leader Tax" val={params.w1} min={0} max={0.1} step={0.001} onChange={v => setParams({...params, w1: v})} desc="Cross-border tax in Country A." />
                  <ParamSlider label="Follower Tax" val={params.w2} min={0} max={0.1} step={0.001} onChange={v => setParams({...params, w2: v})} desc="Cross-border tax in Country B." />
                  {mode === '3C' && <ParamSlider label="Laggard Tax" val={params.w3} min={0} max={0.1} step={0.001} onChange={v => setParams({...params, w3: v})} desc="Cross-border tax in Country C." />}
                </>
              )}
              {activeParamCategory === 'growth' && (
                <>
                  <ParamSlider label="Leader Growth" val={params.g1} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, g1: v})} desc="Base TFP growth rate for Country A." />
                  <ParamSlider label="Follower Growth" val={params.g2} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, g2: v})} desc="Base TFP growth rate for Country B." />
                  {mode === '3C' && <ParamSlider label="Laggard Growth" val={params.g3} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, g3: v})} desc="Base TFP growth rate for Country C." />}
                </>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-100 pb-10">
            <div className="flex items-center space-x-2 mb-1"><Zap className="w-3 h-3 text-amber-500" /><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Scenario Settings</label></div>
            <div className="bg-amber-50/50 p-4 rounded-xl space-y-6 border border-amber-100 shadow-sm">
              {activeScenario === 'hype' && (
                <>
                  <ParamSlider label="Realized Max" val={params.hype_realized_max} min={0.01} max={0.5} step={0.01} onChange={v => setParams({...params, hype_realized_max: v})} desc="Actual technological saturation point." />
                  <ParamSlider label="Perceived Peak" val={params.hype_perc_peak} min={0.1} max={0.9} step={0.05} onChange={v => setParams({...params, hype_perc_peak: v})} desc="Maximum perceived adoption level." />
                  <ParamSlider label="Trough Depth" val={params.hype_trough_depth} min={0} max={0.2} step={0.01} onChange={v => setParams({...params, hype_trough_depth: v})} desc="Depth of post-hype technological dip." />
                </>
              )}
              {activeScenario === 'tidal' && (
                <>
                  <ParamSlider label="Max Saturation" val={params.tidal_max} min={0.1} max={0.9} step={0.05} onChange={v => setParams({...params, tidal_max: v})} desc="Final tech adoption level." />
                  <ParamSlider label="Follower Lag" val={params.tidal_lag_B} min={0} max={25} step={1} onChange={v => setParams({...params, tidal_lag_B: v})} desc="Time delay for Follower catch-up." />
                  <ParamSlider label="Diffusion Midpoint" val={params.tidal_midpoint} min={5} max={30} step={1} onChange={v => setParams({...params, tidal_midpoint: v})} desc="Timing of maximum catch-up rate." />
                </>
              )}
              {activeScenario === 'logjam' && (
                <>
                  <ParamSlider label="Max Saturation" val={params.logjam_max} min={0.1} max={0.9} step={0.05} onChange={v => setParams({...params, logjam_max: v})} desc="Final combined wave tech level." />
                  <ParamSlider label="Plateau" val={params.logjam_plateau_dur} min={0} max={20} step={1} onChange={v => setParams({...params, logjam_plateau_dur: v})} desc="Length of adoption stall." />
                  <ParamSlider label="Follower Lag" val={params.logjam_lag_B} min={0} max={20} step={1} onChange={v => setParams({...params, logjam_lag_B: v})} desc="Timing shift for Follower catch-up." />
                </>
              )}
              {activeScenario === 'gulf' && (
                <>
                  <ParamSlider label="Max Saturation" val={params.gulf_max} min={0.1} max={1} step={0.05} onChange={v => setParams({...params, gulf_max: v})} desc="Leader adoption ceiling." />
                  <ParamSlider label="Leakage to B" val={params.gulf_leakage_B} min={0.01} max={0.5} step={0.01} onChange={v => setParams({...params, gulf_leakage_B: v})} desc="Fraction of tech accessed by Follower." />
                </>
              )}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-10 bg-white border-b border-slate-300 px-6 flex items-center justify-between shadow-sm">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em]">{activeScenarioInfo?.name || 'SIMULATION'}</h2>
          <div className="flex items-center space-x-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
            <Activity className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-widest">{mode} MODEL</span>
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          {activeView === 'dashboard' ? (
            <div className="space-y-10">
              <div className="grid grid-cols-2 gap-x-6 gap-y-10">
                <ChartBlock title="Tech Adoption (β)">
                  <ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Tooltip content={<SimpleTooltip />} /><Line type="monotone" dataKey="beta1" name="Leader" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="beta2" name="Follower" stroke="#ff0000" strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="beta3" name="Laggard" stroke="#00aa00" strokeWidth={1.5} strokeDasharray="3 3" dot={false} isAnimationActive={false} />}{activeScenario === 'hype' && <Line type="monotone" dataKey="betaP" name="Perceived" stroke="#0000ff" strokeWidth={1} strokeDasharray="2 2" opacity={0.3} dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                  <p className="mt-2 text-[8px] text-slate-500 font-bold uppercase text-center border-t border-slate-50 pt-1 tracking-tighter"><b>Fraction of tasks performed by machines (0 to 1)</b></p>
                </ChartBlock>

                <ChartBlock title="Output Index (Y)">
                  <ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Line type="monotone" dataKey="Y1" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="Y2" stroke="#ff0000" strokeWidth={1.5} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="Y3" stroke="#00aa00" strokeWidth={1.5} dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                  <p className="mt-2 text-[8px] text-slate-500 font-bold uppercase text-center border-t border-slate-50 pt-1 tracking-tighter"><b>Domestic output relative to start period (Base=100)</b></p>
                </ChartBlock>

                <ChartBlock title="Realized Returns (%)">
                  <ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Line type="monotone" dataKey="r1" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="r2" stroke="#ff0000" strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="r3" stroke="#00aa00" strokeWidth={1.5} dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                  <p className="mt-2 text-[8px] text-slate-500 font-bold uppercase text-center border-t border-slate-50 pt-1 tracking-tighter"><b>Net interest rate of local machines after depreciation</b></p>
                </ChartBlock>

                <ChartBlock title="Savings Rate (s)">
                  <ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Line type="monotone" dataKey="s1" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="s2" stroke="#ff0000" strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="s3" stroke="#00aa00" strokeWidth={1.5} dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                  <p className="mt-2 text-[8px] text-slate-500 font-bold uppercase text-center border-t border-slate-50 pt-1 tracking-tighter"><b>Percent of income saved for productive capital</b></p>
                </ChartBlock>

                <ChartBlock title="Wealth Share % (p.c.)">
                  <ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Line type="monotone" dataKey="sh1" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="sh2" stroke="#ff0000" strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="sh3" stroke="#00aa00" strokeWidth={1.5} dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                  <p className="mt-2 text-[8px] text-slate-500 font-bold uppercase text-center border-t border-slate-50 pt-1 tracking-tighter"><b>Percentage of global per-capita wealth owned by residents</b></p>
                </ChartBlock>

                <ChartBlock title="Labour Share GNI">
                  <ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Line type="monotone" dataKey="ls1" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="ls2" stroke="#ff0000" strokeWidth={1.5} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="ls3" stroke="#00aa00" strokeWidth={1.5} dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                  <p className="mt-2 text-[8px] text-slate-500 font-bold uppercase text-center border-t border-slate-50 pt-1 tracking-tighter"><b>Share of National Income paid to domestic workers</b></p>
                </ChartBlock>

                <ChartBlock title="Starvation Gap (%)">
                  <ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><ReferenceLine y={0} stroke="#475569" strokeWidth={1} /><Line type="monotone" dataKey="sg1" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="sg2" stroke="#ff0000" strokeWidth={2} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="sg3" stroke="#00aa00" strokeWidth={2} dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                  <p className="mt-2 text-[8px] text-slate-500 font-bold uppercase text-center border-t border-slate-50 pt-1 tracking-tighter"><b>capital loss due to tech lag relative to Leader frontier</b></p>
                </ChartBlock>

                <ChartBlock title="Rentier Index (% GNI)">
                  <ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><ReferenceLine y={0} stroke="#475569" strokeWidth={1} /><Line type="monotone" dataKey="rent1" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="rent2" stroke="#ff0000" strokeWidth={1.5} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="rent3" stroke="#00aa00" strokeWidth={1.5} dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                  <p className="mt-2 text-[8px] text-slate-500 font-bold uppercase text-center border-t border-slate-50 pt-1 tracking-tighter"><b>Net foreign investment income as percentage of total GNI</b></p>
                </ChartBlock>
              </div>

              <div className="mt-12 border-t border-slate-200 pt-8 pb-10">
                <div className="mb-6 text-center">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center justify-center"><LayoutGrid className="w-5 h-5 mr-2 text-indigo-600" /> GNI Decomposition</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 italic">Per Capita Breakdown of Labor and Capital Returns</p>
                </div>
                <div className={`grid ${mode === '2C' ? 'grid-cols-2' : 'grid-cols-3'} gap-4`}>
                  {simulationResults.length > 0 && [...Array(mode === '2C' ? 2 : 3)].map((_, c) => (
                    <div key={`gni-dec-${c}`} className="bg-white p-3 border border-slate-300 rounded-sm shadow-sm">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-1 mb-2">
                        <span className="text-[8px] font-black uppercase text-indigo-600">Composition</span>
                        <span className="text-[8px] font-black uppercase text-slate-400">Country {String.fromCharCode(65 + c)}</span>
                      </div>
                      <ResponsiveContainer width="100%" height={150}>
                        <AreaChart data={simulationResults.map(h => ({ t: h.t, ...h.gni_parts[c] }))} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={7} /><YAxis fontSize={7} domain={[0, 'auto']} />
                          <Area name="Labor Income" type="monotone" dataKey="labor" stackId="1" stroke="#cc4c4c" fill="#cc4c4c" opacity={0.8} isAnimationActive={false} />
                          <Area name="Domestic Capital Income" type="monotone" dataKey="dom_cap" stackId="1" stroke="#4c4ccc" fill="#4c4ccc" opacity={0.8} isAnimationActive={false} />
                          <Area name="Foreign Capital Income" type="monotone" dataKey="for_cap" stackId="1" stroke="#4ccc4c" fill="#4ccc4c" opacity={0.8} isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center items-center space-x-10 py-6 mt-6 border-t border-slate-100">
                  <LegendItem color="#cc4c4c" label="Labor Income" /><LegendItem color="#4c4ccc" label="Domestic Capital Income" /><LegendItem color="#4ccc4c" label="Foreign Capital Income" />
                </div>
              </div>
            </div>
          ) : (
            <AboutPage />
          )}
        </div>
      </main>
    </div>
  );
};

// --- HELPER COMPONENTS ---

const LegendItem = ({ color, label }) => (
  <div className="flex items-center space-x-3"><div className="w-4 h-4 rounded-sm shadow-sm" style={{ backgroundColor: color }}></div><span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">{label}</span></div>
);

const ParamSlider = ({ label, val, min, max, step, onChange, icon, desc }) => (
  <div className="space-y-1.5 animate-in fade-in slide-in-from-left-2 duration-300">
    <div className="flex justify-between items-center text-[8px] font-black text-slate-600 tracking-tight">
      <div className="flex items-center space-x-1">{icon}<span>{label.toUpperCase()}</span></div>
      <span className="font-mono text-blue-700 bg-blue-50 px-1 rounded">{val}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-600 shadow-sm" />
    <p className="text-[8px] text-slate-400 font-bold leading-tight italic tracking-tight opacity-80">{desc}</p>
  </div>
);

const ChartBlock = ({ title, children }) => (<div className="bg-white p-2.5 border border-slate-300 shadow-sm rounded-sm"><div className="text-[7px] font-black text-slate-500 uppercase tracking-tighter mb-1.5 border-b border-slate-100 pb-1">{title}</div>{children}</div>);

const SimpleTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-300 p-2 text-[8px] font-bold shadow-xl">
        <div className="mb-1 text-slate-400 text-[10px]">T = {label}</div>
        {payload.map((entry, i) => (
          <div key={i} className="flex justify-between space-x-3 mb-0.5">
            <span style={{ color: entry.color }}>{entry.name || entry.dataKey}:</span>
            <span className="font-mono">{parseFloat(entry.value).toFixed(3)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const AboutPage = () => (
  <div className="max-w-4xl mx-auto bg-white p-10 shadow-2xl space-y-12 rounded-sm mb-10">
    <div className="border-b border-slate-100 pb-6 flex items-center space-x-4"><div className="bg-blue-600 p-3 rounded-xl text-white"><BookOpen className="w-6 h-6" /></div><div><h2 className="text-2xl font-black uppercase tracking-tight text-slate-800 leading-none">Logic Documentation</h2><p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-1">Layman's Guide to Capital Flows</p></div></div>
    <section><h3 className="text-lg font-black text-blue-600 mb-3 uppercase flex items-center tracking-tight"><ChevronRight className="w-5 h-5 mr-1" /> THE CORE CONCEPT</h3><p className="text-slate-600 leading-relaxed italic text-sm">This simulator models international capital movements triggered by technological adoption. When one region improves its productivity through tech adoption, its returns to capital rise, drawing money away from other regions.</p></section>
  </div>
);

export default App;