%% Two-Country Task-Based Growth Model
% Leader (A) and Follower (B)
tic
clear; clc; close all;


% --- 1. GLOBAL PARAMETERS ---
T = 60; T_sim = 40; dt = 1; t = 0:dt:T;             
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


% --- CAPITAL CONTROLS (omega) ---
omega_A = 0; 
omega_B = 0; 
w_vec = [omega_A; omega_B];
max_iters = 50; 


% A. Calibrate Country B (Follower)
% Find kB such that r_B = r_target
f_r_B = @(k) get_r(k, b_start, rho, gamma, A0_B, 1, delta) - r_target;
k_ss_B = fzero(f_r_B, [0.01, 1000]); 
y_B_ss = get_y(k_ss_B, b_start, rho, gamma, A0_B, 1);
y_target_A = y_B_ss * target_y_ratio;

% B. Calibrate Country A (Leader) via Nested Solver
% We need to find A0_A such that when k_A is in steady state, y_A = y_target_A
find_A0_A = @(a_guess) get_y(fzero(@(k) get_r(k, b_start, rho, gamma, a_guess, 1, delta) - r_target, [0.01, 2000]), ...
                             b_start, rho, gamma, a_guess, 1) - y_target_A;

% Solve for the A0_A that satisfies the output target
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
hype_realized_max = 0.1;    
hype_perc_peak = 0.40;       
hype_trough_depth = 0.05;    

% 2. TIDAL WAVE PARAMETERS
tidal_max = 0.50;
tidal_lag_B = 10;
tidal_midpoint = 15; 
tidal_steepness = 0.45;       

% 3. LOGJAM PARAMETERS
logjam_max = 0.50;
logjam_plateau_dur = 8;     
logjam_lag_B = 8;
logjam_mid1 = 8; 
logjam_mid2 = logjam_mid1 + 8 + logjam_plateau_dur;

% 4. GULF PARAMETERS
gulf_max = 0.90;
gulf_plateau_gap = 10;       
gulf_leakage_B = 0.10;       
gulf_mid1 = 10;
gulf_mid2 = gulf_mid1 + gulf_plateau_gap + 5; 

% --- GENERATION ---

% SCENARIO 1: Hype
beta_A1 = b_start + ((hype_realized_max - b_start) ./ (1 + exp(-steepness_gen * (t - 5))));
S_peak = (1 ./ (1 + exp(-2.5 * (t - 3)))) .* (1 ./ (1 + exp(1.8 * (t - 7))));
S_trough = (1 ./ (1 + exp(-1.2 * (t - 10)))) .* (1 ./ (1 + exp(0.6 * (t - 20))));
beta_perc_A1 = max(1e-6, beta_A1 + (hype_perc_peak * S_peak) - (hype_trough_depth * S_trough));
beta_B1 = beta_A1; 

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
%%
% --- 5. MAIN SIMULATION LOOP ---
figure('Color', 'w', 'Position', [50 50 1400 2300]); 
for j = 1:4
    curr = scenarios{j};
    bA_r = [curr{1}, repmat(curr{1}(end), 1, l+2)]; 
    bB_r = [curr{2}, repmat(curr{2}(end), 1, l+2)]; 
    bP_A = [curr{3}, repmat(curr{3}(end), 1, l+2)];
    bP_B = [curr{4}, repmat(curr{4}(end), 1, l+2)];
    
    P = zeros(2,2);
    P(1,1) = k_ss_A * L_A; 
    P(2,2) = k_ss_B * L_B;
    gov_rev_all = zeros(4, 2, length(t));    
    V_v = zeros(2, length(t)); 
    K_v = zeros(2, length(t)); 
    Y_v = zeros(2, length(t)); 
    starve_gap_v = zeros(1, length(t));
    r_real_v = zeros(2, length(t)); GNI_v = zeros(2, length(t)); 
    s_rate_v = zeros(2, length(t)); be_v = zeros(2, length(t));
    autarky_v = zeros(2, length(t)); LS_v = zeros(2, length(t)); NIIP_v = zeros(2, length(t));
    rentier_idx_v = zeros(2, length(t));
    offshore_ratio_v = zeros(2, length(t));
    
    pipe_A = ones(1, length(t)+l) * (delta * P(1,1));
    pipe_B = ones(1, length(t)+l) * (delta * P(2,2));
    s_guess = s_base_vec;
    

    for i = 1:length(t)
        % Step A: Global Accounting (Current Physical Reality)
        K_current = sum(P, 1)'; 
        K_v(:, i) = K_current;
        V_curr = sum(P, 2);
        V_v(:, i) = V_curr;
        b_r = [bA_r(i); bB_r(i)];
        max_beta = max(b_r); 
        b_frontier = [max_beta; max_beta];
        A_curr = [A_path_A(i); A_path_B(i)];
        offshore_ratio_v(:,i) = [P(1,2)/V_curr(1); P(2,1)/V_curr(2)];

        
        for k=1:2
            Y_v(k,i) = get_y(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k));
            r_real_v(k,i) = get_r(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k), delta);
            mpl_v(k,i) = get_mpl(K_current(k), b_r(k), rho, gamma, A_curr(k), L_vec(k));
        end
                
        % Solve a "Shadow Market" using current global wealth (sum(V_curr))
        [K_frontier, ~] = solve_2c_market_fast(V_curr, b_frontier, delta, A_curr, L_vec, gamma, rho, w_vec);
        
        % Measure the Gap for the Follower (k=2)
        % This is the % of capital "starved" out of Country B because they lagged in beta
        starve_gap_v(i) = (K_frontier(2) - K_current(2)) / (K_frontier(2) + 1e-12);
        
        % --- 1. Labor Income (Output minus the cost of all local machines) ---
        % r_real_v is (MPK - delta). We subtract (r + delta)*K to remove capital's share.
        labor_inc = Y_v(:,i) - (r_real_v(:,i) + delta).*K_current;


        % --- 2. Explicit Capital Income from P-Matrix ---
        % Country A (Leader) Capital Income:
        % [Wealth in A * rA] + [Wealth in B * (rB - omegaB)]
        cap_inc_A = P(1,1) * r_real_v(1,i) + P(1,2) * (r_real_v(2,i) - w_vec(2));
        

        % Country B (Follower) Capital Income:
        % [Wealth in B * rB] + [Wealth in A * (rA - omegaA)]
        cap_inc_B = P(2,2) * r_real_v(2,i) + P(2,1) * (r_real_v(1,i) - w_vec(1));

        cap_inc = [cap_inc_A ; cap_inc_B];
        % --- 3. Final GNI Assembly ---
        GNI_v(:,i) = labor_inc + cap_inc;        
        LS_v(:,i) = labor_inc ./ GNI_v(:,i);
        NIIP_v(:,i) = (V_curr - K_current) ./ (GNI_v(:,i));
        
        % --- Rentier Index (Net Foreign Income / GNI) ---
        % cap_inc is what we pocket globally; (r_real_v .* K_current) is what the local machines earn.
        net_foreign_inc = cap_inc - (r_real_v(:,i) .* K_current);
        rentier_idx_v(:,i) = net_foreign_inc ./ (GNI_v(:,i));
        
        % --- GNI Partitioning for Area Plots ---
        % Country A (Leader)
        GNI_parts_all(j, 1, i, 1) = labor_inc(1)/L_A;                             % Labor Income A
        GNI_parts_all(j, 1, i, 2) = P(1,1) * r_real_v(1,i)/L_A;                   % Domestic Cap Inc A
        GNI_parts_all(j, 1, i, 3) = P(1,2) * (r_real_v(2,i) - w_vec(2))/L_A;       % Foreign Cap Inc A (from B)

        % Country B (Follower)
        GNI_parts_all(j, 2, i, 1) = labor_inc(2)/L_B;                             % Labor Income B
        GNI_parts_all(j, 2, i, 2) = P(2,2) * r_real_v(2,i)/L_B;                   % Domestic Cap Inc B
        GNI_parts_all(j, 2, i, 3) = P(2,1) * (r_real_v(1,i) - w_vec(1))/L_B;       % Foreign Cap Inc B (from A)

        if i < length(t)
            % Step B: Rational Foresight Loop (Projecting l periods ahead)
            idx_f = min(length(t), i + l);
            bt_f = [bP_A(idx_f); bP_B(idx_f)]; 
            A_f = [A_path_A(idx_f); A_path_B(idx_f)];
            
            % Compute the "Wealth Floor" in l periods (Surviving + Already Pipeline)
            V_fixed = [sum(P(1,:))*(1-delta)^l + pipe_A(i+1:i+l-1)*(1-delta).^(l-1:-1:1)';
                       sum(P(2,:))*(1-delta)^l + pipe_B(i+1:i+l-1)*(1-delta).^(l-1:-1:1)'];
            
            % Force s_guess to reset as a 2x1 COLUMN vector for this year
            s_guess = [s_base_vec(1); s_base_vec(2)]; 
            
            for iter = 1:max_iters
                % 1. Project total wealth in period t+l based on today's GNI and savings guess
                V_proj = V_fixed + (s_guess .* GNI_v(:,i)); %
                V_total_world = sum(V_proj); %
                
                % 2. Solve the future market split (where machines will physically sit)
                [K_target_f, ~] = solve_2c_market_fast(V_proj, bt_f, delta, A_f, L_vec, gamma, rho, w_vec); %   
                
                % 3. Calculate Physical Returns (rr_f) for both future locations
                rr_f_A = get_r(K_target_f(1), bt_f(1), rho, gamma, A_f(1), L_vec(1), delta); %
                rr_f_B = get_r(K_target_f(2), bt_f(2), rho, gamma, A_f(2), L_vec(2), delta); %
                
                % 4. Portfolio Shares
                % These represent the probability that a dollar of wealth is in A vs B
                share_in_A = K_target_f(1) / V_total_world; %
                share_in_B = K_target_f(2) / V_total_world; %
                
                % 5. Weighted Yield for Country A (The Leader)
                % A gets full return at home, but pays omega_B to invest in B
                r_yield_A = share_in_A * rr_f_A + share_in_B * (rr_f_B - w_vec(2)); %
                
                % 6. Weighted Yield for Country B (The Follower)
                % B gets full return at home, but pays omega_A to invest in A
                r_yield_B = share_in_B * rr_f_B + share_in_A * (rr_f_A - w_vec(1)); %
                
                r_yield = [r_yield_A; r_yield_B]; %
    
                % 7. Update decoupled savings rates independently
                s_new = [s_base_vec(1) + phi * (r_yield(1) - r_target);
                         s_base_vec(2) + phi * (r_yield(2) - r_target)]; %
                         
                if max(abs(s_new - s_guess)) < 1e-6 
                    break; 
                end
                s_guess = s_new; %
            end
            
            % Explicitly store today's decision to be realized in l periods
            s_rate_v(:, i) = s_guess; %
            pipe_A(i+l) = s_guess(1) * GNI_v(1,i); %
            pipe_B(i+l) = s_guess(2) * GNI_v(2,i); %
            
            % Step D: Portfolio Evolution
            P = P .* (1 - delta);
            P(1,1) = P(1,1) + pipe_A(i+1); 
            P(2,2) = P(2,2) + pipe_B(i+1);
            V_new = sum(P, 2);
            
            [K_target, aut_f] = solve_2c_market_fast(V_new, [bP_A(i+1); bP_B(i+1)], delta, [A_path_A(i+1); A_path_B(i+1)], L_vec, gamma, rho, w_vec);
            autarky_v(:, i+1) = aut_f; 
            
            V_tot_new = sum(V_new);
            for row = 1:2
                for col = 1:2
                    if V_tot_new > 1e-9
                        P(row, col) = V_new(row) * (K_target(col) / V_tot_new);
                    end
                end
            end
            % --- TRACK GOVERNMENT REVENUE BY SCENARIO ---
            % Country A collects taxes on Country B's wealth sitting in A
            gov_rev_all(j, 1, i) = P(2,1) * w_vec(1); 
            
            % Country B collects taxes on Country A's wealth sitting in B
            gov_rev_all(j, 2, i) = P(1,2) * w_vec(2);
            rev_idx_A = squeeze(gov_rev_all(j, 1, 1:T_sim)) ./ (gov_rev_all(j, 1, 1)) * 100;
            rev_idx_B = squeeze(gov_rev_all(j, 2, 1:T_sim)) ./ (gov_rev_all(j, 2, 1)) * 100;

        end
    end
    
    % --- 6. PLOTTING ---
    rows = 11;

% Row 1: Automation Path
subplot(rows,4,j); 
plot(t(1:T_sim), bA_r(1:T_sim), 'b', t(1:T_sim), bB_r(1:T_sim), 'r'); title(titles{j}); grid on;

% Row 2: Output Index
subplot(rows,4,4+j); 
plot(t(1:T_sim), Y_v(1,1:T_sim)./Y_v(1,1)*100, 'b', t(1:T_sim), Y_v(2,1:T_sim)./Y_v(2,1)*100, 'r'); title('Output Index (Y)'); grid on;

% Row 3: Realized Returns
subplot(rows,4,8+j); 
plot(t(1:T_sim), r_real_v(1,1:T_sim)*100, 'b', t(1:T_sim), r_real_v(2,1:T_sim)*100, 'r--'); title('Realized Returns (%)'); grid on;

% Row 4: Savings Rate
subplot(rows,4,12+j); 
plot(t(1:T_sim), s_rate_v(1,1:T_sim), 'b', t(1:T_sim), s_rate_v(2,1:T_sim), 'r--'); title('Savings Rate (s)'); grid on;

% Row 5: Wealth Share
subplot(rows,4,16+j); 
plot(t(1:T_sim), (V_v(1,1:T_sim)/L_A)./(V_v(1,1:T_sim)/L_A + V_v(2,1:T_sim)/L_B)*100, 'b'); title('Wealth Share % (p.c.)'); grid on;

% Row 6: Labour Share
subplot(rows,4,20+j); 
plot(t(1:T_sim), LS_v(1,1:T_sim), 'b', t(1:T_sim), LS_v(2,1:T_sim), 'r'); title('Labour Share GNI'); grid on;

% Row 7: Starvation Gap
subplot(rows,4,24+j); 
plot(t(1:T_sim), starve_gap_v(1:T_sim)*100, 'r'); yline(0, 'k:'); title('Starvation Gap (%)'); grid on;

% Row 8: GNI Index (Corrected Index)
subplot(rows,4,28+j); 
plot(t(1:T_sim), real(GNI_v(1,1:T_sim)./GNI_v(1,1)*100), 'b', t(1:T_sim), real(GNI_v(2,1:T_sim)./GNI_v(2,1)*100), 'r'); title('GNI Index'); grid on;

% Row 9: Rentier Index (Corrected Index)
subplot(rows,4,32+j); 
plot(t(1:T_sim), rentier_idx_v(1,1:T_sim)*100, 'b', t(1:T_sim), rentier_idx_v(2,1:T_sim)*100, 'r'); title('Rentier Index'); grid on;

% Row 10: Gov Revenue Index (New Row 10 Index)
subplot(rows,4,36+j); 
plot(t(1:T_sim), rev_idx_A, 'b', t(1:T_sim), rev_idx_B, 'r'); title('Gov Revenue Index'); grid on;

% Row 11: Gov Revenue Index (New Row 10 Index)
subplot(rows,4,40+j); 
plot(t(1:T_sim),offshore_ratio_v(1,1:T_sim)*100, 'b', t(1:T_sim), offshore_ratio_v(2,1:T_sim)*100, 'r'); title('Offshore Capital %'); grid on;

end
toc

% --- POST-SIMULATION: Partitioned GNI Figure ---
figure('Color', 'w', 'Position', [100 100 1100 900]);

for s = 1:4
    for c = 1:2
        idx = (s-1)*2 + c;
        subplot(4, 2, idx);
        hold on;
        
        % Data is already per capita if you divided by L_vec(c) in the loop
        data_to_plot = squeeze(GNI_parts_all(s, c, 1:T_sim, :));
        
        h = area(t(1:T_sim), data_to_plot, 'EdgeColor', 'none');
        
        % Colors: Red (Labor), Blue (Domestic), Green (Foreign)
        h(1).FaceColor = [0.8 0.3 0.3]; 
        h(2).FaceColor = [0.3 0.3 0.8]; 
        h(3).FaceColor = [0.3 0.8 0.3]; 
        
        % --- THE SCALING FIX ---
        % Calculate total height for this specific country in this scenario
        local_total_gni = sum(data_to_plot, 2);
        local_y_max = max(local_total_gni);
        
        % Set y-limit with a 10% buffer
        ylim([0, local_y_max * 1.1]); 
        % ----------------------

        if s == 1, title(['Country ' char(64+c)]); end
        if c == 1, ylabel(['S' num2str(s)]); end
        if s == 4, xlabel('Years'); end
        
        grid on; set(gca, 'Layer', 'top'); axis tight;
    end
end

lgd = legend(h, {'Labor Income', 'Domestic Cap Inc', 'Foreign Cap Inc'}, ...
    'Orientation', 'horizontal');
set(lgd, 'Position', [0.35, 0.02, 0.3, 0.03]);

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


function [K_vec, aut_flags] = solve_2c_market_fast(V_vec, bt, d_val, A, L, gamma, rho, w)
    V_tot = sum(V_vec);
    obj = @(ka) get_r_net(ka, V_vec(1), bt(1), d_val, A(1), L(1), gamma, rho, w(1)) - ...
                get_r_net(V_tot-ka, V_vec(2), bt(2), d_val, A(2), L(2), gamma, rho, w(2));
    ka_star = fzero(obj, [1e-12*V_tot, 0.9999999*V_tot]);
    K_vec = [ka_star; V_tot - ka_star];
    aut_flags = [abs(K_vec(1)-V_vec(1)) < 0.005*V_vec(1); abs(K_vec(2)-V_vec(2)) < 0.005*V_vec(2)];
end


function rn = get_r_net(k, v, bt, d_val, A, L, gamma, rho, w)
    rr = get_r(k, bt, rho, gamma, A, L, d_val);
    scale = 0.01 * v;
    tax_weight = 1 / (1 + exp(-(k - v) / scale));
    rn = rr - tax_weight * w;
end

function mpl = get_mpl(k, bt, rho, gamma, A, L)
    % 1. Calculate the task aggregate (X)
    X = bt.^(1-rho).*k.^rho + (1-bt).^(1-rho).*L.^rho;
    
    % 2. Calculate Total Output (Y)
    y = A .* k.^gamma .* (X.^((1-gamma)./rho));
    
    % 3. Apply the derivative formula
    % MPL = (1-gamma) * (Y/X) * (1-beta)^(1-rho) * L^(rho-1)
    mpl = (1-gamma) .* (y ./ X) .* (1-bt).^(1-rho) .* L.^(rho-1);
end
