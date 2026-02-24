import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { Settings, Activity, TrendingUp, Zap, BarChart3, PieChart, Layers, Globe } from 'lucide-react';

// --- Economic Constants & Helper Functions ---

const get_y = (k, bt, rho, gamma, A, L) => {
  const task_agg = Math.max(1e-9, Math.pow(bt, 1 - rho) * Math.pow(k, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho));
  return A * Math.pow(k, gamma) * Math.pow(task_agg, (1 - gamma) / rho);
};

const get_r = (k, bt, rho, gamma, A, L, delta) => {
  const task_agg = Math.max(1e-9, Math.pow(bt, 1 - rho) * Math.pow(k, rho) + Math.pow(1 - bt, 1 - rho) * Math.pow(L, rho));
  const y = get_y(k, bt, rho, gamma, A, L);
  const mpk = (gamma + (1 - gamma) * (Math.pow(bt, 1 - rho) * Math.pow(k, rho)) / task_agg) * (y / k);
  return mpk - delta;
};

const distribute_K = (K_tot, btA, btB, rho, gamma, delta, LA, LB, AA, AB, wA, wB, VA_target) => {
  const ka0 = VA_target;
  const kb0 = K_tot - ka0;
  const ra0 = get_r(ka0, btA, rho, gamma, AA, LA, delta);
  const rb0 = get_r(kb0, btB, rho, gamma, AB, LB, delta);

  let ka_final = ka0;
  if (ra0 - rb0 > wB) {
    let low = 0.0001 * K_tot, high = 0.9999 * K_tot;
    for (let i = 0; i < 40; i++) {
      let mid = (low + high) / 2;
      let ra = get_r(mid, btA, rho, gamma, AA, LA, delta);
      let rb = get_r(K_tot - mid, btB, rho, gamma, AB, LB, delta);
      if (ra > rb + wB) low = mid; else high = mid;
    }
    ka_final = (low + high) / 2;
  } else if (rb0 - ra0 > wA) {
    let low = 0.0001 * K_tot, high = 0.9999 * K_tot;
    for (let i = 0; i < 40; i++) {
      let mid = (low + high) / 2;
      let ra = get_r(mid, btA, rho, gamma, AA, LA, delta);
      let rb = get_r(K_tot - mid, btB, rho, gamma, AB, LB, delta);
      if (rb > ra + wA) high = mid; else low = mid;
    }
    ka_final = (low + high) / 2;
  }
  const ra = get_r(ka_final, btA, rho, gamma, AA, LA, delta);
  const rb = get_r(K_tot - ka_final, btB, rho, gamma, AB, LB, delta);
  return { ka: ka_final, kb: K_tot - ka_final, ra, rb };
};

const App = () => {
  const [params, setParams] = useState({
    A0_A: 1.25,
    sigma: 0.4,
    delta: 0.05,
    phi: 0.8,
    l: 3,
    lag: 10,
    r_target: 0.04,
    g_A: 0.00,
    g_B: 0.00,
    omega_A: 0.001,
    omega_B: 0.001
  });

  const [scenarioId, setScenarioId] = useState('hype');

  // Constants fixed as per request
  const gamma = 0.33;
  const L_A = 5;
  const L_B = 1;

  const results = useMemo(() => {
    const { A0_A, sigma, delta, phi, l, lag, r_target, g_A, g_B, omega_A, omega_B } = params;
    const rho = (sigma - 1) / sigma;
    const T = 60;
    const t = Array.from({ length: T + 1 }, (_, i) => i);
    const A_path_A = t.map(v => A0_A * Math.pow(1 + g_A, v));
    const A_path_B = t.map(v => 1.0 * Math.pow(1 + g_B, v));
    const b_start = 0.001;

    let bA_p = new Array(T + 1).fill(b_start);
    let bB_p = new Array(T + 1).fill(b_start);
    let bPercA_p = new Array(T + 1).fill(b_start);
    const sigmoid = (v, mid, steep) => 1 / (1 + Math.exp(-steep * (v - mid)));

    if (scenarioId === 'hype') {
      bA_p = t.map(v => b_start + (0.02 - b_start) * sigmoid(v, 5, 0.8));
      bB_p = [...bA_p];
      const sPeak = t.map(v => sigmoid(v, 3, 2.5) * (1 - sigmoid(v, 7, 1.8)));
      const sTrough = t.map(v => sigmoid(v, 10, 1.2) * (1 - sigmoid(v, 20, 0.6)));
      bPercA_p = t.map((v, i) => Math.max(1e-6, bA_p[i] + 0.55 * sPeak[i] - 0.05 * sTrough[i]));
    } else if (scenarioId === 'tidal') {
      bA_p = t.map(v => b_start + 0.5 * sigmoid(v, 18, 0.4));
      bB_p = t.map((v, i) => i < lag ? b_start : bA_p[i - lag]);
      bPercA_p = [...bA_p];
    } else if (scenarioId === 'logjam') {
      const mid1 = 8, mid2 = 30;
      bA_p = t.map(v => b_start + 0.2 * sigmoid(v, mid1, 0.8) + 0.3 * sigmoid(v, mid2, 0.8));
      bB_p = t.map((v, i) => i < lag ? b_start : bA_p[i - lag]);
      bPercA_p = [...bA_p];
    } else {
      bA_p = t.map(v => b_start + 0.5 * sigmoid(v, 10, 0.6) + 0.4 * sigmoid(v, 22, 0.8));
      bB_p = t.map(v => b_start + (0.02 - b_start) * sigmoid(v, 5, 0.8));
      bPercA_p = [...bA_p];
    }

    const findSS = (a) => {
      let low = 0.01, high = 400;
      for (let i = 0; i < 50; i++) {
        let mid = (low + high) / 2;
        let r = get_r(mid, b_start, rho, gamma, a, 1, delta);
        if (r > r_target) low = mid; else high = mid;
      }
      return (low + high) / 2;
    };

    const kSS_A = findSS(A_path_A[0]);
    const kSS_B = findSS(A_path_B[0]);
    
    let K_A = new Array(T + 1).fill(kSS_A * L_A);
    let K_B = new Array(T + 1).fill(kSS_B * L_B);
    let V_A = new Array(T + 1).fill(kSS_A * L_A);
    let V_B = new Array(T + 1).fill(kSS_B * L_B);
    let s_A = new Array(T + 1).fill(0);
    let s_B = new Array(T + 1).fill(0);
    let pipe_V_A = new Array(T + l + 1).fill(delta * kSS_A * L_A);
    let pipe_V_B = new Array(T + l + 1).fill(delta * kSS_B * L_B);

    const simulationData = [];

    for (let i = 0; i < T; i++) {
      const Ya = get_y(K_A[i], bA_p[i], rho, gamma, A_path_A[i], L_A);
      const Yb = get_y(K_B[i], bB_p[i], rho, gamma, A_path_B[i], L_B);
      const ra = get_r(K_A[i], bA_p[i], rho, gamma, A_path_A[i], L_A, delta);
      const rb = get_r(K_B[i], bB_p[i], rho, gamma, A_path_B[i], L_B, delta);

      const labA = Ya - (ra + delta) * K_A[i];
      const labB = Yb - (rb + delta) * K_B[i];
      const poolR = (K_A[i] / (K_A[i] + K_B[i])) * ra + (K_B[i] / (K_A[i] + K_B[i])) * rb;
      const incA = labA + (poolR + delta) * V_A[i];
      const incB = labB + (poolR + delta) * V_B[i];

      const futIdx = Math.min(T, i + l);
      let VAfix = V_A[i] * Math.pow(1 - delta, l);
      let VBfix = V_B[i] * Math.pow(1 - delta, l);
      for (let m = 1; m < l; m++) {
        VAfix += pipe_V_A[i + m] * Math.pow(1 - delta, l - m);
        VBfix += pipe_V_B[i + m] * Math.pow(1 - delta, l - m);
      }

      const s_base_A = (delta * kSS_A * L_A) / get_y(kSS_A * L_A, b_start, rho, gamma, A_path_A[0], L_A);
      const s_base_B = (delta * kSS_B * L_B) / get_y(kSS_B * L_B, b_start, rho, gamma, A_path_B[0], L_B);

      let sc = [i === 0 ? s_base_A : s_A[i - 1], i === 0 ? s_base_B : s_B[i - 1]];
      for (let iter = 0; iter < 30; iter++) {
        const Vtotf = (VAfix + sc[0] * incA) + (VBfix + sc[1] * incB);
        const { ra: rae, rb: rbe } = distribute_K(Vtotf, bPercA_p[futIdx], bB_p[futIdx], rho, gamma, delta, L_A, L_B, A_path_A[futIdx], A_path_B[futIdx], omega_A, omega_B, VAfix + sc[0] * incA);
        const rai = get_r(VAfix + sc[0] * incA, bPercA_p[futIdx], rho, gamma, A_path_A[futIdx], L_A, delta);
        const rbi = get_r(VBfix + sc[1] * incB, bB_p[futIdx], rho, gamma, A_path_B[futIdx], L_B, delta);
        const wAw = 0.5 + 0.5 * Math.tanh(50 * (rai - rbi - omega_B));
        const wBw = 0.5 + 0.5 * Math.tanh(50 * (rbi - rai - omega_A));
        const rfA = wAw * rae + wBw * (rbe - omega_A) + (1 - wAw - wBw) * rai;
        const rfB = wAw * (rae - omega_B) + wBw * rbe + (1 - wAw - wBw) * rbi;
        const st = [Math.max(0, s_base_A + phi * (rfA - r_target)), Math.max(0, s_base_B + phi * (rfB - r_target))];
        if (Math.abs(st[0] - sc[0]) < 1e-6) break;
        sc = st;
      }
      s_A[i] = sc[0]; s_B[i] = sc[1];
      pipe_V_A[i + l] = s_A[i] * incA; pipe_V_B[i + l] = s_B[i] * incB;

      if (i < T) {
        V_A[i + 1] = V_A[i] * (1 - delta) + pipe_V_A[i + 1];
        V_B[i + 1] = V_B[i] * (1 - delta) + pipe_V_B[i + 1];
        const dist = distribute_K(V_A[i + 1] + V_B[i + 1], bPercA_p[i + 1], bB_p[i + 1], rho, gamma, delta, L_A, L_B, A_path_A[i + 1], A_path_B[i + 1], omega_A, omega_B, V_A[i + 1]);
        K_A[i + 1] = dist.ka; K_B[i + 1] = dist.kb;
      }

      simulationData.push({
        year: i,
        betaA: bA_p[i], betaB: bB_p[i], betaPercA: bPercA_p[i],
        nV_A: (i > 0 ? 100 * (V_A[i] - V_A[i - 1]) / V_A[i - 1] : 0),
        nV_B: (i > 0 ? 100 * (V_B[i] - V_B[i - 1]) / V_B[i - 1] : 0),
        outA: (Ya / (get_y(kSS_A * L_A, b_start, rho, gamma, A_path_A[0], L_A))) * 100,
        outB: (Yb / (get_y(kSS_B * L_B, b_start, rho, gamma, A_path_B[0], L_B))) * 100,
        capA: (K_A[i] / (kSS_A * L_A)) * 100,
        capB: (K_B[i] / (kSS_B * L_B)) * 100,
        shareA: ((V_A[i] / L_A) / (V_A[i] / L_A + V_B[i] / L_B)) * 100,
        shareB: ((V_B[i] / L_B) / (V_A[i] / L_A + V_B[i] / L_B)) * 100,
        rateA: ra * 100, rateB: rb * 100,
        beA: ((K_A[i] - (i > 0 ? (1 - delta) * K_A[i - 1] : K_A[i])) - delta * K_A[i]) / L_A,
        beB: ((K_B[i] - (i > 0 ? (1 - delta) * K_B[i - 1] : K_B[i])) - delta * K_B[i]) / L_B,
        lsA: (labA / incA) * 100, lsB: (labB / incB) * 100,
        tfpA: (Ya / (A_path_A[i] * Math.pow(K_A[i], gamma))) / (get_y(kSS_A * L_A, b_start, rho, gamma, A_path_A[0], L_A) / (A_path_A[0] * Math.pow(kSS_A * L_A, gamma))) * 100,
        tfpB: (Yb / (A_path_B[i] * Math.pow(K_B[i], gamma))) / (get_y(kSS_B * L_B, b_start, rho, gamma, A_path_B[0], L_B) / (A_path_B[0] * Math.pow(kSS_B * L_B, gamma))) * 100,
      });
    }
    return simulationData.filter(d => d.year <= 40);
  }, [params, scenarioId]);

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <aside className="w-80 bg-white border-r flex flex-col overflow-y-auto p-6 shadow-sm z-20">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-blue-600 p-2 rounded-lg text-white"><TrendingUp size={20} /></div>
          <h1 className="text-lg font-bold tracking-tight">Vortex Simulator</h1>
        </div>

        <div className="space-y-8">
          <section>
            <div className="flex items-center gap-2 mb-4 text-xs font-bold text-slate-400 uppercase tracking-widest"><Activity size={14} /><h2>Scenario</h2></div>
            <div className="space-y-2">
              {['hype', 'tidal', 'logjam', 'gulf'].map(id => (
                <button key={id} onClick={() => setScenarioId(id)} className={`w-full text-left p-3 rounded-xl border text-sm font-semibold transition-all ${scenarioId === id ? 'bg-blue-50 border-blue-200 text-blue-700 ring-2 ring-blue-500/10' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                  {id.charAt(0).toUpperCase() + id.slice(1).replace('_', ' ')}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4 text-xs font-bold text-slate-400 uppercase tracking-widest"><Settings size={14} /><h2>Structural Parameters</h2></div>
            <div className="space-y-4">
              {[
                { label: 'Initial TFP A (A0_A)', key: 'A0_A', min: 1.0, max: 2.0, step: 0.05 },
                { label: 'Growth A (g_A)', key: 'g_A', min: 0, max: 0.05, step: 0.001 },
                { label: 'Growth B (g_B)', key: 'g_B', min: 0, max: 0.05, step: 0.001 },
                { label: 'Exodus Friction (ωA)', key: 'omega_A', min: 0, max: 0.01, step: 0.001 },
                { label: 'Vortex Friction (ωB)', key: 'omega_B', min: 0, max: 0.01, step: 0.001 },
                { label: 'Elasticity (σ)', key: 'sigma', min: 0.1, max: 0.9, step: 0.05 },
                { label: 'Sensitivity (φ)', key: 'phi', min: 0, max: 2, step: 0.1 },
              ].map(p => (
                <div key={p.key} className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-slate-500">
                    <span>{p.label}</span>
                    <span className="text-blue-600 tabular-nums">{params[p.key].toFixed(3)}</span>
                  </div>
                  <input type="range" min={p.min} max={p.max} step={p.step} value={params[p.key]} onChange={(e) => setParams({ ...params, [p.key]: parseFloat(e.target.value) })} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8 bg-slate-50 scroll-smooth">
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 max-w-[1600px] mx-auto pb-12">
          
          <ChartCard title="Automation (β)" icon={<Zap size={16} />} color="#2563eb">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={results} margin={{left: -20}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="year" fontSize={10} />
                <YAxis domain={[0, 1]} fontSize={10} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="betaA" name="Leader" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="betaB" name="Laggard" stroke="#dc2626" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="betaPercA" name="Perceived" stroke="#2563eb" strokeWidth={1} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Net Wealth % Change" icon={<BarChart3 size={16} />} color="#059669">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={results} margin={{left: -20}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="year" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="nV_A" name="Leader" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="nV_B" name="Laggard" stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Output Index (GDP)" icon={<TrendingUp size={16} />} color="#7c3aed">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={results} margin={{left: -20}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="year" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="outA" name="Leader" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="outB" name="Laggard" stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Kapital Index" icon={<PieChart size={16} />} color="#db2777">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={results} margin={{left: -20}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="year" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="capA" name="Leader" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="capB" name="Laggard" stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Wealth Per-Capita Share" icon={<BarChart3 size={16} />} color="#ea580c">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={results} margin={{left: -20}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="year" fontSize={10} />
                <YAxis fontSize={10} domain={[0, 100]} />
                <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="3 3" />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="shareA" name="Leader Share" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="shareB" name="Laggard Share" stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Interest Rates (%)" icon={<Globe size={16} />} color="#2563eb">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={results} margin={{left: -20}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="year" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="rateA" name="Leader" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="rateB" name="Laggard" stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Break-even Gap p.c." icon={<Zap size={16} />} color="#9333ea">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={results} margin={{left: -20}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="year" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="beA" name="Leader" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="beB" name="Laggard" stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Labor Share of GNI" icon={<Layers size={16} />} color="#16a34a">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={results} margin={{left: -20}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="year" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="lsA" name="Leader" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="lsB" name="Laggard" stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Task TFP Index" icon={<Activity size={16} />} color="#ca8a04">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={results} margin={{left: -20}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="year" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="tfpA" name="Leader" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="tfpB" name="Laggard" stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

        </div>
      </main>
    </div>
  );
};

const ChartCard = ({ title, icon, color, children }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
    <div className="flex items-center gap-2 mb-4">
      <div className="p-1.5 rounded-md text-white shadow-sm" style={{ backgroundColor: color }}>{icon}</div>
      <h3 className="text-sm font-bold text-slate-700">{title}</h3>
    </div>
    {children}
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 backdrop-blur-sm text-white p-3 rounded-xl shadow-2xl border border-slate-700 text-[10px] min-w-[120px]">
        <p className="text-slate-400 font-bold border-b border-slate-700 pb-1 mb-2">Year {label}</p>
        <div className="space-y-1.5">
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.stroke }} />
                <span className="text-slate-300 font-semibold">{entry.name}:</span>
              </div>
              <span className="font-mono text-white text-[11px]">{entry.value.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export default App;