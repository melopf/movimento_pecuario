import { useState, useEffect, useRef, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { motion, AnimatePresence } from 'motion/react';
import {
  UserCog, Plus, Pencil, Trash2, Save, X, Eye, EyeOff,
  ToggleLeft, ToggleRight, Shield, BarChart3, FileText, FolderOpen, Building2, ClipboardList, KeyRound, Package, ScrollText, BookOpen,
} from 'lucide-react';
import type { ModulePermission } from '../types/user';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { userService } from '../services/userService';
import { farmService } from '../services/farmService';
import { supabase, supabaseAdmin } from '../lib/supabase';
import { SkeletonTable } from '../components/Skeleton';
import { logger } from '../lib/logger';
import type { FarmUser, Module, Role } from '../types/user';
import type { Farm } from '../types/farm';

const inputClass =
  'w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

const ALL_MODULES: Module[] = ['relatorio', 'formulario', 'cadastros', 'manejos', 'fazendas', 'usuarios', 'estoque', 'os', 'caixa'];
const MODULE_LABELS: Record<string, string> = {
  relatorio: 'Relatório', formulario: 'Lançamento', cadastros: 'Cadastros',
  manejos: 'Manejos', fazendas: 'Fazendas', usuarios: 'Usuários',
  estoque: 'Estoque', os: 'Ordens (OS)', caixa: 'Livro Caixa',
  // nomes antigos (legado do trigger)
  pastos: 'Pastos',
};
const MODULE_ICONS: Record<string, React.ElementType> = {
  relatorio: BarChart3, formulario: FileText, cadastros: FolderOpen,
  manejos: ClipboardList, fazendas: Building2, usuarios: UserCog,
  estoque: Package, os: ScrollText, caixa: BookOpen,
  // nomes antigos do trigger (legado)
  pastos: FolderOpen, usuarios_old: UserCog,
};
const MODULE_COLORS: Record<string, string> = {
  relatorio:  'bg-emerald-50 text-emerald-700 border-emerald-100',
  formulario: 'bg-blue-50 text-blue-700 border-blue-100',
  cadastros:  'bg-amber-50 text-amber-700 border-amber-100',
  manejos:    'bg-purple-50 text-purple-700 border-purple-100',
  fazendas:   'bg-indigo-50 text-indigo-700 border-indigo-100',
  usuarios:   'bg-rose-50 text-rose-700 border-rose-100',
  estoque:    'bg-orange-50 text-orange-700 border-orange-100',
  os:         'bg-cyan-50 text-cyan-700 border-cyan-100',
  caixa:      'bg-teal-50 text-teal-700 border-teal-100',
  pastos:     'bg-sky-50 text-sky-700 border-sky-100',
};


/* ─────────────── Modal de usuário ─────────────── */

// Cache de module para as fazendas do modal — persiste entre aberturas
let _modalFarmsCache: Farm[] = [];

interface UserFormData { name: string; email: string; password: string; role: Role; }

function UserModal({ editing, currentUserId, onClose, onSaved, restrictFarmIds, restrictModules, clientMode }: {
  editing: FarmUser | null;
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
  restrictFarmIds?: string[];  // cliente: só mostra fazendas dele
  restrictModules?: Module[];  // cliente: só módulos que ele já tem
  clientMode?: boolean;        // esconde selector de perfil, força role=client
}) {
  const availableModules = restrictModules ?? ALL_MODULES;

  // Inicializa o mapa de permissões 3-estados
  function initModulePerms(): Record<Module, 'none' | 'view' | 'edit'> {
    const result = {} as Record<Module, 'none' | 'view' | 'edit'>;
    for (const m of availableModules) {
      if (editing?.modulePermissions?.[m]) {
        result[m] = editing.modulePermissions[m] as 'view' | 'edit';
      } else if (editing?.modules?.includes(m)) {
        result[m] = 'edit'; // backwards compat: módulo sem permissão explícita = edit
      } else {
        result[m] = 'none';
      }
    }
    return result;
  }

  const [farms, setFarms]         = useState<Farm[]>(_modalFarmsCache);
  const [selectedFarmIds, setSelectedFarmIds] = useState<string[]>(
    editing?.farmIds?.length ? editing.farmIds
      : editing?.farmId       ? [editing.farmId]
      : restrictFarmIds       ? restrictFarmIds   // novo usuário criado por cliente herda fazendas
      : []
  );
  const [modulePerms, setModulePerms] = useState<Record<Module, 'none' | 'view' | 'edit'>>(initModulePerms);
  const [active, setActive]       = useState<boolean>(editing?.active ?? true);
  const [showPwd, setShowPwd]     = useState(false);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    farmService.list()
      .then(list => {
        const activeFarms = list.filter(f => f.active);
        const filtered = restrictFarmIds
          ? activeFarms.filter(f => restrictFarmIds.includes(f.id))
          : activeFarms;
        logger.info('UserModal', `fazendas carregadas: ${filtered.length}`);
        _modalFarmsCache = activeFarms;
        setFarms(filtered);
      })
      .catch(err => {
        logger.error('UserModal', 'erro ao carregar fazendas', err);
        toast.error('Erro ao carregar fazendas.');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<UserFormData>({
    defaultValues: {
      name: editing?.name ?? '', email: editing?.email ?? '',
      password: '', role: clientMode ? 'client' : (editing?.role ?? 'client'),
    },
  });

  const selectedRole = watch('role');

  function toggleFarm(farmId: string) {
    setSelectedFarmIds(prev =>
      prev.includes(farmId) ? prev.filter(id => id !== farmId) : [...prev, farmId]
    );
  }

  function cycleModulePerm(m: Module) {
    setModulePerms(prev => {
      const cur = prev[m];
      const next: 'none' | 'view' | 'edit' = cur === 'none' ? 'view' : cur === 'view' ? 'edit' : 'none';
      return { ...prev, [m]: next };
    });
  }

  async function onSubmit(data: UserFormData) {
    setSaving(true);
    try {
      const farmIds = data.role === 'admin' ? [] : selectedFarmIds;
      // Módulos = aqueles com permissão != 'none'
      const modules: Module[] = availableModules.filter(m => modulePerms[m] !== 'none');
      // modulePermissions = apenas os que têm acesso
      const modulePermissions: Partial<Record<Module, ModulePermission>> = {};
      for (const m of modules) {
        modulePermissions[m] = modulePerms[m] as ModulePermission;
      }
      const payload: Partial<FarmUser> = {
        name: data.name, email: data.email, role: data.role,
        farmIds,
        farmId: farmIds[0] ?? undefined,
        modules, modulePermissions, active,
      };
      if (data.password) payload.password = data.password;

      if (editing) {
        logger.info('UserModal', `editando usuário ${editing.id}`, payload);
        await userService.update(editing.id, payload);
        toast.success('Usuário atualizado!');
      } else {
        if (!data.password) { toast.error('Senha é obrigatória.'); setSaving(false); return; }
        logger.info('UserModal', 'criando novo usuário', { email: data.email });
        await userService.create({ ...payload, password: data.password } as Omit<FarmUser, 'id' | 'createdAt'>);
        toast.success('Usuário criado!', { description: data.name });
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      logger.error('UserModal', 'erro ao salvar', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md z-10 overflow-hidden"
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }} transition={{ duration: 0.2 }}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">{editing ? 'Editar Usuário' : 'Novo Usuário'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
            <div>
              <label className={labelClass}>Nome *</label>
              <input placeholder="Nome do usuário"
                className={`${inputClass} ${errors.name ? 'border-red-400 ring-2 ring-red-400' : ''}`}
                {...register('name', { required: 'Campo obrigatório' })} />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className={labelClass}>E-mail *</label>
              <input type="email" placeholder="usuario@email.com"
                className={`${inputClass} ${errors.email ? 'border-red-400 ring-2 ring-red-400' : ''}`}
                {...register('email', { required: 'Campo obrigatório' })} />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className={labelClass}>Senha {editing ? <span className="text-gray-400 font-normal">(vazio = manter)</span> : '*'}</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} placeholder="••••••••"
                  className={`${inputClass} pr-10 no-uppercase ${errors.password ? 'border-red-400 ring-2 ring-red-400' : ''}`}
                  {...register('password', { minLength: { value: 6, message: 'Mínimo 6 caracteres' } })} />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
            </div>

            {!clientMode && (
              <div>
                <label className={labelClass}>Perfil</label>
                <select className={inputClass} {...register('role')}>
                  <option value="client">Usuário</option>
                  <option value="representante">Representante</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            )}

            {selectedRole === 'client' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelClass} style={{ marginBottom: 0 }}>Fazendas vinculadas</label>
                  {selectedFarmIds.length > 0 && (
                    <span className="text-[10px] font-semibold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                      {selectedFarmIds.length} selecionada{selectedFarmIds.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {farms.length > 0 ? (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="max-h-36 overflow-y-auto divide-y divide-gray-100">
                      {farms.map(f => {
                        const on = selectedFarmIds.includes(f.id);
                        return (
                          <label key={f.id}
                            className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors select-none ${
                              on ? 'bg-teal-50 text-teal-700' : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}>
                            <input type="checkbox" checked={on} onChange={() => toggleFarm(f.id)} className="sr-only" />
                            <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                              on ? 'bg-teal-500 border-teal-500' : 'border-gray-300'
                            }`}>
                              {on && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <Building2 className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                            <span className="text-sm font-medium truncate">{f.nomeFazenda}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Nenhuma fazenda ativa. Cadastre uma fazenda primeiro.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className={labelClass}>Módulos de acesso</label>
              <p className="text-[10px] text-gray-400 mb-2">Clique para alternar: Sem acesso → Visualização → Edição</p>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {availableModules.map(m => {
                  const Icon = MODULE_ICONS[m] ?? FolderOpen;
                  const perm = modulePerms[m] ?? 'none';
                  const isNone = perm === 'none';
                  const isView = perm === 'view';
                  const isEdit = perm === 'edit';
                  return (
                    <button key={m} type="button" onClick={() => cycleModulePerm(m)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-all select-none text-left w-full ${
                        isNone ? 'border-gray-200 text-gray-400 bg-white hover:border-gray-300'
                        : isView ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-teal-500 bg-teal-50 text-teal-700'
                      }`}>
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm font-medium flex-1">{MODULE_LABELS[m]}</span>
                      {isNone && <X className="w-3 h-3 text-gray-400" />}
                      {isView && <Eye className="w-3 h-3 text-blue-500" />}
                      {isEdit && <Shield className="w-3 h-3 text-teal-500" />}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400">
                <span className="flex items-center gap-1"><X className="w-3 h-3" /> Sem acesso</span>
                <span className="flex items-center gap-1 text-blue-500"><Eye className="w-3 h-3" /> Visualização</span>
                <span className="flex items-center gap-1 text-teal-600"><Shield className="w-3 h-3" /> Edição</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-200">
              <div>
                <p className="text-sm font-medium text-gray-800">Usuário ativo</p>
                <p className="text-xs text-gray-500">{active ? 'Acesso liberado' : 'Acesso bloqueado'}</p>
              </div>
              <button type="button" onClick={() => setActive(v => !v)}
                disabled={editing?.id === currentUserId}
                className={`transition-colors ${active ? 'text-teal-600' : 'text-gray-400'} disabled:opacity-40`}>
                {active ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-white transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors disabled:opacity-60">
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar usuário'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

/* ─────────────── Modal trocar senha ─────────────── */

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [showNew, setShowNew]       = useState(false);
  const [showConf, setShowConf]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<{ newPwd: string; confPwd: string }>();

  async function onSubmit(data: { newPwd: string; confPwd: string }) {
    if (data.newPwd !== data.confPwd) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: data.newPwd });
      if (error) throw new Error(error.message);
      toast.success('Senha alterada com sucesso!');
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao alterar senha.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10 overflow-hidden"
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }} transition={{ duration: 0.2 }}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Trocar Senha</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className={labelClass}>Nova senha *</label>
              <div className="relative">
                <input type={showNew ? 'text' : 'password'} placeholder="••••••••"
                  className={`${inputClass} pr-10 no-uppercase ${errors.newPwd ? 'border-red-400 ring-2 ring-red-400' : ''}`}
                  {...register('newPwd', { required: 'Informe a nova senha', minLength: { value: 6, message: 'Mínimo 6 caracteres' } })} />
                <button type="button" onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.newPwd && <p className="text-xs text-red-500 mt-1">{errors.newPwd.message}</p>}
            </div>

            <div>
              <label className={labelClass}>Confirmar nova senha *</label>
              <div className="relative">
                <input type={showConf ? 'text' : 'password'} placeholder="••••••••"
                  className={`${inputClass} pr-10 no-uppercase ${errors.confPwd ? 'border-red-400 ring-2 ring-red-400' : ''}`}
                  {...register('confPwd', {
                    required: 'Confirme a nova senha',
                    validate: v => v === watch('newPwd') || 'As senhas não coincidem',
                  })} />
                <button type="button" onClick={() => setShowConf(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confPwd && <p className="text-xs text-red-500 mt-1">{errors.confPwd.message}</p>}
            </div>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-white transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors disabled:opacity-60">
              <KeyRound className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Alterar senha'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

/* ─────────────── Linha de usuário na tabela ─────────────── */

function UserRow({ u, currentUserId, onEdit, onRefresh }: {
  u: FarmUser;
  currentUserId: string;
  onEdit: (u: FarmUser) => void;
  onRefresh: () => void;
}) {
  const [farmNames, setFarmNames] = useState<string[]>([]);

  useEffect(() => {
    const ids = u.farmIds?.length ? u.farmIds : (u.farmId ? [u.farmId] : []);
    if (ids.length === 0) return;
    Promise.all(ids.map(id => farmService.findById(id))).then(results => {
      setFarmNames(results.filter((f): f is Farm => f !== null).map(f => f.nomeFazenda));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [u.farmIds?.join(','), u.farmId]);

  async function toggleActive() {
    if (u.id === currentUserId) return;
    try {
      await userService.update(u.id, { active: !u.active });
      onRefresh();
      toast.success(u.active ? 'Usuário desativado.' : 'Usuário ativado.');
    } catch { toast.error('Erro ao atualizar.'); }
  }

  async function onDelete() {
    if (u.id === currentUserId) { toast.error('Não é possível excluir seu próprio usuário.'); return; }
    if (!window.confirm(`Excluir "${u.name}"?`)) return;
    try {
      await userService.remove(u.id);
      onRefresh();
      toast.success('Usuário removido.');
    } catch { toast.error('Erro ao remover.'); }
  }

  return (
    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-gray-50/70 transition-colors group">
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 leading-tight">{u.name}</p>
          <p className="text-xs text-gray-400">{u.email}</p>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-medium text-gray-600">
          {u.role === 'admin' ? 'Admin' : u.role === 'representante' ? 'Representante' : 'Usuário'}
        </span>
      </td>
      <td className="px-4 py-3 max-w-[180px]">
        {farmNames.length > 0
          ? <span className="text-xs text-gray-600 leading-relaxed">{farmNames.join(', ')}</span>
          : <span className="text-gray-300 italic text-xs">—</span>
        }
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {u.modules.map(m => {
            const Icon = MODULE_ICONS[m] ?? FolderOpen;
            const colors = MODULE_COLORS[m] ?? 'bg-gray-50 text-gray-600 border-gray-100';
            const perm = u.modulePermissions?.[m];
            return (
              <span key={m} className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${colors}`}>
                <Icon className="w-2.5 h-2.5" />
                {MODULE_LABELS[m]}
                {perm === 'view' && <Eye className="w-2 h-2 opacity-70" />}
                {(perm === 'edit' || !perm) && <Pencil className="w-2 h-2 opacity-70" />}
              </span>
            );
          })}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full ${u.active ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${u.active ? 'bg-green-500' : 'bg-red-400'}`} />
          {u.active ? 'Ativo' : 'Inativo'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(u)} className="p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={toggleActive} disabled={u.id === currentUserId}
            className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${u.active ? 'text-green-500 hover:bg-green-50' : 'text-red-400 hover:bg-red-50'}`}
            title={u.active ? 'Desativar' : 'Ativar'}>
            {u.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          </button>
          <button onClick={onDelete} disabled={u.id === currentUserId}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Excluir">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </motion.tr>
  );
}

/* ─────────────── Página principal ─────────────── */

// Cache de módulo — persiste entre navegações sem precisar de contexto
let _usersCache: FarmUser[]  = [];
let _farmUsersCache: FarmUser[] = [];
let _farmsCache: Farm[]      = [];

export function Usuarios() {
  const { user, isAdmin, hasModule, hasEditPermission } = useAuth();
  const [users, setUsers]         = useState<FarmUser[]>(_usersCache);
  const [loading, setLoading]     = useState(_usersCache.length === 0 && _farmUsersCache.length === 0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<FarmUser | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Cliente: dados das suas fazendas
  const [farmUsers, setFarmUsers]   = useState<FarmUser[]>(_farmUsersCache);
  const [farms, setFarms]           = useState<Farm[]>(_farmsCache);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(
    _farmsCache[0]?.id ?? null
  );
  // mapa id→nome para mostrar a fazenda de cada usuário
  const farmNameMap = useMemo(
    () => Object.fromEntries(farms.map(f => [f.id, f.nomeFazenda])),
    [farms]
  );
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [clientEditing, setClientEditing]     = useState<FarmUser | null>(null);
  const [changePwdOpen, setChangePwdOpen]     = useState(false);

  function openClientCreate() { setClientEditing(null); setClientModalOpen(true); }
  function openClientEdit(u: FarmUser) { setClientEditing(u); setClientModalOpen(true); }
  function closeClientModal() { setClientModalOpen(false); setClientEditing(null); }

  async function refresh() {
    // Só mostra skeleton se não há dados em cache
    if (_usersCache.length === 0) setLoading(true);
    try {
      const result = await userService.list();
      _usersCache = result;
      setUsers(result);
    } catch {
      // Mantém cache atual para evitar "limpar" a tela em erros temporários
      setUsers(_usersCache);
    } finally {
      setLoading(false);
    }
  }

  // Recarrega apenas se tab ficou oculto 30+ segundos
  const hiddenAtRef = useRef<number | null>(null);
  useEffect(() => {
    const THRESHOLD = 30_000;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        const elapsed = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
        if (elapsed > THRESHOLD) setRefreshTick(t => t + 1);
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Effect 1: carrega lista de fazendas do cliente e auto-seleciona a primeira
  useEffect(() => {
    if (isAdmin) { refresh(); return; }
    if (!user?.id) return;
    const ids = user.farmIds?.length ? user.farmIds : (user.farmId ? [user.farmId] : []);
    if (ids.length === 0) { setLoading(false); return; }
    Promise.all(ids.map(id => farmService.findById(id)))
      .then(list => {
        const fs = list.filter((f): f is Farm => f !== null);
        _farmsCache = fs;
        setFarms(fs);
        // Auto-seleciona primeira fazenda apenas na primeira carga
        setSelectedFarmId(prev => prev ?? (fs[0]?.id ?? null));
        if (fs.length === 0) setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user?.id, isAdmin, refreshTick]);

  // Effect 2: carrega usuários da fazenda selecionada
  useEffect(() => {
    if (isAdmin || !selectedFarmId) return;
    setLoading(true);
    userService.listByFarm(selectedFarmId)
      .then(fu => { _farmUsersCache = fu; setFarmUsers(fu); })
      .catch(() => setFarmUsers(_farmUsersCache))
      .finally(() => setLoading(false));
  }, [selectedFarmId, isAdmin, refreshTick]);

  async function refreshFarmUsers() {
    if (!selectedFarmId) return;
    const fu = await userService.listByFarm(selectedFarmId).catch(() => _farmUsersCache);
    _farmUsersCache = fu;
    setFarmUsers(fu);
  }

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(u: FarmUser) { setEditing(u); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); }

  const pendentes = users.filter(u => !u.active && u.role !== 'admin');
  const ativos    = users.filter(u => u.active || u.role === 'admin');

  async function aprovarUsuario(u: FarmUser) {
    try {
      await userService.update(u.id, { active: true });
      if (u.farmId) {
        await supabaseAdmin.from('farms').update({ active: true }).eq('id', u.farmId);
      }
      toast.success(`${u.name} aprovado com sucesso!`);
      refresh();
    } catch { toast.error('Erro ao aprovar usuário.'); }
  }

  async function recusarUsuario(u: FarmUser) {
    if (!window.confirm(`Recusar e remover o cadastro de "${u.name}"?`)) return;
    try {
      await userService.remove(u.id);
      if (u.farmId) await supabaseAdmin.from('farms').delete().eq('id', u.farmId);
      toast.success('Cadastro recusado e removido.');
      refresh();
    } catch { toast.error('Erro ao recusar.'); }
  }

  /* ── Admin ── */
  if (isAdmin) return (
    <div className="p-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="max-w-6xl mx-auto">

        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Suplemento Control</p>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">Usuários</h1>
            <p className="text-sm text-gray-500">
              {ativos.length} ativo{ativos.length !== 1 ? 's' : ''}
              {pendentes.length > 0 && <span className="ml-2 text-amber-600 font-semibold">· {pendentes.length} aguardando aprovação</span>}
            </p>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Novo Usuário
          </button>
        </div>

        {/* ── Seção Pendentes ── */}
        {!loading && pendentes.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-amber-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <p className="text-sm font-semibold text-amber-800">Aguardando Aprovação ({pendentes.length})</p>
            </div>
            <div className="divide-y divide-amber-100">
              {pendentes.map(u => (
                <div key={u.id} className="flex items-center justify-between px-5 py-3 hover:bg-amber-100/50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{u.name}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                    {u.farmId && (
                      <p className="text-xs text-amber-700 font-medium mt-0.5">
                        Fazenda: {farmNameMap[u.farmId] ?? u.farmId}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => recusarUsuario(u)}
                      className="px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                      Recusar
                    </button>
                    <button onClick={() => aprovarUsuario(u)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors">
                      Aprovar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {loading ? (
          <SkeletonTable rows={4} cols={6} />
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Usuário', 'Perfil', 'Fazenda', 'Módulos', 'Status', 'Ações'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ativos.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Nenhum usuário ativo.</td></tr>
                  ) : (
                    ativos.map(u => <UserRow key={u.id} u={u} currentUserId={user!.id} onEdit={openEdit} onRefresh={refresh} />)
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </motion.div>

      <AnimatePresence>
        {modalOpen && <UserModal editing={editing} currentUserId={user!.id} onClose={closeModal} onSaved={refresh} />}
      </AnimatePresence>
    </div>
  );

  /* ── Cliente ── */
  return (
    <div className="p-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="max-w-4xl mx-auto">

        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Suplemento Control</p>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">Usuários</h1>
            <p className="text-sm text-gray-500">
              {farms.find(f => f.id === selectedFarmId)?.nomeFazenda || farms[0]?.nomeFazenda || 'Minha fazenda'}
              {' '}· {farmUsers.length} usuário{farmUsers.length !== 1 ? 's' : ''}
            </p>
          </div>
          {hasEditPermission('usuarios') && (
            <button onClick={openClientCreate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors shadow-sm">
              <Plus className="w-4 h-4" /> Novo Usuário
            </button>
          )}
        </div>

        {/* Seletor de fazenda — visível quando cliente tem múltiplas fazendas */}
        {farms.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {farms.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedFarmId(f.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  selectedFarmId === f.id
                    ? 'bg-teal-600 border-teal-600 text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-teal-400 hover:text-teal-700'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                {f.nomeFazenda}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <SkeletonTable rows={3} cols={4} />
        ) : (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <UserCog className="w-4 h-4 text-teal-500" />
            <span className="text-sm font-semibold text-gray-800">Equipe da Fazenda</span>
          </div>

          {farmUsers.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <UserCog className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum usuário vinculado a esta fazenda.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {farmUsers.map(u => (
                <li key={u.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-gray-900">{u.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${u.role === 'admin' ? 'bg-teal-100 text-teal-700' : u.role === 'representante' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {u.role === 'admin' ? 'Admin' : u.role === 'representante' ? 'Representante' : 'Usuário'}
                        </span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${u.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {u.active ? '● Ativo' : '○ Inativo'}
                        </span>
                        {/* Badges de todas as fazendas do usuário — selecionada=teal, outras=amber */}
                        {(u.farmIds?.length ? u.farmIds : (u.farmId ? [u.farmId] : []))
                          .filter(fId => farmNameMap[fId])
                          .map(fId => (
                            <span key={fId} className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${
                              fId === selectedFarmId
                                ? 'bg-teal-100 text-teal-700'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              <Building2 className="w-2.5 h-2.5" />
                              {farmNameMap[fId]}
                            </span>
                          ))}
                      </div>
                      <p className="text-xs text-gray-500 mb-2">{u.email}</p>
                      <div className="flex flex-wrap gap-1">
                        {u.modules.map(m => {
                          const Icon = MODULE_ICONS[m] ?? FolderOpen;
                          return (
                            <span key={m} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
                              <Icon className="w-3 h-3" /> {MODULE_LABELS[m] ?? m}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {u.id === user!.id && (
                        <button
                          onClick={() => setChangePwdOpen(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-700 border border-teal-200 hover:bg-teal-50 transition-colors"
                          title="Trocar senha"
                        >
                          <KeyRound className="w-3.5 h-3.5" /> Trocar Senha
                        </button>
                      )}
                      {hasEditPermission('usuarios') && u.id !== user!.id && (
                        <button
                          onClick={() => openClientEdit(u)}
                          className="p-2 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                          title="Editar usuário"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
        )}
      </motion.div>

      <AnimatePresence>
        {clientModalOpen && (
          <UserModal
            editing={clientEditing}
            currentUserId={user!.id}
            onClose={closeClientModal}
            onSaved={refreshFarmUsers}
            restrictFarmIds={user?.farmIds?.length ? user.farmIds : (user?.farmId ? [user.farmId] : [])}
            restrictModules={(user?.modules ?? []) as Module[]}
            clientMode
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {changePwdOpen && <ChangePasswordModal onClose={() => setChangePwdOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
