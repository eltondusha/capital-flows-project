%% Standalone Beta Scenario Tester (Target: Leader Max at T=30)
clear; clc; close all;

% --- 0. GLOBAL CONTROLS ---
T = 60;
t = 0:T;
b_start = 0.001;
steepness_gen = 0.8; 

% --- 1. HYPE PARAMETERS (Scenario 1) ---
hype_realized_max_A = 0.09;
hype_realized_max_B = 0.05;
hype_realized_max_C = 0.025;
hype_perc_peak = 0.19;
hype_trough_depth = 0.05;

% --- 2. TIDAL FLOW PARAMETERS (Scenario 2) ---
tidal_max = 0.35;
tidal_lag_B = 6;
tidal_lag_C = 12;
tidal_midpoint = 18;
tidal_steepness = 0.32;       

% --- 3. Staggered Flow PARAMETERS (Scenario 3) ---
logjam_max = 0.50;
logjam_plateau_dur = 6;     
logjam_lag_B = 8;
logjam_mid1 = 8; 
logjam_mid2 = logjam_mid1 + 8 + logjam_plateau_dur;

% --- 4. GULF PARAMETERS (Scenario 4) ---
gulf_max = 0.65;
gulf_plateau_gap = 10;       
gulf_leakage_B = 0.231;       
gulf_leakage_C = 0.08;       
gulf_mid1 = 10;
gulf_mid2 = gulf_mid1 + gulf_plateau_gap + 5; 

%% --- GENERATION ---

% SCENARIO 1: Hype
beta_A1 = b_start + ((hype_realized_max_A - b_start) ./ (1 + exp(-steepness_gen * (t - 5))));
S_peak = (1 ./ (1 + exp(-2.5 * (t - 3)))) .* (1 ./ (1 + exp(1.8 * (t - 7))));
S_trough = (1 ./ (1 + exp(-1.2 * (t - 10)))) .* (1 ./ (1 + exp(0.6 * (t - 20))));
beta_perc_A1 = max(1e-6, beta_A1 + (hype_perc_peak * S_peak) - (hype_trough_depth * S_trough));
beta_B1 = b_start + ((hype_realized_max_B - b_start) ./ (1 + exp(-steepness_gen * (t - 6))));
beta_C1 = b_start + ((hype_realized_max_C - b_start) ./ (1 + exp(-steepness_gen * (t - 8))));

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

%% --- PLOTTING ---
figure('Color', 'w', 'Position', [100, 100, 1200, 800]);
clrs = [0 0.447 0.741; 0.85 0.325 0.098; 0.466 0.674 0.188]; % Blue, Red, Green

titles = {'S1: Hype', 'S2: Tidal Flow', 'S3: Logjam', 'S4: The Gulf'};
data_A = {beta_A1, beta_A2, beta_A3, beta_A4};
data_perc = {beta_perc_A1, [], [], []};
data_others = {{beta_B1, beta_C1}, {beta_B2, beta_C2}, {beta_B3, beta_C3}, {beta_B4, beta_C4}};

for i = 1:4
    subplot(2,2,i); hold on;
    plot(t, data_A{i}, 'Color', clrs(1,:), 'LineWidth', 2.5);
    if ~isempty(data_perc{i})
        plot(t, data_perc{i}, '--', 'Color', clrs(1,:));
    end
    plot(t, data_others{i}{1}, 'Color', clrs(2,:), 'LineWidth', 1.5);
    plot(t, data_others{i}{2}, 'Color', clrs(3,:), 'LineWidth', 1.5);
    title(titles{i}); grid on; xlim([0 50]);
    if i == 1, legend('Leader Real', 'Leader Perc', 'Follower', 'Laggard'); end
end