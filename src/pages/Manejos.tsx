import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ClipboardList, MapPin, ArrowRight, TrendingUp, Scissors,
  X, Save, RefreshCw, ChevronDown, AlertTriangle, History, Baby, Milk, Search, FileText, GitMerge,
  LayoutGrid, List,
} from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { manejoService, type Animal, type AnimalCategory, type ManejoEvent } from '../services/manejoService';
import { farmService } from '../services/farmService';
import type { Pasture } from '../context/DataContext';
import type { DataEntry } from '../lib/data';
import { SkeletonTable } from '../components/Skeleton';
import { META_CONSUMO } from '../lib/data';

/* ── helpers ── */

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const selectClass =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors';
const inputClass =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

const TIPO_LABELS: Record<string, string> = {
  alocacao:           'Alocação',
  transferencia:      'Transferência',
  evolucao_categoria: 'Evolução',
  paricao:            'Parição',
  manejo_bezerros:    'Desmama',
  abate:              'Abate',
  venda:              'Venda',
  desagrupamento:     'Desagrupamento',
  ajuste_quantidade:  'Ajuste',
  fusao:              'Fusão de Lotes',
  transf_parcial:     'Transf. Parcial',
};
const TIPO_COLORS: Record<string, string> = {
  alocacao:           'bg-blue-50 text-blue-700',
  transferencia:      'bg-indigo-50 text-indigo-700',
  evolucao_categoria: 'bg-amber-50 text-amber-700',
  paricao:            'bg-pink-50 text-pink-700',
  manejo_bezerros:    'bg-orange-50 text-orange-700',
  abate:              'bg-red-50 text-red-700',
  venda:              'bg-purple-50 text-purple-700',
  desagrupamento:     'bg-cyan-50 text-cyan-700',
  ajuste_quantidade:  'bg-gray-100 text-gray-600',
  fusao:              'bg-emerald-50 text-emerald-700',
  transf_parcial:     'bg-violet-50 text-violet-700',
};

/* ── Histórico compartilhado ── */

function HistoricoTable({ events, loading }: { events: ManejoEvent[]; loading: boolean }) {
  if (loading) return <SkeletonTable rows={4} cols={3} />;
  if (events.length === 0) return (
    <div className="text-center py-10 text-gray-400">
      <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p className="text-sm">Nenhum evento registrado ainda.</p>
    </div>
  );
  return (
    <div className="divide-y divide-gray-100">
      {events.map(e => (
        <div key={e.id} className="flex items-start gap-3 py-3">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${TIPO_COLORS[e.tipo] ?? 'bg-gray-100 text-gray-600'}`}>
            {TIPO_LABELS[e.tipo] ?? e.tipo}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-700 leading-relaxed">{e.descricao}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(e.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   TAB 1 — Lotes por Pasto
══════════════════════════════════════════════════════════════ */

function LotesTab({
  animals, pastures, categories, onReload, farmName, canEdit = true,
  suppTypes = [], entries = [], ganhoAcumMap = {},
}: {
  animals: Animal[]; pastures: Pasture[]; categories: AnimalCategory[];
  onReload: () => void; farmName: string; canEdit?: boolean;
  suppTypes?: Array<{ id: string; nome: string; consumo: string | null; gmd_esperado: number | null }>;
  entries?: DataEntry[];
  ganhoAcumMap?: Record<string, { ganho: number; data: string; confirmado: boolean }>;
}) {
  const [alocarAnimal, setAlocarAnimal] = useState<Animal | null>(null);
  const [pastoSel, setPastoSel] = useState('');
  const [dataAlocacao, setDataAlocacao] = useState(() => new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  async function handleMetaSave(animalId: string, pct: number | null) {
    try {
      await manejoService.atualizarMetaPercentagem(animalId, pct);
      onReload();
    } catch {
      toast.error('Erro ao salvar percentagem.');
    }
  }

  // ── View mode toggle ──
  const [viewMode, setViewMode] = useState<'lista' | 'card'>(() => {
    return (localStorage.getItem('manejos_view_mode') as 'lista' | 'card') ?? 'card';
  });
  function toggleView(mode: 'lista' | 'card') {
    setViewMode(mode);
    localStorage.setItem('manejos_view_mode', mode);
  }

  // ── Filtro por categoria ──
  const [catFiltro, setCatFiltro] = useState<string | null>(null);

  // ── Filter ──
  const [search, setSearch] = useState('');

  const catMap = useMemo(
    () => Object.fromEntries(categories.map(c => [c.id, c.nome])),
    [categories]
  );
  const pastoMap = useMemo(
    () => Object.fromEntries(pastures.map(p => [p.id, p.nome])),
    [pastures]
  );

  // Mapa: nome do pasto → gmd_esperado do suplemento mais recente lançado nele
  const pastoGmdMap = useMemo(() => {
    const suppGmdByNome: Record<string, number | null> = {};
    for (const s of suppTypes) suppGmdByNome[s.nome] = s.gmd_esperado ?? null;

    const latestByPasto: Record<string, string> = {};
    for (const e of entries) {
      if (!e.pasto || !e.data || !e.tipo) continue;
      if (!latestByPasto[e.pasto] || e.data > latestByPasto[e.pasto]) latestByPasto[e.pasto] = e.data;
    }
    const result: Record<string, number> = {};
    for (const e of entries) {
      if (!e.pasto || !e.data || !e.tipo) continue;
      if (e.data !== latestByPasto[e.pasto]) continue;
      const gmd = suppGmdByNome[e.tipo];
      if (gmd && gmd > 0) result[e.pasto] = gmd;
    }
    return result;
  }, [suppTypes, entries]);

  // Mapa: nome do pasto → consumoPct (%) do suplemento mais recente lançado nele
  const pastoNomeMetaMap = useMemo(() => {
    const suppByNome: Record<string, string | null> = {};
    for (const s of suppTypes) suppByNome[s.nome] = s.consumo;

    const latestByPasto: Record<string, string> = {};
    for (const e of entries) {
      if (!e.pasto || !e.data || !e.tipo) continue;
      if (!latestByPasto[e.pasto] || e.data > latestByPasto[e.pasto]) {
        latestByPasto[e.pasto] = e.data;
      }
    }

    const pastoSuppMap: Record<string, string> = {};
    for (const e of entries) {
      if (!e.pasto || !e.data || !e.tipo) continue;
      if (e.data === latestByPasto[e.pasto]) {
        pastoSuppMap[e.pasto] = e.tipo;
      }
    }

    const result: Record<string, number> = {};
    for (const [pastoNome, suppNome] of Object.entries(pastoSuppMap)) {
      const consumo = suppByNome[suppNome] ?? null;
      if (!consumo) continue;
      const pctStr = META_CONSUMO[consumo] ?? null;
      if (!pctStr) continue;
      const pct = parseFloat(pctStr.replace('%', '').replace(',', '.'));
      if (!isNaN(pct) && pct > 0) result[pastoNome] = pct;
    }
    return result;
  }, [suppTypes, entries]);

  const ativos = animals.filter(a => a.status === 'ativo' || !a.status);

  // Categorias que têm pelo menos 1 animal ativo
  const categoriasAtivas = useMemo(() => {
    const ids = new Set(ativos.map(a => a.categoria_id).filter(Boolean) as string[]);
    return categories.filter(c => ids.has(c.id));
  }, [ativos, categories]);

  // Filtro combinado: texto + categoria
  const ativosFiltrados = useMemo(() => {
    let result = ativos;
    if (catFiltro) {
      result = result.filter(a => a.categoria_id === catFiltro);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.nome.toLowerCase().includes(q) ||
        (a.categoria_id && (catMap[a.categoria_id] ?? '').toLowerCase().includes(q)) ||
        (a.pasto_id && (pastoMap[a.pasto_id] ?? '').toLowerCase().includes(q))
      );
    }
    return result;
  }, [ativos, search, catFiltro, catMap, pastoMap]);

  const byPasto = useMemo(() => {
    const map: Record<string, Animal[]> = {};
    for (const a of ativosFiltrados) {
      if (a.pasto_id) {
        map[a.pasto_id] = [...(map[a.pasto_id] ?? []), a];
      }
    }
    return map;
  }, [ativosFiltrados]);

  const semPasto = ativosFiltrados.filter(a => !a.pasto_id);
  const pastosComLotes = pastures.filter(p => byPasto[p.id]?.length);

  // ── Somatória global da fazenda ──
  const globalStats = useMemo(() => {
    const base = search.trim() ? ativosFiltrados : ativos;
    const filteredPastos = search.trim() ? pastures.filter(p => byPasto[p.id]?.length) : pastosComLotes;
    const totalHA      = filteredPastos.reduce((s, p) => s + (p.area ?? 0), 0);
    const totalLotes   = filteredPastos.length;
    const totalCab     = base.reduce((s, a) => s + a.quantidade, 0);
    const pesoNum      = base.reduce((s, a) => s + a.quantidade * (a.peso_medio ?? 0), 0);
    const pesoDen      = base.filter(a => a.peso_medio).reduce((s, a) => s + a.quantidade, 0);
    const pesoMedio    = pesoDen > 0 ? pesoNum / pesoDen : null;
    const totalBez     = base.reduce((s, a) => s + (a.bezerros_quantidade ?? 0), 0);
    const bezPesoNum   = base.reduce((s, a) => s + (a.bezerros_quantidade ?? 0) * (a.bezerros_peso_medio ?? 0), 0);
    const bezPesoDen   = base.filter(a => a.bezerros_quantidade && a.bezerros_peso_medio).reduce((s, a) => s + (a.bezerros_quantidade ?? 0), 0);
    const bezPesoMedio = bezPesoDen > 0 ? bezPesoNum / bezPesoDen : null;
    // Taxa de Lotação: UA = (cab×pesoGado + bez×pesoBez) / 450 → UA/ha
    const totalKgUA    = base.reduce((s, a) => s + a.quantidade * (a.peso_medio ?? 0) + (a.bezerros_quantidade ?? 0) * (a.bezerros_peso_medio ?? 0), 0);
    const totalUA      = totalKgUA / 450;
    const taxaLotacao  = totalHA > 0 && totalKgUA > 0 ? totalUA / totalHA : null;
    const pastosTotal    = pastures.length;
    const pastosOcupados = new Set(ativos.filter(a => a.pasto_id).map(a => a.pasto_id)).size;
    return { totalHA, totalLotes, totalCab, pesoMedio, totalBez, bezPesoMedio, taxaLotacao, pastosTotal, pastosOcupados };
  }, [pastosComLotes, ativosFiltrados, ativos, search, byPasto, pastures]);

  async function confirmarAlocacao() {
    if (!alocarAnimal || !pastoSel) return;
    setSaving(true);
    try {
      await manejoService.alocarPasto(alocarAnimal, pastoSel, pastoMap[pastoSel] ?? pastoSel, dataAlocacao);
      toast.success(`Lote "${alocarAnimal.nome}" alocado!`);
      setAlocarAnimal(null);
      setDataAlocacao(new Date().toISOString().split('T')[0]);
      onReload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao alocar lote.');
    } finally {
      setSaving(false);
    }
  }

  function AnimalRow({ a }: { a: Animal }) {
    const [draft, setDraft] = useState('');
    const [editMode, setEditMode] = useState(false); // desbloqueia input antes de salvar no banco
    const inputRef = useRef<HTMLInputElement>(null);
    // Quando o banco confirma o novo valor, sai do editMode e limpa o draft
    useEffect(() => { setDraft(''); setEditMode(false); }, [a.meta_percentagem]);

    // META do suplemento para o pasto deste lote (via closure)
    const pastoNome    = a.pasto_id ? (pastoMap[a.pasto_id] ?? '') : '';
    const pastoMetaPct = pastoNomeMetaMap[pastoNome] ?? null;

    // isAuto: sem valor manual E não está em modo de edição
    const isAuto    = a.meta_percentagem == null && !editMode;
    const inputLocked = isAuto; // input só é disabled quando realmente auto

    const activePct = isAuto
      ? pastoMetaPct
      : (draft !== '' ? parseFloat(draft.replace(',', '.')) : (a.meta_percentagem ?? null));
    const meta = activePct != null && !isNaN(activePct) && a.peso_medio != null
      ? (a.peso_medio * activePct / 100)
      : null;

    return (
      <>
        <tr className="hover:bg-gray-50 transition-colors">
          <td className="px-4 py-2.5 font-medium text-gray-900 text-sm">{a.nome}</td>
          <td className="px-4 py-2.5 text-xs text-gray-600">{a.categoria_id ? catMap[a.categoria_id] ?? '—' : '—'}</td>
          <td className="px-4 py-2.5 text-sm font-semibold" style={{ color: '#1a6040' }}>{a.quantidade.toLocaleString('pt-BR')}</td>
          <td className="px-4 py-2.5 text-xs text-gray-600">{a.peso_medio ? `${a.peso_medio} kg` : '—'}</td>
          <td className="px-4 py-2.5">
            <div className="flex flex-col gap-1">
              {/* Linha 1: toggle + input + % */}
              <div className="flex items-center gap-1.5">
                {pastoMetaPct != null && (
                  <button
                    onClick={async () => {
                      if (!isAuto) {
                        setEditMode(false);
                        setDraft('');
                        await handleMetaSave(a.id, null);
                      } else {
                        setEditMode(true);
                        setDraft(String(pastoMetaPct));
                        setTimeout(() => inputRef.current?.focus(), 30);
                      }
                    }}
                    title={isAuto ? 'AUTO (suplemento) — clique para definir manualmente' : 'Manual — clique para usar automático'}
                    className={`flex-shrink-0 w-7 h-4 rounded-full transition-colors relative ${isAuto ? 'bg-teal-500' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${isAuto ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                  </button>
                )}
                <input
                  ref={inputRef}
                  type="number" step="0.1" min="0" max="100"
                  value={inputLocked
                    ? (pastoMetaPct != null ? String(pastoMetaPct) : '')
                    : (draft !== '' ? draft : (a.meta_percentagem != null ? String(a.meta_percentagem) : ''))
                  }
                  placeholder="—"
                  disabled={inputLocked}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={async () => {
                    if (draft === '' && a.meta_percentagem == null && !editMode) return;
                    const val = draft === '' ? null : parseFloat(draft.replace(',', '.'));
                    if (val !== null && isNaN(val)) return;
                    await handleMetaSave(a.id, val);
                  }}
                  className={`w-12 h-6 px-1 text-xs font-semibold rounded text-center transition-colors ${
                    inputLocked
                      ? 'text-teal-600 bg-teal-50 border border-teal-200 opacity-70 cursor-not-allowed focus:outline-none'
                      : 'text-blue-700 bg-blue-50 border border-blue-200 focus:outline-none focus:ring-1 focus:ring-blue-400'
                  }`}
                />
                <span className={`text-[10px] ${isAuto ? 'text-teal-400' : 'text-blue-400'}`}>%</span>
              </div>
              {/* Linha 2: Meta Acum. + valor calculado */}
              {meta != null && (
                <span className={`text-xs font-bold ${isAuto ? 'text-teal-700' : 'text-blue-700'}`}>
                  %={meta.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} KG
                </span>
              )}
            </div>
          </td>
          <td className="px-4 py-2.5">
            {(() => {
              const hist = ganhoAcumMap[a.id];
              if (hist) {
                return (
                  <div>
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-bold" style={{ color: '#1a6040' }}>
                        {hist.ganho.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
                      </p>
                      {hist.confirmado && (
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-green-100 text-green-700">✓</span>
                      )}
                    </div>
                    <p className="text-[9px] text-gray-400">{a.gmd ? `${a.gmd} kg/d` : ''}</p>
                  </div>
                );
              }
              const pastoNomeA = a.pasto_id ? (pastoMap[a.pasto_id] ?? null) : null;
              const effectiveGmd = a.gmd ?? (pastoNomeA ? (pastoGmdMap[pastoNomeA] ?? null) : null);
              if (effectiveGmd && a.data_entrada) {
                const dias = Math.max(0, Math.floor((Date.now() - new Date(a.data_entrada).getTime()) / 86_400_000));
                return (
                  <div>
                    <p className="text-xs font-bold text-gray-400">
                      {(effectiveGmd * dias).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
                    </p>
                    <p className="text-[9px] text-gray-400">{dias}d · {effectiveGmd} kg/d</p>
                  </div>
                );
              }
              return <span className="text-xs text-gray-300">—</span>;
            })()}
          </td>
          <td className="px-4 py-2.5 text-xs text-gray-500">{a.sexo ?? '—'}</td>
          <td className="px-4 py-2.5 no-print">
            {canEdit && (!a.pasto_id ? (
              <button
                onClick={() => { setAlocarAnimal(a); setPastoSel(''); }}
                className="text-xs px-2.5 py-1 rounded-lg border border-teal-300 text-teal-600 hover:bg-teal-50 transition-colors font-medium"
              >
                Alocar
              </button>
            ) : (
              <span className="text-[10px] text-gray-400 italic">use Transferir</span>
            ))}
          </td>
        </tr>
        {(a.bezerros_quantidade ?? 0) > 0 && (
          <tr className="bg-orange-50/60">
            <td className="pl-8 pr-4 py-1.5 text-xs text-orange-700 italic">↳ Bezerros</td>
            <td className="px-4 py-1.5 text-xs text-orange-600">—</td>
            <td className="px-4 py-1.5 text-xs font-semibold text-orange-700">{a.bezerros_quantidade!.toLocaleString('pt-BR')}</td>
            <td className="px-4 py-1.5 text-xs text-orange-600">{a.bezerros_peso_medio ? `${a.bezerros_peso_medio} kg` : '—'}</td>
            <td />
            <td />
            <td className="no-print" />
          </tr>
        )}
      </>
    );
  }

  function TableWrap({ children }: { children: React.ReactNode }) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Lote', 'Categoria', 'Cabeças', 'Peso Médio', '% Meta', 'Meta Acum.', 'Sexo', ''].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider${h === '% Meta' ? ' text-blue-400' : h === 'Meta Acum.' ? ' text-teal-600' : ' text-gray-500'}${i === 7 ? ' no-print' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">{children}</tbody>
          </table>
        </div>
      </div>
    );
  }

  // Card por PASTO — contém todas as infos do pasto + lotes dentro
  function PastoCard({
    pasto, animaisPasto, totalCab, pesoMedio, bezTotal, bezPesoMedio, taxaLotacao, pastoMetaPct,
  }: {
    pasto: Pasture;
    animaisPasto: Animal[];
    totalCab: number;
    pesoMedio: number | null;
    bezTotal: number;
    bezPesoMedio: number | null;
    taxaLotacao: number | null;
    pastoMetaPct: number | null;
  }) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-teal-200 transition-all overflow-hidden flex flex-col"
      >
        {/* ── Cabeçalho do Pasto ── */}
        <div className="px-4 pt-3 pb-2.5 border-b border-gray-100" style={{ background: 'rgba(26,96,64,0.05)' }}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                <p className="font-bold text-gray-900 text-sm leading-tight truncate">{pasto.nome}</p>
              </div>
              {pasto.area && (
                <p className="text-[10px] text-gray-400 mt-0.5 ml-5">{pasto.area} ha</p>
              )}
            </div>
            {taxaLotacao != null && (
              <span className="flex-shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 whitespace-nowrap">
                {taxaLotacao.toFixed(2).replace('.', ',')} UA/HA
              </span>
            )}
          </div>

          {/* Stats do pasto em linha */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5">
            <div>
              <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Total </span>
              <span className="text-xs font-bold" style={{ color: '#1a6040' }}>{totalCab.toLocaleString('pt-BR')} cab.</span>
            </div>
            {pesoMedio != null && (
              <div>
                <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Peso </span>
                <span className="text-xs font-bold text-gray-700">{pesoMedio.toFixed(0)} kg/cab</span>
              </div>
            )}
            {bezTotal > 0 && (
              <div>
                <span className="text-[9px] font-semibold uppercase tracking-widest text-orange-400">Bez. </span>
                <span className="text-xs font-bold text-orange-600">{bezTotal.toLocaleString('pt-BR')} cab.</span>
                {bezPesoMedio != null && (
                  <span className="text-[9px] text-orange-400 ml-1">{bezPesoMedio.toFixed(0)} kg</span>
                )}
              </div>
            )}
            <div>
              <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Lotes </span>
              <span className="text-xs font-bold text-gray-600">{animaisPasto.length}</span>
            </div>
          </div>
        </div>

        {/* ── Lotes dentro do card ── */}
        <div className="flex flex-col divide-y divide-gray-100">
          {animaisPasto.map(a => {
            const catNome = a.categoria_id ? catMap[a.categoria_id] ?? null : null;
            const hasBez = (a.bezerros_quantidade ?? 0) > 0;
            return (
              <div key={a.id} className="px-4 py-3">
                {/* Nome + sexo */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-bold text-gray-800 text-sm leading-tight">{a.nome}</p>
                  {a.sexo && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase tracking-wide flex-shrink-0">
                      {a.sexo}
                    </span>
                  )}
                </div>
                {catNome && (
                  <p className="text-[10px] font-semibold mb-2" style={{ color: '#1a6040' }}>{catNome}</p>
                )}

                {/* Cabeças + Peso lado a lado */}
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Cabeças</p>
                    <p className="text-base font-bold leading-none" style={{ color: '#1a6040' }}>
                      {a.quantidade.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="w-px h-6 bg-gray-100 flex-shrink-0" />
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Peso Médio</p>
                    <p className="text-base font-bold text-gray-800 leading-none">
                      {a.peso_medio ? <>{a.peso_medio}<span className="text-[10px] font-normal text-gray-400"> kg</span></> : '—'}
                    </p>
                  </div>
                  {(() => {
                    if (!a.gmd || !a.data_entrada || !a.peso_medio) return null;
                    const dias = Math.max(0, Math.floor((Date.now() - new Date(a.data_entrada).getTime()) / 86_400_000));
                    const pesoSim = a.peso_medio + a.gmd * dias;
                    return (
                      <>
                        <div className="w-px h-6 bg-gray-100 flex-shrink-0" />
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: '#1a6040' }}>Peso Simulado</p>
                          <p className="text-base font-bold leading-none" style={{ color: '#1a6040' }}>
                            {pesoSim.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}<span className="text-[10px] font-normal text-gray-400"> kg</span>
                          </p>
                          <p className="text-[9px] text-gray-400">+{dias}d · {a.gmd} kg/d</p>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* META/CAB/DIA badge — usa meta_percentagem individual ou fallback do suplemento */}
                {(() => {
                  const pct = a.meta_percentagem ?? pastoMetaPct;
                  if (a.peso_medio == null || pct == null) return null;
                  const isCustom = a.meta_percentagem != null;
                  return (
                    <div className="mt-2">
                      <div className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${isCustom ? 'bg-blue-50 border border-blue-200' : 'bg-teal-50 border border-teal-200'}`}>
                        <p className={`text-[9px] font-semibold uppercase tracking-wide leading-none ${isCustom ? 'text-blue-400' : 'text-teal-500'}`}>META/CAB/DIA</p>
                        <p className={`text-sm font-bold leading-none ${isCustom ? 'text-blue-700' : 'text-teal-700'}`}>
                          {(a.peso_medio * pct / 100).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                          <span className={`text-[10px] font-normal ${isCustom ? 'text-blue-400' : 'text-teal-400'}`}> KG</span>
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Badge M.A. — ganho acumulado do lote neste pasto */}
                {(() => {
                  const hist = ganhoAcumMap[a.id];
                  if (!hist) return null;
                  return (
                    <div className="mt-1">
                      <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                        <p className="text-[9px] text-green-500 font-semibold uppercase tracking-wide leading-none">M.A.</p>
                        <p className="text-sm font-bold text-green-700 leading-none">
                          {hist.ganho.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          <span className="text-[10px] font-normal text-green-400"> KG</span>
                        </p>
                        {hist.confirmado && (
                          <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-green-200 text-green-800">✓</span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Bezerros */}
                {hasBez && (
                  <div className="mt-2 rounded-lg bg-orange-50 border border-orange-200 px-3 py-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Baby className="w-3 h-3 text-orange-500 flex-shrink-0" />
                      <span className="text-[10px] font-bold text-orange-700 uppercase tracking-wide">Bezerros</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-orange-700">{a.bezerros_quantidade!.toLocaleString('pt-BR')} cab.</span>
                      {a.bezerros_peso_medio && (
                        <span className="text-[10px] text-orange-500 font-medium">{a.bezerros_peso_medio} kg</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    );
  }

  if (ativos.length === 0) return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-20 text-center">
      <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-500 font-medium">Nenhum lote ativo cadastrado</p>
      <p className="text-xs text-gray-400 mt-1">Cadastre lotes em Cadastros → Animais</p>
    </div>
  );

  return (
    <>
      {/* ── Print-only header ── */}
      <div className="print-only mb-6">
        <div className="pdf-brand-bar rounded-xl px-6 py-4 mb-5 flex items-center justify-between">
          <div>
            <p className="text-white text-[10px] font-semibold uppercase tracking-widest opacity-80 mb-0.5">
              Movimento Pecuário · Suplemento Control{farmName ? ` · ${farmName}` : ''}
            </p>
            <h1 className="text-white text-xl font-bold">Situação dos Pastos</h1>
          </div>
          <div className="text-right">
            <p className="text-white text-xs opacity-70">Emitido em</p>
            <p className="text-white text-sm font-semibold">
              {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
        {/* Stats resumo */}
        <div className="flex items-stretch gap-4 mb-5">
          <div className="flex-1 border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Área Total</p>
            <p className="text-sm font-bold text-gray-800">{globalStats.totalHA > 0 ? `${globalStats.totalHA.toLocaleString('pt-BR')} ha` : '—'}</p>
          </div>
          <div className="flex-1 border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">N° Pastos</p>
            <p className="text-sm font-bold text-gray-800">{globalStats.totalLotes}</p>
          </div>
          <div className="flex-1 border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Total Cabeças</p>
            <p className="text-sm font-bold text-gray-800">{globalStats.totalCab.toLocaleString('pt-BR')} cab.</p>
          </div>
          <div className="flex-1 border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Peso Médio Pond.</p>
            <p className="text-sm font-bold text-gray-800">{globalStats.pesoMedio != null ? `${globalStats.pesoMedio.toFixed(0)} kg` : '—'}</p>
          </div>
          {globalStats.totalBez > 0 && (
            <>
              <div className="flex-1 border border-orange-200 rounded-lg px-4 py-3" style={{ background: '#fff7ed' }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#c2410c' }}>Bezerros</p>
                <p className="text-sm font-bold" style={{ color: '#c2410c' }}>{globalStats.totalBez.toLocaleString('pt-BR')} cab.</p>
                {globalStats.bezPesoMedio != null && (
                  <p className="text-[10px] mt-0.5" style={{ color: '#c2410c' }}>{globalStats.bezPesoMedio.toFixed(0)} kg pond.</p>
                )}
              </div>
              <div className="flex-1 border border-gray-200 rounded-lg px-4 py-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Total Geral</p>
                <p className="text-sm font-bold text-gray-900">{(globalStats.totalCab + globalStats.totalBez).toLocaleString('pt-BR')} cab.</p>
                <p className="text-[10px] text-gray-400">gado + bezerros</p>
              </div>
            </>
          )}
          {globalStats.taxaLotacao != null && (
            <div className="flex-1 border border-teal-200 rounded-lg px-4 py-3" style={{ background: '#f0fdf4' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#1a6040' }}>Taxa de Lotação</p>
              <p className="text-sm font-bold" style={{ color: '#1a6040' }}>{globalStats.taxaLotacao.toFixed(2).replace('.', ',')} UA/ha</p>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar única: texto | categoria | lista/card | PDF */}
      <div className="flex items-center gap-2 mb-5 no-print">

        {/* 1. Filtro por texto */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar lote, categoria ou pasto…"
            className="w-full h-9 pl-9 pr-8 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 2. Filtro por categoria (select) */}
        {categoriasAtivas.length > 0 && (
          <div className="relative flex-shrink-0">
            <select
              value={catFiltro ?? ''}
              onChange={e => setCatFiltro(e.target.value || null)}
              className="h-9 pl-3 pr-8 rounded-lg border text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
              style={{
                borderColor: catFiltro ? '#1a6040' : '#e5e7eb',
                color: catFiltro ? '#1a6040' : '#6b7280',
                background: catFiltro ? 'rgba(26,96,64,0.06)' : '#fff',
                minWidth: '11rem',
              }}
            >
              <option value="">Todas as categorias</option>
              {categoriasAtivas.map(c => {
                const count = ativos.filter(a => a.categoria_id === c.id).length;
                return (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({count})
                  </option>
                );
              })}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: catFiltro ? '#1a6040' : '#9ca3af' }} />
          </div>
        )}

        {/* Contagem quando filtrado */}
        {(search || catFiltro) && (
          <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
            {ativosFiltrados.length} lote{ativosFiltrados.length !== 1 ? 's' : ''}
          </span>
        )}

        {/* 3. Toggle lista / card */}
        <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden flex-shrink-0">
          <button
            onClick={() => toggleView('lista')}
            title="Visualização em lista"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              viewMode === 'lista' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lista</span>
          </button>
          <button
            onClick={() => toggleView('card')}
            title="Visualização em cards"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-l border-gray-200 ${
              viewMode === 'card' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cards</span>
          </button>
        </div>

        {/* PDF */}
        <button
          onClick={() => window.print()}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors font-medium flex-shrink-0"
        >
          <FileText className="w-4 h-4" />
          Exportar PDF
        </button>
      </div>

      {/* ── Header global da fazenda ── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-3 mb-6 flex flex-wrap gap-x-6 gap-y-2 items-center">
        {/* Área + Pastos */}
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Área Total</p>
          <p className="text-base font-bold text-gray-800">{globalStats.totalHA > 0 ? `${globalStats.totalHA.toLocaleString('pt-BR')} ha` : '—'}</p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Pastos Total</p>
          <p className="text-base font-bold text-gray-800">{globalStats.pastosTotal}</p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Pastos Ocupados</p>
          <p className="text-base font-bold" style={{ color: '#1a6040' }}>{globalStats.pastosOcupados}</p>
        </div>

        <div className="w-px h-8 bg-gray-200 self-center" />

        {/* Gado */}
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Cabeças</p>
          <p className="text-base font-bold" style={{ color: '#1a6040' }}>{globalStats.totalCab.toLocaleString('pt-BR')} cab.</p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Peso Médio Pond.</p>
          <p className="text-base font-bold text-gray-800">{globalStats.pesoMedio != null ? `${globalStats.pesoMedio.toFixed(0)} kg` : '—'}</p>
        </div>

        {globalStats.totalBez > 0 && (
          <>
            <div className="w-px h-8 bg-orange-200 self-center" />
            {/* Bezerros */}
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-orange-400">Bezerros</p>
              <p className="text-base font-bold text-orange-600">{globalStats.totalBez.toLocaleString('pt-BR')} cab.</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-orange-400">Peso Médio Pond. Bez.</p>
              <p className="text-base font-bold text-orange-600">{globalStats.bezPesoMedio != null ? `${globalStats.bezPesoMedio.toFixed(0)} kg` : '—'}</p>
            </div>

            <div className="w-px h-8 bg-gray-200 self-center" />

            {/* Total geral */}
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Total Geral</p>
              <p className="text-base font-bold text-gray-900">
                {(globalStats.totalCab + globalStats.totalBez).toLocaleString('pt-BR')} cab.
              </p>
              <p className="text-[10px] text-gray-400">gado + bezerros</p>
            </div>
          </>
        )}
        {globalStats.taxaLotacao != null && (
          <>
            <div className="w-px h-8 bg-teal-200 self-center" />
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: '#1a6040' }}>Taxa de Lotação</p>
              <p className="text-base font-bold" style={{ color: '#1a6040' }}>{globalStats.taxaLotacao.toFixed(2).replace('.', ',')} UA/ha</p>
            </div>
          </>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>

        {/* ══ MODO LISTA ══ */}
        {viewMode === 'lista' && (
          <motion.div key="lista-view" className="space-y-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {pastosComLotes.map(p => {
              const animaisPasto   = byPasto[p.id];
              const totalCabPasto  = animaisPasto.reduce((s, a) => s + a.quantidade, 0);
              const pesoNum        = animaisPasto.reduce((s, a) => s + a.quantidade * (a.peso_medio ?? 0), 0);
              const pesoDen        = animaisPasto.filter(a => a.peso_medio).reduce((s, a) => s + a.quantidade, 0);
              const pesoMedioPasto = pesoDen > 0 ? pesoNum / pesoDen : null;
              const bezPasto       = animaisPasto.reduce((s, a) => s + (a.bezerros_quantidade ?? 0), 0);
              const bezPesoNum     = animaisPasto.reduce((s, a) => s + (a.bezerros_quantidade ?? 0) * (a.bezerros_peso_medio ?? 0), 0);
              const bezPesoDen     = animaisPasto.filter(a => a.bezerros_quantidade && a.bezerros_peso_medio).reduce((s, a) => s + (a.bezerros_quantidade ?? 0), 0);
              const bezPesoMedioPasto = bezPesoDen > 0 ? bezPesoNum / bezPesoDen : null;
              const uaTotal        = (animaisPasto.reduce((s, a) => s + a.quantidade * (a.peso_medio ?? 0), 0) + animaisPasto.reduce((s, a) => s + (a.bezerros_quantidade ?? 0) * (a.bezerros_peso_medio ?? 0), 0)) / 450;
              const taxaLotacao    = p.area && uaTotal > 0 ? uaTotal / p.area : null;
              return (
                <section key={p.id}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <MapPin className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <h3 className="font-semibold text-gray-800">{p.nome}</h3>
                    {p.area && <span className="text-xs text-gray-400">· {p.area} ha</span>}
                    <div className="ml-auto flex items-center gap-2 flex-wrap">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{totalCabPasto.toLocaleString('pt-BR')} cab.</span>
                      {pesoMedioPasto != null && <span className="text-xs bg-teal-50 px-2 py-0.5 rounded-full font-semibold" style={{ color: '#1a6040' }}>{pesoMedioPasto.toFixed(0)} kg/cab</span>}
                      {bezPasto > 0 && <><span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-semibold">{bezPasto.toLocaleString('pt-BR')} bez.</span>{bezPesoMedioPasto != null && <span className="text-xs bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full">{bezPesoMedioPasto.toFixed(0)} kg/bez</span>}</>}
                      <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{animaisPasto.length} lote{animaisPasto.length !== 1 ? 's' : ''}</span>
                      {taxaLotacao != null && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-semibold border border-green-200">TAXA: {taxaLotacao.toFixed(2).replace('.', ',')} UA/HA</span>}
                    </div>
                  </div>
                  <TableWrap>{animaisPasto.map(a => <AnimalRow key={a.id} a={a} />)}</TableWrap>
                </section>
              );
            })}
            {semPasto.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <h3 className="font-semibold text-gray-700">Não alocados</h3>
                  <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full ml-auto">{semPasto.length} lote{semPasto.length !== 1 ? 's' : ''}</span>
                </div>
                <TableWrap>{semPasto.map(a => <AnimalRow key={a.id} a={a} />)}</TableWrap>
              </section>
            )}
          </motion.div>
        )}

        {/* ══ MODO CARD ══ — grid de PastoCards */}
        {viewMode === 'card' && (
          <motion.div key="card-view" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {pastosComLotes.map(p => {
              const animaisPasto      = byPasto[p.id];
              const totalCabPasto     = animaisPasto.reduce((s, a) => s + a.quantidade, 0);
              const pesoNum           = animaisPasto.reduce((s, a) => s + a.quantidade * (a.peso_medio ?? 0), 0);
              const pesoDen           = animaisPasto.filter(a => a.peso_medio).reduce((s, a) => s + a.quantidade, 0);
              const pesoMedioPasto    = pesoDen > 0 ? pesoNum / pesoDen : null;
              const bezPasto          = animaisPasto.reduce((s, a) => s + (a.bezerros_quantidade ?? 0), 0);
              const bezPesoNum        = animaisPasto.reduce((s, a) => s + (a.bezerros_quantidade ?? 0) * (a.bezerros_peso_medio ?? 0), 0);
              const bezPesoDen        = animaisPasto.filter(a => a.bezerros_quantidade && a.bezerros_peso_medio).reduce((s, a) => s + (a.bezerros_quantidade ?? 0), 0);
              const bezPesoMedioPasto = bezPesoDen > 0 ? bezPesoNum / bezPesoDen : null;
              const uaTotal           = (animaisPasto.reduce((s, a) => s + a.quantidade * (a.peso_medio ?? 0), 0) + animaisPasto.reduce((s, a) => s + (a.bezerros_quantidade ?? 0) * (a.bezerros_peso_medio ?? 0), 0)) / 450;
              const taxaLotacao       = p.area && uaTotal > 0 ? uaTotal / p.area : null;
              return (
                <PastoCard key={p.id}
                  pasto={p}
                  animaisPasto={animaisPasto}
                  totalCab={totalCabPasto}
                  pesoMedio={pesoMedioPasto}
                  bezTotal={bezPasto}
                  bezPesoMedio={bezPesoMedioPasto}
                  taxaLotacao={taxaLotacao}
                  pastoMetaPct={pastoNomeMetaMap[p.nome] ?? null}
                />
              );
            })}
            {/* Não alocados como card especial */}
            {semPasto.length > 0 && (
              <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}
                className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden flex flex-col">
                <div className="px-4 pt-3 pb-2.5 border-b border-amber-100" style={{ background: 'rgba(251,191,36,0.06)' }}>
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <p className="font-bold text-amber-700 text-sm">Não alocados</p>
                  </div>
                  <div className="mt-1.5">
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">Total </span>
                    <span className="text-xs font-bold text-amber-600">{semPasto.reduce((s, a) => s + a.quantidade, 0).toLocaleString('pt-BR')} cab.</span>
                    <span className="ml-3 text-[9px] font-semibold uppercase tracking-widest text-gray-400">Lotes </span>
                    <span className="text-xs font-bold text-gray-600">{semPasto.length}</span>
                  </div>
                </div>
                <div className="flex flex-col divide-y divide-gray-100">
                  {semPasto.map(a => {
                    const catNome = a.categoria_id ? catMap[a.categoria_id] ?? null : null;
                    return (
                      <div key={a.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="font-bold text-gray-800 text-sm">{a.nome}</p>
                          {a.sexo && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase">{a.sexo}</span>}
                        </div>
                        {catNome && <p className="text-[10px] font-semibold mb-2" style={{ color: '#1a6040' }}>{catNome}</p>}
                        <div className="flex items-center gap-4 mb-2">
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Cabeças</p>
                            <p className="text-base font-bold leading-none" style={{ color: '#1a6040' }}>{a.quantidade.toLocaleString('pt-BR')}</p>
                          </div>
                          <div className="w-px h-6 bg-gray-100 flex-shrink-0" />
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Peso Médio</p>
                            <p className="text-base font-bold text-gray-800 leading-none">{a.peso_medio ? <>{a.peso_medio}<span className="text-[10px] font-normal text-gray-400"> kg</span></> : '—'}</p>
                          </div>
                        </div>
                        {canEdit && <button onClick={() => { setAlocarAnimal(a); setPastoSel(''); }}
                          className="w-full text-xs px-3 py-1.5 rounded-lg border border-teal-300 text-teal-600 hover:bg-teal-50 transition-colors font-semibold no-print">
                          Alocar ao Pasto
                        </button>}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

      </AnimatePresence>

      {/* Modal alocar */}
      <AnimatePresence>
        {alocarAnimal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setAlocarAnimal(null)} />
            <motion.div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900">Alocar Lote</h3>
                <button onClick={() => setAlocarAnimal(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className={labelClass}>Lote</label>
                  <p className="text-sm font-semibold text-gray-900">{alocarAnimal.nome}</p>
                  <p className="text-xs text-gray-500">
                    {alocarAnimal.quantidade} cabeças
                    {alocarAnimal.categoria_id ? ` · ${catMap[alocarAnimal.categoria_id] ?? ''}` : ''}
                    {(alocarAnimal.bezerros_quantidade ?? 0) > 0 ? ` · ${alocarAnimal.bezerros_quantidade} bez.` : ''}
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Pasto destino</label>
                  <div className="relative">
                    <select value={pastoSel} onChange={e => setPastoSel(e.target.value)} className={selectClass}>
                      <option value="">— Selecionar Pasto —</option>
                      {pastures.filter(p => p.id !== alocarAnimal.pasto_id).map(p => {
                        const lotesNoPasto = ativos.filter(a => a.pasto_id === p.id);
                        const lotesDesc = lotesNoPasto.map(a =>
                          `${a.nome} (${a.quantidade} cab.${a.categoria_id ? ' · ' + (catMap[a.categoria_id] ?? '') : ''})`
                        ).join(', ');
                        return (
                          <option key={p.id} value={p.id}>
                            {p.nome}{p.area ? ` · ${p.area} ha` : ''}{lotesDesc ? ` — ${lotesDesc}` : ' — sem lotes'}
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Data</label>
                  <input type="date" value={dataAlocacao} onChange={e => setDataAlocacao(e.target.value)} max={new Date().toISOString().split('T')[0]} className={inputClass} />
                </div>
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                <button onClick={() => setAlocarAnimal(null)}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-white transition-colors">
                  Cancelar
                </button>
                <button onClick={confirmarAlocacao} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors disabled:opacity-60">
                  <Save className="w-4 h-4" />
                  {saving ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   TAB 2 — Transferir Lote
══════════════════════════════════════════════════════════════ */

function TransferirTab({
  animals, pastures, farmId, onReload, categories, userName, canEdit = true,
}: {
  animals: Animal[]; pastures: Pasture[]; farmId: string; onReload: () => void; categories: AnimalCategory[]; userName?: string; canEdit?: boolean;
}) {
  const [loteId, setLoteId]         = useState('');
  const [destPastoId, setDestPastoId] = useState('');
  const [obs, setObs]               = useState('');
  const [data, setData]             = useState(() => new Date().toISOString().split('T')[0]);
  const [saving, setSaving]         = useState(false);
  const [events, setEvents]         = useState<ManejoEvent[]>([]);
  const [loadingH, setLoadingH]     = useState(true);

  // Controle de transferência parcial
  const [isParcial, setIsParcial]   = useState(false);
  const [parcQtd, setParcQtd]       = useState('');
  const [parcBezQtd, setParcBezQtd] = useState('');
  const [parcPeso, setParcPeso]     = useState('');
  // Se o pasto destino já tem lotes, o usuário pode agregar em um deles ou criar novo
  const [parcModo, setParcModo]     = useState<'novo' | 'agregar'>('novo');
  const [parcMergeId, setParcMergeId] = useState('');
  const [parcNovoNome, setParcNovoNome] = useState('');

  const ativos = animals.filter(a => a.status === 'ativo' || !a.status);
  const pastoMap = useMemo(() => Object.fromEntries(pastures.map(p => [p.id, p.nome])), [pastures]);
  const catMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c.nome])), [categories]);
  const lote = ativos.find(a => a.id === loteId);

  // Lotes já existentes no pasto de destino
  const lotesDestino = useMemo(
    () => ativos.filter(a => a.pasto_id === destPastoId && a.id !== loteId),
    [ativos, destPastoId, loteId]
  );

  useEffect(() => {
    setLoadingH(true);
    manejoService.listarHistorico(farmId, ['transferencia', 'transf_parcial'], 30)
      .then(setEvents).catch(() => {}).finally(() => setLoadingH(false));
  }, [farmId]);

  function resetForm() {
    setLoteId(''); setDestPastoId(''); setObs(''); setData(new Date().toISOString().split('T')[0]);
    setIsParcial(false); setParcQtd(''); setParcBezQtd(''); setParcPeso(''); setParcModo('novo'); setParcMergeId(''); setParcNovoNome('');
  }

  async function confirmar() {
    if (!lote || !destPastoId) { toast.error('Selecione o lote e o pasto de destino.'); return; }
    if (lote.pasto_id === destPastoId && !isParcial) { toast.error('O lote já está neste pasto.'); return; }
    const destNome = pastoMap[destPastoId] ?? destPastoId;

    if (!isParcial) {
      // Transferência completa do lote para outro pasto
      if (lote.pasto_id === destPastoId) { toast.error('O lote já está neste pasto.'); return; }
      setSaving(true);
      try {
        const origemNome = lote.pasto_id ? (pastoMap[lote.pasto_id] ?? 'sem pasto') : 'sem pasto';
        await manejoService.transferir(lote, destPastoId, origemNome, destNome, data, obs || undefined);
        toast.success(`"${lote.nome}" transferido para ${destNome}!`);
        resetForm(); onReload();
        const updated = await manejoService.listarHistorico(farmId, ['transferencia', 'transf_parcial'], 30);
        setEvents(updated);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao transferir.');
      } finally { setSaving(false); }
    } else {
      // Transferência parcial para pasto de destino
      const qtd = Number(parcQtd);
      if (!qtd || qtd <= 0) { toast.error('Informe a quantidade a transferir.'); return; }
      if (parcModo === 'novo' && !parcNovoNome.trim()) { toast.error('Informe o nome do novo lote.'); return; }
      if (parcModo === 'agregar' && !parcMergeId) { toast.error('Selecione o lote de destino.'); return; }
      const mergeLote = parcModo === 'agregar' ? ativos.find(a => a.id === parcMergeId) : undefined;
      setSaving(true);
      try {
        await manejoService.transferirParcialParaPasto({
          origem: lote, qtd, bezQtd: parcBezQtd ? Number(parcBezQtd) : undefined,
          pesoNovoLote: parcPeso ? Number(parcPeso) : undefined,
          destPastoId, destPastoNome: destNome, farmId, data,
          mergeLoteId:      mergeLote?.id,
          mergeLoteNome:    mergeLote?.nome,
          mergeLoteQtd:     mergeLote?.quantidade,
          mergeLoteBezQtd:  mergeLote?.bezerros_quantidade,
          novoLoteNome: parcModo === 'novo' ? parcNovoNome.trim() : undefined,
          userName,
        });
        toast.success(`${qtd} cab. de "${lote.nome}" → ${destNome}!`);
        resetForm(); onReload();
        const updated = await manejoService.listarHistorico(farmId, ['transferencia', 'transf_parcial'], 30);
        setEvents(updated);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao transferir.');
      } finally { setSaving(false); }
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form — apenas quem pode editar */}
      {canEdit && <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <ArrowRight className="w-4 h-4 text-teal-600" />
          <h3 className="font-semibold text-gray-900">Transferir lote</h3>
        </div>

        {/* Toggle completo/parcial */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          <button type="button" onClick={() => setIsParcial(false)}
            className={`flex-1 px-3 py-2 transition-colors ${!isParcial ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
            Lote completo
          </button>
          <button type="button" onClick={() => setIsParcial(true)}
            className={`flex-1 px-3 py-2 border-l border-gray-200 transition-colors ${isParcial ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
            Transferência parcial
          </button>
        </div>

        <div>
          <label className={labelClass}>Lote de Origem</label>
          <div className="relative">
            <select value={loteId} onChange={e => { setLoteId(e.target.value); setDestPastoId(''); setParcMergeId(''); }} className={selectClass}>
              <option value="">Selecione um lote…</option>
              {ativos.filter(a => !!a.pasto_id).map(a => {
                const catNome = a.categoria_id ? (catMap[a.categoria_id] ?? '') : '';
                const bezInfo = (a.bezerros_quantidade ?? 0) > 0 ? ` +${a.bezerros_quantidade} bez.` : '';
                return (
                  <option key={a.id} value={a.id}>
                    {a.nome} ({a.quantidade} cab.{catNome ? ` · ${catNome}` : ''}{bezInfo}) · {pastoMap[a.pasto_id!] ?? ''}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {lote && (
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
            <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span>Pasto atual: <strong>{lote.pasto_id ? (pastoMap[lote.pasto_id] ?? '—') : 'Não alocado'}</strong></span>
            <span className="ml-auto text-xs text-gray-400">{lote.quantidade} cab. disponíveis</span>
          </div>
        )}

        {/* Quantidade (apenas parcial) */}
        {isParcial && (
          <div>
            <label className={labelClass}>
              Qtd. a transferir{lote ? <span className="ml-1 text-gray-400 font-normal">(máx. {lote.quantidade})</span> : ''}
            </label>
            <input
              type="number" min="1" max={lote?.quantidade}
              value={parcQtd} onChange={e => setParcQtd(e.target.value)}
              placeholder="Ex: 20" className={inputClass} disabled={!loteId}
            />
          </div>
        )}

        {/* Bezerros a transferir (apenas parcial e se o lote tem bezerros) */}
        {isParcial && lote && (lote.bezerros_quantidade ?? 0) > 0 && (
          <div>
            <label className={labelClass}>
              <span className="text-orange-600 font-semibold">Bezerros a transferir</span>
              <span className="ml-1 text-gray-400 font-normal">(máx. {lote.bezerros_quantidade} · opcional)</span>
            </label>
            <input
              type="number" min="0" max={lote.bezerros_quantidade}
              value={parcBezQtd} onChange={e => setParcBezQtd(e.target.value)}
              placeholder="Ex: 5" className={inputClass}
            />
          </div>
        )}

        {/* Peso médio do novo lote (apenas parcial — novo lote) */}
        {isParcial && parcModo === 'novo' && (
          <div>
            <label className={labelClass}>
              Peso médio do novo lote (kg)
              <span className="ml-1 text-gray-400 font-normal">· deixe em branco para manter o peso do lote origem</span>
            </label>
            <input
              type="number" min="0" step="0.1"
              value={parcPeso} onChange={e => setParcPeso(e.target.value)}
              placeholder={lote?.peso_medio ? `Padrão: ${lote.peso_medio} kg` : 'Ex: 350'}
              className={inputClass}
            />
          </div>
        )}

        <div>
          <label className={labelClass}>Pasto de destino</label>
          <div className="relative">
            <select value={destPastoId} onChange={e => { setDestPastoId(e.target.value); setParcMergeId(''); setParcModo('novo'); }} className={selectClass} disabled={!loteId}>
              <option value="">Selecione o pasto…</option>
              {pastures.filter(p => !isParcial ? p.id !== lote?.pasto_id : true).map(p => {
                const nLotes = ativos.filter(a => a.pasto_id === p.id && a.id !== loteId).length;
                return (
                  <option key={p.id} value={p.id}>
                    {p.nome}{p.area ? ` (${p.area} ha)` : ''}{nLotes > 0 ? ` · ${nLotes} lote${nLotes !== 1 ? 's' : ''}` : ' · vazio'}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Opções de destino parcial quando pasto tem lotes */}
        {isParcial && destPastoId && (
          <div className="space-y-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
              <button type="button" onClick={() => setParcModo('novo')}
                className={`flex-1 px-3 py-2 transition-colors ${parcModo === 'novo' ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                Criar novo lote
              </button>
              {lotesDestino.length > 0 && (
                <button type="button" onClick={() => setParcModo('agregar')}
                  className={`flex-1 px-3 py-2 border-l border-gray-200 transition-colors ${parcModo === 'agregar' ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  Agregar em lote existente
                </button>
              )}
            </div>
            {parcModo === 'novo' ? (
              <input
                type="text" value={parcNovoNome} onChange={e => setParcNovoNome(e.target.value)}
                placeholder="Nome do novo lote (ex: Garrotes Mar/26)"
                className={inputClass}
              />
            ) : (
              <div className="relative">
                <select value={parcMergeId} onChange={e => setParcMergeId(e.target.value)} className={selectClass}>
                  <option value="">Selecione o lote…</option>
                  {lotesDestino.map(a => (
                    <option key={a.id} value={a.id}>{a.nome} · {a.quantidade} cab.{a.categoria_id ? ` · ${catMap[a.categoria_id] ?? ''}` : ''}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            )}
          </div>
        )}

        <div>
          <label className={labelClass}>Data da transferência</label>
          <input type="date" value={data} onChange={e => setData(e.target.value)}
            max={new Date().toISOString().split('T')[0]} className={inputClass} />
        </div>

        {!isParcial && (
          <div>
            <label className={labelClass}>Observação (opcional)</label>
            <input type="text" value={obs} onChange={e => setObs(e.target.value)}
              placeholder="Ex: transferência por superlotação"
              className={inputClass} />
          </div>
        )}

        <button onClick={confirmar} disabled={saving || !loteId || !destPastoId}
          className="flex items-center gap-2 w-full justify-center px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <ArrowRight className="w-4 h-4" />
          {saving ? 'Transferindo...' : isParcial ? 'Confirmar Transferência Parcial' : 'Confirmar Transferência'}
        </button>
      </div>}

      {/* Histórico */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-gray-400" />
          <h3 className="font-semibold text-gray-700 text-sm">Histórico de transferências</h3>
        </div>
        <HistoricoTable events={events} loading={loadingH} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   TAB 3 — Evolução (Categoria · Parição · Bezerros)
══════════════════════════════════════════════════════════════ */

type SubOp = 'categoria' | 'paricao' | 'bezerros';
type DestinoTipo = 'existente' | 'novo';

function DestinoSelector({ destino, setDestino, loteDestId, setLoteDestId, novoNome, setNovoNome, novoCatId, setNovoCatId, excludeId, animals, catMap, categories }: {
  destino: DestinoTipo; setDestino: (v: DestinoTipo) => void;
  loteDestId: string; setLoteDestId: (v: string) => void;
  novoNome: string; setNovoNome: (v: string) => void;
  novoCatId: string; setNovoCatId: (v: string) => void;
  excludeId?: string;
  animals: Animal[];
  catMap: Record<string, string>;
  categories: AnimalCategory[];
}) {
  return (
    <div className="space-y-3">
      <label className={labelClass}>Destino dos bezerros</label>
      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
        <button type="button" onClick={() => setDestino('novo')}
          className={`flex-1 px-3 py-2 transition-colors ${destino === 'novo' ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
          Criar novo lote
        </button>
        <button type="button" onClick={() => setDestino('existente')}
          className={`flex-1 px-3 py-2 border-l border-gray-200 transition-colors ${destino === 'existente' ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
          Agregar em lote existente
        </button>
      </div>
      {destino === 'existente' ? (
        <div className="relative">
          <select value={loteDestId} onChange={e => setLoteDestId(e.target.value)} className={selectClass}>
            <option value="">Selecione o lote…</option>
            {animals.filter(a => a.id !== excludeId).map(a => (
              <option key={a.id} value={a.id}>{a.nome} · {a.quantidade} cab.{a.categoria_id ? ` · ${catMap[a.categoria_id] ?? ''}` : ''}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
      ) : (
        <div className="space-y-2">
          <input type="text" value={novoNome} onChange={e => setNovoNome(e.target.value)}
            placeholder="Nome do novo lote (ex: Bezerros Jan/26)"
            className={inputClass} />
          <div className="relative">
            <select value={novoCatId} onChange={e => setNovoCatId(e.target.value)} className={selectClass}>
              <option value="">Categoria (opcional)…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>
      )}
    </div>
  );
}

function EvolucaoTab({
  animals, categories, farmId, onReload, canEdit = true,
}: {
  animals: Animal[]; categories: AnimalCategory[]; farmId: string; onReload: () => void; canEdit?: boolean;
}) {
  const [subOp, setSubOp]         = useState<SubOp>('categoria');
  const [saving, setSaving]       = useState(false);
  const [events, setEvents]       = useState<ManejoEvent[]>([]);
  const [loadingH, setLoadingH]   = useState(true);

  /* ── Categoria ── */
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [novaCatId, setNovaCatId] = useState('');
  const [catPeso, setCatPeso]     = useState('');
  const [catBezPeso, setCatBezPeso] = useState('');
  const [catData, setCatData]     = useState(() => new Date().toISOString().split('T')[0]);

  /* ── Parição ── */
  const [parLoteMaeId, setParLoteMaeId]   = useState('');
  const [parQtd, setParQtd]               = useState('');
  const [parPeso, setParPeso]             = useState('');
  const [parData, setParData]             = useState(() => new Date().toISOString().split('T')[0]);


  /* ── Bezerros ── */
  const [bezLoteId, setBezLoteId]         = useState('');
  const [bezQtd, setBezQtd]               = useState('');
  const [bezPeso, setBezPeso]             = useState('');
  const [bezData, setBezData]             = useState(() => new Date().toISOString().split('T')[0]);
  const [bezDestino, setBezDestino]       = useState<DestinoTipo>('novo');
  const [bezLoteDestId, setBezLoteDestId] = useState('');
  const [bezNovoNome, setBezNovoNome]     = useState('');
  const [bezNovoCatId, setBezNovoCatId]   = useState('');

  /* ── Fundir Lotes ── */
  const [fundirNome, setFundirNome]     = useState('');
  const [fundirData, setFundirData]     = useState(() => new Date().toISOString().split('T')[0]);


  const ativos = animals.filter(a => a.status === 'ativo' || !a.status);
  const catMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c.nome])), [categories]);

  const [evolSearch, setEvolSearch] = useState('');
  const ativosFiltradosEvol = useMemo(() => {
    if (!evolSearch.trim()) return ativos;
    const q = evolSearch.toLowerCase();
    return ativos.filter(a =>
      a.nome.toLowerCase().includes(q) ||
      (a.categoria_id && (catMap[a.categoria_id] ?? '').toLowerCase().includes(q))
    );
  }, [ativos, evolSearch, catMap]);

  const EVOLUCAO_TIPOS = ['evolucao_categoria', 'paricao', 'manejo_bezerros'];

  useEffect(() => {
    setLoadingH(true);
    manejoService.listarHistorico(farmId, EVOLUCAO_TIPOS, 30)
      .then(setEvents).catch(() => {}).finally(() => setLoadingH(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId]);

  async function reloadHistorico() {
    const updated = await manejoService.listarHistorico(farmId, EVOLUCAO_TIPOS, 30);
    setEvents(updated);
  }

  /* checkboxes */
  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const selectedAnimals = ativos.filter(a => selected.has(a.id));
  const totalCab = selectedAnimals.reduce((s, a) => s + a.quantidade, 0);
  const selectedHasBez = selectedAnimals.some(a => (a.bezerros_quantidade ?? 0) > 0);

  /* ── Confirmar: Categoria ── */
  async function confirmarCategoria() {
    if (selected.size === 0) { toast.error('Selecione pelo menos um lote.'); return; }
    if (!novaCatId) { toast.error('Selecione a nova categoria.'); return; }
    const catOrigemNomes = [...new Set(selectedAnimals.map(a => a.categoria_id ? (catMap[a.categoria_id] ?? 'sem categoria') : 'sem categoria'))].join(', ');
    setSaving(true);
    try {
      await manejoService.evoluirCategorias(
        selectedAnimals, novaCatId, catOrigemNomes, catMap[novaCatId] ?? novaCatId,
        catPeso ? Number(catPeso) : undefined, catData,
        catBezPeso ? Number(catBezPeso) : undefined,
      );
      if (catPeso) {
        await manejoService.confirmarPesoReal(farmId, selectedAnimals, Number(catPeso), catData);
      }
      toast.success(`${selected.size} lote(s) evoluído(s) para ${catMap[novaCatId]}!`);
      setSelected(new Set()); setNovaCatId(''); setCatPeso(''); setCatBezPeso(''); setCatData(new Date().toISOString().split('T')[0]);
      onReload(); await reloadHistorico();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Erro.'); }
    finally { setSaving(false); }
  }

  /* ── Confirmar: Parição ── */
  async function confirmarParicao() {
    if (!parLoteMaeId) { toast.error('Selecione o lote mãe.'); return; }
    if (!parQtd || Number(parQtd) <= 0) { toast.error('Informe a quantidade de partos.'); return; }
    const loteMae = ativos.find(a => a.id === parLoteMaeId)!;
    setSaving(true);
    try {
      await manejoService.registrarParicao({
        loteMae, qtdPartos: Number(parQtd),
        pesoMedio: parPeso ? Number(parPeso) : undefined,
        data: parData, farmId,
      });
      toast.success(`Parição registrada: ${parQtd} bezerro(s) adicionados ao lote!`);
      setParLoteMaeId(''); setParQtd(''); setParPeso('');
      setParData(new Date().toISOString().split('T')[0]);
      onReload(); await reloadHistorico();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Erro.'); }
    finally { setSaving(false); }
  }


  /* ── Confirmar: Bezerros ── */
  async function confirmarBezerros() {
    if (!bezLoteId) { toast.error('Selecione o lote de origem.'); return; }
    if (!bezQtd || Number(bezQtd) <= 0) { toast.error('Informe a quantidade de bezerros.'); return; }
    if (bezDestino === 'existente' && !bezLoteDestId) { toast.error('Selecione o lote de destino.'); return; }
    if (bezDestino === 'novo' && !bezNovoNome.trim()) { toast.error('Informe o nome do novo lote.'); return; }
    const loteOrigem = ativos.find(a => a.id === bezLoteId)!;
    setSaving(true);
    try {
      await manejoService.manejarBezerros({
        loteOrigem, qtdBezerros: Number(bezQtd),
        pesoMedio: bezPeso ? Number(bezPeso) : undefined,
        data: bezData,
        destino: bezDestino === 'existente'
          ? { tipo: 'existente', loteId: bezLoteDestId }
          : { tipo: 'novo', nome: bezNovoNome.trim(), categoriaId: bezNovoCatId || undefined },
        farmId,
        loteDestinoNome: bezDestino === 'existente' ? (ativos.find(a => a.id === bezLoteDestId)?.nome ?? '') : undefined,
      });
      toast.success(`Desmama registrada: ${bezQtd} cab.!`);
      setBezLoteId(''); setBezQtd(''); setBezPeso(''); setBezLoteDestId(''); setBezNovoNome(''); setBezNovoCatId(''); setBezDestino('novo');
      onReload(); await reloadHistorico();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Erro.'); }
    finally { setSaving(false); }
  }

  /* ── Confirmar: Fundir Lotes ── */
  async function confirmarFundir() {
    if (selected.size < 2) { toast.error('Selecione pelo menos 2 lotes.'); return; }
    if (!fundirNome.trim()) { toast.error('Informe o nome do lote resultante.'); return; }
    setSaving(true);
    try {
      await manejoService.fundirLotes(selectedAnimals, fundirNome.trim(), farmId, fundirData);
      toast.success(`Lotes fundidos em "${fundirNome.trim()}"! (${totalCab} cab.)`);
      setSelected(new Set()); setFundirNome(''); setFundirData(new Date().toISOString().split('T')[0]);
      onReload(); await reloadHistorico();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Erro.'); }
    finally { setSaving(false); }
  }

  const SUB_OPS = [
    { id: 'categoria'    as SubOp, label: 'Categoria',      icon: TrendingUp },
    { id: 'paricao'      as SubOp, label: 'Parição',        icon: Baby },
    { id: 'bezerros'     as SubOp, label: 'Desmama',        icon: Milk },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form — apenas quem pode editar */}
      {canEdit && <div className="space-y-4">
        {/* Seletor de sub-operação */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
          {SUB_OPS.map(s => {
            const Icon = s.icon;
            const active = subOp === s.id;
            return (
              <button key={s.id} onClick={() => setSubOp(s.id)}
                className={`flex items-center gap-1.5 flex-1 justify-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  active ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {s.label}
              </button>
            );
          })}
        </div>

        {/* ── Sub-op: Categoria ── */}
        {subOp === 'categoria' && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-teal-600" />
                  <h3 className="font-semibold text-gray-900 text-sm">Selecione os lotes</h3>
                </div>
                <div className="flex items-center gap-2">
                  {selected.size > 0 && (
                    <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-semibold">
                      {selected.size} sel. · {totalCab} cab.
                    </span>
                  )}
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={evolSearch}
                      onChange={e => setEvolSearch(e.target.value)}
                      placeholder="Filtrar lotes..."
                      className="h-7 pl-6 pr-2 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      style={{ width: 120 }}
                    />
                  </div>
                </div>
              </div>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {ativos.length === 0 ? (
                  <p className="text-center py-8 text-sm text-gray-400">Nenhum lote ativo.</p>
                ) : ativosFiltradosEvol.length === 0 ? (
                  <p className="text-center py-8 text-sm text-gray-400">Nenhum lote encontrado.</p>
                ) : ativosFiltradosEvol.map(a => {
                  const on = selected.has(a.id);
                  return (
                    <label key={a.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors select-none ${on ? 'bg-teal-50' : 'hover:bg-gray-50'}`}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${on ? 'bg-teal-500 border-teal-500' : 'border-gray-300'}`}>
                        {on && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <input type="checkbox" checked={on} onChange={() => toggle(a.id)} className="sr-only" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{a.nome}</p>
                        <p className="text-xs text-gray-500">
                          {a.categoria_id ? catMap[a.categoria_id] : 'sem categoria'} · {a.quantidade} cab.
                          {(a.bezerros_quantidade ?? 0) > 0 && (
                            <span className="ml-1.5 text-orange-600 font-semibold">+ {a.bezerros_quantidade} bez.</span>
                          )}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            {/* ── Painel Fundir (aparece quando 2+ lotes selecionados) ── */}
            {selected.size >= 2 && (
              <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: '#1a6040', background: 'rgba(26,96,64,0.04)' }}>
                <div className="flex items-center gap-2">
                  <GitMerge className="w-4 h-4" style={{ color: '#1a6040' }} />
                  <span className="text-sm font-bold" style={{ color: '#1a6040' }}>Fundir Lotes</span>
                  <span className="text-xs text-gray-500 ml-1">{selected.size} lotes · {totalCab} cab.</span>
                </div>
                <div>
                  <label className={labelClass}>Nome do lote resultante</label>
                  <input
                    type="text"
                    value={fundirNome}
                    onChange={e => setFundirNome(e.target.value)}
                    placeholder="Ex: Lote Vacas Adultas"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Data da fusão</label>
                  <input type="date" value={fundirData} onChange={e => setFundirData(e.target.value)} max={new Date().toISOString().split('T')[0]} className={inputClass} />
                </div>
                <button
                  onClick={confirmarFundir}
                  disabled={saving || !fundirNome.trim()}
                  className="flex items-center gap-2 w-full justify-center px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#1a6040' }}
                >
                  <GitMerge className="w-4 h-4" />
                  {saving ? 'Fundindo...' : `Confirmar Fusão — "${fundirNome || '...'}" (${totalCab} cab.)`}
                </button>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
              <div>
                <label className={labelClass}>Nova categoria</label>
                <div className="relative">
                  <select value={novaCatId} onChange={e => setNovaCatId(e.target.value)} className={selectClass}>
                    <option value="">Selecione…</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Novo peso médio — Animal (opcional)</label>
                <input type="number" min="0" step="0.1" value={catPeso} onChange={e => setCatPeso(e.target.value)} placeholder="Ex: 220 kg" className={inputClass} />
              </div>
              {selectedHasBez && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-2">
                  <p className="text-xs font-semibold text-orange-700 flex items-center gap-1.5">
                    <span>🐄</span> Bezerros detectados nos lotes selecionados
                  </p>
                  <div>
                    <label className={labelClass}>Novo peso médio — Bezerros (opcional)</label>
                    <input
                      type="number" min="0" step="0.1"
                      value={catBezPeso}
                      onChange={e => setCatBezPeso(e.target.value)}
                      placeholder="Ex: 120 kg"
                      className={inputClass}
                    />
                  </div>
                </div>
              )}
              <div>
                <label className={labelClass}>Data da evolução</label>
                <input type="date" value={catData} onChange={e => setCatData(e.target.value)} max={new Date().toISOString().split('T')[0]} className={inputClass} />
              </div>
              <button onClick={confirmarCategoria} disabled={saving || selected.size === 0 || !novaCatId}
                className="flex items-center gap-2 w-full justify-center px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <TrendingUp className="w-4 h-4" />
                {saving ? 'Salvando...' : `Evoluir ${selected.size > 0 ? `${selected.size} lote(s) · ${totalCab} cab.` : 'selecionados'}`}
              </button>
            </div>
          </>
        )}

        {/* ── Sub-op: Parição ── */}
        {subOp === 'paricao' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Baby className="w-4 h-4 text-pink-500" />
              <h3 className="font-semibold text-gray-900">Registrar parição</h3>
            </div>
            <div>
              <label className={labelClass}>Lote mãe <span className="text-pink-400 font-normal">(apenas fêmeas)</span></label>
              <div className="relative">
                <select value={parLoteMaeId} onChange={e => setParLoteMaeId(e.target.value)} className={selectClass}>
                  <option value="">Selecione o lote…</option>
                  {ativos.filter(a => a.sexo?.toLowerCase().replace('ê','e') === 'femea' && a.prenha === true).map(a => <option key={a.id} value={a.id}>{a.nome} · {a.quantidade} cab.{a.categoria_id ? ` · ${catMap[a.categoria_id] ?? ''}` : ''}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Qtd. de partos</label>
                <input type="number" min="1" value={parQtd} onChange={e => setParQtd(e.target.value)} placeholder="Ex: 12" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Peso médio bezerros (kg)</label>
                <input type="number" min="0" step="0.1" value={parPeso} onChange={e => setParPeso(e.target.value)} placeholder="Ex: 28" className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Data</label>
              <input type="date" value={parData} onChange={e => setParData(e.target.value)} max={new Date().toISOString().split('T')[0]} className={inputClass} />
            </div>
            <div className="text-xs text-pink-600 bg-pink-50 border border-pink-200 rounded-lg px-3 py-2">
              Os bezerros nascidos serão adicionados ao próprio lote da mãe.
            </div>
            <button onClick={confirmarParicao} disabled={saving || !parLoteMaeId || !parQtd}
              className="flex items-center gap-2 w-full justify-center px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Baby className="w-4 h-4" />
              {saving ? 'Registrando...' : 'Confirmar Parição'}
            </button>
          </div>
        )}

        {/* ── Sub-op: Bezerros ── */}
        {subOp === 'bezerros' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Milk className="w-4 h-4 text-orange-500" />
              <h3 className="font-semibold text-gray-900">Desmama</h3>
            </div>
            <div>
              <label className={labelClass}>Lote de origem <span className="text-orange-400 font-normal">(fêmeas com bezerros ao pé)</span></label>
              <div className="relative">
                <select value={bezLoteId} onChange={e => setBezLoteId(e.target.value)} className={selectClass}>
                  <option value="">Selecione o lote…</option>
                  {ativos.filter(a => a.sexo?.toLowerCase().replace('ê','e') === 'femea' && (a.bezerros_quantidade ?? 0) > 0).map(a => <option key={a.id} value={a.id}>{a.nome} · {a.quantidade} cab. · {a.bezerros_quantidade} bez.{a.categoria_id ? ` · ${catMap[a.categoria_id] ?? ''}` : ''}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              {bezLoteId && (() => {
                const loteSel = ativos.find(a => a.id === bezLoteId);
                return loteSel?.bezerros_quantidade ? (
                  <p className="text-xs mt-1 font-medium" style={{ color: '#1a6040' }}>
                    Bezerros disponíveis: {loteSel.bezerros_quantidade} cab.
                  </p>
                ) : null;
              })()}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Qtd. de bezerros</label>
                <input type="number" min="1" value={bezQtd} onChange={e => setBezQtd(e.target.value)} placeholder="Ex: 20" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Peso médio (kg)</label>
                <input type="number" min="0" step="0.1" value={bezPeso} onChange={e => setBezPeso(e.target.value)} placeholder="Ex: 95" className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Data</label>
              <input type="date" value={bezData} onChange={e => setBezData(e.target.value)} max={new Date().toISOString().split('T')[0]} className={inputClass} />
            </div>
            <DestinoSelector
              destino={bezDestino} setDestino={setBezDestino}
              loteDestId={bezLoteDestId} setLoteDestId={setBezLoteDestId}
              novoNome={bezNovoNome} setNovoNome={setBezNovoNome}
              novoCatId={bezNovoCatId} setNovoCatId={setBezNovoCatId}
              excludeId={bezLoteId}
              animals={ativos} catMap={catMap} categories={categories}
            />
            <button onClick={confirmarBezerros} disabled={saving || !bezLoteId || !bezQtd}
              className="flex items-center gap-2 w-full justify-center px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Milk className="w-4 h-4" />
              {saving ? 'Registrando...' : 'Confirmar Desmama'}
            </button>
          </div>
        )}

      </div>}

      {/* Histórico */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-gray-400" />
          <h3 className="font-semibold text-gray-700 text-sm">Histórico de evoluções</h3>
        </div>
        <HistoricoTable events={events} loading={loadingH} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   TAB 4 — Abate
══════════════════════════════════════════════════════════════ */

type TipoSaida = 'abate' | 'venda';

function AbateTab({
  animals, categories, farmId, onReload, canEdit = true,
}: {
  animals: Animal[]; categories: AnimalCategory[]; farmId: string; onReload: () => void; canEdit?: boolean;
}) {
  const [tipoSaida, setTipoSaida] = useState<TipoSaida>('abate');
  const [loteId, setLoteId]       = useState('');
  const [qtd, setQtd]             = useState('');
  const [peso, setPeso]           = useState('');
  const [dataSaida, setDataSaida] = useState(() => new Date().toISOString().split('T')[0]);
  const [obs, setObs]             = useState('');
  const [saving, setSaving]       = useState(false);
  const [events, setEvents]       = useState<ManejoEvent[]>([]);
  const [loadingH, setLoadingH]   = useState(true);

  const ativos  = animals.filter(a => a.status === 'ativo' || !a.status);
  const lote    = ativos.find(a => a.id === loteId);
  const qtdNum  = Number(qtd);
  const restam  = lote ? lote.quantidade - qtdNum : 0;
  const catMap  = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c.nome])), [categories]);

  const SAIDA_TIPOS: { id: TipoSaida; label: string; color: string }[] = [
    { id: 'abate', label: 'Abate (abatedor)', color: 'bg-red-600 hover:bg-red-700' },
    { id: 'venda', label: 'Venda direta',     color: 'bg-purple-600 hover:bg-purple-700' },
  ];

  const SAIDA_HISTORICO_TIPOS = ['abate', 'venda', 'desagrupamento'];

  useEffect(() => {
    setLoadingH(true);
    manejoService.listarHistorico(farmId, SAIDA_HISTORICO_TIPOS, 25)
      .then(setEvents).catch(() => {}).finally(() => setLoadingH(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId]);

  function resetForm() {
    setLoteId(''); setQtd(''); setPeso(''); setDataSaida(new Date().toISOString().split('T')[0]); setObs('');
  }

  async function confirmarSaida() {
    if (!lote) { toast.error('Selecione um lote.'); return; }
    if (!qtd || qtdNum <= 0) { toast.error('Informe a quantidade de cabeças.'); return; }
    if (qtdNum > lote.quantidade) { toast.error(`Máximo ${lote.quantidade} cabeças para este lote.`); return; }
    const encerrar = qtdNum >= lote.quantidade;
    if (encerrar && !window.confirm(`Atenção: isso vai encerrar o lote "${lote.nome}". Confirmar?`)) return;
    setSaving(true);
    try {
      await manejoService.registrarSaida(lote, qtdNum, tipoSaida as 'abate' | 'venda', peso ? Number(peso) : undefined, dataSaida, obs || undefined);
      toast.success(`${TIPO_LABELS[tipoSaida]}: ${qtdNum} cab. registrado!${encerrar ? ' Lote encerrado.' : ''}`);
      resetForm();
      onReload();
      const updated = await manejoService.listarHistorico(farmId, SAIDA_HISTORICO_TIPOS, 25);
      setEvents(updated);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar saída.');
    } finally { setSaving(false); }
  }

  const activeColor = SAIDA_TIPOS.find(t => t.id === tipoSaida)?.color ?? 'bg-red-600';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form — apenas quem pode editar */}
      {canEdit && <div className="space-y-4">
        {/* Seletor de tipo */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
          {SAIDA_TIPOS.map(t => {
            const active = tipoSaida === t.id;
            return (
              <button key={t.id} onClick={() => { setTipoSaida(t.id); setLoteId(''); setQtd(''); }}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  active ? t.color + ' text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-gray-500" />
            <h3 className="font-semibold text-gray-900 text-sm">
              {tipoSaida === 'abate' ? 'Abate (venda para abatedor)' : 'Venda direta'}
            </h3>
          </div>

          <div>
            <label className={labelClass}>Lote de origem</label>
            <div className="relative">
              <select value={loteId} onChange={e => { setLoteId(e.target.value); setQtd(''); }} className={selectClass}>
                <option value="">Selecione um lote…</option>
                {ativos.map(a => <option key={a.id} value={a.id}>{a.nome} · {a.quantidade} cab.{a.categoria_id ? ` · ${catMap[a.categoria_id] ?? ''}` : ''}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Cabeças</label>
              <input type="number" min="1" max={lote?.quantidade}
                value={qtd} onChange={e => setQtd(e.target.value)}
                placeholder={lote ? `Máx. ${lote.quantidade}` : '0'}
                className={inputClass} disabled={!loteId} />
              {lote && qtdNum > 0 && (
                <p className={`text-xs mt-1 font-medium ${restam <= 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {restam <= 0 ? '⚠ Lote será encerrado' : `Restam ${restam} cab.`}
                </p>
              )}
            </div>
            <div>
              <label className={labelClass}>Peso médio (opcional)</label>
              <input type="number" min="0" step="0.1"
                value={peso} onChange={e => setPeso(e.target.value)}
                placeholder="kg" className={inputClass} disabled={!loteId} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Data</label>
            <input type="date" value={dataSaida} onChange={e => setDataSaida(e.target.value)}
              max={new Date().toISOString().split('T')[0]} className={inputClass} disabled={!loteId} />
          </div>

          <div>
            <label className={labelClass}>Observação (opcional)</label>
            <input type="text" value={obs} onChange={e => setObs(e.target.value)}
              placeholder="Ex: Saída programada — março/26"
              className={inputClass} disabled={!loteId} />
          </div>

          <button
            onClick={confirmarSaida}
            disabled={saving || !loteId || !qtd || qtdNum <= 0}
            className={`flex items-center gap-2 w-full justify-center px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${activeColor}`}>
            <Scissors className="w-4 h-4" />
            {saving ? 'Registrando...' : `Confirmar ${TIPO_LABELS[tipoSaida] ?? 'Saída'}`}
          </button>
        </div>
      </div>}

      {/* Histórico */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-gray-400" />
          <h3 className="font-semibold text-gray-700 text-sm">Histórico de saídas</h3>
        </div>
        <HistoricoTable events={events} loading={loadingH} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════════════════════════════ */


/* ── tabs ── */

type Tab = 'lotes' | 'transferir' | 'evolucao' | 'abate';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'lotes',     label: 'Lotes por Pasto',    icon: MapPin },
  { id: 'transferir',label: 'Transferir',          icon: ArrowRight },
  { id: 'evolucao',  label: 'Evolução',            icon: TrendingUp },
  { id: 'abate',     label: 'Saída',               icon: Scissors },
];

export function Manejos() {
  const { activeFarmId, pastures, entries } = useData();
  const { user, isAdmin, hasEditPermission } = useAuth();
  const canEdit = isAdmin || hasEditPermission('manejos');
  const [tab, setTab]             = useState<Tab>('lotes');
  const [animals, setAnimals]     = useState<Animal[]>([]);
  const [categories, setCategories] = useState<AnimalCategory[]>([]);
  const [suppTypes, setSuppTypes] = useState<Array<{ id: string; nome: string; consumo: string | null }>>([]);
  const [ganhoAcumMap, setGanhoAcumMap] = useState<Record<string, { ganho: number; data: string; confirmado: boolean }>>({});
  const [loading, setLoading]     = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [farmName, setFarmName]   = useState('');

  useEffect(() => {
    if (!activeFarmId) return;
    farmService.findById(activeFarmId).then(f => setFarmName(f?.nomeFazenda || ''));
  }, [activeFarmId]);

  useEffect(() => {
    if (!activeFarmId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      manejoService.listarAnimais(activeFarmId),
      manejoService.listarCategorias(activeFarmId),
      manejoService.listarSupplementTypes(activeFarmId),
    ]).then(([a, c, s]) => {
      setAnimals(a);
      setCategories(c);
      setSuppTypes(s);
    }).catch(() => {
      toast.error('Erro ao carregar dados de manejos.');
    }).finally(() => setLoading(false));
  }, [activeFarmId, refreshTick]);

  // Upsert histórico diário e carrega ganho acumulado (roda após animals + entries estarem prontos)
  useEffect(() => {
    if (!activeFarmId || animals.length === 0) return;
    const pMap = Object.fromEntries(pastures.map(p => [p.id, p.nome]));
    const latestByPasto: Record<string, string> = {};
    for (const e of entries) {
      if (!e.pasto || !e.data || !e.tipo) continue;
      if (!latestByPasto[e.pasto] || e.data > latestByPasto[e.pasto]) latestByPasto[e.pasto] = e.data;
    }
    const pastoSuppMap: Record<string, string> = {};
    for (const e of entries) {
      if (!e.pasto || !e.data || !e.tipo) continue;
      if (e.data === latestByPasto[e.pasto]) pastoSuppMap[e.pasto] = e.tipo;
    }
    const suppGmdByNome: Record<string, number> = {};
    for (const s of suppTypes) {
      if (s.gmd_esperado) suppGmdByNome[s.nome] = s.gmd_esperado;
    }
    const pastoGmdMapUpsert: Record<string, number> = {};
    for (const [pastoNome, suppNome] of Object.entries(pastoSuppMap)) {
      const gmd = suppGmdByNome[suppNome];
      if (gmd) pastoGmdMapUpsert[pastoNome] = gmd;
    }
    manejoService.upsertHistoricoDiario(activeFarmId, animals, pMap, pastoSuppMap, pastoGmdMapUpsert)
      .then(() => manejoService.buscarGanhoAcumulado(activeFarmId))
      .then(gMap => setGanhoAcumMap(gMap))
      .catch(() => {});
  }, [activeFarmId, animals, pastures, entries]);

  function reload() { setRefreshTick(t => t + 1); }

  const ativos = animals.filter(a => a.status === 'ativo' || !a.status);

  return (
    <div className="p-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between no-print">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Suplemento Control</p>
            <h1 className="text-3xl font-bold text-gray-900">Manejos</h1>
            <p className="text-sm text-gray-500 mt-1">
              {ativos.length} lote{ativos.length !== 1 ? 's' : ''} ativo{ativos.length !== 1 ? 's' : ''}
              {' '}· {ativos.reduce((s, a) => s + a.quantidade, 0).toLocaleString('pt-BR')} cabeças
            </p>
          </div>
          <button onClick={reload}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-white hover:text-teal-600 transition-colors">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm no-print">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Conteúdo */}
        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : !activeFarmId ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-20 text-center">
            <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Selecione uma fazenda para ver os manejos.</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={tab}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
              {tab === 'lotes' && (
                <LotesTab animals={animals} pastures={pastures} categories={categories}
                  onReload={reload} farmName={farmName} canEdit={canEdit}
                  suppTypes={suppTypes} entries={entries} ganhoAcumMap={ganhoAcumMap} />
              )}
              {tab === 'transferir' && (
                <TransferirTab animals={animals} pastures={pastures}
                  farmId={activeFarmId} onReload={reload} categories={categories} userName={user?.name} canEdit={canEdit} />
              )}
              {tab === 'evolucao' && (
                <EvolucaoTab animals={animals} categories={categories}
                  farmId={activeFarmId} onReload={reload} canEdit={canEdit} />
              )}
              {tab === 'abate' && (
                <AbateTab animals={animals} categories={categories} farmId={activeFarmId} onReload={reload} canEdit={canEdit} />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>
    </div>
  );
}
