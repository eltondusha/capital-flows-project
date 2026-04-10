%% Three-Country Task-Based Growth Model
% Leader (A), Follower (B), and Laggard (C)
% Single-scenario version in the same style as the cleaned two-country file.
% AI monopoly rents are based on the AI-enabled output surplus:
%   R_AI = lambda * [Y(beta,K) - Y(0,K)]
% Private returns are therefore:
%   r_priv = (1-lambda) * MPK(beta) + lambda * MPK(0) - delta
% Government revenue is included in GNI as total national income.
% AI revenue is kept separate and is not assigned to any country.

tic
clear; clc; close all;

% --- 1. GLOBAL PARAMETERS ---
T = 60; T_sim = 25; dt = 1; t = 0:dt:T;
l = 3;

% --- 2. STRUCTURAL PARAMETERS ---
L_C = 1.0;
L_A = 5.0;
L_B = 3.0;
L_vec = [L_A; L_B; L_C];

% --- TARGET PC OUTPUT RATIOS ---
target_y_A_to_C = 2.0; % Leader is 2x Laggard
target_y_B_to_C = 1.5; % Follower is 1.5x Laggard

A0_C = 1.0; % Laggard productivity as numeraire
g_A = 0.012; g_B = 0.005; g_C = 0.001;
sigma = 0.4; rho = (sigma - 1)/sigma;
delta = 0.05; phi = 0.25; gamma = 0.33;
r_target = 0.04; b_start = 0.0001;

% --- CAPITAL CONTROLS / SOURCE-BASED TAX ON FOREIGNERS (omega) ---
omega_A = 0;
omega_B = 0;
omega_C = 0;
w_vec = [omega_A; omega_B; omega_C];
max_iters = 50;

% --- RESIDENCE-BASED TAX ON OWN CITIZENS' FOREIGN RETURNS (tau) ---
tau_A = 0;
tau_B = 0;
tau_C = 0;
tau_vec = [tau_A; tau_B; tau_C];

% --- AI MONOPOLIST TAKE RATE ON THE AI-ENABLED OUTPUT SURPLUS ---
lambda = 0.2;

% --- 3. TRIPLE STEADY-STATE CALIBRATION ---
% A. Calibrate Country C (Laggard) on the private return used in simulation.
f_r_C = @(k) get_r_private(k, b_start, rho, gamma, A0_C, 1, delta, lambda) - r_target;
k_ss_C = fzero(f_r_C, [0.01, 1000]);
y_ss_C = get_y(k_ss_C, b_start, rho, gamma, A0_C, 1);

% B. Calibrate Country B (Follower) relative to C.
y_target_B = y_ss_C * target_y_B_to_C;
find_A0_B = @(a_guess) get_y( ...
    fzero(@(k) get_r_private(k, b_start, rho, gamma, a_guess, 1, delta, lambda) - r_target, [0.01, 2000]), ...
    b_start, rho, gamma, a_guess, 1) - y_target_B;
A0_B = fzero(find_A0_B, [0.1, 10]);
k_ss_B = fzero(@(k) get_r_private(k, b_start, rho, gamma, A0_B, 1, delta, lambda) - r_target, [0.01, 2000]);
y_ss_B = get_y(k_ss_B, b_start, rho, gamma, A0_B, 1);

% C. Calibrate Country A (Leader) relative to C.
y_target_A = y_ss_C * target_y_A_to_C;
find_A0_A = @(a_guess) get_y( ...
    fzero(@(k) get_r_private(k, b_start, rho, gamma, a_guess, 1, delta, lambda) - r_target, [0.01, 2000]), ...
    b_start, rho, gamma, a_guess, 1) - y_target_A;
A0_A = fzero(find_A0_A, [0.1, 10]);
k_ss_A = fzero(@(k) get_r_private(k, b_start, rho, gamma, A0_A, 1, delta, lambda) - r_target, [0.01, 2000]);
y_ss_A = get_y(k_ss_A, b_start, rho, gamma, A0_A, 1);

% D. Scale to total initial capital (K = k * L)
K_init_A = k_ss_A * L_A;
K_init_B = k_ss_B * L_B;
K_init_C = k_ss_C * L_C;

% E. Base savings rates
% Keep this block technology-only, as in the two-country version.
s_base_A = (delta * k_ss_A) / y_ss_A;
s_base_B = (delta * k_ss_B) / y_ss_B;
s_base_C = (delta * k_ss_C) / y_ss_C;
s_base_vec = [s_base_A; s_base_B; s_base_C];

% F. Print verification
fprintf('--- Three-Country Per-Capita Calibration Results ---\n');
fprintf('Target Output Ratios (vs C): A/C = %.2f, B/C = %.2f\n', target_y_A_to_C, target_y_B_to_C);
fprintf('Calibrated TFP (A0): A = %.4f, B = %.4f, (C = 1.0)\n', A0_A, A0_B);
fprintf('Steady State k (p.c.): A = %.2f, B = %.2f, C = %.2f\n', k_ss_A, k_ss_B, k_ss_C);
fprintf('Total Initial K: A = %.2f, B = %.2f, C = %.2f\n', K_init_A, K_init_B, K_init_C);
fprintf('Initial private return target: %.4f\n', r_target);
fprintf('Base savings rates: A = %.4f, B = %.4f, C = %.4f\n', s_base_A, s_base_B, s_base_C);

% G. TFP paths
A_path_A = A0_A * (1 + g_A).^t;
A_path_B = A0_B * (1 + g_B).^t;
A_path_C = A0_C * (1 + g_C).^t;

% --- 4. Beta Path ---
tidal_max = 0.25;
tidal_lag_B = 6;
tidal_lag_C = 12;
tidal_midpoint = 10;
tidal_steepness = 0.32;

gulf_max = 0.65;
gulf_leakage_B = 0.9;
gulf_leakage_C = 0.9;

theta = 0;   % 0 = Tidal, 1 = Gulf, anything in between = hybrid

beta0 = b_start;

flow_mid   = tidal_midpoint;
flow_steep = tidal_steepness;

flow_max_A = tidal_max + theta * (gulf_max - tidal_max);
flow_max_B = beta0 + (1 - theta * gulf_leakage_B) * (flow_max_A - beta0);
flow_max_C = beta0 + (1 - theta * gulf_leakage_C) * (flow_max_B - beta0);

% Leader: normalized logistic so betaA(0) = beta0 exactly
logisticA_raw = 1 ./ (1 + exp(-flow_steep * (t - flow_mid)));
logisticA = (logisticA_raw - logisticA_raw(1)) ./ (1 - logisticA_raw(1));
betaA = beta0 + (flow_max_A - beta0) .* logisticA;
betaA(1) = beta0;

% Follower: same normalization, but lagged
logisticB_raw = 1 ./ (1 + exp(-flow_steep * ((t - tidal_lag_B) - flow_mid)));
logisticB = (logisticB_raw - logisticB_raw(1)) ./ (1 - logisticB_raw(1));
betaB = beta0 + (flow_max_B - beta0) .* logisticB;
betaB(1) = beta0;

% Laggard: same normalization, more lagged
logisticC_raw = 1 ./ (1 + exp(-flow_steep * ((t - tidal_lag_C) - flow_mid)));
logisticC = (logisticC_raw - logisticC_raw(1)) ./ (1 - logisticC_raw(1));
betaC = beta0 + (flow_max_C - beta0) .* logisticC;
betaC(1) = beta0;

% --- Optional beta-path comparison across theta values (3-country version) ---
% theta_grid = linspace(0, 1, 5);
% figure('Color', 'w', 'Position', [100 100 950 600]);
% hold on;
% cols = lines(length(theta_grid));
% for ii = 1:length(theta_grid)
%     theta_i = theta_grid(ii);
%     flow_mid_i   = tidal_midpoint;
%     flow_steep_i = tidal_steepness;
%     flow_max_A_i = tidal_max + theta_i * (gulf_max - tidal_max);
%     flow_max_B_i = beta0 + (1 - theta_i * gulf_leakage_B) * (flow_max_A_i - beta0);
%     flow_max_C_i = beta0 + (1 - theta_i * gulf_leakage_C) * (flow_max_B_i - beta0);
%
%     logisticA_raw_i = 1 ./ (1 + exp(-flow_steep_i * (t - flow_mid_i)));
%     logisticA_i = (logisticA_raw_i - logisticA_raw_i(1)) ./ (1 - logisticA_raw_i(1));
%     betaA_i = beta0 + (flow_max_A_i - beta0) .* logisticA_i;
%     betaA_i(1) = beta0;
%
%     logisticB_raw_i = 1 ./ (1 + exp(-flow_steep_i * ((t - tidal_lag_B) - flow_mid_i)));
%     logisticB_i = (logisticB_raw_i - logisticB_raw_i(1)) ./ (1 - logisticB_raw_i(1));
%     betaB_i = beta0 + (flow_max_B_i - beta0) .* logisticB_i;
%     betaB_i(1) = beta0;
%
%     logisticC_raw_i = 1 ./ (1 + exp(-flow_steep_i * ((t - tidal_lag_C) - flow_mid_i)));
%     logisticC_i = (logisticC_raw_i - logisticC_raw_i(1)) ./ (1 - logisticC_raw_i(1));
%     betaC_i = beta0 + (flow_max_C_i - beta0) .* logisticC_i;
%     betaC_i(1) = beta0;
%
%     plot(t, betaA_i, '-',  'LineWidth', 2, 'Color', cols(ii,:));
%     plot(t, betaB_i, '--', 'LineWidth', 2, 'Color', cols(ii,:));
%     plot(t, betaC_i, ':',  'LineWidth', 2.2, 'Color', cols(ii,:));
% end
% grid on;
% xlabel('Years');
% ylabel('\beta');
% title('Beta paths for alternative values of \theta (3 countries)');
% legend_entries = cell(1, 3*length(theta_grid));
% for ii = 1:length(theta_grid)
%     legend_entries{3*ii-2} = sprintf('A, \\theta = %.2f', theta_grid(ii));
%     legend_entries{3*ii-1} = sprintf('B, \\theta = %.2f', theta_grid(ii));
%     legend_entries{3*ii}   = sprintf('C, \\theta = %.2f', theta_grid(ii));
% end
% legend(legend_entries, 'Location', 'eastoutside');

%% --- 5. STORAGE ---
nC = 3;

GNI_parts_all = zeros(nC, length(t), 4);   % labor, home-capital, foreign-capital, government
pure_autarky_all = false(1, length(t));
gov_rev_source_all = zeros(nC, length(t));
gov_rev_resid_all  = zeros(nC, length(t));
gov_rev_total_all  = zeros(nC, length(t));
g_v = zeros(nC, length(t));
rg_v = zeros(nC, length(t));
g_noai_v = zeros(nC, length(t));
g_noai_global_v = zeros(1, length(t));

bA_r = [betaA, repmat(betaA(end), 1, l + 2)];
bB_r = [betaB, repmat(betaB(end), 1, l + 2)];
bC_r = [betaC, repmat(betaC(end), 1, l + 2)];

% --- Lean no-AI baseline run (beta = 0 everywhere, lambda = 0) ---
P0 = diag([K_init_A, K_init_B, K_init_C]);
pipe0 = repmat(delta * diag(P0), 1, length(t) + l);
P0_guess_next = P0;
Y0_prev = [];
Y0_global_prev = [];

for i0 = 1:length(t)
    K0_current = sum(P0, 1)';
    V0_curr = sum(P0, 2);
    A0_curr = [A_path_A(i0); A_path_B(i0); A_path_C(i0)];

    Y0_curr = zeros(nC, 1);
    r0_curr = zeros(nC, 1);

    for k0 = 1:nC
        Y0_curr(k0) = get_y(K0_current(k0), 0, rho, gamma, A0_curr(k0), L_vec(k0));
        r0_curr(k0) = get_r_private(K0_current(k0), 0, rho, gamma, A0_curr(k0), L_vec(k0), delta, 0);
    end

    if i0 == 1
        g_noai_v(:, i0) = 0;
        g_noai_global_v(i0) = 0;
    else
        g_noai_v(:, i0) = log(max(Y0_curr, 1e-12)) - log(max(Y0_prev, 1e-12));
        g_noai_global_v(i0) = log(max(sum(Y0_curr), 1e-12)) - log(max(Y0_global_prev, 1e-12));
    end

    if i0 < length(t)
        labor0_inc = Y0_curr - (r0_curr + delta) .* K0_current;

        cap0_inc = zeros(nC, 1);
        for owner = 1:nC
            for loc = 1:nC
                if owner == loc
                    ret_ol = r0_curr(loc);
                else
                    ret_ol = r0_curr(loc) - w_vec(loc) - tau_vec(owner);
                end
                cap0_inc(owner) = cap0_inc(owner) + P0(owner, loc) * ret_ol;
            end
        end

        source0 = zeros(nC, 1);
        resid0 = zeros(nC, 1);
        for loc = 1:nC
            foreign_positions_in_loc = sum(P0(:, loc)) - P0(loc, loc);
            source0(loc) = w_vec(loc) * foreign_positions_in_loc;
        end
        for owner = 1:nC
            offshore_positions_owner = sum(P0(owner, :)) - P0(owner, owner);
            resid0(owner) = tau_vec(owner) * offshore_positions_owner;
        end

        GNI0_curr = labor0_inc + cap0_inc + source0 + resid0;

        idx0_f = min(length(t), i0 + l);
        bt0_f = zeros(nC, 1);
        A0_f = [A_path_A(idx0_f); A_path_B(idx0_f); A_path_C(idx0_f)];

        pipe_survive0 = zeros(nC, 1);
        if l > 1
            decay_vec0 = (1 - delta).^(l-1:-1:1)';
            pipe_survive0 = pipe0(:, i0+1:i0+l-1) * decay_vec0;
        end

        V0_fixed = V0_curr * (1 - delta)^l + pipe_survive0;

        s_guess0 = s_base_vec;
        P0_guess_f = P0;

        for iter0 = 1:max_iters
            V0_proj = V0_fixed + (s_guess0 .* GNI0_curr);
            V0_proj = max(V0_proj, 1e-12);

            [K0_target_f, P0_target_f, ~, ~] = solve_3c_market_numeric( ...
                V0_proj, bt0_f, delta, A0_f, L_vec, gamma, rho, w_vec, tau_vec, 0, P0_guess_f);
            P0_guess_f = P0_target_f;

            rr0_f = zeros(nC, 1);
            for k0 = 1:nC
                rr0_f(k0) = get_r_private(K0_target_f(k0), 0, rho, gamma, A0_f(k0), L_vec(k0), delta, 0);
            end

            r0_yield = zeros(nC, 1);
            for owner = 1:nC
                inc_owner = 0;
                for loc = 1:nC
                    if owner == loc
                        inc_owner = inc_owner + P0_target_f(owner, loc) * rr0_f(loc);
                    else
                        inc_owner = inc_owner + P0_target_f(owner, loc) * (rr0_f(loc) - w_vec(loc) - tau_vec(owner));
                    end
                end
                r0_yield(owner) = inc_owner / max(V0_proj(owner), 1e-12);
            end

            s0_new = s_base_vec + phi * (r0_yield - r_target);

            if max(abs(s0_new - s_guess0)) < 1e-6
                s_guess0 = s0_new;
                break;
            end
            s_guess0 = s0_new;
        end

        pipe0(:, i0 + l) = s_guess0 .* GNI0_curr;

        P0 = P0 .* (1 - delta);
        for c = 1:nC
            P0(c, c) = P0(c, c) + pipe0(c, i0 + 1);
        end
        V0_new = max(sum(P0, 2), 0);

        [~, P0_target, ~, ~] = solve_3c_market_numeric( ...
            V0_new, zeros(nC, 1), delta, [A_path_A(i0+1); A_path_B(i0+1); A_path_C(i0+1)], ...
            L_vec, gamma, rho, w_vec, tau_vec, 0, P0_guess_next);

        P0_guess_next = P0_target;
        P0 = P0_target;
    end

    Y0_prev = Y0_curr;
    Y0_global_prev = sum(Y0_curr);
end

% P(row, col): wealth owner row invested in location col
P = diag([K_init_A, K_init_B, K_init_C]);

V_v = zeros(nC, length(t));
K_v = zeros(nC, length(t));
Y_v = zeros(nC, length(t));
Y_net_v = zeros(nC, length(t));
ai_rent_v = zeros(nC, length(t));
r_priv_v = zeros(nC, length(t));
starve_gap_v = zeros(nC, length(t));
GNI_v = zeros(nC, length(t));
ai_rev_global_pct_gni_v = zeros(1, length(t));
s_rate_v = zeros(nC, length(t));
LS_v = zeros(nC, length(t));
rentier_idx_v = zeros(nC, length(t));
foreign_inc = zeros(nC, length(t));
offshore_ratio_v = zeros(nC, length(t));
mpl_priv_v = zeros(nC, length(t));
labor_share_y_v = zeros(nC, length(t));
capital_share_y_v = zeros(nC, length(t));
ai_share_y_v = zeros(nC, length(t));
mpl_v = zeros(nC, length(t));

% Pipeline of investments that materialize with lag l
pipe = repmat(delta * diag(P), 1, length(t) + l);

% Warm starts for repeated equilibrium solves
P_guess_frontier = P;
P_guess_next = P;

%% --- 6. MAIN SIMULATION LOOP ---
figure('Color', 'w', 'Position', [50 50 700 2700]);
clrs = [0 0.447 0.741; ...
        0.85 0.325 0.098; ...
        0.466 0.674 0.188];

for i = 1:length(t)
    %% Step A: Current physical reality and national accounts
    K_current = sum(P, 1)';
    V_curr = sum(P, 2);

    K_v(:, i) = K_current;
    V_v(:, i) = V_curr;

    b_r = [bA_r(i); bB_r(i); bC_r(i)];
    max_beta = max(b_r);
    b_frontier = [max_beta; max_beta; max_beta];
    A_curr = [A_path_A(i); A_path_B(i); A_path_C(i)];

    for owner = 1:nC
        offshore_ratio_v(owner, i) = (sum(P(owner, :)) - P(owner, owner)) / max(V_curr(owner), 1e-12);
    end

    for k = 1:nC
        Y_v(k, i) = get_y(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k));
        ai_rent_v(k, i) = get_ai_rent(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k), lambda);
        Y_net_v(k, i) = Y_v(k, i) - ai_rent_v(k, i);
        r_priv_v(k, i) = get_r_private(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k), delta, lambda);
        mpl_v(k,i) = get_mpl(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k));
        mpl_priv_v(k,i) = get_mpl_private(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k), lambda);
        labor_share_y_v(k,i) = (mpl_priv_v(k,i) * L_vec(k)) / max(Y_v(k,i), 1e-12);
        capital_share_y_v(k,i) = ((r_priv_v(k,i) + delta) * K_current(k)) / max(Y_v(k,i), 1e-12);
        ai_share_y_v(k,i) = ai_rent_v(k,i) / max(Y_v(k,i), 1e-12);
    end
    
    share_check = labor_share_y_v(:,i) + capital_share_y_v(:,i) + ai_share_y_v(:,i);
    bad_idx = find(abs(share_check - 1) > 1e-8);

    for kk = bad_idx'
        warning('Output share decomposition mismatch at t=%d, country=%d: sum = %.12f', i, kk, share_check(kk));
    end
    % Current-period pure autarky indicator
    pure_autarky_all(i) = all(abs(P(~eye(nC))) <= 1e-8);

    % Frontier allocation under the best currently available automation level
    [K_frontier, P_frontier, ~, ~] = solve_3c_market_numeric( ...
        V_curr, b_frontier, delta, A_curr, L_vec, gamma, rho, w_vec, tau_vec, lambda, P_guess_frontier);
    P_guess_frontier = P_frontier;
    starve_gap_v(:, i) = (K_frontier - K_current) ./ max(K_frontier, 1e-12);

    % Government revenue for the current period, timed on the current portfolio P
    source_rev = zeros(nC, 1);
    resid_rev  = zeros(nC, 1);

    for loc = 1:nC
        foreign_positions_in_loc = sum(P(:, loc)) - P(loc, loc);
        source_rev(loc) = w_vec(loc) * foreign_positions_in_loc;
    end

    for owner = 1:nC
        offshore_positions_owner = sum(P(owner, :)) - P(owner, owner);
        resid_rev(owner) = tau_vec(owner) * offshore_positions_owner;
    end
    gov_total_curr = source_rev + resid_rev;

    gov_rev_source_all(:, i) = source_rev;
    gov_rev_resid_all(:, i)  = resid_rev;
    gov_rev_total_all(:, i)  = gov_total_curr;

    % Labor income net of AI revenue (residual claimant on net output)
    labor_inc = Y_net_v(:, i) - (r_priv_v(:, i) + delta) .* K_current;

    % Portfolio capital income, owner by owner
    cap_inc = zeros(nC, 1);
    foreign_inc(:, i) = 0;
    for owner = 1:nC
        for loc = 1:nC
            if owner == loc
                ret_ol = r_priv_v(loc, i);
            else
                ret_ol = r_priv_v(loc, i) - w_vec(loc) - tau_vec(owner);
                foreign_inc(owner, i) = foreign_inc(owner, i) + P(owner, loc) * ret_ol;
            end
            cap_inc(owner) = cap_inc(owner) + P(owner, loc) * ret_ol;
        end
    end

    % Total national income (including government revenue, excluding AI revenue)
    GNI_v(:, i) = labor_inc + cap_inc + gov_total_curr;
    ai_rev_global_pct_gni_v(i) = 100 * sum(ai_rent_v(:, i)) / max(abs(sum(GNI_v(:, i))), 1e-12);

    gni_den = GNI_v(:, i);
    gni_den(abs(gni_den) < 1e-12) = 1e-12;

    LS_v(:, i) = labor_inc ./ gni_den;
    rentier_idx_v(:, i) = foreign_inc(:, i) ./ gni_den;

    % GNI partitioning for area plots (per capita): [labor, domestic, foreign, government]
    for c = 1:nC
        GNI_parts_all(c, i, 1) = labor_inc(c) / L_vec(c);
        GNI_parts_all(c, i, 2) = P(c, c) * r_priv_v(c, i) / L_vec(c);
        GNI_parts_all(c, i, 3) = foreign_inc(c, i) / L_vec(c);
        GNI_parts_all(c, i, 4) = gov_total_curr(c) / L_vec(c);
    end

    % Log output growth and r-g for the current period
    if i == 1
        g_v(:, i) = 0;
    else
        g_v(:, i) = log(max(Y_v(:, i), 1e-12)) - log(max(Y_v(:, i-1), 1e-12));
    end
    rg_v(:, i) = r_priv_v(:, i) - g_v(:, i);

    if i < length(t)
        %% Step B: Rational-foresight savings decision
        idx_f = min(length(t), i + l);
        bt_f = [bA_r(idx_f); bB_r(idx_f); bC_r(idx_f)];
        A_f = [A_path_A(idx_f); A_path_B(idx_f); A_path_C(idx_f)];

        % Wealth floor in t+l: surviving current wealth + already-queued pipeline
        pipe_survive = zeros(nC, 1);
        if l > 1
            decay_vec = (1 - delta).^(l-1:-1:1)';
            pipe_survive = pipe(:, i+1:i+l-1) * decay_vec;
        end

        V_fixed = V_curr * (1 - delta)^l + pipe_survive;

        % Start the fixed-point search from base savings rates
        s_guess = s_base_vec;
        P_guess_f = P;

        for iter = 1:max_iters
            V_proj = V_fixed + (s_guess .* GNI_v(:, i));
            V_proj = max(V_proj, 1e-12);

            [K_target_f, P_target_f, ~, ~] = solve_3c_market_numeric( ...
                V_proj, bt_f, delta, A_f, L_vec, gamma, rho, w_vec, tau_vec, lambda, P_guess_f);
            P_guess_f = P_target_f;

            rr_f = zeros(nC, 1);
            for k = 1:nC
                rr_f(k) = get_r_private(K_target_f(k), bt_f(k), rho, gamma, A_f(k), L_vec(k), delta, lambda);
            end

            % Country-specific expected portfolio yields
            r_yield = zeros(nC, 1);
            for owner = 1:nC
                inc_owner = 0;
                for loc = 1:nC
                    if owner == loc
                        inc_owner = inc_owner + P_target_f(owner, loc) * rr_f(loc);
                    else
                        inc_owner = inc_owner + P_target_f(owner, loc) * ...
                            (rr_f(loc) - w_vec(loc) - tau_vec(owner));
                    end
                end
                r_yield(owner) = inc_owner / max(V_proj(owner), 1e-12);
            end

            s_new = s_base_vec + phi * (r_yield - r_target);

            if max(abs(s_new - s_guess)) < 1e-6
                s_guess = s_new;
                break;
            end
            s_guess = s_new;
        end

        s_rate_v(:, i) = s_guess;

        % Store today's investment decision to be realized in l periods
        pipe(:, i + l) = s_guess .* GNI_v(:, i);

        %% Step C: Wealth evolution up to next period totals
        P = P .* (1 - delta);
        for c = 1:nC
            P(c, c) = P(c, c) + pipe(c, i + 1);
        end

        V_new = max(sum(P, 2), 0);

        %% Step D: Exact reallocation into next period equilibrium portfolio
        [~, P_target, ~, ~] = solve_3c_market_numeric( ...
            V_new, [bA_r(i+1); bB_r(i+1); bC_r(i+1)], delta, ...
            [A_path_A(i+1); A_path_B(i+1); A_path_C(i+1)], ...
            L_vec, gamma, rho, w_vec, tau_vec, lambda, P_guess_next);

        P_guess_next = P_target;
        P = P_target;
    end
end

%% --- 7. PLOTTING ---
rows = 13;
t_p = 1:T_sim;
autarky_mask = pure_autarky_all(t_p);

% Precompute series
Y_idx = 100 * bsxfun(@rdivide, Y_v(:, t_p), Y_v(:, 1));
GNI_idx = 100 * bsxfun(@rdivide, GNI_v(:, t_p), GNI_v(:, 1));
wealth_pc = bsxfun(@rdivide, V_v(:, t_p), L_vec);
wealth_pc_share = 100 * bsxfun(@rdivide, wealth_pc, sum(wealth_pc, 1));

% Government revenue as % of GNI (computed, not plotted in the main panel)
rev_to_gni = 100 * gov_rev_total_all(:, t_p) ./ max(abs(GNI_v(:, t_p)), 1e-12);

% Series for plotting
idx_A = Y_idx(1, :); idx_B = Y_idx(2, :); idx_C = Y_idx(3, :);
rA = r_priv_v(1, t_p) * 100; rB = r_priv_v(2, t_p) * 100; rC = r_priv_v(3, t_p) * 100;
ai_rev_global_pct_gni = ai_rev_global_pct_gni_v(t_p);
wsA = wealth_pc_share(1, :); wsB = wealth_pc_share(2, :); wsC = wealth_pc_share(3, :);
lsA = LS_v(1, t_p); lsB = LS_v(2, t_p); lsC = LS_v(3, t_p);
sgA = 100 * starve_gap_v(1, t_p); sgB = 100 * starve_gap_v(2, t_p); sgC = 100 * starve_gap_v(3, t_p);
gni_idx_A = real(GNI_idx(1, :)); gni_idx_B = real(GNI_idx(2, :)); gni_idx_C = real(GNI_idx(3, :));
rentA = 100 * rentier_idx_v(1, t_p); rentB = 100 * rentier_idx_v(2, t_p); rentC = 100 * rentier_idx_v(3, t_p);
rgA = 100 * rg_v(1, t_p); rgB = 100 * rg_v(2, t_p); rgC = 100 * rg_v(3, t_p);
offA = 100 * offshore_ratio_v(1, t_p); offB = 100 * offshore_ratio_v(2, t_p); offC = 100 * offshore_ratio_v(3, t_p);
mplA = mpl_v(1, t_p); mplB = mpl_v(2, t_p); mplC = mpl_v(3, t_p);
mplpA = mpl_priv_v(1, t_p); mplpB = mpl_priv_v(2, t_p); mplpC = mpl_priv_v(3, t_p);
lsyA = labor_share_y_v(1, t_p);
lsyB = labor_share_y_v(2, t_p);
lsyC = labor_share_y_v(3, t_p);

ksyA = capital_share_y_v(1, t_p);
ksyB = capital_share_y_v(2, t_p);
ksyC = capital_share_y_v(3, t_p);

aisyA = ai_share_y_v(1, t_p);
aisyB = ai_share_y_v(2, t_p);
aisyC = ai_share_y_v(3, t_p);
gA_noai = g_noai_v(1, t_p) * 100;
gB_noai = g_noai_v(2, t_p) * 100;
gC_noai = g_noai_v(3, t_p) * 100;

row_titles = { ...
sprintf('Adoption Path (\\theta = %.2f,\\lambda = %.2f, g_A = %.3f, g_B = %.3f, g_C = %.3f)', ...
        theta, lambda, g_A, g_B, g_C),...
    'Output Index (Y)', ...
    'Realized Returns (%)', ...
    'Global AI Revenue (% of National Income)', ...
    'Wealth Share % (p.c.)', ...
    'Output Shares: Labor / Capital / AI', ...
    'Starvation Gap (%)', ...
    'National Income Index', ...
    'Rentier Index', ...
    'R - G (%)', ...
    'Offshore Capital %', ...
    'MPL vs MPL Private', ...
    'Growth Rate: With vs Without AI'};

row_data = { ...
    {bA_r(t_p), clrs(1,:), '-', bB_r(t_p), clrs(2,:), '--', bC_r(t_p), clrs(3,:), ':'}, ...
    {idx_A, clrs(1,:), '-', idx_B, clrs(2,:), '-', idx_C, clrs(3,:), '-'}, ...
    {rA, clrs(1,:), '-', rB, clrs(2,:), '-', rC, clrs(3,:), '-'}, ...
    {ai_rev_global_pct_gni, 'k', '-'}, ...
    {wsA, clrs(1,:), '-', wsB, clrs(2,:), '-', wsC, clrs(3,:), '-'}, ...
    {lsyA, clrs(1,:), '-', lsyB, clrs(2,:), '-', lsyC, clrs(3,:), '-', ...
    ksyA, clrs(1,:), '--', ksyB, clrs(2,:), '--', ksyC, clrs(3,:), '--', ...
    aisyA, clrs(1,:), ':', aisyB, clrs(2,:), ':', aisyC, clrs(3,:), ':'}, ...
    {sgA, clrs(1,:), '-', sgB, clrs(2,:), '-', sgC, clrs(3,:), '-'}, ...
    {gni_idx_A, clrs(1,:), '-', gni_idx_B, clrs(2,:), '-', gni_idx_C, clrs(3,:), '-'}, ...
    {rentA, clrs(1,:), '-', rentB, clrs(2,:), '-', rentC, clrs(3,:), '-'}, ...
    {rgA, clrs(1,:), '-', rgB, clrs(2,:), '-', rgC, clrs(3,:), '-'}, ...
    {offA, clrs(1,:), '-', offB, clrs(2,:), '-', offC, clrs(3,:), '-'}, ...
    {mplA, clrs(1,:), '-', mplB, clrs(2,:), '-', mplC, clrs(3,:), '-', ...
     mplpA, clrs(1,:), '--', mplpB, clrs(2,:), '--', mplpC, clrs(3,:), '--'}, ...
    {100 * g_v(1, t_p), clrs(1,:), '-', 100 * g_v(2, t_p), clrs(2,:), '-', 100 * g_v(3, t_p), clrs(3,:), '-', ...
     gA_noai, clrs(1,:), '--', gB_noai, clrs(2,:), '--', gC_noai, clrs(3,:), '--'} ...
    };

row_ylims = { ...
    [0, max([bA_r(t_p), bB_r(t_p), bC_r(t_p)]) * 1.2], ...
    [min([idx_A, idx_B, idx_C]), max([idx_A, idx_B, idx_C]) * 1.1], ...
    [min(r_priv_v(:, t_p) * 100, [], 'all') - 1, max(r_priv_v(:, t_p) * 100, [], 'all') + 1], ...
    [0, max(1, max(ai_rev_global_pct_gni(:)) * 1.1)], ...
    [0, 100], ...
    [0, 1], ...
    [min([sgA, sgB, sgC]) - 5, max([sgA, sgB, sgC]) * 1.2 + 5], ...
    [min([gni_idx_A, gni_idx_B, gni_idx_C]) * 0.9, max([gni_idx_A, gni_idx_B, gni_idx_C]) * 1.1], ...
    [min(rentier_idx_v(:, t_p) * 100, [], 'all') - 2, max(rentier_idx_v(:, t_p) * 100, [], 'all') + 2], ...
    [min(rg_v(:, t_p) * 100, [], 'all') - 1, max(rg_v(:, t_p) * 100, [], 'all') + 1], ...
    [min([offA, offB, offC]), max(0.1, max([offA, offB, offC]) * 1.1)], ...
    [min([mpl_v(:, t_p), mpl_priv_v(:, t_p)], [], 'all') * 0.9, ...
     max([mpl_v(:, t_p), mpl_priv_v(:, t_p)], [], 'all') * 1.1], ...
    [min([g_v(:, t_p) * 100, g_noai_v(:, t_p) * 100], [], 'all') - 0.5, ...
     max([g_v(:, t_p) * 100, g_noai_v(:, t_p) * 100], [], 'all') + 0.5] ...
    };

for r = 1:rows
    subplot(rows, 1, r);
    hold on;

    spec = row_data{r};

    k = 1;
    while k <= numel(spec)
        y = spec{k};
        c = spec{k+1};
        ls = spec{k+2};
        plot(t_p, y, 'Color', c, 'LineStyle', ls, 'LineWidth', 1.5);
        k = k + 3;
    end

    title(row_titles{r});
    grid on;
    ylim(row_ylims{r});

    if r == 7
        yline(0, 'k:');
    end

    if r >= 2
        shade_autarky_bands(t_p, autarky_mask);
        k = 1;
        while k <= numel(spec)
            y = spec{k};
            c = spec{k+1};
            ls = spec{k+2};
            plot(t_p, y, 'Color', c, 'LineStyle', ls, 'LineWidth', 1.5);
            k = k + 3;
        end
        if r == 7
            yline(0, 'k:');
        end
    end
end

toc

% --- POST-SIMULATION: Partitioned GNI Figure ---
figure('Color', 'w', 'Position', [100 100 1500 400]);
for c = 1:3
    subplot(1, 3, c);
    hold on;

    data_levels = squeeze(GNI_parts_all(c, 1:T_sim, :));   % T_sim x 4
    local_total_gni = sum(data_levels, 2);

    data_to_plot = zeros(size(data_levels));
    pos_idx = abs(local_total_gni) > 1e-12;
    data_to_plot(pos_idx, :) = data_levels(pos_idx, :) ./ local_total_gni(pos_idx);

    h = area(t(1:T_sim), data_to_plot, 'EdgeColor', 'none');
    h(1).FaceColor = [0.8 0.3 0.3];
    h(2).FaceColor = [0.3 0.3 0.8];
    h(3).FaceColor = [0.3 0.8 0.3];
    h(4).FaceColor = [0.25 0.25 0.25];

    ylim([0, 1]);
    title(['Country ' char(64+c)]);
    xlabel('Years');
    if c == 1, ylabel('Shares of GNI'); end
    grid on;
    set(gca, 'Layer', 'top');
    axis tight;
end

lgd = legend(h, {'Labor Income', 'Domestic Cap Inc', 'Foreign Cap Inc', 'Government Income'}, ...
    'Orientation', 'horizontal');
set(lgd, 'Position', [0.22, 0.02, 0.56, 0.04]);

% --- Annualized growth rates over the simulation horizon ---
years_span = t(T_sim) - t(1);

for c = 1:3
    total_growth_factor = Y_v(c, T_sim) / Y_v(c, 1);
    annualized_growth = total_growth_factor^(1 / years_span) - 1;

    fprintf('\n--- Country %s annualized growth over years %.0f to %.0f ---\n', ...
        char(64+c), t(1), t(T_sim));
    fprintf('Total growth factor: %.4f\n', total_growth_factor);
    fprintf('Annualized growth rate: %.4f (%.2f%%)\n', annualized_growth, 100 * annualized_growth);
end

%% --- HELPERS ---
function y = get_y(k, bt, rho, gamma, A, L)
    k_eff = max(k, 1e-12);
    task_agg = max(1e-12, bt.^(1-rho).*k_eff.^rho + (1-bt).^(1-rho).*L.^rho);
    y = A .* k_eff.^gamma .* (task_agg.^((1-gamma)./rho));
    y(k <= 0) = 0;
end

function r = get_r(k, bt, rho, gamma, A, L, d_val)
    k_eff = max(k, 1e-12);
    task_agg = max(1e-12, bt.^(1-rho).*k_eff.^rho + (1-bt).^(1-rho).*L.^rho);
    share = (bt.^(1-rho).*k_eff.^rho) ./ task_agg;
    y_over_k = get_y(k_eff, bt, rho, gamma, A, L) ./ k_eff;
    r = (gamma + (1-gamma) .* share) .* y_over_k - d_val;
end

function mpl = get_mpl(k, bt, rho, gamma, A, L)
    k_eff = max(k, 1e-12);
    task_agg = max(1e-12, bt.^(1-rho) .* k_eff.^rho + (1-bt).^(1-rho) .* L.^rho);
    y = get_y(k_eff, bt, rho, gamma, A, L);

    mpl = (1-gamma) .* (y ./ task_agg) .* (1-bt).^(1-rho) .* L.^(rho-1);
end

function mpl = get_mpl_private(k, bt, rho, gamma, A, L, lambda)
    mpl_beta = get_mpl(k, bt, rho, gamma, A, L);
    mpl_noai = get_mpl(k, 0,  rho, gamma, A, L);

    mpl = (1-lambda) .* mpl_beta + lambda .* mpl_noai;
end
function ai_rent = get_ai_rent(k, bt, rho, gamma, A, L, lambda)
    y_beta = get_y(k, bt, rho, gamma, A, L);
    y_noai = get_y(k, 0, rho, gamma, A, L);
    ai_rent = lambda .* (y_beta - y_noai);
end

function r = get_r_private(k, bt, rho, gamma, A, L, d_val, lambda)
    mpk_gross = get_r(k, bt, rho, gamma, A, L, 0);
    mpk_noai  = get_r(k, 0,  rho, gamma, A, L, 0);
    r = (1 - lambda) .* mpk_gross + lambda .* mpk_noai - d_val;
end

function [K_vec, P_star, aut_flags, support_mask] = solve_3c_market_numeric( ...
    V_vec, bt, d_val, A, L, gamma, rho, w, tau, lambda, P_init)

    tol_move = 1e-10;
    tol_support = 1e-8;
    max_outer = 500;

    V_vec = max(V_vec(:), 0);
    n = numel(V_vec);

    if sum(V_vec) <= tol_move
        K_vec = zeros(n, 1);
        P_star = zeros(n, n);
        aut_flags = true(n, 1);
        support_mask = false(n, n);
        return;
    end

    if nargin < 11 || isempty(P_init)
        P_star = diag(V_vec);
    else
        P_star = repair_portfolio(P_init, V_vec);
    end

    K_vec = sum(P_star, 1)';

    outer = 0;
    while outer < max_outer
        outer = outer + 1;

        best_gap = tol_move;
        best_i = 0;
        best_a = 0;
        best_b = 0;

        for i = 1:n
            for a = 1:n
                if P_star(i, a) <= tol_move
                    continue;
                end

                net_a = net_return(i, a, K_vec(a), bt, d_val, A, L, gamma, rho, w, tau, lambda);

                for b = 1:n
                    if b == a
                        continue;
                    end

                    net_b = net_return(i, b, K_vec(b), bt, d_val, A, L, gamma, rho, w, tau, lambda);
                    gap = net_b - net_a;

                    if gap > best_gap
                        best_gap = gap;
                        best_i = i;
                        best_a = a;
                        best_b = b;
                    end
                end
            end
        end

        if best_i == 0
            break;
        end

        max_move = P_star(best_i, best_a);

        f = @(x) net_return(best_i, best_b, K_vec(best_b) + x, bt, d_val, A, L, gamma, rho, w, tau, lambda) - ...
                 net_return(best_i, best_a, K_vec(best_a) - x, bt, d_val, A, L, gamma, rho, w, tau, lambda);

        if max_move <= tol_move
            x_star = 0;
        elseif f(max_move) >= 0
            x_star = max_move;
        else
            x_star = bisect_root(f, 0, max_move, 1e-12, 200);
        end

        if x_star <= tol_move
            break;
        end

        P_star(best_i, best_a) = P_star(best_i, best_a) - x_star;
        P_star(best_i, best_b) = P_star(best_i, best_b) + x_star;
        K_vec(best_a) = K_vec(best_a) - x_star;
        K_vec(best_b) = K_vec(best_b) + x_star;
    end

    P_star(abs(P_star) < 1e-12) = 0;
    K_vec = sum(P_star, 1)';
    support_mask = P_star > tol_support;

    aut_flags = false(n, 1);
    for c = 1:n
        outflow_c = sum(P_star(c, :)) - P_star(c, c);
        inflow_c = sum(P_star(:, c)) - P_star(c, c);
        tol_scale = max(1e-9, 0.005 * max(V_vec(c), 1));
        aut_flags(c) = (outflow_c < tol_scale) && (inflow_c < tol_scale);
    end
end

function P = repair_portfolio(P_in, V_vec)
    V_vec = V_vec(:);
    n = numel(V_vec);

    if isempty(P_in) || ~isequal(size(P_in), [n, n])
        P = diag(V_vec);
        return;
    end

    P = max(real(P_in), 0);

    for i = 1:n
        row_sum = sum(P(i, :));
        if row_sum <= 1e-14
            P(i, :) = 0;
            P(i, i) = V_vec(i);
        else
            P(i, :) = P(i, :) * (V_vec(i) / row_sum);
        end
    end
end

function val = net_return(owner, loc, K_loc, bt, d_val, A, L, gamma, rho, w, tau, lambda)
    val = get_r_private(K_loc, bt(loc), rho, gamma, A(loc), L(loc), d_val, lambda);
    if owner ~= loc
        val = val - w(loc) - tau(owner);
    end
end

function x_star = bisect_root(fun, a, b, tol, maxit)
    fa = fun(a);
    fb = fun(b);

    if abs(fa) < tol
        x_star = a;
        return;
    end
    if abs(fb) < tol
        x_star = b;
        return;
    end
    if sign(fa) == sign(fb)
        error('bisect_root:NoBracket', 'Root not bracketed on [%g, %g].', a, b);
    end

    for it = 1:maxit
        m = 0.5 * (a + b);
        fm = fun(m);

        if abs(fm) < tol || 0.5 * (b - a) < tol
            x_star = m;
            return;
        end

        if sign(fm) == sign(fa)
            a = m;
            fa = fm;
        else
            b = m;
            fb = fm;
        end
    end

    x_star = 0.5 * (a + b);
end

function shade_autarky_bands(t_plot, mask)
    yl = ylim;
    mask = logical(mask(:)');
    dmask = diff([false, mask, false]);
    starts = find(dmask == 1);
    ends_ = find(dmask == -1) - 1;

    hold on;
    for ii = 1:numel(starts)
        x1 = t_plot(starts(ii));
        x2 = t_plot(ends_(ii));
        h = patch([x1 x2 x2 x1], [yl(1) yl(1) yl(2) yl(2)], [0.85 0.85 0.85], ...
                  'EdgeColor', 'none', 'FaceAlpha', 0.35, 'HandleVisibility', 'off');
        uistack(h, 'bottom');
    end
end
