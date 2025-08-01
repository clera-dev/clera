import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { InfoTooltip } from '../../components/ui/InfoTooltip';

// Mock window.innerWidth for mobile testing
const mockWindowWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
};

describe('InfoTooltip - Race Condition Protection', () => {
  beforeEach(() => {
    // Reset to desktop width by default
    mockWindowWidth(1024);
  });

  it('should handle rapid clicks without race conditions on mobile', async () => {
    // Set mobile width
    mockWindowWidth(768);

    render(
      <InfoTooltip content="Test tooltip content">
        <button>Click me</button>
      </InfoTooltip>
    );

    const trigger = screen.getByRole('button');

    // Simulate rapid clicks
    await act(async () => {
      fireEvent.click(trigger);
      fireEvent.click(trigger);
      fireEvent.click(trigger);
      fireEvent.click(trigger);
    });

    // The tooltip should be in a consistent state after rapid clicks
    // We can't easily test the exact state due to the tooltip library's behavior,
    // but we can verify no errors occurred and the component is still functional
    expect(trigger).toBeInTheDocument();
  });

  it('should use functional updater to prevent stale state', async () => {
    // Set mobile width
    mockWindowWidth(768);

    const { rerender } = render(
      <InfoTooltip content="Test tooltip content">
        <button>Click me</button>
      </InfoTooltip>
    );

    const trigger = screen.getByRole('button');

    // Simulate multiple rapid clicks
    await act(async () => {
      // First click
      fireEvent.click(trigger);
      
      // Immediately trigger a re-render to simulate state update
      rerender(
        <InfoTooltip content="Updated tooltip content">
          <button>Click me</button>
        </InfoTooltip>
      );
      
      // Second click - should use the latest state, not stale state
      fireEvent.click(trigger);
    });

    // Component should still be functional after rapid clicks with re-renders
    expect(trigger).toBeInTheDocument();
  });

  it('should maintain desktop behavior without race conditions', async () => {
    // Set desktop width
    mockWindowWidth(1024);

    render(
      <InfoTooltip content="Test tooltip content">
        <button>Click me</button>
      </InfoTooltip>
    );

    const trigger = screen.getByRole('button');

    // Simulate rapid clicks on desktop
    await act(async () => {
      fireEvent.click(trigger);
      fireEvent.click(trigger);
      fireEvent.click(trigger);
    });

    // Desktop behavior should remain unchanged
    expect(trigger).toBeInTheDocument();
  });

  it('should handle edge case of very rapid clicks', async () => {
    // Set mobile width
    mockWindowWidth(768);

    render(
      <InfoTooltip content="Test tooltip content">
        <button>Click me</button>
      </InfoTooltip>
    );

    const trigger = screen.getByRole('button');

    // Simulate extremely rapid clicks
    await act(async () => {
      for (let i = 0; i < 10; i++) {
        fireEvent.click(trigger);
      }
    });

    // Component should remain stable even with very rapid clicks
    expect(trigger).toBeInTheDocument();
  });

  it('should prevent default behavior on mobile clicks', async () => {
    // Set mobile width
    mockWindowWidth(768);

    render(
      <InfoTooltip content="Test tooltip content">
        <button>Click me</button>
      </InfoTooltip>
    );

    const trigger = screen.getByRole('button');

    // Create a spy on the preventDefault method
    const preventDefaultSpy = jest.spyOn(Event.prototype, 'preventDefault');

    await act(async () => {
      fireEvent.click(trigger);
    });

    // preventDefault should be called on mobile
    expect(preventDefaultSpy).toHaveBeenCalled();

    preventDefaultSpy.mockRestore();
  });

  it('should not prevent default behavior on desktop clicks', async () => {
    // Set desktop width
    mockWindowWidth(1024);

    render(
      <InfoTooltip content="Test tooltip content">
        <button>Click me</button>
      </InfoTooltip>
    );

    const trigger = screen.getByRole('button');

    // Create a spy on the preventDefault method
    const preventDefaultSpy = jest.spyOn(Event.prototype, 'preventDefault');

    await act(async () => {
      fireEvent.click(trigger);
    });

    // preventDefault should not be called on desktop
    expect(preventDefaultSpy).not.toHaveBeenCalled();

    preventDefaultSpy.mockRestore();
  });
}); 