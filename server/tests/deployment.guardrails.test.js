const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

describe('deployment and route guardrails', () => {
  test('Railway deploy uses explicit backend Dockerfile', () => {
    const railway = JSON.parse(readRepoFile('railway.json'));
    const dockerfile = readRepoFile('Dockerfile.railway');

    expect(railway.build.builder).toBe('DOCKERFILE');
    expect(railway.build.dockerfilePath).toBe('Dockerfile.railway');
    expect(railway.deploy.healthcheckPath).toBe('/health');
    expect(dockerfile).toContain('COPY server/package*.json ./');
    expect(dockerfile).toContain('npm run migrate && npm run start');
  });

  test('Vercel deploy remains frontend-only and points SPA routes to index.html', () => {
    const vercel = JSON.parse(readRepoFile('vercel.json'));

    expect(vercel.framework).toBe('vite');
    expect(vercel.outputDirectory).toBe('dist');
    expect(vercel.experimentalServices).toBeUndefined();
    expect(vercel.rewrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ destination: '/index.html' }),
      ])
    );
  });

  test('finance and CRM routes do not regress to route-level role-only gates', () => {
    const financeRoutes = readRepoFile('server/src/routes/financeRoutes.js');
    const crmRoutes = readRepoFile('server/src/routes/crmRoutes.js');

    expect(financeRoutes).not.toContain('requireRoles(');
    expect(crmRoutes).not.toContain('requireRoles(');
    expect(financeRoutes).toContain('requireRoleOrPermission');
    expect(crmRoutes).toContain('requireRoleOrPermission');
  });

  test('order routes are permission-gated for branch operations', () => {
    const orderRoutes = readRepoFile('server/src/routes/orderRoutes.js');

    expect(orderRoutes).toContain("requirePermission('retail_create_order')");
    expect(orderRoutes).toContain("requirePermission('retail_view_dashboard')");
    expect(orderRoutes).toContain("requireAnyPermission('retail_manage_replacements'");
    expect(orderRoutes).not.toContain('requireRoles(');
  });
});
