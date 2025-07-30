/**
 * Service for handling input validation logic.
 * 
 * This service provides reusable validation functions for API routes,
 * ensuring consistent validation patterns and error handling.
 */

import { NextResponse } from 'next/server';

export interface ValidationResult {
  isValid: boolean;
  error?: NextResponse;
  value?: any;
}

export interface ValidationRule<T = any> {
  validate: (value: any) => boolean;
  message: string;
  transform?: (value: any) => T;
}

export class ValidationService {
  private static instance: ValidationService;

  private constructor() {}

  public static getInstance(): ValidationService {
    if (!ValidationService.instance) {
      ValidationService.instance = new ValidationService();
    }
    return ValidationService.instance;
  }

  /**
   * Validate a required parameter
   */
  public validateRequired(
    value: any, 
    paramName: string, 
    customMessage?: string
  ): ValidationResult {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return {
        isValid: false,
        error: NextResponse.json(
          { error: customMessage || `${paramName} is required` },
          { status: 400 }
        )
      };
    }

    return {
      isValid: true,
      value,
    };
  }

  /**
   * Validate an optional parameter with transformation
   */
  public validateOptional<T>(
    value: any,
    paramName: string,
    transform: (value: any) => T,
    validator?: (value: T) => boolean
  ): ValidationResult {
    if (!value) {
      return {
        isValid: true,
        value: undefined,
      };
    }

    try {
      const transformedValue = transform(value);
      
      if (validator && !validator(transformedValue)) {
        return {
          isValid: false,
          error: NextResponse.json(
            { error: `Invalid ${paramName} format` },
            { status: 400 }
          )
        };
      }

      return {
        isValid: true,
        value: transformedValue,
      };
    } catch (error) {
      return {
        isValid: false,
        error: NextResponse.json(
          { error: `Invalid ${paramName} format` },
          { status: 400 }
        )
      };
    }
  }

  /**
   * Validate multiple parameters at once
   */
  public validateMultiple(
    validations: Array<() => ValidationResult>
  ): ValidationResult {
    for (const validation of validations) {
      const result = validation();
      if (!result.isValid) {
        return result;
      }
    }

    return { isValid: true };
  }

  /**
   * Extract and validate query parameters from a request
   */
  public extractQueryParams(
    request: Request,
    paramDefinitions: Record<string, {
      required?: boolean;
      transform?: (value: string) => any;
      validate?: (value: any) => boolean;
      defaultValue?: any;
    }>
  ): ValidationResult {
    const { searchParams } = new URL(request.url);
    const extractedParams: Record<string, any> = {};

    for (const [paramName, definition] of Object.entries(paramDefinitions)) {
      const rawValue = searchParams.get(paramName);
      
      // Handle required parameters
      if (definition.required) {
        const validation = this.validateRequired(rawValue, paramName);
        if (!validation.isValid) {
          return validation;
        }
      }

      // Handle parameter transformation and validation
      if (rawValue !== null) {
        let value = rawValue;
        
        // Transform if transformer provided
        if (definition.transform) {
          try {
            value = definition.transform(rawValue);
          } catch (error) {
            return {
              isValid: false,
              error: NextResponse.json(
                { error: `Invalid ${paramName} format` },
                { status: 400 }
              )
            };
          }
        }

        // Validate if validator provided
        if (definition.validate && !definition.validate(value)) {
          return {
            isValid: false,
            error: NextResponse.json(
              { error: `Invalid ${paramName} value` },
              { status: 400 }
            )
          };
        }

        extractedParams[paramName] = value;
      } else if (definition.defaultValue !== undefined) {
        // Set default value if provided
        extractedParams[paramName] = definition.defaultValue;
      }
    }

    return {
      isValid: true,
      value: extractedParams,
    };
  }

  /**
   * Common validators
   */
  public static readonly validators = {
    isPositiveInteger: (value: number) => Number.isInteger(value) && value > 0,
    isNonNegativeInteger: (value: number) => Number.isInteger(value) && value >= 0,
    isString: (value: any) => typeof value === 'string',
    isNotEmpty: (value: string) => value.trim().length > 0,
    isAlphanumeric: (value: string) => /^[a-zA-Z0-9]+$/.test(value),
    isEmail: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  };

  /**
   * Common transformers
   */
  public static readonly transformers = {
    toInteger: (value: string) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) throw new Error('Not a valid integer');
      return num;
    },
    toFloat: (value: string) => {
      const num = parseFloat(value);
      if (isNaN(num)) throw new Error('Not a valid number');
      return num;
    },
    toString: (value: any) => String(value),
    toUpperCase: (value: string) => value.toUpperCase(),
    toLowerCase: (value: string) => value.toLowerCase(),
  };
} 