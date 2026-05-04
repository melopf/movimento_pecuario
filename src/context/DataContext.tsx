/* @refresh reset */
import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import type { DataEntry } from '../lib/data';
import { sampleRows } from '../lib/data';
import { useAuth } from './AuthContext';
import { farmService } from '../services/farmService';
import { supabaseAdmin } from '../lib/supabase';
import type { Farm } from '../types/farm';

/* ── Types ── */

export interface Pasture {
  id: string;
  nome: string;
  area?: number;
  observacoes?: string;
  retiro_id?: string;
  forragem?: string;
  qualidade_forragem?: string;
  suplemento_sugerido?: string;
}

export type ClientInfo = Farm;

/* ── Helpers de mapeamento ── */

function toDataEntry(row: Record<string, unknown>): DataEntry {
  return {
    id:          row.id as string,
    data:        row.data as string,
    pasto:       (row.pasto_nome as string) ?? '',
    quantidade:  row.quantidade as number,
    tipo:        row.suplemento as string,
    periodo:     row.periodo as number,
    sacos:       (row.sacos as number) ?? 0,
    kg:          row.kg as number,
    consumo:     row.consumo as number,
    funcionario: (row.funcionario as string) ?? undefined,
    lote:        (row.lote as string) ?? undefined,
  };
}

function toPasture(row: Record<string, unknown>): Pasture {
  return {
    id:                  row.id as string,
    nome:                row.nome as string,
    area:                (row.area as number) ?? undefined,
    observacoes:          (row.observacoes as string) ?? undefined,
    retiro_id:            (row.retiro_id as string) ?? undefined,
    forragem:             (row.forragem as string) ?? undefined,
    qualidade_forragem:   (row.qualidade_forragem as string) ?? undefined,
    suplemento_sugerido:  (row.suplemento_sugerido as string) ?? undefined,
  };
}

/* ── Context type ── */

interface DataContextType {
  activeFarmId: string;
  selectFarm: (farmId: string) => void;
  loading: boolean;
  entries: DataEntry[];
  addEntry: (entry: DataEntry) => void;
  updateEntry: (id: string, patch: Partial<DataEntry>) => void;
  removeEntry: (index: number) => void;
  clearAll: () => void;
  loadSample: () => void;
  clientInfo: ClientInfo | null;
  updateClientInfo: (info: ClientInfo) => void;
  pastures: Pasture[];
  addPasture: (pasture: Omit<Pasture, 'id'>) => void;
  deletePasture: (id: string) => Promise<void>;
  updatePasture: (id: string, data: Partial<Pasture>) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const fallbackContext: DataContextType = {
  activeFarmId: '',
  selectFarm: () => {},
  loading: true,
  entries: [],
  addEntry: () => {},
  updateEntry: () => {},
  removeEntry: () => {},
  clearAll: () => {},
  loadSample: () => {},
  clientInfo: null,
  updateClientInfo: () => {},
  pastures: [],
  addPasture: () => {},
  deletePasture: async () => {},
  updatePasture: async () => {},
};

/* ── Provider ── */

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();

  const [activeFarmId, setActiveFarmId] = useState<string>('');
  const [loading,      setLoading]      = useState(true);
  const [entries,      setEntries]      = useState<DataEntry[]>([]);
  const [pastures,     setPastures]     = useState<Pasture[]>([]);
  const [clientInfo,   setClientInfo]   = useState<ClientInfo | null>(null);
  const [refreshTick,  setRefreshTick]  = useState(0);
  const pendingDeletesRef  = useRef<Set<string>>(new Set());
  const pendingUpdatesRef  = useRef<Map<string, Partial<DataEntry>>>(new Map());

  /* Determina a fazenda ativa ao logar */
  useEffect(() => {
    if (!user) { setActiveFarmId(''); return; }

    // Cliente: determina fazenda ativa
    if (!isAdmin) {
      const farmIds = user.farmIds ?? [];
      if (farmIds.length > 1) {
        // Multi-fazenda: restaura seleção salva ou usa a primeira
        const key   = `suplementoControlClientFarm_${user.id}`;
        const saved = localStorage.getItem(key);
        const active = saved && farmIds.includes(saved) ? saved : farmIds[0] ?? '';
        setActiveFarmId(prev => prev === active ? prev : active);
      } else {
        const active = farmIds[0] ?? user.farmId ?? '';
        setActiveFarmId(prev => prev === active ? prev : active);
      }
      return;
    }

    // Admin: restaura da sessão ou auto-seleciona a primeira fazenda
    const saved = localStorage.getItem('suplementoControlActiveFarm');
    if (saved) {
      // Só atualiza se realmente mudou
      setActiveFarmId(prev => (prev === saved ? prev : saved));
    } else {
      farmService.list().then(farms => {
        if (farms.length > 0) {
          setActiveFarmId(prev => {
            if (prev === farms[0].id) return prev;
            localStorage.setItem('suplementoControlActiveFarm', farms[0].id);
            return farms[0].id;
          });
        } else {
          setLoading(false); // Admin sem fazendas cadastradas
        }
      });
    }
  }, [user?.id, user?.farmId, user?.farmIds?.join(','), isAdmin]);

  /* Recarrega quando o tab volta ao foco após 5s+ de inatividade */
  const hiddenAtRef = useRef<number | null>(null);
  useEffect(() => {
    const THRESHOLD = 5_000; // recarrega se ficou oculto 5+ segundos

    function maybeRefresh() {
      if (!activeFarmId) return;
      const elapsed = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : Infinity;
      if (elapsed > THRESHOLD) {
        hiddenAtRef.current = null;
        setRefreshTick(t => t + 1);
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        maybeRefresh();
      }
    };

    // focus cobre casos onde visibilitychange não dispara (ex: alt+tab em alguns OS)
    const onFocus = () => {
      if (hiddenAtRef.current === null) hiddenAtRef.current = 0; // marca como "estava fora"
      maybeRefresh();
    };

    // online: reconecta após queda de rede — sempre recarrega
    const onOnline = () => {
      if (activeFarmId) setRefreshTick(t => t + 1);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [activeFarmId]);

  /* Carrega dados quando a fazenda muda ou ao voltar ao foco */
  const prevFarmRef = useRef<string>('');
  useEffect(() => {
    const farmChanged = prevFarmRef.current !== activeFarmId;
    prevFarmRef.current = activeFarmId;

    if (!activeFarmId) {
      setEntries([]); setPastures([]); setClientInfo(null);
      // Libera loading só quando definitivamente não há fazenda para carregar.
      // Enquanto user ainda não carregou (null), mantém loading=true para não
      // piscar estado vazio antes do skeleton aparecer.
      if (user && !isAdmin && !user.farmId && !user.farmIds?.length) setLoading(false);
      return;
    }

    // Só limpa os dados e mostra skeleton quando a FAZENDA mudou (primeira carga ou troca).
    // Em refresh de background (refreshTick), mantém dados visíveis enquanto recarrega silenciosamente.
    if (farmChanged) {
      setEntries([]); setPastures([]); setClientInfo(null);
      setLoading(true);
    }
    let cancelled = false;

    // Timeout de segurança — libera o skeleton se o servidor demorar mais de 20s
    // (ex: aba nova com servidor frio ou rede lenta)
    const timeoutId = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 20_000);

    Promise.all([
      supabaseAdmin.from('data_entries').select('*').eq('farm_id', activeFarmId).order('data', { ascending: false }).limit(5000),
      supabaseAdmin.from('pastures').select('*').eq('farm_id', activeFarmId).order('nome'),
      farmService.findById(activeFarmId),
    ]).then(([entriesRes, pasturesRes, farm]) => {
      if (cancelled) return;
      if (!entriesRes.error) setEntries(
        (entriesRes.data ?? [])
          .map(toDataEntry)
          .filter(e => !pendingDeletesRef.current.has(e.id ?? ''))
          .map(e => {
            const pending = pendingUpdatesRef.current.get(e.id!);
            return pending ? { ...e, ...pending } : e;
          })
      );
      if (!pasturesRes.error) setPastures(
        (pasturesRes.data ?? []).map(toPasture).filter(p => !pendingDeletesRef.current.has(p.id))
      );
      if (farm) setClientInfo(farm);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setLoading(false);
    }).finally(() => {
      clearTimeout(timeoutId);
    });

    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [activeFarmId, refreshTick]);

  function selectFarm(farmId: string) {
    setActiveFarmId(farmId);
    if (isAdmin) {
      localStorage.setItem('suplementoControlActiveFarm', farmId);
    } else if (user?.farmIds?.includes(farmId)) {
      localStorage.setItem(`suplementoControlClientFarm_${user.id}`, farmId);
    }
  }

  function updateClientInfo(info: ClientInfo) {
    if (!activeFarmId) return;
    farmService.update(activeFarmId, info).then(updated => setClientInfo(updated));
  }

  /* ── Entries ── */
  function addEntry(entry: DataEntry) {
    const tempId = `temp-${Date.now()}`;
    setEntries(prev => [...prev, { ...entry, id: tempId }]);
    supabaseAdmin.from('data_entries').insert({
      farm_id:     activeFarmId,
      data:        entry.data || new Date().toISOString().split('T')[0],
      pasto_nome:  entry.pasto,
      suplemento:  entry.tipo,
      quantidade:  entry.quantidade,
      periodo:     entry.periodo,
      sacos:       entry.sacos,
      kg:          entry.kg,
      consumo:     entry.consumo,
      ...(entry.funcionario ? { funcionario: entry.funcionario } : {}),
      ...(entry.lote        ? { lote:        entry.lote }        : {}),
    }).select().single().then(({ data, error }) => {
      if (data) setEntries(prev => prev.map(e => e.id === tempId ? toDataEntry(data) : e));
      if (error) setEntries(prev => prev.filter(e => e.id !== tempId));
    });
  }

  function updateEntry(id: string, patch: Partial<DataEntry>) {
    // Atualiza estado local imediatamente (optimistic)
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
    // Protege contra sobrescrita por refreshes de background
    pendingUpdatesRef.current.set(id, {
      ...(pendingUpdatesRef.current.get(id) ?? {}),
      ...patch,
    });
    supabaseAdmin.from('data_entries').update({
      ...(patch.pasto      !== undefined && { pasto_nome: patch.pasto }),
      ...(patch.data       !== undefined && { data:       patch.data }),
      ...(patch.tipo       !== undefined && { suplemento: patch.tipo }),
      ...(patch.quantidade !== undefined && { quantidade: patch.quantidade }),
      ...(patch.sacos      !== undefined && { sacos:      patch.sacos }),
      ...(patch.kg         !== undefined && { kg:         patch.kg }),
    }).eq('id', id).then(() => {
      pendingUpdatesRef.current.delete(id);
    });
  }

  function removeEntry(index: number) {
    const entry = entries[index];
    if (!entry) return;
    if (entry.id && !entry.id.startsWith('temp-')) {
      pendingDeletesRef.current.add(entry.id);
      supabaseAdmin.from('data_entries').delete().eq('id', entry.id).then(() => {
        pendingDeletesRef.current.delete(entry.id!);
      });
    }
    setEntries(prev => prev.filter((_, i) => i !== index));
  }

  function clearAll() {
    // Marca todos os IDs no pendingDeletesRef para que um refresh simultâneo não restaure os dados
    const ids = entries.filter(e => e.id && !e.id.startsWith('temp-')).map(e => e.id!);
    ids.forEach(id => pendingDeletesRef.current.add(id));
    setEntries([]);
    if (activeFarmId) {
      supabaseAdmin.from('data_entries').delete().eq('farm_id', activeFarmId).then(() => {
        ids.forEach(id => pendingDeletesRef.current.delete(id));
      });
    }
  }

  function loadSample() {
    const today = new Date().toISOString().split('T')[0];
    const rows = sampleRows.map(r => ({
      farm_id: activeFarmId, data: today,
      pasto_nome: r.pasto, suplemento: r.tipo,
      quantidade: r.quantidade, periodo: r.periodo,
      sacos: r.sacos, kg: r.kg, consumo: r.consumo,
    }));
    setEntries(sampleRows.map((r, i) => ({ ...r, id: `temp-sample-${i}` })));
    supabaseAdmin.from('data_entries').insert(rows).select().then(({ data }) => {
      if (data) setEntries(data.map(toDataEntry));
    });
  }

  /* ── Pastures ── */
  function addPasture(p: Omit<Pasture, 'id'>) {
    const tempId = `temp-${Date.now()}`;
    setPastures(prev => [...prev, { ...p, id: tempId }].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
    supabaseAdmin.from('pastures').insert({
      farm_id: activeFarmId, nome: p.nome,
      area: (p.area != null && p.area > 0) ? p.area : null, observacoes: p.observacoes ?? null,
      retiro_id: p.retiro_id ?? null,
      // só inclui as colunas novas se tiverem valor — evita erro se SQL ainda não foi rodado
      ...(p.forragem            ? { forragem:            p.forragem }            : {}),
      ...(p.qualidade_forragem  ? { qualidade_forragem:  p.qualidade_forragem }  : {}),
      ...(p.suplemento_sugerido ? { suplemento_sugerido: p.suplemento_sugerido } : {}),
    }).select().single().then(({ data, error }) => {
      if (data) setPastures(prev => prev.map(x => x.id === tempId ? toPasture(data) : x));
      if (error) {
        console.error('[addPasture] erro Supabase:', error.message);
        setPastures(prev => prev.filter(x => x.id !== tempId));
      }
    });
  }

  async function deletePasture(id: string) {
    pendingDeletesRef.current.add(id);
    try {
      const { error } = await supabaseAdmin.from('pastures').delete().eq('id', id);
      if (error) throw error;
      setPastures(prev => prev.filter(p => p.id !== id));
    } finally {
      pendingDeletesRef.current.delete(id);
    }
  }

  async function updatePasture(id: string, patch: Partial<Pasture>): Promise<void> {
    // Atualiza estado local imediatamente (optimistic)
    const statePatch: Partial<Pasture> = { ...patch };
    if ('area' in statePatch) {
      const a = statePatch.area;
      if (a == null || typeof a !== 'number' || isNaN(a) || a <= 0) delete statePatch.area;
    }
    setPastures(prev => prev.map(p => p.id === id ? { ...p, ...statePatch } : p));

    // Payload base — sempre incluído
    const payload: Record<string, unknown> = {
      ...(patch.nome        !== undefined && { nome:        patch.nome }),
      ...('area' in patch   && { area: (typeof patch.area === 'number' && !isNaN(patch.area) && patch.area > 0) ? patch.area : null }),
      ...(patch.observacoes !== undefined && { observacoes: patch.observacoes ?? null }),
      ...(patch.retiro_id   !== undefined && { retiro_id:   patch.retiro_id ?? null }),
    };

    // Tenta salvar com forragem + qualidade; se falhar (coluna não existe), salva sem elas
    const payloadFull = {
      ...payload,
      ...(patch.forragem            !== undefined && { forragem:            patch.forragem ?? null }),
      ...(patch.qualidade_forragem  !== undefined && { qualidade_forragem:  patch.qualidade_forragem ?? null }),
      ...(patch.suplemento_sugerido !== undefined && { suplemento_sugerido: patch.suplemento_sugerido ?? null }),
    };

    const { error } = await supabaseAdmin.from('pastures').update(payloadFull).eq('id', id);
    if (error) {
      // fallback: tenta sem as colunas novas (caso ainda não existam no banco)
      const { error: err2 } = await supabaseAdmin.from('pastures').update(payload).eq('id', id);
      if (err2) throw new Error(err2.message);
    }
  }

  return (
    <DataContext.Provider value={{
      activeFarmId, selectFarm,
      loading,
      entries, addEntry, updateEntry, removeEntry, clearAll, loadSample,
      clientInfo, updateClientInfo,
      pastures, addPasture, deletePasture, updatePasture,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextType {
  const ctx = useContext(DataContext);
  if (!ctx) {
    if (typeof window !== 'undefined') {
      console.warn('useData called without DataProvider');
    }
    return fallbackContext;
  }
  return ctx;
}
