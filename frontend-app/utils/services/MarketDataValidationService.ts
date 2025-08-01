/**
 * Service for validating market data structures from external APIs.
 * 
 * This service provides reusable validation functions for market data API responses,
 * ensuring consistent validation patterns and error handling across the application.
 * 
 * SECURITY: This service implements strict validation that:
 * - Validates data structure before caching to prevent downstream crashes
 * - Ensures required fields are present and of correct types
 * - Provides detailed error messages for debugging
 * - Follows the same pattern as ValidationService for consistency
 * 
 * Architecture: Business logic is separated from transport layer concerns.
 * Validation functions return typed results/errors, and API routes convert
 * them to HTTP responses.
 */

import { ValidationError, ValidationResult } from './ValidationService';

export interface ChartDataValidationResult {
  isValid: boolean;
  error?: string;
  details?: string;
  dataPoints?: number;
}

export interface ChartDataPoint {
  date?: string;
  datetime?: string;
  timestamp?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  price?: number;
  volume?: number;
}

export class MarketDataValidationService {
  private static instance: MarketDataValidationService;

  private constructor() {}

  public static getInstance(): MarketDataValidationService {
    if (!MarketDataValidationService.instance) {
      MarketDataValidationService.instance = new MarketDataValidationService();
    }
    return MarketDataValidationService.instance;
  }

  /**
   * Validate FMP chart data structure
   * 
   * This function validates that the data from Financial Modeling Prep API
   * has the correct structure before caching or processing.
   */
  public validateFMPChartData(
    data: any, 
    symbol: string, 
    interval: string
  ): ChartDataValidationResult {
    // Check if data is an array
    if (!Array.isArray(data)) {
      console.error(`Invalid FMP response format for ${symbol} (${interval}): Expected array, got ${typeof data}`, data);
      
      // Check if it's an error response from FMP
      if (data && typeof data === 'object' && data.error) {
        return { 
          isValid: false, 
          error: `FMP API Error: ${data.error}`,
          details: 'The Financial Modeling Prep API returned an error response'
        };
      }
      
      return { 
        isValid: false, 
        error: 'Received unexpected data format from FMP.',
        details: 'Expected an array of chart data points'
      };
    }

    // Check if array is empty
    if (data.length === 0) {
      console.warn(`No chart data found for ${symbol} with interval ${interval}`);
      return { 
        isValid: false, 
        error: `No chart data found for symbol: ${symbol}`,
        details: `No data available for ${interval} interval`
      };
    }

    // Validate data structure of first item
    const firstDataPoint = data[0];
    if (!firstDataPoint || typeof firstDataPoint !== 'object') {
      console.error(`Invalid data structure from FMP for ${symbol}: First item is not an object`, firstDataPoint);
      return { 
        isValid: false, 
        error: 'Invalid data structure received from FMP',
        details: 'Chart data points must be objects'
      };
    }

    // Check for required timestamp field
    const hasTimestamp = firstDataPoint.date || firstDataPoint.datetime || firstDataPoint.timestamp;
    if (!hasTimestamp) {
      console.error(`Invalid data structure from FMP for ${symbol}: Missing timestamp field`, firstDataPoint);
      return { 
        isValid: false, 
        error: 'Invalid data structure received from FMP',
        details: 'Chart data points are missing required timestamp field (date/datetime/timestamp)'
      };
    }

    // Check for required price field
    const hasPrice = typeof firstDataPoint.close === 'number' || typeof firstDataPoint.price === 'number';
    if (!hasPrice) {
      console.error(`Invalid data structure from FMP for ${symbol}: Missing price field`, firstDataPoint);
      return { 
        isValid: false, 
        error: 'Invalid data structure received from FMP',
        details: 'Chart data points are missing required price field (close/price)'
      };
    }

    // Validate all data points have consistent structure (check first 5 items)
    for (let i = 0; i < Math.min(data.length, 5); i++) {
      const item = data[i];
      if (!item.date && !item.datetime && !item.timestamp) {
        console.error(`Invalid data structure from FMP for ${symbol}: Item ${i} missing timestamp`, item);
        return { 
          isValid: false, 
          error: 'Invalid data structure received from FMP',
          details: `Data point ${i} is missing required timestamp field`
        };
      }
    }

    return { 
      isValid: true,
      dataPoints: data.length
    };
  }

  /**
   * Validate that a data point has the required fields for processing
   */
  public validateChartDataPoint(
    dataPoint: any, 
    index: number = 0
  ): ValidationResult {
    if (!dataPoint || typeof dataPoint !== 'object') {
      return {
        isValid: false,
        error: new ValidationError(
          `Data point ${index} is not a valid object`,
          500
        )
      };
    }

    // Check for timestamp
    const hasTimestamp = dataPoint.date || dataPoint.datetime || dataPoint.timestamp;
    if (!hasTimestamp) {
      return {
        isValid: false,
        error: new ValidationError(
          `Data point ${index} is missing timestamp field`,
          500
        )
      };
    }

    // Check for price data
    const hasPrice = typeof dataPoint.close === 'number' || typeof dataPoint.price === 'number';
    if (!hasPrice) {
      return {
        isValid: false,
        error: new ValidationError(
          `Data point ${index} is missing price field`,
          500
        )
      };
    }

    return { isValid: true, value: dataPoint };
  }

  /**
   * Validate that an array of data points can be processed
   */
  public validateChartDataArray(
    data: any[]
  ): ValidationResult {
    if (!Array.isArray(data)) {
      return {
        isValid: false,
        error: new ValidationError(
          'Data must be an array',
          500
        )
      };
    }

    if (data.length === 0) {
      return {
        isValid: false,
        error: new ValidationError(
          'Data array is empty',
          500
        )
      };
    }

    // Validate first few data points
    for (let i = 0; i < Math.min(data.length, 3); i++) {
      const validation = this.validateChartDataPoint(data[i], i);
      if (!validation.isValid) {
        return validation;
      }
    }

    return { isValid: true, value: data };
  }

  /**
   * Common validators for market data
   */
  public static readonly validators = {
    isValidSymbol: (symbol: string) => /^[A-Z0-9\.\-\^]+$/i.test(symbol),
    isValidInterval: (interval: string) => ['5min', '15min', '30min', '1hour', '4hour', 'daily'].includes(interval),
    isPositiveNumber: (value: number) => typeof value === 'number' && value > 0,
    isNonNegativeNumber: (value: number) => typeof value === 'number' && value >= 0,
    isValidTimestamp: (timestamp: string) => {
      if (!timestamp || typeof timestamp !== 'string') return false;
      const date = new Date(timestamp);
      return !isNaN(date.getTime());
    }
  };
} 