require('../setup');
const request = require('supertest');
const app = require('../../src/app');
const ConversationHistory = require('../../src/models/ConversationHistory');

describe('History API', () => {
  const samplePayload = {
    sessionId: 'session-1',
    userId: 'user-1',
    messages: [{ role: 'user', content: 'Hello' }],
    metadata: { source: 'web' },
  };

  describe('POST /api/history', () => {
    it('should create a new conversation', async () => {
      const res = await request(app).post('/api/history').send(samplePayload);
      expect(res.status).toBe(201);
      expect(res.body.sessionId).toBe('session-1');
      expect(res.body.userId).toBe('user-1');
      expect(res.body.messages).toHaveLength(1);
    });

    it('should return 400 if sessionId is missing', async () => {
      const res = await request(app).post('/api/history').send({ userId: 'user-1' });
      expect(res.status).toBe(400);
    });

    it('should return 400 if userId is missing', async () => {
      const res = await request(app).post('/api/history').send({ sessionId: 'session-1' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/history', () => {
    beforeEach(async () => {
      await ConversationHistory.create([
        { sessionId: 's1', userId: 'user-1', messages: [] },
        { sessionId: 's2', userId: 'user-1', messages: [] },
        { sessionId: 's3', userId: 'user-2', messages: [] },
      ]);
    });

    it('should list conversations for a user', async () => {
      const res = await request(app).get('/api/history?userId=user-1');
      expect(res.status).toBe(200);
      expect(res.body.conversations).toHaveLength(2);
      expect(res.body.pagination.total).toBe(2);
    });

    it('should return 400 without userId', async () => {
      const res = await request(app).get('/api/history');
      expect(res.status).toBe(400);
    });

    it('should support pagination', async () => {
      const res = await request(app).get('/api/history?userId=user-1&page=1&limit=1');
      expect(res.status).toBe(200);
      expect(res.body.conversations).toHaveLength(1);
      expect(res.body.pagination.pages).toBe(2);
    });
  });

  describe('GET /api/history/:id', () => {
    it('should return a single conversation', async () => {
      const conv = await ConversationHistory.create(samplePayload);
      const res = await request(app).get(`/api/history/${conv.id}`);
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe('session-1');
    });

    it('should return 404 for non-existent id', async () => {
      const res = await request(app).get('/api/history/nonexistent-id');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/history/:id', () => {
    it('should append messages to a conversation', async () => {
      const conv = await ConversationHistory.create(samplePayload);
      const res = await request(app)
        .put(`/api/history/${conv.id}`)
        .send({ messages: [{ role: 'assistant', content: 'Hi there!' }] });
      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.messages[1].content).toBe('Hi there!');
    });

    it('should return 400 with empty messages', async () => {
      const conv = await ConversationHistory.create(samplePayload);
      const res = await request(app).put(`/api/history/${conv.id}`).send({ messages: [] });
      expect(res.status).toBe(400);
    });

    it('should return 400 without messages field', async () => {
      const conv = await ConversationHistory.create(samplePayload);
      const res = await request(app).put(`/api/history/${conv.id}`).send({});
      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent id', async () => {
      const res = await request(app)
        .put('/api/history/nonexistent-id')
        .send({ messages: [{ role: 'user', content: 'test' }] });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/history/:id', () => {
    it('should delete a conversation', async () => {
      const conv = await ConversationHistory.create(samplePayload);
      const res = await request(app).delete(`/api/history/${conv.id}`);
      expect(res.status).toBe(204);
      const count = await ConversationHistory.countDocuments();
      expect(count).toBe(0);
    });

    it('should return 404 for non-existent id', async () => {
      const res = await request(app).delete('/api/history/nonexistent-id');
      expect(res.status).toBe(404);
    });
  });
});
