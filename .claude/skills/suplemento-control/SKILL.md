---
name: suplemento-control
description: Build and maintain the Suplemento Control SaaS — livestock supplement management for Brazilian farms. Stack: React 18 + Vite 6 + TypeScript + Tailwind CSS v4 + Supabase self-hosted.
---

# Suplemento Control — Project Skill (v1.27b)

## Stack
- React 18.3 + TypeScript 5.5 + Vite 6 + Tailwind CSS v4
- React Router 7 + Recharts 2 + React Hook Form + Sonner
- Supabase self-hosted (EasyPanel) — PostgreSQL + Auth + PostgREST
- Docker multi-stage + nginx

## Design Tokens (NUNCA alterar sem aprovação)
| Token | Valor | Uso |
|-------|-------|-----|
| Brand green | `#1a6040` | Cor principal |
| Navy | `#0b2748` | Mineral Adensado Aguas |
| Purple | `#6b2fa0` | Racao Creep |
| Teal override | `teal-600 = #1a6040` | `@theme` no index.css |
| Sidebar | `#1a1f2e → #2d3548` | Gradiente |
| Bezerros | `orange-*` | Destaque laranja |
| Média gráfico | `#e53e3e` | Linha vermelha tracejada |

## Módulos
relatorio(/) | formulario | manejos | cadastros | pastos | fazendas | usuarios | historico | simulador | estoque(admin) | os(admin) | caixa(admin)

## Cálculos
- consumo_kg_cab_dia = kg / (quantidade × periodo)
- kg = sacos × peso_saco (auto-calc)
- meta_kg = peso_medio × (meta_pct / 100)

## Comandos
```bash
npm run dev    # porta 5173+
npm run build  # vitest + tsc + vite build
npm run test   # apenas vitest (50 testes)
```

## Referências
- references/database-schema.md — Schema SQL v1.27b
- references/component-patterns.md — Padrões React atuais
- references/client-requirements.md — Briefing e decisões