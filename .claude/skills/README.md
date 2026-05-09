# Skills do Projeto — Suplemento Control (v1.27b)

> Arquivos funcionais (slash commands) em `.claude/commands/`.
> Referências técnicas em `.claude/skills/suplemento-control/`.

---

## Skills Disponíveis

| Comando | Arquivo | O que faz |
|---------|---------|-----------|
| `/padrao` | `commands/padrao.md` | Guardião do design — audita cores e tokens em todas as páginas |
| `/relatorio` | `commands/relatorio.md` | Guardião do Relatório — filtros, KPIs, gráficos, PDF, META |
| `/manejos` | `commands/manejos.md` | Guardião do módulo Manejos — abas, fluxos, bezerros, PDF |
| `/qa` | `commands/qa.md` | QA completo: build, TS, fluxos críticos, UX, rotas |
| `/build` | `commands/build.md` | Roda `npm run build` e reporta erros TypeScript |
| `/checkpoint` | `commands/checkpoint.md` | Cria checkpoint estável: build + testes + git tag + push |
| `/versionar` | `commands/versionar.md` | Snapshot de versão: CHANGELOG + TASKS + package.json |
| `/upgrade` | `commands/upgrade.md` | Workflow seguro para melhorias sem quebrar o design |
| `/guardar` | `commands/guardar.md` | Snapshot do estado atual antes de alterações grandes |
| `/organizar` | `commands/organizar.md` | Organiza todos os arquivos .md do projeto |
| `/backup` | `commands/backup.md` | Backup do código (git) e banco (Supabase) |
| `/validar-dados` | `commands/validar-dados.md` | Valida SQL, RLS e segurança no Supabase |
| `/verificar-login` | `commands/verificar-login.md` | Auditoria do fluxo de auth (AuthContext, ProtectedRoute) |
| `/analisar` | `commands/analisar.md` | Propõe melhorias futuras priorizadas |
| `/mp-checklist` | `commands/mp-checklist.md` | Processa PDFs de ajustes do cliente |
| `/auditoria-saas` | `commands/auditoria-saas.md` | Auditoria técnica completa: 13 dimensões |
| `/commit` | `~/.claude/commands/commit.md` | Commit com assinatura HicaroDev + Claude *(global)* |

---

## Fluxo Recomendado

```
Antes de melhoria grande:    /guardar → /upgrade
Após implementar:            /qa → /padrao → /relatorio (se afetou)
Ao finalizar versão:         /versionar → /checkpoint → /commit
Ao receber PDF do cliente:   /mp-checklist
Periodicamente:              /validar-dados → /organizar → /analisar
```

---

## Referências Técnicas

| Arquivo | Conteúdo |
|---------|---------|
| `suplemento-control/SKILL.md` | Stack, tokens, módulos, arquitetura |
| `suplemento-control/references/database-schema.md` | Schema SQL completo v1.27b |
| `suplemento-control/references/component-patterns.md` | Padrões React, contextos, PDF |
| `suplemento-control/references/client-requirements.md` | Briefing e decisões de produto |