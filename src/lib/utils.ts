import type { DataEntry } from './data';
import { supplementOrder } from './data';

export { supplementOrder };

export function fmt(value: number, decimals = 3): string {
  return value.toFixed(decimals).replace('.', ',');
}

export function fmtInt(value: number): string {
  return String(Math.round(value));
}

export function groupByType(entries: DataEntry[]): Record<string, DataEntry[]> {
  const groups: Record<string, DataEntry[]> = {};
  entries.forEach((entry) => {
    if (!groups[entry.tipo]) groups[entry.tipo] = [];
    groups[entry.tipo].push(entry);
  });
  return groups;
}

/* Retorna tipos únicos na ordem de supplementOrder, seguido de qualquer outro */
export function sortedTypes(groups: Record<string, DataEntry[]>): string[] {
  const inOrder = supplementOrder.filter(t => groups[t]?.length);
  const others  = Object.keys(groups).filter(t => !supplementOrder.includes(t) && groups[t].length);
  return [...inOrder, ...others];
}

/** Média ponderada pelo número de cabeças (quantidade) */
export function averageConsumo(entries: DataEntry[]): number {
  if (!entries.length) return 0;
  const totalCab    = entries.reduce((acc, e) => acc + Number(e.quantidade || 0), 0);
  if (totalCab === 0) return 0;
  const totalPesado = entries.reduce((acc, e) => acc + Number(e.consumo || 0) * Number(e.quantidade || 0), 0);
  return totalPesado / totalCab;
}

export function sumQuantidade(entries: DataEntry[]): number {
  return entries.reduce((acc, e) => acc + Number(e.quantidade || 0), 0);
}

/**
 * Agrega entradas pelo pasto, calculando o consumo real com base no
 * intervalo de datas (primeiro apontamento → último apontamento).
 * Fórmula: total_kg / cabeças / dias_reais
 */
export function aggregateEntriesByPasto(entries: DataEntry[]): DataEntry[] {
  const byPasto: Record<string, DataEntry[]> = {};
  for (const e of entries) {
    if (!byPasto[e.pasto]) byPasto[e.pasto] = [];
    byPasto[e.pasto].push(e);
  }
  return Object.entries(byPasto).map(([pasto, group]) => {
    const totalKg    = group.reduce((s, e) => s + (e.kg    || 0), 0);
    const totalSacos = group.reduce((s, e) => s + (e.sacos || 0), 0);
    const qtd        = group.reduce((mx, e) => Math.max(mx, e.quantidade || 0), 0) || group[0].quantidade;

    // Datas ordenadas
    const dates     = group.map(e => e.data).filter(Boolean).sort() as string[];
    const firstDate = dates[0];
    const lastDate  = dates[dates.length - 1];

    // Dias reais = diferença entre primeiro e último apontamento
    let diasReais = group[0]?.periodo || 30; // fallback se só 1 entrada
    if (dates.length >= 2 && firstDate !== lastDate) {
      const d1 = new Date(firstDate + 'T12:00:00');
      const d2 = new Date(lastDate  + 'T12:00:00');
      const calc = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
      if (calc > 0) diasReais = calc;
    }

    const consumo = totalKg > 0 && qtd > 0 && diasReais > 0
      ? totalKg / qtd / diasReais
      : 0;

    return {
      ...group[0],
      pasto,
      quantidade: qtd,
      sacos:      totalSacos,
      kg:         totalKg,
      periodo:    diasReais,
      consumo,
      data:       lastDate || group[0]?.data,
    };
  });
}

/**
 * Calcula consumo por lançamento individual usando intervalo até o próximo lançamento.
 * Usado para gráfico de série temporal quando um pasto específico é selecionado.
 */
export function timeSeriesConsumo(entries: DataEntry[]): DataEntry[] {
  const sorted = [...entries].sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''));
  return sorted.map((e, i) => {
    const next = sorted[i + 1];
    let dias = e.periodo > 0 ? e.periodo : 30;
    if (next?.data && e.data) {
      const d1 = new Date(e.data  + 'T12:00:00');
      const d2 = new Date(next.data + 'T12:00:00');
      const calc = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
      if (calc > 0) dias = calc;
    }
    const consumo = e.kg > 0 && e.quantidade > 0 ? e.kg / e.quantidade / dias : 0;
    return { ...e, consumo, periodo: dias };
  });
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
