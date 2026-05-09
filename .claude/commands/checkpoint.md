# /checkpoint — Criar Checkpoint de Versão Estável

Você é o guardião de qualidade do projeto Suplemento Control.
Ao executar `/checkpoint`, siga este fluxo rigorosamente.

---

## FASE 1 — Verificação de Build

```bash
cd suplemento-control
npm run build
```

O comando já executa: `vitest run && tsc -b && vite build`

- Se **falhar**: reporte os erros e **pare aqui**. Nunca crie checkpoint com build quebrado.
- Se **passar**: continue para a Fase 2.

---

## FASE 2 — Verificação do Estado Git

```bash
git status
git log --oneline -5
```

- Liste arquivos modificados não commitados
- Mostre os últimos 5 commits para contexto

---

## FASE 3 — Identificar a Versão

```bash
cat package.json | grep '"version"'
```

A versão do checkpoint será exatamente essa (ex: `1.27.2`).

---

## FASE 4 — Criar Git Tag

```bash
git tag -a "v<versão>" -m "Checkpoint v<versão> — build OK, testes OK"
```

---

## FASE 5 — Atualizar CHECKPOINTS.md

Adicione uma nova entrada no topo da tabela:

```markdown
| v<versão> | <data YYYY-MM-DD> | ✅ Build OK | ✅ Testes OK | <módulos confirmados> |
```

---

## FASE 6 — Commit + Push

```bash
git add CHECKPOINTS.md
git commit -m "chore: checkpoint v<versão> — build + testes OK

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
Built by HicaroDev with Claude Code — github.com/HicaroDev"

git push origin main
git push origin --tags
```

---

## FASE 7 — Relatório Final

```
✅ CHECKPOINT v<versão> CRIADO

📦 Build:    OK
🧪 Testes:   X passed
🏷️  Tag git:  v<versão>
📝 CHECKPOINTS.md: atualizado
🚀 Push:     origin/main + tags
```

---

## REGRAS

- Nunca crie checkpoint com build quebrado
- Nunca crie checkpoint com testes falhando
- Em caso de regressão: `git checkout v<versão>` restaura o estado estável