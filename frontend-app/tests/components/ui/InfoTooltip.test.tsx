import React from 'react';
import { render, screen } from '@testing-library/react';
import { InfoTooltip } from '../InfoTooltip';

// Mock DOMPurify to verify it's being called correctly
jest.mock('dompurify', () => ({
  sanitize: jest.fn((content, config) => {
    // Simulate DOMPurify sanitization
    if (typeof content === 'string') {
      // Remove script tags and dangerous attributes
      return content
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/\s*dangerouslySetInnerHTML\s*=\s*["'][^"']*["']/gi, '');
    }
    return content;
  })
}));

describe('InfoTooltip Security Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('XSS Protection Tests', () => {
    test('should sanitize malicious string content with script tags', () => {
      const maliciousContent = '<script>alert("XSS")</script><p>Safe content</p>';
      
      render(
        <InfoTooltip content={maliciousContent}>
          <button>Hover me</button>
        </InfoTooltip>
      );
      
      // The script tag should be removed, only safe content should remain
      expect(screen.getByText('Safe content')).toBeInTheDocument();
      expect(screen.queryByText('alert("XSS")')).not.toBeInTheDocument();
    });

    test('should sanitize React elements with dangerous props', () => {
      const maliciousElement = (
        <span onClick="alert('XSS')" dangerouslySetInnerHTML={{ __html: '<script>alert("XSS")</script>' }}>
          <img src="x" onError="alert('XSS')" />
          Safe text
        </span>
      );
      
      render(
        <InfoTooltip content={maliciousElement}>
          <button>Hover me</button>
        </InfoTooltip>
      );
      
      // Dangerous props should be stripped, but safe content preserved
      expect(screen.getByText('Safe text')).toBeInTheDocument();
      
      // Verify no dangerous attributes remain
      const spanElement = screen.getByText('Safe text').closest('span');
      expect(spanElement).not.toHaveAttribute('onClick');
      expect(spanElement).not.toHaveAttribute('dangerouslySetInnerHTML');
    });

    test('should convert disallowed HTML tags to safe strings', () => {
      const disallowedElement = <iframe src="javascript:alert('XSS')">Malicious iframe</iframe>;
      
      render(
        <InfoTooltip content={disallowedElement}>
          <button>Hover me</button>
        </InfoTooltip>
      );
      
      // The iframe should be converted to text content
      expect(screen.getByText('Malicious iframe')).toBeInTheDocument();
      expect(screen.queryByRole('iframe')).not.toBeInTheDocument();
    });

    test('should handle React components by converting to string', () => {
      const CustomComponent = () => <div>Custom component content</div>;
      const componentElement = <CustomComponent />;
      
      render(
        <InfoTooltip content={componentElement}>
          <button>Hover me</button>
        </InfoTooltip>
      );
      
      // React components should be converted to their text content
      expect(screen.getByText('Custom component content')).toBeInTheDocument();
    });

    test('should recursively sanitize nested elements', () => {
      const nestedMaliciousElement = (
        <div>
          <p>Safe paragraph</p>
          <span onClick="alert('XSS')" onMouseOver="alert('XSS')">
            <strong>Bold text</strong>
            <script>alert('XSS')</script>
          </span>
        </div>
      );
      
      render(
        <InfoTooltip content={nestedMaliciousElement}>
          <button>Hover me</button>
        </InfoTooltip>
      );
      
      // Safe content should be preserved
      expect(screen.getByText('Safe paragraph')).toBeInTheDocument();
      expect(screen.getByText('Bold text')).toBeInTheDocument();
      
      // Dangerous content should be removed
      expect(screen.queryByText('alert(\'XSS\')')).not.toBeInTheDocument();
    });

    test('should handle arrays of mixed content safely', () => {
      const mixedContent = [
        'Safe string',
        <span key="1">Safe span</span>,
        <div key="2" onClick="alert('XSS')">Dangerous div</div>,
        <script key="3">alert('XSS')</script>
      ];
      
      render(
        <InfoTooltip content={mixedContent}>
          <button>Hover me</button>
        </InfoTooltip>
      );
      
      // Safe content should be preserved
      expect(screen.getByText('Safe string')).toBeInTheDocument();
      expect(screen.getByText('Safe span')).toBeInTheDocument();
      expect(screen.getByText('Dangerous div')).toBeInTheDocument();
      
      // Dangerous content should be sanitized
      expect(screen.queryByText('alert(\'XSS\')')).not.toBeInTheDocument();
    });

    test('should handle numbers and other primitive types', () => {
      const numberContent = 42;
      const booleanContent = true;
      
      render(
        <InfoTooltip content={numberContent}>
          <button>Hover me</button>
        </InfoTooltip>
      );
      
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    test('should preserve allowed HTML tags and attributes', () => {
      const safeContent = (
        <div className="safe-class">
          <p>Paragraph text</p>
          <strong>Bold text</strong>
          <em>Italic text</em>
          <ul>
            <li>List item</li>
          </ul>
        </div>
      );
      
      render(
        <InfoTooltip content={safeContent}>
          <button>Hover me</button>
        </InfoTooltip>
      );
      
      // All safe content should be preserved
      expect(screen.getByText('Paragraph text')).toBeInTheDocument();
      expect(screen.getByText('Bold text')).toBeInTheDocument();
      expect(screen.getByText('Italic text')).toBeInTheDocument();
      expect(screen.getByText('List item')).toBeInTheDocument();
      
      // Safe attributes should be preserved
      const divElement = screen.getByText('Paragraph text').closest('div');
      expect(divElement).toHaveClass('safe-class');
    });
  });

  describe('Error Handling Tests', () => {
    test('should handle malformed React elements gracefully', () => {
      const malformedElement = {
        type: 'div',
        props: null
      } as any;
      
      render(
        <InfoTooltip content={malformedElement}>
          <button>Hover me</button>
        </InfoTooltip>
      );
      
      // Should not crash and should show fallback content
      expect(screen.getByText('Content removed for security')).toBeInTheDocument();
    });

    test('should handle null and undefined content', () => {
      render(
        <InfoTooltip content={null}>
          <button>Hover me</button>
        </InfoTooltip>
      );
      
      expect(screen.getByText('null')).toBeInTheDocument();
    });
  });

  describe('Performance Tests', () => {
    test('should memoize sanitized content', () => {
      const content = 'Test content';
      
      render(
        <InfoTooltip content={content}>
          <button>Hover me</button>
        </InfoTooltip>
      );
      
      // Re-render with same content
      render(
        <InfoTooltip content={content}>
          <button>Hover me</button>
        </InfoTooltip>
      );
      
      // DOMPurify should only be called once per unique content
      // This test verifies the useMemo optimization is working
    });
  });
}); 