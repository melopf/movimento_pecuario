import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Plus, Trash2, Play, RotateCcw, ChevronDown } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { supabaseAdmin } from '../lib/supabase';

/* ── Estilos ── */
const inputCls = 'w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors';
const labelCls = 'block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wide';
const readCls  = 'w-full h-9 px-3 rounded-lg border border-gray-200 bg-teal-50 text-sm font-semibold text-teal-700 flex items-center justify-end';

/* ── Types ── */
interface SupplSim {
  id: string; nome: string; valor_kg?: number; meta_pct?: string;
  ganho_peso_esperado?: number; categoria?: string;
}
interface Pasture { id: string; nome: string; qualidade_forragem?: string; }
interface SimuladorParam {
  epoca: string; categoria: string; g_100kg_pv: number;
  gmd_regular: number; gmd_bom: number; gmd_otimo: number;
}
interface Fase {
  id: number;
  dataInicio: string;
  dataFim: string;
  suplementoId: string;
  valorKg: number;
  consumo: number;
  gmd: number;
}

type Qualidade = 'regular' | 'bom' | 'otimo';
type Epoca = 'seca' | 'transicao' | 'aguas';

const EPOCA_INFO: Record<Epoca, { label: string; color: string; bg: string }> = {
  seca:      { label: 'Seca',      color: '#b45309', bg: '#fef3c7' },
  transicao: { label: 'Transição', color: '#1d4ed8', bg: '#dbeafe' },
  aguas:     { label: 'Águas',     color: '#1a6040', bg: '#dcfce7' },
};

const PIE_COLORS = ['#1a6040', '#4aab7c', '#a8d8c0', '#d4ece3'];

/* ── Helpers ── */
function emptyFase(id: number): Fase {
  return { id, dataInicio: '', dataFim: '', suplementoId: '', valorKg: 0, consumo: 0, gmd: 0 };
}

function calcDias(a: string, b: string): number {
  if (!a || !b) return 0;
  const d = Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
  return d > 0 ? d : 0;
}

function parseMeta(s?: string): number {
  if (!s) return 0;
  return parseFloat(s.replace('%', '').replace(',', '.').trim()) || 0;
}

function brl(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getEpocaForMonth(month: number): Epoca {
  if (month >= 7 && month <= 10) return 'seca';
  if (month >= 11 || month <= 2) return 'aguas';
  return 'transicao';
}

function getDiasPorEpoca(inicio: string, fim: string): Record<Epoca, number> {
  const result: Record<Epoca, number> = { seca: 0, transicao: 0, aguas: 0 };
  const start = new Date(inicio + 'T00:00:00');
  const end   = new Date(fim   + 'T00:00:00');
  const total = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (total <= 0) return result;
  for (let i = 0; i < total; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    result[getEpocaForMonth(d.getMonth() + 1)]++;
  }
  return result;
}

function getEpocaPrimaria(inicio: string, fim: string): Epoca | null {
  if (!inicio || !fim) return null;
  const dias = getDiasPorEpoca(inicio, fim);
  const entries = Object.entries(dias) as [Epoca, number][];
  const max = entries.reduce((best, cur) => cur[1] > best[1] ? cur : best, entries[0]);
  return max[1] > 0 ? max[0] : null;
}

function calcGMDPonderado(
  inicio: string, fim: string,
  categoria: string,
  qualidade: Qualidade,
  params: SimuladorParam[]
): number {
  if (!inicio || !fim) return 0;
  const diasPorEpoca = getDiasPorEpoca(inicio, fim);
  const totalDias = Object.values(diasPorEpoca).reduce((s, v) => s + v, 0);
  if (totalDias === 0) return 0;
  const qKey = `gmd_${qualidade}` as keyof SimuladorParam;
  let total = 0;
  for (const [epoca, dias] of Object.entries(diasPorEpoca) as [Epoca, number][]) {
    if (dias === 0) continue;
    const p = params.find(x => x.epoca === epoca && x.categoria === categoria);
    if (p) total += (p[qKey] as number) * dias;
  }
  return parseFloat((total / totalDias).toFixed(3));
}

function calcConsumoFromParams(categoria: string, pesoAnimal: number, params: SimuladorParam[]): number {
  const p = params.find(x => x.categoria === categoria);
  if (!p || pesoAnimal <= 0) return 0;
  // g/100kg PV → kg/cab/dia: pesoAnimal × g / 100 / 1000
  return parseFloat((pesoAnimal * p.g_100kg_pv / 100000).toFixed(3));
}

/* ── Sub-componentes ── */
function NumInput({ value, onChange, step = '0.01', placeholder = '', cls = '' }: {
  value: number; onChange: (v: number) => void; step?: string; placeholder?: string; cls?: string;
}) {
  return (
    <input type="number" step={step} min="0" placeholder={placeholder}
      value={value === 0 ? '' : value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={inputCls + ' ' + cls}
    />
  );
}

function ReadVal({ value }: { value: string }) {
  return <div className={readCls}>{value}</div>;
}

function SectionTitle({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white bg-teal-600 flex-shrink-0">{n}</span>
      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{label}</h2>
    </div>
  );
}

function EpocaBadge({ epoca }: { epoca: Epoca | null }) {
  if (!epoca) return null;
  const info = EPOCA_INFO[epoca];
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap"
      style={{ background: info.bg, color: info.color }}>
      {info.label}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════
   Página Principal
══════════════════════════════════════════════════════════ */
export function Simulador() {
  const navigate        = useNavigate();
  const { isAdmin }     = useAuth();
  const { activeFarmId } = useData();

  const [pastures,    setPastures]    = useState<Pasture[]>([]);
  const [suppls,      setSuppls]      = useState<SupplSim[]>([]);
  const [params,      setParams]      = useState<SimuladorParam[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  /* Lote */
  const [pastureId,          setPastureId]          = useState('');
  const [pesoInicial,        setPesoInicial]        = useState<number>(0);
  const [qtdAnimais,         setQtdAnimais]         = useState<number>(0);
  const [qualidadePastagem,  setQualidadePastagem]  = useState<Qualidade>('bom');

  /* Parâmetros econômicos */
  const [rc,                setRc]                = useState<number>(50);
  const [precoVenda,        setPrecoVenda]        = useState<number>(0);
  const [precoCompra,       setPrecoCompra]       = useState<number>(0);
  const [despesaOper,       setDespesaOper]       = useState<number>(0);
  const [custoOportunidade, setCustoOportunidade] = useState<number>(0);

  /* Fases */
  const [fases,      setFases]      = useState<Fase[]>([emptyFase(1)]);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (!isAdmin) navigate('/', { replace: true });
  }, [isAdmin, navigate]);

  useEffect(() => {
    if (!activeFarmId) return;
    setLoadingData(true);
    Promise.all([
      supabaseAdmin.from('pastures').select('id, nome, qualidade_forragem').eq('farm_id', activeFarmId).order('nome'),
      supabaseAdmin.from('supplement_simulated').select('id, nome, valor_kg, meta_pct, ganho_peso_esperado, categoria').eq('farm_id', activeFarmId).order('nome'),
      supabaseAdmin.from('simulador_parametros').select('*'),
    ]).then(([p, s, pr]) => {
      setPastures(p.data ?? []);
      setSuppls(s.data ?? []);
      setParams(pr.data ?? []);
      setLoadingData(false);
    });
  }, [activeFarmId]);

  /* Auto-fill pasto selecionado: animais + qualidade da forragem */
  useEffect(() => {
    if (!pastureId || !activeFarmId) return;

    // Auto-fill qualidade da pastagem a partir do cadastro do pasto
    const pasture = pastures.find(p => p.id === pastureId);
    if (pasture?.qualidade_forragem) {
      const map: Record<string, Qualidade> = { REGULAR: 'regular', BOA: 'bom', ÓTIMA: 'otimo' };
      const q = map[pasture.qualidade_forragem.trim().toUpperCase()] ?? 'bom';
      handleQualidadeChange(q);
    }

    supabaseAdmin
      .from('animals')
      .select('quantidade, peso_medio')
      .eq('farm_id', activeFarmId)
      .eq('pasto_id', pastureId)
      .eq('status', 'ativo')
      .then(({ data }) => {
        const list = data ?? [];
        const qtd  = list.reduce((s, a) => s + (a.quantidade ?? 0), 0);
        const pond = list.reduce((s, a) => s + (a.peso_medio ?? 0) * (a.quantidade ?? 0), 0);
        setQtdAnimais(qtd);
        setPesoInicial(qtd > 0 ? Math.round(pond / qtd) : 0);
      });
  }, [pastureId, activeFarmId, pastures]);

  /* Auto-fill ao selecionar suplemento em uma fase */
  function handleSelectSupl(faseId: number, suplId: string) {
    const s    = suppls.find(x => x.id === suplId);
    const fase = fases.find(f => f.id === faseId);
    if (!s) { updateFase(faseId, { suplementoId: suplId, valorKg: 0, consumo: 0, gmd: 0 }); return; }

    const consumo = s.categoria && params.length > 0
      ? calcConsumoFromParams(s.categoria, pesoInicial, params)
      : (pesoInicial > 0 && s.meta_pct
          ? parseFloat((pesoInicial * parseMeta(s.meta_pct) / 100).toFixed(3))
          : 0);

    const gmd = s.categoria && params.length > 0 && fase?.dataInicio && fase?.dataFim
      ? calcGMDPonderado(fase.dataInicio, fase.dataFim, s.categoria, qualidadePastagem, params)
      : (s.ganho_peso_esperado ? parseFloat((s.ganho_peso_esperado / 30).toFixed(3)) : 0);

    updateFase(faseId, { suplementoId: suplId, valorKg: s.valor_kg ?? 0, consumo, gmd });
  }

  /* Quando muda qualidade da pastagem → recalcula GMD de todas as fases */
  function handleQualidadeChange(q: Qualidade) {
    setQualidadePastagem(q);
    if (params.length === 0) return;
    setFases(prev => prev.map(f => {
      const s = suppls.find(x => x.id === f.suplementoId);
      if (!s?.categoria || !f.dataInicio || !f.dataFim) return f;
      return { ...f, gmd: calcGMDPonderado(f.dataInicio, f.dataFim, s.categoria, q, params) };
    }));
  }

  /* Quando muda data de uma fase → recalcula GMD daquela fase */
  function handleDateChange(faseId: number, field: 'dataInicio' | 'dataFim', value: string) {
    setFases(prev => prev.map(f => {
      if (f.id !== faseId) return f;
      const updated = { ...f, [field]: value };
      const s = suppls.find(x => x.id === updated.suplementoId);
      if (s?.categoria && params.length > 0 && updated.dataInicio && updated.dataFim) {
        updated.gmd = calcGMDPonderado(updated.dataInicio, updated.dataFim, s.categoria, qualidadePastagem, params);
      }
      return updated;
    }));
  }

  function updateFase(id: number, changes: Partial<Fase>) {
    setFases(prev => prev.map(f => f.id === id ? { ...f, ...changes } : f));
  }

  function addFase() {
    if (fases.length >= 4) return;
    setFases(prev => [...prev, emptyFase(Math.max(...prev.map(f => f.id)) + 1)]);
  }

  function removeFase(id: number) {
    if (fases.length <= 1) return;
    setFases(prev => prev.filter(f => f.id !== id));
  }

  /* ── Cálculos ── */
  const calc = useMemo(() => {
    const fasesCalc = fases.map(f => {
      const dias          = calcDias(f.dataInicio, f.dataFim);
      const custoPer      = f.consumo * f.valorKg * dias;
      const custoMes      = dias > 0 ? custoPer / (dias / 30) : 0;
      const ganhoKg       = f.gmd * dias;
      const epocaPrimaria = getEpocaPrimaria(f.dataInicio, f.dataFim);
      // g/100kg PV de referência da tabela do Phyllypi para esta categoria
      const supl = suppls.find(s => s.id === f.suplementoId);
      const paramRef = supl?.categoria && epocaPrimaria
        ? params.find(p => p.epoca === epocaPrimaria && p.categoria === supl.categoria)
        : null;
      const g100kgPv    = paramRef?.g_100kg_pv ?? null;
      const gmdRef      = paramRef
        ? paramRef[`gmd_${qualidadePastagem}` as keyof SimuladorParam] as number
        : null;
      return { ...f, dias, custoPer, custoMes, ganhoKg, epocaPrimaria, g100kgPv, gmdRef };
    });

    const totalDias    = fasesCalc.reduce((s, f) => s + f.dias, 0);
    const totalSuplem  = fasesCalc.reduce((s, f) => s + f.custoPer, 0);
    const totalGanhoKg = fasesCalc.reduce((s, f) => s + f.ganhoKg, 0);
    const meses        = totalDias > 0 ? totalDias / 30.4 : 0;

    const pesoFinal    = pesoInicial + totalGanhoKg;
    const arrobas0     = pesoInicial / 30;
    const arrobasF     = pesoFinal * (rc / 100) / 15;
    const arrobasProd  = arrobasF - arrobas0;
    // ÁGIO: % ágio pago na compra vs preço de venda — positivo = comprou mais caro
    const agio         = precoCompra > 0 ? (-(precoVenda - precoCompra) / precoCompra) * 100 : 0;

    const precoAnimal  = arrobas0 * precoCompra;
    const despesaTotal = despesaOper * meses;
    // Financeiro: juros simples sobre o capital imobilizado (conforme planilha)
    const financeiro   = custoOportunidade > 0
      ? (precoAnimal + totalSuplem + despesaTotal) * (custoOportunidade / 100) * meses
      : 0;
    const custoTotal   = precoAnimal + totalSuplem + despesaTotal + financeiro;
    const receita      = arrobasF * precoVenda;
    const lucro        = receita - custoTotal;
    // Custo/@ produzida: inclui suplem + despesa + financeiro (não inclui compra do animal)
    const custoArroba  = arrobasProd > 0 ? (totalSuplem + despesaTotal + financeiro) / arrobasProd : 0;
    const rentabPer    = custoTotal > 0 ? (lucro / custoTotal) * 100 : 0;
    const rentabAm     = meses > 0 ? rentabPer / meses : 0;
    const breakEven    = arrobasF > 0 ? custoTotal / arrobasF : 0;
    const desembAlim   = meses > 0 ? totalSuplem / meses : 0;
    const desembTotal  = meses > 0 ? (totalSuplem + despesaTotal) / meses : 0;

    const pieData = [
      { name: 'Preço do animal',    value: parseFloat(precoAnimal.toFixed(2))  },
      { name: 'Suplementação',      value: parseFloat(totalSuplem.toFixed(2)) },
      { name: 'Despesa Oper./Pasto', value: parseFloat(despesaTotal.toFixed(2))},
      { name: 'Financeiro',         value: parseFloat(financeiro.toFixed(2))  },
    ].filter(d => d.value > 0);

    return {
      fasesCalc, totalDias, totalSuplem, totalGanhoKg, meses,
      pesoFinal, arrobas0, arrobasF, arrobasProd, agio,
      precoAnimal, despesaTotal, financeiro, custoTotal,
      receita, lucro, custoArroba, rentabPer, rentabAm,
      breakEven, desembAlim, desembTotal, pieData,
    };
  }, [fases, pesoInicial, rc, precoVenda, precoCompra, despesaOper, custoOportunidade]);

  const canCalc = pesoInicial > 0 && precoVenda > 0 && precoCompra > 0 &&
    fases.some(f => f.suplementoId && f.dataInicio && f.dataFim);


  return (
    <div className="p-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Suplemento Control</p>
          <h1 className="text-3xl font-bold text-gray-900">Simulador de Viabilidade Econômica</h1>
          <p className="text-sm text-gray-500 mt-1">Análise de recria e engorda — resultados técnicos e econômicos por animal</p>
        </div>

        {/* ── 1. Dados do Lote ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <SectionTitle n={1} label="Dados do Lote" />
          <div className="grid grid-cols-5 gap-4">
            <div>
              <label className={labelCls}>Pasto / Lote</label>
              {loadingData ? <div className="h-9 bg-gray-100 rounded-lg animate-pulse" /> : (
                <div className="relative">
                  <select value={pastureId} onChange={e => setPastureId(e.target.value)}
                    className={inputCls + ' pr-8 appearance-none'}>
                    <option value="">— Selecione —</option>
                    {pastures.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>Peso Inicial (kg)</label>
              <NumInput value={pesoInicial} onChange={setPesoInicial} step="1" placeholder="Ex.: 240" />
            </div>
            <div>
              <label className={labelCls}>Qtd. Animais</label>
              <NumInput value={qtdAnimais} onChange={setQtdAnimais} step="1" placeholder="Ex.: 50" />
            </div>
            <div>
              <label className={labelCls}>
                Qualidade da Pastagem
                {pastureId && <span className="ml-1 font-normal text-teal-500 normal-case tracking-normal">← pasto</span>}
              </label>
              <div className="relative">
                <select value={qualidadePastagem} onChange={e => handleQualidadeChange(e.target.value as Qualidade)}
                  className={inputCls + ' pr-8 appearance-none'}>
                  <option value="regular">Regular</option>
                  <option value="bom">Boa</option>
                  <option value="otimo">Ótima</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Arrobas Iniciais</label>
              <ReadVal value={pesoInicial > 0 ? (pesoInicial / 30).toFixed(2) + ' @' : '—'} />
            </div>
          </div>
        </div>

        {/* ── 2. Parâmetros Econômicos ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <SectionTitle n={2} label="Parâmetros Econômicos" />
          <div className="grid grid-cols-5 gap-4">
            <div>
              <label className={labelCls}>RC (%)</label>
              <NumInput value={rc} onChange={setRc} step="0.1" placeholder="50" />
            </div>
            <div>
              <label className={labelCls}>Venda Boi Gordo (R$/@)</label>
              <NumInput value={precoVenda} onChange={setPrecoVenda} placeholder="Ex.: 320,00" />
            </div>
            <div>
              <label className={labelCls}>Compra Bezerro/Magro (R$/@)</label>
              <NumInput value={precoCompra} onChange={setPrecoCompra} placeholder="Ex.: 318,75" />
            </div>
            <div>
              <label className={labelCls}>Despesa Oper./Pasto (R$/mês)</label>
              <NumInput value={despesaOper} onChange={setDespesaOper} placeholder="Ex.: 35,00" />
            </div>
            <div>
              <label className={labelCls}>Custo Oportunidade (% a.m.)</label>
              <NumInput value={custoOportunidade} onChange={setCustoOportunidade} placeholder="0,00" />
            </div>
          </div>
          {precoVenda > 0 && precoCompra > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="text-gray-500 font-semibold">ÁGIO:</span>
              <span className={`font-bold ${calc.agio <= 0 ? 'text-teal-600' : 'text-red-500'}`}>
                {calc.agio.toFixed(2)}%
              </span>
              <span className="text-gray-400">
                {calc.agio <= 0 ? '— comprando abaixo do preço de venda' : '— comprando acima do preço de venda'}
              </span>
            </div>
          )}
        </div>

        {/* ── 3. Fases de Suplementação ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white bg-teal-600">3</span>
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Fases de Suplementação</h2>
              <span className="text-xs text-gray-400">até 4 fases</span>
            </div>
            {params.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>Época detectada automaticamente</span>
                {(['seca', 'transicao', 'aguas'] as Epoca[]).map(e => (
                  <span key={e} className="px-1.5 py-0.5 rounded font-semibold"
                    style={{ background: EPOCA_INFO[e].bg, color: EPOCA_INFO[e].color }}>
                    {EPOCA_INFO[e].label}
                  </span>
                ))}
              </div>
            )}
            {fases.length < 4 && (
              <button onClick={addFase}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors">
                <Plus className="w-3.5 h-3.5" /> Adicionar Fase
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['#','Período Inicial','Período Final','Época','Condição','Dias','Produto','g/100kg PV','Consumo kg/dia','R$/kg','Custo/Período','Custo/cab/mês','GMD tabela','GMD aplicado','Ganho (kg)',''].map(h => (
                    <th key={h} className="px-2 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fases.map((fase, idx) => {
                  const fc = calc.fasesCalc[idx];
                  return (
                    <tr key={fase.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-2 py-2">
                        <span className="w-5 h-5 rounded-full bg-teal-600 text-white text-[10px] font-bold flex items-center justify-center">{idx + 1}</span>
                      </td>
                      <td className="px-2 py-2">
                        <input type="date" value={fase.dataInicio}
                          onChange={e => handleDateChange(fase.id, 'dataInicio', e.target.value)}
                          className={inputCls + ' w-36 text-xs'} />
                      </td>
                      <td className="px-2 py-2">
                        <input type="date" value={fase.dataFim}
                          onChange={e => handleDateChange(fase.id, 'dataFim', e.target.value)}
                          className={inputCls + ' w-36 text-xs'} />
                      </td>
                      <td className="px-2 py-2">
                        <EpocaBadge epoca={fc.epocaPrimaria} />
                      </td>
                      {/* Condição de pastagem — dimensão do PDF */}
                      <td className="px-2 py-2">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 whitespace-nowrap">
                          {qualidadePastagem === 'regular' ? 'Regular' : qualidadePastagem === 'bom' ? 'Boa' : 'Ótima'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center font-bold text-teal-700">
                        {fc.dias > 0 ? `${fc.dias}d` : '—'}
                      </td>
                      <td className="px-2 py-2">
                        {suppls.length === 0 ? (
                          <span className="text-gray-400 text-xs">Cadastre suplementos</span>
                        ) : (
                          <div className="relative">
                            <select value={fase.suplementoId}
                              onChange={e => handleSelectSupl(fase.id, e.target.value)}
                              className={inputCls + ' w-44 pr-7 appearance-none text-xs'}>
                              <option value="">— Selecione —</option>
                              {suppls.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                          </div>
                        )}
                      </td>
                      {/* g/100kg PV — Consumo Sugerido da tabela do Phyllypi */}
                      <td className="px-2 py-2 text-center">
                        {fc.g100kgPv != null
                          ? <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap" style={{ background: '#dcfce7', color: '#1a6040' }}>{fc.g100kgPv}g</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      {/* Consumo calculado: peso × g/100kg / 1000 */}
                      <td className="px-2 py-2">
                        <input type="number" step="0.001" min="0" placeholder="0,000"
                          value={fase.consumo || ''}
                          onChange={e => updateFase(fase.id, { consumo: parseFloat(e.target.value) || 0 })}
                          className={inputCls + ' w-24 text-xs'} />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.01" min="0" placeholder="0,00"
                          value={fase.valorKg || ''}
                          onChange={e => updateFase(fase.id, { valorKg: parseFloat(e.target.value) || 0 })}
                          className={inputCls + ' w-20 text-xs'} />
                      </td>
                      <td className="px-2 py-2 text-right font-semibold whitespace-nowrap" style={{ color: '#1a6040' }}>
                        {fc.custoPer > 0 ? brl(fc.custoPer) : '—'}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-600 whitespace-nowrap">
                        {fc.custoMes > 0 ? brl(fc.custoMes) : '—'}
                      </td>
                      {/* GMD de referência da tabela (read-only) */}
                      <td className="px-2 py-2 text-center">
                        {fc.gmdRef != null
                          ? <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${fc.gmdRef < 0 ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700'}`}>{fc.gmdRef.toFixed(3)}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      {/* GMD aplicado (editável — pode sobrescrever) */}
                      <td className="px-2 py-2">
                        <input type="number" step="0.001" placeholder="0,000"
                          value={fase.gmd || ''}
                          onChange={e => updateFase(fase.id, { gmd: parseFloat(e.target.value) || 0 })}
                          className={inputCls + ' w-20 text-xs'} />
                      </td>
                      <td className="px-2 py-2 text-right font-semibold whitespace-nowrap" style={{ color: '#1a6040' }}>
                        {fc.ganhoKg !== 0 ? fc.ganhoKg.toFixed(2) + ' kg' : '—'}
                      </td>
                      <td className="px-2 py-2">
                        {fases.length > 1 && (
                          <button onClick={() => removeFase(fase.id)}
                            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {calc.totalDias > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-teal-200 bg-teal-50 font-bold text-xs">
                    <td colSpan={5} className="px-2 py-2.5 text-teal-700">TOTAL</td>
                    <td className="px-2 py-2.5 text-teal-700 text-center">{calc.totalDias}d</td>
                    <td colSpan={4} />
                    <td className="px-2 py-2.5 text-right whitespace-nowrap" style={{ color: '#1a6040' }}>
                      {brl(calc.totalSuplem)} /cab
                    </td>
                    <td colSpan={3} />
                    <td className="px-2 py-2.5 text-right whitespace-nowrap" style={{ color: '#1a6040' }}>
                      {calc.totalGanhoKg.toFixed(2)} kg
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* ── Botão Calcular ── */}
        <div className="flex gap-3 items-center">
          <button onClick={() => setShowResult(true)} disabled={!canCalc}
            className="flex items-center gap-2 px-8 py-3 rounded-xl text-white text-sm font-bold transition-colors bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
            <Play className="w-4 h-4" /> Calcular Viabilidade
          </button>
          {showResult && (
            <button onClick={() => setShowResult(false)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <RotateCcw className="w-4 h-4" /> Ocultar Resultado
            </button>
          )}
        </div>

        {/* ── 4. Resultados ── */}
        {showResult && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Header verde */}
            <div className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #1a6040, #0f4a30)' }}>
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Resultados Técnicos e Econômicos</h2>
            </div>

            <div className="p-6 grid grid-cols-2 gap-10">

              {/* Coluna Esquerda */}
              <div className="space-y-5">

                {/* Arrobas */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Peso Inicial', value: `${pesoInicial} kg`, sub: `${calc.arrobas0.toFixed(2)} @` },
                    { label: 'Peso Final',   value: `${calc.pesoFinal.toFixed(1)} kg`, sub: `${calc.arrobasF.toFixed(2)} @` },
                    { label: '@ Produzidas', value: `${calc.arrobasProd.toFixed(2)} @`, sub: `${calc.totalGanhoKg.toFixed(1)} kg ganho` },
                  ].map(m => (
                    <div key={m.label} className="rounded-xl p-3 bg-teal-50 text-center">
                      <p className="text-base font-bold text-teal-700">{m.value}</p>
                      <p className="text-xs text-teal-500">{m.sub}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* Tabela financeira */}
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {[
                      ['Preço do animal (mercado)', brl(calc.precoAnimal), false],
                      ['Custo Suplementação',       brl(calc.totalSuplem), false],
                      ['Despesa Oper./Aluguel Pasto', brl(calc.despesaTotal), false],
                      ['Financeiro',               brl(calc.financeiro), false],
                      ['Custo total',              brl(calc.custoTotal), true],
                      ['Receita',                  brl(calc.receita), false],
                    ].map(([k, v, bold]) => (
                      <tr key={k as string} className={bold ? 'border-t-2 border-gray-300' : ''}>
                        <td className={`py-2 ${bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{k}</td>
                        <td className={`py-2 text-right ${bold ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Lucro + Custo/@ */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-xl p-4 ${calc.lucro >= 0 ? 'bg-teal-600' : 'bg-red-500'}`}>
                    <p className="text-[10px] text-white/80 font-bold uppercase tracking-wide">Lucro / Animal</p>
                    <p className="text-2xl font-bold text-white mt-1">{brl(calc.lucro)}</p>
                  </div>
                  <div className="rounded-xl p-4 bg-gray-50 border border-gray-200">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Custo / @ Produzida</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{brl(calc.custoArroba)}</p>
                  </div>
                </div>

                {/* Rentabilidade */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-xl p-3 text-center border ${calc.rentabPer >= 0 ? 'bg-teal-50 border-teal-100' : 'bg-red-50 border-red-100'}`}>
                    <p className={`text-xl font-bold ${calc.rentabPer >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                      {calc.rentabPer.toFixed(2)}%
                    </p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Rentabilidade (período)</p>
                  </div>
                  <div className={`rounded-xl p-3 text-center border ${calc.rentabAm >= 0 ? 'bg-teal-50 border-teal-100' : 'bg-red-50 border-red-100'}`}>
                    <p className={`text-xl font-bold ${calc.rentabAm >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                      {calc.rentabAm.toFixed(2)}%
                    </p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Rentabilidade (a.m.)</p>
                  </div>
                </div>
              </div>

              {/* Coluna Direita */}
              <div className="space-y-5">

                {/* Indicadores */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Break-even (preço mín. venda)', value: brl(calc.breakEven) + ' /@' },
                    { label: 'ÁGIO',                          value: calc.agio.toFixed(2) + '%' },
                    { label: 'Ganho em @ total',              value: calc.arrobasProd.toFixed(2) + ' @' },
                    { label: 'Período total',                 value: calc.meses.toFixed(1) + ' meses' },
                    { label: 'Desembolso alim. médio/mês',   value: brl(calc.desembAlim) },
                    { label: 'Desembolso total médio/mês',   value: brl(calc.desembTotal) },
                  ].map(m => (
                    <div key={m.label} className="rounded-xl p-3 bg-gray-50 border border-gray-100">
                      <p className="text-sm font-bold text-gray-900">{m.value}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* Gráfico Pizza */}
                {calc.pieData.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Composição do Custo Total</p>
                    <ResponsiveContainer width="100%" height={230}>
                      <PieChart>
                        <Pie data={calc.pieData} cx="50%" cy="48%" outerRadius={78} dataKey="value"
                          label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                          labelLine={false}>
                          {calc.pieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => brl(v)} />
                        <Legend iconType="circle" iconSize={8}
                          formatter={value => <span style={{ fontSize: '11px', color: '#6b7280' }}>{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

      </motion.div>
    </div>
  );
}
