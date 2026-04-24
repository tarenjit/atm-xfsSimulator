/**
 * Smoke test — confirms the Jest runner is wired correctly. Phase 2 replaces
 * this with real device service specs.
 */
describe('xfs-server smoke', () => {
  it('runs jest with ts-jest', () => {
    expect(1 + 1).toBe(2);
  });

  it('can import shared types', async () => {
    const { XfsResult } = await import('@atm/xfs-core');
    expect(XfsResult.SUCCESS).toBe(0);
  });
});
