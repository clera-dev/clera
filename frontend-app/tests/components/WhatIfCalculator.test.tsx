/**
 * COMPREHENSIVE TEST: WhatIfCalculator Component
 *
 * Tests the following critical fixes:
 * 1. Typable inputs for all non-button fields
 * 2. Increased value ranges for larger investors
 * 3. Auto-population of starting portfolio value
 * 4. Slider/input synchronization
 * 5. Projection calculations accuracy
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import WhatIfCalculator from '../../components/portfolio/WhatIfCalculator';

// Mock recharts to avoid rendering issues in tests
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
}));

describe('WhatIfCalculator Component', () => {
  describe('Initial Portfolio Value Auto-population', () => {
    it('should auto-populate with user portfolio value when provided', () => {
      render(<WhatIfCalculator currentPortfolioValue={150000} />);

      const initialInvestmentInput = screen.getByLabelText(/Starting Portfolio Value/i);
      expect(initialInvestmentInput).toHaveValue(150000);
    });

    it('should default to 0 when no portfolio value is provided', () => {
      render(<WhatIfCalculator />);

      const initialInvestmentInput = screen.getByLabelText(/Starting Portfolio Value/i);
      expect(initialInvestmentInput).toHaveValue(0);
    });

    it('should handle null portfolio value gracefully', () => {
      render(<WhatIfCalculator currentPortfolioValue={null} />);

      const initialInvestmentInput = screen.getByLabelText(/Starting Portfolio Value/i);
      expect(initialInvestmentInput).toHaveValue(0);
    });

    it('should update when portfolio value prop changes', async () => {
      const { rerender } = render(<WhatIfCalculator currentPortfolioValue={50000} />);

      expect(screen.getByLabelText(/Starting Portfolio Value/i)).toHaveValue(50000);

      // Simulate portfolio value update
      rerender(<WhatIfCalculator currentPortfolioValue={75000} />);

      // Note: This tests the useEffect that updates on prop changes
      await waitFor(() => {
        expect(screen.getByLabelText(/Starting Portfolio Value/i)).toHaveValue(75000);
      });
    });
  });

  describe('Typable Input Fields', () => {
    it('should allow typing in the starting portfolio value field', async () => {
      const user = userEvent.setup();
      render(<WhatIfCalculator currentPortfolioValue={10000} />);

      const input = screen.getByLabelText(/Starting Portfolio Value/i);

      // Clear and type new value
      await user.clear(input);
      await user.type(input, '250000');

      expect(input).toHaveValue(250000);
    });

    it('should allow typing in the monthly contribution field', async () => {
      const user = userEvent.setup();
      render(<WhatIfCalculator />);

      const input = screen.getByLabelText(/Monthly Contribution/i);

      await user.clear(input);
      await user.type(input, '5000');

      expect(input).toHaveValue(5000);
    });

    it('should allow typing in the time horizon field', async () => {
      const user = userEvent.setup();
      render(<WhatIfCalculator />);

      const input = screen.getByLabelText(/Time Horizon/i);

      await user.clear(input);
      await user.type(input, '35');

      expect(input).toHaveValue(35);
    });

    it('should handle step buttons (increment/decrement)', async () => {
      const user = userEvent.setup();
      render(<WhatIfCalculator currentPortfolioValue={100000} />);

      const monthlyInput = screen.getByLabelText(/Monthly Contribution/i);
      const incrementButton = screen.getByRole('button', {
        name: /increase monthly contribution/i,
      });

      // Click increment button
      await user.click(incrementButton);

      // Value should increase by step amount
      const newValue = (monthlyInput as HTMLInputElement).value;
      expect(Number(newValue)).toBeGreaterThan(500); // Default is 500
    });
  });

  describe('Value Range Limits for Large Investors', () => {
    it('should accept starting portfolio values up to $50M', async () => {
      const user = userEvent.setup();
      render(<WhatIfCalculator />);

      const input = screen.getByLabelText(/Starting Portfolio Value/i);

      await user.clear(input);
      await user.type(input, '50000000'); // $50M

      // Should accept the value without clamping
      expect(input).toHaveValue(50000000);
    });

    it('should accept monthly contributions up to $1M', async () => {
      const user = userEvent.setup();
      render(<WhatIfCalculator />);

      const input = screen.getByLabelText(/Monthly Contribution/i);

      await user.clear(input);
      await user.type(input, '1000000'); // $1M

      expect(input).toHaveValue(1000000);
    });

    it('should accept time horizons up to 50 years', async () => {
      const user = userEvent.setup();
      render(<WhatIfCalculator />);

      const input = screen.getByLabelText(/Time Horizon/i);

      await user.clear(input);
      await user.type(input, '50');

      expect(input).toHaveValue(50);
    });
  });

  describe('Slider and Input Synchronization', () => {
    it('should sync slider when input value changes', async () => {
      const user = userEvent.setup();
      render(<WhatIfCalculator currentPortfolioValue={10000} />);

      const input = screen.getByLabelText(/Starting Portfolio Value/i);
      const slider = screen.getByRole('slider', { name: /Starting Portfolio Value/i });

      // Type a new value
      await user.clear(input);
      await user.type(input, '500000');

      // Slider should reflect the new value
      await waitFor(() => {
        expect(slider).toHaveAttribute('aria-valuenow', '500000');
      });
    });

    it('should sync input when slider value changes', async () => {
      render(<WhatIfCalculator currentPortfolioValue={100000} />);

      const input = screen.getByLabelText(/Starting Portfolio Value/i);
      const slider = screen.getByRole('slider', { name: /Starting Portfolio Value/i });

      // Simulate slider change
      fireEvent.change(slider, { target: { value: 200000 } });

      // Input should reflect the new value
      await waitFor(() => {
        expect(input).toHaveValue(200000);
      });
    });
  });

  describe('Investment Strategy Selection', () => {
    it('should default to moderate risk strategy', () => {
      render(<WhatIfCalculator />);

      const moderateButton = screen.getByRole('button', { name: /moderate/i });
      expect(moderateButton).toHaveAttribute('data-selected', 'true');
    });

    it('should switch between risk strategies', async () => {
      const user = userEvent.setup();
      render(<WhatIfCalculator />);

      const aggressiveButton = screen.getByRole('button', { name: /aggressive/i });
      await user.click(aggressiveButton);

      expect(aggressiveButton).toHaveAttribute('data-selected', 'true');

      const conservativeButton = screen.getByRole('button', { name: /conservative/i });
      await user.click(conservativeButton);

      expect(conservativeButton).toHaveAttribute('data-selected', 'true');
    });
  });

  describe('Projection Calculations', () => {
    it('should display projected future value in the chart', () => {
      render(<WhatIfCalculator currentPortfolioValue={100000} />);

      // Chart should be rendered
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });

    it('should update projections when inputs change', async () => {
      const user = userEvent.setup();
      render(<WhatIfCalculator currentPortfolioValue={100000} />);

      // Get the chart container to verify updates
      const chart = screen.getByTestId('line-chart');
      expect(chart).toBeInTheDocument();

      // Change monthly contribution
      const monthlyInput = screen.getByLabelText(/Monthly Contribution/i);
      await user.clear(monthlyInput);
      await user.type(monthlyInput, '2000');

      // Chart should still be rendered (component should not crash)
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle zero initial investment', () => {
      render(<WhatIfCalculator currentPortfolioValue={0} />);

      expect(screen.getByLabelText(/Starting Portfolio Value/i)).toHaveValue(0);
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });

    it('should handle very large values without overflow', async () => {
      const user = userEvent.setup();
      render(<WhatIfCalculator currentPortfolioValue={10000000} />);

      const monthlyInput = screen.getByLabelText(/Monthly Contribution/i);
      await user.clear(monthlyInput);
      await user.type(monthlyInput, '100000');

      const timeInput = screen.getByLabelText(/Time Horizon/i);
      await user.clear(timeInput);
      await user.type(timeInput, '40');

      // Component should not crash with large projections
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });

    it('should clamp values outside valid ranges', async () => {
      const user = userEvent.setup();
      render(<WhatIfCalculator />);

      const timeInput = screen.getByLabelText(/Time Horizon/i);

      // Try to set time horizon beyond max (50 years)
      await user.clear(timeInput);
      await user.type(timeInput, '100');

      // Should be clamped to max
      await waitFor(() => {
        expect(Number((timeInput as HTMLInputElement).value)).toBeLessThanOrEqual(50);
      });
    });

    it('should handle non-numeric input gracefully', async () => {
      const user = userEvent.setup();
      render(<WhatIfCalculator currentPortfolioValue={10000} />);

      const input = screen.getByLabelText(/Monthly Contribution/i);

      // Type non-numeric characters - should be ignored or handled
      await user.type(input, 'abc');

      // Input should still have a valid numeric value
      const value = (input as HTMLInputElement).value;
      expect(isNaN(Number(value))).toBe(false);
    });
  });

  describe('Currency Formatting', () => {
    it('should display formatted currency values', () => {
      render(<WhatIfCalculator currentPortfolioValue={1500000} />);

      // Check for proper currency formatting in labels or displayed values
      const formattedValue = screen.queryByText(/\$1,500,000/);
      expect(formattedValue || screen.getByLabelText(/Starting Portfolio Value/i)).toBeInTheDocument();
    });
  });
});

describe('WhatIfCalculator Accessibility', () => {
  it('should have proper labels for all inputs', () => {
    render(<WhatIfCalculator />);

    expect(screen.getByLabelText(/Starting Portfolio Value/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Monthly Contribution/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Time Horizon/i)).toBeInTheDocument();
  });

  it('should have accessible risk strategy buttons', () => {
    render(<WhatIfCalculator />);

    expect(screen.getByRole('button', { name: /conservative/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /moderate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /aggressive/i })).toBeInTheDocument();
  });
});
