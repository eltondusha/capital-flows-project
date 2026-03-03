import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ComposedChart, Bar, ReferenceLine
} from 'recharts';
import {
  Globe, Settings, Activity, TrendingUp, Layers, RefreshCw,
  ChevronRight, Info, Database, TrendingDown, Layout, HelpCircle
} from 'lucide-react';

// --- MATH ENGINE ---

const get_y = (k, bt, rho, gamma, A, L) => {
  const task_agg = Math.max(1e-12, Math.pow(bt, 1 - rho) * Math.pow(k, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho));
  return A * Math.pow(k, gamma) * Math.pow(task_agg, (1 - gamma) / rho);
};

const get_r = (k, bt, rho, gamma, A, L, delta) => {
  if (k <= 1e-10) return 0.5;
  const task_agg = Math.max(1e-12, Math.pow(bt, 1 - rho) * Math.pow(k, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho));
  const y = get_y(k, bt, rho, gamma, A, L);
  const mpk = (gamma + (1 - gamma) * (Math.pow(bt, 1 - rho) * Math.pow(k, rho)) / task_agg) * (y / k);
  return mpk - delta;
};

const solve_ki_for_r = (r_target, bt, delta, A, L, gamma, rho) => {
  let low = 1e-12, high = 1e12;
  const f = (k) => get_r(k, bt, rho, gamma, A, L, delta) - r_target;
  if (f(low) < 0) return low;
  if (f(high) > 0) return high;
  for (let i = 0; i < 60; i++) {
    let mid = Math.exp((Math.log(low) + Math.log(high)) / 2);
    if (f(mid) > 0) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
};

const solve_global_market = (V_tot, bt_vec, delta, A_vec, L_vec, gamma, rho) => {
  const n = bt_vec.length;
  const obj_r = (r_test) => {
    let total_k = 0;
    for (let i = 0; i < n; i++) {
      total_k += solve_ki_for_r(r_test, bt_vec[i], delta, A_vec[i], L_vec[i], gamma, rho);
    }
    return total_k - V_tot;
  };

  let low = -0.0499, high = 10.0;
  for (let i = 0; i < 60; i++) {
    let mid = (low + high) / 2;
    if (obj_r(mid) > 0) low = mid;
    else high = mid;
  }
  const r_star = (low + high) / 2;
  return bt_vec.map((_, i) => solve_ki_for_r(r_star, bt_vec[i], delta, A_vec[i], L_vec[i], gamma, rho));
};

const SCENARIOS = [
  { id: 'hype', name: 'Scenario 1: Hype Cycle', description: "Perceived tech adoption peaks early, driving a temporary boom in returns and savings." },
  { id: 'tidal', name: 'Scenario 2: Tidal Flow', description: "Standard S-curve adoption with fixed diffusion lags across countries." },
  { id: 'logjam', name: 'Scenario 3: Logjam', description: "Multi-stage adoption with a structural stall before the final wave." },
  { id: 'gulf', name: 'Scenario 4: The Gulf', description: "Permanent divide where followers fail to catch up to the leader's adoption rate." }
];

const App = () => {
  const [mode, setMode] = useState('3C'); 
  const [activeScenario, setActiveScenario] = useState('tidal');
  const [params, setParams] = useState({
    sigma: 0.4,
    delta: 0.05,
    phi: 0.25,
    gamma: 0.33,
    r_target: 0.04,
    l_gestation: 3,
    lag: 10
  });

  const simulationResults = useMemo(() => {
    const { sigma, delta, phi, gamma, r_target, l_gestation, lag } = params;
    const rho = (sigma - 1) / sigma;
    const T = 60, T_sim = 40;
    const n = mode === '2C' ? 2 : 3;
    const b_start = 0.001;
    const b_max = 0.5;

    const L_vec = n === 2 ? [5.0, 1.0] : [5.0, 3.0, 3.0];
    const A_base = n === 2 ? [1.25, 1.0] : [1.25, 1.0, 0.8];
    const t_axis = Array.from({ length: T + 1 }, (_, i) => i);

    const beta_paths = Array.from({ length: n }, () => Array(T + 1).fill(b_start));
    let beta_perc_A = Array(T + 1).fill(b_start);

    // Scenario Generation
    if (activeScenario === 'hype') {
      const bA1 = t_axis.map(t => b_start + (0.02 - b_start) / (1 + Math.exp(-0.8 * (t - 5))));
      const s_peak = t_axis.map(t => (1 / (1 + Math.exp(-2.5 * (t - 3)))) * (1 / (1 + Math.exp(1.8 * (t - 7)))));
      const s_trough = t_axis.map(t => (1 / (1 + Math.exp(-1.2 * (t - 10)))) * (1 / (1 + Math.exp(0.6 * (t - 20)))));
      beta_paths[0] = bA1;
      beta_paths[1] = [...bA1];
      if (n === 3) beta_paths[2] = Array(T + 1).fill(b_start);
      beta_perc_A = bA1.map((v, i) => Math.max(1e-6, v + 0.4 * s_peak[i] - 0.05 * s_trough[i]));
    } else if (activeScenario === 'tidal') {
      const bA2 = t_axis.map(t => b_start + b_max / (1 + Math.exp(-0.4 * (t - 15))));
      beta_paths[0] = bA2;
      beta_paths[1] = t_axis.map(t => t < lag ? b_start : bA2[t - lag]);
      if (n === 3) beta_paths[2] = t_axis.map(t => t < 2 * lag ? b_start : bA2[t - 2 * lag]);
      beta_perc_A = [...bA2];
    } else if (activeScenario === 'logjam') {
      const bA3 = t_axis.map(t => b_start + 0.25 / (1 + Math.exp(-0.8 * (t - 10))) + 0.30 / (1 + Math.exp(-0.8 * (t - 26))));
      beta_paths[0] = bA3;
      beta_paths[1] = t_axis.map(t => t < lag ? b_start : bA3[t - lag]);
      if (n === 3) beta_paths[2] = t_axis.map(t => t < 2 * lag ? b_start : bA3[t - 2 * lag]);
      beta_perc_A = [...bA3];
    } else { 
      const bA4 = t_axis.map(t => b_start + 0.5 / (1 + Math.exp(-0.6 * (t - 10))) + 0.4 / (1 + Math.exp(-0.8 * (t - 22))));
      beta_paths[0] = bA4;
      beta_paths[1] = mode === '2C' ? t_axis.map(t => b_start + (0.02 - b_start) / (1 + Math.exp(-0.8 * (t - 5)))) : bA4.map(v => 0.1 * v);
      if (n === 3) beta_paths[2] = Array(T + 1).fill(b_start);
      beta_perc_A = [...bA4];
    }

    const K_inits = A_base.map(a => solve_ki_for_r(r_target, b_start, delta, a, 1.0, gamma, rho));
    const s_base_vec = K_inits.map((ki, i) => (delta * ki) / get_y(ki, b_start, rho, gamma, A_base[i], 1.0));

    let P = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? K_inits[i] * L_vec[i] : 0)));
    const history = [];
    const pipelines = Array.from({ length: n }, (_, i) => Array(T + l_gestation + 2).fill(delta * K_inits[i] * L_vec[i]));
    let s_guess = [...s_base_vec];

    const bP_A_extended = [...beta_perc_A, ...Array(l_gestation + 1).fill(beta_perc_A[T])];
    const b_paths_ext = beta_paths.map(p => [...p, ...Array(l_gestation + 1).fill(p[T])]);

    for (let t = 0; t < T_sim; t++) {
      const K_loc = Array(n).fill(0).map((_, j) => P.reduce((sum, row) => sum + row[j], 0));
      const bt_now = b_paths_ext.map((p, i) => i === 0 ? bP_A_extended[t] : p[t]);
      const r_real = Array(n).fill(0).map((_, i) => get_r(K_loc[i], bt_now[i], rho, gamma, A_base[i], L_vec[i], delta));
      const Y = Array(n).fill(0).map((_, i) => get_y(K_loc[i], bt_now[i], rho, gamma, A_base[i], L_vec[i]));
      
      const labor_inc = Y.map((y, i) => y - (r_real[i] + delta) * K_loc[i]);
      const cap_income = Array(n).fill(0).map((_, owner) => P[owner].reduce((sum, val, loc) => sum + val * (r_real[loc] + delta), 0));
      const GNI = labor_inc.map((li, i) => li + cap_income[i]);
      const V_total = P.map(row => row.reduce((a, b) => a + b, 0));
      const wealth_share_pc = V_total.map((v, i) => (v / L_vec[i]) / V_total.reduce((sum, vi, idx) => sum + (vi / L_vec[idx]), 0) * 100);

      // Foresight/Savings Logic
      const t_f = Math.min(T, t + l_gestation);
      const bt_f = b_paths_ext.map((p, i) => i === 0 ? bP_A_extended[t_f] : p[t_f]);
      
      for (let iter = 0; iter < 10; iter++) {
        const V_fixed = P.map((row, owner) => {
          let surv = row.reduce((a, b) => a + b, 0) * Math.pow(1 - delta, l_gestation);
          for (let m = 1; m < l_gestation; m++) surv += pipelines[owner][t + m] * Math.pow(1 - delta, l_gestation - m);
          return surv;
        });
        const V_tot_f = V_fixed.reduce((a, b) => a + b, 0) + s_guess.reduce((sum, s, i) => sum + s * GNI[i], 0);
        const K_target_f = solve_global_market(V_tot_f, bt_f, delta, A_base, L_vec, gamma, rho);
        const r_perc_f = K_target_f.map((ki, i) => get_r(ki, bt_f[i], rho, gamma, A_base[i], L_vec[i], delta));
        s_guess = s_base_vec.map((sb, i) => Math.max(0, sb + phi * (r_perc_f[i] - r_target)));
      }

      s_guess.forEach((s, i) => { pipelines[i][t + l_gestation] = s * GNI[i]; });

      // Evolution for Break-even and Capital Split
      const K_prev = [...K_loc];
      P = P.map(row => row.map(v => v * (1 - delta)));
      for (let i = 0; i < n; i++) P[i][i] += pipelines[i][t + 1];

      const V_new_total = P.map(row => row.reduce((a, b) => a + b, 0));
      const V_tot_world = V_new_total.reduce((a, b) => a + b, 0);
      const bt_next = b_paths_ext.map((p, i) => i === 0 ? bP_A_extended[t + 1] : p[t + 1]);
      const K_next = solve_global_market(V_tot_world, bt_next, delta, A_base, L_vec, gamma, rho);

      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (V_tot_world > 1e-9) P[r][c] = V_new_total[r] * (K_next[c] / V_tot_world);
        }
      }

      history.push({
        t,
        K1: K_loc[0], K2: K_loc[1], K3: K_loc[2] || 0,
        r1: r_real[0] * 100, r2: r_real[1] * 100, r3: (r_real[2] || 0) * 100,
        s1: s_guess[0], s2: s_guess[1], s3: s_guess[2] || 0,
        sh1: wealth_share_pc[0], sh2: wealth_share_pc[1], sh3: wealth_share_pc[2] || 0,
        ls1: labor_inc[0] / GNI[0], ls2: labor_inc[1] / GNI[1], ls3: labor_inc[2] ? (labor_inc[2] / GNI[2]) : 0,
        be1: ((K_next[0] - (1 - delta) * K_prev[0]) - delta * K_prev[0]) / L_vec[0],
        be2: ((K_next[1] - (1 - delta) * K_prev[1]) - delta * K_prev[1]) / L_vec[1],
        be3: K_next[2] ? (((K_next[2] - (1 - delta) * K_prev[2]) - delta * K_prev[2]) / L_vec[2]) : 0,
        GNI1: GNI[0] / (history[0]?.GNI1_raw || GNI[0]) * 100,
        GNI2: GNI[1] / (history[0]?.GNI2_raw || GNI[1]) * 100,
        GNI3: GNI[2] / (history[0]?.GNI3_raw || GNI[2] || 1) * 100,
        GNI1_raw: GNI[0], GNI2_raw: GNI[1], GNI3_raw: GNI[2] || 0,
        beta1: bt_now[0], beta2: bt_now[1], beta3: bt_now[2] || 0,
        betaP: (activeScenario === 'hype') ? beta_perc_A[t] : null
      });
    }
    return history;
  }, [mode, activeScenario, params]);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl z-20">
        <div className="p-6 border-b border-slate-100 flex items-center space-x-3 bg-white">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg">
            <Globe className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-black text-slate-800 text-lg leading-tight">CAPITAL FLOWS</h1>
            <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Multi-Country Engine</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
          <section>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block">World Topology</label>
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
              {['2C', '3C'].map(m => (
                <button key={m} onClick={() => setMode(m)} className={`py-2 text-xs font-bold rounded-lg transition-all ${mode === m ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>
                  {m === '2C' ? '2-Country' : '3-Country'}
                </button>
              ))}
            </div>
          </section>

          <section>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block">Active Scenario</label>
            <div className="space-y-2">
              {SCENARIOS.map(s => (
                <button key={s.id} onClick={() => setActiveScenario(s.id)} className={`w-full p-3 text-left rounded-xl border text-[11px] font-black transition-all flex items-center justify-between ${activeScenario === s.id ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300'}`}>
                  <span>{s.name.toUpperCase()}</span>
                  {activeScenario === s.id && <ChevronRight className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Parameters</label>
            <ParamSlider label="σ (Elasticity)" val={params.sigma} min={0.1} max={0.9} step={0.1} onChange={v => setParams({...params, sigma: v})} />
            <ParamSlider label="γ (Capital Share)" val={params.gamma} min={0.25} max={0.45} step={0.01} onChange={v => setParams({...params, gamma: v})} />
            <ParamSlider label="φ (Behavioral)" val={params.phi} min={0} max={1} step={0.05} onChange={v => setParams({...params, phi: v})} />
            <ParamSlider label="Lag Duration" val={params.lag} min={2} max={20} step={1} onChange={v => setParams({...params, lag: v})} />
          </section>
        </div>
      </aside>

      {/* Main Dashboard */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xs font-black uppercase tracking-widest flex items-center text-slate-600">
            <Activity className="w-4 h-4 mr-2 text-indigo-500" /> Impulse Response Matrix
          </h2>
          <div className="bg-indigo-900 text-white px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest flex items-center space-x-2">
             <span>{SCENARIOS.find(s => s.id === activeScenario).name.toUpperCase()}</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            
            {/* ROW 1: TECH & CAPITAL */}
            <ChartTile title="Tech Adoption (β)">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={simulationResults}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="t" hide />
                  <YAxis fontSize={9} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="beta1" name="Leader" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="beta2" name="Follower" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                  {mode === '3C' && <Line type="monotone" dataKey="beta3" name="Laggard" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 4" />}
                  {activeScenario === 'hype' && <Line type="monotone" dataKey="betaP" name="Perceived" stroke="#6366f1" strokeWidth={1} dot={false} strokeDasharray="2 2" opacity={0.5} />}
                </LineChart>
              </ResponsiveContainer>
            </ChartTile>

            <ChartTile title="Physical Capital (K)">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={simulationResults}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="t" hide />
                  <YAxis fontSize={9} />
                  <Line type="monotone" dataKey="K1" name="C1" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="K2" name="C2" stroke="#10b981" strokeWidth={2} dot={false} />
                  {mode === '3C' && <Line type="monotone" dataKey="K3" name="C3" stroke="#f59e0b" strokeWidth={2} dot={false} />}
                </LineChart>
              </ResponsiveContainer>
            </ChartTile>

            {/* ROW 2: RETURNS & SAVINGS */}
            <ChartTile title="Realized Returns (%)">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={simulationResults}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="t" hide />
                  <YAxis fontSize={9} />
                  <Area type="monotone" dataKey="r1" name="R1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.05} strokeWidth={2} />
                  <Area type="monotone" dataKey="r2" name="R2" stroke="#10b981" fill="none" strokeDasharray="4 4" strokeWidth={2} />
                  {mode === '3C' && <Area type="monotone" dataKey="r3" name="R3" stroke="#f59e0b" fill="none" strokeDasharray="4 4" strokeWidth={2} />}
                </AreaChart>
              </ResponsiveContainer>
            </ChartTile>

            <ChartTile title="Savings Rate (s)">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={simulationResults}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="t" hide />
                  <YAxis fontSize={9} domain={['auto', 'auto']} />
                  <Line type="monotone" dataKey="s1" name="s1" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="s2" name="s2" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                  {mode === '3C' && <Line type="monotone" dataKey="s3" name="s3" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 4" />}
                </LineChart>
              </ResponsiveContainer>
            </ChartTile>

            {/* ROW 3: WEALTH & LABOUR */}
            <ChartTile title="Wealth Share % (p.c.)">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={simulationResults}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="t" hide />
                  <YAxis fontSize={9} domain={[0, 100]} />
                  <Line type="monotone" dataKey="sh1" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sh2" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                  {mode === '3C' && <Line type="monotone" dataKey="sh3" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 4" />}
                </LineChart>
              </ResponsiveContainer>
            </ChartTile>

            <ChartTile title="Labour Share of GNI">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={simulationResults}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="t" hide />
                  <YAxis fontSize={9} domain={['auto', 'auto']} />
                  <Line type="monotone" dataKey="ls1" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ls2" stroke="#10b981" strokeWidth={2} dot={false} />
                  {mode === '3C' && <Line type="monotone" dataKey="ls3" stroke="#f59e0b" strokeWidth={2} dot={false} />}
                </LineChart>
              </ResponsiveContainer>
            </ChartTile>

            {/* ROW 4: BREAK-EVEN & GNI */}
            <ChartTile title="Break-even Gap p.c.">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={simulationResults}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="t" hide />
                  <YAxis fontSize={9} />
                  <ReferenceLine y={0} stroke="#475569" strokeWidth={1} />
                  <Line type="monotone" dataKey="be1" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="be2" stroke="#10b981" strokeWidth={2} dot={false} />
                  {mode === '3C' && <Line type="monotone" dataKey="be3" stroke="#f59e0b" strokeWidth={2} dot={false} />}
                </LineChart>
              </ResponsiveContainer>
            </ChartTile>

            <ChartTile title="GNI Index">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={simulationResults}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="t" fontSize={9} />
                  <YAxis fontSize={9} />
                  <Line type="monotone" dataKey="GNI1" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="GNI2" stroke="#10b981" strokeWidth={2} dot={false} />
                  {mode === '3C' && <Line type="monotone" dataKey="GNI3" stroke="#f59e0b" strokeWidth={2} dot={false} />}
                </LineChart>
              </ResponsiveContainer>
            </ChartTile>

          </div>
        </div>
      </main>
    </div>
  );
};

// --- SUB-COMPONENTS ---

const ChartTile = ({ title, children }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2">{title}</div>
    {children}
  </div>
);

const ParamSlider = ({ label, val, min, max, step, onChange }) => (
  <div className="space-y-3">
    <div className="flex justify-between items-center text-[10px] font-black text-slate-500">
      <span>{label.toUpperCase()}</span>
      <span className="font-mono text-indigo-600 bg-indigo-50 px-2 rounded">{val}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-3 rounded-lg text-[10px] font-bold shadow-2xl">
        <div className="mb-2 text-slate-400">T = {label}</div>
        {payload.map((p, i) => (
          <div key={i} className="flex justify-between space-x-4 mb-0.5">
            <span style={{ color: p.color }}>{p.name}:</span>
            <span className="font-mono">{parseFloat(p.value).toFixed(3)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default App;