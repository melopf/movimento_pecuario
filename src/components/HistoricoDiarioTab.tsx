import { useState, useEffect, useMemo } from 'react';
import { History, Filter, TrendingUp, RefreshCw, BarChart2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, Legend, CartesianGrid, ReferenceLine,
} from 'recharts';
import { manejoService, type Animal, type AnimalCategory, type LoteDiario } from '../services/manejoService';
import { useAuth } from '../context/AuthContext';
import { SkeletonTable } from './Skeleton';

const PERIOD_OPTIONS: { label: string; value: '7' | '30' | '90' | '180' | 'all' }[] = [
  { label: '7 dias',   value: '7'   },
  { label: '30 dias',  value: '30'  },
  { label: '90 dias',  value: '90'  },
  { label: '180 dias', value: '180' },
  { label: 'Sem Data', value: 'all' },
];


interface Props {
  farmId: string;
  animals: Animal[];
}

function fmt(n: number | null | undefined, dec = 3): string {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function HistoricoDiarioTab({ farmId, animals }: Props) {
  const { isAdmin } = useAuth();
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>('all');
  const [period, setPeriod] = useState<'7' | '30' | '90' | '180' | 'all'>('30');
  const [records, setRecords] = useState<LoteDiario[]>([]);
  const [lancamentoDates, setLancamentoDates] = useState<Set<string>>(new Set());
  const [categorias, setCategorias] = useState<AnimalCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  function buildDateRange() {
    if (period === 'all') return {};
    const hoje = new Date();
    return {
      dataFim:    hoje.toISOString().split('T')[0],
      dataInicio: new Date(hoje.getTime() - parseInt(period) * 86_400_000).toISOString().split('T')[0],
    };
  }

  async function handleReprocessar() {
    if (!farmId) { toast.error('Fazenda não identificada'); return; }
    setReprocessing(true);
    try {
      const total = await manejoService.reprocessarRetroativo(farmId);
      toast.success('Retroativo concluído', { description: `${total} registros atualizados` });
      setLoading(true);
      manejoService.buscarHistoricoDiario(farmId, {
        animalId: selectedAnimalId !== 'all' ? selectedAnimalId : undefined,
        ...buildDateRange(),
      }).then(r => setRecords(r)).catch(() => {}).finally(() => setLoading(false));
    } catch {
      toast.error('Erro ao reprocessar retroativo');
    } finally {
      setReprocessing(false);
    }
  }

  useEffect(() => {
    if (farmId) {
      manejoService.listarCategorias(farmId).then(setCategorias).catch(() => {});
    }
  }, [farmId]);

  useEffect(() => {
    if (!farmId || selectedAnimalId === 'all') {
      setRecords([]);
      setLancamentoDates(new Set());
      return;
    }
    setLoading(true);
    const range = buildDateRange();
    Promise.all([
      manejoService.buscarHistoricoDiario(farmId, { animalId: selectedAnimalId, ...range }),
      manejoService.buscarDatasLancamentos(farmId, range),
    ])
      .then(([r, dates]) => { setRecords(r); setLancamentoDates(dates); })
      .catch(() => { setRecords([]); setLancamentoDates(new Set()); })
      .finally(() => setLoading(false));
  }, [farmId, selectedAnimalId, period]);

  const animalMap = useMemo(
    () => Object.fromEntries(animals.map(a => [a.id, a])),
    [animals],
  );

  const ativos = useMemo(
    () => animals.filter(a => a.status === 'ativo' || !a.status),
    [animals],
  );

  const categoriaMap = useMemo(
    () => Object.fromEntries(categorias.map(c => [c.id, c.nome.toUpperCase().trim()])),
    [categorias],
  );

  // Vaca Descarte: mostra histórico normal. Qualquer outra "VACA *": peso estabilizado.
  const naoGanhaPeso = useMemo(() => {
    if (selectedAnimalId === 'all') return false;
    const a = animalMap[selectedAnimalId];
    if (!a?.categoria_id) return false;
    const cat = categoriaMap[a.categoria_id] ?? '';
    return cat.includes('VACA') && !cat.includes('DESCARTE');
  }, [selectedAnimalId, animalMap, categoriaMap]);

  /* ── Peso simulado acumulado: peso_inicial + Σ gmd por dia ── */
  const pesoSimuladoMap = useMemo(() => {
    const map: Record<string, number> = {};
    const sorted = [...records].sort((a, b) => a.data.localeCompare(b.data));

    const byAnimal: Record<string, typeof sorted> = {};
    for (const r of sorted) {
      if (!byAnimal[r.animal_id]) byAnimal[r.animal_id] = [];
      byAnimal[r.animal_id].push(r);
    }

    for (const [, rows] of Object.entries(byAnimal)) {
      let acum = rows[0]?.peso_estimado ?? 0;
      for (const r of rows) {
        acum += r.gmd ?? 0;
        map[`${r.data}_${r.animal_id}`] = acum;
      }
    }

    return map;
  }, [records]);

  const sortedAsc = useMemo(
    () => [...records].sort((a, b) => a.data.localeCompare(b.data)),
    [records],
  );

  /* ── Gráfico 1: Peso Est. (flat = peso_medio) × Simulado (acumulado via GMD) ── */
  const chartData = useMemo(() => {
    return sortedAsc.map(r => ({
      data:        r.data.split('-').reverse().join('/'),
      'Peso Est.': animalMap[r.animal_id]?.peso_medio ?? undefined,
      'Simulado':  pesoSimuladoMap[`${r.data}_${r.animal_id}`] ?? undefined,
    }));
  }, [sortedAsc, animalMap, pesoSimuladoMap]);

  /* ── Gráfico 2: Simulado (kg) × Desvio consumo - meta (kg/cab) ── */
  const consumoSimuladoChartData = useMemo(() => {
    return sortedAsc.map(r => {
      const desvio = r.consumo_kg_cab != null && r.meta_kg_cab != null
        ? +((r.consumo_kg_cab - r.meta_kg_cab).toFixed(4))
        : undefined;
      return {
        data:      r.data.split('-').reverse().join('/'),
        'Simulado': naoGanhaPeso ? undefined : (pesoSimuladoMap[`${r.data}_${r.animal_id}`] ?? undefined),
        'Desvio':   desvio,
      };
    });
  }, [sortedAsc, pesoSimuladoMap, naoGanhaPeso]);

  return (
    <div className="space-y-5">

      {/* ── Filtros ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-gray-400">
            <Filter className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Filtros</span>
          </div>

          <select
            value={selectedAnimalId}
            onChange={e => setSelectedAnimalId(e.target.value)}
            className="h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white
                       focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
          >
            <option value="all">Todos os lotes</option>
            {ativos.map(a => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>

          <div className="flex gap-1">
            {PERIOD_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => setPeriod(o.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  period === o.value
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'border border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-600'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {records.length > 0 && (
            <span className="ml-auto text-xs text-gray-400">
              {records.length} registros
            </span>
          )}

          {isAdmin && (
            <button
              onClick={handleReprocessar}
              disabled={reprocessing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reprocessing ? 'animate-spin' : ''}`} />
              {reprocessing ? 'Reprocessando...' : 'Reprocessar'}
            </button>
          )}
        </div>
      </div>

      {/* ── Conteúdo ── */}
      {loading ? (
        <SkeletonTable rows={6} cols={7} />
      ) : selectedAnimalId === 'all' ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm py-20 text-center">
          <History className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-600">Selecione um lote para ver o histórico</p>
          <p className="text-xs text-gray-400 mt-1">
            Escolha um lote no filtro acima para carregar os registros diários.
          </p>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm py-20 text-center">
          <History className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum registro para o período selecionado.</p>
          <p className="text-xs text-gray-400 mt-1">
            O histórico é gerado diariamente às 23h ou quando há lançamentos de suplemento.
          </p>
        </div>
      ) : (
        <>
          {/* ── Banner: vaca prenha / parida não ganha peso ── */}
          {naoGanhaPeso && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-500" />
              <span>
                <strong>Atenção:</strong> Esse animal está com peso estabilizado, Vaca Adulta. O consumo de suplemento é registrado normalmente, mas o ganho de peso simulado não se aplica.
              </span>
            </div>
          )}

          {/* ── Dois gráficos lado a lado ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

            {/* Gráfico 1 — evolução de peso */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-5">
                <TrendingUp className="w-4 h-4 text-teal-600" />
                <span className="text-sm font-semibold text-gray-800">Evolução do Peso Estimado</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="data"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `${v} kg`}
                    width={72}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    formatter={(v: number) => [
                      `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg`,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="Peso Est."
                    stroke="#1a6040"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                  />
                  {!naoGanhaPeso && (
                    <Line
                      type="monotone"
                      dataKey="Simulado"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Gráfico 2 — Simulado (kg) × Consumo Real (g/cab) */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-1">
                <BarChart2 className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-gray-800">Ganho de Peso Simulado × Desvio de Consumo</span>
              </div>
              <p className="text-[11px] text-gray-400 mb-4 ml-6">Peso simulado (kg) · Desvio = Consumo − Meta (kg/cab/dia)</p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={consumoSimuladoChartData} margin={{ top: 4, right: 64, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="data"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="kg"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `${v} kg`}
                    width={72}
                  />
                  <YAxis
                    yAxisId="desvio"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    formatter={(v: number, name: string) =>
                      name === 'Simulado'
                        ? [`${v.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg`, name]
                        : [`${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} kg/cab`, name]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine yAxisId="desvio" y={0} stroke="#d1d5db" strokeDasharray="4 3" />
                  <Line
                    yAxisId="kg"
                    type="monotone"
                    dataKey="Simulado"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    yAxisId="desvio"
                    type="monotone"
                    dataKey="Desvio"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

          </div>

          {/* ── Tabela ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Data', 'Lote', 'Pasto', 'Suplemento', 'Meta kg/cab', '% PV', 'GMD', 'Peso Est.', 'Simulado'].map(h => (
                      <th key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.map((r, i) => {
                    const animal = animalMap[r.animal_id];
                    return (
                      <tr key={i} className="hover:bg-gray-50/70 transition-colors">

                        <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            {r.data.split('-').reverse().join('/')}
                            {lancamentoDates.has(r.data) && (
                              <span
                                title="Dia de lançamento real"
                                className="inline-block w-2 h-2 rounded-full bg-green-500 flex-shrink-0"
                              />
                            )}
                          </span>
                        </td>

                        <td className="px-4 py-2.5">
                          <span className="text-sm font-semibold text-gray-900">
                            {animal?.nome ?? '—'}
                          </span>
                          {animal?.quantidade != null && (
                            <span className="ml-1.5 text-[10px] text-gray-400">
                              {animal.quantidade} cab
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[120px] truncate">
                          {r.pasto_nome ?? '—'}
                        </td>

                        <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[140px] truncate">
                          {r.suplemento ?? '—'}
                        </td>

                        <td className="px-4 py-2.5 text-xs font-mono text-teal-700 whitespace-nowrap">
                          {fmt(r.meta_kg_cab)}
                        </td>

                        <td className="px-4 py-2.5 text-xs font-mono text-blue-700 whitespace-nowrap">
                          {(() => {
                            const pesoRef = pesoSimuladoMap[`${r.data}_${r.animal_id}`] ?? r.peso_estimado ?? 0;
                            if (!pesoRef || r.consumo_kg_cab == null) return '—';
                            const pv = (r.consumo_kg_cab / pesoRef) * 100;
                            return `${pv.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%`;
                          })()}
                        </td>

                        <td className="px-4 py-2.5 text-xs font-mono text-gray-500 whitespace-nowrap">
                          {r.gmd != null ? `${r.gmd.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} kg/d` : '—'}
                        </td>

                        <td className="px-4 py-2.5 text-xs font-semibold text-gray-900 whitespace-nowrap">
                          {r.peso_estimado != null
                            ? `${r.peso_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg`
                            : '—'}
                          {r.peso_real != null && (
                            <span className="ml-1 text-[10px] text-green-600 font-normal">
                              ✓ {r.peso_real.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-2.5 text-xs font-mono text-teal-700 whitespace-nowrap">
                          {naoGanhaPeso ? '—' : (() => {
                            const v = pesoSimuladoMap[`${r.data}_${r.animal_id}`];
                            return v != null
                              ? `${v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
                              : '—';
                          })()}
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
