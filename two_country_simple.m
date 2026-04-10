%% Two-Country Task-Based Growth Model
% Leader (A) and Follower (B)
% Single-scenario version focused on Tidal Flow.
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
ratiolAtoB = 2;
L_A = 5.0; L_B = L_A/ratiolAtoB;
L_vec = [L_A; L_B];

% --- TARGET RATIO CALIBRATION ---
target_y_ratio = 1.5; % Target: Country A output per capita is 1.5x Country B
A0_B = 1.0;           % Follower baseline productivity as numeraire
g_A = 0.012; 
g_B = 0.005;
sigma = 0.4; 
rho = (sigma - 1)/sigma;
delta = 0.05; 
phi = 0.25; 
gamma = 0.33;
r_target = 0.04; 
b_start = 0.0001;


% --- Foreign Capital Tax (omega) ---
omega_A = 0;
omega_B = 0;
w_vec = [omega_A; omega_B];
max_iters = 50;

% --- RESIDENCE-BASED TAX ON OWN CITIZENS' FOREIGN RETURNS (tau) ---
tau_A = 0;
tau_B = 0;
tau_vec = [tau_A; tau_B];

% --- AI MONOPOLIST TAKE RATE ON THE AI-ENABLED OUTPUT SURPLUS ---
lambda = 0;

% A. Calibrate Country B (Follower)
% Calibrate on the private return actually used in the simulation.
f_r_B = @(k) get_r_private(k, b_start, rho, gamma, A0_B, 1, delta, lambda) - r_target;
k_ss_B = fzero(f_r_B, [0.01, 1000]);
y_B_ss = get_y(k_ss_B, b_start, rho, gamma, A0_B, 1);
y_target_A = y_B_ss * target_y_ratio;

% B. Calibrate Country A (Leader) via Nested Solver
find_A0_A = @(a_guess) get_y( ...
    fzero(@(k) get_r_private(k, b_start, rho, gamma, a_guess, 1, delta, lambda) - r_target, [0.01, 2000]), ...
    b_start, rho, gamma, a_guess, 1) - y_target_A;

A0_A = fzero(find_A0_A, [0.1, 10]);

% C. Final steady-state physical stocks under the private-return economy
k_ss_A = fzero(@(k) get_r_private(k, b_start, rho, gamma, A0_A, 1, delta, lambda) - r_target, [0.01, 2000]);

% D. Base savings rates
% Keep the calibration block focused on technology / initial capital only.
% Do not let government revenue or AI-income accounting enter here.
y_A_ss = get_y(k_ss_A, b_start, rho, gamma, A0_A, 1);

s_base_A = (delta * k_ss_A) / y_A_ss;
s_base_B = (delta * k_ss_B) / y_B_ss;
s_base_vec = [s_base_A; s_base_B];

% E. Path Generation
A_path_A = A0_A * (1 + g_A).^t;
A_path_B = A0_B * (1 + g_B).^t;

fprintf('--- Calibration Results ---\n');
fprintf('Target Output Ratio: %.2f\n', target_y_ratio);
fprintf('Calibrated A0_A: %.4f (A0_B = 1.0)\n', A0_A);
fprintf('Initial per capita k ratio: = %.2f\n', k_ss_A/k_ss_B);
fprintf('Initial private return target: %.4f\n', r_target);
fprintf('Base savings rates: A = %.4f, B = %.4f\n', s_base_A, s_base_B);


% Beta Path
tidal_max = 0.25;
tidal_lag_B = 6;
tidal_midpoint = 10;
tidal_steepness = 0.32;
gulf_max = 0.65;
gulf_leakage_B = 0.9;
theta = 0;   % 0 = Tidal, 1 = Gulf, anything in between = hybrid

beta0 = b_start;

flow_max_A  = tidal_max + theta * (gulf_max - tidal_max);
flow_lag_B  = tidal_lag_B;
flow_mid    = tidal_midpoint;
flow_steep  = tidal_steepness;
flow_leak_B = theta * gulf_leakage_B;

% Leader: normalized logistic so betaA(0) = beta0 exactly
logisticA_raw = 1 ./ (1 + exp(-flow_steep * (t - flow_mid)));
logisticA_0 = 1 ./ (1 + exp(-flow_steep * (0 - flow_mid)));
logisticA = (logisticA_raw - logisticA_0) ./ (1 - logisticA_0);
betaA = beta0 + (flow_max_A - beta0) .* logisticA;

% Follower: same normalization, but with lag
logisticB_raw = 1 ./ (1 + exp(-flow_steep * ((t - flow_lag_B) - flow_mid)));
logisticB_0 = 1 ./ (1 + exp(-flow_steep * ((0 - flow_lag_B) - flow_mid)));
logisticB = (logisticB_raw - logisticB_0) ./ (1 - logisticB_0);

betaB_raw = beta0 + (flow_max_A - beta0) .* logisticB;
betaB = beta0 + (1 - flow_leak_B) .* (betaB_raw - beta0);

% --- Beta path comparison across theta values ---
% theta_grid = linspace(0, 1, 5);
% 
% figure('Color', 'w', 'Position', [100 100 900 550]);
% hold on;
% 
% cols = lines(length(theta_grid));
% 
% for ii = 1:length(theta_grid)
%     theta_i = theta_grid(ii);
% 
%     flow_max_A_i  = tidal_max + theta_i * (gulf_max - tidal_max);
%     flow_lag_B_i  = tidal_lag_B;
%     flow_mid_i    = tidal_midpoint;
%     flow_steep_i  = tidal_steepness;
%     flow_leak_B_i = theta_i * gulf_leakage_B;
% 
%     logisticA_i = 1 ./ (1 + exp(-flow_steep_i * (t - flow_mid_i)));
%     betaA_i = beta0 + (flow_max_A_i - beta0) .* logisticA_i;
% 
%     logisticB_i = 1 ./ (1 + exp(-flow_steep_i * ((t - flow_lag_B_i) - flow_mid_i)));
%     betaB_raw_i = beta0 + (flow_max_A_i - beta0) .* logisticB_i;
%     betaB_i = beta0 + (1 - flow_leak_B_i) .* (betaB_raw_i - beta0);
% 
%     plot(t, betaA_i, '-',  'LineWidth', 2, 'Color', cols(ii,:));
%     plot(t, betaB_i, '--', 'LineWidth', 2, 'Color', cols(ii,:));
% end
% 
% grid on;
% xlabel('Years');
% ylabel('\beta');
% title('Beta paths for alternative values of \theta');
% 
% legend_entries = cell(1, 2*length(theta_grid));
% for ii = 1:length(theta_grid)
%     legend_entries{2*ii-1} = sprintf('A, \\theta = %.2f', theta_grid(ii));
%     legend_entries{2*ii}   = sprintf('B, \\theta = %.2f', theta_grid(ii));
% end
% legend(legend_entries, 'Location', 'eastoutside');

% --- No-AI baseline (beta = 0 everywhere, lambda = 0) ---
g_noai_v = zeros(2, length(t));
g_noai_global_v = zeros(1, length(t));

P0 = zeros(2,2);
P0(1,1) = k_ss_A * L_A;
P0(2,2) = k_ss_B * L_B;

pipe_A0 = ones(1, length(t)+l) * (delta * P0(1,1));
pipe_B0 = ones(1, length(t)+l) * (delta * P0(2,2));

Y0_prev = [];
Y0_global_prev = [];

for i0 = 1:length(t)
    K0_current = sum(P0, 1)';
    A0_curr = [A_path_A(i0); A_path_B(i0)];

    Y0_curr = zeros(2,1);
    r0_curr = zeros(2,1);

    for k0 = 1:2
        Y0_curr(k0) = get_y(K0_current(k0), 0, rho, gamma, A0_curr(k0), L_vec(k0));
        r0_curr(k0) = get_r_private(K0_current(k0), 0, rho, gamma, A0_curr(k0), L_vec(k0), delta, 0);
    end

    if i0 == 1
        g_noai_v(:,i0) = 0;
        g_noai_global_v(i0) = 0;
    else
        g_noai_v(:,i0) = log(max(Y0_curr, 1e-12)) - log(max(Y0_prev, 1e-12));
        g_noai_global_v(i0) = log(max(sum(Y0_curr), 1e-12)) - log(max(Y0_global_prev, 1e-12));
    end

    if i0 < length(t)
        labor0_inc = Y0_curr - (r0_curr + delta) .* K0_current;

        cap0_inc_A = P0(1,1) * r0_curr(1) + P0(1,2) * (r0_curr(2) - w_vec(2) - tau_vec(1));
        cap0_inc_B = P0(2,2) * r0_curr(2) + P0(2,1) * (r0_curr(1) - w_vec(1) - tau_vec(2));

        gov0_source = [P0(2,1) * w_vec(1); ...
                       P0(1,2) * w_vec(2)];
        gov0_resid  = [P0(1,2) * tau_vec(1); ...
                       P0(2,1) * tau_vec(2)];

        GNI0_curr = labor0_inc + [cap0_inc_A; cap0_inc_B] + gov0_source + gov0_resid;

        idx0_f = min(length(t), i0 + l);
        A0_f = [A_path_A(idx0_f); A_path_B(idx0_f)];

        if l > 1
            decay_vec0 = (1-delta).^(l-1:-1:1)';
            pipe_survive_A0 = pipe_A0(i0+1:i0+l-1) * decay_vec0;
            pipe_survive_B0 = pipe_B0(i0+1:i0+l-1) * decay_vec0;
        else
            pipe_survive_A0 = 0;
            pipe_survive_B0 = 0;
        end

        V0_fixed = [sum(P0(1,:))*(1-delta)^l + pipe_survive_A0; ...
                    sum(P0(2,:))*(1-delta)^l + pipe_survive_B0];

        s_guess0 = s_base_vec;

        for iter0 = 1:max_iters
            V0_proj = V0_fixed + (s_guess0 .* GNI0_curr);
            V0_proj = max(V0_proj, 1e-12);

            [K0_target_f, P0_target_f, ~, ~] = solve_2c_market_exact( ...
                V0_proj, [0; 0], delta, A0_f, L_vec, gamma, rho, w_vec, tau_vec, 0);

            rr0_f_A = get_r_private(K0_target_f(1), 0, rho, gamma, A0_f(1), L_vec(1), delta, 0);
            rr0_f_B = get_r_private(K0_target_f(2), 0, rho, gamma, A0_f(2), L_vec(2), delta, 0);

            r0_yield_A = (P0_target_f(1,1) * rr0_f_A + P0_target_f(1,2) * (rr0_f_B - w_vec(2) - tau_vec(1))) / max(V0_proj(1), 1e-12);
            r0_yield_B = (P0_target_f(2,2) * rr0_f_B + P0_target_f(2,1) * (rr0_f_A - w_vec(1) - tau_vec(2))) / max(V0_proj(2), 1e-12);

            s0_new = [s_base_vec(1) + phi * (r0_yield_A - r_target); ...
                      s_base_vec(2) + phi * (r0_yield_B - r_target)];

            if max(abs(s0_new - s_guess0)) < 1e-6
                break;
            end
            s_guess0 = s0_new;
        end

        pipe_A0(i0+l) = s_guess0(1) * GNI0_curr(1);
        pipe_B0(i0+l) = s_guess0(2) * GNI0_curr(2);

        P0 = P0 .* (1 - delta);
        P0(1,1) = P0(1,1) + pipe_A0(i0+1);
        P0(2,2) = P0(2,2) + pipe_B0(i0+1);
        V0_new = max(sum(P0, 2), 0);

        [~, P0_target, ~, ~] = solve_2c_market_exact( ...
            V0_new, [0; 0], delta, [A_path_A(i0+1); A_path_B(i0+1)], ...
            L_vec, gamma, rho, w_vec, tau_vec, 0);

        P0 = P0_target;
    end

    Y0_prev = Y0_curr;
    Y0_global_prev = sum(Y0_curr);
end

% Fill in the matrices
GNI_parts_all = zeros(2, length(t), 4);   
regime_all = zeros(1, length(t));         
gov_rev_source_all = zeros(2, length(t)); 
gov_rev_resid_all  = zeros(2, length(t)); 
gov_rev_total_all  = zeros(2, length(t)); 
g_v = zeros(2, length(t));
rg_v = zeros(2, length(t));
mpl_v = zeros(2, length(t));
bA_r = [betaA, repmat(betaA(end), 1, l+2)];
bB_r = [betaB, repmat(betaB(end), 1, l+2)];
mpl_priv_v = zeros(2, length(t));
labor_share_y_v = zeros(2, length(t));
capital_share_y_v = zeros(2, length(t));
ai_share_y_v = zeros(2, length(t));
P = zeros(2,2);
P(1,1) = k_ss_A * L_A;
P(2,2) = k_ss_B * L_B;
V_v = zeros(2, length(t));
K_v = zeros(2, length(t));
Y_v = zeros(2, length(t));
Y_net_v = zeros(2, length(t));
ai_rent_v = zeros(2, length(t));
r_priv_v = zeros(2, length(t));
starve_gap_v = zeros(1, length(t));
GNI_v = zeros(2, length(t));
ai_rev_global_pct_gni_v = zeros(1, length(t));
s_rate_v = zeros(2, length(t));
LS_v = zeros(2, length(t));
rentier_idx_v = zeros(2, length(t));
foreign_inc = zeros(2, length(t));
offshore_ratio_v = zeros(2, length(t));
pipe_A = ones(1, length(t)+l) * (delta * P(1,1));
pipe_B = ones(1, length(t)+l) * (delta * P(2,2));
s_guess = s_base_vec;
g_global_v = zeros(1, length(t));

    %% --- 5. MAIN SIMULATION LOOP ---
    figure('Color', 'w', 'Position', [50 50 700 2300]);

    for i = 1:length(t)
        % Step A: Global Accounting (current physical reality)
        K_current = sum(P, 1)';
        K_v(:, i) = K_current;
        V_curr = sum(P, 2);
        V_v(:, i) = V_curr;
        b_r = [bA_r(i); bB_r(i)];
        max_beta = max(b_r);
        b_frontier = [max_beta; max_beta];
        A_curr = [A_path_A(i); A_path_B(i)];

        offshore_ratio_v(:,i) = [P(1,2) / max(V_curr(1), 1e-12); ...
                                 P(2,1) / max(V_curr(2), 1e-12)];

        for k = 1:2
            Y_v(k,i) = get_y(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k));
            ai_rent_v(k,i) = get_ai_rent(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k), lambda);
            Y_net_v(k,i) = Y_v(k,i) - ai_rent_v(k,i);
            r_priv_v(k,i) = get_r_private(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k), delta, lambda);
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
        tol_aut = 1e-10;
        pAB = P(1,2);   % A-owned capital located in B  => A exports to B
        pBA = P(2,1);   % B-owned capital located in A  => B exports to A

        is_AB = abs(pAB) > tol_aut;
        is_BA = abs(pBA) > tol_aut;

        if ~is_AB && ~is_BA
            regime_curr = 0;
        elseif is_AB && ~is_BA
            regime_curr = +1;
        elseif ~is_AB && is_BA
            regime_curr = -1;
        else
            warning('Current P has both off-diagonal entries active at t=%d: P12=%g, P21=%g', i, pAB, pBA);
            if abs(pAB) >= abs(pBA)
                regime_curr = +1;
            else
                regime_curr = -1;
            end
        end
        regime_all(i) = regime_curr;

        % Shadow market using frontier automation, with exact corner logic
        [K_frontier, ~, ~, ~] = solve_2c_market_exact(V_curr, b_frontier, delta, A_curr, L_vec, gamma, rho, w_vec, tau_vec, lambda);

        % Follower starvation gap relative to frontier allocation
        starve_gap_v(i) = (K_frontier(2) - K_current(2)) / (K_frontier(2) + 1e-12);

        % Government revenue for the current period, timed on the current portfolio P
        gov_source_curr = [P(2,1) * w_vec(1); ...
                           P(1,2) * w_vec(2)];
        gov_resid_curr  = [P(1,2) * tau_vec(1); ...
                           P(2,1) * tau_vec(2)];
        gov_total_curr  = gov_source_curr + gov_resid_curr;

        gov_rev_source_all(:, i) = gov_source_curr;
        gov_rev_resid_all(:, i)  = gov_resid_curr;
        gov_rev_total_all(:, i)  = gov_total_curr;

        % 1. Labor income net of AI revenue (residual claimant on net output)
        labor_inc = Y_net_v(:,i) - (r_priv_v(:,i) + delta).*K_current;

        % 2. Explicit capital income from portfolio matrix P (after taxes/wedges)
        cap_inc_A = P(1,1) * r_priv_v(1,i) + P(1,2) * (r_priv_v(2,i) - w_vec(2) - tau_vec(1));
        cap_inc_B = P(2,2) * r_priv_v(2,i) + P(2,1) * (r_priv_v(1,i) - w_vec(1) - tau_vec(2));
        cap_inc = [cap_inc_A; cap_inc_B];

        % 3. Total national income (including government revenue, excluding AI revenue)
        GNI_v(:,i) = labor_inc + cap_inc + gov_total_curr;
        ai_rev_global_pct_gni_v(i) = 100 * sum(ai_rent_v(:,i)) / max(abs(sum(GNI_v(:,i))), 1e-12);

        gni_den = GNI_v(:,i);
        gni_den(abs(gni_den) < 1e-12) = 1e-12;
        LS_v(:,i) = labor_inc ./ gni_den;

        % Rentier index = foreign income / GNI
        foreign_inc(1,i) = P(1,2) * (r_priv_v(2,i) - w_vec(2) - tau_vec(1));
        foreign_inc(2,i) = P(2,1) * (r_priv_v(1,i) - w_vec(1) - tau_vec(2));
        rentier_idx_v(:,i) = foreign_inc(:,i) ./ gni_den;

        % GNI partitioning for area plots (per capita): [labor, domestic, foreign, government]
        GNI_parts_all(1, i, 1) = labor_inc(1) / L_A;
        GNI_parts_all(1, i, 2) = P(1,1) * r_priv_v(1,i) / L_A;
        GNI_parts_all(1, i, 3) = P(1,2) * (r_priv_v(2,i) - w_vec(2) - tau_vec(1)) / L_A;
        GNI_parts_all(1, i, 4) = gov_total_curr(1) / L_A;

        GNI_parts_all(2, i, 1) = labor_inc(2) / L_B;
        GNI_parts_all(2, i, 2) = P(2,2) * r_priv_v(2,i) / L_B;
        GNI_parts_all(2, i, 3) = P(2,1) * (r_priv_v(1,i) - w_vec(1) - tau_vec(2)) / L_B;
        GNI_parts_all(2, i, 4) = gov_total_curr(2) / L_B;

        % Log output growth and r-g for the current period
        if i == 1
            g_v(:,i) = 0;
        else
            g_v(:,i) = log(max(Y_v(:,i), 1e-12)) - log(max(Y_v(:,i-1), 1e-12));
            g_global_v(i) = log(max(sum(Y_v(:,i)), 1e-12)) - log(max(sum(Y_v(:,i-1)), 1e-12));

        end
        rg_v(:,i) = r_priv_v(:,i) - g_v(:,i);

        if i < length(t)
            % Step B: Rational foresight loop (project l periods ahead)
            idx_f = min(length(t), i + l);
            bt_f = [bA_r(idx_f); bB_r(idx_f)];
            A_f = [A_path_A(idx_f); A_path_B(idx_f)];

            % Wealth floor in t+l: surviving current wealth + already-queued pipeline
            if l > 1
                decay_vec = (1-delta).^(l-1:-1:1)';
                pipe_survive_A = pipe_A(i+1:i+l-1) * decay_vec;
                pipe_survive_B = pipe_B(i+1:i+l-1) * decay_vec;
            else
                pipe_survive_A = 0;
                pipe_survive_B = 0;
            end

            V_fixed = [sum(P(1,:))*(1-delta)^l + pipe_survive_A; ...
                       sum(P(2,:))*(1-delta)^l + pipe_survive_B];

            % Reset savings guess as a clean column vector
            s_guess = [s_base_vec(1); s_base_vec(2)];

            for iter = 1:max_iters
                % 1. Project total wealth in t+l from today's savings guess
                V_proj = V_fixed + (s_guess .* GNI_v(:,i));
                V_proj = max(V_proj, 1e-12);

                % 2. Solve future market exactly (including autarky / corners)
                [K_target_f, P_target_f, ~, ~] = solve_2c_market_exact(V_proj, bt_f, delta, A_f, L_vec, gamma, rho, w_vec, tau_vec, lambda);

                % 3. Physical returns at future locations
                rr_f_A = get_r_private(K_target_f(1), bt_f(1), rho, gamma, A_f(1), L_vec(1), delta, lambda);
                rr_f_B = get_r_private(K_target_f(2), bt_f(2), rho, gamma, A_f(2), L_vec(2), delta, lambda);

                % 4. Country-specific portfolio yields
                r_yield_A = (P_target_f(1,1) * rr_f_A + P_target_f(1,2) * (rr_f_B - w_vec(2) - tau_vec(1))) / max(V_proj(1), 1e-12);
                r_yield_B = (P_target_f(2,2) * rr_f_B + P_target_f(2,1) * (rr_f_A - w_vec(1) - tau_vec(2))) / max(V_proj(2), 1e-12);
                r_yield = [r_yield_A; r_yield_B];

                % 5. Update savings rates independently
                s_new = [s_base_vec(1) + phi * (r_yield(1) - r_target); ...
                         s_base_vec(2) + phi * (r_yield(2) - r_target)];

                if max(abs(s_new - s_guess)) < 1e-6
                    break;
                end
                s_guess = s_new;
            end

            % Store today's decision to be realized in l periods
            s_rate_v(:, i) = s_guess;
            pipe_A(i+l) = s_guess(1) * GNI_v(1,i);
            pipe_B(i+l) = s_guess(2) * GNI_v(2,i);

            % Step C: Portfolio evolution up to next period's wealth totals
            P = P .* (1 - delta);
            P(1,1) = P(1,1) + pipe_A(i+1);
            P(2,2) = P(2,2) + pipe_B(i+1);
            V_new = max(sum(P, 2), 0);

            % Step D: Exact reallocation into next period equilibrium portfolio
            [~, P_target, ~, ~] = solve_2c_market_exact( ...
                V_new, [bA_r(i+1); bB_r(i+1)], delta, [A_path_A(i+1); A_path_B(i+1)], ...
                L_vec, gamma, rho, w_vec, tau_vec, lambda);

            P = P_target;
        end
    end

    % Government Revenue as % of GNI
    rev_to_gni_A = squeeze(gov_rev_total_all(1, 1:T_sim)).' ./ max(abs(GNI_v(1, 1:T_sim)), 1e-12) * 100;
    rev_to_gni_B = squeeze(gov_rev_total_all(2, 1:T_sim)).' ./ max(abs(GNI_v(2, 1:T_sim)), 1e-12) * 100;
    g_ai_v = g_v - g_noai_v;
    g_ai_global_v = g_global_v - g_noai_global_v;

    %% --- 6. PLOTTING ---
    rows = 13;
    t_p = 1:T_sim;
    autarky_mask = (regime_all(t_p) == 0);

    % Precompute series
    idx_A = Y_v(1, t_p) ./ Y_v(1, 1) * 100;
    idx_B = Y_v(2, t_p) ./ Y_v(2, 1) * 100;

    rA = r_priv_v(1, t_p) * 100;
    rB = r_priv_v(2, t_p) * 100;
    lsyA = labor_share_y_v(1, t_p);
    lsyB = labor_share_y_v(2, t_p);

    ksyA = capital_share_y_v(1, t_p);
    ksyB = capital_share_y_v(2, t_p);

    aisyA = ai_share_y_v(1, t_p);
    aisyB = ai_share_y_v(2, t_p);

    ai_rev_global_pct_gni = ai_rev_global_pct_gni_v(t_p);

    wealth_share = (V_v(1, t_p) / L_A) ./ ((V_v(1, t_p) / L_A) + (V_v(2, t_p) / L_B)) * 100;

    lsA = LS_v(1, t_p);
    lsB = LS_v(2, t_p);

    sg = starve_gap_v(t_p) * 100;

    gni_idx_A = real(GNI_v(1, t_p) ./ GNI_v(1, 1) * 100);
    gni_idx_B = real(GNI_v(2, t_p) ./ GNI_v(2, 1) * 100);

    rentA = rentier_idx_v(1, t_p) * 100;
    rentB = rentier_idx_v(2, t_p) * 100;

    offA = offshore_ratio_v(1, t_p) * 100;
    offB = offshore_ratio_v(2, t_p) * 100;

    rgA = rg_v(1, t_p) * 100;
    rgB = rg_v(2, t_p) * 100;
    mplA = mpl_v(1, t_p);
    mplB = mpl_v(2, t_p);

    mplpA = mpl_priv_v(1, t_p);
    mplpB = mpl_priv_v(2, t_p);
    gA_noai = g_noai_v(1, t_p) * 100;
    gB_noai = g_noai_v(2, t_p) * 100;
    gA = g_v(1,t_p)*100;
    gB = g_v(2,t_p)*100;



    % Row metadata
    row_titles = { ...
    sprintf('Adoption Path (\\theta = %.2f,\\lambda = %.2f, g_A = %.3f, g_B = %.3f)', theta, lambda, g_A, g_B), ...
    'Output Index (Y)', ...
    'Realized Returns (%)', ...
    'Global AI Revenue (% of National Income)', ...
    'Wealth Share % (p.c.)', ...
    'Output Shares: Labor / Capital / AI', ...
    'Starvation Gap (%)', ...
    'National Income Index', ...
    'Rentier Index', ...
    'R - G (%)', ...
    'Offshore Capital %',...
    'MPL vs MPL Private',...
    'Growth Rate: With vs Without AI'
    };

    row_data = { ...
        {bA_r(t_p), 'b', '-', bB_r(t_p), 'r', '-'}, ...
        {idx_A, 'b', '-', idx_B, 'r', '-'}, ...
        {rA, 'b', '-', rB, 'r', '--'}, ...
        {ai_rev_global_pct_gni, 'k', '-'}, ...
        {wealth_share, 'b', '-'}, ...
        {lsyA, 'b', '-', lsyB, 'r', '-', ksyA, 'b', '--', ksyB, 'r', '--', aisyA, 'b', ':', aisyB, 'r', ':'}, ...
        {sg, 'r', '-'}, ...
        {gni_idx_A, 'b', '-', gni_idx_B, 'r', '-'}, ...
        {rentA, 'b', '-', rentB, 'r', '-'}, ...
        {rgA, 'b', '-', rgB, 'r', '-'}, ...
        {offA, 'b', '-', offB, 'r', '-'},...
        {mplA, 'b', '-', mplB, 'r', '-', mplpA, 'b', '--', mplpB, 'r', '--'},...
        {gA, 'b', '-', gB, 'r', '-', gA_noai, 'b', '--', gB_noai, 'r', '--'}
        };

    row_ylims = { ...
        [0, max([bA_r(t_p), bB_r(t_p)]) * 1.2], ...
        [min([idx_A, idx_B]), max([idx_A, idx_B]) * 1.1], ...
        [min(r_priv_v(:, t_p) * 100, [], 'all') - 1, max(r_priv_v(:, t_p) * 100, [], 'all') + 1], ...
        [0, max(1, max(ai_rev_global_pct_gni(:)) * 1.1)], ...
        [10, 100], ...
        [0.05, 0.7], ...
        [-5, max(starve_gap_v(t_p) * 100) * 1.2 + 5], ...
        [min([gni_idx_A, gni_idx_B]) * 0.9, max([gni_idx_A, gni_idx_B]) * 1.1], ...
        [min(rentier_idx_v(:, t_p) * 100, [], 'all') - 2, max(rentier_idx_v(:, t_p) * 100, [], 'all') + 2], ...
        [min(rg_v(:, t_p) * 100, [], 'all') - 1, max(rg_v(:, t_p) * 100, [], 'all') + 1], ...
        [min([offA, offB]), max(0.1, max([offA, offB]) * 1.1)],...
        [min([mpl_v(:, t_p), mpl_priv_v(:, t_p)], [], 'all') * 0.9, ...
        max([mpl_v(:, t_p), mpl_priv_v(:, t_p)], [], 'all') * 1.1],...
        [min([g_v(:, t_p) * 100, g_noai_v(:, t_p) * 100], [], 'all') - 0.5, ...
        max([g_v(:, t_p) * 100, g_noai_v(:, t_p) * 100], [], 'all') + 0.5],
        };

    for r = 1:rows
        subplot(rows, 1, r);
        hold on;

        spec = row_data{r};

        % plot all series in this row
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

            % replot lines so they stay on top
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
figure('Color', 'w', 'Position', [100 100 1100 400]);
for c = 1:2
    subplot(1, 2, c);
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
set(lgd, 'Position', [0.28, 0.02, 0.45, 0.04]);

% --- Annualized growth rate over the simulation horizon (Leader) ---
years_span = t(T_sim) - t(1);

leader_total_growth_factor = Y_v(1, T_sim) / Y_v(1, 1);
leader_annualized_growth = leader_total_growth_factor^(1 / years_span) - 1;

fprintf('\n--- Leader annualized growth over years %.0f to %.0f ---\n', t(1), t(T_sim));
fprintf('Total growth factor: %.4f\n', leader_total_growth_factor);
fprintf('Annualized growth rate: %.4f (%.2f%%)\n', leader_annualized_growth, 100 * leader_annualized_growth);

follower_total_growth_factor = Y_v(2, T_sim) / Y_v(2, 1);
follower_annualized_growth = follower_total_growth_factor^(1 / years_span) - 1;

fprintf('\n--- Follower annualized growth over years %.0f to %.0f ---\n', t(1), t(T_sim));
fprintf('Total growth factor: %.4f\n', follower_total_growth_factor);
fprintf('Annualized growth rate: %.4f (%.2f%%)\n', follower_annualized_growth, 100 * follower_annualized_growth);
%% --- HELPERS ---
function y = get_y(k, bt, rho, gamma, A, L)
    % Safe evaluation at/near zero capital.
    k_eff = max(k, 1e-12);
    task_agg = max(1e-12, bt.^(1-rho).*k_eff.^rho + (1-bt).^(1-rho).*L.^rho);
    y = A .* k_eff.^gamma .* (task_agg.^((1-gamma)./rho));

    % Exact zero-capital corner
    y(k <= 0) = 0;
end


function r = get_r(k, bt, rho, gamma, A, L, d_val)
    % Safe evaluation of the net physical return near zero capital.
    k_eff = max(k, 1e-12);
    task_agg = max(1e-12, bt.^(1-rho).*k_eff.^rho + (1-bt).^(1-rho).*L.^rho);
    share = (bt.^(1-rho).*k_eff.^rho) ./ task_agg;
    y_over_k = get_y(k_eff, bt, rho, gamma, A, L) ./ k_eff;
    r = (gamma + (1-gamma) .* share) .* y_over_k - d_val;
end


function ai_rent = get_ai_rent(k, bt, rho, gamma, A, L, lambda)
    % AI monopolist revenue: a fraction lambda of the current-state output
    % surplus enabled by AI, relative to the beta=0 benchmark at the same K.
    y_beta = get_y(k, bt, rho, gamma, A, L);
    y_noai = get_y(k, 0, rho, gamma, A, L);
    ai_rent = lambda .* (y_beta - y_noai);
end


function r = get_r_private(k, bt, rho, gamma, A, L, d_val, lambda)
    % Private net return when AI captures a fraction lambda of the
    % AI-enabled output surplus Y(beta,K) - Y(0,K).
    % Exact derivative:
    %   r_priv = (1-lambda)*MPK(beta) + lambda*MPK(0) - delta
    mpk_gross = get_r(k, bt, rho, gamma, A, L, 0);
    mpk_noai  = get_r(k, 0,  rho, gamma, A, L, 0);
    r = (1 - lambda) .* mpk_gross + lambda .* mpk_noai - d_val;
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

function [K_vec, P_star, aut_flags, regime] = solve_2c_market_exact(V_vec, bt, d_val, A, L, gamma, rho, w, tau, lambda)
    % Exact 2-country allocation with taxes on foreigners.
    %
    % Inputs:
    %   V_vec = [V_A; V_B] wealth owned by A and B
    %   bt    = [beta_A; beta_B]
    %   w     = [omega_A; omega_B], where omega_k is the tax foreigners pay
    %           when investing in country k
    %
    % Outputs:
    %   K_vec    = [K_A; K_B] physical capital installed in each location
    %   P_star   = 2x2 owner-by-location portfolio matrix
    %   aut_flags: whether each country is (approximately) at its own-wealth allocation
    %   regime   = 0 autarky, +1 A exports to B, -1 B exports to A

    tol = 1e-10;

    V_A = max(V_vec(1), 0);
    V_B = max(V_vec(2), 0);

    if (V_A + V_B) <= tol
        K_vec = [0; 0];
        P_star = zeros(2,2);
        aut_flags = [true; true];
        regime = 0;
        return;
    end

    % Returns at autarky allocation
    rA_aut = get_r_private(V_A, bt(1), rho, gamma, A(1), L(1), d_val, lambda);
    rB_aut = get_r_private(V_B, bt(2), rho, gamma, A(2), L(2), d_val, lambda);

    % Home return minus foreign net return for each investor
    gapA = rA_aut - (rB_aut - w(2) - tau(1));
    gapB = rB_aut - (rA_aut - w(1) - tau(2));

    % Case 1: Autarky
    if (gapA >= -tol) && (gapB >= -tol)
        K_vec = [V_A; V_B];
        P_star = [V_A, 0; 0, V_B];
        aut_flags = [true; true];
        regime = 0;
        return;
    end

    % Case 2: A exports capital to B
    if (gapA < -tol) && (gapB >= -tol)
        f = @(x) get_r_private(V_A - x, bt(1), rho, gamma, A(1), L(1), d_val, lambda) - ...
                 (get_r_private(V_B + x, bt(2), rho, gamma, A(2), L(2), d_val, lambda) - w(2) - tau(1));

        if V_A <= tol
            x = 0;
        elseif f(V_A) < 0
            % Corner: all A wealth goes abroad
            x = V_A;
        else
            x = bisect_root(f, 0, V_A, 1e-10, 200);
        end

        K_A = V_A - x;
        K_B = V_B + x;
        K_vec = [K_A; K_B];
        P_star = [K_A, x; 0, V_B];
        aut_flags = [abs(K_A - V_A) < max(1e-9, 0.005*max(V_A,1)); ...
                     abs(K_B - V_B) < max(1e-9, 0.005*max(V_B,1))];
        regime = +1;
        return;
    end

    % Case 3: B exports capital to A
    if (gapB < -tol) && (gapA >= -tol)
        f = @(x) get_r_private(V_B - x, bt(2), rho, gamma, A(2), L(2), d_val, lambda) - ...
                 (get_r_private(V_A + x, bt(1), rho, gamma, A(1), L(1), d_val, lambda) - w(1) - tau(2));

        if V_B <= tol
            x = 0;
        elseif f(V_B) < 0
            % Corner: all B wealth goes abroad
            x = V_B;
        else
            x = bisect_root(f, 0, V_B, 1e-10, 200);
        end

        K_B = V_B - x;
        K_A = V_A + x;
        K_vec = [K_A; K_B];
        P_star = [V_A, 0; x, K_B];
        aut_flags = [abs(K_A - V_A) < max(1e-9, 0.005*max(V_A,1)); ...
                     abs(K_B - V_B) < max(1e-9, 0.005*max(V_B,1))];
        regime = -1;
        return;
    end

    % Numerical knife-edge fallback (with nonnegative taxes, this should be rare)
    if gapA < gapB
        f = @(x) get_r_private(V_A - x, bt(1), rho, gamma, A(1), L(1), d_val, lambda) - ...
                 (get_r_private(V_B + x, bt(2), rho, gamma, A(2), L(2), d_val, lambda) - w(2) - tau(1));

        if V_A <= tol
            x = 0;
        elseif f(V_A) < 0
            x = V_A;
        else
            x = bisect_root(f, 0, V_A, 1e-10, 200);
        end

        K_A = V_A - x;
        K_B = V_B + x;
        K_vec = [K_A; K_B];
        P_star = [K_A, x; 0, V_B];
        regime = +1;
    else
        f = @(x) get_r_private(V_B - x, bt(2), rho, gamma, A(2), L(2), d_val, lambda) - ...
                 (get_r_private(V_A + x, bt(1), rho, gamma, A(1), L(1), d_val, lambda) - w(1) - tau(2));

        if V_B <= tol
            x = 0;
        elseif f(V_B) < 0
            x = V_B;
        else
            x = bisect_root(f, 0, V_B, 1e-10, 200);
        end

        K_B = V_B - x;
        K_A = V_A + x;
        K_vec = [K_A; K_B];
        P_star = [V_A, 0; x, K_B];
        regime = -1;
    end

    aut_flags = [abs(K_vec(1) - V_A) < max(1e-9, 0.005*max(V_A,1)); ...
                 abs(K_vec(2) - V_B) < max(1e-9, 0.005*max(V_B,1))];
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


function shade_autarky_bands(t_p, mask)
    mask = mask(:)';
    dmask = diff([0 mask 0]);
    starts = find(dmask == 1);
    ends_ = find(dmask == -1) - 1;
    yl = ylim;

    for ii = 1:length(starts)
        patch([t_p(starts(ii)) t_p(ends_(ii)) t_p(ends_(ii)) t_p(starts(ii))], ...
              [yl(1) yl(1) yl(2) yl(2)], ...
              [0.80 0.80 0.80], ...
              'EdgeColor', 'none', ...
              'FaceAlpha', 0.35, ...
              'HandleVisibility', 'off');
    end
end
