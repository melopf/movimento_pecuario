-- ══════════════════════════════════════════════════════════════
-- Migração: supplement_type_id em data_entries
-- Vínculo por UUID — resistente a renomeação de suplementos
-- Execute no EasyPanel SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Adiciona a coluna (idempotente)
ALTER TABLE data_entries
  ADD COLUMN IF NOT EXISTS supplement_type_id uuid
  REFERENCES supplement_types(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- 2. Backfill: preenche pelo nome atual (case-insensitive)
UPDATE data_entries de
SET supplement_type_id = st.id
FROM supplement_types st
WHERE st.farm_id = de.farm_id
  AND UPPER(TRIM(st.nome)) = UPPER(TRIM(de.suplemento))
  AND de.supplement_type_id IS NULL;

-- 3. Confere resultado
SELECT
  COUNT(*)                                          AS total,
  COUNT(supplement_type_id)                         AS com_id,
  COUNT(*) - COUNT(supplement_type_id)              AS sem_id
FROM data_entries;
