import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import './index.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OutletsProvider } from './context/OutletsContext';
import { useSocket } from './hooks/useSocket';

const LoginView = lazy(() => import('./components/LoginView'));
const OrderForm = lazy(() => import('./components/OrderForm'));
const RetailDashboard = lazy(() => import('./components/RetailDashboard'));
const ProductionDashboard = lazy(() => import('./components/ProductionDashboard'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const VerificationConsole = lazy(() => import('./components/VerificationConsole'));
const StageDetailPage = lazy(() => import('./components/StageDetailPage'));
const SalesReportPage = lazy(() => import('./components/SalesReportPage'));
const FinancePage = lazy(() => import('./components/FinancePage'));
const CRMPage = lazy(() => import('./components/CRMPage'));
const TrialBalancePage = lazy(() => import('./components/TrialBalancePage'));
const StoreDeliveryDashboard = lazy(() => import('./components/StoreDeliveryDashboard'));
const RetailHeadOutletPage = lazy(() => import('./components/RetailHeadOutletPage'));
const MRPPage = lazy(() => import('./components/MRPPage'));
const RawMaterialStorePage = lazy(() => import('./components/RawMaterialStorePage'));
const RawStoreReportsPage = lazy(() => import('./components/RawStoreReportsPage'));
const RawStoreSettingsPage = lazy(() => import('./components/RawStoreSettingsPage'));
const RawStoreRoutingPage = lazy(() => import('./components/RawStoreRoutingPage'));
const RawStoreScannerPage = lazy(() => import('./components/RawStoreScannerPage'));
const AcceptInvitePage = lazy(() => import('./components/AcceptInvitePage'));
const ConfirmEmailChangePage = lazy(() => import('./components/ConfirmEmailChangePage'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const SuperAdminConsolePage = lazy(() => import('./components/SuperAdminConsolePage'));
const ExecutiveKPIDashboard = lazy(() => import('./components/ExecutiveKPIDashboard'));
const PlatformOpsPage = lazy(() => import('./components/PlatformOpsPage'));

function WorkspaceFallback({ title = 'Loading workspace...' }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <p>Please wait while this module loads.</p>
    </section>
  );
}

function renderDeferred(node, title) {
  return (
    <Suspense fallback={<WorkspaceFallback title={title} />}>
      {node}
    </Suspense>
  );
}

function AppShell() {
  const { isAuthenticated, user, logout } = useAuth();
  const retailRoles = ['RETAIL', 'RETAIL_STAFF', 'SHOP_MANAGER', 'RETAIL_HEAD', 'SUPER_USER'];
  const shopManagerRoles = ['RETAIL', 'RETAIL_STAFF', 'SHOP_MANAGER', 'SUPER_USER'];
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [newOrderType, setNewOrderType] = useState('MTO');
  const [activeView, setActiveView] = useState('dashboard');
  const socket = useSocket(isAuthenticated);
  const pageMode = useMemo(() => new URLSearchParams(window.location.search).get('page') || '', []);
  const stagePageName = useMemo(() => new URLSearchParams(window.location.search).get('stage') || '', []);
  const retailHeadWorkspace = useMemo(() => new URLSearchParams(window.location.search).get('workspace') || '', []);
  const retailHeadOutlet = useMemo(() => new URLSearchParams(window.location.search).get('outlet') || '', []);
  const crmModuleName = useMemo(() => new URLSearchParams(window.location.search).get('module') || '', []);
  const productionWorkspaceMap = {
    production: 'overview',
    'production-overview': 'overview',
    'production-performance': 'performance',
    'production-aging': 'aging',
    'production-stages': 'stages',
  };
  const productionWorkspace = productionWorkspaceMap[pageMode] || '';

  useEffect(() => {
    function openDatePicker(event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== 'date') return;
      if (typeof target.showPicker !== 'function') return;
      try {
        target.showPicker();
      } catch (_) {
        // Ignore errors caused by browser picker restrictions.
      }
    }

    document.addEventListener('focusin', openDatePicker);
    document.addEventListener('click', openDatePicker);
    return () => {
      document.removeEventListener('focusin', openDatePicker);
      document.removeEventListener('click', openDatePicker);
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    const refresh = () => setRefreshSignal((v) => v + 1);
    socket.on('stage:updated', refresh);
    socket.on('order:created', refresh);

    return () => {
      socket.off('stage:updated', refresh);
      socket.off('order:created', refresh);
    };
  }, [socket]);

  const permissions = user?.permissions || {};
  const hasRight = (key, fallback) => {
    if (Object.prototype.hasOwnProperty.call(permissions, key)) {
      return Boolean(permissions[key]);
    }
    return fallback;
  };

  const canRetail = hasRight('retail_view_dashboard', retailRoles.includes(user?.role));
  const isProductionRole = ['PRODUCTION_SUPERVISOR', 'PRODUCTION_MANAGER', 'SUPER_USER'].includes(user?.role);
  const canProduction = isProductionRole || hasRight('production_view_dashboard', false);
  const canSettings = hasRight('admin_access', user?.role === 'SUPER_USER');
  const canCreateOrder = hasRight('retail_create_order', shopManagerRoles.includes(user?.role));
  const canFinance = !['RETAIL', 'RETAIL_STAFF'].includes(user?.role)
    && hasRight('finance_view_module', user?.role === 'FINANCE' || user?.role === 'SUPER_USER');
  const canMrp = hasRight('mrp_view_module', canProduction || user?.role === 'FINANCE' || user?.role === 'SUPER_USER');
  const canRawStore = hasRight('raw_store_view_module', canMrp || shopManagerRoles.includes(user?.role));
  const isCustomerService = user?.role === 'CUSTOMER_SERVICE';
  const canCrm = !['RETAIL', 'RETAIL_STAFF', 'SHOP_MANAGER', 'RETAIL_HEAD'].includes(user?.role)
    && hasRight('crm_view_module', isCustomerService || user?.role === 'FINANCE' || user?.role === 'SUPER_USER');
  const canExecutiveKpi = hasRight(
    'executive_view_dashboard',
    ['SUPER_USER', 'PRODUCTION_MANAGER', 'FINANCE', 'RETAIL_HEAD'].includes(user?.role)
  );
  const canPlatformOps = ['SUPER_USER', 'PRODUCTION_MANAGER'].includes(user?.role);
  const showTopNav = useMemo(() => Boolean(user), [user]);

  if (!isAuthenticated) {
    if (pageMode === 'accept-invite') return renderDeferred(<AcceptInvitePage />, 'Loading invite...');
    if (pageMode === 'confirm-email-change') return renderDeferred(<ConfirmEmailChangePage />, 'Loading confirmation...');
    return renderDeferred(<LoginView />, 'Loading sign in...');
  }

  if (pageMode === 'profile') {
    return renderDeferred(<ProfilePage />, 'Loading profile...');
  }

  if (pageMode === 'admin') {
    if (!canSettings) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Admin console is not enabled for your account.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Super Admin Console</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<SuperAdminConsolePage />, 'Loading admin console...')}
      </main>
    );
  }

  if (pageMode === 'verification') {
    const canOpenVerification = hasRight(
      'production_run_verification',
      ['PRODUCTION_MANAGER', 'SUPER_USER'].includes(user?.role)
      || (user?.role === 'PRODUCTION_SUPERVISOR' && user?.stage_name === 'Verification')
    );
    if (!canOpenVerification) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Verification page is available only for Verification Supervisor or Production Manager.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Verification Console</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<VerificationConsole refreshSignal={refreshSignal} />, 'Loading verification...')}
      </main>
    );
  }

  if (pageMode === 'stage') {
    const canOpenStagePage = hasRight(
      'production_view_stage_detail',
      ['PRODUCTION_SUPERVISOR', 'PRODUCTION_MANAGER', 'SUPER_USER'].includes(user?.role)
    );
    if (!canOpenStagePage) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Stage detail page is available only for production roles.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Stage Detail</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<StageDetailPage stageName={stagePageName} refreshSignal={refreshSignal} />, 'Loading stage detail...')}
      </main>
    );
  }

  if (productionWorkspace) {
    if (!canProduction) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Production dashboard is not enabled for your role.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Production Module</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(
          <ProductionDashboard refreshSignal={refreshSignal} user={user} lockedWorkspace={productionWorkspace} />,
          'Loading production...'
        )}
      </main>
    );
  }

  if (pageMode === 'sales-report') {
    if (!canRetail) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Sales report is available only for retail users.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Sale Report</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<SalesReportPage refreshSignal={refreshSignal} />, 'Loading sales report...')}
      </main>
    );
  }

  if (pageMode === 'executive-kpi') {
    if (!canExecutiveKpi) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Executive KPI dashboard is not enabled for your role.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Executive KPI Dashboard</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<ExecutiveKPIDashboard refreshSignal={refreshSignal} />, 'Loading executive KPI...')}
      </main>
    );
  }

  if (pageMode === 'platform-ops') {
    if (!canPlatformOps) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Platform Ops workspace is available only for super users and production managers.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Platform Ops</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<PlatformOpsPage />, 'Loading platform ops...')}
      </main>
    );
  }

  if (pageMode === 'retail-head') {
    if (!canRetail || !['RETAIL_HEAD', 'SUPER_USER'].includes(user?.role)) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Retail head workspace is available only for Retail Head users.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Retail Head</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(
          <RetailDashboard
            refreshSignal={refreshSignal}
            lockedHeadWorkspace={retailHeadWorkspace || 'overview'}
            lockedOutletName={retailHeadOutlet}
          />,
          'Loading retail head workspace...'
        )}
      </main>
    );
  }

  if (pageMode === 'retail-head-outlet') {
    if (!canRetail || !['RETAIL_HEAD', 'SUPER_USER'].includes(user?.role)) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Retail head outlet drilldown is available only for Retail Head users.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Retail Head Outlet</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<RetailHeadOutletPage outletName={retailHeadOutlet} />, 'Loading outlet drilldown...')}
      </main>
    );
  }

  if (pageMode === 'store-delivery') {
    if (!canRetail) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Store delivery dashboard is available only for retail users.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>MTO Received From Factory</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<StoreDeliveryDashboard refreshSignal={refreshSignal} />, 'Loading store delivery...')}
      </main>
    );
  }

  if (pageMode === 'finance') {
    if (!canFinance) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Finance module is not enabled for your role.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Finance Module</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<FinancePage refreshSignal={refreshSignal} />, 'Loading finance...')}
      </main>
    );
  }

  if (pageMode === 'crm') {
    if (!canCrm) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>CRM module is not enabled for your role.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>CRM Module</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<CRMPage refreshSignal={refreshSignal} lockedWorkspace={crmModuleName} />, 'Loading CRM...')}
      </main>
    );
  }

  if (pageMode === 'mrp') {
    if (!canMrp) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>MRP module is not enabled for your role.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>MRP Module</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<MRPPage refreshSignal={refreshSignal} />, 'Loading MRP...')}
      </main>
    );
  }

  if (pageMode === 'raw-store') {
    if (!canRawStore) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Raw Material Store is not enabled for your role.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Raw Material Store</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<RawMaterialStorePage refreshSignal={refreshSignal} />, 'Loading raw store...')}
      </main>
    );
  }

  if (pageMode === 'raw-store-reports') {
    if (!canRawStore) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Raw Store Reports are not enabled for your role.</p>
          </section>
        </main>
      );
    }
    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Raw Store Reports</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<RawStoreReportsPage refreshSignal={refreshSignal} />, 'Loading raw store reports...')}
      </main>
    );
  }

  if (pageMode === 'raw-store-settings') {
    if (!canRawStore) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Raw Store Settings are not enabled for your role.</p>
          </section>
        </main>
      );
    }
    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Raw Store Settings</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<RawStoreSettingsPage refreshSignal={refreshSignal} />, 'Loading raw store settings...')}
      </main>
    );
  }

  if (pageMode === 'raw-store-routing') {
    if (!canRawStore) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Raw Store Routing is not enabled for your role.</p>
          </section>
        </main>
      );
    }
    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Raw Store Routing</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<RawStoreRoutingPage refreshSignal={refreshSignal} />, 'Loading raw store routing...')}
      </main>
    );
  }

  if (pageMode === 'raw-store-scanner') {
    if (!canRawStore) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Raw Store Scanner is not enabled for your role.</p>
          </section>
        </main>
      );
    }
    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Raw Store Scanner</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<RawStoreScannerPage refreshSignal={refreshSignal} />, 'Loading raw store scanner...')}
      </main>
    );
  }

  if (pageMode === 'trial-balance') {
    if (!canFinance) {
      return (
        <main className="app-shell">
          <header className="app-header">
            <div>
              <h1>MTO Production + Retail System</h1>
              <p>{user.full_name} ({user.role})</p>
            </div>
            <div className="actions-cell">
              <button onClick={logout}>Logout</button>
            </div>
          </header>
          <section className="card">
            <h2>Access Denied</h2>
            <p>Trial balance is available only for finance-enabled users.</p>
          </section>
        </main>
      );
    }

    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Trial Balance</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={() => window.close()} className="button-secondary">Close Tab</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<TrialBalancePage refreshSignal={refreshSignal} />, 'Loading trial balance...')}
      </main>
    );
  }

  if (canFinance && !canRetail && !canProduction && !canSettings) {
    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>Finance Module</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<FinancePage refreshSignal={refreshSignal} />, 'Loading finance...')}
      </main>
    );
  }

  if (canCrm && !canRetail && !canProduction && !canSettings && !canFinance) {
    return (
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>CRM Module</h1>
            <p>{user.full_name} ({user.role})</p>
          </div>
          <div className="actions-cell">
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        {renderDeferred(<CRMPage refreshSignal={refreshSignal} />, 'Loading CRM...')}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>MTO Production + Retail System</h1>
          <p>{user.full_name} ({user.role})</p>
        </div>
        <div className="actions-cell">
          {showTopNav && (
            <>
              {canSettings && (
                <>
                  <button
                    className={activeView === 'dashboard' ? '' : 'button-secondary'}
                    onClick={() => setActiveView('dashboard')}
                  >
                    Dashboard
                  </button>
                  <button
                    className={activeView === 'settings' ? '' : 'button-secondary'}
                    onClick={() => setActiveView('settings')}
                  >
                    Settings
                  </button>
                  {canSettings && (
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => window.open(`${window.location.origin}?page=admin`, '_blank', 'noopener,noreferrer')}
                    >
                      Admin
                    </button>
                  )}
                </>
              )}
              {canMrp && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => window.open(`${window.location.origin}?page=mrp`, '_blank', 'noopener,noreferrer')}
                >
                  MRP
                </button>
              )}
              {canProduction && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => window.open(`${window.location.origin}?page=production-overview`, '_blank', 'noopener,noreferrer')}
                >
                  Production
                </button>
              )}
              {canExecutiveKpi && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => window.open(`${window.location.origin}?page=executive-kpi`, '_blank', 'noopener,noreferrer')}
                >
                  Executive KPI
                </button>
              )}
              {canRawStore && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => window.open(`${window.location.origin}?page=raw-store`, '_blank', 'noopener,noreferrer')}
                >
                  Raw Store
                </button>
              )}
              {canPlatformOps && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => window.open(`${window.location.origin}?page=platform-ops`, '_blank', 'noopener,noreferrer')}
                >
                  Platform Ops
                </button>
              )}
            </>
          )}
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      {canRetail && activeView === 'dashboard' && (
        <>
          <div className="card toolbar-row">
            {canCreateOrder && (
              <>
                <button onClick={() => { setNewOrderType('MTO'); setShowOrderForm(true); }}>New MTO</button>
                <button onClick={() => { setNewOrderType('REFURBISHMENT'); setShowOrderForm(true); }}>New Refurbishment</button>
                <button onClick={() => { setNewOrderType('RETURN'); setShowOrderForm(true); }}>New Return</button>
              </>
            )}
            <button
              type="button"
              className="button-secondary"
              onClick={() => window.open(`${window.location.origin}?page=sales-report`, '_blank', 'noopener,noreferrer')}
            >
              Sale Report
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => window.open(`${window.location.origin}?page=store-delivery`, '_blank', 'noopener,noreferrer')}
            >
              MTO Received
            </button>
            {canFinance && user?.role !== 'RETAIL' && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => window.open(`${window.location.origin}?page=finance`, '_blank', 'noopener,noreferrer')}
              >
                Finance
              </button>
            )}
            {canCrm && user?.role !== 'RETAIL' && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => window.open(`${window.location.origin}?page=crm`, '_blank', 'noopener,noreferrer')}
              >
                CRM
              </button>
            )}
            {canMrp && user?.role !== 'RETAIL' && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => window.open(`${window.location.origin}?page=mrp`, '_blank', 'noopener,noreferrer')}
              >
                MRP
              </button>
            )}
            {canProduction && user?.role !== 'RETAIL' && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => window.open(`${window.location.origin}?page=production-overview`, '_blank', 'noopener,noreferrer')}
              >
                Production
              </button>
            )}
            {canRawStore && user?.role !== 'RETAIL' && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => window.open(`${window.location.origin}?page=raw-store`, '_blank', 'noopener,noreferrer')}
              >
                Raw Store
              </button>
            )}
          </div>

          {showOrderForm && canCreateOrder && (
            <div className="modal-overlay" onClick={() => setShowOrderForm(false)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                {renderDeferred(
                  <OrderForm
                    initialOrderType={newOrderType}
                    onCreated={() => {
                      setShowOrderForm(false);
                      setRefreshSignal((v) => v + 1);
                    }}
                    onCancel={() => setShowOrderForm(false)}
                  />,
                  'Loading order form...'
                )}
              </div>
            </div>
          )}

          {renderDeferred(
            <RetailDashboard
              refreshSignal={refreshSignal}
              onCreateOrder={(type) => {
                setNewOrderType(type);
                setShowOrderForm(true);
              }}
            />,
            'Loading retail dashboard...'
          )}
        </>
      )}

      {canSettings && activeView === 'settings' && renderDeferred(<SettingsPage user={user} />, 'Loading settings...')}

      {canProduction && activeView === 'dashboard' && renderDeferred(
        <ProductionDashboard refreshSignal={refreshSignal} user={user} />,
        'Loading production dashboard...'
      )}
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <OutletsProvider>
        <AppShell />
      </OutletsProvider>
    </AuthProvider>
  );
}




