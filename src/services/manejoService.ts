import { supabaseAdmin } from '../lib/supabase';

/* ── Types ── */

export interface Animal {
  id: string;
  farm_id: string;
  nome: string;
  quantidade: number;
  raca?: string;
  categoria_id?: string;
  peso_medio?: number;
  sexo?: string;
  prenha?: boolean;
  bezerros_quantidade?: number;
  bezerros_peso_medio?: number;
  observacoes?: string;
  pasto_id?: string;
  status: 'ativo' | 'abatido' | 'vendido';
  meta_percentagem?: number;
  created_at?: string;
  gmd?: number;
  data_entrada?: string;
}

export interface AnimalCategory {
  id: string;
  farm_id: string;
  nome: string;
}

export interface ManejoEvent {
  id: string;
  farm_id: string;
  animal_id: string;
  tipo: string;
  descricao?: string;
  quantidade?: number;
  peso_medio?: number;
  pasto_origem?: string;
  pasto_destino?: string;
  created_at: string;
}

/* ── Helpers ── */

function toAnimal(row: Record<string, unknown>): Animal {
  return {
    id:           row.id as string,
    farm_id:      row.farm_id as string,
    nome:         row.nome as string,
    quantidade:   (row.quantidade as number) ?? 0,
    raca:         (row.raca as string) ?? undefined,
    categoria_id: (row.categoria_id as string) ?? undefined,
    peso_medio:          (row.peso_medio as number) ?? undefined,
    sexo:                (row.sexo as string) ?? undefined,
    prenha:              (row.prenha as boolean) ?? false,
    bezerros_quantidade: (row.bezerros_quantidade as number) ?? undefined,
    bezerros_peso_medio: (row.bezerros_peso_medio as number) ?? undefined,
    observacoes:         (row.observacoes as string) ?? undefined,
    pasto_id:          (row.pasto_id as string) ?? undefined,
    status:            ((row.status as string) ?? 'ativo') as Animal['status'],
    meta_percentagem:  (row.meta_percentagem as number) ?? undefined,
    created_at:        (row.created_at as string) ?? undefined,
    gmd:               (row.gmd as number) ?? undefined,
    data_entrada:      (row.data_entrada as string) ?? undefined,
  };
}

function toCategory(row: Record<string, unknown>): AnimalCategory {
  return {
    id:      row.id as string,
    farm_id: row.farm_id as string,
    nome:    row.nome as string,
  };
}

function toEvent(row: Record<string, unknown>): ManejoEvent {
  return {
    id:            row.id as string,
    farm_id:       row.farm_id as string,
    animal_id:     row.animal_id as string,
    tipo:          row.tipo as string,
    descricao:     (row.descricao as string) ?? undefined,
    quantidade:    (row.quantidade as number) ?? undefined,
    peso_medio:    (row.peso_medio as number) ?? undefined,
    pasto_origem:  (row.pasto_origem as string) ?? undefined,
    pasto_destino: (row.pasto_destino as string) ?? undefined,
    created_at:    row.created_at as string,
  };
}

async function insertHistorico(payload: {
  farm_id: string;
  animal_id: string;
  tipo: string;
  descricao?: string;
  pasto_origem?: string | null;
  pasto_destino?: string | null;
  categoria_origem?: string | null;
  categoria_destino?: string | null;
  quantidade?: number | null;
  peso_medio?: number | null;
  user_name?: string | null;
}) {
  await supabaseAdmin.from('manejo_historico').insert(payload);
}

/* ── Service ── */

export const manejoService = {

  async listarAnimais(farmId: string): Promise<Animal[]> {
    const { data, error } = await supabaseAdmin
      .from('animals')
      .select('*')
      .eq('farm_id', farmId)
      .order('nome');
    if (error) throw new Error(error.message);
    return (data ?? []).map(toAnimal);
  },

  async listarCategorias(farmId: string): Promise<AnimalCategory[]> {
    const { data, error } = await supabaseAdmin
      .from('animal_categories')
      .select('*')
      .eq('farm_id', farmId)
      .order('nome');
    if (error) throw new Error(error.message);
    return (data ?? []).map(toCategory);
  },

  async alocarPasto(
    animal: Animal,
    pastoId: string | null,
    pastoNome: string,
    data?: string,
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('animals')
      .update({ pasto_id: pastoId })
      .eq('id', animal.id);
    if (error) throw new Error(error.message);

    const acao    = pastoId ? `alocado em ${pastoNome}` : 'removido do pasto';
    const dataStr = data ? ` · ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}` : '';
    await insertHistorico({
      farm_id:       animal.farm_id,
      animal_id:     animal.id,
      tipo:          'alocacao',
      descricao:     `Lote "${animal.nome}" ${acao}${dataStr}`,
      pasto_origem:  animal.pasto_id ?? null,
      pasto_destino: pastoId,
    });
  },

  async transferir(
    animal: Animal,
    pastoDestinoId: string,
    pastoOrigemNome: string,
    pastoDestinoNome: string,
    data?: string,
    obs?: string,
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('animals')
      .update({ pasto_id: pastoDestinoId })
      .eq('id', animal.id);
    if (error) throw new Error(error.message);

    const dataStr = data ? ` · ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}` : '';
    await insertHistorico({
      farm_id:       animal.farm_id,
      animal_id:     animal.id,
      tipo:          'transferencia',
      descricao:     `Lote "${animal.nome}" transferido de ${pastoOrigemNome} → ${pastoDestinoNome}${dataStr}${obs ? ` · ${obs}` : ''}`,
      pasto_origem:  animal.pasto_id ?? null,
      pasto_destino: pastoDestinoId,
    });
  },

  async evoluirCategorias(
    animals: Animal[],
    novaCategoriaId: string,
    categoriaOrigemNome: string,
    categoriaDestinoNome: string,
    pesoMedio?: number,
    data?: string,
    bezPesoMedio?: number,
  ): Promise<void> {
    const ids = animals.map(a => a.id);
    const patch: Record<string, unknown> = { categoria_id: novaCategoriaId };
    if (pesoMedio) patch.peso_medio = pesoMedio;

    const { error } = await supabaseAdmin
      .from('animals')
      .update(patch)
      .in('id', ids);

    // Atualiza peso dos bezerros apenas nos lotes que têm bezerros
    if (bezPesoMedio) {
      const idsComBez = animals.filter(a => (a.bezerros_quantidade ?? 0) > 0).map(a => a.id);
      if (idsComBez.length > 0) {
        await supabaseAdmin.from('animals').update({ bezerros_peso_medio: bezPesoMedio }).in('id', idsComBez);
      }
    }
    if (error) throw new Error(error.message);

    const totalCab   = animals.reduce((s, a) => s + a.quantidade, 0);
    const nomesLotes = animals.map(a => `"${a.nome}"`).join(', ');
    const dataStr    = data ? ` · ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}` : '';
    await Promise.all(animals.map(a =>
      insertHistorico({
        farm_id:           a.farm_id,
        animal_id:         a.id,
        tipo:              'evolucao_categoria',
        descricao:         `${nomesLotes}: ${categoriaOrigemNome} → ${categoriaDestinoNome} (${totalCab} cab.)${dataStr}`,
        categoria_origem:  a.categoria_id ?? null,
        categoria_destino: novaCategoriaId,
        quantidade:        a.quantidade,
        peso_medio:        pesoMedio ?? null,
      })
    ));
  },

  async registrarSaida(
    animal: Animal,
    quantidade: number,
    tipoSaida: 'abate' | 'venda',
    pesoMedio?: number,
    data?: string,
    obs?: string,
  ): Promise<void> {
    const novaQtd = animal.quantidade - quantidade;
    const patch: Record<string, unknown> = { quantidade: novaQtd };
    if (novaQtd <= 0) patch.status = tipoSaida === 'venda' ? 'vendido' : 'abatido';

    const { error } = await supabaseAdmin
      .from('animals')
      .update(patch)
      .eq('id', animal.id);
    if (error) throw new Error(error.message);

    const encerrado = novaQtd <= 0 ? ' — lote encerrado' : '';
    const dataStr   = data ? ` · ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}` : '';
    const prefixo   = tipoSaida === 'venda' ? 'Venda' : 'Abate';
    await insertHistorico({
      farm_id:    animal.farm_id,
      animal_id:  animal.id,
      tipo:       tipoSaida,
      descricao:  `${prefixo}: ${quantidade} cab. do lote "${animal.nome}"${pesoMedio ? ` · ${pesoMedio} kg` : ''}${dataStr}${obs ? ` · ${obs}` : ''}${encerrado}`,
      quantidade,
      peso_medio: pesoMedio ?? null,
    });
  },

  /** Mantido por compatibilidade com histórico antigo */
  async registrarAbate(
    animal: Animal,
    quantidade: number,
    pesoMedio?: number,
    data?: string,
    obs?: string,
  ): Promise<void> {
    return manejoService.registrarSaida(animal, quantidade, 'abate', pesoMedio, data, obs);
  },

  async desagruparLote(params: {
    loteOrigem: Animal;
    qtd: number;
    pesoMedio?: number;
    data?: string;
    destino: { tipo: 'existente'; loteId: string } | { tipo: 'novo'; nome: string; categoriaId?: string };
    farmId: string;
    loteDestinoNome?: string;
  }): Promise<void> {
    const { loteOrigem, qtd, pesoMedio, data, destino, farmId, loteDestinoNome } = params;

    // Reduz quantidade do lote de origem
    const novaQtd = loteOrigem.quantidade - qtd;
    const { error: errUpd } = await supabaseAdmin
      .from('animals')
      .update({ quantidade: novaQtd })
      .eq('id', loteOrigem.id);
    if (errUpd) throw new Error(errUpd.message);

    const dataStr = data ? ` · ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}` : '';
    let descrDestino = '';

    if (destino.tipo === 'existente') {
      const { data: loteAtual, error: errLer } = await supabaseAdmin
        .from('animals').select('quantidade').eq('id', destino.loteId).single();
      if (errLer) throw new Error(errLer.message);
      const { error } = await supabaseAdmin
        .from('animals')
        .update({ quantidade: (loteAtual.quantidade as number) + qtd })
        .eq('id', destino.loteId);
      if (error) throw new Error(error.message);
      descrDestino = `agregados ao lote "${loteDestinoNome ?? destino.loteId}"`;
    } else {
      const { error } = await supabaseAdmin.from('animals').insert({
        farm_id:      farmId,
        nome:         destino.nome,
        quantidade:   qtd,
        categoria_id: destino.categoriaId ?? null,
        peso_medio:   pesoMedio ?? null,
        pasto_id:     loteOrigem.pasto_id ?? null,
        status:       'ativo',
      });
      if (error) throw new Error(error.message);
      descrDestino = `novo lote "${destino.nome}" criado`;
    }

    await insertHistorico({
      farm_id:    farmId,
      animal_id:  loteOrigem.id,
      tipo:       'desagrupamento',
      descricao:  `Desagrupamento: ${qtd} cab. do lote "${loteOrigem.nome}"${pesoMedio ? ` · ${pesoMedio} kg` : ''}${dataStr} — ${descrDestino}`,
      quantidade: qtd,
      peso_medio: pesoMedio ?? null,
    });
  },

  async registrarParicao(params: {
    loteMae: Animal;
    qtdPartos: number;
    pesoMedio?: number;
    data?: string;
    farmId: string;
  }): Promise<void> {
    const { loteMae, qtdPartos, pesoMedio, data, farmId } = params;
    const novosBez = (loteMae.bezerros_quantidade ?? 0) + qtdPartos;
    const updatePayload: Record<string, unknown> = {
      bezerros_quantidade: novosBez,
      prenha: false,
    };
    if (pesoMedio) updatePayload.bezerros_peso_medio = pesoMedio;
    const { error } = await supabaseAdmin
      .from('animals')
      .update(updatePayload)
      .eq('id', loteMae.id);
    if (error) throw new Error(error.message);

    const dataStr = data ? ` · ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}` : '';
    await insertHistorico({
      farm_id:    farmId,
      animal_id:  loteMae.id,
      tipo:       'paricao',
      descricao:  `Parição: ${qtdPartos} bezerro(s) nascido(s) no lote "${loteMae.nome}"${pesoMedio ? ` · ${pesoMedio} kg/cab` : ''}${dataStr} — bezerros ao pé`,
      quantidade: qtdPartos,
      peso_medio: pesoMedio ?? null,
    });
  },

  async manejarBezerros(params: {
    loteOrigem: Animal;
    qtdBezerros: number;
    pesoMedio?: number;
    data?: string;
    destino: { tipo: 'existente'; loteId: string } | { tipo: 'novo'; nome: string; categoriaId?: string };
    farmId: string;
    loteDestinoNome?: string;
  }): Promise<void> {
    const { loteOrigem, qtdBezerros, pesoMedio, data, destino, farmId, loteDestinoNome } = params;
    const dataStr = data ? ` · ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}` : '';
    let descrDestino = '';

    if (destino.tipo === 'existente') {
      const { data: loteAtual, error: errLer } = await supabaseAdmin
        .from('animals').select('quantidade').eq('id', destino.loteId).single();
      if (errLer) throw new Error(errLer.message);
      const { error } = await supabaseAdmin
        .from('animals')
        .update({ quantidade: (loteAtual.quantidade as number) + qtdBezerros })
        .eq('id', destino.loteId);
      if (error) throw new Error(error.message);
      descrDestino = `agregados ao lote "${loteDestinoNome ?? destino.loteId}"`;
    } else {
      const { error } = await supabaseAdmin.from('animals').insert({
        farm_id:      farmId,
        nome:         destino.nome,
        quantidade:   qtdBezerros,
        categoria_id: destino.categoriaId ?? null,
        peso_medio:   pesoMedio ?? null,
        pasto_id:     loteOrigem.pasto_id ?? null,
        status:       'ativo',
      });
      if (error) throw new Error(error.message);
      descrDestino = `novo lote "${destino.nome}" criado`;
    }

    // Reduz (ou zera) bezerros_quantidade no lote de origem
    const bezRestantes = (loteOrigem.bezerros_quantidade ?? 0) - qtdBezerros;
    await supabaseAdmin.from('animals').update({
      bezerros_quantidade: bezRestantes > 0 ? bezRestantes : null,
      bezerros_peso_medio: bezRestantes > 0 ? (loteOrigem.bezerros_peso_medio ?? null) : null,
    }).eq('id', loteOrigem.id);

    await insertHistorico({
      farm_id:    farmId,
      animal_id:  loteOrigem.id,
      tipo:       'manejo_bezerros',
      descricao:  `Bezerros: ${qtdBezerros} cab. do lote "${loteOrigem.nome}"${pesoMedio ? ` · ${pesoMedio} kg` : ''}${dataStr} — ${descrDestino}`,
      quantidade: qtdBezerros,
      peso_medio: pesoMedio ?? null,
    });
  },

  /** Funde 2+ lotes em um só. O primeiro lote recebe o novo nome e a quantidade total.
   *  Os demais lotes são marcados como inativo. */
  async fundirLotes(
    lots: Animal[],
    novoNome: string,
    farmId: string,
    data?: string,
  ): Promise<void> {
    if (lots.length < 2) throw new Error('Selecione pelo menos 2 lotes para fundir.');
    const [primary, ...others] = lots;
    const totalQtd = lots.reduce((s, a) => s + a.quantidade, 0);
    const totalBez = lots.reduce((s, a) => s + (a.bezerros_quantidade ?? 0), 0);

    const { error: errPrimary } = await supabaseAdmin.from('animals').update({
      nome:               novoNome,
      quantidade:         totalQtd,
      bezerros_quantidade: totalBez > 0 ? totalBez : null,
    }).eq('id', primary.id);
    if (errPrimary) throw new Error(errPrimary.message);

    const otherIds = others.map(a => a.id);
    const { error: errOthers } = await supabaseAdmin.from('animals')
      .update({ status: 'inativo' }).in('id', otherIds);
    if (errOthers) throw new Error(errOthers.message);

    const dataStr    = data ? ` · ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}` : '';
    const nomesOrig  = lots.map(a => `"${a.nome}"`).join(' + ');
    await insertHistorico({
      farm_id:    farmId,
      animal_id:  primary.id,
      tipo:       'fusao',
      descricao:  `Fusão: ${nomesOrig} → "${novoNome}" (${totalQtd} cab.)${dataStr}`,
      quantidade: totalQtd,
    });
  },

  /** Transfere parte da quantidade de um lote para outro (sem mudar pasto). */
  async transferirParcial(
    origem: Animal,
    destino: Animal,
    qtd: number,
    farmId: string,
    data?: string,
  ): Promise<void> {
    if (qtd <= 0) throw new Error('Quantidade inválida.');
    if (qtd > origem.quantidade) throw new Error(`Quantidade maior que o disponível no lote (${origem.quantidade} cab.).`);

    const { error: e1 } = await supabaseAdmin.from('animals')
      .update({ quantidade: origem.quantidade - qtd }).eq('id', origem.id);
    if (e1) throw new Error(e1.message);

    const { error: e2 } = await supabaseAdmin.from('animals')
      .update({ quantidade: destino.quantidade + qtd }).eq('id', destino.id);
    if (e2) throw new Error(e2.message);

    const dataStr = data ? ` · ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}` : '';
    await insertHistorico({
      farm_id:    farmId,
      animal_id:  origem.id,
      tipo:       'transf_parcial',
      descricao:  `${qtd} cab. transferidas de "${origem.nome}" → "${destino.nome}"${dataStr}`,
      quantidade: qtd,
    });
  },

  /** Transfere parcialmente para um PASTO de destino (cria novo lote ou agrega em lote existente). */
  async transferirParcialParaPasto(params: {
    origem: Animal;
    qtd: number;
    bezQtd?: number;
    pesoNovoLote?: number;
    destPastoId: string;
    destPastoNome: string;
    farmId: string;
    data?: string;
    mergeLoteId?: string;
    mergeLoteNome?: string;
    mergeLoteQtd?: number;
    mergeLoteBezQtd?: number;
    novoLoteNome?: string;
    userName?: string;
  }): Promise<void> {
    const { origem, qtd, bezQtd, pesoNovoLote, destPastoId, destPastoNome, farmId, data, mergeLoteId, mergeLoteNome, mergeLoteQtd, mergeLoteBezQtd, novoLoteNome, userName } = params;
    if (qtd <= 0) throw new Error('Quantidade inválida.');
    if (qtd > origem.quantidade) throw new Error(`Quantidade maior que o disponível no lote (${origem.quantidade} cab.).`);
    if (bezQtd && bezQtd > (origem.bezerros_quantidade ?? 0)) throw new Error(`Quantidade de bezerros maior que o disponível (${origem.bezerros_quantidade ?? 0}).`);

    // Deduz do lote de origem
    const origemUpdate: Record<string, unknown> = { quantidade: origem.quantidade - qtd };
    if (bezQtd) origemUpdate.bezerros_quantidade = Math.max(0, (origem.bezerros_quantidade ?? 0) - bezQtd);
    const { error: e1 } = await supabaseAdmin.from('animals')
      .update(origemUpdate).eq('id', origem.id);
    if (e1) throw new Error(e1.message);

    const dataStr = data ? ` · ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}` : '';
    let descrDest: string;

    if (mergeLoteId) {
      // Agrega em lote existente no pasto destino
      const mergeUpdate: Record<string, unknown> = { quantidade: (mergeLoteQtd ?? 0) + qtd };
      if (bezQtd) mergeUpdate.bezerros_quantidade = (mergeLoteBezQtd ?? 0) + bezQtd;
      const { error: e2 } = await supabaseAdmin.from('animals')
        .update(mergeUpdate).eq('id', mergeLoteId);
      if (e2) throw new Error(e2.message);
      descrDest = `agregados ao lote "${mergeLoteNome ?? mergeLoteId}" no pasto ${destPastoNome}`;
    } else {
      // Cria novo lote no pasto destino
      const { error: e2 } = await supabaseAdmin.from('animals').insert({
        farm_id:     farmId,
        nome:        novoLoteNome ?? `${origem.nome} (parcial)`,
        quantidade:  qtd,
        categoria_id: origem.categoria_id ?? null,
        peso_medio:  pesoNovoLote ?? origem.peso_medio ?? null,
        raca:        origem.raca ?? null,
        sexo:        origem.sexo ?? null,
        prenha:      origem.prenha ?? false,
        bezerros_quantidade: bezQtd ?? null,
        pasto_id:    destPastoId,
        status:      'ativo',
      });
      if (e2) throw new Error(e2.message);
      descrDest = `novo lote "${novoLoteNome ?? origem.nome}" criado no pasto ${destPastoNome}`;
    }

    await insertHistorico({
      farm_id:    farmId,
      animal_id:  origem.id,
      tipo:       'transf_parcial',
      descricao:  `${qtd} cab. de "${origem.nome}" → ${descrDest}${dataStr}`,
      quantidade: qtd,
      user_name:  userName ?? null,
    });
  },

  async upsertHistoricoDiario(
    farmId: string,
    animals: Animal[],
    pastoMap: Record<string, string>,     // pasto_id → pasto_nome
    pastoSuppMap: Record<string, string>, // pasto_nome → suplemento mais recente
    pastoGmdMap: Record<string, number> = {}, // pasto_nome → gmd_esperado do suplemento
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const ativos = animals.filter(a => {
      if (!(a.status === 'ativo' || !a.status)) return false;
      if (!a.data_entrada || !a.pasto_id) return false;
      const pastoNome = pastoMap[a.pasto_id] ?? '';
      const effectiveGmd = a.gmd ?? pastoGmdMap[pastoNome] ?? 0;
      return effectiveGmd > 0;
    });
    if (ativos.length === 0) return;

    // Remove registros não confirmados de hoje para recriar com dados frescos
    await supabaseAdmin
      .from('lote_historico_diario')
      .delete()
      .eq('farm_id', farmId)
      .eq('data', today)
      .eq('confirmado', false);

    const records = ativos.map(a => {
      const pastoNome = pastoMap[a.pasto_id!] ?? null;
      const effectiveGmd = a.gmd ?? (pastoNome ? (pastoGmdMap[pastoNome] ?? 0) : 0);
      const dias = Math.max(0, Math.floor((Date.now() - new Date(a.data_entrada!).getTime()) / 86_400_000));
      const ganho_acum = parseFloat((effectiveGmd * dias).toFixed(3));
      const peso_estimado = parseFloat(((a.peso_medio ?? 0) + ganho_acum).toFixed(1));
      return {
        farm_id: farmId,
        animal_id: a.id,
        data: today,
        pasto_id: a.pasto_id,
        pasto_nome: pastoNome,
        suplemento: pastoNome ? (pastoSuppMap[pastoNome] ?? null) : null,
        gmd: effectiveGmd,
        peso_estimado,
        ganho_acum,
        confirmado: false,
      };
    });

    await supabaseAdmin.from('lote_historico_diario').insert(records);
  },

  async buscarGanhoAcumulado(farmId: string): Promise<Record<string, { ganho: number; data: string; confirmado: boolean }>> {
    const { data } = await supabaseAdmin
      .from('lote_historico_diario')
      .select('animal_id, ganho_acum, data, confirmado')
      .eq('farm_id', farmId)
      .order('data', { ascending: false });

    const result: Record<string, { ganho: number; data: string; confirmado: boolean }> = {};
    for (const row of (data ?? [])) {
      const r = row as { animal_id: string; ganho_acum: number; data: string; confirmado: boolean };
      if (!result[r.animal_id]) {
        result[r.animal_id] = { ganho: r.ganho_acum, data: r.data, confirmado: r.confirmado };
      }
    }
    return result;
  },

  async confirmarPesoReal(
    farmId: string,
    animals: Animal[],
    pesoReal: number,
    data: string,
  ): Promise<void> {
    const ids = animals.map(a => a.id);

    // Remove registros do dia para recriar como confirmado
    await supabaseAdmin
      .from('lote_historico_diario')
      .delete()
      .eq('farm_id', farmId)
      .eq('data', data)
      .in('animal_id', ids);

    const records = animals
      .filter(a => (a.status === 'ativo' || !a.status) && a.pasto_id)
      .map(a => {
        const dataRef = a.data_entrada ?? data;
        const dias = Math.max(0, Math.floor(
          (new Date(data + 'T12:00:00').getTime() - new Date(dataRef + 'T12:00:00').getTime()) / 86_400_000
        ));
        const ganho_acum = a.gmd ? parseFloat((a.gmd * dias).toFixed(3)) : 0;
        return {
          farm_id:      farmId,
          animal_id:    a.id,
          data,
          pasto_id:     a.pasto_id,
          gmd:          a.gmd ?? null,
          peso_estimado: pesoReal,
          peso_real:    pesoReal,
          ganho_acum,
          confirmado:   true,
        };
      });

    if (records.length > 0) {
      await supabaseAdmin.from('lote_historico_diario').insert(records);
    }

    // Reseta data_entrada para o dia da confirmação — GMD futuro conta a partir daqui
    if (ids.length > 0) {
      await supabaseAdmin.from('animals').update({ data_entrada: data }).in('id', ids);
    }
  },

  async listarSupplementTypes(farmId: string): Promise<Array<{ id: string; nome: string; consumo: string | null; gmd_esperado: number | null; categoria_simulador: string | null }>> {
    const { data } = await supabaseAdmin
      .from('supplement_types')
      .select('id, nome, consumo, gmd_esperado, categoria_simulador')
      .eq('farm_id', farmId);
    return (data ?? []) as Array<{ id: string; nome: string; consumo: string | null; gmd_esperado: number | null; categoria_simulador: string | null }>;
  },

  async atualizarGmd(animalId: string, gmd: number | null): Promise<void> {
    const { error } = await supabaseAdmin
      .from('animals')
      .update({ gmd })
      .eq('id', animalId);
    if (error) throw new Error(error.message);
  },

  async atualizarMetaPercentagem(animalId: string, percentagem: number | null): Promise<void> {
    const { error } = await supabaseAdmin
      .from('animals')
      .update({ meta_percentagem: percentagem })
      .eq('id', animalId);
    if (error) throw new Error(error.message);
  },

  async listarHistorico(farmId: string, tipo?: string | string[], limit = 30): Promise<ManejoEvent[]> {
    let q = supabaseAdmin
      .from('manejo_historico')
      .select('*')
      .eq('farm_id', farmId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (Array.isArray(tipo)) {
      q = q.in('tipo', tipo);
    } else if (tipo) {
      q = q.eq('tipo', tipo);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map(toEvent);
  },
};
