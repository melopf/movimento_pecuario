/**
 * Guarda do Design System — Suplemento Control
 * Se este teste falhar, o design foi alterado sem aprovação.
 */
import { describe, it, expect } from 'vitest';
import { supplementColors, supplementOrder, getSupplementColor, META_CONSUMO } from './data';

describe('Design Tokens — Cores dos Suplementos', () => {
  it('Energetico 0,3% usa brand green #1a6040', () => {
    expect(supplementColors['Energetico 0,3%']).toBe('#1a6040');
  });
  it('Mineral Adensado Aguas usa navy #0b2748', () => {
    expect(supplementColors['Mineral Adensado Aguas']).toBe('#0b2748');
  });
  it('Racao Creep usa purple #6b2fa0', () => {
    expect(supplementColors['Racao Creep']).toBe('#6b2fa0');
  });
  it('todas as cores sao hex valido de 6 digitos', () => {
    const hexRegex = /^#[0-9a-f]{6}$/i;
    for (const [nome, cor] of Object.entries(supplementColors)) {
      expect(cor, `${nome} deve ter cor hex valida`).toMatch(hexRegex);
    }
  });
  it('nenhuma cor e branco ou preto puro', () => {
    const proibidas = ['#ffffff', '#000000'];
    for (const cor of Object.values(supplementColors)) {
      expect(proibidas).not.toContain(cor.toLowerCase());
    }
  });
});

describe('Design Tokens — Ordem dos Suplementos', () => {
  it('Energetico 0,3% e o primeiro da lista', () => {
    expect(supplementOrder[0]).toBe('Energetico 0,3%');
  });
  it('Mineral Adensado Aguas esta na lista', () => {
    expect(supplementOrder).toContain('Mineral Adensado Aguas');
  });
  it('Racao Creep esta na lista', () => {
    expect(supplementOrder).toContain('Racao Creep');
  });
  it('nao ha duplicatas na lista', () => {
    const unique = new Set(supplementOrder);
    expect(unique.size).toBe(supplementOrder.length);
  });
  it('todos os suplementos com cor tem entrada na ordem', () => {
    for (const nome of Object.keys(supplementColors)) {
      expect(supplementOrder, `"${nome}" deve estar em supplementOrder`).toContain(nome);
    }
  });
  it('lista tem pelo menos 10 suplementos', () => {
    expect(supplementOrder.length).toBeGreaterThanOrEqual(10);
  });
});

describe('getSupplementColor', () => {
  it('retorna cor correta para suplemento conhecido', () => {
    expect(getSupplementColor('Energetico 0,3%')).toBe('#1a6040');
  });
  it('retorna cor de fallback para tipo desconhecido (indice 0)', () => {
    expect(getSupplementColor('Suplemento Novo', 0)).toBe('#1a6040');
  });
  it('itera pelo indice na paleta de fallback', () => {
    const cor0 = getSupplementColor('Tipo X', 0);
    const cor1 = getSupplementColor('Tipo X', 1);
    expect(cor0).not.toBe(cor1);
  });
  it('fallback sempre retorna cor hex valida', () => {
    const hexRegex = /^#[0-9a-f]{6}$/i;
    for (let i = 0; i < 15; i++) {
      expect(getSupplementColor(`Tipo ${i}`, i)).toMatch(hexRegex);
    }
  });
});

describe('META_CONSUMO', () => {
  it('tem exatamente 9 faixas de consumo', () => {
    expect(Object.keys(META_CONSUMO)).toHaveLength(9);
  });
  it('todos os valores tem formato de porcentagem', () => {
    const pctRegex = /^\d+,\d+%$/;
    for (const [faixa, valor] of Object.entries(META_CONSUMO)) {
      expect(valor, `Faixa "${faixa}" deve ter formato de porcentagem`).toMatch(pctRegex);
    }
  });
  it('contem a faixa de 1,50 a 2,30% PV', () => {
    expect(META_CONSUMO).toHaveProperty('1,50 A 2,30% PV');
  });
});