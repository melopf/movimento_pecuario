import { useState, useEffect, Fragment } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Leaf, Beef, Package, Users, Plus, Pencil, Trash2, Save, X, MapPin, Sprout, Tag, Search, ChevronDown, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseAdmin } from '../lib/supabase';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { SkeletonTable } from '../components/Skeleton';
import { META_CONSUMO } from '../lib/data';
import { PasswordConfirmModal } from '../components/PasswordConfirmModal';
import { verifyPassword } from '../lib/verifyPassword';

const inputClass =
  'w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

/** Wraps an RHF register result to force UPPERCASE on typing */
function upperReg<T extends { onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }>(reg: T): T & { style: { textTransform: 'uppercase' } } {
  const { onChange, ...rest } = reg;
  return {
    ...rest,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      e.target.value = e.target.value.toUpperCase();
      onChange(e);
    },
    style: { textTransform: 'uppercase' as const },
  } as T & { style: { textTransform: 'uppercase' } };
}

/** Format phone number: (XX) XXXXX-XXXX */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/* ── Local types ── */
interface AnimalCategory  { id: string; farm_id: string; nome: string; observacoes?: string; }
interface Animal          { id: string; farm_id: string; nome: string; quantidade: number; raca?: string; categoria_id?: string; peso_medio?: number; sexo?: string; prenha?: boolean; bezerros_quantidade?: number; bezerros_peso_medio?: number; observacoes?: string; }
interface SupplementType  { id: string; farm_id: string; nome: string; unidade: string; peso?: number; valor_kg?: number; consumo?: string; meta_pct?: string; observacoes?: string; }
interface Employee        { id: string; farm_id: string; nome: string; funcao?: string; contato?: string; }

const RACAS = ['NELORE', 'CRUZAMENTO INDUSTRIAL', 'COMPOSTO'] as const;
const QUALIDADES_FORRAGEM = ['REGULAR', 'BOA', 'ÓTIMA'] as const;

const FORRAGENS = [
  'Andropogon', 'Anoni', 'Australiano', 'Azeven',
  'B Brizantha', 'B. Decumbens', 'B. Dictioneura', 'B. Humidicola (Quicuia)',
  'B. MG-5', 'B. Paiaguas', 'B. Piatã', 'B. Ruzizienses',
  'BRS Planaltina', 'BRS Sarabndi', 'Dunamis', 'Jaragua',
  'Mavuno', 'Navalhão', 'P. Massai', 'P. Miyagi',
  'P. Mombaça', 'P. Quenia', 'P. Tamani', 'P. Zuri',
  'Tangola', 'Tifiton', 'Tiriricão',
] as const;

/* ── Tab definition ── */
const TABS = [
  { key: 'pastos',       label: 'Pastos',       icon: Leaf,         adminOnly: false },
  { key: 'animais',      label: 'Animais',      icon: Beef,         adminOnly: false },
  { key: 'forragens',    label: 'Forragens',    icon: Sprout,       adminOnly: false },
  { key: 'suplementos',  label: 'Suplementos',  icon: Package,      adminOnly: false },
  { key: 'funcionarios', label: 'Funcionários', icon: Users,        adminOnly: false },
  { key: 'simulados',    label: 'Simulador',    icon: FlaskConical, adminOnly: true  },
];

type TabKey = 'pastos' | 'animais' | 'forragens' | 'suplementos' | 'funcionarios' | 'simulados';

/* ── Reusable helpers ── */

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors shadow-sm">
      <Plus className="w-4 h-4" /> {label}
    </button>
  );
}

function ActionBtns({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onEdit} className="p-1.5 rounded text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"><Pencil className="w-4 h-4" /></button>
      <button onClick={onDelete} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}

function SaveCancelBtns({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex gap-2">
      <button onClick={onSave} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors">
        <Save className="w-3.5 h-3.5" /> Salvar
      </button>
      <button onClick={onCancel} className="p-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Generic simple CRUD tab (nome + observacoes)
   Used for: Retiros, Forragens, AnimalCategories
═══════════════════════════════════════════════════════════════ */

interface SimpleItem { id: string; farm_id: string; nome: string; observacoes?: string; }
interface SimpleForm { nome: string; observacoes: string; }

function SimpleEditRow({ item, onSave, onCancel, predefinedOptions }: {
  item: SimpleItem; onSave: (d: SimpleForm) => void; onCancel: () => void;
  predefinedOptions?: readonly string[];
}) {
  const { register, handleSubmit } = useForm<SimpleForm>({
    defaultValues: { nome: item.nome, observacoes: item.observacoes || '' },
  });
  return (
    <tr className="bg-teal-50">
      <td className="px-4 py-2">
        {predefinedOptions ? (
          <>
            <input list={`sugg-edit-${item.id}`} {...register('nome', { required: true })} className={inputClass} placeholder="Digite ou selecione..." />
            <datalist id={`sugg-edit-${item.id}`}>
              {predefinedOptions.map(o => <option key={o} value={o} />)}
            </datalist>
          </>
        ) : (
          <input {...upperReg(register('nome', { required: true }))} className={inputClass} />
        )}
      </td>
      <td className="px-4 py-2"><input {...upperReg(register('observacoes'))} className={inputClass} /></td>
      <td className="px-4 py-2"><SaveCancelBtns onSave={handleSubmit(onSave)} onCancel={onCancel} /></td>
    </tr>
  );
}

type DeleteTarget = { id: string; label: string; onDelete: () => Promise<void> };
type EditTarget   = { id: string; label: string; onEdit: () => void };

function SimpleTab({
  table, label, icon: Icon, emptyText, newLabel, onDataChange, initialItems, predefinedOptions, onRequestDelete, onRequestEdit, canEdit = true,
}: {
  table: string; label: string; icon: React.ElementType;
  emptyText: string; newLabel: string;
  onDataChange?: (items: SimpleItem[]) => void;
  initialItems?: SimpleItem[];
  predefinedOptions?: readonly string[];
  onRequestDelete?: (target: DeleteTarget) => void;
  onRequestEdit?: (target: EditTarget) => void;
  canEdit?: boolean;
}) {
  const { activeFarmId } = useData();
  const [items, setItems] = useState<SimpleItem[]>(initialItems ?? []);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const { register, handleSubmit, reset, formState: { errors } } = useForm<SimpleForm>();

  useEffect(() => {
    if (!activeFarmId) return;
    let mounted = true;
    setLoading(true);
    const tid = setTimeout(() => { if (mounted) setLoading(false); }, 15_000);
    (async () => {
      try {
        const { data } = await supabaseAdmin.from(table).select('*').eq('farm_id', activeFarmId).order('nome');
        if (!mounted) return;
        const list = data ?? [];
        setItems(list);
        onDataChange?.(list);
      } finally {
        clearTimeout(tid);
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; clearTimeout(tid); };
  }, [activeFarmId, table]);

  function notify(list: SimpleItem[]) { setItems(list); onDataChange?.(list); }

  async function onAdd(data: SimpleForm) {
    if (!activeFarmId) return;
    const dup = items.find(i => i.nome.trim().toLowerCase() === data.nome.trim().toLowerCase());
    if (dup) { toast.error(`Já existe um "${label}" com este nome.`); return; }
    const { data: row, error } = await supabaseAdmin.from(table)
      .insert({ nome: data.nome, observacoes: data.observacoes || null, farm_id: activeFarmId })
      .select().single();
    if (error) { toast.error('Erro ao adicionar.'); return; }
    notify([...items, row].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
    toast.success(`${label} adicionado!`, { description: data.nome });
    reset(); setShowAdd(false);
  }

  async function onEditSave(id: string, data: SimpleForm) {
    const { error } = await supabaseAdmin.from(table).update({ nome: data.nome, observacoes: data.observacoes || null }).eq('id', id);
    if (error) { toast.error('Erro ao atualizar.'); return; }
    notify(items.map(i => i.id === id ? { ...i, ...data } : i));
    toast.success(`${label} atualizado!`); setEditingId(null);
  }

  function onDelete(id: string, nome: string) {
    if (onRequestDelete) {
      onRequestDelete({
        id,
        label: `Remover ${label} "${nome}"?`,
        onDelete: async () => {
          const { error } = await supabaseAdmin.from(table).delete().eq('id', id);
          if (error) throw new Error('Erro ao remover.');
          notify(items.filter(i => i.id !== id));
        },
      });
    } else {
      if (!window.confirm(`Remover "${nome}"?`)) return;
      supabaseAdmin.from(table).delete().eq('id', id).then(({ error }) => {
        if (error) { toast.error('Erro ao remover.'); return; }
        notify(items.filter(i => i.id !== id));
        toast.success(`${label} removido.`);
      });
    }
  }

  const filteredSimple = search.trim()
    ? items.filter(i => i.nome.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Filtrar ${label.toLowerCase()}...`}
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
          />
        </div>
        {canEdit && <AddBtn label={newLabel} onClick={() => setShowAdd(v => !v)} />}
      </div>

      {showAdd && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-teal-200 shadow-sm p-6 mb-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Adicionar {label}</h2>
          <form onSubmit={handleSubmit(onAdd)} className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nome *</label>
              {predefinedOptions ? (
                <>
                  <input list={`sugg-add-${label}`} placeholder="Digite ou selecione..."
                    {...register('nome', { required: true })}
                    className={`${inputClass} ${errors.nome ? 'border-red-400' : ''}`} />
                  <datalist id={`sugg-add-${label}`}>
                    {predefinedOptions.map(o => <option key={o} value={o} />)}
                  </datalist>
                </>
              ) : (
                <input placeholder={`Ex.: ${label}`} {...upperReg(register('nome', { required: true }))}
                  className={`${inputClass} ${errors.nome ? 'border-red-400' : ''}`} />
              )}
            </div>
            <div>
              <label className={labelClass}>Observações</label>
              <input placeholder="Ex.: Info adicional" {...upperReg(register('observacoes'))} className={inputClass} />
            </div>
            <div className="col-span-2 flex gap-3">
              <button type="submit" className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors">
                <Plus className="w-4 h-4" /> Adicionar
              </button>
              <button type="button" onClick={() => { setShowAdd(false); reset(); }}
                className="px-4 py-2.5 rounded-xl border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {loading ? <SkeletonTable rows={4} cols={3} /> : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {items.length === 0 ? (
            <div className="py-16 text-center">
              <Icon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">{emptyText}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Nome', 'Observações', 'Ações'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSimple.length === 0 && search ? (
                    <tr><td colSpan={3} className="py-8 text-center text-sm text-gray-400">Nenhum resultado para "{search}"</td></tr>
                  ) : filteredSimple.map(item =>
                    editingId === item.id ? (
                      <SimpleEditRow key={item.id} item={item}
                        onSave={d => onEditSave(item.id, d)} onCancel={() => setEditingId(null)}
                        predefinedOptions={predefinedOptions} />
                    ) : (
                      <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <div className="flex items-center gap-2"><Icon className="w-3.5 h-3.5 text-teal-500" />{item.nome}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{item.observacoes || '—'}</td>
                        <td className="px-4 py-3">
                          {canEdit && <ActionBtns
                            onEdit={() => onRequestEdit
                              ? onRequestEdit({ id: item.id, label: `Editar ${label} "${item.nome}"`, onEdit: () => setEditingId(item.id) })
                              : setEditingId(item.id)}
                            onDelete={() => onDelete(item.id, item.nome)} />}
                        </td>
                      </motion.tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PastosTab — reutiliza DataContext
═══════════════════════════════════════════════════════════════ */
interface PastureForm { nome: string; area: number; retiro_id: string; forragem: string; qualidade_forragem: string; observacoes: string; }

function PastureEditRow({ pasture, retiros, forragens, onSave, onCancel }: {
  pasture: { id: string; nome: string; area?: number; retiro_id?: string; forragem?: string; qualidade_forragem?: string; observacoes?: string };
  retiros: SimpleItem[];
  forragens: string[];
  onSave: (data: PastureForm) => void; onCancel: () => void;
}) {
  const { register, handleSubmit } = useForm<PastureForm>({
    defaultValues: {
      nome: pasture.nome,
      area: pasture.area ?? 0,
      retiro_id: pasture.retiro_id || '',
      forragem: pasture.forragem || '',
      qualidade_forragem: pasture.qualidade_forragem || '',
      observacoes: pasture.observacoes || '',
    },
  });
  return (
    <tr className="bg-teal-50">
      <td className="px-4 py-2"><input {...upperReg(register('nome', { required: true }))} className={inputClass} placeholder="Nome" /></td>
      <td className="px-4 py-2"><input type="number" step="0.01" {...register('area', { min: 0, valueAsNumber: true })} className={inputClass} placeholder="0.0" /></td>
      <td className="px-4 py-2">
        <select {...register('retiro_id')} className={inputClass}>
          <option value="">— Sem retiro —</option>
          {retiros.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <select {...register('forragem')} className={inputClass}>
          <option value="">— Selecione —</option>
          {forragens.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <select {...register('qualidade_forragem')} className={inputClass}>
          <option value="">— Qualidade —</option>
          {QUALIDADES_FORRAGEM.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
      </td>
      <td className="px-4 py-2"><input {...upperReg(register('observacoes'))} className={inputClass} placeholder="Observações" /></td>
      <td className="px-4 py-2"><SaveCancelBtns onSave={handleSubmit(onSave)} onCancel={onCancel} /></td>
    </tr>
  );
}

function PastosTab({ onRequestDelete, onRequestEdit, canEdit = true }: { onRequestDelete?: (target: DeleteTarget) => void; onRequestEdit?: (target: EditTarget) => void; canEdit?: boolean }) {
  const { pastures, addPasture, deletePasture, updatePasture, loading } = useData();
  const [retiros, setRetiros] = useState<SimpleItem[]>([]);
  const [showRetiros, setShowRetiros] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [filterRetiro, setFilterRetiro] = useState('');
  const [dbForragens, setDbForragens] = useState<string[]>([]);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PastureForm>();
  const { activeFarmId } = useData();

  useEffect(() => {
    if (!activeFarmId) return;
    let mounted = true;
    (async () => {
      const retRes = await supabaseAdmin.from('retiros').select('*').eq('farm_id', activeFarmId).order('nome');
      if (mounted) {
        setRetiros(retRes.data ?? []);
      }
    })();
    return () => { mounted = false; };
  }, [activeFarmId]);

  useEffect(() => {
    if (!activeFarmId) return;
    supabaseAdmin.from('forage_types').select('nome').eq('farm_id', activeFarmId)
      .then(({ data }) => {
        if (data) {
          const names = (data as {nome:string}[]).map(f => f.nome).filter(n => !(FORRAGENS as readonly string[]).includes(n));
          setDbForragens(names);
        }
      });
  }, [activeFarmId]);
  const allForragens = [...FORRAGENS, ...dbForragens];

  function getRetiroName(id?: string) { return retiros.find(r => r.id === id)?.nome; }

  const filteredPastures = pastures.filter(p => {
    const matchText = !filterText || p.nome.toLowerCase().includes(filterText.toLowerCase());
    const matchRetiro = !filterRetiro || p.retiro_id === filterRetiro;
    return matchText && matchRetiro;
  });

  function onAdd(data: PastureForm) {
    const dup = pastures.find(p => p.nome.trim().toLowerCase() === data.nome.trim().toLowerCase());
    if (dup) { toast.error('Já existe um pasto com este nome.'); return; }
    addPasture({
      nome: data.nome,
      area: data.area > 0 ? data.area : undefined,   // NaN/0 vira undefined
      retiro_id: data.retiro_id || undefined,
      forragem: data.forragem || undefined,
      qualidade_forragem: data.qualidade_forragem || undefined,
      observacoes: data.observacoes,
    });
    toast.success('Pasto adicionado!', { description: data.nome });
    reset(); setShowAddForm(false);
  }
  async function onEditSave(id: string, data: PastureForm) {
    try {
      await updatePasture(id, {
        nome:               data.nome,
        area:               data.area > 0 ? data.area : undefined,
        retiro_id:          data.retiro_id || undefined,
        forragem:           data.forragem || undefined,
        qualidade_forragem: data.qualidade_forragem || undefined,
        observacoes:        data.observacoes,
      });
      toast.success('Pasto atualizado!'); setEditingId(null);
    } catch (err) {
      toast.error(`Erro ao salvar pasto: ${(err as Error).message}`);
    }
  }
  function onDelete(p: { id: string; nome: string }) {
    if (onRequestDelete) {
      onRequestDelete({
        id: p.id,
        label: `Remover o pasto "${p.nome}"?`,
        onDelete: async () => {
          await deletePasture(p.id);
        },
      });
    } else {
      if (!window.confirm(`Remover o pasto "${p.nome}"?`)) return;
      deletePasture(p.id)
        .then(() => toast.success('Pasto removido.'))
        .catch(() => toast.error('Não foi possível excluir. Este pasto possui lançamentos ou animais vinculados.'));
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Sub-seção Retiros (expansível) ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowRetiros(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <MapPin className="w-4 h-4 text-teal-600" />
            Retiros
            <span className="text-xs font-normal text-gray-400 ml-1">({retiros.length} cadastrados)</span>
          </div>
          <span className="text-gray-400 text-xs">{showRetiros ? '▲ Recolher' : '▼ Expandir'}</span>
        </button>
        {showRetiros && (
          <div className="border-t border-gray-100 p-5">
            <SimpleTab
              table="retiros"
              label="Retiro"
              icon={MapPin}
              emptyText="Nenhum retiro cadastrado"
              newLabel="Novo Retiro"
              initialItems={retiros}
              onDataChange={list => setRetiros(list)}
              onRequestDelete={onRequestDelete}
            />
          </div>
        )}
      </div>

      {/* ── Lista de Pastos ── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Filtrar por nome do pasto..."
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
            />
          </div>
          {/* Filtro por retiro */}
          <div className="relative">
            <select
              value={filterRetiro}
              onChange={e => setFilterRetiro(e.target.value)}
              className="h-9 pl-3 pr-8 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none cursor-pointer transition-colors"
              style={{ minWidth: 140 }}
            >
              <option value="">Todos os retiros</option>
              {retiros.map(r => (
                <option key={r.id} value={r.id}>{r.nome}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
          {canEdit && <AddBtn label="Novo Pasto" onClick={() => setShowAddForm(v => !v)} />}
        </div>
        {showAddForm && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl border border-teal-200 shadow-sm p-6 mb-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">Adicionar Pasto</h2>
            <form onSubmit={handleSubmit(onAdd)} className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nome *</label>
                <input placeholder="Ex.: Lagoa Verde" {...upperReg(register('nome', { required: true }))}
                  className={`${inputClass} ${errors.nome ? 'border-red-400' : ''}`} />
              </div>
              <div>
                <label className={labelClass}>Área (ha)</label>
                <input type="number" step="0.01" placeholder="Ex.: 10.5"
                  {...register('area', { min: 0, valueAsNumber: true })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Retiro <span className="text-gray-400 font-normal">(opcional)</span></label>
                <select {...register('retiro_id')} className={`${inputClass} cursor-pointer`}>
                  <option value="">— Sem retiro —</option>
                  {retiros.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Forragem</label>
                <select {...register('forragem')} className={`${inputClass} cursor-pointer`}>
                  <option value="">— Selecione —</option>
                  {allForragens.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Qualidade da Forragem</label>
                <select {...register('qualidade_forragem')} className={`${inputClass} cursor-pointer`}>
                  <option value="">— Selecione —</option>
                  {QUALIDADES_FORRAGEM.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Observações</label>
                <input placeholder="Ex.: Info adicional" {...upperReg(register('observacoes'))} className={inputClass} />
              </div>
              <div className="col-span-2 flex gap-3">
                <button type="submit" className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors">
                  <Plus className="w-4 h-4" /> Adicionar
                </button>
                <button type="button" onClick={() => { setShowAddForm(false); reset(); }}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        )}
        {loading ? <SkeletonTable rows={4} cols={7} /> : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {pastures.length === 0 ? (
              <div className="py-16 text-center">
                <Leaf className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Nenhum pasto cadastrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {['Nome do Pasto', 'Área (ha)', 'Retiro', 'Forragem', 'Qualidade', 'Observações', 'Ações'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredPastures.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-sm text-gray-400">
                          Nenhum pasto encontrado para "{filterText}"
                        </td>
                      </tr>
                    ) : filteredPastures.map(p =>
                      editingId === p.id ? (
                        <PastureEditRow key={p.id} pasture={p} retiros={retiros} forragens={allForragens}
                          onSave={d => onEditSave(p.id, d)} onCancel={() => setEditingId(null)} />
                      ) : (
                        <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900"><div className="flex items-center gap-2"><Leaf className="w-3.5 h-3.5 text-teal-500" />{p.nome}</div></td>
                          <td className="px-4 py-3 text-gray-600">{p.area ? `${p.area} ha` : '—'}</td>
                          <td className="px-4 py-3">
                            {getRetiroName(p.retiro_id)
                              ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700">{getRetiroName(p.retiro_id)}</span>
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{p.forragem || '—'}</td>
                          <td className="px-4 py-3">
                            {p.qualidade_forragem
                              ? <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  p.qualidade_forragem === 'ÓTIMA' ? 'bg-green-50 text-green-700' :
                                  p.qualidade_forragem === 'BOA'   ? 'bg-teal-50 text-teal-700' :
                                  'bg-yellow-50 text-yellow-700'
                                }`}>{p.qualidade_forragem}</span>
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{p.observacoes || '—'}</td>
                          <td className="px-4 py-3">{canEdit && <ActionBtns
                            onEdit={() => onRequestEdit
                              ? onRequestEdit({ id: p.id, label: `Editar pasto "${p.nome}"`, onEdit: () => setEditingId(p.id) })
                              : setEditingId(p.id)}
                            onDelete={() => onDelete(p)} />}</td>
                        </motion.tr>
                      )
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={7} className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400">
                        {filterText
                          ? `${filteredPastures.length} de ${pastures.length} pastos`
                          : `${pastures.length} pasto${pastures.length !== 1 ? 's' : ''} cadastrado${pastures.length !== 1 ? 's' : ''}`
                        }
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AnimaisTab — com sub-seção de Categorias
═══════════════════════════════════════════════════════════════ */
let _animaisCache: Animal[] = [];
let _acatCache: AnimalCategory[] = [];

interface AnimalForm { nome: string; quantidade: number; raca: string; categoria_id: string; peso_medio: number; sexo: string; prenha: boolean; bezerros_quantidade: number; bezerros_peso_medio: number; observacoes: string; }

function AnimalEditRow({ item, categories, onSave, onCancel }: {
  item: Animal; categories: AnimalCategory[];
  onSave: (d: AnimalForm) => void; onCancel: () => void;
}) {
  const [temBezerros, setTemBezerros] = useState(() => !!(item.bezerros_quantidade || item.bezerros_peso_medio));
  const [editSexo, setEditSexo] = useState(item.sexo || '');
  const { register, handleSubmit, setValue, watch } = useForm<AnimalForm>({
    defaultValues: { nome: item.nome, quantidade: item.quantidade, raca: item.raca || '', categoria_id: item.categoria_id || '', peso_medio: item.peso_medio ?? 0, sexo: item.sexo || '', prenha: item.prenha ?? false, bezerros_quantidade: item.bezerros_quantidade ?? 0, bezerros_peso_medio: item.bezerros_peso_medio ?? 0, observacoes: item.observacoes || '' },
  });
  const editPrenha = watch('prenha');
  function handleSave(data: AnimalForm) {
    onSave(!temBezerros ? { ...data, bezerros_quantidade: 0, bezerros_peso_medio: 0 } : data);
  }
  return (
    <tr className="bg-teal-50">
      <td className="px-4 py-2"><input {...upperReg(register('nome', { required: true }))} className={inputClass} /></td>
      <td className="px-4 py-2"><input type="number" min="0" {...register('quantidade', { min: 0, valueAsNumber: true })} className={inputClass} /></td>
      <td className="px-4 py-2">
        <select {...register('categoria_id')} className={inputClass}>
          <option value="">—</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </td>
      <td className="px-4 py-2"><input type="number" min="0" step="0.1" placeholder="kg" {...register('peso_medio', { valueAsNumber: true })} className={inputClass} /></td>
      <td className="px-4 py-2">
        <select {...register('raca')} className={inputClass}>
          <option value="">—</option>
          {RACAS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <select {...register('sexo')} className={inputClass} onChange={e => { setEditSexo(e.target.value); setValue('sexo', e.target.value); if (e.target.value !== 'FÊMEA') setValue('prenha', false); }}>
          <option value="">—</option>
          <option value="MACHO">MACHO</option>
          <option value="FÊMEA">FÊMEA</option>
          <option value="MISTURADO">MISTURADO</option>
        </select>
        {editSexo === 'FÊMEA' && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] text-pink-600 font-semibold">PRENHA?</span>
            <div className="flex rounded border border-gray-200 overflow-hidden text-[10px] font-medium">
              <button type="button" onClick={() => setValue('prenha', true)}
                className={`px-2 py-0.5 transition-colors ${editPrenha === true ? 'bg-pink-500 text-white' : 'bg-white text-gray-500'}`}>SIM</button>
              <button type="button" onClick={() => setValue('prenha', false)}
                className={`px-2 py-0.5 border-l border-gray-200 transition-colors ${editPrenha !== true ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-500'}`}>NÃO</button>
            </div>
          </div>
        )}
      </td>
      <td className="px-4 py-2">
        <div className="space-y-1">
          <div className="flex rounded border border-gray-200 overflow-hidden text-xs font-medium w-fit">
            <button type="button" onClick={() => setTemBezerros(true)}
              className={`px-2 py-1 transition-colors ${temBezerros ? 'bg-teal-600 text-white' : 'bg-white text-gray-500'}`}>Sim</button>
            <button type="button" onClick={() => setTemBezerros(false)}
              className={`px-2 py-1 border-l border-gray-200 transition-colors ${!temBezerros ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-500'}`}>Não</button>
          </div>
          <input type="number" min="0" placeholder="0" disabled={!temBezerros}
            {...register('bezerros_quantidade', { valueAsNumber: true })}
            className={`${inputClass} ${!temBezerros ? 'opacity-40 cursor-not-allowed' : ''}`} />
        </div>
      </td>
      <td className="px-4 py-2">
        <input type="number" min="0" step="0.1" placeholder="kg" disabled={!temBezerros}
          {...register('bezerros_peso_medio', { valueAsNumber: true })}
          className={`${inputClass} ${!temBezerros ? 'opacity-40 cursor-not-allowed' : ''}`} />
      </td>
      <td className="px-4 py-2"><input {...upperReg(register('observacoes'))} className={inputClass} /></td>
      <td className="px-4 py-2"><SaveCancelBtns onSave={handleSubmit(handleSave)} onCancel={onCancel} /></td>
    </tr>
  );
}

function AnimaisTab({ onRequestDelete, onRequestEdit, canEdit = true }: { onRequestDelete?: (target: DeleteTarget) => void; onRequestEdit?: (target: EditTarget) => void; canEdit?: boolean }) {
  const { activeFarmId } = useData();
  const [items, setItems] = useState<Animal[]>(_animaisCache);
  const [categories, setCategories] = useState<AnimalCategory[]>(_acatCache);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCatSection, setShowCatSection] = useState(false);
  const [search, setSearch] = useState('');
  const [temBezerros, setTemBezerros] = useState(false);
  const [addSexo, setAddSexo] = useState('');
  const { register, handleSubmit, reset, setValue: setAddValue, watch: addWatch, formState: { errors } } = useForm<AnimalForm>({
    defaultValues: { quantidade: 0, peso_medio: 0, prenha: false, bezerros_quantidade: 0, bezerros_peso_medio: 0 },
  });
  const addPrenha = addWatch('prenha');

  useEffect(() => {
    if (!activeFarmId) return;
    let mounted = true;
    setLoading(true);
    const tid = setTimeout(() => { if (mounted) setLoading(false); }, 15_000);
    (async () => {
      try {
        const [animRes, catRes] = await Promise.all([
          supabaseAdmin.from('animals').select('*').eq('farm_id', activeFarmId).order('nome'),
          supabaseAdmin.from('animal_categories').select('*').eq('farm_id', activeFarmId).order('nome'),
        ]);
        if (!mounted) return;
        _animaisCache = animRes.data ?? []; setItems(_animaisCache);
        _acatCache = catRes.data ?? []; setCategories(_acatCache);
      } finally {
        clearTimeout(tid);
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; clearTimeout(tid); };
  }, [activeFarmId]);

  async function onAdd(data: AnimalForm) {
    if (!activeFarmId) return;
    const dup = _animaisCache.find(a => a.nome.trim().toLowerCase() === data.nome.trim().toLowerCase());
    if (dup) { toast.error('Já existe um lote com este nome.'); return; }
    const pesoMedio = data.peso_medio > 0 ? data.peso_medio : null;
    const bezQtd    = temBezerros && data.bezerros_quantidade > 0 ? data.bezerros_quantidade : null;
    const bezPeso   = temBezerros && data.bezerros_peso_medio > 0 ? data.bezerros_peso_medio : null;
    const payload = {
      nome: data.nome, quantidade: data.quantidade,
      raca: data.raca || null, categoria_id: data.categoria_id || null,
      observacoes: data.observacoes || null, farm_id: activeFarmId,
      ...(data.sexo      && { sexo: data.sexo }),
      prenha: data.sexo === 'FÊMEA' ? (data.prenha ?? false) : false,
      ...(pesoMedio      && { peso_medio: pesoMedio }),
      ...(bezQtd         && { bezerros_quantidade: bezQtd }),
      ...(bezPeso        && { bezerros_peso_medio: bezPeso }),
    };
    const { data: row, error } = await supabaseAdmin.from('animals').insert(payload).select().single();
    if (error) { toast.error('Erro ao adicionar.'); return; }
    _animaisCache = [..._animaisCache, row]; setItems(_animaisCache);
    toast.success('Lote adicionado!', { description: data.nome });
    reset(); setTemBezerros(false); setShowAddForm(false);
  }

  async function onEditSave(id: string, data: AnimalForm) {
    const pesoMedio = data.peso_medio         > 0 ? data.peso_medio         : null;
    const bezQtd    = data.bezerros_quantidade > 0 ? data.bezerros_quantidade : null;
    const bezPeso   = data.bezerros_peso_medio > 0 ? data.bezerros_peso_medio : null;
    const payload = {
      nome:                data.nome,
      quantidade:          data.quantidade,
      raca:                data.raca || null,
      categoria_id:        data.categoria_id || null,
      observacoes:         data.observacoes || null,
      sexo:                data.sexo || null,
      prenha:              data.sexo === 'FÊMEA' ? (data.prenha ?? false) : false,
      peso_medio:          pesoMedio,
      bezerros_quantidade: bezQtd,
      bezerros_peso_medio: bezPeso,
    };
    const { data: updated, error } = await supabaseAdmin.from('animals').update(payload).eq('id', id).select();
    if (error) { toast.error(`Erro ao atualizar: ${error.message}`); return; }
    if (!updated || updated.length === 0) { toast.error('Não foi possível salvar. Verifique as permissões do banco.'); return; }
    const patchedPayload: Partial<Animal> = {
      nome:                payload.nome,
      quantidade:          payload.quantidade,
      raca:                payload.raca ?? undefined,
      categoria_id:        payload.categoria_id ?? undefined,
      observacoes:         payload.observacoes ?? undefined,
      sexo:                payload.sexo ?? undefined,
      prenha:              payload.prenha,
      peso_medio:          payload.peso_medio ?? undefined,
      bezerros_quantidade: payload.bezerros_quantidade ?? undefined,
      bezerros_peso_medio: payload.bezerros_peso_medio ?? undefined,
    };
    _animaisCache = _animaisCache.map(a => a.id === id ? { ...a, ...patchedPayload } : a);
    setItems(_animaisCache);
    toast.success('Lote atualizado!'); setEditingId(null);
  }

  function onDelete(id: string, nome: string) {
    if (onRequestDelete) {
      onRequestDelete({
        id,
        label: `Remover lote "${nome}"?`,
        onDelete: async () => {
          const { error } = await supabaseAdmin.from('animals').delete().eq('id', id);
          if (error) throw new Error('Erro ao remover.');
          _animaisCache = _animaisCache.filter(a => a.id !== id); setItems(_animaisCache);
        },
      });
    } else {
      if (!window.confirm(`Remover "${nome}"?`)) return;
      supabaseAdmin.from('animals').delete().eq('id', id).then(({ error }) => {
        if (error) { toast.error('Erro ao remover.'); return; }
        _animaisCache = _animaisCache.filter(a => a.id !== id); setItems(_animaisCache);
        toast.success('Lote removido.');
      });
    }
  }

  function getCatName(id?: string) {
    return categories.find(c => c.id === id)?.nome || '—';
  }

  return (
    <div className="space-y-6">
      {/* ── Seção Categorias (expansível) ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowCatSection(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Tag className="w-4 h-4 text-teal-600" />
            Categorias de Animais
            <span className="text-xs font-normal text-gray-400 ml-1">({categories.length} cadastradas)</span>
          </div>
          <span className="text-gray-400 text-xs">{showCatSection ? '▲ Recolher' : '▼ Expandir'}</span>
        </button>

        {showCatSection && (
          <div className="border-t border-gray-100 p-5">
            <SimpleTab
              table="animal_categories"
              label="Categoria"
              icon={Tag}
              emptyText="Nenhuma categoria cadastrada"
              newLabel="Nova Categoria"
              initialItems={categories}
              onDataChange={(list) => { _acatCache = list as AnimalCategory[]; setCategories(_acatCache); }}
              predefinedOptions={CATEGORIAS_ANIMAIS}
              onRequestDelete={onRequestDelete}
            />
          </div>
        )}
      </div>

      {/* ── Lotes ── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filtrar lote por nome..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
            />
          </div>
          {canEdit && <AddBtn label="Novo Lote" onClick={() => setShowAddForm(v => !v)} />}
        </div>

        {showAddForm && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl border border-teal-200 shadow-sm p-6 mb-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">Adicionar Lote / Animal</h2>
            <form onSubmit={handleSubmit(onAdd)} className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nome / Lote *</label>
                <input placeholder="Ex.: Lote A" {...upperReg(register('nome', { required: true }))}
                  className={`${inputClass} ${errors.nome ? 'border-red-400' : ''}`} />
              </div>
              <div>
                <label className={labelClass}>Cabeças</label>
                <input type="number" min="0" placeholder="Ex.: 100" {...register('quantidade', { min: 0, valueAsNumber: true })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Categoria</label>
                <select {...register('categoria_id')} className={inputClass}>
                  <option value="">Selecione</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Raça</label>
                <select {...register('raca')} className={inputClass}>
                  <option value="">— Selecione —</option>
                  {RACAS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Peso Médio (kg)</label>
                <input type="number" min="0" step="0.1" placeholder="Ex.: 450" {...register('peso_medio', { valueAsNumber: true })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Sexo</label>
                <select {...register('sexo')} className={inputClass} onChange={e => { setAddSexo(e.target.value); setAddValue('sexo', e.target.value); if (e.target.value !== 'FÊMEA') setAddValue('prenha', false); }}>
                  <option value="">—</option>
                  <option value="MACHO">MACHO</option>
                  <option value="FÊMEA">FÊMEA</option>
                  <option value="MISTURADO">MISTURADO</option>
                </select>
                {addSexo === 'FÊMEA' && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-pink-600 font-semibold">PRENHA?</span>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                      <button type="button" onClick={() => setAddValue('prenha', true)}
                        className={`px-3 py-1.5 transition-colors ${addPrenha === true ? 'bg-pink-500 text-white' : 'bg-white text-gray-500 hover:bg-pink-50 hover:text-pink-600'}`}>SIM</button>
                      <button type="button" onClick={() => setAddValue('prenha', false)}
                        className={`px-3 py-1.5 transition-colors border-l border-gray-200 ${addPrenha !== true ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>NÃO</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="col-span-2 border-t border-gray-100 pt-3 mt-1">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Bezerros</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Possui bezerros?</span>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                      <button type="button" onClick={() => setTemBezerros(true)}
                        className={`px-3 py-1.5 transition-colors ${temBezerros ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                        Sim
                      </button>
                      <button type="button" onClick={() => setTemBezerros(false)}
                        className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${!temBezerros ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                        Não
                      </button>
                    </div>
                  </div>
                </div>
                <div className={`grid grid-cols-2 gap-4 transition-opacity ${!temBezerros ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                  <div>
                    <label className={labelClass}>Quantidade de Animais</label>
                    <input type="number" min="0" placeholder="Ex.: 0" {...register('bezerros_quantidade', { valueAsNumber: true })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Peso Médio (kg)</label>
                    <input type="number" min="0" step="0.1" placeholder="Ex.: 0" {...register('bezerros_peso_medio', { valueAsNumber: true })} className={inputClass} />
                  </div>
                </div>
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Observações</label>
                <input placeholder="Ex.: Info adicional" {...upperReg(register('observacoes'))} className={inputClass} />
              </div>
              <div className="col-span-2 flex gap-3">
                <button type="submit" className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors">
                  <Plus className="w-4 h-4" /> Adicionar
                </button>
                <button type="button" onClick={() => { setShowAddForm(false); reset(); setTemBezerros(false); }}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {loading ? <SkeletonTable rows={4} cols={10} /> : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {items.length === 0 ? (
              <div className="py-16 text-center">
                <Beef className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Nenhum lote cadastrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {['Lote', 'Cabeças', 'Categoria', 'Peso Médio', 'Raça', 'Sexo', 'Bez. Qtd', 'Bez. Peso', 'Obs', 'Ações'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(() => {
                      const filtered = search.trim()
                        ? items.filter(a => a.nome.toLowerCase().includes(search.toLowerCase()))
                        : items;
                      if (filtered.length === 0 && search) return (
                        <tr><td colSpan={10} className="py-8 text-center text-sm text-gray-400">Nenhum resultado para "{search}"</td></tr>
                      );
                      return filtered.map(item =>
                        editingId === item.id ? (
                          <AnimalEditRow key={item.id} item={item} categories={categories}
                            onSave={d => onEditSave(item.id, d)} onCancel={() => setEditingId(null)} />
                        ) : (
                          <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-900">{item.nome}</td>
                            <td className="px-4 py-3 text-gray-600">{item.quantidade}</td>
                            <td className="px-4 py-3">
                              {item.categoria_id
                                ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700">{getCatName(item.categoria_id)}</span>
                                : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-600">{item.peso_medio ? `${item.peso_medio} kg` : '—'}</td>
                            <td className="px-4 py-3 text-gray-600">{item.raca || '—'}</td>
                            <td className="px-4 py-3 text-gray-600">{item.sexo || '—'}</td>
                            <td className="px-4 py-3 text-gray-600">{item.bezerros_quantidade ?? '—'}</td>
                            <td className="px-4 py-3 text-gray-600">{item.bezerros_peso_medio ? `${item.bezerros_peso_medio} kg` : '—'}</td>
                            <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{item.observacoes || '—'}</td>
                            <td className="px-4 py-3">{canEdit && <ActionBtns
                              onEdit={() => onRequestEdit
                                ? onRequestEdit({ id: item.id, label: `Editar lote "${item.nome}"`, onEdit: () => setEditingId(item.id) })
                                : setEditingId(item.id)}
                              onDelete={() => onDelete(item.id, item.nome)} />}</td>
                          </motion.tr>
                        )
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SuplementosTab
═══════════════════════════════════════════════════════════════ */
const SUPLEMENTOS_NOMES = [
  'Energetico 0,3%',
  'Energetico 0,5%',
  'Mineral Adensado Aguas',
  'Mineral Adensado Seca',
  'Mineral Adensado Transicao',
  'Proteico 0,1% Aguas',
  'Proteico 0,1% Seca',
  'Proteico 0,1% Transicao',
  'Proteico 0,2%',
  'Racao Creep',
  'Ração Engorda TIP',
  'Sal Mineral Reprodução',
  'Sal Mineral Águas',
  'Sal Mineral Águas Aditivado',
  'Sal Mineral com Ureia',
] as const;

const CATEGORIAS_ANIMAIS = [
  'Vacas Adultas',
  'Primíparas',
  'Vaca descarte',
  'Bezerros macho mamando',
  'Bezerras fêmea mamando',
  'Femeas até 12 meses',
  'Femeas de 13 a 24 meses',
  'Macho até 12 meses',
  'Machos de 13 a 24 meses',
  'Macho > 24 meses',
  'Touros',
  'Novilhas Precoce',
  'Vaca Adultas Prenhas',
  'Vacas Adultas Paridas',
] as const;

const CONSUMO_OPTIONS = [
  '20 A 30 GRAMAS/100 KG PV',
  '35 A 45 GRAMAS/100 KG PV',
  '50 A 100 GRAMAS/100 KG PV',
  '100 A 120 GRAMAS/100 KG PV',
  '200 A 300 GRAMAS/100 KG PV',
  '300 A 400 GRAMAS/100 KG PV',
  '500 A 700 GRAMAS/100 KG PV',
  '1,0 A 1,50% PV',
  '1,50 A 2,30% PV',
] as const;


let _suplementosCache: SupplementType[] = [];
const COR_OPTIONS = ['AMARELO', 'VERDE', 'AZUL', 'PRETO', 'BRANCO'];

interface SupplementForm { nome: string; unidade: string; peso: number; valor_kg: number; consumo: string; observacoes: string; meta_custom: string; }

function SupEditRow({ item, onSave, onCancel }: { item: SupplementType; onSave: (d: SupplementForm) => void; onCancel: () => void; }) {
  const { register, handleSubmit, watch } = useForm<SupplementForm>({
    defaultValues: { nome: item.nome, unidade: item.unidade, peso: item.peso ?? 0, valor_kg: item.valor_kg ?? 0, consumo: item.consumo || '', observacoes: item.observacoes || '', meta_custom: item.meta_pct || '' },
  });
  const consumoWatch = watch('consumo');
  const metaDefault = META_CONSUMO[consumoWatch] || '';
  return (
    <tr className="bg-teal-50">
      <td className="px-4 py-2">
        <input list="sugg-supl-edit" {...upperReg(register('nome', { required: true }))} className={inputClass} placeholder="Digite ou selecione..." />
        <datalist id="sugg-supl-edit">
          {SUPLEMENTOS_NOMES.map(n => <option key={n} value={n} />)}
        </datalist>
      </td>
      <td className="px-4 py-2">
        <select {...register('unidade')} className={inputClass}>
          <option value="kg">KG</option>
          <option value="saco">SACO</option>
        </select>
      </td>
      <td className="px-4 py-2"><input type="number" step="0.1" min="0" {...register('peso', { valueAsNumber: true })} className={inputClass} placeholder="Ex.: 30" /></td>
      <td className="px-4 py-2"><input type="number" step="0.01" min="0" {...register('valor_kg', { valueAsNumber: true })} className={inputClass} placeholder="Ex.: 2.50" /></td>
      <td className="px-4 py-2">
        <select {...register('consumo')} className={inputClass}>
          <option value="">— Consumo —</option>
          {CONSUMO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <input {...register('meta_custom')} placeholder={metaDefault || '0,000%'} className={inputClass} />
      </td>
      <td className="px-4 py-2">
        <select {...register('observacoes')} className={inputClass}>
          <option value="">— Cor —</option>
          {COR_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td className="px-4 py-2"><SaveCancelBtns onSave={handleSubmit(onSave)} onCancel={onCancel} /></td>
    </tr>
  );
}

function SuplementosTab({ onRequestDelete, onRequestEdit, canEdit = true }: { onRequestDelete?: (target: DeleteTarget) => void; onRequestEdit?: (target: EditTarget) => void; canEdit?: boolean }) {
  const { activeFarmId } = useData();
  const [items, setItems] = useState<SupplementType[]>(_suplementosCache);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterText, setFilterText] = useState('');
  const { register, handleSubmit, reset, watch: watchAdd, formState: { errors } } = useForm<SupplementForm>({ defaultValues: { unidade: 'kg', peso: 0, valor_kg: 0, consumo: '', meta_custom: '' } });
  const consumoWatchAdd = watchAdd('consumo');

  useEffect(() => {
    if (!activeFarmId) return;
    let mounted = true;
    setLoading(true);
    const tid = setTimeout(() => { if (mounted) setLoading(false); }, 15_000);
    (async () => {
      try {
        const { data } = await supabaseAdmin.from('supplement_types').select('*').eq('farm_id', activeFarmId).order('nome');
        if (mounted) { _suplementosCache = data ?? []; setItems(_suplementosCache); }
      } finally {
        clearTimeout(tid);
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; clearTimeout(tid); };
  }, [activeFarmId]);

  const filteredItems = items.filter(s =>
    !filterText || s.nome.toLowerCase().includes(filterText.toLowerCase())
  );

  async function onAdd(data: SupplementForm) {
    if (!activeFarmId) return;
    const dup = _suplementosCache.find(s => s.nome.trim().toLowerCase() === data.nome.trim().toLowerCase());
    if (dup) { toast.error('Já existe um suplemento com este nome.'); return; }
    const payload: Record<string, unknown> = {
      nome: data.nome.toUpperCase(),
      unidade: data.unidade,
      observacoes: data.observacoes || null,
      farm_id: activeFarmId,
      // só inclui colunas novas se tiverem valor — evita erro se SQL ainda não foi rodado
      ...(data.peso     > 0 && { peso:     data.peso }),
      ...(data.valor_kg > 0 && { valor_kg: data.valor_kg }),
      ...(data.consumo        && { consumo: data.consumo }),
      ...(data.meta_custom    && { meta_pct: data.meta_custom }),
    };
    const { data: row, error } = await supabaseAdmin.from('supplement_types').insert(payload).select().single();
    if (error) { toast.error('Erro ao adicionar.'); return; }
    _suplementosCache = [..._suplementosCache, row].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    setItems(_suplementosCache);
    toast.success('Suplemento adicionado!', { description: data.nome });
    reset({ unidade: 'kg', peso: 0, valor_kg: 0, consumo: '', meta_custom: '' }); setShowAddForm(false);
  }
  async function onEditSave(id: string, data: SupplementForm) {
    const payload: Record<string, unknown> = {
      nome: data.nome.toUpperCase(),
      unidade: data.unidade,
      observacoes: data.observacoes || null,
      ...(data.peso     > 0 && { peso:     data.peso }),
      ...(data.valor_kg > 0 && { valor_kg: data.valor_kg }),
      ...(data.consumo ? { consumo: data.consumo } : { consumo: null }),
      ...(data.meta_custom ? { meta_pct: data.meta_custom } : { meta_pct: null }),
    };
    const { error } = await supabaseAdmin.from('supplement_types').update(payload).eq('id', id);
    if (error) { toast.error('Erro ao atualizar.'); return; }
    _suplementosCache = _suplementosCache.map(s => s.id === id ? {
      ...s,
      nome:        data.nome.toUpperCase(),
      unidade:     data.unidade,
      peso:        data.peso,
      valor_kg:    data.valor_kg,
      consumo:     data.consumo     || undefined,
      meta_pct:    data.meta_custom || undefined,
      observacoes: data.observacoes || undefined,
    } : s);
    setItems(_suplementosCache);
    toast.success('Suplemento atualizado!'); setEditingId(null);
  }
  function onDelete(id: string, nome: string) {
    if (onRequestDelete) {
      onRequestDelete({
        id,
        label: `Remover suplemento "${nome}"?`,
        onDelete: async () => {
          const { error } = await supabaseAdmin.from('supplement_types').delete().eq('id', id);
          if (error) throw new Error('Erro ao remover.');
          _suplementosCache = _suplementosCache.filter(s => s.id !== id); setItems(_suplementosCache);
        },
      });
    } else {
      if (!window.confirm(`Remover "${nome}"?`)) return;
      supabaseAdmin.from('supplement_types').delete().eq('id', id).then(({ error }) => {
        if (error) { toast.error('Erro ao remover.'); return; }
        _suplementosCache = _suplementosCache.filter(s => s.id !== id); setItems(_suplementosCache);
        toast.success('Suplemento removido.');
      });
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Filtrar suplemento..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
          />
        </div>
        {canEdit && <AddBtn label="Novo Suplemento" onClick={() => setShowAddForm(v => !v)} />}
      </div>
      {showAddForm && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-teal-200 shadow-sm p-6 mb-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Adicionar Suplemento</h2>
          <form onSubmit={handleSubmit(onAdd)} className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nome *</label>
              <input list="sugg-supl-add" placeholder="Digite ou selecione..."
                {...upperReg(register('nome', { required: true }))}
                className={`${inputClass} ${errors.nome ? 'border-red-400' : ''}`} />
              <datalist id="sugg-supl-add">
                {SUPLEMENTOS_NOMES.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div>
              <label className={labelClass}>Unidade</label>
              <select {...register('unidade')} className={inputClass}>
                <option value="kg">KG</option>
                <option value="saco">SACO</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Peso por Unidade (kg)</label>
              <input type="number" step="0.1" min="0" placeholder="Ex.: 30" {...register('peso', { valueAsNumber: true })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Valor / KG (R$)</label>
              <input type="number" step="0.01" min="0" placeholder="Ex.: 2.50" {...register('valor_kg', { valueAsNumber: true })} className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Consumo Recomendado</label>
              <select {...register('consumo')} className={inputClass}>
                <option value="">— Selecione o consumo —</option>
                {CONSUMO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Meta (% PV)</label>
              <input
                placeholder={META_CONSUMO[consumoWatchAdd] || '0,000%'}
                {...register('meta_custom')}
                className={inputClass}
              />
              {META_CONSUMO[consumoWatchAdd] && (
                <p className="text-[10px] text-gray-400 mt-0.5">Padrão: {META_CONSUMO[consumoWatchAdd]}</p>
              )}
            </div>
            <div>
              <label className={labelClass}>Cor</label>
              <select {...register('observacoes')} className={inputClass}>
                <option value="">— Cor —</option>
                {COR_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2 flex gap-3">
              <button type="submit" className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors"><Plus className="w-4 h-4" /> Adicionar</button>
              <button type="button" onClick={() => { setShowAddForm(false); reset({ unidade: 'kg', peso: 0, valor_kg: 0, consumo: '' }); }} className="px-4 py-2.5 rounded-xl border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>
            </div>
          </form>
        </motion.div>
      )}
      {loading ? <SkeletonTable rows={4} cols={6} /> : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {items.length === 0 ? (
            <div className="py-16 text-center"><Package className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 font-medium">Nenhum suplemento cadastrado</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Nome', 'Unidade', 'Peso (kg)', 'Valor/KG (R$)', 'Consumo', 'Meta (% PV)', 'Cor', 'Ações'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-sm text-gray-400">
                        Nenhum suplemento encontrado para "{filterText}"
                      </td>
                    </tr>
                  ) : filteredItems.map(item => editingId === item.id ? (
                    <SupEditRow key={item.id} item={item} onSave={d => onEditSave(item.id, d)} onCancel={() => setEditingId(null)} />
                  ) : (
                    <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{item.nome}</td>
                      <td className="px-4 py-3 text-gray-600 uppercase">{item.unidade}</td>
                      <td className="px-4 py-3 text-gray-600">{item.peso ? `${item.peso} kg` : '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{item.valor_kg ? `R$ ${item.valor_kg.toFixed(2)}` : '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{item.consumo || '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: '#1a6040' }}>
                        {item.meta_pct || (item.consumo ? (META_CONSUMO[item.consumo] || '—') : '—')}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{item.observacoes || '—'}</td>
                      <td className="px-4 py-3">{canEdit && <ActionBtns
                        onEdit={() => onRequestEdit
                          ? onRequestEdit({ id: item.id, label: `Editar suplemento "${item.nome}"`, onEdit: () => setEditingId(item.id) })
                          : setEditingId(item.id)}
                        onDelete={() => onDelete(item.id, item.nome)} />}</td>
                    </motion.tr>
                  ))}
                </tbody>
                {filterText && (
                  <tfoot>
                    <tr>
                      <td colSpan={8} className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400">
                        {filteredItems.length} de {items.length} suplementos
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SimuladosTab — Admin Only
═══════════════════════════════════════════════════════════════ */
interface SimuladorParam {
  epoca: string; categoria: string; g_100kg_pv: number;
  gmd_regular: number; gmd_bom: number; gmd_otimo: number;
}

const EPOCA_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  seca:      { label: 'Seca (Jul–Out)',       bg: '#fef3c7', color: '#b45309' },
  transicao: { label: 'Transição (Mar–Jun)',  bg: '#dbeafe', color: '#1d4ed8' },
  aguas:     { label: 'Águas (Nov–Fev)',      bg: '#d1fae5', color: '#065f46' },
};

let _paramsCache: SimuladorParam[] = [];

interface SupplementSimulated {
  id: string; farm_id: string; nome: string; unidade: string;
  peso?: number; valor_kg?: number; consumo?: string; meta_pct?: string;
  ganho_peso_esperado?: number; categoria_alvo?: string; custo_cab_dia?: number;
  observacoes_tecnicas?: string; categoria?: string;
}
let _simuladosCache: SupplementSimulated[] = [];

/* ── Inline product add/edit forms for CatProdutoPanel ── */
interface CatProdForm { nome: string; unidade: string; peso: number; valor_kg: number; observacoes_tecnicas: string; }

function CatProdutoAddForm({ categoria, farmId, onAdded, onCancel }: {
  categoria: string; farmId: string;
  onAdded: (item: SupplementSimulated) => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<CatProdForm>({
    defaultValues: { unidade: 'kg', peso: 0, valor_kg: 0, observacoes_tecnicas: '' },
  });
  async function onSave(data: CatProdForm) {
    const { data: row, error } = await supabaseAdmin.from('supplement_simulated').insert({
      farm_id: farmId, nome: data.nome.toUpperCase(), categoria,
      unidade: data.unidade,
      ...(data.peso > 0 && { peso: data.peso }),
      ...(data.valor_kg > 0 && { valor_kg: data.valor_kg }),
      ...(data.observacoes_tecnicas && { observacoes_tecnicas: data.observacoes_tecnicas }),
    }).select().single();
    if (error) { toast.error('Erro ao adicionar.'); return; }
    toast.success('Produto adicionado!');
    onAdded(row);
  }
  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-wrap items-end gap-2 p-3 rounded-lg border border-teal-200 mb-2" style={{ background: 'rgba(26,96,64,0.04)' }}>
      <div className="flex-1 min-w-[180px]">
        <label className={labelClass}>Nome *</label>
        <input {...upperReg(register('nome', { required: true }))} className={`${inputClass} ${errors.nome ? 'border-red-400' : ''}`} placeholder="Nome do produto" />
      </div>
      <div className="w-24">
        <label className={labelClass}>Unidade</label>
        <select {...register('unidade')} className={inputClass}><option value="kg">KG</option><option value="saco">SACO</option></select>
      </div>
      <div className="w-32">
        <label className={labelClass}>Peso saco (kg)</label>
        <input type="number" step="0.1" min="0" {...register('peso', { valueAsNumber: true })} className={inputClass} placeholder="Ex: 30" />
      </div>
      <div className="w-32">
        <label className={labelClass}>R$ / kg</label>
        <input type="number" step="0.001" min="0" {...register('valor_kg', { valueAsNumber: true })} className={inputClass} placeholder="Ex: 2.500" />
      </div>
      <div className="flex-1 min-w-[150px]">
        <label className={labelClass}>Observações</label>
        <input {...register('observacoes_tecnicas')} className={inputClass} placeholder="Opcional" />
      </div>
      <div className="flex gap-2 pb-0.5">
        <button type="submit" className="flex items-center gap-1 px-3 py-2 rounded-lg text-white text-xs font-semibold" style={{ background: '#1a6040' }}>
          <Save className="w-3.5 h-3.5" /> Salvar
        </button>
        <button type="button" onClick={onCancel} className="p-2 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </form>
  );
}

function CatProdutoEditForm({ item, onSaved, onCancel }: {
  item: SupplementSimulated;
  onSaved: (updated: SupplementSimulated) => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit } = useForm<CatProdForm>({
    defaultValues: { nome: item.nome, unidade: item.unidade, peso: item.peso ?? 0, valor_kg: item.valor_kg ?? 0, observacoes_tecnicas: item.observacoes_tecnicas || '' },
  });
  async function onSave(data: CatProdForm) {
    const { error } = await supabaseAdmin.from('supplement_simulated').update({
      nome: data.nome.toUpperCase(), unidade: data.unidade,
      peso: data.peso > 0 ? data.peso : null,
      valor_kg: data.valor_kg > 0 ? data.valor_kg : null,
      observacoes_tecnicas: data.observacoes_tecnicas || null,
    }).eq('id', item.id);
    if (error) { toast.error('Erro ao atualizar.'); return; }
    toast.success('Atualizado!');
    onSaved({ ...item, nome: data.nome.toUpperCase(), unidade: data.unidade, peso: data.peso || undefined, valor_kg: data.valor_kg || undefined, observacoes_tecnicas: data.observacoes_tecnicas || undefined });
  }
  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-wrap items-end gap-2 p-3 rounded-lg border border-blue-200 mb-1" style={{ background: '#eff6ff' }}>
      <div className="flex-1 min-w-[180px]">
        <label className={labelClass}>Nome *</label>
        <input {...upperReg(register('nome', { required: true }))} className={inputClass} />
      </div>
      <div className="w-24">
        <label className={labelClass}>Unidade</label>
        <select {...register('unidade')} className={inputClass}><option value="kg">KG</option><option value="saco">SACO</option></select>
      </div>
      <div className="w-32">
        <label className={labelClass}>Peso saco (kg)</label>
        <input type="number" step="0.1" min="0" {...register('peso', { valueAsNumber: true })} className={inputClass} />
      </div>
      <div className="w-32">
        <label className={labelClass}>R$ / kg</label>
        <input type="number" step="0.001" min="0" {...register('valor_kg', { valueAsNumber: true })} className={inputClass} />
      </div>
      <div className="flex-1 min-w-[150px]">
        <label className={labelClass}>Observações</label>
        <input {...register('observacoes_tecnicas')} className={inputClass} />
      </div>
      <div className="flex gap-2 pb-0.5">
        <button type="submit" className="flex items-center gap-1 px-3 py-2 rounded-lg text-white text-xs font-semibold" style={{ background: '#1a6040' }}>
          <Save className="w-3.5 h-3.5" /> Salvar
        </button>
        <button type="button" onClick={onCancel} className="p-2 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </form>
  );
}

function CatProdutoPanel({ categoria, farmId, items, onItemsChange, canEdit }: {
  categoria: string; farmId: string;
  items: SupplementSimulated[];
  onItemsChange: (updated: SupplementSimulated[]) => void;
  canEdit: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const catItems = items.filter(i => i.categoria === categoria);

  async function handleDelete(id: string, nome: string) {
    if (!window.confirm(`Remover "${nome}"?`)) return;
    const { error } = await supabaseAdmin.from('supplement_simulated').delete().eq('id', id);
    if (error) { toast.error('Erro ao remover.'); return; }
    _simuladosCache = _simuladosCache.filter(s => s.id !== id);
    onItemsChange([..._simuladosCache]);
    toast.success('Removido!');
  }

  return (
    <div className="px-4 py-3 border-t" style={{ background: 'rgba(26,96,64,0.03)', borderColor: 'rgba(26,96,64,0.10)' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#1a6040' }}>
          Produtos — {categoria}
        </p>
        {canEdit && !showAdd && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
            style={{ background: '#1a6040' }}>
            <Plus className="w-3.5 h-3.5" /> Adicionar Produto
          </button>
        )}
      </div>
      {showAdd && canEdit && (
        <CatProdutoAddForm
          categoria={categoria} farmId={farmId}
          onAdded={row => { _simuladosCache = [..._simuladosCache, row].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); onItemsChange([..._simuladosCache]); setShowAdd(false); }}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {catItems.length === 0 && !showAdd ? (
        <p className="text-xs text-gray-400 py-1">Nenhum produto nesta categoria.</p>
      ) : (
        <div className="space-y-1">
          {catItems.map(item =>
            editId === item.id ? (
              <CatProdutoEditForm key={item.id} item={item}
                onSaved={updated => { _simuladosCache = _simuladosCache.map(s => s.id === updated.id ? updated : s); onItemsChange([..._simuladosCache]); setEditId(null); }}
                onCancel={() => setEditId(null)}
              />
            ) : (
              <div key={item.id} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-white border border-gray-100 text-sm">
                <span className="font-semibold text-gray-900 flex-1">{item.nome}</span>
                <span className="text-xs uppercase text-gray-500">{item.unidade}</span>
                <span className="text-xs font-medium text-gray-700 min-w-[110px]">{item.valor_kg ? `R$ ${item.valor_kg.toFixed(3)}/kg` : '—'}</span>
                <span className="text-xs text-gray-500">{item.peso ? `${item.peso} kg/saco` : ''}</span>
                {item.observacoes_tecnicas && <span className="text-xs text-gray-400 italic truncate max-w-[200px]">{item.observacoes_tecnicas}</span>}
                {canEdit && (
                  <div className="flex gap-1">
                    <button onClick={() => setEditId(item.id)} className="p-1.5 rounded text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(item.id, item.nome)} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function SimuladosTab({ canEdit = true }: { onRequestDelete?: (t: DeleteTarget) => void; onRequestEdit?: (t: EditTarget) => void; canEdit?: boolean }) {
  const { activeFarmId } = useData();
  const [items, setItems] = useState<SupplementSimulated[]>(_simuladosCache);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<SimuladorParam[]>(_paramsCache);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  useEffect(() => {
    if (!activeFarmId) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const [{ data: supls }, { data: prms }] = await Promise.all([
          supabaseAdmin.from('supplement_simulated').select('*').eq('farm_id', activeFarmId).order('nome'),
          _paramsCache.length > 0 ? Promise.resolve({ data: _paramsCache }) : supabaseAdmin.from('simulador_parametros').select('*'),
        ]);
        if (mounted) {
          _simuladosCache = supls ?? []; setItems([..._simuladosCache]);
          if (prms && prms.length > 0) { _paramsCache = prms as SimuladorParam[]; setParams([..._paramsCache]); }
        }
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [activeFarmId]);

  const EPOCAS_ORDER = [
    { key: 'seca',      label: 'SECA',      periodo: 'Jul · Ago · Set · Out' },
    { key: 'transicao', label: 'TRANSIÇÃO', periodo: 'Mar · Abr · Mai · Jun' },
    { key: 'aguas',     label: 'ÁGUAS',     periodo: 'Nov · Dez · Jan · Fev' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide"
          style={{ background: 'rgba(26,96,64,0.10)', color: '#1a6040', border: '1px solid rgba(26,96,64,0.2)' }}>
          <FlaskConical className="w-3 h-3" /> Admin Only
        </span>
        <p className="text-xs text-gray-400">Clique em uma categoria para gerenciar os produtos vinculados</p>
      </div>

      {loading ? <SkeletonTable rows={6} cols={6} /> : params.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Carregando parâmetros técnicos...</p>
      ) : (
        <div className="grid gap-4">
          {EPOCAS_ORDER.map(({ key, label, periodo }) => {
            const es = EPOCA_STYLE[key];
            const rows = params.filter(p => p.epoca === key).sort((a, b) => a.g_100kg_pv - b.g_100kg_pv);
            return (
              <div key={key} className="rounded-xl border overflow-hidden" style={{ borderColor: es.color + '33' }}>
                <div className="px-4 py-2.5 flex items-center gap-3" style={{ background: es.bg }}>
                  <span className="text-sm font-bold" style={{ color: es.color }}>{label}</span>
                  <span className="text-xs font-medium" style={{ color: es.color + 'cc' }}>{periodo}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: es.color + '22', background: es.bg + '66' }}>
                      <th className="w-8 px-3 py-2"></th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Categoria</th>
                      <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Consumo Sugerido<br /><span className="font-normal normal-case text-gray-400">g / 100kg PV</span></th>
                      <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Regular<br /><span className="font-normal normal-case text-gray-400">GMD kg/dia</span></th>
                      <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: '#1d4ed8' }}>Boa<br /><span className="font-normal normal-case text-gray-400">GMD kg/dia</span></th>
                      <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: '#1a6040' }}>Ótima<br /><span className="font-normal normal-case text-gray-400">GMD kg/dia</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p, i) => {
                      const catKey = `${key}:${p.categoria}`;
                      const isExpanded = expandedCat === catKey;
                      const prodCount = items.filter(it => it.categoria === p.categoria).length;
                      return (
                        <Fragment key={p.categoria}>
                          <tr
                            className={`border-t cursor-pointer select-none transition-colors ${isExpanded ? '' : (i % 2 === 0 ? 'bg-white hover:bg-teal-50/20' : 'bg-gray-50/50 hover:bg-teal-50/20')}`}
                            style={{ borderColor: '#f3f4f6', ...(isExpanded ? { background: 'rgba(26,96,64,0.06)' } : {}) }}
                            onClick={() => setExpandedCat(isExpanded ? null : catKey)}>
                            <td className="px-3 py-2.5 w-8">
                              <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : 'text-gray-300'}`}
                                style={isExpanded ? { color: '#1a6040' } : {}} />
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="inline-block px-2 py-0.5 rounded-md text-xs font-semibold" style={{ background: 'rgba(26,96,64,0.10)', color: '#1a6040' }}>{p.categoria}</span>
                                {prodCount > 0 && (
                                  <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: '#1a6040' }}>{prodCount}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-center font-bold" style={{ color: '#1a6040' }}>{p.g_100kg_pv}g</td>
                            <td className="px-4 py-2.5 text-center font-semibold text-gray-700">
                              {p.gmd_regular < 0 ? <span className="text-red-500">{p.gmd_regular.toFixed(3)}</span> : p.gmd_regular.toFixed(3)}
                            </td>
                            <td className="px-4 py-2.5 text-center font-semibold" style={{ color: '#1d4ed8' }}>{p.gmd_bom.toFixed(3)}</td>
                            <td className="px-4 py-2.5 text-center font-semibold" style={{ color: '#1a6040' }}>{p.gmd_otimo.toFixed(3)}</td>
                          </tr>
                          {isExpanded && activeFarmId && (
                            <tr>
                              <td colSpan={6} className="p-0">
                                <CatProdutoPanel
                                  categoria={p.categoria}
                                  farmId={activeFarmId}
                                  items={items}
                                  onItemsChange={newItems => { _simuladosCache = newItems; setItems([...newItems]); }}
                                  canEdit={canEdit}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FuncionariosTab
═══════════════════════════════════════════════════════════════ */
let _funcionariosCache: Employee[] = [];
interface EmployeeForm { nome: string; funcao: string; contato: string; }

function EmpEditRow({ item, onSave, onCancel }: { item: Employee; onSave: (d: EmployeeForm) => void; onCancel: () => void; }) {
  const { register, handleSubmit, setValue } = useForm<EmployeeForm>({
    defaultValues: { nome: item.nome, funcao: item.funcao || '', contato: item.contato || '' },
  });
  const contatoReg = register('contato');

  function handleContatoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatPhone(e.target.value);
    e.target.value = formatted;
    setValue('contato', formatted, { shouldValidate: false });
  }

  return (
    <tr className="bg-teal-50">
      <td className="px-4 py-2"><input {...upperReg(register('nome', { required: true }))} className={inputClass} /></td>
      <td className="px-4 py-2"><input {...upperReg(register('funcao'))} className={inputClass} /></td>
      <td className="px-4 py-2">
        <input {...contatoReg} onChange={handleContatoChange} className={inputClass} placeholder="Ex.: (00) 00000-0000" />
      </td>
      <td className="px-4 py-2"><SaveCancelBtns onSave={handleSubmit(onSave)} onCancel={onCancel} /></td>
    </tr>
  );
}

function FuncionariosTab({ onRequestDelete, onRequestEdit, canEdit = true }: { onRequestDelete?: (target: DeleteTarget) => void; onRequestEdit?: (target: EditTarget) => void; canEdit?: boolean }) {
  const { activeFarmId } = useData();
  const [items, setItems] = useState<Employee[]>(_funcionariosCache);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [search, setSearch] = useState('');
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<EmployeeForm>();

  const contatoReg = register('contato');

  function handleContatoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatPhone(e.target.value);
    e.target.value = formatted;
    setValue('contato', formatted, { shouldValidate: false });
  }

  useEffect(() => {
    if (!activeFarmId) return;
    let mounted = true;
    setLoading(true);
    const tid = setTimeout(() => { if (mounted) setLoading(false); }, 15_000);
    (async () => {
      try {
        const { data, error } = await supabaseAdmin.from('employees').select('*').eq('farm_id', activeFarmId).order('nome');
        if (!mounted) return;
        if (error) {
          toast.error('Tabela de funcionários não encontrada. Execute ajustes_v116b.sql no Supabase.');
        } else {
          _funcionariosCache = data ?? []; setItems(_funcionariosCache);
        }
      } finally {
        clearTimeout(tid);
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; clearTimeout(tid); };
  }, [activeFarmId]);

  async function onAdd(data: EmployeeForm) {
    if (!activeFarmId) {
      toast.error('Fazenda não selecionada.');
      return;
    }
    const dup = _funcionariosCache.find(e => e.nome.trim().toLowerCase() === data.nome.trim().toLowerCase());
    if (dup) { toast.error('Já existe um funcionário com este nome.'); return; }
    const { data: row, error } = await supabaseAdmin
      .from('employees')
      .insert({ nome: data.nome, funcao: data.funcao || null, contato: data.contato || null, farm_id: activeFarmId })
      .select()
      .single();
    if (error) {
      toast.error('Erro ao adicionar funcionário. Verifique se a tabela employees existe.');
      return;
    }
    _funcionariosCache = [..._funcionariosCache, row]; setItems(_funcionariosCache);
    toast.success('Funcionário adicionado!', { description: data.nome });
    reset(); setShowAddForm(false);
  }
  async function onEditSave(id: string, data: EmployeeForm) {
    const { error } = await supabaseAdmin.from('employees').update({ nome: data.nome, funcao: data.funcao || null, contato: data.contato || null }).eq('id', id);
    if (error) { toast.error('Erro ao atualizar.'); return; }
    _funcionariosCache = _funcionariosCache.map(e => e.id === id ? { ...e, ...data } : e); setItems(_funcionariosCache);
    toast.success('Funcionário atualizado!'); setEditingId(null);
  }
  function onDelete(id: string, nome: string) {
    if (onRequestDelete) {
      onRequestDelete({
        id,
        label: `Remover funcionário "${nome}"?`,
        onDelete: async () => {
          const { error } = await supabaseAdmin.from('employees').delete().eq('id', id);
          if (error) throw new Error('Erro ao remover.');
          _funcionariosCache = _funcionariosCache.filter(e => e.id !== id); setItems(_funcionariosCache);
        },
      });
    } else {
      if (!window.confirm(`Remover "${nome}"?`)) return;
      supabaseAdmin.from('employees').delete().eq('id', id).then(({ error }) => {
        if (error) { toast.error('Erro ao remover.'); return; }
        _funcionariosCache = _funcionariosCache.filter(e => e.id !== id); setItems(_funcionariosCache);
        toast.success('Funcionário removido.');
      });
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrar funcionário..."
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
          />
        </div>
        {canEdit && <AddBtn label="Novo Funcionário" onClick={() => setShowAddForm(v => !v)} />}
      </div>
      {showAddForm && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-teal-200 shadow-sm p-6 mb-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Adicionar Funcionário</h2>
          <form onSubmit={handleSubmit(onAdd)} className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Nome *</label>
              <input placeholder="Ex.: João Silva" {...upperReg(register('nome', { required: true }))} className={`${inputClass} ${errors.nome ? 'border-red-400' : ''}`} />
            </div>
            <div>
              <label className={labelClass}>Função</label>
              <input placeholder="Ex.: Veterinário" {...upperReg(register('funcao'))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Contato</label>
              <input
                {...contatoReg}
                onChange={handleContatoChange}
                placeholder="Ex.: (00) 00000-0000"
                className={inputClass}
              />
            </div>
            <div className="col-span-3 flex gap-3">
              <button type="submit" className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors">
                <Plus className="w-4 h-4" /> Adicionar
              </button>
              <button type="button" onClick={() => { setShowAddForm(false); reset(); }} className="px-4 py-2.5 rounded-xl border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>
            </div>
          </form>
        </motion.div>
      )}
      {loading ? <SkeletonTable rows={4} cols={4} /> : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {items.length === 0 ? (
            <div className="py-16 text-center"><Users className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 font-medium">Nenhum funcionário cadastrado</p></div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-200">{['Nome', 'Função', 'Contato', 'Ações'].map(h => (<th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>))}</tr></thead>
              <tbody className="divide-y divide-gray-100">{(() => {
                const filteredEmp = search.trim()
                  ? items.filter(e => e.nome.toLowerCase().includes(search.toLowerCase()) || (e.funcao ?? '').toLowerCase().includes(search.toLowerCase()))
                  : items;
                if (filteredEmp.length === 0 && search) return (
                  <tr><td colSpan={4} className="py-8 text-center text-sm text-gray-400">Nenhum resultado para "{search}"</td></tr>
                );
                return filteredEmp.map(item => editingId === item.id ? (
                  <EmpEditRow key={item.id} item={item} onSave={d => onEditSave(item.id, d)} onCancel={() => setEditingId(null)} />
                ) : (
                  <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{item.nome}</td>
                    <td className="px-4 py-3 text-gray-600">{item.funcao || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{item.contato || '—'}</td>
                    <td className="px-4 py-3">{canEdit && <ActionBtns
                      onEdit={() => onRequestEdit
                        ? onRequestEdit({ id: item.id, label: `Editar funcionário "${item.nome}"`, onEdit: () => setEditingId(item.id) })
                        : setEditingId(item.id)}
                      onDelete={() => onDelete(item.id, item.nome)} />}</td>
                  </motion.tr>
                ));
              })()}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   Cadastros — página principal
═══════════════════════════════════════════════════════════════ */
export function Cadastros() {
  const { user, isAdmin, hasEditPermission } = useAuth();
  const canEdit = isAdmin || hasEditPermission('cadastros');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('aba') ?? 'pastos') as TabKey;
  const [deleteTarget, setDeleteTarget]             = useState<DeleteTarget | null>(null);
  const [simpleDeleteTarget, setSimpleDeleteTarget] = useState<DeleteTarget | null>(null);
  const [simpleDeleting, setSimpleDeleting]         = useState(false);
  const [editTarget, setEditTarget]                 = useState<EditTarget | null>(null);

  function setTab(key: TabKey) {
    setSearchParams({ aba: key }, { replace: true });
  }

  async function handleDeleteConfirm(password: string) {
    if (!user?.email) throw new Error('Usuário não autenticado.');
    const ok = await verifyPassword(user.email, password);
    if (!ok) throw new Error('Senha incorreta');
    await deleteTarget!.onDelete();
    setDeleteTarget(null);
    toast.success('Excluído com sucesso.');
  }

  async function handleEditConfirm(password: string) {
    if (!user?.email) throw new Error('Usuário não autenticado.');
    const ok = await verifyPassword(user.email, password);
    if (!ok) throw new Error('Senha incorreta');
    const onEdit = editTarget!.onEdit;
    setEditTarget(null);          // fecha o modal primeiro
    setTimeout(() => onEdit(), 50); // abre o form depois que o modal fechou
  }

  async function handleSimpleDeleteConfirm() {
    if (!simpleDeleteTarget) return;
    setSimpleDeleting(true);
    try {
      await simpleDeleteTarget.onDelete();
      setSimpleDeleteTarget(null);
      toast.success('Excluído com sucesso.');
    } catch {
      toast.error('Erro ao excluir.');
    } finally {
      setSimpleDeleting(false);
    }
  }

  return (
    <div className="p-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="max-w-6xl mx-auto">

        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Suplemento Control</p>
          <h1 className="text-3xl font-bold text-gray-900">Cadastros</h1>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
          {TABS.filter(t => !t.adminOnly || isAdmin).map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            const isSimulador = tab.key === 'simulados';
            return (
              <button key={tab.key} onClick={() => setTab(tab.key as TabKey)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap ${
                  isActive
                    ? isSimulador ? 'border-purple-600 text-purple-700' : 'border-teal-600 text-teal-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}>
                <Icon className="w-4 h-4" />
                {tab.label}
                {isSimulador && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: 'rgba(26,96,64,0.12)', color: '#1a6040' }}>admin</span>}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === 'pastos'       && <PastosTab onRequestDelete={setDeleteTarget} onRequestEdit={setEditTarget} canEdit={canEdit} />}
        {activeTab === 'animais'      && <AnimaisTab onRequestDelete={setDeleteTarget} onRequestEdit={setEditTarget} canEdit={canEdit} />}
        {activeTab === 'forragens'    && <SimpleTab table="forage_types" label="Forragem" icon={Sprout} emptyText="Nenhuma forragem cadastrada" newLabel="Nova Forragem" predefinedOptions={FORRAGENS} onRequestDelete={setDeleteTarget} onRequestEdit={setEditTarget} canEdit={canEdit} />}
        {activeTab === 'suplementos'  && <SuplementosTab onRequestDelete={setDeleteTarget} onRequestEdit={setEditTarget} canEdit={canEdit} />}
        {activeTab === 'funcionarios' && <FuncionariosTab onRequestDelete={setSimpleDeleteTarget} onRequestEdit={setEditTarget} canEdit={canEdit} />}
        {activeTab === 'simulados'    && isAdmin && <SimuladosTab onRequestDelete={setDeleteTarget} onRequestEdit={setEditTarget} canEdit={canEdit} />}

      </motion.div>

      {/* Exclusão com senha (Pastos e Animais) */}
      <AnimatePresence>
        {deleteTarget && (
          <PasswordConfirmModal
            title="Confirmar Exclusão"
            description={deleteTarget.label}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* Edição com senha (todas as abas) */}
      <AnimatePresence>
        {editTarget && (
          <PasswordConfirmModal
            title="Confirmar Edição"
            description={editTarget.label}
            onConfirm={handleEditConfirm}
            onCancel={() => setEditTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* Confirmação simples — sem senha (Suplementos, Funcionários, Forragens) */}
      <AnimatePresence>
        {simpleDeleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => !simpleDeleting && setSimpleDeleteTarget(null)}
          >
            <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10 p-6"
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ duration: 0.18 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-50">
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Confirmar exclusão</h2>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{simpleDeleteTarget.label}</p>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-5">Você deseja mesmo excluir? Esta ação não pode ser desfeita.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSimpleDeleteTarget(null)}
                  disabled={simpleDeleting}
                  className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSimpleDeleteConfirm}
                  disabled={simpleDeleting}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-40"
                >
                  {simpleDeleting ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
