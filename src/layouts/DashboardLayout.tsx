import { useState, useEffect } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router';
import { FileText, BarChart3, Building2, LogOut, User, FolderOpen, Users, ChevronDown, ClipboardList, BookOpen, Construction, Leaf, History, ArrowUp, Menu, X as XIcon, Package, ScrollText, FlaskConical } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { farmService } from '../services/farmService';
import { supabaseAdmin } from '../lib/supabase';
import type { Module } from '../types/user';
import type { Farm } from '../types/farm';
import { estoqueService } from '../services/estoqueService';

const navItems = [
  { path: '/manejos',    label: 'Manejo',        icon: ClipboardList, module: 'manejos'    as Module },
  { path: '/formulario', label: 'Lançamento',    icon: FileText,      module: 'formulario' as Module },
  { path: '/',           label: 'Relatórios',    icon: BarChart3,     module: 'relatorio'  as Module },
  { path: '/cadastros',  label: 'Cadastros',     icon: FolderOpen,    module: 'cadastros'  as Module },
  { path: '/historico',  label: 'Histórico',     icon: History,       module: 'historico'  as Module },
  { path: '/usuarios',   label: 'Usuários',      icon: Users,         module: 'usuarios'   as Module },
  { path: '/fazendas',   label: 'Fazenda',       icon: Building2,     module: 'fazendas'   as Module },
  { path: '/estoque',    label: 'Estoque',       icon: Package,       module: 'estoque'    as Module },
  { path: '/os',         label: 'Ordens (OS)',   icon: ScrollText,    module: 'os'         as Module },
  { path: '/caixa',      label: 'Livro Caixa',   icon: BookOpen,      module: 'caixa'      as Module },
];

/* ── Seletor de fazenda reutilizável ── */
let _adminFarmsCache: Farm[]  = [];
let _clientFarmsCache: Farm[] = [];

function FarmSelectorWidget({ farms }: { farms: Farm[] }) {
  const { activeFarmId, selectFarm } = useData();
  if (farms.length === 0) return null;
  return (
    <div className="px-4 pb-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5 text-gray-400">
        Fazenda
      </p>
      <div className="relative">
        <select
          value={activeFarmId}
          onChange={e => selectFarm(e.target.value)}
          className="w-full h-8 pl-2.5 pr-7 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-teal-500 appearance-none cursor-pointer"
          style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.10)' }}
        >
          {farms.map(f => (
            <option key={f.id} value={f.id}>{f.nomeFazenda}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none text-gray-400" />
      </div>
    </div>
  );
}

function AdminFarmSelector() {
  const [farms, setFarms] = useState<Farm[]>(_adminFarmsCache);
  useEffect(() => {
    farmService.list().then(list => {
      const active = list.filter(f => f.active);
      _adminFarmsCache = active;
      setFarms(active);
    });
  }, []);
  return <FarmSelectorWidget farms={farms} />;
}

function ClientFarmSelector() {
  const { user } = useAuth();
  const [farms, setFarms] = useState<Farm[]>(_clientFarmsCache);
  const farmIds = user?.farmIds ?? [];

  useEffect(() => {
    if (farmIds.length <= 1) return;
    Promise.all(farmIds.map(id => farmService.findById(id))).then(results => {
      const active = results.filter((f): f is Farm => f !== null && f.active);
      _clientFarmsCache = active;
      setFarms(active);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmIds.join(',')]);

  if (farmIds.length <= 1) return null;
  return <FarmSelectorWidget farms={farms} />;
}

export function DashboardLayout() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user, logout, isAdmin, hasModule } = useAuth();
  const [showEmDev, setShowEmDev]       = useState(false);
  const [showBackTop, setShowBackTop]   = useState(false);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [estoqueAlertas, setEstoqueAlertas] = useState(0);

  useEffect(() => {
    function onScroll() { setShowBackTop(window.scrollY > 300); }
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const [unreadComments, setUnreadComments] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    async function fetchUnread() {
      const { count } = await supabaseAdmin
        .from('devplan_comments')
        .select('id', { count: 'exact', head: true })
        .eq('lido', false)
        .neq('author_role', 'admin');
      setUnreadComments(count ?? 0);
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [isAdmin, location.pathname]);

  const visibleNavItems = navItems.filter(item =>
    item.module === 'historico' ? (isAdmin || hasModule(item.module)) : hasModule(item.module)
  );

  /* Alertas de estoque — só admin, polling a cada 5 min */
  const { activeFarmId } = useData();
  useEffect(() => {
    if (!isAdmin) return;
    const farmId = activeFarmId;
    if (!farmId) return;
    async function fetchAlertas() {
      try {
        const supls = await estoqueService.listarSuplementos(farmId!);
        const saldos = await estoqueService.calcularSaldos(farmId!, supls);
        setEstoqueAlertas(saldos.filter(s => s.em_alerta).length);
      } catch { /* silencioso */ }
    }
    fetchAlertas();
    const interval = setInterval(fetchAlertas, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAdmin, activeFarmId]);

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // noop — logout() já é robusto, mas garante navegação mesmo em erros inesperados
    }
    navigate('/login');
  }

  return (
    <div
      className="flex min-h-screen"
      style={{
        background: `
          radial-gradient(ellipse at 20% 60%, rgba(26,96,64,0.08) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 20%, rgba(11,39,72,0.05) 0%, transparent 45%),
          linear-gradient(160deg, #f8fafb 0%, #f0f9f6 40%, #f8fafb 100%)
        `,
      }}
    >
      {/* ── Mobile top bar ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 no-print"
        style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(0,0,0,0.07)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}
      >
        <div className="flex items-center gap-3">
          <img src="/images/logo.png" alt="Movimento Pecuário" className="h-6 w-auto" />
          <span className="text-sm font-bold text-gray-800">Suplemento Control</span>
        </div>
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Menu"
        >
          {sidebarOpen ? <XIcon className="w-5 h-5 text-gray-600" /> : <Menu className="w-5 h-5 text-gray-600" />}
        </button>
      </div>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — glassmorphism claro */}
      <aside
        className={`
          flex flex-col flex-shrink-0 relative no-print
          fixed md:sticky top-0 h-screen z-40
          w-64 transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRight: '1px solid rgba(0, 0, 0, 0.07)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.06)',
        }}
      >
        {/* Logo */}
        <motion.div
          className="p-5"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Zoo Flora — cliente */}
          <div
            className="rounded-xl p-3 mb-3"
            style={{
              background: 'rgba(255,255,255,0.9)',
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}
          >
            <img src="/images/logo.png" alt="Movimento Pecuário" className="w-full h-auto" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-gray-800">Suplemento Control</h1>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border"
              style={{ background: 'rgba(26,96,64,0.08)', color: '#1a6040', borderColor: 'rgba(26,96,64,0.18)' }}>
              v1.26
            </span>
          </div>
          <p className="text-xs mt-0.5 truncate text-gray-400">{user?.name}</p>
        </motion.div>

        {/* Seletor de fazenda — admin (todas) ou cliente multi-fazenda */}
        {(isAdmin || (user?.farmIds?.length ?? 0) > 1) && (
          <motion.div
            className="pt-3"
            style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {isAdmin ? <AdminFarmSelector /> : <ClientFarmSelector />}
          </motion.div>
        )}

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto sidebar-nav">
          {visibleNavItems.map((item, index) => {
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);
            const Icon = item.icon;
            return (
              <motion.div
                key={item.path}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.08 }}
              >
                <Link
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200"
                  style={isActive ? {
                    background: 'linear-gradient(135deg, #1a6040, #0f4a30)',
                    color: '#ffffff',
                    boxShadow: '0 4px 16px rgba(26,96,64,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
                    border: '1px solid rgba(26,96,64,0.3)',
                  } : {
                    color: '#6b7280',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)';
                  }}
                  onMouseLeave={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.module === 'estoque' && estoqueAlertas > 0 && (
                    <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: '#ef4444', color: '#fff', minWidth: '18px', textAlign: 'center' }}>
                      {estoqueAlertas}
                    </span>
                  )}
                </Link>
              </motion.div>
            );
          })}

            {/* ── Simulador + Planejamento — somente perfil admin ── */}
          {isAdmin && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: visibleNavItems.length * 0.08 + 0.05 }}
            >
              <div className="mt-2 pt-2 space-y-1" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                {/* Simulador */}
                {(() => {
                  const isActive = location.pathname.startsWith('/simulador');
                  return (
                    <Link
                      to="/simulador"
                      onClick={() => setSidebarOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200"
                      style={isActive ? {
                        background: 'linear-gradient(135deg, #1a6040, #4c1d7a)',
                        color: '#ffffff',
                        boxShadow: '0 4px 16px rgba(26,96,64,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
                        border: '1px solid rgba(26,96,64,0.3)',
                      } : { color: '#6b7280' }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)'; }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <FlaskConical className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm font-medium">Simulador</span>
                    </Link>
                  );
                })()}
                {/* DevPlan */}
                {(() => {
                  const isActive = location.pathname.startsWith('/devplan');
                  return (
                    <Link
                      to="/devplan"
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200"
                      style={isActive ? {
                        background: 'linear-gradient(135deg, #1a6040, #0f4a30)',
                        color: '#ffffff',
                        boxShadow: '0 4px 16px rgba(26,96,64,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
                        border: '1px solid rgba(26,96,64,0.3)',
                      } : { color: '#6b7280' }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)'; }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <ClipboardList className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm font-medium">Planejamento</span>
                      {unreadComments > 0 && (
                        <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: '#ef4444', color: '#fff', minWidth: '18px', textAlign: 'center' }}>
                          {unreadComments}
                        </span>
                      )}
                    </Link>
                  );
                })()}
              </div>
            </motion.div>
          )}

          {/* ── Módulos em breve (clientes veem) ── */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: visibleNavItems.length * 0.08 }}
          >
            <div className="mt-3 pt-3 space-y-1" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <button
                onClick={() => setShowEmDev(true)}
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl transition-all duration-200 opacity-40 hover:opacity-60"
                style={{ color: '#6b7280' }}
              >
                <Leaf className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm font-medium">Formulário Pasto</span>
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-gray-300 text-gray-400">
                  EM BREVE
                </span>
              </button>
            </div>
          </motion.div>
        </nav>

        {/* Modal em desenvolvimento */}
        {showEmDev && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setShowEmDev(false)}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10 p-8 text-center"
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(26,96,64,0.08)' }}>
                <Construction className="w-7 h-7" style={{ color: '#1a6040' }} />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Em Desenvolvimento</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                O módulo <strong>Livro Caixa</strong> está sendo desenvolvido e estará disponível em breve.
              </p>
              <button
                onClick={() => setShowEmDev(false)}
                className="mt-6 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ background: '#1a6040' }}
              >
                Entendido
              </button>
            </motion.div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 space-y-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="flex items-center gap-3 px-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(26,96,64,0.10)', border: '1px solid rgba(26,96,64,0.15)' }}
            >
              <User className="w-4 h-4 text-teal-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">{user?.name}</p>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                style={isAdmin
                  ? { background: 'rgba(26,96,64,0.12)', color: '#1a6040' }
                  : { background: 'rgba(59,130,246,0.12)', color: '#2563eb' }
                }
              >
                {isAdmin ? 'Admin' : 'Cliente'}
              </span>
            </div>
            {/* Movimento Pecuário — criador do software */}
            <img src="/images/logo.png" alt="Movimento Pecuário" className="h-6 w-auto opacity-60 flex-shrink-0" />
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl transition-all text-sm text-gray-400"
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)';
              (e.currentTarget as HTMLElement).style.color = '#374151';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = '#9ca3af';
            }}
          >
            <LogOut className="w-4 h-4" />
            <span>Sair</span>
          </button>
        </div>
        {/* Footer verde — fechamento visual do sidebar */}
        <div style={{ height: '3px', background: 'linear-gradient(90deg, #1a6040, #0f4a30)', flexShrink: 0 }} />
      </aside>

      {/* Main */}
      <main
        className="flex-1 min-w-0 pt-14 md:pt-0"
        style={{ background: '#f8fafc', isolation: 'isolate' }}
      >
        <Outlet />
      </main>

      {/* Botão voltar ao topo */}
      {showBackTop && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-33 left-52 z-50 w-9 h-9 rounded-full flex items-center justify-center shadow-lg no-print"
          style={{ background: 'linear-gradient(135deg, #1a6040, #0f4a30)', color: '#fff' }}
          title="Voltar ao topo"
        >
          <ArrowUp className="w-4 h-4" />
        </motion.button>
      )}
    </div>
  );
}
