const {
  KNOWN_LEGACY_DUPLICATE_PREFIXES,
  assertMigrationAuditClean,
  buildMigrationAudit,
} = require('../scripts/audit-migrations');

describe('migration audit guardrails', () => {
  test('migration filenames and CREATE TABLE statements remain deployment-safe', () => {
    const audit = assertMigrationAuditClean();

    expect(audit.total).toBeGreaterThan(0);
    expect(audit.invalidNames).toHaveLength(0);
    expect(audit.duplicateFilenames).toHaveLength(0);
    expect(audit.unknownDuplicatePrefixes).toHaveLength(0);
    expect(audit.nonIdempotentCreateTable).toHaveLength(0);
  });

  test('historical duplicate migration prefixes are explicitly documented', () => {
    const audit = buildMigrationAudit();
    const duplicatePrefixes = audit.duplicatePrefixes.map((entry) => entry.prefix);

    expect(duplicatePrefixes).toEqual(
      expect.arrayContaining([...KNOWN_LEGACY_DUPLICATE_PREFIXES])
    );
    duplicatePrefixes.forEach((prefix) => {
      expect(KNOWN_LEGACY_DUPLICATE_PREFIXES.has(prefix)).toBe(true);
    });
  });
});
