/**
 * Security Tests for ValidationService
 * 
 * These tests verify that the service doesn't silently drop valid falsy values
 * like 0, false, and empty strings for optional parameters.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { ValidationService } from '../ValidationService';

describe('ValidationService - Security', () => {
  let service: ValidationService;

  beforeEach(() => {
    service = ValidationService.getInstance();
  });

  describe('Optional Parameter Falsy Value Protection', () => {
    it('should preserve valid falsy values for optional parameters', () => {
      // Test cases with valid falsy values that should be preserved
      const testCases = [
        { value: 0, description: 'Zero number' },
        { value: false, description: 'Boolean false' },
        { value: '', description: 'Empty string' },
        { value: '0', description: 'String zero' },
        { value: 'false', description: 'String false' },
        { value: NaN, description: 'NaN' },
        { value: 0.0, description: 'Zero float' },
      ];

      testCases.forEach(({ value, description }) => {
        const result = service.validateOptional(
          value,
          'testParam',
          (val) => val, // Identity transform
          () => true // Always valid
        );

        expect(result.isValid).toBe(true);
        expect(result.value).toBe(value);
        console.log(`✅ Preserved: ${description} (${value})`);
      });
    });

    it('should only treat null/undefined as "no value provided"', () => {
      // Test cases that should be treated as "no value provided"
      const nullishCases = [
        { value: null, description: 'null' },
        { value: undefined, description: 'undefined' },
      ];

      nullishCases.forEach(({ value, description }) => {
        const result = service.validateOptional(
          value,
          'testParam',
          (val) => val, // Identity transform
          () => true // Always valid
        );

        expect(result.isValid).toBe(true);
        expect(result.value).toBe(undefined);
        console.log(`✅ Treated as optional: ${description}`);
      });
    });

    it('should handle zero values correctly in numeric transformations', () => {
      const result = service.validateOptional(
        0,
        'count',
        (val) => parseInt(String(val), 10),
        (val) => Number.isInteger(val) && val >= 0
      );

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(0);
    });

    it('should handle false values correctly in boolean transformations', () => {
      const result = service.validateOptional(
        false,
        'enabled',
        (val) => Boolean(val),
        (val) => typeof val === 'boolean'
      );

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(false);
    });

    it('should handle empty strings correctly in string transformations', () => {
      const result = service.validateOptional(
        '',
        'description',
        (val) => String(val),
        (val) => typeof val === 'string'
      );

      expect(result.isValid).toBe(true);
      expect(result.value).toBe('');
    });
  });

  describe('Required Parameter Validation', () => {
    it('should reject null/undefined for required parameters', () => {
      const nullishCases = [
        { value: null, description: 'null' },
        { value: undefined, description: 'undefined' },
      ];

      nullishCases.forEach(({ value, description }) => {
        const result = service.validateRequired(value, 'testParam');
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
        console.log(`✅ Rejected required: ${description}`);
      });
    });

    it('should accept valid falsy values for required parameters', () => {
      const validFalsyCases = [
        { value: 0, description: 'Zero number' },
        { value: false, description: 'Boolean false' },
        // Note: Empty strings are correctly rejected for required parameters
      ];

      validFalsyCases.forEach(({ value, description }) => {
        const result = service.validateRequired(value, 'testParam');
        expect(result.isValid).toBe(true);
        expect(result.value).toBe(value);
        console.log(`✅ Accepted required: ${description} (${value})`);
      });
    });

    it('should reject empty strings for required parameters', () => {
      const result = service.validateRequired('   ', 'testParam');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Data Loss Prevention', () => {
    it('should not lose data when transforming falsy values', () => {
      const transformations = [
        {
          input: 0,
          transform: (val: any) => Number(val),
          expected: 0,
          description: 'Zero number transformation'
        },
        {
          input: false,
          transform: (val: any) => Boolean(val),
          expected: false,
          description: 'Boolean false transformation'
        },
        {
          input: '',
          transform: (val: any) => String(val),
          expected: '',
          description: 'Empty string transformation'
        },
        {
          input: '0',
          transform: (val: any) => parseInt(val, 10),
          expected: 0,
          description: 'String zero to number'
        },
      ];

      transformations.forEach(({ input, transform, expected, description }) => {
        const result = service.validateOptional(
          input,
          'testParam',
          transform,
          () => true
        );

        expect(result.isValid).toBe(true);
        expect(result.value).toBe(expected);
        console.log(`✅ No data loss: ${description}`);
      });
    });

    it('should handle edge cases without data loss', () => {
      const edgeCases = [
        { value: 0.0, expected: 0.0, description: 'Zero float' },
        { value: -0, expected: -0, description: 'Negative zero' },
        { value: ' ', expected: ' ', description: 'Whitespace string' },
        { value: '\t', expected: '\t', description: 'Tab character' },
        { value: '\n', expected: '\n', description: 'Newline character' },
      ];

      edgeCases.forEach(({ value, expected, description }) => {
        const result = service.validateOptional(
          value,
          'testParam',
          (val) => val, // Identity transform
          () => true
        );

        expect(result.isValid).toBe(true);
        expect(result.value).toBe(expected);
        console.log(`✅ Edge case preserved: ${description}`);
      });
    });
  });

  describe('Validation Consistency', () => {
    it('should maintain consistent behavior across different parameter types', () => {
      const testCases = [
        { value: 0, type: 'number' },
        { value: false, type: 'boolean' },
        { value: '', type: 'string' },
        { value: null, type: 'null' },
        { value: undefined, type: 'undefined' },
      ];

      testCases.forEach(({ value, type }) => {
        const result = service.validateOptional(
          value,
          'testParam',
          (val) => val,
          () => true
        );

        if (value === null || value === undefined) {
          expect(result.isValid).toBe(true);
          expect(result.value).toBe(undefined);
        } else {
          expect(result.isValid).toBe(true);
          expect(result.value).toBe(value);
        }

        console.log(`✅ Consistent behavior: ${type} (${value})`);
      });
    });

    it('should handle validation errors correctly for falsy values', () => {
      const result = service.validateOptional(
        0,
        'testParam',
        (val) => val,
        (val) => val > 0 // Only positive numbers allowed
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Invalid testParam format');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle common API parameter scenarios correctly', () => {
      // Scenario 1: Optional count parameter (0 is valid)
      const countResult = service.validateOptional(
        0,
        'count',
        (val) => parseInt(String(val), 10),
        (val) => Number.isInteger(val) && val >= 0
      );
      expect(countResult.isValid).toBe(true);
      expect(countResult.value).toBe(0);

      // Scenario 2: Optional enabled flag (false is valid)
      const enabledResult = service.validateOptional(
        false,
        'enabled',
        (val) => Boolean(val),
        (val) => typeof val === 'boolean'
      );
      expect(enabledResult.isValid).toBe(true);
      expect(enabledResult.value).toBe(false);

      // Scenario 3: Optional description (empty string is valid)
      const descResult = service.validateOptional(
        '',
        'description',
        (val) => String(val),
        (val) => typeof val === 'string'
      );
      expect(descResult.isValid).toBe(true);
      expect(descResult.value).toBe('');

      console.log('✅ Real-world scenarios handled correctly');
    });
  });
}); 