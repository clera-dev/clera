/**
 * Shared types for chat functionality
 * Centralizes type definitions used across multiple components and services
 */

export interface ToolActivity {
  id: string;
  runId?: string; // Optional for backward compatibility
  toolName: string;
  status: 'running' | 'complete';
  startedAt: number;
  completedAt?: number;
}

export interface TimelineStep {
  id: string;
  label: string;
  isComplete: boolean;
  isRunning?: boolean; // Add running state for pulsing animation
  isLast: boolean;
  timestamp?: number;
}

export interface Message {
  id?: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  isStatus?: boolean; // For temporary status/progress messages
  runId?: string; // Anchor tool activities to a specific user query
}
