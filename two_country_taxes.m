%% Two-Country Task-Based Growth Model
% Leader (A) and Follower (B)
% Rewritten with exact autarky / corner-flow logic for taxes on foreigners.
% The key change is that the capital-market equilibrium is now solved as a
% piecewise problem:
%   regime = 0  : autarky
%   regime = +1 : A exports capital to B
%   regime = -1 : B exports capital to A
%
% This replaces the old smooth interior approximation, which can fail when
% omega is large enough to make corner solutions relevant.

tic
clear; clc; close all;


% --- 1. GLOBAL PARAMETERS ---
T = 60; T_sim = 60; dt = 1; t = 0:dt:T;
l = 3; steepness_gen = 0.8;

% --- 2. STRUCTURAL PARAMETERS ---
ratiolAtoB = 2;
L_A = 5.0; L_B = L_A/ratiolAtoB;
L_vec = [L_A; L_B];

% --- TARGET RATIO CALIBRATION ---
target_y_ratio = 1.5; % Target: Country A output per capita is 1.5x Country B
A0_B = 1.0;           % Follower baseline productivity as numeraire
g_A = 0; g_B = 0;
sigma = 0.4; rho = (sigma - 1)/sigma;
delta = 0.05; phi = 0.25; gamma = 0.33;
r_target = 0.04; b_start = 0.001;


% --- Foreign Capital Tax (omega) ---
omega_A = 0;
omega_B = 0;
w_vec = [omega_A; omega_B];
max_iters = 50;

% --- RESIDENCE-BASED TAX ON OWN CITIZENS' FOREIGN RETURNS (tau) ---
tau_A = 0;
tau_B = 0;
tau_vec = [tau_A; tau_B];

% A. Calibrate Country B (Follower)
% Find kB such that r_B = r_target
f_r_B = @(k) get_r(k, b_start, rho, gamma, A0_B, 1, delta) - r_target;
k_ss_B = fzero(f_r_B, [0.01, 1000]);
y_B_ss = get_y(k_ss_B, b_start, rho, gamma, A0_B, 1);
y_target_A = y_B_ss * target_y_ratio;

% B. Calibrate Country A (Leader) via Nested Solver
% Find A0_A such that when k_A is in steady state, y_A = y_target_A
find_A0_A = @(a_guess) get_y( ...
    fzero(@(k) get_r(k, b_start, rho, gamma, a_guess, 1, delta) - r_target, [0.01, 2000]), ...
    b_start, rho, gamma, a_guess, 1) - y_target_A;

A0_A = fzero(find_A0_A, [0.1, 10]);

% C. Final Physical Stocks and Base Savings Rates
k_ss_A = fzero(@(k) get_r(k, b_start, rho, gamma, A0_A, 1, delta) - r_target, [0.01, 2000]);

s_base_A = (delta * k_ss_A) / get_y(k_ss_A, b_start, rho, gamma, A0_A, 1);
s_base_B = (delta * k_ss_B) / get_y(k_ss_B, b_start, rho, gamma, A0_B, 1);
s_base_vec = [s_base_A; s_base_B];

% D. Path Generation
A_path_A = A0_A * (1 + g_A).^t;
A_path_B = A0_B * (1 + g_B).^t;

fprintf('--- Calibration Results ---\n');
fprintf('Target Output Ratio: %.2f\n', target_y_ratio);
fprintf('Calibrated A0_A: %.4f (A0_B = 1.0)\n', A0_A);
fprintf('Initial per capita k ratio: = %.2f\n', k_ss_A/k_ss_B);
fprintf('Labour Share: = %.2f\n', (1-gamma)*y_B_ss);


% Scenarios
% 1. HYPE PARAMETERS
hype_realized_max_A = 0.09;
hype_realized_max_B = 0.05;
hype_perc_peak = 0.19;
hype_trough_depth = 0.05;

% 2. TIDAL FLOW PARAMETERS
tidal_max = 0.35;
tidal_lag_B = 6;
tidal_midpoint = 18;
tidal_steepness = 0.32;

% 3. LOGJAM PARAMETERS
logjam_max = 0.50;
logjam_plateau_dur = 6;
logjam_lag_B = 8;
logjam_mid1 = 8;
logjam_mid2 = logjam_mid1 + 8 + logjam_plateau_dur;

% 4. GULF PARAMETERS
gulf_max = 0.65;
gulf_plateau_gap = 10;       
gulf_leakage_B = 0.231;       
gulf_mid1 = 10;
gulf_mid2 = gulf_mid1 + gulf_plateau_gap + 5; 

% --- GENERATION ---

% SCENARIO 1: Hype
beta_A1 = b_start + ((hype_realized_max_A - b_start) ./ (1 + exp(-steepness_gen * (t - 5))));
S_peak = (1 ./ (1 + exp(-2.5 * (t - 3)))) .* (1 ./ (1 + exp(1.8 * (t - 7))));
S_trough = (1 ./ (1 + exp(-1.2 * (t - 10)))) .* (1 ./ (1 + exp(0.6 * (t - 20))));
beta_perc_A1 = max(1e-6, beta_A1 + (hype_perc_peak * S_peak) - (hype_trough_depth * S_trough));
beta_B1 = b_start + ((hype_realized_max_B - b_start) ./ (1 + exp(-steepness_gen * (t - 6))));

% SCENARIO 2: Tidal Flow
beta_A2 = b_start + (tidal_max ./ (1 + exp(-tidal_steepness * (t - tidal_midpoint))));
beta_B2 = [ones(1, tidal_lag_B)*b_start, beta_A2(1:end-tidal_lag_B)];

% SCENARIO 3: Logjam
beta_A3 = b_start + (0.20./(1+exp(-steepness_gen*(t-logjam_mid1))) + ...
          (logjam_max-0.20)./(1+exp(-steepness_gen*(t-logjam_mid2))));
beta_B3 = [ones(1, logjam_lag_B)*b_start, beta_A3(1:end-logjam_lag_B)];

% SCENARIO 4: The Gulf
beta_A4 = b_start + (0.4./(1+exp(-0.8*(t-gulf_mid1))) + ...
          (gulf_max-0.4)./(1+exp(-0.8*(t-gulf_mid2))));
beta_B4 = beta_A4 * gulf_leakage_B;

% --- PLOTTING ---
% figure('Color', 'w', 'Position', [100, 100, 1200, 800]);
% clrs = [0 0.447 0.741; 0.85 0.325 0.098]; % Blue, Red
% titles = {'S1: Hype', 'S2: Tidal Flow', 'S3: Logjam', 'S4: The Gulf'};
% data_A = {beta_A1, beta_A2, beta_A3, beta_A4};
% data_B = {beta_B1, beta_B2, beta_B3, beta_B4};
% data_perc = {beta_perc_A1, beta_A2, beta_A3, beta_A4}; % Perc = Real for non-hype
% 
% for i = 1:4
%     subplot(2,2,i); hold on;
%     plot(t, data_A{i}, 'Color', clrs(1,:), 'LineWidth', 2.5);
%     if i == 1 % Only show dashed perceived line for Scenario 1
%         plot(t, data_perc{i}, '--', 'Color', clrs(1,:));
%     end
%     plot(t, data_B{i}, 'Color', clrs(2,:), 'LineWidth', 1.5);
%     xline(30, 'k:'); 
%     title(titles{i}); grid on; xlim([0 50]);
%     if i == 1, legend('Leader Real', 'Leader Perc', 'Follower'); end
% end

scenarios = {{beta_A1, beta_B1, beta_perc_A1, beta_B1}, ...
             {beta_A2, beta_B2, beta_A2, beta_B2}, ...
             {beta_A3, beta_B3, beta_A3, beta_B3}, ...
             {beta_A4, beta_B4, beta_A4, beta_B4}};
titles = {'Scenario 1: Hype', 'Scenario 2: Tidal Flow', 'Scenario 3: Logjam', 'Scenario 4: The Gulf'};
GNI_parts_all = zeros(4, 2, length(t), 3);
mpl_v = zeros(2, length(t));
regime_all = zeros(4, length(t));
gov_rev_source_all = zeros(4, 2, length(t));
gov_rev_resid_all  = zeros(4, 2, length(t));
gov_rev_total_all  = zeros(4, 2, length(t));



%% --- 5. MAIN SIMULATION LOOP ---
figure('Color', 'w', 'Position', [50 50 1400 2300]);
for j = 1:4
    curr = scenarios{j};
    bA_r = [curr{1}, repmat(curr{1}(end), 1, l+2)];
    bB_r = [curr{2}, repmat(curr{2}(end), 1, l+2)];
    bP_A = [curr{3}, repmat(curr{3}(end), 1, l+2)];
    bP_B = [curr{4}, repmat(curr{4}(end), 1, l+2)];

    % P(row, col): wealth owner row invested in location col
    P = zeros(2,2);
    P(1,1) = k_ss_A * L_A;
    P(2,2) = k_ss_B * L_B;

    V_v = zeros(2, length(t));
    K_v = zeros(2, length(t));
    Y_v = zeros(2, length(t));
    ai_share_output_v = zeros(2, T_sim);
    ai_output_v       = zeros(2, T_sim);
    share_beta_v      = zeros(2, T_sim);
    starve_gap_v = zeros(1, length(t));
    r_real_v = zeros(2, length(t));
    GNI_v = zeros(2, length(t));
    s_rate_v = zeros(2, length(t));
    be_v = zeros(2, length(t)); 
    autarky_v = zeros(1, length(t));
    LS_v = zeros(2, length(t));
    NIIP_v = zeros(2, length(t));
    rentier_idx_v = zeros(2, length(t));
    foreign_inc = zeros(2, length(t));
    offshore_ratio_v = zeros(2, length(t));

    pipe_A = ones(1, length(t)+l) * (delta * P(1,1));
    pipe_B = ones(1, length(t)+l) * (delta * P(2,2));
    s_guess = s_base_vec;

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
            r_real_v(k,i) = get_r(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k), delta);
            mpl_v(k,i) = get_mpl(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k));
        end

        % --- Current-period regime/autarky from current portfolio P ---
        tol_aut = 1e-10;

        pAB = P(1,2);   % A-owned capital located in B  => A exports to B
        pBA = P(2,1);   % B-owned capital located in A  => B exports to A

        is_AB = abs(pAB) > tol_aut;
        is_BA = abs(pBA) > tol_aut;

        if ~is_AB && ~is_BA
            regime_curr = 0;
            autarky_curr = 1;
        elseif is_AB && ~is_BA
            regime_curr = +1;
            autarky_curr = 0;
        elseif ~is_AB && is_BA
            regime_curr = -1;
            autarky_curr = 0;
        else
            % Both off-diagonal positions active: should not happen in the 2-country logic.
            % Treat tiny overlaps as numerical noise; otherwise flag it.
            warning('Current P has both off-diagonal entries active at t=%d: P12=%g, P21=%g', i, pAB, pBA);

            if abs(pAB) >= abs(pBA)
            regime_curr = +1;
                else
                    regime_curr = -1;
            end
            autarky_curr = 0;
        end

        autarky_v(i) = autarky_curr;
        regime_all(j, i) = regime_curr;

        % Shadow market using frontier automation, with exact corner logic
        [K_frontier, ~, ~, ~] = solve_2c_market_exact(V_curr, b_frontier, delta, A_curr, L_vec, gamma, rho, w_vec,tau_vec);

        % Follower starvation gap relative to frontier allocation
        starve_gap_v(i) = (K_frontier(2) - K_current(2)) / (K_frontier(2) + 1e-12);

        % 1. Labor income (output minus local machine payments)
        labor_inc = Y_v(:,i) - (r_real_v(:,i) + delta).*K_current;

        % 2. Explicit capital income from portfolio matrix P
        cap_inc_A = P(1,1) * r_real_v(1,i) + P(1,2) * (r_real_v(2,i) - w_vec(2) - tau_vec(1));
        cap_inc_B = P(2,2) * r_real_v(2,i) + P(2,1) * (r_real_v(1,i) - w_vec(1) - tau_vec(2));
        cap_inc = [cap_inc_A; cap_inc_B];

        % 3. Final GNI assembly
        GNI_v(:,i) = labor_inc + cap_inc;
        gni_den = GNI_v(:,i);
        gni_den(abs(gni_den) < 1e-12) = 1e-12;
        LS_v(:,i) = labor_inc ./ gni_den;
        NIIP_v(:,i) = (V_curr - K_current) ./ gni_den;

        % Rentier index = foreign income / GNI
        
        foreign_inc(1,i) = P(1,2) * (r_real_v(2,i) - w_vec(2) - tau_vec(1));
        foreign_inc(2,i) = P(2,1) * (r_real_v(1,i) - w_vec(1) - tau_vec(2));

        rentier_idx_v(:,i) = foreign_inc(:,i) ./ gni_den;

        % GNI partitioning for area plots (per capita)
        % Country A
        GNI_parts_all(j, 1, i, 1) = labor_inc(1) / L_A;
        GNI_parts_all(j, 1, i, 2) = P(1,1) * r_real_v(1,i) / L_A;
        GNI_parts_all(j, 1, i, 3) = P(1,2) * (r_real_v(2,i) - w_vec(2) - tau_vec(1)) / L_A;


        % Country B
        GNI_parts_all(j, 2, i, 1) = labor_inc(2) / L_B;
        GNI_parts_all(j, 2, i, 2) = P(2,2) * r_real_v(2,i) / L_B;
        GNI_parts_all(j, 2, i, 3) = P(2,1) * (r_real_v(1,i) - w_vec(1) - tau_vec(2)) / L_B;

        if i < length(t)
            % Step B: Rational foresight loop (project l periods ahead)
            idx_f = min(length(t), i + l);
            bt_f = [bP_A(idx_f); bP_B(idx_f)];
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
                [K_target_f, P_target_f, ~, ~] = solve_2c_market_exact(V_proj, bt_f, delta, A_f, L_vec, gamma, rho, w_vec,tau_vec);

                % 3. Physical returns at future locations
                rr_f_A = get_r(K_target_f(1), bt_f(1), rho, gamma, A_f(1), L_vec(1), delta);
                rr_f_B = get_r(K_target_f(2), bt_f(2), rho, gamma, A_f(2), L_vec(2), delta);

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
            [~, P_target, aut_f, regime_f] = solve_2c_market_exact( ...
                V_new, [bP_A(i+1); bP_B(i+1)], delta, [A_path_A(i+1); A_path_B(i+1)], ...
                L_vec, gamma, rho, w_vec,tau_vec);

            

            % Source-based revenue: tax on foreigners investing here
            gov_rev_source_all(j, 1, i) = P(2,1) * w_vec(1);
            gov_rev_source_all(j, 2, i) = P(1,2) * w_vec(2);

            % Residence-based revenue: tax on own citizens investing abroad
            gov_rev_resid_all(j, 1, i) = P(1,2) * tau_vec(1);
            gov_rev_resid_all(j, 2, i) = P(2,1) * tau_vec(2);

            gov_rev_total_all(j, :, i) = gov_rev_source_all(j, :, i) + gov_rev_resid_all(j, :, i);
            P = P_target;

        end
    end

    % Government Revenue as % of GNI
    rev_to_gni_A = squeeze(gov_rev_total_all(j, 1, 1:T_sim)).' ./ GNI_v(1, 1:T_sim) * 100;
    rev_to_gni_B = squeeze(gov_rev_total_all(j, 2, 1:T_sim)).' ./ GNI_v(2, 1:T_sim) * 100;
    %% --- 6. PLOTTING ---
    rows = 11;
t_p = 1:T_sim;
autarky_mask = (regime_all(j, t_p) == 0);

% Precompute series
idx_A = Y_v(1, t_p) ./ Y_v(1, 1) * 100;
idx_B = Y_v(2, t_p) ./ Y_v(2, 1) * 100;

rA = r_real_v(1, t_p) * 100;
rB = r_real_v(2, t_p) * 100;

sA = s_rate_v(1, t_p);
sB = s_rate_v(2, t_p);

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

% Row metadata
row_titles = { ...
    titles{j}, ...
    'Output Index (Y)', ...
    'Realized Returns (%)', ...
    'Savings Rate (s)', ...
    'Wealth Share % (p.c.)', ...
    'Labour Share GNI', ...
    'Starvation Gap (%)', ...
    'GNI Index', ...
    'Rentier Index', ...
    'Gov Revenue (% of GNI)', ...
    'Offshore Capital %'};

row_data = { ...
    {bA_r(t_p), 'b', '-', bB_r(t_p), 'r', '-', bP_A(t_p), 'k', '--'}, ...
    {idx_A, 'b', '-', idx_B, 'r', '-'}, ...
    {rA, 'b', '-', rB, 'r', '--'}, ...
    {sA, 'b', '-', sB, 'r', '--'}, ...
    {wealth_share, 'b', '-'}, ...
    {lsA, 'b', '-', lsB, 'r', '-'}, ...
    {sg, 'r', '-'}, ...
    {gni_idx_A, 'b', '-', gni_idx_B, 'r', '-'}, ...
    {rentA, 'b', '-', rentB, 'r', '-'}, ...
    {rev_to_gni_A, 'b', '-', rev_to_gni_B, 'r', '-'}, ...
    {offA, 'b', '-', offB, 'r', '-'}};

row_ylims = { ...
    [0, max([bA_r(t_p), bP_A(t_p)]) * 1.2], ...
    [min([idx_A, idx_B]), max([idx_A, idx_B]) * 1.1], ...
    [min(r_real_v(:, t_p) * 100, [], 'all') - 1, max(r_real_v(:, t_p) * 100, [], 'all') + 1], ...
    [min(s_rate_v(:, t_p), [], 'all') * 0.9, max(s_rate_v(:, t_p), [], 'all') * 1.1], ...
    [10, 100], ...
    [0.4, 1], ...
    [-5, max(starve_gap_v(t_p) * 100) * 1.2 + 5], ...
    [min([gni_idx_A, gni_idx_B]) * 0.9, max([gni_idx_A, gni_idx_B]) * 1.1], ...
    [min(rentier_idx_v(:, t_p) * 100, [], 'all') - 2, max(rentier_idx_v(:, t_p) * 100, [], 'all') + 2], ...
    [0, 2], ...
    [0, 30]};

for r = 1:rows
    subplot(rows, 4, (r-1)*4 + j);
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

    % add special elements
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
end
toc

% --- POST-SIMULATION: Partitioned GNI Figure ---
figure('Color', 'w', 'Position', [100 100 1100 900]);

for s = 1:4
    for c = 1:2
        idx = (s-1)*2 + c;
        subplot(4, 2, idx);
        hold on;
        
        % Per-capita GNI components: [labor, domestic capital, foreign capital]
        data_levels = squeeze(GNI_parts_all(s, c, 1:T_sim, :));   % T_sim x 3
        
        % Total GNI for this country/scenario/time
        local_total_gni = sum(data_levels, 2);                    % T_sim x 1
        
        % Convert to shares
        data_to_plot = zeros(size(data_levels));
        pos_idx = abs(local_total_gni) > 1e-12;
        data_to_plot(pos_idx, :) = data_levels(pos_idx, :) ./ local_total_gni(pos_idx);
        
        h = area(t(1:T_sim), data_to_plot, 'EdgeColor', 'none');
        
        % Colors: Red (Labor), Blue (Domestic), Green (Foreign)
        h(1).FaceColor = [0.8 0.3 0.3];
        h(2).FaceColor = [0.3 0.3 0.8];
        h(3).FaceColor = [0.3 0.8 0.3];
        
        % Shares, so fix the axis
        ylim([0, 1]);
        
        if s == 1, title(['Country ' char(64+c)]); end
        if c == 1, ylabel(['S' num2str(s)]); end
        if s == 4, xlabel('Years'); end
        
        grid on;
        set(gca, 'Layer', 'top');
        axis tight;
    end
end

lgd = legend(h, {'Labor Income', 'Domestic Cap Inc', 'Foreign Cap Inc'}, ...
    'Orientation', 'horizontal');
set(lgd, 'Position', [0.35, 0.02, 0.3, 0.03]);
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


function mpl = get_mpl(k, bt, rho, gamma, A, L)
    k_eff = max(k, 1e-12);
    X = bt.^(1-rho).*k_eff.^rho + (1-bt).^(1-rho).*L.^rho;
    y = A .* k_eff.^gamma .* (X.^((1-gamma)./rho));
    mpl = (1-gamma) .* (y ./ X) .* (1-bt).^(1-rho) .* L.^(rho-1);
end


function [K_vec, P_star, aut_flags, regime] = solve_2c_market_exact(V_vec, bt, d_val, A, L, gamma, rho, w,tau)
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
    rA_aut = get_r(V_A, bt(1), rho, gamma, A(1), L(1), d_val);
    rB_aut = get_r(V_B, bt(2), rho, gamma, A(2), L(2), d_val);

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
        f = @(x) get_r(V_A - x, bt(1), rho, gamma, A(1), L(1), d_val) - ...
         (get_r(V_B + x, bt(2), rho, gamma, A(2), L(2), d_val) - w(2) - tau(1));

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
        f = @(x) get_r(V_B - x, bt(2), rho, gamma, A(2), L(2), d_val) - ...
         (get_r(V_A + x, bt(1), rho, gamma, A(1), L(1), d_val) - w(1) - tau(2));

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
        fprintf("knife edge")
        f = @(x) get_r(V_A - x, bt(1), rho, gamma, A(1), L(1), d_val) - ...
         (get_r(V_B + x, bt(2), rho, gamma, A(2), L(2), d_val) - w(2) - tau(1));

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
        f = @(x) get_r(V_B - x, bt(2), rho, gamma, A(2), L(2), d_val) - ...
         (get_r(V_A + x, bt(1), rho, gamma, A(1), L(1), d_val) - w(1) - tau(2));

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

