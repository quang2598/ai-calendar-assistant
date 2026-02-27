const request = require('supertest');
const app = require('../../src/app');
const axios = require('axios');

jest.mock('axios', () => {
  const instance = {
    post: jest.fn(),
    get: jest.fn(),
  };
  return {
    create: jest.fn(() => instance),
    __instance: instance,
  };
});

const mockClient = axios.__instance;

describe('Agent API', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/agent/chat', () => {
    it('should forward chat request to agent server', async () => {
      mockClient.post.mockResolvedValue({
        data: { reply: 'I can help with that!' },
      });
      const res = await request(app)
        .post('/api/agent/chat')
        .send({ message: 'Schedule a meeting', sessionId: 's1', userId: 'u1' });
      expect(res.status).toBe(200);
      expect(res.body.reply).toBe('I can help with that!');
    });

    it('should return 400 without message', async () => {
      const res = await request(app).post('/api/agent/chat').send({});
      expect(res.status).toBe(400);
    });

    it('should return 502 when agent server is down', async () => {
      mockClient.post.mockRejectedValue(new Error('ECONNREFUSED'));
      const res = await request(app)
        .post('/api/agent/chat')
        .send({ message: 'Hello' });
      expect(res.status).toBe(502);
    });
  });

  describe('GET /api/agent/status', () => {
    it('should return agent server status', async () => {
      mockClient.get.mockResolvedValue({
        data: { status: 'ok', service: 'agent-server' },
      });
      const res = await request(app).get('/api/agent/status');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('should return 502 when agent server is down', async () => {
      mockClient.get.mockRejectedValue(new Error('ECONNREFUSED'));
      const res = await request(app).get('/api/agent/status');
      expect(res.status).toBe(502);
    });
  });
});
