const { mockDb, MockFieldValue, clearStore } = require('./__mocks__/firestore');

jest.mock('../src/config/firebase', () => ({
  initializeFirebase: jest.fn(),
  getDb: jest.fn(() => mockDb),
}));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: MockFieldValue,
}));

afterEach(() => {
  clearStore();
});
