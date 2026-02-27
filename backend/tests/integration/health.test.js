require('../setup');
const request = require('supertest');
const axios = require('axios');
const app = require('../../src/app');

jest.mock('axios');

describe('GET /api/health', () => {
  it('should return 200 with service status including agent field', async () => {
    axios.get.mockResolvedValue({ status: 200, data: { status: 'healthy' } });

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('general-request-service');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('firestore');
    expect(res.body).toHaveProperty('agent');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('should report agent as connected when agent server responds 200', async () => {
    axios.get.mockResolvedValue({ status: 200, data: { status: 'healthy' } });

    const res = await request(app).get('/api/health');
    expect(res.body.agent).toBe('connected');
  });

  it('should report agent as disconnected when agent server is unreachable', async () => {
    axios.get.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(app).get('/api/health');
    expect(res.body.agent).toBe('disconnected');
  });
});
