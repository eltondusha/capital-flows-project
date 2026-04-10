% Parameters
gamma = 0.33;
rho = -1.5;
Y_over_K = 3;
L = 1;

% Define beta range (avoiding 0 and 1 exactly to prevent division issues)
beta = linspace(0.01, 0.99, 100);

% Levels of K for different iso-curves
K_levels = [0.5, 1, 2, 5];

figure;
hold on;
grid on;

for K = K_levels
    % Break down the MPK formula
    % Numerator: beta^(1-rho) * K^rho
    num = (beta.^(1-rho)) .* (K^rho);
    
    % Denominator: beta^(1-rho) * K^rho + (1-beta)^(1-rho) * L^rho
    den = num + ((1-beta).^(1-rho)) .* (L^rho);
    
    % Full MPK formula
    MPK = (gamma + (1-gamma) .* (num ./ den)) .* Y_over_K;
    
    % Plotting
    plot(beta, MPK, 'LineWidth', 2, 'DisplayName', ['K = ', num2str(K)]);
end

% Formatting the plot
xlabel('\beta_{i,t}');
ylabel('MPK_{i,t}');
title('MPK as a function of \beta for varying K');
legend('Location', 'best');
set(gca, 'FontSize', 12);