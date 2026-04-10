%% Three-Country Task-Based Growth Model (Optimized & Verified)
% Leader (A), Follower (B), and Laggard (C)
%
% Exact multi-country allocation with:
%   - source-based taxes on foreigners (omega)
%   - residence-based taxes on own citizens' foreign returns (tau)
%
% The capital market is solved as a concave portfolio-allocation problem.
% Rather than enumerating all 3-country flow regimes by hand, the helper
% solve_3c_market_numeric() performs exact pairwise capital-transfer steps.
% Each step solves its 1-D line search exactly, so corner solutions,
% autarky, and split portfolios arise endogenously.

tic
clear; clc; close all;

% --- 1. GLOBAL PARAMETERS ---
T = 60; T_sim = 40; dt = 1; t = 0:dt:T;
l = 3;
steepness_gen = 0.8;

% --- 2. STRUCTURAL PARAMETERS ---

% --- CAPITAL CONTROLS / SOURCE-BASED TAX ON FOREIGNERS (omega) ---
omega_A = 0;
omega_B = 0;
omega_C = 0;
w_vec = [omega_A; omega_B; omega_C];

% --- RESIDENCE-BASED TAX ON OWN CITIZENS' FOREIGN RETURNS (tau) ---

tau_A = 0;
tau_B = 0;
tau_C = 0;
tau_vec = [tau_A; tau_B; tau_C];

max_iters = 50;

% --- TARGET PC OUTPUT RATIOS ---
target_y_A_to_C = 2.0; % Leader is 2x Laggard
target_y_B_to_C = 1.5; % Follower is 1.5x Laggard

L_C = 1.0;
L_A = 5.0;
L_B = 3.0;
L_vec = [L_A; L_B; L_C];

A0_C = 1.0; % Laggard productivity as numeraire
sigma = 0.4; rho = (sigma - 1)/sigma;
delta = 0.05; phi = 0.25; gamma = 0.33;
r_target = 0.04; b_start = 0.001;

%% --- 3. TRIPLE STEADY-STATE CALIBRATION ---

% A. Calibrate Country C (Laggard) - the numeraire
f_r_C = @(k) get_r(k, b_start, rho, gamma, A0_C, 1, delta) - r_target;
k_ss_C = fzero(f_r_C, [0.01, 1000]);
y_ss_C = get_y(k_ss_C, b_start, rho, gamma, A0_C, 1);

% B. Calibrate Country B (Follower) relative to C
y_target_B = y_ss_C * target_y_B_to_C;
find_A0_B = @(a_guess) get_y( ...
    fzero(@(k) get_r(k, b_start, rho, gamma, a_guess, 1, delta) - r_target, [0.01, 2000]), ...
    b_start, rho, gamma, a_guess, 1) - y_target_B;
A0_B = fzero(find_A0_B, [0.1, 10]);
k_ss_B = fzero(@(k) get_r(k, b_start, rho, gamma, A0_B, 1, delta) - r_target, [0.01, 2000]);

% C. Calibrate Country A (Leader) relative to C
y_target_A = y_ss_C * target_y_A_to_C;
find_A0_A = @(a_guess) get_y( ...
    fzero(@(k) get_r(k, b_start, rho, gamma, a_guess, 1, delta) - r_target, [0.01, 2000]), ...
    b_start, rho, gamma, a_guess, 1) - y_target_A;
A0_A = fzero(find_A0_A, [0.1, 10]);
k_ss_A = fzero(@(k) get_r(k, b_start, rho, gamma, A0_A, 1, delta) - r_target, [0.01, 2000]);

% D. Scale to total initial capital (K = k * L)
K_init_A = k_ss_A * L_A;
K_init_B = k_ss_B * L_B;
K_init_C = k_ss_C * L_C;

% E. Base savings rates
s_base_A = (delta * k_ss_A) / get_y(k_ss_A, b_start, rho, gamma, A0_A, 1);
s_base_B = (delta * k_ss_B) / get_y(k_ss_B, b_start, rho, gamma, A0_B, 1);
s_base_C = (delta * k_ss_C) / get_y(k_ss_C, b_start, rho, gamma, A0_C, 1);
s_base_vec = [s_base_A; s_base_B; s_base_C];

% F. Print verification
fprintf('--- Three-Country Per-Capita Calibration Results ---\n');
fprintf('Target Output Ratios (vs C): A/C = %.2f, B/C = %.2f\n', target_y_A_to_C, target_y_B_to_C);
fprintf('Calibrated TFP (A0): A = %.4f, B = %.4f, (C = 1.0)\n', A0_A, A0_B);
fprintf('Steady State k (p.c.): A = %.2f, B = %.2f, C = %.2f\n', k_ss_A, k_ss_B, k_ss_C);
fprintf('Total Initial K: A = %.2f, B = %.2f, C = %.2f\n', K_init_A, K_init_B, K_init_C);

% G. TFP paths
A_path_A = A0_A * (1 + 0).^t;
A_path_B = A0_B * (1 + 0).^t;
A_path_C = A0_C * (1 + 0).^t;

%% --- 4. SCENARIOS ---

% --- 1. HYPE PARAMETERS (Scenario 1) ---
hype_realized_max_A = 0.09;
hype_realized_max_B = 0.05;
hype_realized_max_C = 0.025;
hype_perc_peak = 0.19;
hype_trough_depth = 0.05;

% --- 2. TIDAL WAVE PARAMETERS (Scenario 2) ---
tidal_max = 0.35;
tidal_lag_B = 6;
tidal_lag_C = 12;
tidal_midpoint = 18;
tidal_steepness = 0.32;

% --- 3. LOGJAM PARAMETERS (Scenario 3) ---
logjam_max = 0.50;
logjam_plateau_dur = 6;     
logjam_lag_B = 8;
logjam_mid1 = 8; 
logjam_mid2 = logjam_mid1 + 8 + logjam_plateau_dur;

% --- 4. GULF PARAMETERS (Scenario 4) ---
gulf_max = 0.9;
gulf_plateau_gap = 10;       
gulf_leakage_B = 0.231;       
gulf_leakage_C = 0.08;       
gulf_mid1 = 10;
gulf_mid2 = gulf_mid1 + gulf_plateau_gap + 5; 

% --- GENERATION ---

% Scenario 1: Hype
beta_A1 = b_start + ((hype_realized_max_A - b_start) ./ (1 + exp(-steepness_gen * (t - 5))));
S_peak = (1 ./ (1 + exp(-2.5 * (t - 3)))) .* (1 ./ (1 + exp(1.8 * (t - 7))));
S_trough = (1 ./ (1 + exp(-1.2 * (t - 10)))) .* (1 ./ (1 + exp(0.6 * (t - 20))));
beta_perc_A1 = max(1e-6, beta_A1 + (hype_perc_peak * S_peak) - (hype_trough_depth * S_trough));
beta_B1 = b_start + ((hype_realized_max_B - b_start) ./ (1 + exp(-steepness_gen * (t - 6))));
beta_C1 = b_start + ((hype_realized_max_C - b_start) ./ (1 + exp(-steepness_gen * (t - 8))));

% Scenario 2: Tidal Flow
beta_A2 = b_start + (tidal_max ./ (1 + exp(-tidal_steepness * (t - tidal_midpoint))));
beta_B2 = [ones(1, tidal_lag_B) * b_start, beta_A2(1:end-tidal_lag_B)];
beta_C2 = [ones(1, tidal_lag_C) * b_start, beta_A2(1:end-tidal_lag_C)];

% Scenario 3: Logjam
beta_A3 = b_start + (0.20 ./ (1 + exp(-steepness_gen * (t - logjam_mid1))) + ...
          (logjam_max - 0.20) ./ (1 + exp(-steepness_gen * (t - logjam_mid2))));
beta_B3 = [ones(1, logjam_lag_B) * b_start, beta_A3(1:end-logjam_lag_B)];
beta_C3 = [ones(1, logjam_lag_B * 2) * b_start, beta_A3(1:end-logjam_lag_B*2)];

% Scenario 4: The Gulf
beta_A4 = b_start + (0.4 ./ (1 + exp(-0.8 * (t - gulf_mid1))) + ...
          (gulf_max - 0.4) ./ (1 + exp(-0.8 * (t - gulf_mid2))));
beta_B4 = beta_A4 * gulf_leakage_B;
beta_C4 = beta_A4 * gulf_leakage_C;

scenarios = {{beta_A1, beta_B1, beta_C1, beta_perc_A1, beta_B1, beta_C1}, ...
             {beta_A2, beta_B2, beta_C2, beta_A2, beta_B2, beta_C2}, ...
             {beta_A3, beta_B3, beta_C3, beta_A3, beta_B3, beta_C3}, ...
             {beta_A4, beta_B4, beta_C4, beta_A4, beta_B4, beta_C4}};
titles = {'Scenario 1: Hype', 'Scenario 2: Tidal Flow', 'Scenario 3: Logjam', 'Scenario 4: The Gulf'};

%% --- 5. STORAGE ---
nC = 3;
nS = numel(scenarios);

GNI_parts_all      = zeros(nS, nC, length(t), 3);   % labor, home-capital, foreign-capital
support_all        = false(nS, nC, nC, length(t));  % active owner-location links
pure_autarky_all   = false(nS, length(t));          % true when all off-diagonal positions are zero
gov_rev_source_all = zeros(nS, nC, length(t));
gov_rev_resid_all  = zeros(nS, nC, length(t));
gov_rev_total_all  = zeros(nS, nC, length(t));

%% --- 6. MAIN SIMULATION LOOP ---
figure('Color', 'w', 'Position', [50 50 1500 2300]);
clrs = [0 0.447 0.741; ...
        0.85 0.325 0.098; ...
        0.466 0.674 0.188];

for j = 1:nS
    curr = scenarios{j};

    % Realized paths
    bA_r = [curr{1}, repmat(curr{1}(end), 1, l + 2)];
    bB_r = [curr{2}, repmat(curr{2}(end), 1, l + 2)];
    bC_r = [curr{3}, repmat(curr{3}(end), 1, l + 2)];

    % Perceived paths used for l-step-ahead savings decisions
    bP_A = [curr{4}, repmat(curr{4}(end), 1, l + 2)];
    bP_B = [curr{5}, repmat(curr{5}(end), 1, l + 2)];
    bP_C = [curr{6}, repmat(curr{6}(end), 1, l + 2)];

    % P(row, col): wealth owner row invested in location col
    P = diag([K_init_A, K_init_B, K_init_C]);

    V_v = zeros(nC, length(t));
    K_v = zeros(nC, length(t));
    Y_v = zeros(nC, length(t));
    mpl_v = zeros(nC, length(t));
    starve_gap_v = zeros(nC, length(t));
    r_real_v = zeros(nC, length(t));
    GNI_v = zeros(nC, length(t));
    s_rate_v = zeros(nC, length(t));
    autarky_v = false(nC, length(t));
    LS_v = zeros(nC, length(t));
    NIIP_v = zeros(nC, length(t));
    rentier_idx_v = zeros(nC, length(t));
    foreign_inc = zeros(nC, length(t));
    offshore_ratio_v = zeros(nC, length(t));

    % Pipeline of investments that materialize with lag l
    pipe = repmat(delta * diag(P), 1, length(t) + l);

    % Warm starts for repeated equilibrium solves
    P_guess_frontier = P;
    P_guess_next = P;

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
            r_real_v(k, i) = get_r(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k), delta);
            mpl_v(k, i) = get_mpl(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k));
        end

        % Frontier allocation under the best currently available automation level
        [K_frontier, P_frontier, ~, ~] = solve_3c_market_numeric( ...
            V_curr, b_frontier, delta, A_curr, L_vec, gamma, rho, w_vec, tau_vec, P_guess_frontier);
        P_guess_frontier = P_frontier;
        starve_gap_v(:, i) = (K_frontier - K_current) ./ max(K_frontier, 1e-12);

        % Labor income: output minus gross machine payments on installed capital
        labor_inc = Y_v(:, i) - (r_real_v(:, i) + delta) .* K_current;

        % Portfolio capital income, owner by owner
        cap_inc = zeros(nC, 1);
        for owner = 1:nC
            for loc = 1:nC
                if owner == loc
                    ret_ol = r_real_v(loc, i);
                else
                    ret_ol = r_real_v(loc, i) - w_vec(loc) - tau_vec(owner);
                    foreign_inc(owner, i) = foreign_inc(owner, i) + P(owner, loc) * ret_ol;
                end
                cap_inc(owner) = cap_inc(owner) + P(owner, loc) * ret_ol;
            end
        end

        GNI_v(:, i) = labor_inc + cap_inc;

        gni_den = GNI_v(:, i);
        gni_den(abs(gni_den) < 1e-12) = 1e-12;

        LS_v(:, i) = labor_inc ./ gni_den;
        NIIP_v(:, i) = (V_curr - K_current) ./ gni_den;
        rentier_idx_v(:, i) = foreign_inc(:, i) ./ gni_den;

        % GNI partitions (per capita): labor, domestic capital income, foreign capital income
        for c = 1:nC
            GNI_parts_all(j, c, i, 1) = labor_inc(c) / L_vec(c);
            GNI_parts_all(j, c, i, 2) = P(c, c) * r_real_v(c, i) / L_vec(c);
            GNI_parts_all(j, c, i, 3) = foreign_inc(c, i) / L_vec(c);
        end

        support_all(j, :, :, i) = reshape(P > 1e-8, [1, nC, nC]);
        pure_autarky_all(j, i) = all(abs(P(~eye(nC))) <= 1e-8);

        % Government revenue
        source_rev = zeros(nC, 1);
        resid_rev = zeros(nC, 1);

        
        for loc = 1:nC
            foreign_base = 0;
            for owner = 1:nC
                if owner ~= loc
                    foreign_base = foreign_base + P(owner, loc) * r_real_v(loc, i);
                end
            end
            source_rev(loc) = w_vec(loc) * foreign_base;
        end

        for owner = 1:nC
            offshore_base = 0;
            for loc = 1:nC
                if loc ~= owner
                    offshore_base = offshore_base + P(owner, loc) * r_real_v(loc, i);
                end
            end
            resid_rev(owner) = tau_vec(owner) * offshore_base;
        end
        gov_rev_source_all(j, :, i) = source_rev.';
        gov_rev_resid_all(j, :, i) = resid_rev.';
        gov_rev_total_all(j, :, i) = (source_rev + resid_rev).';

        % Country-level autarky flags:
        % autarkic means both outward and inward foreign positions are near zero
        for c = 1:nC
            outflow_c = sum(P(c, :)) - P(c, c);
            inflow_c = sum(P(:, c)) - P(c, c);
            tol_scale = max(1e-9, 0.005 * max(V_curr(c), 1));
            autarky_v(c, i) = (outflow_c < tol_scale) && (inflow_c < tol_scale);
        end

        %% Step B: Rational-foresight savings decision
        if i < length(t)
            idx_f = min(length(t), i + l);
            bt_f = [bP_A(idx_f); bP_B(idx_f); bP_C(idx_f)];
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
                    V_proj, bt_f, delta, A_f, L_vec, gamma, rho, w_vec, tau_vec, P_guess_f);
                P_guess_f = P_target_f;

                rr_f = zeros(nC, 1);
                for k = 1:nC
                    rr_f(k) = get_r(K_target_f(k), bt_f(k), rho, gamma, A_f(k), L_vec(k), delta);
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

                % Numerical safeguard: uncomment the next line if you want
                % to rule out negative saving rates. As written, dissaving is
                % allowed, matching the spirit of the original 2-country code.
                % s_new = max(s_new, 0);

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
                V_new, [bP_A(i+1); bP_B(i+1); bP_C(i+1)], delta, ...
                [A_path_A(i+1); A_path_B(i+1); A_path_C(i+1)], ...
                L_vec, gamma, rho, w_vec, tau_vec, P_guess_next);

            P_guess_next = P_target;
            P = P_target;
        end
    end

    %% --- 7. PLOTTING ---
    rows = 11;

    % Precompute plot objects
    Y_idx = 100 * bsxfun(@rdivide, Y_v(:, 1:T_sim), Y_v(:, 1));
    GNI_idx = 100 * bsxfun(@rdivide, GNI_v(:, 1:T_sim), GNI_v(:, 1));
    wealth_pc = bsxfun(@rdivide, V_v(:, 1:T_sim), L_vec);
    wealth_pc_share = 100 * bsxfun(@rdivide, wealth_pc, sum(wealth_pc, 1));

    rev_to_gni = 100 * squeeze(gov_rev_total_all(j, :, 1:T_sim));
    rev_to_gni = bsxfun(@rdivide, rev_to_gni, max(GNI_v(:, 1:T_sim), 1e-12));

    t_plot = t(1:T_sim);
    pure_autarky_mask = pure_autarky_all(j, 1:T_sim);

    % Row 1: Automation paths
    subplot(rows, 4, j); hold on;
    plot(t(1:T_sim), bA_r(1:T_sim), '-', 'Color', clrs(1, :), 'LineWidth', 1.8);
    plot(t(1:T_sim), bB_r(1:T_sim), '-', 'Color', clrs(2, :), 'LineWidth', 1.8);
    plot(t(1:T_sim), bC_r(1:T_sim), '-', 'Color', clrs(3, :), 'LineWidth', 1.8);
    plot(t(1:T_sim), bP_A(1:T_sim), 'k--', 'LineWidth', 1.2);
    shade_autarky_bands(t_plot, pure_autarky_mask);
    title(titles{j}); grid on;
    if j == 1
        legend('A realized', 'B realized', 'C realized', 'A perceived', 'Location', 'best');
    end

    % Row 2: Output index
    subplot(rows, 4, 4 + j); hold on;
    plot(t(1:T_sim), Y_idx(1, :), '-', 'Color', clrs(1, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), Y_idx(2, :), '-', 'Color', clrs(2, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), Y_idx(3, :), '-', 'Color', clrs(3, :), 'LineWidth', 1.6);
    shade_autarky_bands(t_plot, pure_autarky_mask);
    title('Output Index (Y)'); grid on;

    % Row 3: Realized returns
    subplot(rows, 4, 8 + j); hold on;
    plot(t(1:T_sim), 100 * r_real_v(1, 1:T_sim), '-', 'Color', clrs(1, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), 100 * r_real_v(2, 1:T_sim), '-', 'Color', clrs(2, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), 100 * r_real_v(3, 1:T_sim), '-', 'Color', clrs(3, :), 'LineWidth', 1.6);
    shade_autarky_bands(t_plot, pure_autarky_mask);
    title('Realized Returns (%)'); grid on;

    % Row 4: Savings rates
    subplot(rows, 4, 12 + j); hold on;
    plot(t(1:T_sim), s_rate_v(1, 1:T_sim), '-', 'Color', clrs(1, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), s_rate_v(2, 1:T_sim), '-', 'Color', clrs(2, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), s_rate_v(3, 1:T_sim), '-', 'Color', clrs(3, :), 'LineWidth', 1.6);
    shade_autarky_bands(t_plot, pure_autarky_mask);
    title('Savings Rate (s)'); grid on;

    % Row 5: Wealth shares in per-capita terms
    subplot(rows, 4, 16 + j); hold on;
    plot(t(1:T_sim), wealth_pc_share(1, :), '-', 'Color', clrs(1, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), wealth_pc_share(2, :), '-', 'Color', clrs(2, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), wealth_pc_share(3, :), '-', 'Color', clrs(3, :), 'LineWidth', 1.6);
    shade_autarky_bands(t_plot, pure_autarky_mask);
    title('Wealth Share % (p.c.)'); grid on;

    % Row 6: Labor share of GNI
    subplot(rows, 4, 20 + j); hold on;
    plot(t(1:T_sim), LS_v(1, 1:T_sim), '-', 'Color', clrs(1, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), LS_v(2, 1:T_sim), '-', 'Color', clrs(2, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), LS_v(3, 1:T_sim), '-', 'Color', clrs(3, :), 'LineWidth', 1.6);
    shade_autarky_bands(t_plot, pure_autarky_mask);
    title('Labour Share of GNI'); grid on;

    % Row 7: Starvation gaps relative to frontier allocation
    subplot(rows, 4, 24 + j); hold on;
    plot(t(1:T_sim), 100 * starve_gap_v(1, 1:T_sim), '-', 'Color', clrs(1, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), 100 * starve_gap_v(2, 1:T_sim), '-', 'Color', clrs(2, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), 100 * starve_gap_v(3, 1:T_sim), '-', 'Color', clrs(3, :), 'LineWidth', 1.6);
    yline(0, 'k:');
    shade_autarky_bands(t_plot, pure_autarky_mask);
    title('Starvation Gap (%)'); grid on;

    % Row 8: GNI index
    subplot(rows, 4, 28 + j); hold on;
    plot(t(1:T_sim), real(GNI_idx(1, :)), '-', 'Color', clrs(1, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), real(GNI_idx(2, :)), '-', 'Color', clrs(2, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), real(GNI_idx(3, :)), '-', 'Color', clrs(3, :), 'LineWidth', 1.6);
    shade_autarky_bands(t_plot, pure_autarky_mask);
    title('GNI Index'); grid on;

    % Row 9: Rentier index
    subplot(rows, 4, 32 + j); hold on;
    plot(t(1:T_sim), 100 * rentier_idx_v(1, 1:T_sim), '-', 'Color', clrs(1, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), 100 * rentier_idx_v(2, 1:T_sim), '-', 'Color', clrs(2, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), 100 * rentier_idx_v(3, 1:T_sim), '-', 'Color', clrs(3, :), 'LineWidth', 1.6);
    shade_autarky_bands(t_plot, pure_autarky_mask);
    title('Rentier Index'); grid on;

    % Row 10: Government revenue to GNI
    subplot(rows, 4, 36 + j); hold on;
    plot(t(1:T_sim), rev_to_gni(1, :), '-', 'Color', clrs(1, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), rev_to_gni(2, :), '-', 'Color', clrs(2, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), rev_to_gni(3, :), '-', 'Color', clrs(3, :), 'LineWidth', 1.6);
    shade_autarky_bands(t_plot, pure_autarky_mask);
    title('Gov Revenue / GNI (%)'); grid on;

    % Row 11: Offshore capital share
    subplot(rows, 4, 40 + j); hold on;
    plot(t(1:T_sim), 100 * offshore_ratio_v(1, 1:T_sim), '-', 'Color', clrs(1, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), 100 * offshore_ratio_v(2, 1:T_sim), '-', 'Color', clrs(2, :), 'LineWidth', 1.6);
    plot(t(1:T_sim), 100 * offshore_ratio_v(3, 1:T_sim), '-', 'Color', clrs(3, :), 'LineWidth', 1.6);
    shade_autarky_bands(t_plot, pure_autarky_mask);
    title('Offshore Capital (%)'); grid on;
end

toc

figure('Color', 'w', 'Position', [100 100 1100 900]);
for s = 1:4
    for c = 1:3
        subplot(4, 3, (s-1)*3 + c); hold on;
        data = squeeze(GNI_parts_all(s, c, 1:T_sim, :));
        shares = data ./ max(sum(data,2), 1e-12);

        h = area(t(1:T_sim), 100*shares, 'EdgeColor', 'none');
        h(1).FaceColor = [0.8 0.3 0.3];
        h(2).FaceColor = [0.3 0.3 0.8];
        h(3).FaceColor = [0.3 0.8 0.3];

        ylim([0 100]);
        if s == 1, title(['Country ' char(64+c)]); end
        if c == 1, ylabel(['S' num2str(s)]); end
        grid on; set(gca, 'Layer', 'top'); axis tight;
    end
end
lgd = legend(h, {'Labor', 'Dom Cap', 'Foreign Cap'}, ...
    'Location', 'southoutside', 'Orientation', 'horizontal');

%% --- HELPERS ---

function y = get_y(k, bt, rho, gamma, A, L)
    % Safe evaluation at or near zero capital.
    k_eff = max(k, 1e-12);
    task_agg = max(1e-12, bt.^(1-rho) .* k_eff.^rho + (1-bt).^(1-rho) .* L.^rho);
    y = A .* k_eff.^gamma .* (task_agg.^((1-gamma) ./ rho));

    % Exact zero-capital corner
    y(k <= 0) = 0;
end

function r = get_r(k, bt, rho, gamma, A, L, d_val)
    % Safe evaluation of the net physical return near zero capital.
    k_eff = max(k, 1e-12);
    task_agg = max(1e-12, bt.^(1-rho) .* k_eff.^rho + (1-bt).^(1-rho) .* L.^rho);
    share = (bt.^(1-rho) .* k_eff.^rho) ./ task_agg;
    y_over_k = get_y(k_eff, bt, rho, gamma, A, L) ./ k_eff;
    r = (gamma + (1-gamma) .* share) .* y_over_k - d_val;
end

function mpl = get_mpl(k, bt, rho, gamma, A, L)
    k_eff = max(k, 1e-12);
    X = bt.^(1-rho) .* k_eff.^rho + (1-bt).^(1-rho) .* L.^rho;
    y = A .* k_eff.^gamma .* (X.^((1-gamma) ./ rho));
    mpl = (1-gamma) .* (y ./ X) .* (1-bt).^(1-rho) .* L.^(rho-1);
end

function [K_vec, P_star, aut_flags, support_mask] = solve_3c_market_numeric( ...
    V_vec, bt, d_val, A, L, gamma, rho, w, tau, P_init)

    % Exact 3-country allocation with source- and residence-based taxes.
    %
    % The equilibrium is the solution to a concave portfolio-allocation
    % problem. We solve it by repeated exact pairwise capital transfers:
    % for any owner i and two locations a,b, we move capital from a to b
    % until either:
    %   (i) marginal net returns equalize, or
    %   (ii) one corner is hit.
    %
    % Because the problem is concave, convergence of these pairwise moves to
    % no-improvement implies the global KKT solution.

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

    if nargin < 10 || isempty(P_init)
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

        % Find the most profitable infinitesimal reallocation
        for i = 1:n
            for a = 1:n
                if P_star(i, a) <= tol_move
                    continue;
                end

                net_a = net_return(i, a, K_vec(a), bt, d_val, A, L, gamma, rho, w, tau);

                for b = 1:n
                    if b == a
                        continue;
                    end

                    net_b = net_return(i, b, K_vec(b), bt, d_val, A, L, gamma, rho, w, tau);
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

        f = @(x) net_return(best_i, best_b, K_vec(best_b) + x, bt, d_val, A, L, gamma, rho, w, tau) - ...
                 net_return(best_i, best_a, K_vec(best_a) - x, bt, d_val, A, L, gamma, rho, w, tau);

        if max_move <= tol_move
            x_star = 0;
        elseif f(max_move) >= 0
            % Corner: all remaining capital in a moves to b
            x_star = max_move;
        else
            % Interior: unique root because the pairwise objective is concave
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
    % Repairs a warm-start portfolio so it is feasible:
    % nonnegative and with row sums equal to V_vec.

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

function val = net_return(owner, loc, K_loc, bt, d_val, A, L, gamma, rho, w, tau)
    val = get_r(K_loc, bt(loc), rho, gamma, A(loc), L(loc), d_val);
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
