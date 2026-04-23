import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  LabelList,
} from 'recharts';
import type { DataEntry } from '../lib/data';
import { fmt, fmtInt, averageConsumo, sumQuantidade } from '../lib/utils';

interface SupplementSectionProps {
  tipo: string;
  color: string;
  entries: DataEntry[];
  periodo?: string;
  farmName?: string;
  timeEntries?: DataEntry[]; // série temporal (por data) quando pasto selecionado
}

function RefLabel({ value, color, viewBox }: { value: string; color: string; viewBox?: { x: number; y: number; width: number } }) {
  if (!viewBox) return null;
  const { x, y, width } = viewBox;
  return (
    <text x={x + width + 6} y={y - 3} fill={color} fontSize={10} fontWeight="bold" dominantBaseline="auto">
      {value}
    </text>
  );
}

function calcScale(dataMax: number): { max: number; step: number } {
  if (dataMax <= 0) return { max: 1.0, step: 0.25 };
  const step = dataMax <= 0.3 ? 0.05 : dataMax <= 1.0 ? 0.25 : dataMax <= 3.0 ? 0.5 : 1.0;
  const max  = Math.ceil((dataMax * 1.2) / step) * step;
  return { max, step };
}

export function SupplementSection({ tipo, color, entries, periodo = 'MARÇO 2025', farmName = 'FAZENDA MALHADA GRANDE', timeEntries }: SupplementSectionProps) {
  const avg      = averageConsumo(entries);
  const totalQtd = sumQuantidade(entries);

  const hasMeta        = entries.some(e => e.meta != null);
  const hasLote        = entries.some(e => !!e.lote);
  const hasDesembolso  = entries.some(e => e.desembolso != null);

  const avgMeta = hasMeta
    ? entries.filter(e => e.meta != null).reduce((s, e) => s + e.meta!, 0) / entries.filter(e => e.meta != null).length
    : null;

  const avgDesembolso = hasDesembolso
    ? entries.filter(e => e.desembolso != null).reduce((s, e) => s + e.desembolso!, 0) / entries.filter(e => e.desembolso != null).length
    : null;

  const avgDesembolsoMes = hasDesembolso
    ? entries.filter(e => e.desembolso != null && e.periodo > 0).reduce((s, e) => s + e.desembolso! * e.periodo, 0) / entries.filter(e => e.desembolso != null && e.periodo > 0).length
    : null;

  const dataMax  = entries.reduce((m, e) => Math.max(m, e.consumo), 0);
  const scale    = calcScale(dataMax);
  const chartMax = scale.max;

  const chartData = timeEntries && timeEntries.length > 0
    ? timeEntries.map(e => ({
        name:  e.data ? e.data.split('-').reverse().slice(0, 2).join('/') : e.pasto,
        value: e.consumo,
      }))
    : entries.map((e) => ({ name: e.pasto, value: e.consumo }));

  const numTicks = Math.round(chartMax / scale.step);
  const yTicks: number[] = [];
  for (let i = 0; i <= numTicks; i++) {
    yTicks.push(+(scale.step * i).toFixed(6));
  }

  const chartHeight = Math.max(340, entries.length * 36 + 130);

  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl overflow-hidden print-break"
      style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>

      {/* ── Header: cor do suplemento ── */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ background: `linear-gradient(135deg, ${color}ee, ${color})` }}
      >
        <div>
          <span className="text-white text-[10px] font-semibold uppercase tracking-widest opacity-80">
            Controle de Consumo — {farmName.toUpperCase()}
          </span>
          <h2 className="text-white text-base font-extrabold mt-0.5 uppercase tracking-wide">
            {tipo.toUpperCase()}
            <span className="ml-2 text-white/70 text-xs font-medium normal-case">
              {periodo.toUpperCase()}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {avgMeta != null && (() => {
            const pct = avgMeta > 0 ? (avg / avgMeta) : 1;
            const isVerde   = pct >= 0.9 && pct <= 1.1;
            const isAmarelo = pct > 1.1;
            const bg    = isVerde ? 'rgba(34,197,94,0.25)' : isAmarelo ? 'rgba(234,179,8,0.30)' : 'rgba(239,68,68,0.25)';
            const emoji = isVerde ? '🟢' : isAmarelo ? '🟡' : '🔴';
            const label = isVerde ? 'DENTRO DA META' : isAmarelo ? 'ACIMA DA META' : 'ABAIXO DA META';
            return (
              <span
                className="text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5"
                style={{ background: bg, color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}
              >
                {emoji} {label}
              </span>
            );
          })()}
          <span className="text-white text-[10px] font-bold border border-white/30 px-2.5 py-1 rounded-lg opacity-80">
            MOVIMENTO PECUÁRIO
          </span>
        </div>
      </div>

      <div className="p-6">

        {/* ── Tabela full-width ── */}
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-[12px] border-collapse supplement-table">
            <thead>
              <tr style={{ borderBottom: '2px solid #000' }}>
                <th className="py-2 text-left font-bold">PASTO</th>
                {hasLote && <th className="py-2 text-left font-bold pl-3">LOTE</th>}
                <th className="py-2 text-right font-bold w-24">QUANTIDADE</th>
                <th className="py-2 text-left font-bold pl-4">TIPO DE SUPLEMENTO</th>
                <th className="py-2 text-right font-bold w-32">DIAS DE CONSUMO</th>
                <th className="py-2 text-right font-bold w-24">SACOS</th>
                <th className="py-2 text-right font-bold w-36">TOTAL KG OFERTADO</th>
                <th className="py-2 text-right font-bold w-32">CONSUMO (KG/CAB DIA)</th>
                {hasMeta        && <th className="py-2 text-right font-bold w-32">META (%PV)</th>}
                {hasMeta        && <th className="py-2 text-right font-bold w-28">DESVIO</th>}
                {hasDesembolso  && <th className="py-2 text-right font-bold w-32">DESEMBOLSO (R$/CAB DIA)</th>}
                {hasDesembolso  && <th className="py-2 text-right font-bold w-36">DESEMBOLSO NO PERÍODO (R$/CAB)</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((row, ri) => (
                <tr
                  key={ri}
                  className={`border-b border-gray-100 ${ri % 2 === 1 ? 'bg-gray-50/40' : ''}`}
                >
                  <td className="py-2 pr-2 font-medium text-gray-800">{row.pasto}</td>
                  {hasLote && <td className="py-2 pl-3 text-gray-500 text-xs">{row.lote ?? '—'}</td>}
                  <td className="py-2 text-right tabular-nums" style={{ color: '#1a6040' }}>{fmtInt(row.quantidade)}</td>
                  <td className="py-2 pl-4 text-gray-400">{row.tipo}</td>
                  <td className="py-2 text-right tabular-nums" style={{ color: '#1a6040' }}>{fmtInt(row.periodo)}</td>
                  <td className="py-2 text-right tabular-nums" style={{ color: '#1a6040' }}>{fmtInt(row.sacos)}</td>
                  <td className="py-2 text-right text-gray-700 tabular-nums">{fmtInt(row.kg)}</td>
                  <td className="py-2 text-right font-bold text-gray-900 tabular-nums">{fmt(row.consumo)}</td>
                  {hasMeta && (() => {
                    const desvio = row.meta != null ? row.consumo - row.meta : null;
                    const over   = desvio != null && desvio > 0.001;
                    const under  = desvio != null && desvio < -0.001;
                    // Lógica pecuária: abaixo da meta = animal sub-alimentado (🔴), acima = atenção custo (🟡)
                    const farol     = desvio == null ? null : over ? '🟡' : under ? '🔴' : '🟢';
                    const txtColor  = desvio == null ? '#6b7280' : over ? '#854d0e' : under ? '#991b1b' : '#14532d';
                    const bgColor   = desvio == null ? 'transparent' : over ? '#fef9c3' : under ? '#fee2e2' : '#dcfce7';
                    const titleStr  = over ? 'Acima da meta (custo elevado)' : under ? 'Abaixo da meta (sub-alimentação)' : 'Dentro da meta';
                    return (
                      <>
                        <td className="py-2 text-right tabular-nums font-bold text-gray-700">
                          {row.meta != null ? (
                            <span className="flex flex-col items-end leading-tight">
                              <span>{fmt(row.meta)}</span>
                              {row.metaLabel && <span className="text-[10px] font-normal text-gray-400">{row.metaLabel}</span>}
                            </span>
                          ) : '—'}
                        </td>
                        <td
                          className="py-2 text-right tabular-nums font-bold rounded-sm"
                          style={{ color: txtColor, backgroundColor: bgColor, paddingRight: '6px', paddingLeft: '6px' }}
                          title={titleStr}
                        >
                          {desvio != null ? (
                            <span className="flex items-center justify-end gap-1">
                              {farol} {over ? '+' : ''}{fmt(desvio)}
                            </span>
                          ) : '—'}
                        </td>
                      </>
                    );
                  })()}
                  {hasDesembolso && (
                    <td className="py-2 text-right tabular-nums font-semibold" style={{ color: '#b45309' }}>
                      {row.desembolso != null ? `R$ ${fmt(row.desembolso, 2)}` : '—'}
                    </td>
                  )}
                  {hasDesembolso && (
                    <td className="py-2 text-right tabular-nums font-semibold" style={{ color: '#b45309' }}>
                      {row.desembolso != null && row.periodo > 0 ? `R$ ${fmt(row.desembolso * row.periodo, 2)}` : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Totals ── */}
        <div
          className="rounded-xl px-5 py-4 mb-6 flex flex-wrap gap-4 items-center justify-between"
          style={{ background: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.06)' }}
        >
          {/* Cabeças */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Cabeças</span>
            <span className="text-lg font-extrabold text-gray-900 tabular-nums">{fmtInt(totalQtd)}</span>
          </div>
          {/* Consumo médio */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Consumo médio</span>
            <span className="text-lg font-extrabold tabular-nums" style={{ color }}>{fmt(avg)}</span>
            <span className="text-xs text-gray-400">kg/cab/dia</span>
          </div>
          {/* Meta + Semáforo */}
          {avgMeta != null && (() => {
            const ratio = avg / avgMeta;
            const isVerde   = ratio >= 0.9 && ratio <= 1.1;
            const isAmarelo = ratio > 1.1;
            const semaforo = isVerde ? '🟢' : isAmarelo ? '🟡' : '🔴';
            const bgColor  = isVerde ? '#dcfce7' : isAmarelo ? '#fef9c3' : '#fee2e2';
            const txtColor = isVerde ? '#14532d' : isAmarelo ? '#854d0e' : '#991b1b';
            const label    = isVerde ? 'DENTRO' : isAmarelo ? 'ACIMA' : 'ABAIXO';
            return (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Meta</span>
                <span
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                  style={{ backgroundColor: bgColor, color: txtColor }}
                >
                  {semaforo} {label} — {fmt(avgMeta)} kg/cab dia
                </span>
              </div>
            );
          })()}
          {/* Desembolso no período */}
          {avgDesembolso != null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Desembolso no Período (R$/cab)</span>
              <span className="text-base font-extrabold tabular-nums" style={{ color: '#b45309' }}>
                {avgDesembolsoMes != null ? `R$ ${fmt(avgDesembolsoMes, 2)}` : `R$ ${fmt(avgDesembolso, 2)}/dia`}
              </span>
              {avgDesembolsoMes != null && (
                <span className="text-xs font-semibold tabular-nums text-gray-400">
                  · R$ {fmt(avgDesembolso, 2)}/cab/dia
                </span>
              )}
            </div>
          )}
          {/* Aviso sem meta */}
          {avgMeta === null && (
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(234,179,8,0.12)', color: '#854d0e', border: '1px solid rgba(234,179,8,0.3)' }}
              title="Configure o % PV em Cadastros > Suplementos para exibir a meta de consumo"
            >
              ⚠ Configure o % PV em Cadastros para ativar a meta
            </span>
          )}
        </div>

        {/* ── Gráfico full-width abaixo ── */}
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 28, right: 90, left: 10, bottom: 100 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
              <XAxis
                dataKey="name"
                angle={-40}
                textAnchor="end"
                interval={0}
                height={100}
                fontSize={11}
                tick={{ fill: '#555' }}
                axisLine={{ stroke: '#ccc' }}
              />
              <YAxis
                tickFormatter={(v) => fmt(Number(v))}
                ticks={yTicks}
                domain={[0, chartMax]}
                fontSize={11}
                tick={{ fill: '#999' }}
                axisLine={{ stroke: '#ccc' }}
              />
              <Tooltip
                formatter={(value) => [`${fmt(Number(value))} kg/cab dia`, 'Consumo']}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
              {avg > 0 && (
                <ReferenceLine
                  y={avg}
                  stroke="#e53e3e"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  label={<RefLabel value={`média ${fmt(avg)}`} color="#e53e3e" />}
                />
              )}
              {avgMeta != null && (
                <ReferenceLine
                  y={avgMeta}
                  stroke="#1a4a7a"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  label={<RefLabel value={`meta ${fmt(avgMeta)}`} color="#1a4a7a" />}
                />
              )}
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {chartData.map((_, idx) => (
                  <Cell key={idx} fill={color} />
                ))}
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v: number) => fmt(v)}
                  style={{ fontSize: 10, fill: '#444', fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}
