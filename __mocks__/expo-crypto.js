let counter = 0;

module.exports = {
  randomUUID: jest.fn(() => `test-uuid-${++counter}`),
  __resetCounter: () => { counter = 0; },
};
