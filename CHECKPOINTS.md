# Checkpoints — Suplemento Control

> Use `/checkpoint` para criar um novo checkpoint após confirmar que build e testes estão OK.
> Em caso de regressão: `git checkout v<versão>` restaura o estado estável.

---

## Checkpoints Estáveis

| Versão | Data | Build | Testes | Módulos Confirmados |
|--------|------|-------|--------|---------------------|
| v1.27b | 2026-05-06 | ✅ OK | ✅ 50/50 | Relatório, Formulário, Manejos, Estoque, OS, Livro Caixa, Solicitações, Cadastros, Pastos (+ Cat.Suple + Histórico), Fazendas, Usuários |

---

## Como Usar

### Criar checkpoint
```
/checkpoint
```

### Ver todos os checkpoints
```bash
git tag -l "v*" --sort=-version:refname
```

### Restaurar uma versão estável
```bash
git checkout v1.27b
```

### Voltar para o HEAD
```bash
git checkout main
```