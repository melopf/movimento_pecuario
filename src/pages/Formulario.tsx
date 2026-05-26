import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'motion/react';
import { Plus, BarChart3, Trash2, Info, Pencil, Save, X, Lock, LockOpen, KeyRound, Search, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import type { DataEntry } from '../lib/data';
import { supplementOrder } from '../lib/data';
import { supabaseAdmin } from '../lib/supabase';
import { manejoService, type Animal } from '../services/manejoService';
import { fmtInt } from '../lib/utils';
import { logActivity } from '../services/activityLogService';
import { PasswordConfirmModal } from '../components/PasswordConfirmModal';
import { verifyPassword } from '../lib/verifyPassword';

interface SupplementType {
  id: string;
  nome: string;
  unidade: string;
  peso?: number;
}

interface Employee {
  id: string;
  nome: string;
  funcao?: string;
}

interface FormFields {
  pasto: string;
  data: string;
  tipo: string;
  sacos: number;
  funcionario: string;
  tipoBez: string;
  sacosBez: number;
}

interface EditFields { pasto: string; data: string; tipo: string; quantidade: number; sacos: number; }

function EntryEditRow({ entry, pastures, tipoOptions, supplementTypes, onSave, onCancel }: {
  entry: DataEntry;
  pastures: { id: string; nome: string }[];
  tipoOptions: string[];
  supplementTypes: SupplementType[];
  onSave: (patch: Partial<DataEntry>) => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, watch } = useForm<EditFields>({
    defaultValues: {
      pasto: entry.pasto, data: entry.data ?? '',
      tipo: entry.tipo, quantidade: entry.quantidade, sacos: entry.sacos,
    },
  });
  const sacos    = watch('sacos');
  const tipo     = watch('tipo');
  const suppInfo = supplementTypes.find(s => s.nome === tipo);
  const pesoSaco = suppInfo?.peso ?? 25;
  const kgCalc   = Number(sacos) > 0 ? Number(sacos) * pesoSaco : 0;
  const cellClass = 'px-2 py-1.5';
  const inp = 'w-full h-8 px-2 rounded border border-gray-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-teal-500';

  function onSubmit(data: EditFields) {
    onSave({ pasto: data.pasto, data: data.data, tipo: data.tipo, quantidade: Number(data.quantidade), sacos: Number(data.sacos), periodo: 0, kg: kgCalc, consumo: 0 });
  }

  return (
    <tr className="bg-teal-50">
      <td className={cellClass}>
        <select {...register('pasto')} className={`${inp} cursor-pointer`}>
          {pastures.map(p => <option key={p.id} value={p.nome}>{p.nome}</option>)}
        </select>
      </td>
      <td className={cellClass}>
        <input type="date" max={new Date().toISOString().split('T')[0]} {...register('data')} className={inp} />
      </td>
      <td className={cellClass}>
        <input type="number" min="0" step="1" {...register('quantidade', { valueAsNumber: true })} className={inp} />
      </td>
      <td className={cellClass}>
        <select {...register('tipo')} className={`${inp} cursor-pointer`}>
          {tipoOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td className={cellClass}>
        <input type="number" min="0" step="0.5" {...register('sacos', { valueAsNumber: true })} className={inp} />
      </td>
      <td className={`${cellClass} text-xs font-semibold tabular-nums`} style={{ color: '#1a6040' }}>
        {kgCalc > 0 ? fmtInt(kgCalc) : '0'}
      </td>
      <td className={cellClass}>
        <div className="flex items-center gap-1">
          <button onClick={handleSubmit(onSubmit)} className="p-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white transition-colors">
            <Save className="w-3.5 h-3.5" />
          </button>
          <button onClick={onCancel} className="p-1.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

const inputClass =
  'w-full h-10 px-3 rounded-lg bg-gray-100 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-colors';
const labelClass = 'block text-xs font-medium text-gray-500 mb-1';
const today = new Date().toISOString().split('T')[0];
const todayYM = today.slice(0, 7); // YYYY-MM


const MONTH_SHORT = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const MONTH_FULL  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function ymLabel(ym: string) {
  const [, m] = ym.split('-').map(Number);
  return MONTH_SHORT[m - 1];
}
function nextYM(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function Formulario() {
  const { entries, addEntry, updateEntry, removeEntry, pastures, loading, activeFarmId } = useData();
  const { user, isAdmin, hasEditPermission } = useAuth();
  const canEdit = isAdmin || hasEditPermission('formulario');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const [supplementTypes, setSupplementTypes] = useState<SupplementType[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [animalCategories, setAnimalCategories] = useState<{ id: string; nome: string }[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  /* ── Confirmação de exclusão ── */
  const [confirmDelete, setConfirmDelete] = useState<{ index: number; label: string } | null>(null);

  const farmId = activeFarmId || user?.farmId || '';

  /* ── Modal de senha ── */
  const [senhaModal, setSenhaModal] = useState<{ acao: 'fechar' | 'reabrir'; alvo: string } | null>(null);
  const [senhaInput, setSenhaInput] = useState('');
  const [senhaErro,  setSenhaErro]  = useState(false);
  const [showSenha,  setShowSenha]  = useState(false);

  function abrirModalSenha(acao: 'fechar' | 'reabrir', alvo: string) {
    setSenhaInput('');
    setSenhaErro(false);
    setShowSenha(false);
    setSenhaModal({ acao, alvo });
  }

  async function confirmarSenha() {
    if (!senhaModal || !senhaInput) return;
    // Valida contra a senha real do login via Supabase
    const { error } = await supabaseAdmin.auth.signInWithPassword({
      email: user?.email ?? '',
      password: senhaInput,
    });
    if (error) {
      setSenhaErro(true);
      setSenhaInput('');
      return;
    }
    if (senhaModal.acao === 'fechar') {
      executarFecharMes(senhaModal.alvo);
    } else {
      executarReopenMes(senhaModal.alvo);
    }
    setSenhaModal(null);
  }

  /* ── Controle de mês ── */
  const closedKey = farmId ? `closedMonths_${farmId}` : null;
  const [activeMonth, setActiveMonth] = useState<string>(todayYM);
  const [closedMonths, setClosedMonths] = useState<Set<string>>(() => {
    if (!closedKey) return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(closedKey) ?? '[]')); }
    catch { return new Set(); }
  });
  // Sync closedMonths when farmId changes
  useEffect(() => {
    if (!closedKey) return;
    try { setClosedMonths(new Set(JSON.parse(localStorage.getItem(closedKey) ?? '[]'))); }
    catch { setClosedMonths(new Set()); }
    setActiveMonth(todayYM);
  }, [closedKey]);

  const monthOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const set = new Set<string>();
    // Sempre mostra todos os 12 meses do ano atual
    for (let m = 1; m <= 12; m++) {
      set.add(`${currentYear}-${String(m).padStart(2, '0')}`);
    }
    // Inclui meses de anos anteriores que tenham entries
    for (const e of entries) {
      if (e.data && !e.data.startsWith(String(currentYear))) {
        set.add(e.data.slice(0, 7));
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const [savedFilter, setSavedFilter] = useState('');

  const visibleEntries = useMemo(
    () => entries.filter(e => !e.data || e.data.startsWith(activeMonth)),
    [entries, activeMonth]
  );

  const filteredEntries = useMemo(() => {
    if (!savedFilter.trim()) return visibleEntries;
    const q = savedFilter.toLowerCase();
    return visibleEntries.filter(e =>
      e.pasto.toLowerCase().includes(q) ||
      e.tipo.toLowerCase().includes(q) ||
      (e.funcionario ?? '').toLowerCase().includes(q)
    );
  }, [visibleEntries, savedFilter]);

  const isActiveClosed = closedMonths.has(activeMonth);

  function executarFecharMes(ym: string) {
    if (!closedKey) return;
    const updated = new Set(closedMonths);
    updated.add(ym);
    setClosedMonths(updated);
    localStorage.setItem(closedKey, JSON.stringify(Array.from(updated)));
    const [, m] = ym.split('-').map(Number);
    const next = nextYM(ym);
    setActiveMonth(next);
    toast.success(`${MONTH_FULL[m - 1]} fechado!`, { description: `Agora em ${ymLabel(next)}` });
  }

  function executarReopenMes(ym: string) {
    if (!closedKey) return;
    const updated = new Set(closedMonths);
    updated.delete(ym);
    setClosedMonths(updated);
    localStorage.setItem(closedKey, JSON.stringify(Array.from(updated)));
    const [, m] = ym.split('-').map(Number);
    toast.success(`${MONTH_FULL[m - 1]} reaberto!`);
    setActiveMonth(ym);
  }

  /* Load supplement_types and animals when farmId changes */
  useEffect(() => {
    if (!farmId) return;
    setLoadingData(true);
    Promise.all([
      supabaseAdmin.from('supplement_types').select('id, nome, unidade, peso').eq('farm_id', farmId),
      manejoService.listarAnimais(farmId),
      supabaseAdmin.from('animal_categories').select('id, nome').eq('farm_id', farmId),
      supabaseAdmin.from('employees').select('id, nome, funcao').eq('farm_id', farmId).order('nome'),
    ]).then(([suppRes, animalsRes, catRes, empRes]) => {
      if (suppRes.data) setSupplementTypes(suppRes.data as SupplementType[]);
      setAnimals(animalsRes.filter(a => a.status === 'ativo' || !a.status));
      if (catRes.data) setAnimalCategories(catRes.data as { id: string; nome: string }[]);
      if (empRes.data) setEmployees(empRes.data as Employee[]);
    }).catch(() => {}).finally(() => setLoadingData(false));
  }, [farmId]);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormFields>({
    defaultValues: { data: today, funcionario: '' },
  });

  // Sincroniza a data do form com o mês selecionado
  useEffect(() => {
    if (activeMonth === todayYM) {
      setValue('data', today);
    } else {
      const [y, m] = activeMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).toISOString().split('T')[0];
      setValue('data', lastDay);
    }
  }, [activeMonth, setValue]);

  const selectedPasto = watch('pasto');
  const selectedTipo  = watch('tipo');
  const sacos         = watch('sacos');
  const selectedTipoBez = watch('tipoBez');
  const sacosBez        = watch('sacosBez');

  /* Auto-fill: qtd gado + lotes no pasto */
  const pastoInfo = useMemo(() => {
    if (!selectedPasto) return null;
    const pasture = pastures.find(p => p.nome === selectedPasto);
    if (!pasture) return null;
    const lotesNoPasto = animals.filter(a => a.pasto_id === pasture.id);
    const totalCab = lotesNoPasto.reduce((s, a) => s + a.quantidade, 0);
    const totalBez = lotesNoPasto.reduce((s, a) => s + (a.bezerros_quantidade ?? 0), 0);
    const lotes = lotesNoPasto.map(a => {
      const cat = animalCategories.find(c => c.id === a.categoria_id);
      return {
        nome:      a.nome || null,
        quantidade: a.quantidade,
        categoria: cat?.nome ?? null,
        bez:       a.bezerros_quantidade ?? 0,
      };
    });
    // T-282: regra 3-por-1 desativada — revisar se remove definitivamente
    // const bezEquiv = Math.floor(totalBez / 3);
    // const equivalentCab = totalCab + bezEquiv;
    const bezEquiv = 0;
    const equivalentCab = totalCab;
    return { totalCab, nLotes: lotesNoPasto.length, totalBez, bezEquiv, equivalentCab, lotes };
  }, [selectedPasto, pastures, animals, animalCategories]);

  /* Fallback A-15: pasto → lotes atuais (para registros sem campo lote) */
  const pastoAnimaisNomesMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const a of animals) {
      if (!a.pasto_id || !a.nome) continue;
      const pasture = pastures.find(p => p.id === a.pasto_id);
      if (!pasture) continue;
      if (!map[pasture.nome]) map[pasture.nome] = [];
      map[pasture.nome].push(a.nome);
    }
    return map;
  }, [animals, pastures]);

  /* Auto-fill: peso da sacaria */
  const suppInfo = useMemo(() => {
    if (!selectedTipo) return null;
    const st = supplementTypes.find(s => s.nome === selectedTipo);
    return st ? { peso: st.peso ?? 25, unidade: st.unidade } : null;
  }, [selectedTipo, supplementTypes]);

  const suppInfoBez = useMemo(() => {
    if (!selectedTipoBez) return null;
    const st = supplementTypes.find(s => s.nome === selectedTipoBez);
    return st ? { peso: st.peso ?? 25, unidade: st.unidade } : null;
  }, [selectedTipoBez, supplementTypes]);

  const pesoSaco      = suppInfo?.peso ?? 25;
  const kgCalculado   = Number(sacos) > 0 ? Number(sacos) * pesoSaco : 0;
  const pesoSacoBez   = suppInfoBez?.peso ?? 25;
  const kgCalculadoBez = Number(sacosBez) > 0 ? Number(sacosBez) * pesoSacoBez : 0;

  /* Supplement options: DB first, fallback to static */
  const tipoOptions = supplementTypes.length > 0
    ? supplementTypes.map(s => s.nome)
    : supplementOrder;

  function executarLancamento(data: FormFields) {
    const bezTemSuppProprio = !!(data.tipoBez && Number(data.sacosBez) > 0 && (pastoInfo?.totalBez ?? 0) > 0);
    const adultoPreenchido  = !!(data.tipo && Number(data.sacos) > 0);

    const qtdAdulto = bezTemSuppProprio
      ? (pastoInfo?.totalCab ?? 0)
      : (pastoInfo?.equivalentCab ?? pastoInfo?.totalCab ?? 0);

    const lotesNomes = pastoInfo?.lotes.map(l => l.nome).filter((n): n is string => !!n).join(', ') || undefined;

    if (adultoPreenchido) {
      const entry: DataEntry = {
        pasto:               data.pasto,
        quantidade:          qtdAdulto,
        tipo:                data.tipo,
        supplement_type_id:  supplementTypes.find(s => s.nome === data.tipo)?.id,
        periodo:             0,
        data:                data.data,
        sacos:               Number(data.sacos),
        kg:                  kgCalculado,
        consumo:             0,
        funcionario:         data.funcionario || undefined,
        lote:                lotesNomes,
      };
      addEntry(entry);
      toast.success('Registro adicionado!', { description: `${entry.pasto} — ${entry.tipo}` });
      logActivity({
        farmId:      farmId,
        userId:      user?.id ?? '',
        userName:    user?.name ?? '',
        module:      'formulario',
        action:      'criou',
        description: `${entry.pasto} · ${entry.tipo} · ${entry.sacos} sac. · ${entry.kg} kg · ${(entry.data ?? '').slice(8)}/${(entry.data ?? '').slice(5,7)}/${(entry.data ?? '').slice(2,4)}`,
      });
    }

    if (data.tipoBez && Number(data.sacosBez) > 0 && pastoInfo && pastoInfo.totalBez > 0) {
      const entryBez: DataEntry = {
        pasto:               data.pasto,
        quantidade:          pastoInfo.totalBez,
        tipo:                data.tipoBez,
        supplement_type_id:  supplementTypes.find(s => s.nome === data.tipoBez)?.id,
        periodo:             0,
        data:                data.data,
        sacos:               Number(data.sacosBez),
        kg:                  kgCalculadoBez,
        consumo:             0,
        funcionario:         data.funcionario || undefined,
        lote:                lotesNomes,
      };
      addEntry(entryBez);
      toast.success('Bezerros adicionados!', { description: `${entryBez.pasto} — ${entryBez.tipo} (${fmtInt(pastoInfo.totalBez)} bez.)` });
      logActivity({
        farmId:      farmId,
        userId:      user?.id ?? '',
        userName:    user?.name ?? '',
        module:      'formulario',
        action:      'criou',
        description: `${entryBez.pasto} · ${entryBez.tipo} (bezerros) · ${entryBez.sacos} sac. · ${entryBez.kg} kg · ${(entryBez.data ?? '').slice(8)}/${(entryBez.data ?? '').slice(5,7)}/${(entryBez.data ?? '').slice(2,4)}`,
      });
    }

    // Manter dados do formulário — apenas limpar sacos para próximo lançamento
    setValue('sacos', 0);
    setValue('sacosBez', 0);
  }

  const onAddRow = (data: FormFields) => {
    const bezTemSuppProprio = !!(data.tipoBez && Number(data.sacosBez) > 0 && (pastoInfo?.totalBez ?? 0) > 0);
    const adultoPreenchido  = !!(data.tipo && Number(data.sacos) > 0);

    if (!adultoPreenchido && !bezTemSuppProprio) {
      toast.error('Preencha o suplemento do adulto ou dos bezerros.');
      return;
    }

    // Verificar duplicata: mesmo pasto + data + tipo já lançado neste mês
    const isDuplicate = adultoPreenchido && visibleEntries.some(
      e => e.pasto === data.pasto && e.data === data.data && e.tipo === data.tipo
    );

    if (isDuplicate) {
      toast.warning(
        `Já existe "${data.tipo}" para ${data.pasto} nesta data. Adicionar mesmo assim?`,
        {
          duration: 10000,
          action: { label: 'Sim, adicionar', onClick: () => executarLancamento(data) },
        }
      );
      return;
    }

    executarLancamento(data);
  };

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-6xl mx-auto space-y-6"
      >
        {/* ── Page Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
              Suplemento Control
            </p>
            <h1 className="text-3xl font-bold text-gray-900">Formulário de Lançamento</h1>
            <p className="text-sm text-gray-500 mt-1">
              Insira os dados por pasto e suplemento. Estes dados alimentam o relatório e os gráficos.
            </p>
          </div>
          <Link
            to="/"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shadow-sm"
          >
            <BarChart3 className="w-4 h-4" />
            Ir para Relatórios
          </Link>
        </div>

        {/* ── Card: Novo Registro ── */}
        {canEdit && <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Card header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">Novo Registro</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSubmit(onAddRow)}
                disabled={isActiveClosed}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </button>
            </div>
          </div>

          {/* Form body */}
          <form onSubmit={handleSubmit(onAddRow)} className="p-6 space-y-4">
            {/* Row 1: Pasto | Data */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Pasto</label>
                <select
                  {...register('pasto', { required: true })}
                  disabled={loading || loadingData}
                  className={`${inputClass} cursor-pointer ${errors.pasto ? 'ring-2 ring-red-400' : ''}`}
                >
                  {(loading || loadingData) ? (
                    <option disabled value="">Carregando...</option>
                  ) : (
                    <>
                      <option value="">Selecione</option>
                      {pastures.map(p => (
                        <option key={p.id} value={p.nome}>{p.nome}</option>
                      ))}
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className={labelClass}>Data do lançamento</label>
                <input
                  type="date"
                  max={today}
                  {...register('data', { required: true })}
                  className={`${inputClass} ${errors.data ? 'ring-2 ring-red-400' : ''}`}
                />
              </div>
            </div>

            {/* Row 2: Tipo Suplemento | Animais no Pasto (read-only) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Tipo de Suplemento</label>
                <select
                  {...register('tipo')}
                  disabled={loadingData}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value="">Selecione</option>
                  {tipoOptions.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {suppInfo && (
                  <p className="mt-1 text-xs text-gray-400 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Peso por {suppInfo.unidade.toLowerCase()}: <strong className="text-gray-600">{suppInfo.peso ?? 25} kg</strong>
                  </p>
                )}
              </div>

              {/* Card de animais no pasto — read-only */}
              <div>
                <label className={labelClass}>Animais no Pasto</label>
                {pastoInfo ? (
                  <div
                    className="w-full rounded-lg px-3 py-2.5 text-sm"
                    style={{ background: 'rgba(26,96,64,0.05)', border: '1px solid rgba(26,96,64,0.18)' }}
                  >
                    {/* Resumo: total cab + total bez */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: '#1a6040' }}>
                        {fmtInt(pastoInfo.totalCab)} cab.
                      </span>
                      {pastoInfo.totalBez > 0 && (
                        <span className="text-xs font-semibold text-orange-500">
                          + {fmtInt(pastoInfo.totalBez)} bez.
                        </span>
                      )}
                    </div>
                    {/* T-282: exibição "Equiv. adulto (gado + ⌊bez÷3⌋)" desativada — revisar
                    {pastoInfo.bezEquiv > 0 && (
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        Equiv. adulto: <span className="font-semibold" style={{color:'#1a6040'}}>{pastoInfo.equivalentCab} cab.</span> <span className="text-gray-400">(gado + ⌊bez÷3⌋)</span>
                      </p>
                    )} */}

                    {/* Detalhe por lote */}
                    {pastoInfo.nLotes >= 1 && (
                      <div className="mt-2 space-y-1" style={{ borderTop: '1px solid rgba(26,96,64,0.15)', paddingTop: '6px' }}>
                        {pastoInfo.lotes.map((lote, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-gray-500 truncate max-w-[120px]">
                              {lote.nome ?? `Lote ${i + 1}`}
                              {lote.categoria && <span className="ml-1 text-gray-400">· {lote.categoria}</span>}
                            </span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="font-semibold" style={{ color: '#1a6040' }}>{fmtInt(lote.quantidade)} cab.</span>
                              {lote.bez > 0 && (
                                <span className="font-semibold text-orange-500">+{fmtInt(lote.bez)} bez.</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Categoria quando há só 1 lote */}
                    {pastoInfo.nLotes === 1 && pastoInfo.lotes[0]?.categoria && (
                      <p className="mt-0.5 text-xs text-gray-400">{pastoInfo.lotes[0].categoria}</p>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-10 px-3 rounded-lg bg-gray-100 text-sm text-gray-400 flex items-center">
                    Selecione um pasto
                  </div>
                )}
              </div>
            </div>

            {/* Row 3: Funcionário */}
            <div>
              <label className={labelClass}>Funcionário</label>
              <select
                {...register('funcionario')}
                disabled={loadingData || employees.length === 0}
                className={`${inputClass} cursor-pointer`}
              >
                {employees.length === 0 ? (
                  <option value="">Nenhum funcionário cadastrado</option>
                ) : (
                  <>
                    <option value="">Selecione (opcional)</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.nome}>
                        {e.nome}{e.funcao ? ` — ${e.funcao}` : ''}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            {/* Row 4: Sacos | KG (auto-calc) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  {suppInfo?.peso ? `PESO SACARIA (${suppInfo.peso} kg)` : 'PESO SACARIA'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="0"
                  {...register('sacos', { valueAsNumber: true })}
                  disabled={!!selectedTipo && (!suppInfo || !suppInfo.peso)}
                  className={`${inputClass} ${!!selectedTipo && (!suppInfo || !suppInfo.peso) ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
              <div>
                <label className={labelClass}>Ofertado (kg)</label>
                <input
                  type="text"
                  readOnly
                  value={kgCalculado > 0 ? fmtInt(kgCalculado) : '0'}
                  className="w-full h-10 px-3 rounded-lg bg-gray-100 text-sm text-gray-400 cursor-not-allowed"
                />
              </div>
            </div>

            {/* ── Seção Bezerros (condicional) ── */}
            {(pastoInfo?.totalBez ?? 0) > 0 && (
              <div
                className="rounded-xl p-4 space-y-3"
                style={{ background: 'rgba(251,146,60,0.07)', border: '1px solid rgba(251,146,60,0.25)' }}
              >
                {/* Header da seção */}
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: '#f97316' }}
                  />
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#ea580c' }}>
                    Suplemento dos Bezerros — {fmtInt(pastoInfo!.totalBez)} cab.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Tipo Suplemento Bezerro */}
                  <div>
                    <label className={labelClass}>Tipo de Suplemento do Bezerro</label>
                    <select
                      {...register('tipoBez')}
                      disabled={loadingData}
                      className={`${inputClass} cursor-pointer`}
                    >
                      <option value="">Selecione (opcional)</option>
                      {tipoOptions.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    {suppInfoBez && (
                      <p className="mt-1 text-xs text-gray-400 flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        Peso por {suppInfoBez.unidade.toLowerCase()}: <strong className="text-gray-600">{suppInfoBez.peso ?? 25} kg</strong>
                      </p>
                    )}
                  </div>

                  {/* Sacos Bezerros */}
                  <div>
                    <label className={labelClass}>
                      {suppInfoBez ? `${suppInfoBez.unidade} por Bezerros (${suppInfoBez.peso ?? 25} kg cada)` : 'Sacos por Bezerros'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="0"
                      {...register('sacosBez', { valueAsNumber: true })}
                      className={inputClass}
                    />
                    {kgCalculadoBez > 0 && (
                      <p className="mt-1 text-xs text-gray-400">
                        Ofertado: <strong className="text-gray-600">{fmtInt(kgCalculadoBez)} kg</strong>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>}

        {/* ── Card: Registros Salvos ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-gray-900">Registros Salvos</h2>
              <span className="text-xs font-semibold text-gray-400">{ymLabel(activeMonth)}</span>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={savedFilter}
                  onChange={e => setSavedFilter(e.target.value)}
                  placeholder="Filtrar..."
                  className="h-8 pl-8 pr-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  style={{ width: 160 }}
                />
                {savedFilter && <button onClick={() => setSavedFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="w-3 h-3" /></button>}
              </div>
            </div>
            {/* Botão Fechar / Reabrir Mês — apenas quem pode editar */}
            {canEdit && <button
              type="button"
              onClick={() => isActiveClosed
                ? abrirModalSenha('reabrir', activeMonth)
                : abrirModalSenha('fechar', activeMonth)
              }
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                isActiveClosed
                  ? 'border-amber-400 text-amber-600 bg-amber-50 hover:bg-amber-100'
                  : 'border-[#1a6040] text-[#1a6040] bg-[#f0f7f4] hover:bg-[#e0f0ea]'
              }`}
            >
              {isActiveClosed ? <LockOpen className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              {isActiveClosed ? `Reabrir ${ymLabel(activeMonth)}` : `Fechar ${ymLabel(activeMonth)}`}
            </button>}
          </div>

          {/* ── Chips de mês ── */}
          {monthOptions.length > 0 && (
            <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 bg-gray-50/60 flex-wrap">
              {monthOptions.map(ym => {
                const closed = closedMonths.has(ym);
                const active = ym === activeMonth;
                const hasEntries = entries.some(e => e.data?.startsWith(ym));
                return (
                  <button
                    key={ym}
                    onClick={() => {
                      setActiveMonth(ym);
                      if (closed && !active) abrirModalSenha('reabrir', ym);
                    }}
                    title={closed ? `Clique para reabrir ${ymLabel(ym)}` : ymLabel(ym)}
                    className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                      active
                        ? 'text-white shadow'
                        : closed
                          ? 'bg-amber-50 border border-amber-300 text-amber-600 hover:bg-amber-100'
                          : hasEntries
                            ? 'bg-white border border-gray-300 text-gray-600 hover:border-gray-400'
                            : 'bg-gray-50 border border-gray-200 text-gray-400 hover:border-gray-300'
                    }`}
                    style={active && !closed ? { backgroundColor: '#1a6040' } : active && closed ? { backgroundColor: '#d97706' } : {}}
                  >
                    {closed && <Lock className="w-3 h-3" />}
                    {ymLabel(ym)}
                  </button>
                );
              })}
            </div>
          )}

          {filteredEntries.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              {isActiveClosed ? (
                <>
                  <Lock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="font-medium">Mês {ymLabel(activeMonth)} fechado.</p>
                  <p className="text-sm mt-1">Selecione outro mês ou aguarde o próximo período.</p>
                </>
              ) : (
                <>
                  <p className="font-medium">Nenhum registro em {ymLabel(activeMonth)}.</p>
                  <p className="text-sm mt-1">Preencha o formulário acima para adicionar.</p>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Pasto</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Lotes</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantidade</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tipo de Suplemento</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Sacos</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Ofertado (kg)</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Funcionário</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredEntries.map((entry, index) => {
                    if (editingId === entry.id) {
                      return (
                        <EntryEditRow
                          key={entry.id}
                          entry={entry}
                          pastures={pastures}
                          tipoOptions={tipoOptions}
                          supplementTypes={supplementTypes}
                          onSave={(patch) => {
                            updateEntry(entry.id!, patch);
                            setEditingId(null);
                            toast.success('Registro atualizado!');
                          }}
                          onCancel={() => setEditingId(null)}
                        />
                      );
                    }
                    return (
                      <motion.tr
                        key={entry.id ?? index}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(index * 0.02, 0.3) }}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-6 py-3 text-gray-900 font-medium">{entry.pasto}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {entry.data ? new Date(entry.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                        </td>
                        {(() => {
                          const loteFallback = pastoAnimaisNomesMap[entry.pasto]?.join(', ') || null;
                          const loteDisplay = entry.lote || loteFallback;
                          return (
                            <td className="px-4 py-3 text-xs max-w-[140px] truncate" title={loteDisplay || ''}
                              style={{ color: loteDisplay ? (entry.lote ? undefined : '#9ca3af') : undefined }}
                            >
                              {loteDisplay || <span className="text-gray-300">—</span>}
                            </td>
                          );
                        })()}
                        <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: '#1a6040' }}>{fmtInt(entry.quantidade)}</td>
                        <td className="px-4 py-3 text-gray-700">{entry.tipo}</td>
                        <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: '#1a6040' }}>{entry.sacos % 1 !== 0 ? entry.sacos.toLocaleString('pt-BR') : fmtInt(entry.sacos)}</td>
                        <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: '#1a6040' }}>{fmtInt(entry.kg)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{entry.funcionario ?? '—'}</td>
                        <td className="px-4 py-3">
                          {isActiveClosed ? (
                            <Lock className="w-4 h-4 text-gray-300" />
                          ) : canEdit ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setPendingEditId(entry.id ?? null)}
                                className="text-gray-400 hover:text-teal-600 hover:bg-teal-50 p-1.5 rounded transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setConfirmDelete({
                                  index: entries.indexOf(entry),
                                  label: `${entry.pasto} — ${entry.tipo}${entry.data ? ' (' + new Date(entry.data + 'T12:00:00').toLocaleDateString('pt-BR') + ')' : ''}`,
                                })}
                                className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td className="px-6 py-2.5 text-xs font-semibold text-gray-500" colSpan={5}>
                      {savedFilter ? `${filteredEntries.length} de ${visibleEntries.length} registros` : `${visibleEntries.length} registro${visibleEntries.length !== 1 ? 's' : ''}`}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-bold tabular-nums" style={{ color: '#1a6040' }}>
                      {filteredEntries.reduce((s, e) => s + e.sacos, 0).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-bold tabular-nums" style={{ color: '#1a6040' }}>
                      {filteredEntries.reduce((s, e) => s + e.kg, 0).toLocaleString('pt-BR')}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* ── Modal de confirmação de edição (senha do login) ── */}
      {pendingEditId && (
        <PasswordConfirmModal
          title="Editar registro?"
          description="Para editar um registro salvo é necessário confirmar sua senha."
          onConfirm={async (password) => {
            const ok = await verifyPassword(user!.email, password);
            if (!ok) throw new Error('Senha incorreta');
            setEditingId(pendingEditId);
            setPendingEditId(null);
          }}
          onCancel={() => setPendingEditId(null)}
        />
      )}

      {/* ── Modal de confirmação de exclusão (senha do login) ── */}
      {confirmDelete && (
        <PasswordConfirmModal
          title="Excluir registro?"
          description={confirmDelete.label}
          onConfirm={async (password) => {
            const ok = await verifyPassword(user!.email, password);
            if (!ok) throw new Error('Senha incorreta');
            const label = confirmDelete!.label;
            removeEntry(confirmDelete!.index);
            setConfirmDelete(null);
            toast.success('Registro excluído.');
            logActivity({ farmId, userId: user?.id ?? '', userName: user?.name ?? '', module: 'formulario', action: 'excluiu', description: label });
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* ── Modal de senha (fechar / reabrir mês) ── */}
      {senhaModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setSenhaModal(null)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <motion.div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10 p-6"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: senhaModal.acao === 'fechar' ? 'rgba(26,96,64,0.1)' : 'rgba(217,119,6,0.1)' }}>
                <KeyRound className="w-5 h-5" style={{ color: senhaModal.acao === 'fechar' ? '#1a6040' : '#d97706' }} />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {senhaModal.acao === 'fechar' ? `Fechar ${ymLabel(senhaModal.alvo)}` : `Reabrir ${ymLabel(senhaModal.alvo)}`}
                </h2>
                <p className="text-xs text-gray-400">Digite a senha para confirmar</p>
              </div>
            </div>

            <div className="relative mb-1">
              <input
                type={showSenha ? 'text' : 'password'}
                autoFocus
                autoComplete="new-password"
                value={senhaInput}
                onChange={e => { setSenhaInput(e.target.value); setSenhaErro(false); }}
                onKeyDown={e => e.key === 'Enter' && confirmarSenha()}
                placeholder="Senha"
                className={`w-full h-10 px-3 pr-10 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-colors ${
                  senhaErro
                    ? 'border-red-400 bg-red-50 focus:ring-red-400'
                    : 'border-gray-200 bg-gray-50 focus:ring-teal-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowSenha(p => !p)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {senhaErro && (
              <p className="text-xs text-red-500 mb-3">Senha incorreta. Tente novamente.</p>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setSenhaModal(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarSenha}
                disabled={!senhaInput}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40"
                style={{ background: senhaModal.acao === 'fechar' ? '#1a6040' : '#d97706' }}
              >
                {senhaModal.acao === 'fechar' ? 'Fechar Mês' : 'Reabrir Mês'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
