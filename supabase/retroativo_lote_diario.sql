CREATE OR REPLACE FUNCTION upsert_lote_diario_retroativo(
  p_farm_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_rows integer;
BEGIN
  -- Segurança: nunca processar todas as fazendas de uma vez
  IF p_farm_id IS NULL THEN
    RAISE EXCEPTION 'p_farm_id é obrigatório';
  END IF;

  WITH

  -- Cada lançamento cobre os N dias ANTERIORES à data do lançamento (retroativo)
  -- periodo = número de dias, data = último dia do período
  lancamentos_com_periodo AS (
    SELECT
      de.farm_id,
      de.id,
      de.pasto_nome,
      de.pasto_id,
      de.suplemento,
      de.supplement_type_id,
      de.data::date                             AS data_lancamento,
      de.kg,
      de.quantidade,
      GREATEST(COALESCE(NULLIF(de.periodo::integer, 0), 30), 1) AS periodo_efetivo
    FROM data_entries de
    WHERE de.farm_id = p_farm_id
      AND de.data IS NOT NULL
      AND UPPER(de.suplemento) NOT LIKE '%CREEP%'
  ),

  lancamentos_dias AS (
    SELECT
      lcp.farm_id,
      p.id                 AS pasto_id,
      lcp.pasto_nome,
      lcp.suplemento,
      CASE WHEN COALESCE(lcp.quantidade, 0) > 0
        THEN ROUND((lcp.kg::numeric / lcp.quantidade / lcp.periodo_efetivo), 4)
        ELSE NULL
      END                  AS consumo_kg_cab,
      lcp.data_lancamento,
      gs::date             AS dia,
      st.gmd_esperado,
      st.categoria_simulador,
      p.qualidade_forragem,
      CASE st.consumo
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
      END                  AS meta_pct_supp,
      lcp.kg               AS kg_lancamento,
      lcp.periodo_efetivo
    FROM lancamentos_com_periodo lcp
    JOIN pastures p
      ON  p.farm_id = lcp.farm_id
      AND (
        lcp.pasto_id = p.id
        OR (lcp.pasto_id IS NULL AND UPPER(TRIM(p.nome)) = UPPER(TRIM(lcp.pasto_nome)))
      )
    LEFT JOIN supplement_types st
      ON  st.farm_id = lcp.farm_id
      AND st.id = COALESCE(
            -- 1. UUID exato (preferencial)
            lcp.supplement_type_id,
            -- 2. Nome exato case-insensitive
            (SELECT s.id FROM supplement_types s
             WHERE  s.farm_id = lcp.farm_id
               AND  UPPER(TRIM(s.nome)) = UPPER(TRIM(lcp.suplemento))
             LIMIT 1),
            -- 3. Fuzzy: remove tudo que não for letra/número
            (SELECT s.id FROM supplement_types s
             WHERE  s.farm_id = lcp.farm_id
               AND  REGEXP_REPLACE(UPPER(TRIM(s.nome)), '[^A-Z0-9]', '', 'g') =
                    REGEXP_REPLACE(UPPER(TRIM(lcp.suplemento)), '[^A-Z0-9]', '', 'g')
             LIMIT 1)
          )
    -- Série RETROATIVA: do (data - periodo + 1) até a data do lançamento
    CROSS JOIN LATERAL generate_series(
      lcp.data_lancamento - lcp.periodo_efetivo + 1,
      LEAST(lcp.data_lancamento, CURRENT_DATE),
      '1 day'::interval
    ) AS gs
  ),

  -- Para cada dia, usa o lançamento mais recente que cubra aquele dia
  lancamentos_latest AS (
    SELECT DISTINCT ON (farm_id, pasto_id, dia)
      *
    FROM lancamentos_dias
    ORDER BY farm_id, pasto_id, dia, data_lancamento DESC
  )

  INSERT INTO lote_diario (
    farm_id, animal_id, data, pasto_id, pasto_nome,
    suplemento, fonte_meta, meta_pct, meta_kg_cab, meta_kg_total,
    consumo_kg_cab, gmd, ganho_dia, ganho_acum, peso_estimado, confirmado
  )
  SELECT
    a.farm_id,
    a.id                                                              AS animal_id,
    l.dia                                                             AS data,
    l.pasto_id,
    l.pasto_nome,
    l.suplemento,
    CASE
      WHEN a.meta_percentagem IS NOT NULL THEN 'manual'
      WHEN l.meta_pct_supp    IS NOT NULL THEN 'suplemento'
      ELSE NULL
    END                                                               AS fonte_meta,
    COALESCE(a.meta_percentagem, l.meta_pct_supp)                     AS meta_pct,
    CASE
      WHEN COALESCE(a.meta_percentagem, l.meta_pct_supp) IS NOT NULL
       AND a.peso_medio IS NOT NULL
      THEN ROUND(
             (a.peso_medio * COALESCE(a.meta_percentagem, l.meta_pct_supp) / 100.0
             )::numeric, 4)
    END                                                               AS meta_kg_cab,
    CASE
      WHEN COALESCE(a.meta_percentagem, l.meta_pct_supp) IS NOT NULL
       AND a.peso_medio IS NOT NULL
      THEN ROUND(
             (a.peso_medio * COALESCE(a.meta_percentagem, l.meta_pct_supp) / 100.0
              * COALESCE(a.quantidade, 1))::numeric, 3)
    END                                                               AS meta_kg_total,
    COALESCE(
      l.consumo_kg_cab,
      CASE
        WHEN a.quantidade > 0 AND COALESCE(l.kg_lancamento, 0) > 0
         AND NULLIF(l.periodo_efetivo, 0) IS NOT NULL
        THEN ROUND((l.kg_lancamento::numeric / a.quantidade / l.periodo_efetivo)::numeric, 4)
      END
    )                                                                 AS consumo_kg_cab,
    COALESCE(
      a.gmd,
      CASE UPPER(TRIM(l.qualidade_forragem))
        WHEN 'ÓTIMA'   THEN sp.gmd_otimo
        WHEN 'OTIMA'   THEN sp.gmd_otimo
        WHEN 'BOA'     THEN sp.gmd_bom
        ELSE                sp.gmd_regular
      END,
      l.gmd_esperado
    )                                                                 AS gmd,
    COALESCE(
      a.gmd,
      CASE UPPER(TRIM(l.qualidade_forragem))
        WHEN 'ÓTIMA'   THEN sp.gmd_otimo
        WHEN 'OTIMA'   THEN sp.gmd_otimo
        WHEN 'BOA'     THEN sp.gmd_bom
        ELSE                sp.gmd_regular
      END,
      l.gmd_esperado
    )                                                                 AS ganho_dia,
    CASE
      WHEN COALESCE(
             a.gmd,
             CASE UPPER(TRIM(l.qualidade_forragem))
               WHEN 'ÓTIMA' THEN sp.gmd_otimo
               WHEN 'OTIMA' THEN sp.gmd_otimo
               WHEN 'BOA'   THEN sp.gmd_bom
               ELSE              sp.gmd_regular
             END,
             l.gmd_esperado
           ) IS NOT NULL
       AND a.data_entrada IS NOT NULL
      THEN ROUND(
             (COALESCE(
                a.gmd,
                CASE UPPER(TRIM(l.qualidade_forragem))
                  WHEN 'ÓTIMA' THEN sp.gmd_otimo
                  WHEN 'OTIMA' THEN sp.gmd_otimo
                  WHEN 'BOA'   THEN sp.gmd_bom
                  ELSE              sp.gmd_regular
                END,
                l.gmd_esperado
              ) * GREATEST(0, l.dia - a.data_entrada))::numeric, 3)
      ELSE 0
    END                                                               AS ganho_acum,
    COALESCE(a.peso_medio, 0) + CASE
      WHEN COALESCE(
             a.gmd,
             CASE UPPER(TRIM(l.qualidade_forragem))
               WHEN 'ÓTIMA' THEN sp.gmd_otimo
               WHEN 'OTIMA' THEN sp.gmd_otimo
               WHEN 'BOA'   THEN sp.gmd_bom
               ELSE              sp.gmd_regular
             END,
             l.gmd_esperado
           ) IS NOT NULL
       AND a.data_entrada IS NOT NULL
      THEN ROUND(
             (COALESCE(
                a.gmd,
                CASE UPPER(TRIM(l.qualidade_forragem))
                  WHEN 'ÓTIMA' THEN sp.gmd_otimo
                  WHEN 'OTIMA' THEN sp.gmd_otimo
                  WHEN 'BOA'   THEN sp.gmd_bom
                  ELSE              sp.gmd_regular
                END,
                l.gmd_esperado
              ) * GREATEST(0, l.dia - a.data_entrada))::numeric, 1)
      ELSE 0
    END                                                               AS peso_estimado,
    false                                                             AS confirmado
  FROM lancamentos_latest l
  JOIN animals a
    ON  a.farm_id  = l.farm_id
    AND a.pasto_id = l.pasto_id
    AND (a.status = 'ativo' OR a.status IS NULL)
  LEFT JOIN simulador_parametros sp
    ON  UPPER(TRIM(sp.categoria)) = UPPER(TRIM(l.categoria_simulador))
    AND sp.epoca = CASE
      WHEN EXTRACT(MONTH FROM l.dia) BETWEEN 7 AND 10 THEN 'seca'
      WHEN EXTRACT(MONTH FROM l.dia) IN (11, 12, 1, 2) THEN 'aguas'
      ELSE 'transicao'
    END

  ON CONFLICT (farm_id, animal_id, data)
  DO UPDATE SET
    suplemento     = EXCLUDED.suplemento,
    fonte_meta     = EXCLUDED.fonte_meta,
    meta_pct       = EXCLUDED.meta_pct,
    meta_kg_cab    = EXCLUDED.meta_kg_cab,
    meta_kg_total  = EXCLUDED.meta_kg_total,
    consumo_kg_cab = EXCLUDED.consumo_kg_cab,
    gmd            = EXCLUDED.gmd,
    ganho_dia      = EXCLUDED.ganho_dia,
    ganho_acum     = EXCLUDED.ganho_acum,
    peso_estimado  = EXCLUDED.peso_estimado
  WHERE NOT lote_diario.confirmado;

  GET DIAGNOSTICS total_rows = ROW_COUNT;
  RETURN total_rows;
END;
$$;
