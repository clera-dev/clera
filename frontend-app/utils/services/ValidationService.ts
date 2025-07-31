/**
 * Service for handling input validation logic.
 * 
 * This service provides reusable validation functions for API routes,
 * ensuring consistent validation patterns and error handling.
 * 
 * SECURITY: This service implements strict validation that:
 * - Only treats null/undefined as "no value provided" for optional parameters
 * - Preserves valid falsy values (0, false, "") to prevent data loss
 * - Prevents silent dropping of legitimate user input
 * - Ensures consistent validation behavior across all parameters
 * 
 * Architecture: Business logic is separated from transport layer concerns.
 * Validation functions return typed results/errors, and API routes convert
 * them to HTTP responses.
 */

// Business logic error types
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface ValidationResult {
  isValid: boolean;
  error?: ValidationError;
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
   * 
   * Architecture: Returns typed validation results or throws business logic errors.
   * API routes are responsible for converting errors to HTTP responses.
   */
  public validateRequired(
    value: any, 
    paramName: string, 
    customMessage?: string
  ): ValidationResult {
    // Check for null/undefined first, then handle empty strings
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      return {
        isValid: false,
        error: new ValidationError(
          customMessage || `${paramName} is required`,
          400,
          paramName
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
   * 
   * Architecture: Returns typed validation results or throws business logic errors.
   * API routes are responsible for converting errors to HTTP responses.
   */
  public validateOptional<T>(
    value: any,
    paramName: string,
    transform: (value: any) => T,
    validator?: (value: T) => boolean
  ): ValidationResult {
    // SECURITY: For optional parameters, only null/undefined mean "no value provided"
    // This prevents valid falsy values (0, false, "") from being silently dropped
    if (value === undefined || value === null) {
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
          error: new ValidationError(
            `Invalid ${paramName} format`,
            400,
            paramName
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
        error: new ValidationError(
          `Invalid ${paramName} format`,
          400,
          paramName
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
              error: new ValidationError(
                `Invalid ${paramName} format`,
                400,
                paramName
              )
            };
          }
        }

        // Validate if validator provided
        if (definition.validate && !definition.validate(value)) {
          return {
            isValid: false,
            error: new ValidationError(
              `Invalid ${paramName} value`,
              400,
              paramName
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
      // SECURITY: Use strict integer validation to prevent trailing characters
      // parseInt allows trailing characters (e.g., "123abc" -> 123), which is a security risk
      const trimmedValue = value.trim();
      
      // Check if the string contains only digits (with optional leading minus sign)
      if (!/^-?\d+$/.test(trimmedValue)) {
        throw new Error('Not a valid integer');
      }
      
      const num = parseInt(trimmedValue, 10);
      if (isNaN(num)) throw new Error('Not a valid integer');
      return num;
    },
    toFloat: (value: string) => {
      // SECURITY: Use strict float validation to prevent trailing characters
      // parseFloat allows trailing characters (e.g., "123.45abc" -> 123.45), which is a security risk
      const trimmedValue = value.trim();
      
      // Check if the string contains only valid float characters
      // Allows: digits, one decimal point, optional leading minus sign
      if (!/^-?\d*\.?\d+$/.test(trimmedValue)) {
        throw new Error('Not a valid number');
      }
      
      const num = parseFloat(trimmedValue);
      if (isNaN(num)) throw new Error('Not a valid number');
      return num;
    },
    toString: (value: any) => String(value),
    toUpperCase: (value: string) => value.toUpperCase(),
    toLowerCase: (value: string) => value.toLowerCase(),
  };
} 