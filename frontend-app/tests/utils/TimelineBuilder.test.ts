/**
 * Unit tests for TimelineBuilder
 * Tests timeline construction logic and statistics
 */

import { TimelineBuilder, createTimelineBuilder } from '@/utils/services/TimelineBuilder';
import { ToolActivity } from '@/types/chat';
import { ToolNameMapper } from '@/utils/services/ToolNameMapper';

describe('TimelineBuilder', () => {
  let builder: TimelineBuilder;
  let mockMapper: jest.Mocked<ToolNameMapper>;

  beforeEach(() => {
    mockMapper = {
      mapToolName: jest.fn(),
      shouldFilterTool: jest.fn()
    } as any;

    builder = new TimelineBuilder({
      toolMapper: mockMapper
    });
  });

  const createMockActivity = (
    id: string,
    runId: string,
    toolName: string,
    status: 'running' | 'complete' = 'complete',
    startedAt?: number
  ): ToolActivity => ({
    id,
    runId,
    toolName,
    status,
    startedAt: startedAt || Date.now() - Math.random() * 10000
  });

  describe('buildTimelineForRun', () => {
    beforeEach(() => {
      mockMapper.shouldFilterTool.mockReturnValue(false);
      mockMapper.mapToolName.mockImplementation((name) => `Mapped: ${name}`);
    });

    it('should build timeline for specific run', () => {
      const activities = [
        createMockActivity('1', 'run-1', 'web_search', 'complete', 1000),
        createMockActivity('2', 'run-1', 'get_portfolio', 'complete', 2000),
        createMockActivity('3', 'run-2', 'other_tool', 'complete', 3000)
      ];

      const timeline = builder.buildTimelineForRun(activities, 'run-1');

      expect(timeline).toHaveLength(3); // 2 activities + 1 done step
      expect(timeline[0].label).toBe('Mapped: web_search');
      expect(timeline[1].label).toBe('Mapped: get_portfolio');
      expect(timeline[2].label).toBe('Done');
      expect(timeline[2].isLast).toBe(true);
    });

    it('should sort activities chronologically', () => {
      const activities = [
        createMockActivity('1', 'run-1', 'second_tool', 'complete', 2000),
        createMockActivity('2', 'run-1', 'first_tool', 'complete', 1000),
        createMockActivity('3', 'run-1', 'third_tool', 'complete', 3000)
      ];

      const timeline = builder.buildTimelineForRun(activities, 'run-1');

      expect(timeline[0].label).toBe('Mapped: first_tool');
      expect(timeline[1].label).toBe('Mapped: second_tool');
      expect(timeline[2].label).toBe('Mapped: third_tool');
    });

    it('should filter out tools marked for filtering', () => {
      mockMapper.shouldFilterTool.mockImplementation((name) => name === 'transfer_tool');

      const activities = [
        createMockActivity('1', 'run-1', 'web_search', 'complete'),
        createMockActivity('2', 'run-1', 'transfer_tool', 'complete'),
        createMockActivity('3', 'run-1', 'get_portfolio', 'complete')
      ];

      const timeline = builder.buildTimelineForRun(activities, 'run-1');

      expect(timeline).toHaveLength(3); // 2 valid activities + done step
      expect(timeline.find(step => step.label.includes('transfer_tool'))).toBeUndefined();
    });

    it('should handle empty or invalid inputs', () => {
      expect(builder.buildTimelineForRun([], 'run-1')).toEqual([]);
      expect(builder.buildTimelineForRun([createMockActivity('1', 'run-1', 'test')], '')).toEqual([]);
      // @ts-ignore - testing runtime behavior
      expect(builder.buildTimelineForRun(null, 'run-1')).toEqual([]);
    });

    it('should not add done step when configured', () => {
      const builderNoDone = new TimelineBuilder({
        addDoneStep: false,
        toolMapper: mockMapper
      });

      const activities = [
        createMockActivity('1', 'run-1', 'web_search', 'complete')
      ];

      const timeline = builderNoDone.buildTimelineForRun(activities, 'run-1');

      expect(timeline).toHaveLength(1);
      expect(timeline[0].label).toBe('Mapped: web_search');
    });

    it('should not add done step if no activities are complete', () => {
      const activities = [
        createMockActivity('1', 'run-1', 'web_search', 'running')
      ];

      const timeline = builder.buildTimelineForRun(activities, 'run-1');

      expect(timeline).toHaveLength(1);
      expect(timeline.find(step => step.label === 'Done')).toBeUndefined();
    });

    it('should not add done step if some but not all activities are complete', () => {
      const activities = [
        createMockActivity('1', 'run-1', 'web_search', 'complete'),
        createMockActivity('2', 'run-1', 'get_portfolio', 'running')
      ];

      const timeline = builder.buildTimelineForRun(activities, 'run-1');

      expect(timeline).toHaveLength(2);
      expect(timeline.find(step => step.label === 'Done')).toBeUndefined();
    });

    it('should add done step only when all activities are complete', () => {
      const activities = [
        createMockActivity('1', 'run-1', 'web_search', 'complete'),
        createMockActivity('2', 'run-1', 'get_portfolio', 'complete')
      ];

      const timeline = builder.buildTimelineForRun(activities, 'run-1');

      expect(timeline).toHaveLength(3); // 2 activities + done step
      expect(timeline.find(step => step.label === 'Done')).toBeDefined();
    });

    it('should add done step when transfer_back_to_clera is complete (interrupt handling)', () => {
      const activities = [
        createMockActivity('1', 'run-1', 'web_search', 'running'), // Still running
        createMockActivity('2', 'run-1', 'transfer_back_to_clera', 'complete') // But transfer back is complete
      ];

      const timeline = builder.buildTimelineForRun(activities, 'run-1');

      expect(timeline.find(step => step.label === 'Done')).toBeDefined();
      // All steps should stop pulsing when Done is added
      const nonDoneSteps = timeline.filter(step => step.label !== 'Done');
      expect(nonDoneSteps.every(step => !step.isRunning)).toBe(true);
    });

    it('should respect minimum activities config', () => {
      const builderMinTwo = new TimelineBuilder({
        minimumActivities: 2,
        toolMapper: mockMapper
      });

      const oneActivity = [createMockActivity('1', 'run-1', 'web_search')];
      const twoActivities = [
        createMockActivity('1', 'run-1', 'web_search'),
        createMockActivity('2', 'run-1', 'get_portfolio')
      ];

      expect(builderMinTwo.buildTimelineForRun(oneActivity, 'run-1')).toEqual([]);
      expect(builderMinTwo.buildTimelineForRun(twoActivities, 'run-1').length).toBeGreaterThan(0);
    });
  });

  describe('buildTimelineFromAllActivities', () => {
    beforeEach(() => {
      mockMapper.shouldFilterTool.mockReturnValue(false);
      mockMapper.mapToolName.mockImplementation((name) => `Mapped: ${name}`);
    });

    it('should build timeline from all activities grouped by run', () => {
      const activities = [
        createMockActivity('1', 'run-1', 'web_search'),
        createMockActivity('2', 'run-2', 'get_portfolio'),
        createMockActivity('3', 'run-1', 'execute_trade')
      ];

      const timeline = builder.buildTimelineFromAllActivities(activities);

      // Should have steps from both runs
      expect(timeline.length).toBeGreaterThan(0);
      const labels = timeline.map(step => step.label);
      expect(labels).toContain('Mapped: web_search');
      expect(labels).toContain('Mapped: get_portfolio');
      expect(labels).toContain('Mapped: execute_trade');
    });

    it('should handle empty activities', () => {
      expect(builder.buildTimelineFromAllActivities([])).toEqual([]);
      // @ts-ignore - testing runtime behavior
      expect(builder.buildTimelineFromAllActivities(null)).toEqual([]);
    });
  });

  describe('getTimelineStats', () => {
    it('should calculate basic statistics', () => {
      const activities = [
        createMockActivity('1', 'run-1', 'web_search', 'complete'),
        createMockActivity('2', 'run-1', 'get_portfolio', 'running'),
        createMockActivity('3', 'run-1', 'web_search', 'complete') // duplicate tool
      ];

      const stats = builder.getTimelineStats(activities, 'run-1');

      expect(stats.totalActivities).toBe(3);
      expect(stats.completedActivities).toBe(2);
      expect(stats.runningActivities).toBe(1);
      expect(stats.uniqueTools).toBe(2); // web_search and get_portfolio
    });

    it('should calculate timespan when timestamps available', () => {
      const baseTime = Date.now();
      const activities = [
        createMockActivity('1', 'run-1', 'first', 'complete', baseTime),
        createMockActivity('2', 'run-1', 'second', 'complete', baseTime + 5000)
      ];

      const stats = builder.getTimelineStats(activities, 'run-1');

      expect(stats.timespan).toBe(5000);
    });

    it('should handle activities with insufficient timestamps for timespan', () => {
      // Single activity cannot have a timespan
      const activities = [
        { id: '1', runId: 'run-1', toolName: 'test', status: 'complete' as const, startedAt: Date.now() }
      ];

      const stats = builder.getTimelineStats(activities, 'run-1');

      expect(stats.timespan).toBeUndefined();
    });

    it('should filter by runId when provided', () => {
      const activities = [
        createMockActivity('1', 'run-1', 'tool1', 'complete'),
        createMockActivity('2', 'run-2', 'tool2', 'complete')
      ];

      const stats = builder.getTimelineStats(activities, 'run-1');

      expect(stats.totalActivities).toBe(1);
      expect(stats.completedActivities).toBe(1);
    });

    it('should process all activities when no runId provided', () => {
      const activities = [
        createMockActivity('1', 'run-1', 'tool1', 'complete'),
        createMockActivity('2', 'run-2', 'tool2', 'running')
      ];

      const stats = builder.getTimelineStats(activities);

      expect(stats.totalActivities).toBe(2);
      expect(stats.completedActivities).toBe(1);
      expect(stats.runningActivities).toBe(1);
    });
  });

  describe('configuration management', () => {
    it('should update configuration at runtime', () => {
      builder.updateConfig({ addDoneStep: false });
      const config = builder.getConfig();
      expect(config.addDoneStep).toBe(false);
    });

    it('should merge partial configurations', () => {
      const originalConfig = builder.getConfig();
      builder.updateConfig({ minimumActivities: 5 });
      const newConfig = builder.getConfig();
      
      expect(newConfig.minimumActivities).toBe(5);
      expect(newConfig.addDoneStep).toBe(originalConfig.addDoneStep); // Should remain unchanged
    });
  });

  describe('createTimelineBuilder', () => {
    it('should create an instance with default config', () => {
      const instance = createTimelineBuilder();
      expect(instance).toBeInstanceOf(TimelineBuilder);
    });

    it('should work with real tool mapper', () => {
      const instance = createTimelineBuilder();
      const activities = [
        createMockActivity('1', 'run-1', 'web_search', 'complete')
      ];

      const timeline = instance.buildTimelineForRun(activities, 'run-1');
      expect(Array.isArray(timeline)).toBe(true);
    });
  });
});
