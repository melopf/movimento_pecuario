import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { FlaskConical, Play, ChevronDown, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { supabaseAdmin } from '../lib/supabase';

/* ── Types ── */
interface SupplementSimulated {
  id: string; nome: string; unidade: string;
  peso?: number; valor_kg?: number; meta_pct?: string;
  ganho_peso_esperado?: number; categoria_alvo?: string; custo_cab_dia?: number;
}
interface Pasture { id: string; nome: string; }
interface Animal  { id: string; nome: string; quantidade: number; peso_medio?: number; }

interface SimParams {
  pastureId: string;
  suplementoId: string;
  dias: number;
  qtdAnimais: number;
  pesoMedio: number;
}

interface SimResult {
  consumo_dia_por_animal: number;
  consumo_total_kg: number;
  custo_total: number;
  custo_cab_dia: number;
  ganho_total_kg: number;
  ganho_por_animal: number;
}

const inputClass = 'w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors';
const labelClass = 'block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide';

function parseMeta(metaPct?: string): number {
  if (!metaPct) return 0;
  const clean = metaPct.replace('%', '').replace(',', '.').trim();
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}


export function Simulador() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { activeFarmId } = useData();

  const [pastures, setPastures]       = useState<Pasture[]>([]);
  const [animals, setAnimals]         = useState<Animal[]>([]);
  const [suplementos, setSuplementos] = useState<SupplementSimulated[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [params, setParams] = useState<SimParams>({
    pastureId: '', suplementoId: '', dias: 30, qtdAnimais: 0, pesoMedio: 0,
  });
  const [result, setResult]       = useState<SimResult | null>(null);
  const [calculated, setCalculated] = useState(false);

  useEffect(() => {
    if (!isAdmin) navigate('/', { replace: true });
  }, [isAdmin, navigate]);

  useEffect(() => {
    if (!activeFarmId) return;
    setLoadingData(true);
    Promise.all([
      supabaseAdmin.from('pastures').select('id, nome').eq('farm_id', activeFarmId).order('nome'),
      supabaseAdmin.from('supplement_simulated').select('*').eq('farm_id', activeFarmId).order('nome'),
    ]).then(([p, s]) => {
      setPastures(p.data ?? []);
      setSuplementos(s.data ?? []);
      setLoadingData(false);
    });
  }, [activeFarmId]);

  useEffect(() => {
    if (!params.pastureId || !activeFarmId) { setAnimals([]); return; }
    supabaseAdmin
      .from('animals')
      .select('id, nome, quantidade, peso_medio')
      .eq('farm_id', activeFarmId)
      .eq('pasto_id', params.pastureId)
      .eq('status', 'ativo')
      .then(({ data }) => {
        const list = data ?? [];
        setAnimals(list);
        const totalQtd = list.reduce((s, a) => s + (a.quantidade ?? 0), 0);
        const pesoMedPond = list.reduce((s, a) => s + (a.peso_medio ?? 0) * (a.quantidade ?? 0), 0);
        const pesoMed = totalQtd > 0 ? pesoMedPond / totalQtd : 0;
        setParams(p => ({ ...p, qtdAnimais: totalQtd, pesoMedio: Math.round(pesoMed) }));
      });
  }, [params.pastureId, activeFarmId]);

  const selectedSupl = suplementos.find(s => s.id === params.suplementoId);

  function calcular() {
    if (!selectedSupl || params.qtdAnimais === 0 || params.pesoMedio === 0) return;
    const metaFrac = parseMeta(selectedSupl.meta_pct) / 100;
    const consumo_dia_por_animal = params.pesoMedio * metaFrac;
    const consumo_total_kg = consumo_dia_por_animal * params.qtdAnimais * params.dias;
    const valorKg = selectedSupl.valor_kg ?? 0;
    const custo_total = consumo_total_kg * valorKg;
    const custo_cab_dia = consumo_dia_por_animal * valorKg;
    const ganho_por_animal = ((selectedSupl.ganho_peso_esperado ?? 0) / 30) * params.dias;
    const ganho_total_kg = ganho_por_animal * params.qtdAnimais;
    setResult({ consumo_dia_por_animal, consumo_total_kg, custo_total, custo_cab_dia, ganho_total_kg, ganho_por_animal });
    setCalculated(true);
  }

  function resetar() {
    setResult(null);
    setCalculated(false);
    setParams(p => ({ ...p, suplementoId: '', dias: 30 }));
  }

  const canCalc = !!params.suplementoId && params.qtdAnimais > 0 && params.pesoMedio > 0;

  if (!isAdmin) return null;

  return (
    <div className="p-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Suplemento Control</p>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">Simulador</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">Simule custos e ganhos de suplementação antes de aplicar no campo.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Painel de entrada ── */}
          <div className="space-y-5">

            {/* Step 1 — Pasto */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white bg-teal-600">1</span>
                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Selecionar Pasto / Lote</h2>
              </div>
              {loadingData ? (
                <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ) : (
                <div className="relative">
                  <select
                    value={params.pastureId}
                    onChange={e => setParams(p => ({ ...p, pastureId: e.target.value }))}
                    className={inputClass + ' pr-8 appearance-none'}
                  >
                    <option value="">— Selecione um pasto —</option>
                    {pastures.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              )}
              {animals.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg p-3 text-center bg-teal-50">
                    <p className="text-xl font-bold text-teal-700">{params.qtdAnimais}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Cabeças</p>
                  </div>
                  <div className="rounded-lg p-3 text-center bg-teal-50">
                    <p className="text-xl font-bold text-teal-700">{params.pesoMedio} kg</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Peso Médio</p>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Step 2 — Suplemento Simulado */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white bg-teal-600">2</span>
                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Suplemento Simulado</h2>
              </div>
              {suplementos.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">Nenhum suplemento simulado cadastrado. Vá em Cadastros → Simulador.</p>
              ) : (
                <>
                  <div className="relative">
                    <select
                      value={params.suplementoId}
                      onChange={e => setParams(p => ({ ...p, suplementoId: e.target.value }))}
                      className={inputClass + ' pr-8 appearance-none'}
                    >
                      <option value="">— Selecione um suplemento —</option>
                      {suplementos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  {selectedSupl && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 grid grid-cols-3 gap-2 text-center">
                      {[
                        { label: 'Meta % PV', value: selectedSupl.meta_pct || '—' },
                        { label: 'R$/KG', value: selectedSupl.valor_kg ? `R$ ${selectedSupl.valor_kg.toFixed(2)}` : '—' },
                        { label: 'Ganho/mês', value: selectedSupl.ganho_peso_esperado ? `${selectedSupl.ganho_peso_esperado} kg` : '—' },
                      ].map(m => (
                        <div key={m.label} className="rounded-lg p-2.5 bg-teal-50">
                          <p className="text-sm font-bold text-teal-700">{m.value}</p>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide">{m.label}</p>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </>
              )}
            </div>

            {/* Step 3 — Parâmetros */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white bg-teal-600">3</span>
                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Parâmetros</h2>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Período (dias)</label>
                  <input type="number" min="1" max="365" value={params.dias}
                    onChange={e => setParams(p => ({ ...p, dias: parseInt(e.target.value) || 30 }))}
                    className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Qtd. Animais</label>
                  <input type="number" min="1" value={params.qtdAnimais}
                    onChange={e => setParams(p => ({ ...p, qtdAnimais: parseInt(e.target.value) || 0 }))}
                    className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Peso Médio (kg)</label>
                  <input type="number" min="1" value={params.pesoMedio}
                    onChange={e => setParams(p => ({ ...p, pesoMedio: parseInt(e.target.value) || 0 }))}
                    className={inputClass} />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={calcular}
                  disabled={!canCalc}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4" /> Simular
                </button>
                {calculated && (
                  <button onClick={resetar} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" /> Resetar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Resultados ── */}
          <div>
            {!calculated ? (
              <div className="h-full min-h-64 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center p-8">
                <FlaskConical className="w-12 h-12 mb-4 text-gray-300" />
                <p className="text-gray-400 font-medium">Preencha os dados e clique em</p>
                <p className="text-gray-400 font-medium"><strong className="text-teal-600">Simular</strong> para ver os resultados</p>
              </div>
            ) : result && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4">Resultado da Simulação</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Consumo / Cab / Dia', value: `${result.consumo_dia_por_animal.toFixed(3)} kg` },
                      { label: 'Consumo Total', value: `${result.consumo_total_kg.toFixed(1)} kg` },
                      { label: 'Custo / Cab / Dia', value: `R$ ${result.custo_cab_dia.toFixed(2)}` },
                      { label: `Custo Total (${params.dias}d)`, value: `R$ ${result.custo_total.toFixed(2)}` },
                    ].map(m => (
                      <div key={m.label} className="rounded-xl p-4 bg-teal-50">
                        <p className="text-lg font-bold text-teal-700">{m.value}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">{m.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {(selectedSupl?.ganho_peso_esperado ?? 0) > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4">Ganho de Peso Projetado</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl p-4 bg-teal-50">
                        <p className="text-lg font-bold text-teal-700">{result.ganho_por_animal.toFixed(1)} kg</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">Por Animal ({params.dias}d)</p>
                      </div>
                      <div className="rounded-xl p-4 bg-teal-50">
                        <p className="text-lg font-bold text-teal-700">{result.ganho_total_kg.toFixed(1)} kg</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">Total do Lote ({params.dias}d)</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3">Resumo</h3>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {[
                        ['Suplemento', selectedSupl?.nome ?? '—'],
                        ['Pasto', pastures.find(p => p.id === params.pastureId)?.nome ?? '—'],
                        ['Animais', `${params.qtdAnimais} cab.`],
                        ['Peso Médio', `${params.pesoMedio} kg`],
                        ['Período', `${params.dias} dias`],
                        ['Meta % PV', selectedSupl?.meta_pct ?? '—'],
                      ].map(([k, v]) => (
                        <tr key={k}>
                          <td className="py-2 text-gray-500 text-xs">{k}</td>
                          <td className="py-2 text-gray-900 font-medium text-xs text-right">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
