require('../setup');
const historyService = require('../../src/services/historyService');
const ConversationHistory = require('../../src/models/ConversationHistory');

describe('historyService', () => {
  const sampleConversation = {
    sessionId: 'session-1',
    userId: 'user-1',
    messages: [{ role: 'user', content: 'Hello' }],
    metadata: { source: 'web' },
  };

  describe('createConversation', () => {
    it('should create a new conversation', async () => {
      const result = await historyService.createConversation(sampleConversation);
      expect(result.sessionId).toBe('session-1');
      expect(result.userId).toBe('user-1');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
    });

    it('should create with empty messages by default', async () => {
      const result = await historyService.createConversation({
        sessionId: 'session-2',
        userId: 'user-1',
      });
      expect(result.messages).toHaveLength(0);
    });
  });

  describe('listConversations', () => {
    beforeEach(async () => {
      await ConversationHistory.create([
        { sessionId: 's1', userId: 'user-1', messages: [] },
        { sessionId: 's2', userId: 'user-1', messages: [] },
        { sessionId: 's3', userId: 'user-2', messages: [] },
      ]);
    });

    it('should list conversations for a user', async () => {
      const result = await historyService.listConversations('user-1');
      expect(result.conversations).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    it('should paginate results', async () => {
      const result = await historyService.listConversations('user-1', { page: 1, limit: 1 });
      expect(result.conversations).toHaveLength(1);
      expect(result.pagination.pages).toBe(2);
    });
  });

  describe('getConversation', () => {
    it('should return a conversation by id', async () => {
      const created = await ConversationHistory.create(sampleConversation);
      const result = await historyService.getConversation(created.id);
      expect(result.sessionId).toBe('session-1');
    });

    it('should throw 404 for non-existent id', async () => {
      await expect(historyService.getConversation('nonexistent-id')).rejects.toThrow(
        'Conversation not found'
      );
    });
  });

  describe('appendMessages', () => {
    it('should append messages atomically', async () => {
      const created = await ConversationHistory.create(sampleConversation);
      const result = await historyService.appendMessages(created.id, [
        { role: 'assistant', content: 'Hi there!' },
      ]);
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].content).toBe('Hi there!');
    });

    it('should throw 404 for non-existent id', async () => {
      await expect(
        historyService.appendMessages('nonexistent-id', [{ role: 'user', content: 'test' }])
      ).rejects.toThrow('Conversation not found');
    });
  });

  describe('deleteConversation', () => {
    it('should delete a conversation', async () => {
      const created = await ConversationHistory.create(sampleConversation);
      await historyService.deleteConversation(created.id);
      const count = await ConversationHistory.countDocuments();
      expect(count).toBe(0);
    });

    it('should throw 404 for non-existent id', async () => {
      await expect(historyService.deleteConversation('nonexistent-id')).rejects.toThrow(
        'Conversation not found'
      );
    });
  });
});
