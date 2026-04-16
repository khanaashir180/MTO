#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const migrationsDir = path.resolve(__dirname, '..', 'db', 'migrations');

// Historical sprint collisions are documented so future duplicates fail loudly.
const KNOWN_LEGACY_DUPLICATE_PREFIXES = new Set(['069', '076', '078']);

function buildMigrationAudit() {
  const files = fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const invalidNames = files.filter((name) => !/^\d{3}_[a-z0-9_]+\.sql$/i.test(name));
  const byPrefix = files.reduce((acc, name) => {
    const prefix = name.slice(0, 3);
    if (!acc[prefix]) acc[prefix] = [];
    acc[prefix].push(name);
    return acc;
  }, {});

  const duplicatePrefixes = Object.entries(byPrefix)
    .filter(([, names]) => names.length > 1)
    .map(([prefix, names]) => ({ prefix, files: names }));

  const unknownDuplicatePrefixes = duplicatePrefixes
    .filter((entry) => !KNOWN_LEGACY_DUPLICATE_PREFIXES.has(entry.prefix));

  const duplicateFilenames = files.filter((name, index) => files.indexOf(name) !== index);
  const nonIdempotentCreateTable = files.filter((name) => {
    const sql = fs.readFileSync(path.join(migrationsDir, name), 'utf8');
    return /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i.test(sql);
  });

  return {
    migrationsDir,
    total: files.length,
    invalidNames,
    duplicatePrefixes,
    unknownDuplicatePrefixes,
    duplicateFilenames,
    nonIdempotentCreateTable,
  };
}

function assertMigrationAuditClean(audit = buildMigrationAudit()) {
  const failures = [];
  if (audit.invalidNames.length) {
    failures.push(`Invalid migration filenames: ${audit.invalidNames.join(', ')}`);
  }
  if (audit.duplicateFilenames.length) {
    failures.push(`Duplicate migration filenames: ${audit.duplicateFilenames.join(', ')}`);
  }
  if (audit.unknownDuplicatePrefixes.length) {
    const details = audit.unknownDuplicatePrefixes
      .map((entry) => `${entry.prefix}: ${entry.files.join(', ')}`)
      .join('; ');
    failures.push(`Unexpected duplicate migration prefixes: ${details}`);
  }
  if (audit.nonIdempotentCreateTable.length) {
    failures.push(`CREATE TABLE must use IF NOT EXISTS: ${audit.nonIdempotentCreateTable.join(', ')}`);
  }
  if (failures.length) {
    throw new Error(failures.join('\n'));
  }
  return audit;
}

if (require.main === module) {
  try {
    const audit = assertMigrationAuditClean();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      status: 'ok',
      total: audit.total,
      knownLegacyDuplicatePrefixes: audit.duplicatePrefixes,
    }, null, 2));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  KNOWN_LEGACY_DUPLICATE_PREFIXES,
  buildMigrationAudit,
  assertMigrationAuditClean,
};
