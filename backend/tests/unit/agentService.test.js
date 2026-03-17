const axios = require('axios');
const agentService = require('../../src/services/agentService');

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

describe('agentService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('chat', () => {
    it('should forward chat payload and return data', async () => {
      mockClient.post.mockResolvedValue({ data: { reply: 'Hello!' } });
      const result = await agentService.chat({ message: 'Hi' });
      expect(result).toEqual({ reply: 'Hello!' });
      expect(mockClient.post).toHaveBeenCalledWith('/api/chat', { message: 'Hi' });
    });

    it('should throw ApiError with agent status on response error', async () => {
      mockClient.post.mockRejectedValue({
        response: { status: 422, data: { error: { message: 'Bad input' } } },
      });
      await expect(agentService.chat({ message: '' })).rejects.toMatchObject({
        statusCode: 422,
        message: 'Bad input',
      });
    });

    it('should throw 502 when agent is unreachable', async () => {
      mockClient.post.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(agentService.chat({ message: 'Hi' })).rejects.toMatchObject({
        statusCode: 502,
        message: 'Agent Server unavailable',
      });
    });
  });

  describe('getStatus', () => {
    it('should return agent health data', async () => {
      mockClient.get.mockResolvedValue({ data: { status: 'ok' } });
      const result = await agentService.getStatus();
      expect(result).toEqual({ status: 'ok' });
    });

    it('should throw 502 when agent is unreachable', async () => {
      mockClient.get.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(agentService.getStatus()).rejects.toMatchObject({
        statusCode: 502,
        message: 'Agent Server unavailable',
      });
    });
  });
});
