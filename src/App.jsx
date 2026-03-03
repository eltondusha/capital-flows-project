import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ComposedChart, Bar, ReferenceLine
} from 'recharts';
import {
  Globe, Settings, Activity, TrendingUp, Layers, RefreshCw,
  ChevronRight, Info, Database, TrendingDown, Layout, HelpCircle, BookOpen, FileText, Zap, Timer, PauseCircle
} from 'lucide-react';

// --- MATH ENGINE (Direct Translation from MATLAB Logic) ---

const get_y = (k, bt, rho, gamma, A, L) => {
  const task_agg = Math.max(1e-12, Math.pow(bt, 1 - rho) * Math.pow(k, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho));
  return A * Math.pow(k, gamma) * Math.pow(task_agg, (1 - gamma) / rho);
};

const get_r = (k, bt, rho, gamma, A, L, delta) => {
  if (k <= 1e-12) return 0.5;
  const task_agg = Math.max(1e-12, Math.pow(bt, 1 - rho) * Math.pow(k, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho));
  const y = get_y(k, bt, rho, gamma, A, L);
  const mpk = (gamma + (1 - gamma) * (Math.pow(bt, 1 - rho) * Math.pow(k, rho)) / task_agg) * (y / k);
  return mpk - delta;
};

const solve_ki_for_r = (r_target, bt, delta, A, L, gamma, rho) => {
  let low = 1e-12, high = 1e8;
  const f = (k) => get_r(k, bt, rho, gamma, A, L, delta) - r_target;
  if (f(low) < 0) return low;
  if (f(high) > 0) return high;
  for (let i = 0; i < 60; i++) {
    let mid = Math.exp((Math.log(low) + Math.log(high)) / 2);
    if (f(mid) > 0) low = mid; else high = mid;
  }
  return (low + high) / 2;
};

const calculate_ki_regime = (r_ref, V_vec, bt, delta, A, L, gamma, rho, w) => {
  const n = V_vec.length;
  const Ki_vec = new Array(n);
  const aut_flags = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const r_local_at_V = get_r(V_vec[i], bt[i], rho, gamma, A[i], L[i], delta);
    if (r_local_at_V > r_ref + w[i]) {
      Ki_vec[i] = solve_ki_for_r(r_ref + w[i], bt[i], delta, A[i], L[i], gamma, rho);
    } else if (r_local_at_V < r_ref) {
      Ki_vec[i] = solve_ki_for_r(r_ref, bt[i], delta, A[i], L[i], gamma, rho);
    } else {
      Ki_vec[i] = V_vec[i];
      aut_flags[i] = 1;
    }
  }
  return { Ki_vec, aut_flags };
};

const solve_market_regime = (V_vec, bt, delta, A, L, gamma, rho, w) => {
  const V_total = V_vec.reduce((a, b) => a + b, 0);
  const obj_r = (r_test) => {
    const { Ki_vec } = calculate_ki_regime(r_test, V_vec, bt, delta, A, L, gamma, rho, w);
    return Ki_vec.reduce((a, b) => a + b, 0) - V_total;
  };
  let low = -0.049, high = 5.0;
  for (let i = 0; i < 60; i++) {
    let mid = (low + high) / 2;
    if (obj_r(mid) > 0) low = mid; else high = mid;
  }
  return calculate_ki_regime(low, V_vec, bt, delta, A, L, gamma, rho, w);
};

const SCENARIOS = [
  { id: 'hype', name: 'Scenario 1: Hype Cycle', description: "Early peak in perceived tech adoption drives boom-bust capital cycles." },
  { id: 'tidal', name: 'Scenario 2: Tidal Flow', description: "Standard S-curve diffusion with fixed temporal lags across regions." },
  { id: 'logjam', name: 'Scenario 3: Logjam', description: "Staged adoption wave hits a structural innovation plateau before recovery." },
  { id: 'gulf', name: 'Scenario 4: The Gulf', description: "Permanent developmental divide where followers fail to bridge the tech gap." }
];

const App = () => {
  const [activeView, setActiveView] = useState('dashboard');
  const [mode, setMode] = useState('3C'); 
  const [activeScenario, setActiveScenario] = useState('tidal');
  const [showExplainers, setShowExplainers] = useState(true);
  const [params, setParams] = useState({
    sigma: 0.4, delta: 0.05, phi: 0.25, gamma: 0.33,
    r_target: 0.04, l: 3, lag: 6, periods: 40, plateau: 8,
    g1: 0, g2: 0, g3: 0,
    w1: 0.01, w2: 0.001, w3: 0.002
  });

  const simulationResults = useMemo(() => {
    const { sigma, delta, phi, gamma, r_target, l, lag, g1, g2, g3, w1, w2, w3, periods: T_sim, plateau } = params;
    const rho = (sigma - 1) / sigma;
    const T = 60;
    const n = mode === '2C' ? 2 : 3;
    const b_start = 0.001;

    const L_vec = n === 2 ? [5.0, 1.0] : [5.0, 3.0, 3.0];
    const A_0 = n === 2 ? [1.25, 1.0] : [1.25, 1.0, 0.8];
    const g_vec = [g1, g2, g3];
    const w_vec = [w1, w2, w3];
    const t_axis = Array.from({ length: T + 1 }, (_, i) => i);

    const beta_paths = Array.from({ length: n }, () => Array(T + 1).fill(b_start));
    let bP_A_extended = Array(T + 1).fill(b_start);

    if (activeScenario === 'hype') {
      const bA1 = t_axis.map(t => b_start + (0.05 - b_start) / (1 + Math.exp(-0.8 * (t - 5))));
      const s_peak = t_axis.map(t => (1 / (1 + Math.exp(-2.5 * (t - 3)))) * (1 / (1 + Math.exp(1.8 * (t - 7)))));
      const s_trough = t_axis.map(t => (1 / (1 + Math.exp(-1.2 * (t - 10)))) * (1 / (1 + Math.exp(0.6 * (t - 20)))));
      beta_paths[0] = bA1; beta_paths[1] = [...bA1];
      if (n === 3) beta_paths[2] = Array(T + 1).fill(b_start);
      bP_A_extended = bA1.map((v, i) => Math.max(1e-6, v + 0.4 * s_peak[i] - 0.05 * s_trough[i]));
    } else if (activeScenario === 'tidal') {
      const bA2 = t_axis.map(t => b_start + 0.5 / (1 + Math.exp(-0.4 * (t - 15))));
      beta_paths[0] = bA2;
      beta_paths[1] = t_axis.map((_, t) => t < lag ? b_start : bA2[t - lag]);
      if (n === 3) beta_paths[2] = t_axis.map((_, t) => t < 2 * lag ? b_start : bA2[t - 2 * lag]);
      bP_A_extended = [...bA2];
    } else if (activeScenario === 'logjam') {
      const mid1 = 8;
      const mid2 = mid1 + 8 + plateau;
      const bA3 = t_axis.map(t => b_start + (0.25 / (1 + Math.exp(-0.8 * (t - mid1)))) + (0.30 / (1 + Math.exp(-0.8 * (t - mid2)))));
      beta_paths[0] = bA3;
      beta_paths[1] = t_axis.map((_, t) => t < lag ? b_start : bA3[t - lag]);
      if (n === 3) beta_paths[2] = t_axis.map((_, t) => t < 2 * lag ? b_start : bA3[t - 2 * lag]);
      bP_A_extended = [...bA3];
    } else { 
      const bA4 = t_axis.map(t => b_start + (0.5 / (1 + Math.exp(-0.6 * (t - 10)))) + (0.4 / (1 + Math.exp(-0.8 * (t - 22)))));
      beta_paths[0] = bA4;
      beta_paths[1] = bA4.map(v => 0.1 * v);
      if (n === 3) beta_paths[2] = Array(T + 1).fill(b_start);
      bP_A_extended = [...bA4];
    }

    const K_init_vec = A_0.map(a => solve_ki_for_r(r_target, b_start, delta, a, 1.0, gamma, rho));
    const Y_initial_pc = K_init_vec.map((ki, i) => get_y(ki, b_start, rho, gamma, A_0[i], 1.0));
    const s_base_vec = K_init_vec.map((ki, i) => (delta * ki) / Y_initial_pc[i]);

    let P = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? K_init_vec[i] * L_vec[i] : 0)));
    const pipelines = Array.from({ length: n }, (_, i) => Array(T + l + 10).fill(delta * K_init_vec[i] * L_vec[i]));
    const history = [];
    let s_guess = [...s_base_vec];

    const bP_paths_ext = beta_paths.map(p => [...p, ...Array(l + 10).fill(p[T])]);
    const bP_A_ext = [...bP_A_extended, ...Array(l + 10).fill(bP_A_extended[T])];

    let Y_base_absolute = [];

    for (let t = 0; t < T_sim; t++) {
      const K_curr = Array(n).fill(0).map((_, j) => P.reduce((sum, row) => sum + row[j], 0));
      const V_curr = P.map(row => row.reduce((a, b) => a + b, 0));
      const bt_r = beta_paths.map(p => p[t]);
      const A_curr = A_0.map((a, i) => a * Math.pow(1 + g_vec[i], t));

      const Y = Array(n).fill(0).map((_, i) => get_y(K_curr[i], bt_r[i], rho, gamma, A_curr[i], L_vec[i]));
      if (t === 0) Y_base_absolute = [...Y];
      
      const r_real = Array(n).fill(0).map((_, i) => get_r(K_curr[i], bt_r[i], rho, gamma, A_curr[i], L_vec[i], delta));
      
      const labor_inc = Y.map((y, i) => y - (r_real[i] + delta) * K_curr[i]);
      const cap_income = Array(n).fill(0).map((_, row) => {
        let inc = 0;
        for (let col = 0; col < n; col++) { inc += P[row][col] * (r_real[col] + delta - (row !== col ? w_vec[col] : 0)); }
        return inc;
      });
      const GNI = labor_inc.map((li, i) => li + cap_income[i]);
      const LS = labor_inc.map((li, i) => li / (GNI[i] + 1e-12));
      const v_pc = V_curr.map((v, i) => v / L_vec[i]);
      const wealth_share = v_pc.map(v => (v / v_pc.reduce((a, b) => a + b, 0)) * 100);

      const idx_f = Math.min(T, t + l);
      const bt_f = bP_paths_ext.map((p, i) => i === 0 ? bP_A_ext[idx_f] : p[idx_f]);
      const A_f = A_0.map((a, i) => a * Math.pow(1 + g_vec[i], idx_f));
      const V_fixed = V_curr.map((v, i) => {
        let surv = v * Math.pow(1 - delta, l);
        for (let m = 1; m < l; m++) { surv += pipelines[i][t + m] * Math.pow(1 - delta, l - m); }
        return surv;
      });

      for (let iter = 0; iter < 50; iter++) {
        const V_proj = V_fixed.map((v, i) => v + s_guess[i] * GNI[i]);
        const { Ki_vec } = solve_market_regime(V_proj, bt_f, delta, A_f, L_vec, gamma, rho, w_vec);
        const r_yield = Ki_vec.map((k, i) => {
          const r_raw = get_r(k, bt_f[i], rho, gamma, A_f[i], L_vec[i], delta);
          return r_raw - (k > V_proj[i] + 1e-7 ? w_vec[i] : 0);
        });
        const s_new = s_base_vec.map((sb, i) => Math.max(0, sb + phi * (r_yield[i] - r_target)));
        if (Math.max(...s_new.map((v, i) => Math.abs(v - s_guess[i]))) < 1e-6) break;
        s_guess = s_new;
      }

      pipelines.forEach((p, i) => { p[t + l] = s_guess[i] * GNI[i]; });

      const K_prev = [...K_curr];
      P = P.map(row => row.map(v => v * (1 - delta)));
      for (let i = 0; i < n; i++) P[i][i] += pipelines[i][t + 1];
      const V_new = P.map(row => row.reduce((a, b) => a + b, 0));
      const bt_next = bP_paths_ext.map((p, i) => i === 0 ? bP_A_ext[t + 1] : p[t + 1]);
      const A_next = A_0.map((a, i) => a * Math.pow(1 + g_vec[i], t + 1));
      const { Ki_vec: K_target } = solve_market_regime(V_new, bt_next, delta, A_next, L_vec, gamma, rho, w_vec);
      const V_tot_new = V_new.reduce((a, b) => a + b, 0);
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (V_tot_new > 1e-9) P[r][c] = V_new[r] * (K_target[c] / V_tot_new);
        }
      }

      history.push({
        t,
        beta1: bt_r[0], beta2: bt_r[1], beta3: bt_r[2] || 0,
        betaP: activeScenario === 'hype' ? bP_A_ext[t] : null,
        Y1: (Y[0] / Y_base_absolute[0]) * 100, Y2: (Y[1] / Y_base_absolute[1]) * 100, Y3: n === 3 ? (Y[2] / Y_base_absolute[2]) * 100 : 0,
        r1: r_real[0] * 100, r2: r_real[1] * 100, r3: (r_real[2] || 0) * 100,
        s1: s_guess[0], s2: s_guess[1], s3: s_guess[2] || 0,
        sh1: wealth_share[0], sh2: wealth_share[1], sh3: wealth_share[2] || 0,
        ls1: LS[0], ls2: LS[1], ls3: LS[2] || 0,
        be1: ((K_target[0] - (1 - delta) * K_prev[0]) - delta * K_prev[0]) / L_vec[0],
        be2: ((K_target[1] - (1 - delta) * K_prev[1]) - delta * K_prev[1]) / L_vec[1],
        be3: n === 3 ? ((K_target[2] - (1 - delta) * K_prev[2]) - delta * K_prev[2]) / L_vec[2] : 0,
        GNI1: GNI[0] / (history[0]?.GNI_raw1 || GNI[0]) * 100,
        GNI2: GNI[1] / (history[0]?.GNI_raw2 || GNI[1]) * 100,
        GNI3: GNI[2] / (history[0]?.GNI_raw3 || GNI[2] || 1) * 100,
        GNI_raw1: GNI[0], GNI_raw2: GNI[1], GNI_raw3: GNI[2] || 0
      });
    }
    return history;
  }, [mode, activeScenario, params]);

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
      {/* SIDEBAR */}
      <aside className="w-80 bg-white border-r border-slate-300 flex flex-col shadow-xl z-20">
        <div className="p-4 border-b border-slate-200 flex items-center space-x-3 bg-slate-900 text-white">
          <Globe className="w-5 h-5 text-blue-400" />
          <h1 className="font-black text-[11px] tracking-[0.2em] uppercase">Simulation App</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-8 scrollbar-hide">
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {['dashboard', 'about'].map(v => (
              <button key={v} onClick={() => setActiveView(v)} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-md transition-all ${activeView === v ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>{v}</button>
            ))}
          </div>
          {activeView === 'dashboard' && (
            <>
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
                {['2C', '3C'].map(m => (
                  <button key={m} onClick={() => setMode(m)} className={`py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${mode === m ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>{m === '2C' ? '2-Country' : '3-Country'}</button>
                ))}
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Scenarios</label>
                {SCENARIOS.map(s => (
                  <button key={s.id} onClick={() => setActiveScenario(s.id)} className={`w-full p-2.5 text-left rounded-lg border text-[10px] font-bold transition-all ${activeScenario === s.id ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>{s.name.toUpperCase()}</button>
                ))}
              </div>
              <div className="space-y-6 pt-2 border-t border-slate-100">
                <ParamSlider label="Simulation Periods" val={params.periods} min={10} max={60} step={1} onChange={v => setParams({...params, periods: v})} icon={<Timer className="w-3 h-3" />} />
                <ParamSlider label="Gestation Lag (l)" val={params.l} min={1} max={10} step={1} onChange={v => setParams({...params, l: v})} />
                <ParamSlider label="Diffusion Lag" val={params.lag} min={1} max={20} step={1} onChange={v => setParams({...params, lag: v})} />
                {activeScenario === 'logjam' && (
                  <ParamSlider label="Logjam Lag" val={params.plateau} min={0} max={20} step={1} onChange={v => setParams({...params, plateau: v})} icon={<PauseCircle className="w-3 h-3 text-rose-500" />} />
                )}
                <ParamSlider label="Savings Sensitivity (φ)" val={params.phi} min={0} max={1} step={0.05} onChange={v => setParams({...params, phi: v})} />
                <div className="space-y-4 pt-4 border-t border-slate-50">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Growth Rates (g)</label>
                  <ParamSlider label="g1" val={params.g1} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, g1: v})} />
                  <ParamSlider label="g2" val={params.g2} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, g2: v})} />
                  {mode === '3C' && <ParamSlider label="g3" val={params.g3} min={0} max={0.05} step={0.001} onChange={v => setParams({...params, g3: v})} />}
                </div>
                <div className="space-y-4 pt-4 border-t border-slate-50">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block text-blue-600">Profit Tax (ω)</label>
                  <ParamSlider label="ω1" val={params.w1} min={0} max={0.1} step={0.001} onChange={v => setParams({...params, w1: v})} />
                  <ParamSlider label="ω2" val={params.w2} min={0} max={0.1} step={0.001} onChange={v => setParams({...params, w2: v})} />
                  {mode === '3C' && <ParamSlider label="ω3" val={params.w3} min={0} max={0.1} step={0.001} onChange={v => setParams({...params, w3: v})} />}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-10 bg-white border-b border-slate-300 px-6 flex items-center justify-between shadow-sm">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em]">{activeView === 'dashboard' ? SCENARIOS.find(s => s.id === activeScenario).name : 'Logic Documentation'}</h2>
          {activeView === 'dashboard' && (
            <button onClick={() => setShowExplainers(!showExplainers)} className="flex items-center space-x-1 text-[9px] font-black uppercase tracking-widest text-blue-600"><BookOpen className="w-3 h-3" /><span>{showExplainers ? 'Hide Explainers' : 'Show Explainers'}</span></button>
          )}
        </header>
        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          {activeView === 'dashboard' ? (
            <>
              {showExplainers && (
                <div className="mb-6 grid grid-cols-3 xl:grid-cols-6 gap-3">
                  <ExplainerCard icon={<Database className="w-3.5 h-3.5" />} title="Gestation" text="Delay between investment and productive capital." color="border-blue-500" />
                  <ExplainerCard icon={<Layers className="w-3.5 h-3.5" />} title="Diffusion Lag" text="Time taken for Leader innovations to spread globally." color="border-indigo-500" />
                  <ExplainerCard icon={<PauseCircle className="w-3.5 h-3.5" />} title="Logjam Lag" text="Stall period between adoption waves." color="border-rose-500" />
                  <ExplainerCard icon={<TrendingUp className="w-3.5 h-3.5" />} title="Growth Rates" text="Productivity growth paths per country." color="border-emerald-500" />
                  <ExplainerCard icon={<RefreshCw className="w-3.5 h-3.5" />} title="Sensitivity" text="How savings respond to return spreads." color="border-amber-500" />
                  <ExplainerCard icon={<TrendingDown className="w-3.5 h-3.5" />} title="Profit Tax" text="Tax foreigners pay on earnings in a country." color="border-rose-500" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 items-start">
                <ChartBlock title="Tech Adoption (β)"><ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Tooltip content={<SimpleTooltip />} /><Line type="monotone" dataKey="beta1" name="Leader" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="beta2" name="Follower" stroke="#ff0000" strokeWidth={1.5} dot={false} strokeDasharray="5 5" isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="beta3" name="Laggard" stroke="#00aa00" strokeWidth={1.5} dot={false} strokeDasharray="3 3" isAnimationActive={false} />}{activeScenario === 'hype' && <Line type="monotone" dataKey="betaP" name="Perceived" stroke="#0000ff" strokeWidth={1} dot={false} strokeDasharray="2 2" opacity={0.3} isAnimationActive={false} />}</LineChart></ResponsiveContainer></ChartBlock>
                <ChartBlock title="Output Index (Y)"><ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Line type="monotone" dataKey="Y1" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="Y2" stroke="#ff0000" strokeWidth={1.5} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="Y3" stroke="#00aa00" strokeWidth={1.5} dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer></ChartBlock>
                <ChartBlock title="Realized Returns (%)"><ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Line type="monotone" dataKey="r1" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="r2" stroke="#ff0000" strokeWidth={1.5} dot={false} strokeDasharray="5 5" isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="r3" stroke="#00aa00" strokeWidth={1.5} dot={false} strokeDasharray="3 3" isAnimationActive={false} />}</LineChart></ResponsiveContainer></ChartBlock>
                <ChartBlock title="Savings Rate (s)"><ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Line type="monotone" dataKey="s1" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="s2" stroke="#ff0000" strokeWidth={1.5} dot={false} strokeDasharray="5 5" isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="s3" stroke="#00aa00" strokeWidth={1.5} dot={false} strokeDasharray="3 3" isAnimationActive={false} />}</LineChart></ResponsiveContainer></ChartBlock>
                <ChartBlock title="Wealth Share % (p.c.)"><ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Line type="monotone" dataKey="sh1" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="sh2" stroke="#ff0000" strokeWidth={1.5} dot={false} strokeDasharray="5 5" isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="sh3" stroke="#00aa00" strokeWidth={1.5} dot={false} strokeDasharray="3 3" isAnimationActive={false} />}</LineChart></ResponsiveContainer></ChartBlock>
                <ChartBlock title="Labour Share GNI"><ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Line type="monotone" dataKey="ls1" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="ls2" stroke="#ff0000" strokeWidth={1.5} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="ls3" stroke="#00aa00" strokeWidth={1.5} dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer></ChartBlock>
                <ChartBlock title="Break-even Gap p.c."><ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><ReferenceLine y={0} stroke="#475569" strokeWidth={1} /><Line type="monotone" dataKey="be1" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="be2" stroke="#ff0000" strokeWidth={1.5} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="be3" stroke="#00aa00" strokeWidth={1.5} dot={false} strokeDasharray="3 3" isAnimationActive={false} />}</LineChart></ResponsiveContainer></ChartBlock>
                <ChartBlock title="GNI Index (Base=100)"><ResponsiveContainer width="100%" height={140}><LineChart data={simulationResults} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="t" fontSize={8} /><YAxis fontSize={8} domain={['auto', 'auto']} /><Line type="monotone" dataKey="GNI1" stroke="#0000ff" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="GNI2" stroke="#ff0000" strokeWidth={1.5} dot={false} isAnimationActive={false} />{mode === '3C' && <Line type="monotone" dataKey="GNI3" stroke="#00aa00" strokeWidth={1.5} dot={false} isAnimationActive={false} />}</LineChart></ResponsiveContainer></ChartBlock>
              </div>
            </>
          ) : (
            <AboutPage />
          )}
        </div>
      </main>
    </div>
  );
};

const ExplainerCard = ({ icon, title, text, color }) => (
  <div className={`bg-slate-900 text-white p-3 rounded shadow-lg border-l-4 ${color}`}><div className="flex items-center space-x-2 mb-1 text-blue-400">{icon}<span className="text-[8px] font-black uppercase tracking-widest">{title}</span></div><p className="text-[9px] leading-tight text-slate-300">{text}</p></div>
);

const AboutPage = () => (
  <div className="max-w-4xl mx-auto bg-white p-10 shadow-2xl space-y-12 rounded-sm">
    <div className="border-b border-slate-100 pb-6 flex items-center space-x-4"><div className="bg-blue-600 p-3 rounded-xl text-white"><BookOpen className="w-6 h-6" /></div><div><h2 className="text-2xl font-black uppercase tracking-tight text-slate-800 leading-none">Logic Documentation</h2><p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-1">Layman's Guide to Capital Flows</p></div></div>
    <section><h3 className="text-lg font-black text-blue-600 mb-3 uppercase flex items-center tracking-tight"><ChevronRight className="w-5 h-5 mr-1" /> The Core Concept</h3><p className="text-slate-600 leading-relaxed italic">Think of "Capital" as the machines and software needed for production. When one country discovers a better way to work (Tech Adoption), it becomes more profitable to invest there, drawing money away from other nations.</p></section>
    <section><h3 className="text-lg font-black text-blue-600 mb-4 uppercase flex items-center tracking-tight"><ChevronRight className="w-5 h-5 mr-1" /> Scenario Analysis</h3><div className="grid grid-cols-2 gap-4">
      <AboutCard icon={<Zap className="text-amber-500" />} title="Hype Cycle" text="A 'bubble' where tech expectations outpace reality early on, causing spikes in returns before a correction." />
      <AboutCard icon={<Layers className="text-blue-500" />} title="Tidal Flow" text="The baseline. Tech adopts in an S-curve, with diffusion lags between countries pulling capital back and forth." />
      <AboutCard icon={<PauseCircle className="text-rose-500" />} title="Logjam" text="A structural stall where progress hits a plateau after initial adoption, creating stagnation before a second wave." />
      <AboutCard icon={<Globe className="text-emerald-500" />} title="The Gulf" text="Permanent divergence where followers fail to adopt, leading to massive, long-term capital flight to the leader." />
    </div></section>
    <section><div className="grid grid-cols-3 gap-6">
      <RoleCard title="Leader" text="Adopts tech first. Sees high returns early but must save aggressively to sustain growth." color="bg-blue-50 border-blue-100 text-blue-800" underline="decoration-blue-200" />
      <RoleCard title="Follower" text="Adopts with a lag. Suffers from capital exiting early to chase the leader's boom." color="bg-red-50 border-red-100 text-red-800" underline="decoration-red-200" />
      <RoleCard title="Laggard" text="Stays structurally behind. Often becomes a capital exporter as wealth leaves for productive neighbors." color="bg-emerald-50 border-emerald-100 text-emerald-800" underline="decoration-emerald-200" />
    </div></section>
    <section><h3 className="text-lg font-black text-blue-600 mb-3 uppercase flex items-center tracking-tight"><ChevronRight className="w-5 h-5 mr-1" /> Key Mechanisms</h3><div className="space-y-4">
      <Mechanism title="Gestation & Foresight" text="Wealth isn't instant. People save today for productive capital in years, requiring accurate predictions of future returns." />
      <Mechanism title="Savings Sensitivity" text="Determines how aggressively savings respond to interest rates (return spreads) between countries." />
      <Mechanism title="Diffusion Lag" text="New technologies don't spread instantly. It takes time for innovations to reach other countries, creating a development delay." />
      <Mechanism title="Logjam Lag (Plateau)" text="Represents a structural barrier or bottleneck that stalls technological adoption between two distinct waves of innovation." />
      <Mechanism title="Profit Tax" text="A tax foreigners pay on earnings earned in that country. Higher taxes make a country less attractive for international capital." />
    </div></section>
  </div>
);

const AboutCard = ({ icon, title, text }) => (
  <div className="p-5 bg-slate-50 border border-slate-200"><div className="flex items-center space-x-2 mb-2">{icon}<h4 className="font-black text-xs uppercase text-slate-800">{title}</h4></div><p className="text-[11px] text-slate-500 leading-relaxed">{text}</p></div>
);
const RoleCard = ({ title, text, color, underline }) => (
  <div className={`p-5 border ${color}`}><h4 className={`font-black text-xs uppercase mb-2 underline ${underline}`}>{title}</h4><p className="text-[11px] leading-relaxed opacity-80">{text}</p></div>
);
const Mechanism = ({ title, text }) => (
  <div className="flex items-start space-x-4"><div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" /><div><p className="font-black text-slate-800 text-xs uppercase">{title}</p><p className="text-[11px] text-slate-500">{text}</p></div></div>
);
const ChartBlock = ({ title, children }) => (
  <div className="bg-white p-2.5 border border-slate-300 shadow-sm rounded-sm"><div className="text-[7px] font-black text-slate-500 uppercase tracking-tighter mb-1.5 border-b border-slate-100 pb-1">{title}</div>{children}</div>
);
const ParamSlider = ({ label, val, min, max, step, onChange, icon }) => (
  <div className="space-y-1.5">
    <div className="flex justify-between items-center text-[8px] font-black text-slate-600 tracking-tight">
      <div className="flex items-center space-x-1">{icon}<span>{label.toUpperCase()}</span></div>
      <span className="font-mono text-blue-700 bg-blue-50 px-1 rounded">{val}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-600" />
  </div>
);
const SimpleTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-300 p-2 text-[8px] font-bold shadow-xl"><div className="mb-1 text-slate-400">T = {label}</div>{payload.map((p, i) => (
        <div key={i} className="flex justify-between space-x-3 mb-0.5"><span style={{ color: p.color }}>{p.name}:</span><span className="font-mono">{parseFloat(p.value).toFixed(3)}</span></div>
      ))}</div>
    );
  }
  return null;
};

export default App;