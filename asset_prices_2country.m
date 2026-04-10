%% Two-Country Task-Based Growth Model: STABLE FRICTIONAL EDITION
% Based on AI_Adoption.pdf (Final Specification)
% Fixes: Eliminates Regime Chittering and enforces Price-Gap Arbitrage.

clear; clc; close all;
tic;

%% 1. GLOBAL & STRUCTURAL PARAMETERS
T = 60; T_sim = 45; dt = 1; t = 0:dt:T;             
l = 3; lag_laggard = 10; % Gestation lag set to 3 for simulation stability

% Labor and Productivity
size_ratio = 5; 
L_A = 5.0; L_B = L_A/size_ratio; 
A0_A = 1.25; A0_B = 1.0;

% Production & Substitution
sigma = 0.4; rho = (sigma - 1)/sigma; 
gamma = 0.33; delta = 0.05; b_start = 0.001;  

% Behavioral & Integration
phi = 0.20; r_target = 0.04; 
omega_A = 0.001; % Cost [C/K] to relocate OUT of A
omega_B = 0.001; % Cost [C/K] to relocate OUT of B

%% 2. INITIALIZATION
f_ss = @(k, a) ((a .* k.^gamma .* (b_start.^(1-rho).*k.^rho + (1-b_start).^(1-rho).*1.^rho).^((1-gamma)./rho))./k) .* ...
    (gamma + (1-gamma) .* (b_start.^(1-rho).*k.^rho)./(b_start.^(1-rho).*k.^rho + (1-b_start).^(1-rho).*1.^rho)) - delta - r_target;

K_init_A = fzero(@(k) f_ss(k, A0_A), [0.01, 500]) * L_A;
K_init_B = fzero(@(k) f_ss(k, A0_B), [0.01, 500]) * L_B;

s_base_A = (delta * K_init_A) / get_y(K_init_A, b_start, A0_A, L_A);
s_base_B = (delta * K_init_B) / get_y(K_init_B, b_start, A0_B, L_B);

%% 3. AUTOMATION SCENARIOS (Standard Logic)
beta_A = zeros(4, length(t)); beta_B = zeros(4, length(t)); beta_perc_A = zeros(4, length(t)); 
for sn = 1:4
    if sn == 1
        beta_A(sn,:) = b_start + (0.02-b_start)./(1+exp(-0.8*(t-5)));
        S_bubble = (1./(1+exp(-2.5*(t-3)))) .* (1./(1+exp(1.8*(t-7))));
        beta_perc_A(sn,:) = max(1e-6, beta_A(sn,:) + 0.4*S_bubble); 
        beta_B(sn,:) = beta_A(sn,:);
    elseif sn == 2
        beta_A(sn,:) = b_start + (0.5./(1+exp(-0.4*(t-13))));
        beta_B(sn,lag_laggard+1:end) = beta_A(sn,1:end-lag_laggard);
        beta_B(sn,1:lag_laggard) = b_start;
        beta_perc_A(sn,:) = beta_A(sn,:);
    elseif sn == 3
        beta_A(sn,:) = b_start + (0.2./(1+exp(-0.8*(t-8))) + 0.3./(1+exp(-0.8*(t-24))));
        beta_B(sn,lag_laggard+1:end) = beta_A(sn,1:end-lag_laggard);
        beta_B(sn,1:lag_laggard) = b_start;
        beta_perc_A(sn,:) = beta_A(sn,:);
    else
        beta_A(sn,:) = b_start + (0.5./(1+exp(-0.6*(t-10))) + 0.4./(1+exp(-0.8*(t-22))));
        beta_B(sn,:) = b_start + (0.03-b_start)./(1+exp(-0.8*(t-5)));
        beta_perc_A(sn,:) = beta_A(sn,:);
    end
end

%% 4. SIMULATION LOOP
figure('Color', 'w', 'Position', [50, 50, 1400, 1000]);

for sn = 1:4
    P = [K_init_A, 0; 0, K_init_B]; 
    V = [K_init_A; K_init_B];        
    p_prev = [1.0; 1.0];
    K_total = sum(sum(P));
    
    K_loc_v = zeros(2, T_sim); p_v = zeros(2, T_sim);      
    r_tot_v = zeros(2, T_sim); GNI_v = zeros(2, T_sim);      
    reloc_loss_v = zeros(2, T_sim);
    
    pipe_A = ones(1, T+l+1) * (delta * K_init_A);
    pipe_B = ones(1, T+l+1) * (delta * K_init_B);
    
    for i = 1:T_sim
        % A. EQUILIBRIUM SOLVER
        V_total = sum(V);
        % Current location K comes from depreciated stock + pipe
        % But prices adjust to satisfy the arbitrage condition
        [K_target, p_curr] = solve_equilibrium_mark_to_market(V_total, K_total, beta_perc_A(sn, i), beta_B(sn, i), A0_A, A0_B, L_A, L_B, rho, gamma, omega_A, omega_B);
        
        K_loc_v(:, i) = K_target;
        p_v(:, i) = p_curr;
        
        % B. PRODUCTION & RETURNS
        MPK_A = get_mpk(K_target(1), beta_A(sn, i), rho, gamma, A0_A, L_A);
        MPK_B = get_mpk(K_target(2), beta_B(sn, i), rho, gamma, A0_B, L_B);
        MPK = [MPK_A; MPK_B];
        YA = get_y(K_target(1), beta_A(sn, i), A0_A, L_A);
        YB = get_y(K_target(2), beta_B(sn, i), A0_B, L_B);
        
        r_tot = (MPK + p_curr.*(1-delta))./p_prev - 1;
        r_tot_v(:, i) = r_tot;
        
        % C. GNI ACCOUNTING
        labor_inc = [YA - MPK_A*K_target(1); YB - MPK_B*K_target(2)];
        GNI_v(:, i) = labor_inc + P*MPK + P*(p_curr - p_prev);
        
        % D. SAVINGS & STATE UPDATES
        if i < T_sim
            s_A = max(0, s_base_A + phi * (r_tot(1) - r_target));
            s_B = max(0, s_base_B + phi * (r_tot(2) - r_target));
            
            pipe_A(i+l) = s_A * GNI_v(1,i);
            pipe_B(i+l) = s_B * GNI_v(2,i);
            
            P_depr = P * (1-delta);
            K_total_next = sum(sum(P_depr)) + (pipe_A(i+1)+pipe_B(i+1));
            V_gross = V * (1-delta) + [pipe_A(i+1); pipe_B(i+1)];
            
            % Solve for Target Location
            [K_next, ~] = solve_equilibrium_mark_to_market(sum(V_gross), K_total_next, beta_perc_A(sn, i+1), beta_B(sn, i+1), A0_A, A0_B, L_A, L_B, rho, gamma, omega_A, omega_B);
            
            % Minimal-Churn Portfolio (Crucial for Return Stability)
            dK_needed = K_next - sum(P_depr, 1)'; 
            P_new = P_depr;
            loss = [0; 0];
            
            if dK_needed(1) > 0.001 % Significant Flow B to A
                shift = min(P_depr(2,2), dK_needed(1));
                P_new(2,2) = P_new(2,2) - shift; P_new(2,1) = P_new(2,1) + shift;
                loss(2) = shift * omega_B;
            elseif dK_needed(2) > 0.001 % Significant Flow A to B
                shift = min(P_depr(1,1), dK_needed(2));
                P_new(1,1) = P_new(1,1) - shift; P_new(1,2) = P_new(1,2) + shift;
                loss(1) = shift * omega_A;
            end
            
            V = V_gross - loss;
            P = P_new;
            K_total = K_total_next;
            p_prev = p_curr;
        end
    end
    
    % --- PLOTTING ---
    row_plots = 5;
    subplot(row_plots, 4, sn); plot(t(1:T_sim), beta_A(sn, 1:T_sim), 'b', t(1:T_sim), beta_B(sn, 1:T_sim), 'r--', 'LineWidth', 1.5); title(['Scenario ', num2str(sn), ': \beta']); grid on;
    subplot(row_plots, 4, 4+sn); plot(t(1:T_sim), K_loc_v(1,:), 'b', t(1:T_sim), K_loc_v(2,:), 'r--', 'LineWidth', 1.5); title('K [Location]'); grid on;
    subplot(row_plots, 4, 8+sn); plot(t(1:T_sim), p_v(1,:), 'b', t(1:T_sim), p_v(2,:), 'r--', 'LineWidth', 1.5); title('Price p [C/K]'); grid on;
    subplot(row_plots, 4, 12+sn); plot(t(1:T_sim), (p_v(1,:) - p_v(2,:)), 'k', 'LineWidth', 1.2); title('Price Gap (pA - pB)'); grid on; yline(omega_B, 'r:'); yline(-omega_A, 'b:');
    subplot(row_plots, 4, 16+sn); plot(t(1:T_sim), r_tot_v(1,:)*100, 'b', t(1:T_sim), r_tot_v(2,:)*100, 'r--', 'LineWidth', 1.5); title('Total Return %'); grid on;
end
sgtitle('Stable AI Growth Model: Regime Hysteresis Logic', 'FontSize', 16, 'FontWeight', 'bold');
toc;

%% --- HELPERS ---
function y = get_y(k, bt, A, L)
    sigma_v = 0.4; rho_v = (sigma_v - 1)/sigma_v; gamma_v = 0.33;
    task_agg = max(1e-12, bt.^(1-rho_v).*k.^rho_v + (1-bt).^(1-rho_v).*L.^rho_v);
    y = A .* k.^gamma_v .* (task_agg.^((1-gamma_v)./rho_v));
end

function mpk = get_mpk(k, bt, rho, gamma, A, L)
    y = get_y(k, bt, A, L);
    task_agg = max(1e-12, bt.^(1-rho).*k.^rho + (1-bt).^(1-rho).*L.^rho);
    mpk = (gamma + (1-gamma) .* (bt.^(1-rho).*k.^rho)./task_agg) .* (y./k);
end

function [K_split, p_split] = solve_equilibrium_mark_to_market(V_tot, K_tot, bA, bB, AA, AB, LA, LB, rho, gam, wA, wB)
    % Consistent Solver using Regime Hysteresis to avoid chittering
    obj = @(ka) return_gap_stable(ka, K_tot, V_tot, bA, bB, AA, AB, LA, LB, rho, gam, wA, wB);
    
    % Solver search
    try
        ka_star = fzero(obj, [1e-6*K_tot, 0.999*K_tot]);
    catch
        % If fzero fails, use a simpler bisection
        low = 1e-6*K_tot; high = 0.999*K_tot;
        for j=1:50
            mid = (low+high)/2;
            if obj(mid) > 0, low = mid; else, high = mid; end
        end
        ka_star = mid;
    end
    K_split = [ka_star; K_tot - ka_star];
    [~, p_split] = return_gap_stable(ka_star, K_tot, V_tot, bA, bB, AA, AB, LA, LB, rho, gam, wA, wB);
end

function [err, p_final] = return_gap_stable(ka, ktot, vtot, bA, bB, AA, AB, LA, LB, rho, gam, wA, wB)
    kb = ktot - ka;
    mpkA = get_mpk(ka, bA, rho, gam, AA, LA);
    mpkB = get_mpk(kb, bB, rho, gam, AB, LB);
    
    % Step 1: Calculate "No-Trade" Prices (Perfect return equalization)
    pa_ideal = vtot / (ka + (mpkB/mpkA)*kb);
    pb_ideal = pa_ideal * (mpkB/mpkA);
    gap_ideal = pa_ideal - pb_ideal;
    
    % Step 2: Apply the Friction Boundaries strictly
    if gap_ideal > wB
        % A is Frontier (Flow B to A), Lock Gap at wB
        pa = (vtot + wB*kb)/ktot; pb = pa - wB;
        err = (mpkA / pa) - (mpkB / pb);
    elseif gap_ideal < -wA
        % B is Frontier (Flow A to B), Lock Gap at wA
        pb = (vtot + wA*ka)/ktot; pa = pb - wA;
        err = (mpkA / pa) - (mpkB / pb);
    else
        % In the band: Prices adjust to equalize returns perfectly
        pa = pa_ideal; pb = pb_ideal;
        err = 0; % No pressure to move
    end
    p_final = [pa; pb];
end