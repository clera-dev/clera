import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PIIFormField } from '@/components/account/PIIFormField';

describe('PIIFormField - Postal Code', () => {
  const defaultProps = {
    section: 'address',
    field: 'postal_code',
    value: '',
    updateableFields: { address: { postal_code: { updateable: true } } },
    validationErrors: {},
    onChange: jest.fn(),
  };

  it('renders a postal code input with correct attributes', () => {
    render(<PIIFormField {...defaultProps} />);
    
    const input = screen.getByPlaceholderText('12345 or 12345-6789');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputMode', 'numeric');
    expect(input).toHaveAttribute('pattern', '[0-9-]*');
    expect(input).toHaveAttribute('maxLength', '10');
    expect(input).toHaveAttribute('autoComplete', 'postal-code');
  });

  it('calls onChange with a formatted 5-digit zip code', () => {
    const handleChange = jest.fn();
    render(<PIIFormField {...defaultProps} onChange={handleChange} />);
    
    const input = screen.getByPlaceholderText('12345 or 12345-6789');
    fireEvent.change(input, { target: { value: '90210' } });
    
    expect(handleChange).toHaveBeenCalledWith('address', 'postal_code', '90210');
  });

  it('calls onChange with a formatted 9-digit zip code (ZIP+4)', () => {
    const handleChange = jest.fn();
    render(<PIIFormField {...defaultProps} onChange={handleChange} />);
    
    const input = screen.getByPlaceholderText('12345 or 12345-6789');
    fireEvent.change(input, { target: { value: '902101234' } });
    
    expect(handleChange).toHaveBeenCalledWith('address', 'postal_code', '90210-1234');
  });

  it('handles partial input correctly', () => {
    const handleChange = jest.fn();
    render(<PIIFormField {...defaultProps} onChange={handleChange} />);
    
    const input = screen.getByPlaceholderText('12345 or 12345-6789');
    fireEvent.change(input, { target: { value: '123' } });
    
    expect(handleChange).toHaveBeenCalledWith('address', 'postal_code', '123');
  });

  it('handles non-numeric input by stripping characters', () => {
    const handleChange = jest.fn();
    render(<PIIFormField {...defaultProps} onChange={handleChange} />);
    
    const input = screen.getByPlaceholderText('12345 or 12345-6789');
    fireEvent.change(input, { target: { value: 'abc-123' } });
    
    expect(handleChange).toHaveBeenCalledWith('address', 'postal_code', '123');
  });

  it('displays a validation error when one is provided', () => {
    const errors = { 'address.postal_code': 'Invalid ZIP code' };
    render(<PIIFormField {...defaultProps} validationErrors={errors} />);
    
    expect(screen.getByText('Invalid ZIP code')).toBeInTheDocument();
  });
});
