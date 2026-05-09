import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase:      { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../lib/supabase';
import { estoqueService } from './estoqueService';
import type { SuppTypeWithEstoque } from './estoqueService';

function chain(data: unknown, error: unknown = null) {
  const c: Record<string, unknown> = {};
  for (const m of ['select','eq','order','gte','lte','limit','update','insert','delete','single','maybeSingle']) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  (c as any).then = (resolve: Function, reject?: Function) =>
    Promise.resolve({ data, error }).then(resolve as any, reject as any);
  return c;
}

beforeEach(() => vi.clearAllMocks());

const supls: SuppTypeWithEstoque[] = [
  { id: 'id-e', nome: 'Energetico 0,3%',       unidade: 'saco', peso: 25, valor_kg: 3.5, consumo: null, estoque_minimo_sacos: 10, alerta_reposicao: true },
  { id: 'id-m', nome: 'Mineral Adensado Aguas', unidade: 'saco', peso: 25, valor_kg: 5.0, consumo: null, estoque_minimo_sacos: 5,  alerta_reposicao: true },
];

describe('estoqueService.kgParaSacos', () => {
  it('converte kg para sacos corretamente', () => {
    expect(estoqueService.kgParaSacos(250, 25)).toBe(10);
  });
  it('retorna 0 se peso do saco for 0', () => {
    expect(estoqueService.kgParaSacos(100, 0)).toBe(0);
  });
  it('usa 25kg como peso padrao', () => {
    expect(estoqueService.kgParaSacos(50)).toBe(2);
  });
  it('aceita valores decimais', () => {
    expect(estoqueService.kgParaSacos(37.5, 25)).toBeCloseTo(1.5);
  });
});

describe('estoqueService.calcularSaldos', () => {
  it('calcula saldo correto (entrada - saida)', async () => {
    const movs = [
      { suplemento_nome: 'Energetico 0,3%', tipo: 'entrada', sacos: 20, kg: 500, valor_unitario_kg: 3.5,  data: '2026-01-01' },
      { suplemento_nome: 'Energetico 0,3%', tipo: 'saida',   sacos: 5,  kg: 125, valor_unitario_kg: null, data: '2026-01-15' },
    ];
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain(movs) as any);
    const saldos = await estoqueService.calcularSaldos('farm-id', supls);
    const e = saldos.find(s => s.suplemento_nome === 'Energetico 0,3%')!;
    expect(e.saldo_sacos).toBe(15);
  });
  it('marca em_alerta quando saldo <= estoque minimo', async () => {
    const movs = [
      { suplemento_nome: 'Energetico 0,3%', tipo: 'entrada', sacos: 10, kg: 250, valor_unitario_kg: 3.5,  data: '2026-01-01' },
      { suplemento_nome: 'Energetico 0,3%', tipo: 'saida',   sacos: 8,  kg: 200, valor_unitario_kg: null, data: '2026-01-10' },
    ];
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain(movs) as any);
    const saldos = await estoqueService.calcularSaldos('farm-id', supls);
    expect(saldos.find(s => s.suplemento_nome === 'Energetico 0,3%')!.em_alerta).toBe(true);
  });
  it('nao alerta quando saldo > estoque minimo', async () => {
    const movs = [
      { suplemento_nome: 'Energetico 0,3%', tipo: 'entrada', sacos: 50, kg: 1250, valor_unitario_kg: 3.5, data: '2026-01-01' },
    ];
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain(movs) as any);
    const saldos = await estoqueService.calcularSaldos('farm-id', supls);
    expect(saldos.find(s => s.suplemento_nome === 'Energetico 0,3%')!.em_alerta).toBe(false);
  });
  it('suplemento sem movimentos tem saldo zero', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain([]) as any);
    const saldos = await estoqueService.calcularSaldos('farm-id', supls);
    expect(saldos.find(s => s.suplemento_nome === 'Mineral Adensado Aguas')!.saldo_sacos).toBe(0);
  });
  it('calcula valor medio por kg das entradas', async () => {
    const movs = [
      { suplemento_nome: 'Energetico 0,3%', tipo: 'entrada', sacos: 10, kg: 250, valor_unitario_kg: 3.0, data: '2026-01-01' },
      { suplemento_nome: 'Energetico 0,3%', tipo: 'entrada', sacos: 10, kg: 250, valor_unitario_kg: 4.0, data: '2026-02-01' },
    ];
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain(movs) as any);
    const saldos = await estoqueService.calcularSaldos('farm-id', supls);
    expect(saldos.find(s => s.suplemento_nome === 'Energetico 0,3%')!.valor_medio_kg).toBeCloseTo(3.5, 5);
  });
  it('alertas aparecem antes de itens sem alerta', async () => {
    const movs = [
      { suplemento_nome: 'Energetico 0,3%',       tipo: 'entrada', sacos: 2,  kg: 50,   valor_unitario_kg: null, data: '2026-01-01' },
      { suplemento_nome: 'Mineral Adensado Aguas', tipo: 'entrada', sacos: 50, kg: 1250, valor_unitario_kg: null, data: '2026-01-01' },
    ];
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain(movs) as any);
    const saldos = await estoqueService.calcularSaldos('farm-id', supls);
    expect(saldos[0].em_alerta).toBe(true);
    expect(saldos[saldos.length - 1].em_alerta).toBe(false);
  });
  it('lanca erro se Supabase retorna erro', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain(null, new Error('DB error')) as any);
    await expect(estoqueService.calcularSaldos('farm-id', supls)).rejects.toThrow('DB error');
  });
});