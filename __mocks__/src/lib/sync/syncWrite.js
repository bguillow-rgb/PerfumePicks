module.exports = {
  syncWrite: jest.fn(() => Promise.resolve({ ok: true })),
  syncDelete: jest.fn(() => Promise.resolve({ ok: true })),
};
