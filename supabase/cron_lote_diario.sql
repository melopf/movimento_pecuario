-- ══════════════════════════════════════════════════════════════
-- Cron automático: popula lote_diario todo dia às 23:00
-- Cobre HOJE + retroativo completo por fazenda (sem botão manual)
-- Execute no Supabase SQL Editor para registrar o agendamento
-- ══════════════════════════════════════════════════════════════

-- 1. Função wrapper: itera por todas as fazendas ativas e chama o retroativo
CREATE OR REPLACE FUNCTION auto_populate_lote_diario()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT id FROM farms WHERE active = true OR active IS NULL
  LOOP
    BEGIN
      PERFORM upsert_lote_diario_retroativo(rec.id);
    EXCEPTION WHEN OTHERS THEN
      -- Loga e continua para as outras fazendas
      RAISE WARNING 'Erro ao processar fazenda %: %', rec.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. Função legada (mantida para compatibilidade — cobre só hoje)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_lote_diario_hoje()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today date := CURRENT_DATE;
BEGIN
  DELETE FROM lote_diario
  WHERE data = today AND confirmado = false;

  INSERT INTO lote_diario (
    farm_id, animal_id, data, pasto_id, pasto_nome,
    suplemento, fonte_meta, meta_pct, meta_kg_cab, meta_kg_total,
    consumo_kg_cab, gmd, ganho_dia, ganho_acum, peso_estimado, confirmado
  )
  SELECT
    a.farm_id,
    a.id                                                            AS animal_id,
    today                                                           AS data,
    a.pasto_id,
    p.nome                                                          AS pasto_nome,
    ls.suplemento,
    CASE
      WHEN a.meta_percentagem IS NOT NULL THEN 'manual'
      WHEN mp.meta_pct        IS NOT NULL THEN 'suplemento'
      ELSE NULL
    END                                                             AS fonte_meta,
    COALESCE(a.meta_percentagem, mp.meta_pct)                       AS meta_pct,
    CASE
      WHEN COALESCE(a.meta_percentagem, mp.meta_pct) IS NOT NULL
       AND a.peso_medio IS NOT NULL
      THEN ROUND(
             (a.peso_medio * COALESCE(a.meta_percentagem, mp.meta_pct) / 100.0)::numeric, 4)
    END                                                             AS meta_kg_cab,
    CASE
      WHEN COALESCE(a.meta_percentagem, mp.meta_pct) IS NOT NULL
       AND a.peso_medio IS NOT NULL
      THEN ROUND(
             (a.peso_medio * COALESCE(a.meta_percentagem, mp.meta_pct) / 100.0
              * COALESCE(a.quantidade, 1))::numeric, 3)
    END                                                             AS meta_kg_total,
    CASE WHEN COALESCE(ls.quantidade, 0) > 0
      THEN ROUND((ls.kg::numeric / ls.quantidade), 4)
      ELSE NULL
    END                                                             AS consumo_kg_cab,
    COALESCE(a.gmd, st.gmd_esperado)                                AS gmd,
    COALESCE(a.gmd, st.gmd_esperado)                                AS ganho_dia,
    CASE
      WHEN COALESCE(a.gmd, st.gmd_esperado) IS NOT NULL
       AND a.data_entrada IS NOT NULL
      THEN ROUND(
             (COALESCE(a.gmd, st.gmd_esperado)
              * GREATEST(0, today - a.data_entrada))::numeric, 3)
      ELSE 0
    END                                                             AS ganho_acum,
    COALESCE(a.peso_medio, 0) + CASE
      WHEN COALESCE(a.gmd, st.gmd_esperado) IS NOT NULL
       AND a.data_entrada IS NOT NULL
      THEN ROUND(
             (COALESCE(a.gmd, st.gmd_esperado)
              * GREATEST(0, today - a.data_entrada))::numeric, 1)
      ELSE 0
    END                                                             AS peso_estimado,
    false                                                           AS confirmado
  FROM animals a
  JOIN pastures p ON p.id = a.pasto_id
  LEFT JOIN LATERAL (
    SELECT de.suplemento, de.kg, de.quantidade
    FROM data_entries de
    WHERE de.farm_id = a.farm_id
      AND (
        de.pasto_id = a.pasto_id
        OR (de.pasto_id IS NULL AND UPPER(TRIM(de.pasto_nome)) = UPPER(TRIM(p.nome)))
      )
      AND UPPER(de.suplemento) NOT LIKE '%CREEP%'
    ORDER BY de.data DESC, de.created_at DESC
    LIMIT 1
  ) ls ON true
  LEFT JOIN supplement_types st
    ON  st.farm_id = a.farm_id
    AND UPPER(TRIM(st.nome)) = UPPER(TRIM(ls.suplemento))
  LEFT JOIN LATERAL (
    SELECT CASE st.consumo
      WHEN '20 A 30 GRAMAS/100 KG PV'   THEN 0.030
      WHEN '35 A 45 GRAMAS/100 KG PV'   THEN 0.040
      WHEN '50 A 100 GRAMAS/100 KG PV'  THEN 0.060
      WHEN '100 A 120 GRAMAS/100 KG PV' THEN 0.110
      WHEN '200 A 300 GRAMAS/100 KG PV' THEN 0.250
      WHEN '300 A 400 GRAMAS/100 KG PV' THEN 0.350
      WHEN '500 A 700 GRAMAS/100 KG PV' THEN 0.600
      WHEN '1,0 A 1,50% PV'             THEN 1.300
      WHEN '1,50 A 2,30% PV'            THEN 2.000
      ELSE NULL
    END AS meta_pct
  ) mp ON true
  WHERE (a.status = 'ativo' OR a.status IS NULL)
    AND a.pasto_id IS NOT NULL
    AND (
      COALESCE(a.gmd, st.gmd_esperado) IS NOT NULL
      OR COALESCE(a.meta_percentagem, mp.meta_pct) IS NOT NULL
    )
  ON CONFLICT (farm_id, animal_id, data) DO NOTHING;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. Agendamento: retroativo completo todo dia às 23:00
-- ──────────────────────────────────────────────────────────────
SELECT cron.unschedule('upsert-lote-diario-23h');

SELECT cron.schedule(
  'upsert-lote-diario-23h',
  '0 23 * * *',
  'SELECT auto_populate_lote_diario()'
);

SELECT jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'upsert-lote-diario-23h';
