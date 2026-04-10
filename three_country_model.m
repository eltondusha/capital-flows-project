%% Three-Country Task-Based Growth Model (Optimized & Verified)
% Leader (A), Follower (B), and Laggard (C)
tic
clear; clc; close all;

% --- 1. GLOBAL PARAMETERS ---
T = 60; T_sim = 40; dt = 1; t = 0:dt:T;             
l = 3; lag = 6; 
steepness_gen = 0.8; 

% --- 2. STRUCTURAL PARAMETERS ---

% --- CAPITAL CONTROLS (omega) ---
omega_A = 0.008; 
omega_B = 0.005;
omega_C = 0.005; 

w_vec = [omega_A; omega_B ; omega_C];
max_iters = 50; 

% --- TARGET PC OUTPUT RATIOS ---
target_y_A_to_C = 2.0; % Leader is 2x Laggard
target_y_B_to_C = 1.5; % Follower is 1.5x Laggard


L_C = 1.0; 
L_A = 5.0; % Explicitly setting sizes
L_B = 3.0; 
L_vec = [L_A; L_B; L_C];

A0_C = 1.0; % Laggard productivity as numeraire
sigma = 0.4; rho = (sigma - 1)/sigma; 
delta = 0.05; phi = 0.25; gamma = 0.33; 
r_target = 0.04; b_start = 0.001; 

% --- 3. TRIPLE STEADY STATE CALIBRATION ---

% A. Calibrate Country C (Laggard) - The Numeraire
% Solve for k (per capita) where r = r_target
f_r_C = @(k) get_r(k, b_start, rho, gamma, A0_C, 1, delta) - r_target;
k_ss_C = fzero(f_r_C, [0.01, 1000]); 
y_ss_C = get_y(k_ss_C, b_start, rho, gamma, A0_C, 1);

% B. Calibrate Country B (Follower) relative to C
y_target_B = y_ss_C * target_y_B_to_C;
find_A0_B = @(a_guess) get_y(fzero(@(k) get_r(k, b_start, rho, gamma, a_guess, 1, delta) - r_target, [0.01, 2000]), ...
                             b_start, rho, gamma, a_guess, 1) - y_target_B;
A0_B = fzero(find_A0_B, [0.1, 10]);
k_ss_B = fzero(@(k) get_r(k, b_start, rho, gamma, A0_B, 1, delta) - r_target, [0.01, 2000]);

% C. Calibrate Country A (Leader) relative to C
y_target_A = y_ss_C * target_y_A_to_C;
find_A0_A = @(a_guess) get_y(fzero(@(k) get_r(k, b_start, rho, gamma, a_guess, 1, delta) - r_target, [0.01, 2000]), ...
                             b_start, rho, gamma, a_guess, 1) - y_target_A;
A0_A = fzero(find_A0_A, [0.1, 10]);
k_ss_A = fzero(@(k) get_r(k, b_start, rho, gamma, A0_A, 1, delta) - r_target, [0.01, 2000]);

% --- D. SCALE TO TOTAL INITIAL CAPITAL (K = k * L) ---
% These are the actual starting machines for the simulation
K_init_A = k_ss_A * L_A; 
K_init_B = k_ss_B * L_B;
K_init_C = k_ss_C * L_C;

% E. Base Savings Rates (L cancels out, so per-capita values are fine)
s_base_A = (delta * k_ss_A) / get_y(k_ss_A, b_start, rho, gamma, A0_A, 1);
s_base_B = (delta * k_ss_B) / get_y(k_ss_B, b_start, rho, gamma, A0_B, 1);
s_base_C = (delta * k_ss_C) / get_y(k_ss_C, b_start, rho, gamma, A0_C, 1);
s_base_vec = [s_base_A; s_base_B; s_base_C];

% F. Print Verification
fprintf('--- Three-Country Per-Capita Calibration Results ---\n');
fprintf('Target Output Ratios (vs C): A/C = %.2f, B/C = %.2f\n', target_y_A_to_C, target_y_B_to_C);
fprintf('Calibrated TFP (A0): A = %.4f, B = %.4f, (C = 1.0)\n', A0_A, A0_B);
fprintf('Steady State k (p.c.): A = %.2f, B = %.2f, C = %.2f\n', k_ss_A, k_ss_B, k_ss_C);
fprintf('Total Initial K: A = %.2f, B = %.2f, C = %.2f\n', K_init_A, K_init_B, K_init_C);

% E. Path Generation
A_path_A = A0_A * (1 + 0).^t; 
A_path_B = A0_B * (1 + 0).^t; 
A_path_C = A0_C * (1 + 0).^t;


% --- 4. SCENARIOS ---
% --- 1. HYPE PARAMETERS (Scenario 1) ---
% Note: Hype is peak-driven, not necessarily saturation-driven at T=30
hype_realized_max = 0.05;    
hype_perc_peak = 0.40;       
hype_trough_depth = 0.05;    

% --- 2. TIDAL WAVE PARAMETERS (Scenario 2) ---
tidal_max = 0.50;
tidal_lag_B = 10;
tidal_lag_C = 2*tidal_lag_B;
% Centering at 15 with steepness 0.4 ensures saturation by T=30
tidal_midpoint = 15; 
tidal_steepness = 0.45;       

% --- 3. LOGJAM PARAMETERS (Scenario 3) ---
logjam_max = 0.50;
logjam_plateau_dur = 8;     
logjam_lag_B = 8;
% The second wave must finish by T=30
logjam_mid1 = 8; 
logjam_mid2 = logjam_mid1 + 8 + logjam_plateau_dur; % Ends around T=30

% --- 4. GULF PARAMETERS (Scenario 4) ---
gulf_max = 0.90;
gulf_plateau_gap = 10;       
gulf_leakage_B = 0.10;       
gulf_leakage_C = 0.02;       
% Wave 2 centered at T=25 to hit max by T=30
gulf_mid1 = 10;
gulf_mid2 = gulf_mid1 + gulf_plateau_gap + 5; 

% --- GENERATION ---

% SCENARIO 1: Hype
beta_A1 = b_start + ((hype_realized_max - b_start) ./ (1 + exp(-steepness_gen * (t - 5))));
S_peak = (1 ./ (1 + exp(-2.5 * (t - 3)))) .* (1 ./ (1 + exp(1.8 * (t - 7))));
S_trough = (1 ./ (1 + exp(-1.2 * (t - 10)))) .* (1 ./ (1 + exp(0.6 * (t - 20))));
beta_perc_A1 = max(1e-6, beta_A1 + (hype_perc_peak * S_peak) - (hype_trough_depth * S_trough));
beta_B1 = beta_A1; beta_C1 = ones(size(t))*b_start;

% SCENARIO 2: Tidal Flow
beta_A2 = b_start + (tidal_max ./ (1 + exp(-tidal_steepness * (t - tidal_midpoint)))); 
beta_B2 = [ones(1, tidal_lag_B)*b_start, beta_A2(1:end-tidal_lag_B)];
beta_C2 = [ones(1, tidal_lag_C)*b_start, beta_A2(1:end-tidal_lag_C)];

% SCENARIO 3: Logjam
beta_A3 = b_start + (0.20./(1+exp(-steepness_gen*(t-logjam_mid1))) + ...
          (logjam_max-0.20)./(1+exp(-steepness_gen*(t-logjam_mid2))));
beta_B3 = [ones(1, logjam_lag_B)*b_start, beta_A3(1:end-logjam_lag_B)];
beta_C3 = [ones(1, logjam_lag_B*2)*b_start, beta_A3(1:end-logjam_lag_B*2)];

% SCENARIO 4: The Gulf
beta_A4 = b_start + (0.4./(1+exp(-0.8*(t-gulf_mid1))) + ...
          (gulf_max-0.4)./(1+exp(-0.8*(t-gulf_mid2))));
beta_B4 = beta_A4 * gulf_leakage_B;
beta_C4 = beta_A4 * gulf_leakage_C;

% --- PLOTTING ---
% figure('Color', 'w', 'Position', [100, 100, 1200, 800]);
% clrs = [0 0.447 0.741; 0.85 0.325 0.098; 0.466 0.674 0.188]; % Blue, Red, Green
% 
% titles = {'S1: Hype', 'S2: Tidal Flow', 'S3: Logjam', 'S4: The Gulf'};
% data_A = {beta_A1, beta_A2, beta_A3, beta_A4};
% data_perc = {beta_perc_A1, [], [], []};
% data_others = {{beta_B1, beta_C1}, {beta_B2, beta_C2}, {beta_B3, beta_C3}, {beta_B4, beta_C4}};
% 
% for i = 1:4
%     subplot(2,2,i); hold on;
%     plot(t, data_A{i}, 'Color', clrs(1,:), 'LineWidth', 2.5);
%     if ~isempty(data_perc{i})
%         plot(t, data_perc{i}, '--', 'Color', clrs(1,:));
%     end
%     plot(t, data_others{i}{1}, 'Color', clrs(2,:), 'LineWidth', 1.5);
%     plot(t, data_others{i}{2}, 'Color', clrs(3,:), 'LineWidth', 1.5);
%     xline(30, 'k:'); 
%     title(titles{i}); grid on; xlim([0 50]);
%     if i == 1, legend('Leader Real', 'Leader Perc', 'Follower', 'Laggard'); end
% end

scenarios = {{beta_A1, beta_B1, beta_C1, beta_perc_A1, beta_B1, beta_C1}, ...
             {beta_A2, beta_B2, beta_C2, beta_A2, beta_B2, beta_C2}, ...
             {beta_A3, beta_B3, beta_C3, beta_A3, beta_B3, beta_C3}, ...
             {beta_A4, beta_B4, beta_C4, beta_A4, beta_B4, beta_C4}};
titles = {'Scenario 1: Hype', 'Scenario 2: Tidal Flow', 'Scenario 3: Logjam', 'Scenario 4: The Gulf'};

%%
% --- 5. MAIN SIMULATION LOOP ---
GNI_parts_all = zeros(4, 3, length(t), 3); 
figure('Color', 'w', 'Position', [50 50 1400 2300]);

for j = 1:4
    curr = scenarios{j};
    bA_ext = [curr{1}, repmat(curr{1}(end), 1, l+2)];
    bB_ext = [curr{2}, repmat(curr{2}(end), 1, l+2)];
    bC_ext = [curr{3}, repmat(curr{3}(end), 1, l+2)];
    
    bP_A_ext = [curr{4}, repmat(curr{4}(end), 1, l+2)];
    bP_B_ext = [curr{5}, repmat(curr{5}(end), 1, l+2)];
    bP_C_ext = [curr{6}, repmat(curr{6}(end), 1, l+2)];

    % Stack them into the final matrices
    b_r_paths = [bA_ext; bB_ext; bC_ext]; 
    b_p_paths = [bP_A_ext; bP_B_ext; bP_C_ext];
    
    A_path = [A_path_A; A_path_B; A_path_C];
    
    P = zeros(3,3); 
    P(1,1) = K_init_A; 
    P(2,2) = K_init_B; 
    P(3,3) = K_init_C;
    
    V_v = zeros(3, length(t)); K_v = zeros(3, length(t)); Y_v = zeros(3, length(t));
    r_real_v = zeros(3, length(t)); GNI_v = zeros(3, length(t)); 
    s_rate_v = zeros(3, length(t)); be_v = zeros(3, length(t));
    LS_v = zeros(3, length(t)); rentier_idx_v = zeros(3, length(t));
    starve_gap_B = zeros(1, length(t));
    starve_gap_C = zeros(1, length(t));
    gov_rev_all = zeros(4, 3, length(t));

    
    pipe = ones(3, length(t)+l) .* (delta * diag(P));

    for i = 1:length(t)
        % Step A: Global Accounting
        V_curr = sum(P, 2); V_v(:, i) = V_curr;
        K_current = sum(P, 1)'; K_v(:, i) = K_current;
        b_r = b_r_paths(:, i);
        A_curr = A_path(:, i);
        % --- STARVATION GAP CALCULATION (3-Country Asymmetric Cost) ---
        % Counterfactual: What if everyone had the Leader's beta?
        max_beta = max(b_r); 
        b_frontier = [max_beta; max_beta; max_beta];        
        
        % Solve the "Shadow Market" using current total global wealth
        [K_frontier, ~] = solve_3c_market(V_curr, b_frontier, delta, A_curr, L_vec, gamma, rho, w_vec);
        
        % Measure the % of capital lost due to the technology gap
        % Starvation Gap for Country B (Follower)
        starve_gap_B(i) = (K_frontier(2) - K_current(2)) / (K_frontier(2) + 1e-12);
        
        % Starvation Gap for Country C (Laggard)
        starve_gap_C(i) = (K_frontier(3) - K_current(3)) / (K_frontier(3) + 1e-12);
        for k=1:3
            Y_v(k,i) = get_y(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k));
            r_real_v(k,i) = get_r(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k), delta);
            
            lab_inc_tot = Y_v(k,i) - (r_real_v(k,i) + delta)*K_current(k);
            GNI_parts_all(j, k, i, 1) = lab_inc_tot / L_vec(k);
            GNI_parts_all(j, k, i, 2) = (P(k,k) * r_real_v(k,i)) / L_vec(k);
            
            others = setdiff(1:3, k);
            f_inc = 0;
            for m = others, f_inc = f_inc + P(k,m) * (r_real_v(m,i) - w_vec(m)); end
            GNI_parts_all(j, k, i, 3) = f_inc / L_vec(k);
            
            GNI_v(k,i) = sum(squeeze(GNI_parts_all(j, k, i, :))) * L_vec(k);
            LS_v(k,i) = lab_inc_tot / GNI_v(k,i);
            
            % Rentier Index logic
            cap_inc_pc = GNI_parts_all(j, k, i, 2) + GNI_parts_all(j, k, i, 3);
            local_rent_pc = (K_current(k) * r_real_v(k,i)) / L_vec(k);
            rentier_idx_v(k,i) = (cap_inc_pc - local_rent_pc) / (GNI_v(k,i)/L_vec(k) + 1e-12);
        end

        if i < length(t)
            % Step B: Rational Foresight
            bt_f = b_p_paths(:, i+l);
            A_f = A_path(:, min(T, i+l));
            V_fixed = V_curr .* (1-delta)^l;
            for k=1:3, V_fixed(k) = V_fixed(k) + pipe(k, i+1:i+l-1) * (1-delta).^(l-1:-1:1)'; end
            
            s_guess = s_base_vec;
            for iter = 1:max_iters
                V_proj = V_fixed + (s_guess .* GNI_v(:,i));
                [K_target_f, ~] = solve_3c_market(V_proj, bt_f, delta, A_f, L_vec, gamma, rho, w_vec);
                rr_f = zeros(3,1);
                for k=1:3, rr_f(k) = get_r(K_target_f(k), bt_f(k), rho, gamma, A_f(k), L_vec(k), delta); end
                
                r_yield = zeros(3,1); sh_f = K_target_f / sum(V_proj);
                for k=1:3
                    others = setdiff(1:3, k);
                    r_yield(k) = sh_f(k)*rr_f(k);
                    for m = others, r_yield(k) = r_yield(k) + sh_f(m)*(rr_f(m) - w_vec(m)); end
                end
                s_new = max(0, s_base_vec + phi * (r_yield - r_target));
                if max(abs(s_new - s_guess)) < 1e-6, break; end
                s_guess = s_new;
            end
            s_rate_v(:, i) = s_guess;
            pipe(:, i+l) = s_guess .* GNI_v(:,i);
            
            % Step D: Evolution
            P = P .* (1 - delta);
            for k=1:3, P(k,k) = P(k,k) + pipe(k, i+1); end
            V_new = sum(P,2);
            [K_t, ~] = solve_3c_market(V_new, b_p_paths(:, i+1), delta, A_path(:, i+1), L_vec, gamma, rho, w_vec);
            
            for row = 1:3
                for col = 1:3, P(row, col) = V_new(row) * (K_t(col) / sum(V_new)); end
            end
        end
        % --- 3-COUNTRY GOVERNMENT REVENUE ---
            % Country A (Leader) taxes B and C's capital in its borders
            gov_rev_all(j, 1, i) = (P(2,1) + P(3,1)) * w_vec(1);
            
            % Country B (Follower) taxes A and C's capital in its borders
            gov_rev_all(j, 2, i) = (P(1,2) + P(3,2)) * w_vec(2);
            
            % Country C (Laggard) taxes A and B's capital in its borders
            gov_rev_all(j, 3, i) = (P(1,3) + P(2,3)) * w_vec(3);
    end
    % Calculate per-capita wealth for all three
    v_pc_A = V_v(1,:) / L_A;
    v_pc_B = V_v(2,:) / L_B;
    v_pc_C = V_v(3,:) / L_C;
    v_pc_total = v_pc_A + v_pc_B + v_pc_C + 1e-12; % Guard against div-by-zero
    rev_idx_A = squeeze(gov_rev_all(j, 1, 1:T_sim)) ./ (gov_rev_all(j, 1, 1) + 1e-12) * 100;
    rev_idx_B = squeeze(gov_rev_all(j, 2, 1:T_sim)) ./ (gov_rev_all(j, 2, 1) + 1e-12) * 100;
    rev_idx_C = squeeze(gov_rev_all(j, 3, 1:T_sim)) ./ (gov_rev_all(j, 3, 1) + 1e-12) * 100;
    % --- 6. DASHBOARD PLOTTING ---
    rows = 10;

% Row 1: Automation Paths (A, B, C)
subplot(rows,4,j); 
plot(t(1:T_sim), b_r_paths(1,1:T_sim), 'b', t(1:T_sim), b_r_paths(2,1:T_sim), 'r', ...
     t(1:T_sim), b_r_paths(3,1:T_sim), 'k--', t(1:T_sim), b_p_paths(1,1:T_sim), 'b--'); 
title(titles{j}); grid on;

% Row 2: Output Index
subplot(rows,4,4+j); 
plot(t(1:T_sim), Y_v(1,1:T_sim)./Y_v(1,1)*100, 'b', t(1:T_sim), Y_v(2,1:T_sim)./Y_v(2,1)*100, 'r', ...
     t(1:T_sim), Y_v(3,1:T_sim)./Y_v(3,1)*100, 'k--'); 
title('Output Index (Y)'); grid on;

% Row 3: Realized Returns (%)
subplot(rows,4,8+j); 
plot(t(1:T_sim), r_real_v(1,1:T_sim)*100, 'b', t(1:T_sim), r_real_v(2,1:T_sim)*100, 'r--', ...
     t(1:T_sim), r_real_v(3,1:T_sim)*100, 'k--'); 
title('Realized Returns (%)'); grid on;

% Row 4: Savings Rate (s)
subplot(rows,4,12+j); 
plot(t(1:T_sim), s_rate_v(1,1:T_sim), 'b', t(1:T_sim), s_rate_v(2,1:T_sim), 'r--', ...
     t(1:T_sim), s_rate_v(3,1:T_sim), 'k--'); 
title('Savings Rate (s)'); grid on;

% Row 5: Wealth Share % per capita
subplot(rows,4,16+j);
plot(t(1:T_sim), (v_pc_A(1:T_sim) ./ v_pc_total(1:T_sim)) * 100, 'b', ...
     t(1:T_sim), (v_pc_B(1:T_sim) ./ v_pc_total(1:T_sim)) * 100, 'r--', ...
     t(1:T_sim), (v_pc_C(1:T_sim) ./ v_pc_total(1:T_sim)) * 100, 'k--'); 
title('Wealth Share % (p.c.)'); ylabel('% of Total'); grid on;

% Row 6: Labour Share GNI
subplot(rows,4,20+j); 
plot(t(1:T_sim), LS_v(1,1:T_sim), 'b', t(1:T_sim), LS_v(2,1:T_sim), 'r', ...
     t(1:T_sim), LS_v(3,1:T_sim), 'k--'); 
title('Labour Share GNI'); grid on;

% Row 7: Starvation Gap (%)
subplot(rows,4,24+j); hold on;
plot(t(1:T_sim), starve_gap_B(1:T_sim)*100, 'r', 'LineWidth', 1.5); 
plot(t(1:T_sim), starve_gap_C(1:T_sim)*100, 'k--', 'LineWidth', 1.2); 
yline(0, 'k:'); title('Starvation Gap (%)'); grid on;

% Row 8: GNI Index (Starting at 28)
subplot(rows,4,28+j); 
plot(t(1:T_sim), real(GNI_v(1,1:T_sim)./GNI_v(1,1)*100), 'b', ...
     t(1:T_sim), real(GNI_v(2,1:T_sim)./GNI_v(2,1)*100), 'r', ...
     t(1:T_sim), real(GNI_v(3,1:T_sim)./GNI_v(3,1)*100), 'k--'); 
title('GNI Index'); grid on;

% Row 9: Rentier Index (Starting at 32)
subplot(rows,4,32+j); 
plot(t(1:T_sim), rentier_idx_v(1,1:T_sim)*100, 'b', ...
     t(1:T_sim), rentier_idx_v(2,1:T_sim)*100, 'r', ...
     t(1:T_sim), rentier_idx_v(3,1:T_sim)*100, 'k--');
yline(0, 'k:'); title('Rentier Index (%)'); grid on;

% Row 10: Gov Revenue Index (Starting at 36)
subplot(rows,4,36+j); hold on;
plot(t(1:T_sim), rev_idx_A, 'b', 'LineWidth', 1.5);
plot(t(1:T_sim), rev_idx_B, 'r', 'LineWidth', 1.5);
plot(t(1:T_sim), rev_idx_C, 'k--', 'LineWidth', 1.2);
yline(100, 'k:'); title('Gov Revenue Index'); grid on;
end
toc

% --- 7. PARTITIONED GNI FIGURE ---
% figure('Color', 'w', 'Position', [100 100 1100 900]);
% for s = 1:4
%     for c = 1:3
%         subplot(4, 3, (s-1)*3 + c); hold on;
%         data = squeeze(GNI_parts_all(s, c, 1:T_sim, :));
%         h = area(t(1:T_sim), data, 'EdgeColor', 'none');
%         h(1).FaceColor = [0.8 0.3 0.3]; h(2).FaceColor = [0.3 0.3 0.8]; h(3).FaceColor = [0.3 0.8 0.3];
%         local_max = max(sum(data, 2)); ylim([0, local_max * 1.1]);
%         if s == 1, title(['Country ' char(64+c)]); end
%         if c == 1, ylabel(['S' num2str(s)]); end
%         grid on; set(gca, 'Layer', 'top'); axis tight;
%     end
% end
% lgd = legend(h, {'Labor', 'Dom Cap', 'Foreign Cap'}, 'Location', 'southoutside', 'Orientation', 'horizontal');

%% --- HELPERS ---
function y = get_y(k, bt, rho, gamma, A, L)
    task_agg = max(1e-12, bt.^(1-rho).*k.^rho + (1-bt).^(1-rho).*L.^rho);
    y = A .* k.^gamma .* (task_agg.^((1-gamma)./rho));
end
function r = get_r(k, bt, rho, gamma, A, L, d_val)
    task_agg = max(1e-12, bt.^(1-rho).*k.^rho + (1-bt).^(1-rho).*L.^rho);
    share = (bt.^(1-rho).*k.^rho) ./ task_agg;
    y_over_k = get_y(k, bt, rho, gamma, A, L) ./ k;
    r = (gamma + (1-gamma) .* share) .* y_over_k - d_val;
end
function [K_vec, aut_flags] = solve_3c_market(V_vec, bt, d, A, L, gamma, rho, w)
    V_tot = sum(V_vec);
    obj = @(r) sum(get_d(r, bt, d, A, L, gamma, rho, w, V_vec)) - V_tot;
    r_star = fzero(obj, [-0.049, 10.0]); 
    [K_vec, aut_flags] = get_d(r_star, bt, d, A, L, gamma, rho, w, V_vec);
end
function [Ki, aut] = get_d(r_ref, bt, d, A, L, gamma, rho, w, V)
    Ki = zeros(3,1); aut = zeros(3,1);
    for i = 1:3
        r_at_V = get_r(V(i), bt(i), rho, gamma, A(i), L(i), d);
        if r_at_V > r_ref + w(i)
            Ki(i) = solve_safe_k(r_ref + w(i), bt(i), d, A(i), L(i), gamma, rho);
        elseif r_at_V < r_ref
            Ki(i) = solve_safe_k(r_ref, bt(i), d, A(i), L(i), gamma, rho);
        else
            Ki(i) = V(i); aut(i) = 1;
        end
    end
end
function k_res = solve_safe_k(target_r, bt, d, A, L, gamma, rho)
    f = @(k) get_r(k, bt, rho, gamma, A, L, d) - target_r;
    k_min = 1e-12; k_max = 1e12;
    if f(k_min)*f(k_max) > 0
        if f(k_min) < 0, k_res = k_min; else, k_res = k_max; end
    else
        k_res = fzero(f, [k_min, k_max]);
    end
end