# Database Schema — Suplemento Control (v1.27b)
> Supabase self-hosted — https://saas-supabase.bj3amt.easypanel.host

## Tabelas Principais
profiles | farms | pastures | data_entries | animals | supplement_types | animal_categories | employees | manejo_historico | estoque_movimentos | ordens_suplemento | ordens_suplemento_itens | livro_caixa | solicitacoes_compra

## RLS
Todas as tabelas têm RLS. Função: `user_farm_ids()` retorna farm_ids[] do usuário autenticado.

## RPCs
- `confirmar_execucao_os(p_os_id, p_farm_id, p_user_id, p_data_exec)` — transação atômica
- `generate_os_numero(p_farm_id)` — numeração OS-YYYY-NNN

## Ordem de Migrations
1. schema.sql → 2. ajustes_v116b.sql → 3. ajuste_categorias_mp12.sql
4. ajuste_mp13_v123.sql → 5. ajuste_mp29.sql → 6. estoque_v100.sql
7. os_v100.sql → 8. caixa_v100.sql → 9. solicitacoes_v100.sql
10. rls_auditoria_v200.sql → 11. rpc_confirmar_os_v100.sql

## Usuários de Teste
admin@suplemento.com / admin123 | cliente@malhada.com / malhada123
Farm ID: 10000000-0000-4000-8000-000000000001