import { supabaseAdmin } from '../lib/supabase';
import { META_CONSUMO } from '../lib/data';

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

export interface LoteDiario {
  id?: string;
  animal_id: string;
  data: string;
  pasto_id?: string | null;
  pasto_nome?: string | null;
  suplemento?: string | null;
  fonte_meta?: string | null;
  meta_pct?: number | null;
  meta_kg_cab?: number | null;
  meta_kg_total?: number | null;
  consumo_kg_cab?: number | null;
  gmd?: number | null;
  ganho_dia?: number | null;
  ganho_acum?: number | null;
  peso_estimado?: number | null;
  peso_real?: number | null;
  confirmado?: boolean;
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
    userName?: string,
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
      user_name:     userName ?? null,
    });
  },

  async transferir(
    animal: Animal,
    pastoDestinoId: string,
    pastoOrigemNome: string,
    pastoDestinoNome: string,
    data?: string,
    obs?: string,
    userName?: string,
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
      user_name:     userName ?? null,
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
    userName?: string,
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
        user_name:         userName ?? null,
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
    userName?: string,
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
      user_name:  userName ?? null,
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
    userName?: string;
  }): Promise<void> {
    const { loteOrigem, qtd, pesoMedio, data, destino, farmId, loteDestinoNome, userName } = params;

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
      user_name:  userName ?? null,
    });
  },

  async registrarParicao(params: {
    loteMae: Animal;
    qtdPartos: number;
    pesoMedio?: number;
    data?: string;
    farmId: string;
    userName?: string;
  }): Promise<void> {
    const { loteMae, qtdPartos, pesoMedio, data, farmId, userName } = params;
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
      user_name:  userName ?? null,
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
    userName?: string;
  }): Promise<void> {
    const { loteOrigem, qtdBezerros, pesoMedio, data, destino, farmId, loteDestinoNome, userName } = params;
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
      user_name:  userName ?? null,
    });
  },

  /** Funde 2+ lotes em um só. O primeiro lote recebe o novo nome e a quantidade total.
   *  Os demais lotes são marcados como inativo. */
  async fundirLotes(
    lots: Animal[],
    novoNome: string,
    farmId: string,
    data?: string,
    userName?: string,
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
      user_name:  userName ?? null,
    });
  },

  /** Transfere parte da quantidade de um lote para outro (sem mudar pasto). */
  async transferirParcial(
    origem: Animal,
    destino: Animal,
    qtd: number,
    farmId: string,
    data?: string,
    userName?: string,
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
      user_name:  userName ?? null,
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
    pastoMap: Record<string, string>,       // pasto_id → pasto_nome
    pastoSuppMap: Record<string, string>,   // norm(pasto_nome) → suplemento adulto mais recente
    pastoGmdMap: Record<string, number> = {}, // norm(pasto_nome) → gmd_esperado do suplemento
    pastoMetaMap: Record<string, number> = {}, // norm(pasto_nome) → meta% do suplemento adulto
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const n = (s: string) => s.trim().toUpperCase();

    const ativos = animals.filter(a => {
      if (!(a.status === 'ativo' || !a.status)) return false;
      if (!a.data_entrada || !a.pasto_id) return false;
      const pNome = pastoMap[a.pasto_id] ?? '';
      const effectiveGmd = a.gmd ?? pastoGmdMap[n(pNome)] ?? 0;
      const metaPct = a.meta_percentagem ?? pastoMetaMap[n(pNome)] ?? null;
      return effectiveGmd > 0 || metaPct != null;
    });
    if (ativos.length === 0) return;

    // Remove registros não confirmados de hoje para recriar com dados frescos
    await supabaseAdmin
      .from('lote_diario')
      .delete()
      .eq('farm_id', farmId)
      .eq('data', today)
      .eq('confirmado', false);

    const records = ativos.map(a => {
      const pastoNome = pastoMap[a.pasto_id!] ?? null;
      const nk = pastoNome ? n(pastoNome) : '';
      const effectiveGmd = a.gmd ?? (nk ? (pastoGmdMap[nk] ?? 0) : 0);
      const dias = Math.max(0, Math.floor((Date.now() - new Date(a.data_entrada!).getTime()) / 86_400_000));
      const ganho_acum = parseFloat((effectiveGmd * dias).toFixed(3));
      const peso_estimado = parseFloat(((a.peso_medio ?? 0) + ganho_acum).toFixed(1));

      // Meta ativa hoje: manual do animal > automático do suplemento do pasto
      const meta_pct = a.meta_percentagem ?? (nk ? (pastoMetaMap[nk] ?? null) : null);
      const fonte_meta = a.meta_percentagem != null ? 'manual' : (nk && pastoMetaMap[nk] != null ? 'suplemento' : null);
      const meta_kg_cab = meta_pct != null && a.peso_medio != null
        ? parseFloat((a.peso_medio * meta_pct / 100).toFixed(4))
        : null;
      const meta_kg_total = meta_kg_cab != null
        ? parseFloat((meta_kg_cab * (a.quantidade ?? 1)).toFixed(3))
        : null;

      return {
        farm_id: farmId,
        animal_id: a.id,
        data: today,
        pasto_id: a.pasto_id,
        pasto_nome: pastoNome,
        suplemento: nk ? (pastoSuppMap[nk] ?? null) : null,
        fonte_meta,
        meta_pct,
        meta_kg_cab,
        meta_kg_total,
        consumo_kg_cab: null,
        gmd: effectiveGmd || null,
        ganho_dia: effectiveGmd || null,
        ganho_acum,
        peso_estimado,
        confirmado: false,
      };
    });

    await supabaseAdmin.from('lote_diario').insert(records);
  },

  async buscarGanhoAcumulado(farmId: string): Promise<Record<string, { ganho: number; data: string; confirmado: boolean }>> {
    const { data } = await supabaseAdmin
      .from('lote_diario')
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
      .from('lote_diario')
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
      await supabaseAdmin.from('lote_diario').insert(records);
    }

    // Reseta data_entrada para o dia da confirmação — GMD futuro conta a partir daqui
    if (ids.length > 0) {
      await supabaseAdmin.from('animals').update({ data_entrada: data }).in('id', ids);
    }
  },

  async upsertDiarioByLancamento(
    farmId: string,
    lancamento: {
      pasto_id?:           string;
      pasto_nome:          string;
      suplemento:          string;
      supplement_type_id?: string;  // UUID — join por ID em vez de nome
      data:                string;
      periodo:             number;
      consumo:             number;
    },
  ): Promise<void> {
    const n = (s: string) => s.trim().toUpperCase();

    // 1. Localiza pasto — usa pasto_id direto quando disponível
    let pasto: { id: string; nome: string } | undefined;
    if (lancamento.pasto_id) {
      pasto = { id: lancamento.pasto_id, nome: lancamento.pasto_nome };
    } else {
      const { data: pastos } = await supabaseAdmin
        .from('pastures').select('id, nome').eq('farm_id', farmId);
      pasto = (pastos ?? []).find(p => n(p.nome) === n(lancamento.pasto_nome));
    }
    if (!pasto) return;

    // 2. Resolve meta_pct e gmd — por ID quando disponível, fallback por nome
    const { data: suppTypes } = await supabaseAdmin
      .from('supplement_types')
      .select('id, nome, consumo, gmd_esperado')
      .eq('farm_id', farmId);
    const supp = lancamento.supplement_type_id
      ? (suppTypes ?? []).find(s => s.id === lancamento.supplement_type_id)
      : (suppTypes ?? []).find(s => n(s.nome) === n(lancamento.suplemento));
    let meta_pct_supp: number | null = null;
    let gmd_supp: number | null = null;
    if (supp) {
      if (supp.consumo) {
        const pctStr = META_CONSUMO[supp.consumo as string];
        if (pctStr) meta_pct_supp = parseFloat(pctStr.replace(',', '.').replace('%', ''));
      }
      gmd_supp = supp.gmd_esperado ?? null;
    }

    // 3. Animais ativos no pasto
    const { data: animais } = await supabaseAdmin
      .from('animals')
      .select('id, quantidade, peso_medio, data_entrada, meta_percentagem, gmd')
      .eq('farm_id', farmId)
      .eq('pasto_id', pasto.id)
      .eq('status', 'ativo');
    if (!animais || animais.length === 0) return;

    // 4. Gera lista de datas do período
    const dataFim = new Date(lancamento.data + 'T12:00:00');
    const dates: string[] = [];
    for (let i = lancamento.periodo - 1; i >= 0; i--) {
      const d = new Date(dataFim);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const animalIds = animais.map(a => a.id);

    // 5. Atualiza registros NÃO confirmados com novos dados do suplemento (sem deletar — preserva o histórico)
    for (const a of animais) {
      const effectiveGmd = a.gmd ?? gmd_supp ?? null;
      const effective_meta_pct = a.meta_percentagem ?? meta_pct_supp;
      const fonte_meta_val = a.meta_percentagem != null ? 'manual' : (meta_pct_supp != null ? 'suplemento' : null);
      const meta_kg_cab_val = effective_meta_pct != null && a.peso_medio != null
        ? parseFloat((a.peso_medio * effective_meta_pct / 100).toFixed(4)) : null;
      const meta_kg_total_val = meta_kg_cab_val != null
        ? parseFloat((meta_kg_cab_val * (a.quantidade ?? 1)).toFixed(3)) : null;
      await supabaseAdmin
        .from('lote_diario')
        .update({
          suplemento:     lancamento.suplemento,
          consumo_kg_cab: lancamento.consumo,
          fonte_meta:     fonte_meta_val,
          meta_pct:       effective_meta_pct,
          meta_kg_cab:    meta_kg_cab_val,
          meta_kg_total:  meta_kg_total_val,
          gmd:            effectiveGmd,
        })
        .eq('farm_id', farmId)
        .eq('animal_id', a.id)
        .in('data', dates)
        .eq('confirmado', false);
    }

    // 5b. Atualiza registros confirmados com novo suplemento/gmd/consumo — NÃO toca em meta (acumula só a partir da ativação)
    for (const a of animais) {
      const effectiveGmdConfirm = a.gmd ?? gmd_supp ?? null;
      await supabaseAdmin
        .from('lote_diario')
        .update({
          suplemento:     lancamento.suplemento,
          consumo_kg_cab: lancamento.consumo,
          gmd:            effectiveGmdConfirm,
        })
        .eq('farm_id', farmId)
        .eq('animal_id', a.id)
        .in('data', dates)
        .eq('confirmado', true);
    }

    // 6. Descobre quais datas já têm qualquer registro (confirmado ou não) — não duplicar
    const { data: existentes } = await supabaseAdmin
      .from('lote_diario')
      .select('animal_id, data')
      .eq('farm_id', farmId)
      .in('animal_id', animalIds)
      .in('data', dates);
    const confirmedSet = new Set((existentes ?? []).map((r: { animal_id: string; data: string }) => `${r.animal_id}|${r.data}`));

    // 7. Insere um registro por animal×dia apenas para datas sem confirmado
    const allRecords: object[] = [];
    for (const dayStr of dates) {
      for (const a of animais) {
        if (confirmedSet.has(`${a.id}|${dayStr}`)) continue;
        const effectiveGmd = a.gmd ?? gmd_supp ?? 0;
        const dataRef = a.data_entrada ?? dayStr;
        const dias = Math.max(0, Math.floor(
          (new Date(dayStr + 'T12:00:00').getTime() - new Date(dataRef + 'T12:00:00').getTime()) / 86_400_000,
        ));
        const ganho_acum = parseFloat((effectiveGmd * dias).toFixed(3));
        const peso_estimado = parseFloat(((a.peso_medio ?? 0) + ganho_acum).toFixed(1));

        const effective_meta_pct = a.meta_percentagem ?? meta_pct_supp;
        const fonte_meta = a.meta_percentagem != null ? 'manual' : (meta_pct_supp != null ? 'suplemento' : null);
        const meta_kg_cab = effective_meta_pct != null && a.peso_medio != null
          ? parseFloat((a.peso_medio * effective_meta_pct / 100).toFixed(4))
          : null;
        const meta_kg_total = meta_kg_cab != null
          ? parseFloat((meta_kg_cab * (a.quantidade ?? 1)).toFixed(3))
          : null;

        allRecords.push({
          farm_id: farmId,
          animal_id: a.id,
          data: dayStr,
          pasto_id: pasto.id,
          pasto_nome: pasto.nome,
          suplemento: lancamento.suplemento,
          fonte_meta,
          meta_pct: effective_meta_pct,
          meta_kg_cab,
          meta_kg_total,
          consumo_kg_cab: lancamento.consumo,
          gmd: effectiveGmd || null,
          ganho_dia: effectiveGmd || null,
          ganho_acum,
          peso_estimado,
          confirmado: false,
        });
      }
    }
    if (allRecords.length > 0) {
      await supabaseAdmin.from('lote_diario').insert(allRecords);
    }
  },

  async reprocessarRetroativo(farmId: string): Promise<number> {
    if (!farmId) throw new Error('farmId obrigatório — reprocessamento cancelado');
    const { data, error } = await supabaseAdmin.rpc('upsert_lote_diario_retroativo', { p_farm_id: farmId });
    if (error) throw new Error(error.message);
    return (data as number) ?? 0;
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

  async buscarHistoricoDiario(
    farmId: string,
    options: { animalId?: string; dataInicio?: string; dataFim?: string } = {},
  ): Promise<LoteDiario[]> {
    let q = supabaseAdmin
      .from('lote_diario')
      .select('*')
      .eq('farm_id', farmId)
      .order('data', { ascending: false })
      .order('animal_id', { ascending: true })
      .limit(10000);

    if (options.animalId)   q = q.eq('animal_id', options.animalId);
    if (options.dataInicio) q = q.gte('data', options.dataInicio);
    if (options.dataFim)    q = q.lte('data', options.dataFim);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as LoteDiario[];
  },

  async buscarDatasLancamentos(
    farmId: string,
    options: { pastoNome?: string; dataInicio?: string; dataFim?: string } = {},
  ): Promise<Set<string>> {
    let q = supabaseAdmin
      .from('data_entries')
      .select('data')
      .eq('farm_id', farmId);

    if (options.pastoNome)  q = q.eq('pasto_nome', options.pastoNome);
    if (options.dataInicio) q = q.gte('data', options.dataInicio);
    if (options.dataFim)    q = q.lte('data', options.dataFim);

    const { data } = await q;
    return new Set((data ?? []).map((r: { data: string }) => r.data?.slice(0, 10)));
  },
};
