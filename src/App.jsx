import React, { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, AreaChart, Area, Legend
} from 'recharts';
import {
  Globe, Activity, TrendingUp, Layers, RefreshCw,
  ChevronRight, Database, TrendingDown, BookOpen, Zap, Timer, PauseCircle, LayoutGrid, ChevronDown, Clock, Scale, Info
} from 'lucide-react';

// --- ROBUST NUMERICAL UTILITIES ---

const fzero = (func, low, high, iterations = 100) => {
  let fLow = func(low);
  let fHigh = func(high);
  if (fLow * fHigh > 0) return Math.abs(fLow) < Math.abs(fHigh) ? low : high;
  let mid = 0;
  for (let i = 0; i < iterations; i++) {
    mid = (low + high) / 2;
    let fMid = func(mid);
    if (fMid * fLow <= 0) high = mid;
    else { low = mid; fLow = fMid; }
    if (Math.abs(high - low) < 1e-10) break;
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

// --- MARKET SOLVERS ---

const solve_ki_for_r = (target_r, bt, delta, A, L, gamma, rho) => {
  return fzero((k) => get_r(k, bt, rho, gamma, A, L, delta) - target_r, 1e-6, 1e8);
};

const solve_n_country_market = (V_vec, bt_vec, delta, A_vec, L_vec, gamma, rho, w_vec) => {
  const n = V_vec.length;
  const get_Ki = (r_ref) => {
    return V_vec.map((v, i) => {
      const r_at_v = get_r(v, bt_vec[i], rho, gamma, A_vec[i], L_vec[i], delta);
      if (r_at_v < r_ref) return solve_ki_for_r(r_ref, bt_vec[i], delta, A_vec[i], L_vec[i], gamma, rho);
      if (r_at_v > r_ref + w_vec[i]) return solve_ki_for_r(r_ref + w_vec[i], bt_vec[i], delta, A_vec[i], L_vec[i], gamma, rho);
      return v;
    });
  };
  const V_tot = V_vec.reduce((a, b) => a + b, 0);
  const r_star = fzero((r) => get_Ki(r).reduce((a, b) => a + b, 0) - V_tot, -0.049, 5.0);
  return get_Ki(r_star);
};

const SCENARIOS = [
  { id: 'hype', name: 'Scenario 1: Hype' },
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
    r_target: 0.04, l: 3, periods: 50,
    target_y_ratio_A: 2.0, target_y_ratio_B: 1.5,
    w1: 0.001, w2: 0.005, w3: 0.005,
    g1: 0, g2: 0, g3: 0,
    hype_realized_max: 0.05, hype_perc_peak: 0.40, hype_trough_depth: 0.05,
    tidal_max: 0.50, tidal_lag_B: 10, tidal_midpoint: 15, tidal_steepness: 0.45,
    logjam_max: 0.50, logjam_lag_B: 8, logjam_mid1: 8, logjam_plateau_dur: 8,
    gulf_max: 0.90, gulf_leakage_B: 0.10, gulf_leakage_C: 0.02, gulf_mid1: 10
  });

  useEffect(() => {
    if (mode === '2C') {
      setParams(prev => ({ ...prev, w1: 0.008, target_y_ratio_A: 1.5, hype_realized_max: 0.1, periods: 40 }));
    } else {
      setParams(prev => ({ ...prev, w1: 0.001, target_y_ratio_A: 2.0, hype_realized_max: 0.05, periods: 60 }));
    }
  }, [mode]);

  const simulationResults = useMemo(() => {
    const { 
      sigma, delta, phi, gamma, r_target, l, w1, w2, w3, g1, g2, g3, periods: T_sim,
      target_y_ratio_A, target_y_ratio_B,
      hype_realized_max, hype_perc_peak, hype_trough_depth,
      tidal_max, tidal_lag_B, tidal_midpoint, tidal_steepness,
      logjam_max, logjam_lag_B, logjam_mid1, logjam_plateau_dur,
      gulf_max, gulf_leakage_B, gulf_leakage_C, gulf_mid1
    } = params;

    const rho = (sigma - 1) / sigma;
    const T_full = 120;
    const n = mode === '2C' ? 2 : 3;
    const b_start = 0.001;

    const L_A = 5.0; 
    const L_C = 1.0;
    const L_B = 3.0;
    const L_vec = n === 2 ? [L_A, 2.5] : [L_A, L_B, L_C];
    const w_vec = n === 2 ? [w1, w2] : [w1, w2, w3];

    const A0_numeraire = 1.0;
    const k_ss_num = solve_ki_for_r(r_target, b_start, delta, A0_numeraire, 1.0, gamma, rho);
    const y_ss_num = get_y(k_ss_num, b_start, rho, gamma, A0_numeraire, 1.0);
    
    const findA0 = (target_ratio) => {
      const target_y = y_ss_num * target_ratio;
      return fzero((a_guess) => {
        const k_local = solve_ki_for_r(r_target, b_start, delta, a_guess, 1.0, gamma, rho);
        return get_y(k_local, b_start, rho, gamma, a_guess, 1.0) - target_y;
      }, 0.1, 10.0);
    };

    const A0_A = findA0(target_y_ratio_A);
    const A0_B = findA0(target_y_ratio_B);
    const A0_vec = n === 2 ? [A0_A, A0_numeraire] : [A0_A, A0_B, A0_numeraire];

    const A_paths = A0_vec.map((a0, i) => Array.from({ length: T_full + 1 }, (_, t) => a0 * Math.pow(1 + [g1, g2, g3][i], t)));
    const K_init_pc = A0_vec.map(a => solve_ki_for_r(r_target, b_start, delta, a, 1.0, gamma, rho));
    const Y_init_pc = K_init_pc.map((ki, i) => get_y(ki, b_start, rho, gamma, A0_vec[i], 1.0));
    const s_base_vec = K_init_pc.map((ki, i) => (delta * ki) / Y_init_pc[i]);

    const t_axis = Array.from({ length: T_full + 1 }, (_, i) => i);
    const beta_paths = Array.from({ length: n }, () => Array(T_full + 1).fill(b_start));
    let beta_perc_L = Array(T_full + 1).fill(b_start);

    if (activeScenario === 'hype') {
      const bL = t_axis.map(t => b_start + (hype_realized_max - b_start) / (1 + Math.exp(-0.8 * (t - 5))));
      const sp = t_axis.map(t => (1 / (1 + Math.exp(-2.5 * (t - 3)))) * (1 / (1 + Math.exp(1.8 * (t - 7)))));
      const st = t_axis.map(t => (1 / (1 + Math.exp(-1.2 * (t - 10)))) * (1 / (1 + Math.exp(0.6 * (t - 20)))));
      beta_paths[0] = bL; beta_paths[1] = [...bL]; 
      if (n === 3) beta_paths[2] = Array(T_full+1).fill(b_start);
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
      beta_paths[1] = bL.map(v => b_start + (v - b_start) * gulf_leakage_B);
      if (n === 3) beta_paths[2] = bL.map(v => b_start + (v - b_start) * gulf_leakage_C);
      beta_perc_L = [...bL];
    }

    let P = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? K_init_pc[i] * L_vec[i] : 0)));
    const pipelines = Array.from({ length: n }, (_, i) => Array(T_full + l + 10).fill(delta * K_init_pc[i] * L_vec[i]));
    const history = [];
    let s_guess = [...s_base_vec];
    const b_paths_ext = beta_paths.map(p => [...p, ...Array(l + 10).fill(p[T_full])]);
    const b_perc_ext = [...beta_perc_L, ...Array(l + 10).fill(beta_perc_L[T_full])];
    let Y_prev = Array(n).fill(0).map((_, i) => get_y(K_init_pc[i] * L_vec[i], b_start, rho, gamma, A0_vec[i], L_vec[i]));
    let GNI_init = [];

    for (let t = 0; t < T_sim; t++) {
      const K_curr = Array(n).fill(0).map((_, j) => P.reduce((sum, row) => sum + row[j], 0));
      const V_curr = P.map(row => row.reduce((a, b) => a + b, 0));
      const bt_r = beta_paths.map(p => p[t]);
      const A_curr = A_paths.map(p => p[t]);

      const Y = Array(n).fill(0).map((_, i) => get_y(K_curr[i], bt_r[i], rho, gamma, A_curr[i], L_vec[i]));
      const r_real = Array(n).fill(0).map((_, i) => get_r(K_curr[i], bt_r[i], rho, gamma, A_curr[i], L_vec[i], delta));
      const labor_inc = Y.map((y, i) => y - (r_real[i] + delta) * K_curr[i]);
      const GNI_parts = Array.from({length: n}, (_, k) => {
        const dom = P[k][k] * r_real[k];
        let for_inc = 0;
        for (let m = 0; m < n; m++) if (m !== k) for_inc += P[k][m] * (r_real[m] - w_vec[m]);
        return { labor: labor_inc[k] / L_vec[k], dom_cap: dom / L_vec[k], for_cap: for_inc / L_vec[k] };
      });
      const GNI = GNI_parts.map((p, i) => (p.labor + p.dom_cap + p.for_cap) * L_vec[i]);
      if (t === 0) GNI_init = [...GNI];

      const dY = Y.map((y, i) => t === 0 ? 0 : ((y / Y_prev[i]) - 1) * 100);
      Y_prev = [...Y];

      const max_beta = Math.max(...bt_r);
      const bt_frontier = Array(n).fill(max_beta);
      const Kf_shadow = solve_n_country_market(V_curr, bt_frontier, delta, A0_vec, L_vec, gamma, rho, w_vec);
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

      for (let iter = 0; iter < 30; iter++) {
        const V_proj = V_fixed.map((v, i) => v + s_guess[i] * GNI[i]);
        const K_f = solve_n_country_market(V_proj, bt_f, delta, A0_vec, L_vec, gamma, rho, w_vec);
        const rr_f = K_f.map((k, i) => get_r(k, bt_f[i], rho, gamma, A_f[i], L_vec[i], delta));
        const V_world = V_proj.reduce((a, b) => a + b, 0);
        const r_yield = V_proj.map((_, owner) => {
          let yVal = 0;
          for (let loc = 0; loc < n; loc++) yVal += (K_f[loc] / (V_world + 1e-12)) * (rr_f[loc] - (owner !== loc ? w_vec[loc] : 0));
          return yVal;
        });
        const s_target = s_base_vec.map((sb, i) => Math.max(0, sb + phi * (r_yield[i] - r_target)));
        if (s_target.every((v, i) => Math.abs(v - s_guess[i]) < 1e-6)) break;
        s_guess = s_target.map((v, i) => v * 0.4 + s_guess[i] * 0.6);
      }
      pipelines.forEach((p, i) => { p[t + l] = s_guess[i] * GNI[i]; });

      // Portfolio Evolution
      P = P.map(row => row.map(v => v * (1 - delta)));
      for (let i = 0; i < n; i++) P[i][i] += pipelines[i][t + 1];
      const V_new = P.map(row => row.reduce((a, b) => a + b, 0));
      const bt_next = b_paths_ext.map((p, i) => i === 0 ? b_perc_ext[t + 1] : p[t + 1]);
      const A_next = A_paths.map(p => p[Math.min(T_full, t + 1)]);
      const K_target = solve_n_country_market(V_new, bt_next, delta, A_next, L_vec, gamma, rho, w_vec);
      const V_tot_new = V_new.reduce((a, b) => a + b, 0);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (V_tot_new > 1e-9) P[r][c] = V_new[r] * (K_target[c] / V_tot_new);

      // Revenue: location loc taxes all foreign-owned capital in its borders
      const endPeriodRev = Array(n).fill(0).map((_, loc) => {
        let tax_base = 0;
        for (let owner = 0; owner < n; owner++) if (owner !== loc) tax_base += P[owner][loc];
        return tax_base * w_vec[loc];
      });

      // Net Rentier Position
      const netRentierIncome = Array(n).fill(0).map((_, k) => {
        let fromAbroad = 0, paidToForeigners = 0;
        for (let m = 0; m < n; m++) {
          if (m !== k) {
            fromAbroad += P[k][m] * (r_real[m] - w_vec[m]);
            paidToForeigners += P[m][k] * (r_real[k] - w_vec[k]);
          }
        }
        return fromAbroad - paidToForeigners;
      });

      const v_pc = V_curr.map((v, i) => v / L_vec[i]);
      const wealth_sh = v_pc.map(v => (v / (v_pc.reduce((a,b)=>a+b,0) + 1e-12)) * 100);

      history.push({
        t, dY1: dY[0], dY2: dY[1], dY3: n === 3 ? dY[2] : 0,
        beta1: bt_r[0], beta2: bt_r[1], beta3: bt_r[2] || 0, betaP: activeScenario === 'hype' ? b_perc_ext[t] : null,
        r1: r_real[0] * 100, r2: r_real[1] * 100, r3: (r_real[2] || 0) * 100,
        s1: s_guess[0], s2: s_guess[1], s3: s_guess[2] || 0,
        sh1: wealth_sh[0], sh2: wealth_sh[1], sh3: wealth_sh[2] || 0,
        ls1: (labor_inc[0] / GNI[0]) * 100, ls2: (labor_inc[1] / GNI[1]) * 100, ls3: (labor_inc[2] ? labor_inc[2] / GNI[2] : 0) * 100,
        sg2: starvation[1] * 100, sg3: starvation[2] ? starvation[2] * 100 : 0,
        rawRev: endPeriodRev,
        GNI1: GNI[0] / GNI_init[0] * 100, GNI2: GNI[1] / GNI_init[1] * 100, GNI3: (GNI[2] || 1) / (GNI_init[2] || 1) * 100,
        rent1: (netRentierIncome[0] / GNI[0]) * 100, rent2: (netRentierIncome[1] / GNI[1]) * 100, rent3: n === 3 ? (netRentierIncome[2] / GNI[2]) * 100 : 0,
        gni_parts: GNI_parts
      });
    }

    const h1 = history.find(h => h.t === 1) || history[0];
    const baseRev = [Math.max(1e-12, h1.rawRev[0]), Math.max(1e-12, h1.rawRev[1]), Math.max(1e-12, h1.rawRev[2])];

    return history.map(h => ({
      ...h,
      rev1: (h.rawRev[0] / baseRev[0]) * 100,
      rev2: (h.rawRev[1] / baseRev[1]) * 100,
      rev3: n === 3 ? (h.rawRev[2] / baseRev[2]) * 100 : 0
    }));
  }, [mode, activeScenario, params]);

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
      <aside className="w-80 bg-white border-r border-slate-300 flex flex-col shadow-xl z-20">
        <div className="p-4 border-b border-slate-200 flex items-center space-x-3 bg-slate-900 text-white font-black uppercase tracking-widest text-[11px]">
          <Globe className="w-5 h-5 text-blue-400" /><span>Simulation Engine</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide">
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
            {['2C', '3C'].map(m => (
              <button key={m} onClick={() => setMode(m)} className={`py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${mode === m ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>{m === '2C' ? '2-Country' : '3-Country'}</button>
            ))}
          </div>

          <div className="flex bg-slate-100 p-1 rounded-lg">
            {['dashboard', 'about'].map(v => (
              <button key={v} onClick={() => setActiveView(v)} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-md transition-all ${activeView === v ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>{v}</button>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Active Scenario</label>
            <div className="grid grid-cols-1 gap-2">
              {SCENARIOS.map(s => (
                <button key={s.id} onClick={() => setActiveScenario(s.id)} className={`w-full p-2.5 text-left rounded-lg border text-[10px] font-bold transition-all ${activeScenario === s.id ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>{s.name.toUpperCase()}</button>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="relative">
              <select value={activeParamCategory} onChange={(e) => setActiveParamCategory(e.target.value)} className="w-full p-2 text-xs font-black uppercase border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 shadow-sm cursor-pointer">
                <option value="temporal">Temporal Setup</option>
                <option value="size">Size & Calibration</option>
                <option value="frictions">Capital Controls</option>
                <option value="growth">Growth Rates</option>
              </select>
              <ChevronDown className="absolute right-3 top-2.5 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
            <div className="bg-slate-50 p-4 rounded-xl space-y-5 border border-slate-200 shadow-sm">
              {activeParamCategory === 'temporal' && (
                <>
                  <ParamSlider label="Gestation Lag (l)" val={params.l} min={1} max={10} step={1} onChange={v => setParams({...params, l: v})} icon={<Clock className="w-3 h-3 text-indigo-500" />} />
                  <ParamSlider label="Sim Periods" val={params.periods} min={20} max={60} step={1} onChange={v => setParams({...params, periods: v})} />
                </>
              )}
              {activeParamCategory === 'size' && (
                <>
                  <ParamSlider label="Output Target A" val={params.target_y_ratio_A} min={1} max={3} step={0.1} onChange={v => setParams({...params, target_y_ratio_A: v})} icon={<Activity className="w-3 h-3 text-blue-500" />} />
                  {mode === '3C' && <ParamSlider label="Output Target B" val={params.target_y_ratio_B} min={1} max={2.5} step={0.1} onChange={v => setParams({...params, target_y_ratio_B: v})} />}
                </>
              )}
              {activeParamCategory === 'frictions' && (
                <>
                  <ParamSlider label="Leader Tax (ωA)" val={params.w1} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, w1: v})} />
                  <ParamSlider label="Follower Tax (ωB)" val={params.w2} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, w2: v})} />
                  {mode === '3C' && <ParamSlider label="Laggard Tax (ωC)" val={params.w3} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, w3: v})} />}
                </>
              )}
              {activeParamCategory === 'growth' && (
                <>
                  <ParamSlider label="Leader g" val={params.g1} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, g1: v})} />
                  <ParamSlider label="Follower g" val={params.g2} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, g2: v})} />
                  {mode === '3C' && <ParamSlider label="Laggard g" val={params.g3} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, g3: v})} />}
                </>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-100/80 shadow-inner">
              <div className="flex items-center space-x-2.5 pb-3">
                <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-[0.15em]">Scenario Settings</span>
              </div>
              <div className="space-y-7">
                {activeScenario === 'hype' && (
                  <>
                    <ParamSlider label="Hype Peak" val={params.hype_perc_peak} min={0.1} max={0.8} step={0.05} onChange={v => setParams({...params, hype_perc_peak: v})} desc="Perceived adoption level at bubble peak." />
                    <ParamSlider label="Realized Max" val={params.hype_realized_max} min={0.01} max={0.3} step={0.01} onChange={v => setParams({...params, hype_realized_max: v})} desc="Actual technological saturation point." />
                    <ParamSlider label="Trough Depth" val={params.hype_trough_depth} min={0} max={0.2} step={0.01} onChange={v => setParams({...params, hype_trough_depth: v})} desc="Magnitude of correction post-hype." />
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
                    <ParamSlider label="Max Saturation" val={params.logjam_max} min={0.1} max={0.9} step={0.05} onChange={v => setParams({...params, logjam_max: v})} desc="Final technology saturation level." />
                    <ParamSlider label="Plateau Duration" val={params.logjam_plateau_dur} min={1} max={20} step={1} onChange={v => setParams({...params, logjam_plateau_dur: v})} desc="Length of the adoption stall." />
                    <ParamSlider label="Follower Lag" val={params.logjam_lag_B} min={0} max={20} step={1} onChange={v => setParams({...params, logjam_lag_B: v})} desc="Catch-up delay during the logjam." />
                  </>
                )}
                {activeScenario === 'gulf' && (
                  <>
                    <ParamSlider label="Max Saturation" val={params.gulf_max} min={0.5} max={1.0} step={0.05} onChange={v => setParams({...params, gulf_max: v})} desc="Leader adoption ceiling." />
                    <ParamSlider label="Leakage to B" val={params.gulf_leakage_B} min={0} max={0.5} step={0.01} onChange={v => setParams({...params, gulf_leakage_B: v})} desc="Follower access to tech as % of Leader." />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-10 bg-white border-b border-slate-300 px-6 flex items-center justify-between shadow-sm shrink-0">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em]">Live Modeling Interface</h2>
          <div className="flex items-center space-x-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
            <Activity className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase">{mode} GROWTH DYNAMICS</span>
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
          {activeView === 'dashboard' ? (
            <>
              {/* GLOBAL EXPLAINER BOX */}
              <div className="bg-white border border-slate-300 p-5 rounded-sm shadow-sm">
                <div className="flex items-start space-x-4">
                  <div className="bg-indigo-600 p-2 rounded text-white"><Info className="w-4 h-4" /></div>
                  <div className="flex-1">
                    <h3 className="text-[10px] font-black uppercase text-slate-800 tracking-widest mb-2">Model Context</h3>
                    <p className="text-[11px] text-slate-600 leading-relaxed max-w-4xl">
                      {mode === '3C' ? (
                        <>
                          This simulator models international capital flows triggered by asymmetric technological adoption. When a <span className="font-bold text-blue-600">Leader</span> automates tasks, its domestic returns to capital surge, pulling investment away from <span className="font-bold text-red-600">Follower</span> and <span className="font-bold text-slate-900">Laggard</span> regions. This causes divergence in wealth and wages until technology diffuses across the global economy.
                        </>
                      ) : (
                        <>
                          This simulator models international capital flows triggered by asymmetric technological adoption. When a <span className="font-bold text-blue-600">Leader</span> automates tasks, its domestic returns to capital surge, pulling investment away from the <span className="font-bold text-red-600">Follower</span> region. This causes divergence in wealth and wages until technology diffuses across the global economy.
                        </>
                      )}
                    </p>
                  </div>
                  {/* VISUAL LEGEND */}
                  <div className="flex flex-col space-y-3 pl-6 border-l border-slate-100 shrink-0">
                    <VisualLegendItem color="#2563eb" label="Leader" type="solid" />
                    <VisualLegendItem color="#dc2626" label="Follower" type="solid" />
                    {mode === '3C' && <VisualLegendItem color="#000000" label="Laggard" type="dashed" />}
                    {activeScenario === 'hype' && <VisualLegendItem color="#2563eb" label="Perceived" type="short-dash" />}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <ChartBlock title="Tech Adoption (β)" desc="Percentage of work tasks performed by machines rather than humans.">
                  <ResponsiveContainer width="100%" height={120}><LineChart data={simulationResults} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} domain={[1, 'dataMax']} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Tooltip content={<CustomTooltip />} /><Line type="monotone" dataKey="beta1" name="Leader" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="beta2" name="Follower" stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="beta3" name="Laggard" stroke="#000000" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />}{activeScenario === 'hype' && <Line type="monotone" dataKey="betaP" stroke="#2563eb" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                </ChartBlock>
                <ChartBlock title="Output Growth Rate (%)" desc="The speed at which the total national economy is expanding each period.">
                  <ResponsiveContainer width="100%" height={120}><LineChart data={simulationResults} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} domain={[1, 'dataMax']} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Tooltip content={<CustomTooltip />} /><ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" /><Line type="monotone" dataKey="dY1" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="dY2" stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="dY3" stroke="#000000" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                </ChartBlock>
                <ChartBlock title="Starvation Gap (%)" desc="Economic loss due to domestic technology lagging behind the global leader.">
                  <ResponsiveContainer width="100%" height={120}><LineChart data={simulationResults} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} domain={[1, 'dataMax']} /><YAxis fontSize={8} domain={['auto', 'auto']} /><ReferenceLine y={0} stroke="#94a3b8" /><Line type="monotone" dataKey="sg2" stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="sg3" stroke="#000000" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                </ChartBlock>
                <ChartBlock title="Savings Rate (s)" desc="The portion of income residents set aside to buy new machines for growth.">
                  <ResponsiveContainer width="100%" height={120}><LineChart data={simulationResults} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} domain={[1, 'dataMax']} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Line type="monotone" dataKey="s1" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="s2" stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="s3" stroke="#000000" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                </ChartBlock>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <ChartBlock title="Realized Returns (%)" desc="Net profit earned from machinery after accounting for depreciation.">
                  <ResponsiveContainer width="100%" height={120}><LineChart data={simulationResults} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} domain={[1, 'dataMax']} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Line type="monotone" dataKey="r1" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="r2" stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="r3" stroke="#000000" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                </ChartBlock>
                <ChartBlock title="Wealth Share % (p.c.)" desc="Value of machines owned per resident relative to the global average.">
                  <ResponsiveContainer width="100%" height={120}><LineChart data={simulationResults} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} domain={[1, 'dataMax']} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Line type="monotone" dataKey="sh1" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="sh2" stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="sh3" stroke="#000000" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                </ChartBlock>
                <ChartBlock title="GNI Index" desc="Total citizen income, including earnings from machines owned abroad.">
                  <ResponsiveContainer width="100%" height={120}><LineChart data={simulationResults} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} domain={[1, 'dataMax']} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Line type="monotone" dataKey="GNI1" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="GNI2" stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="GNI3" stroke="#000000" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                </ChartBlock>
                <ChartBlock title="Rentier Index (% GNI)" desc="Net profit from foreign machine ownership as a share of the economy.">
                  <ResponsiveContainer width="100%" height={120}><LineChart data={simulationResults} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} domain={[1, 'dataMax']} /><YAxis fontSize={8} domain={['auto', 'auto']} /><ReferenceLine y={0} stroke="#94a3b8" /><Line type="monotone" dataKey="rent1" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="rent2" stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="rent3" stroke="#000000" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                </ChartBlock>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ChartBlock title="Labour Share of GNI (%)" desc="The portion of national income paid out as wages to domestic workers.">
                  <ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} domain={[1, 'dataMax']} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Tooltip content={<CustomTooltip />} /><Line type="monotone" dataKey="ls1" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="ls2" stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="ls3" stroke="#000000" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                </ChartBlock>
                <ChartBlock title="Government Revenue Index (Base=100 at t=1)" desc="Income collected from foreign machines operating within national borders.">
                  <ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" fontSize={8} domain={[1, 'dataMax']} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Tooltip content={<CustomTooltip />} /><ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="3 3" /><Line type="monotone" dataKey="rev1" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="rev2" stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="rev3" stroke="#000000" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer>
                </ChartBlock>
              </div>

              <div className="bg-white p-6 border border-slate-300 rounded-sm shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center">
                    <LayoutGrid className="w-4 h-4 mr-2 text-indigo-500" /> GNI Decomposition (Per Capita)
                  </h3>
                  <div className="flex space-x-6">
                    <LegendItem color="#cc4c4c" label="Labor" />
                    <LegendItem color="#4c4ccc" label="Domestic Capital" />
                    <LegendItem color="#4ccc4c" label="Foreign Capital" />
                  </div>
                </div>
                <div className={`grid ${mode === '2C' ? 'grid-cols-2' : 'grid-cols-3'} gap-6`}>
                  {[...Array(mode === '2C' ? 2 : 3)].map((_, c) => (
                    <div key={c} className="space-y-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase text-center">Country {String.fromCharCode(65+c)}</div>
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={simulationResults.map(h => ({ t: h.t, ...h.gni_parts[c] }))} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="t" hide />
                          <YAxis fontSize={8} domain={['auto', 'auto']} />
                          <Area type="monotone" dataKey="labor" stackId="1" stroke="#cc4c4c" fill="#cc4c4c" isAnimationActive={false} />
                          <Area type="monotone" dataKey="dom_cap" stackId="1" stroke="#4c4ccc" fill="#4c4ccc" isAnimationActive={false} />
                          <Area type="monotone" dataKey="for_cap" stackId="1" stroke="#4ccc4c" fill="#4ccc4c" isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[7px] text-slate-400 font-bold uppercase border-t border-slate-50 pt-2 tracking-tight text-center">Breakdown of total income into labor wages and profits earned from domestic or foreign machine ownership.</p>
              </div>
            </>
          ) : <AboutSection />}
        </div>
      </main>
    </div>
  );
};

const VisualLegendItem = ({ color, label, type }) => (
  <div className="flex items-center space-x-3">
    <svg width="24" height="2" className="overflow-visible">
      <line 
        x1="0" y1="1" x2="24" y2="1" 
        stroke={color} 
        strokeWidth="2.5" 
        strokeDasharray={type === 'dashed' ? "4 2" : type === 'short-dash' ? "2 2" : "0"}
      />
    </svg>
    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">{label}</span>
  </div>
);

const ParamSlider = ({ label, val, min, max, step, onChange, icon, desc }) => (
  <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
    <div className="flex justify-between items-center text-[9px] font-black text-slate-600 tracking-tight">
      <div className="flex items-center space-x-1">{icon}<span>{label.toUpperCase()}</span></div>
      <span className="font-mono text-blue-700 bg-blue-100/50 px-1.5 py-0.5 rounded-md border border-blue-200/50">{val}</span>
    </div>
    <div className="relative flex items-center h-5">
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 shadow-sm" />
    </div>
    {desc && <p className="text-[8.5px] text-slate-400 font-bold italic leading-tight tracking-tight pl-1">{desc}</p>}
  </div>
);

const ChartBlock = ({ title, children, desc }) => (
  <div className="bg-white p-3 border border-slate-300 shadow-sm rounded-sm flex flex-col h-full">
    <div className="text-[8px] font-black text-slate-500 uppercase tracking-tighter mb-2 flex justify-between">{title}</div>
    <div className="flex-1">{children}</div>
    {desc && <p className="mt-2 text-[7px] text-slate-400 font-bold uppercase border-t border-slate-50 pt-1 tracking-tight leading-tight">{desc}</p>}
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-300 p-2 text-[9px] font-bold shadow-xl">
        <div className="mb-1 text-slate-400 uppercase tracking-widest border-b pb-1">Period {label}</div>
        {payload.map((entry, i) => (
          <div key={i} className="flex justify-between space-x-4">
            <span style={{ color: entry.color }}>{entry.name}:</span>
            <span className="font-mono">{entry.value.toFixed(3)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const LegendItem = ({ color, label }) => (
  <div className="flex items-center space-x-2">
    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
  </div>
);

const AboutSection = () => (
  <div className="max-w-3xl mx-auto space-y-10 py-10 px-4 bg-white border border-slate-200 shadow-sm rounded-lg">
    <div className="border-b pb-6">
      <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Technical Overview</h2>
      <p className="text-slate-500 font-medium">Modeling Task-Based Automation & Cross-Border Capital Shifts</p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <section className="space-y-3">
        <h3 className="text-xs font-black uppercase text-blue-600 flex items-center"><Layers className="w-4 h-4 mr-2" /> Production Function</h3>
        <div className="text-sm text-slate-600 leading-relaxed">
          The engine uses a task-based framework where output is produced by capital and labor across a continuum of tasks. Automation ($\beta$) shifts tasks from labor to capital.
          <div className="my-2 p-2 bg-slate-50 rounded font-mono text-center font-mono text-[10px]">
            {'Y = A * K^gamma * [(beta^(1-rho) * K^rho + (1-beta)^(1-rho) * L^rho)^(1/rho)]^(1-gamma)'}
          </div>
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="text-xs font-black uppercase text-indigo-600 flex items-center"><TrendingUp className="w-4 h-4 mr-2" /> Global Market Clearing</h3>
        <p className="text-sm text-slate-600 leading-relaxed">Capital flows globally to equalize <strong>net</strong> returns. Investors face a friction ($\omega$) when moving capital across borders.</p>
      </section>
      <section className="space-y-3">
        <h3 className="text-xs font-black uppercase text-red-600 flex items-center"><TrendingDown className="w-4 h-4 mr-2" /> The Starvation Gap</h3>
        <p className="text-sm text-slate-600 leading-relaxed">A counterfactual metric: the percentage of capital a country "loses" because its technological level lags behind the global frontier.</p>
      </section>
      <section className="space-y-3">
        <h3 className="text-xs font-black uppercase text-emerald-600 flex items-center"><Clock className="w-4 h-4 mr-2" /> Rational Foresight</h3>
        <p className="text-sm text-slate-600 leading-relaxed">Agents adjust savings rates based on projected future returns ($t+l$), ensuring investment today is rationalized by the future global landscape.</p>
      </section>
    </div>
  </div>
);

export default App;