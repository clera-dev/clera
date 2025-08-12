import { SecureChatClientImpl } from '@/utils/api/secure-chat-client';

describe('SecureChatClient tool activity and agent transfer handling', () => {
  test('records tool start and completion events', () => {
    const client = new SecureChatClientImpl();

    // Start a tool
    (client as any).handleStreamChunk({
      type: 'tool_update',
      data: { toolName: 'web_search', status: 'start' }
    });

    let activities = client.state.toolActivities;
    expect(activities.length).toBe(1);
    expect(activities[0].toolName).toBe('web_search');
    expect(activities[0].status).toBe('running');

    // Complete the tool
    (client as any).handleStreamChunk({
      type: 'tool_update',
      data: { toolName: 'web_search', status: 'complete' }
    });

    activities = client.state.toolActivities;
    expect(activities.length).toBe(1);
    expect(activities[0].status).toBe('complete');
    expect(activities[0].completedAt).toBeDefined();
  });

  test('agent transfer updates status bubble', () => {
    const client = new SecureChatClientImpl();

    // Simulate agent transfer to financial analyst
    (client as any).handleStreamChunk({
      type: 'agent_transfer',
      data: { toAgent: 'financial_analyst_agent' }
    });

    const messages = client.state.messages;
    // Should have a status message reflecting agent status
    expect(messages.length).toBeGreaterThan(0);
    const statusMessages = messages.filter(m => (m as any).isStatus);
    expect(statusMessages.length).toBeGreaterThan(0);
    // Check content contains some expected phrase
    const hasExpected = statusMessages.some(m => typeof m.content === 'string' && (
      m.content.includes('Researching') || m.content.includes('researching')
    ));
    expect(hasExpected).toBe(true);
  });
});


