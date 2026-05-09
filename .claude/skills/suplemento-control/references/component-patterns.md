# Component Patterns — Suplemento Control (v1.27b)

## Contextos
```typescript
const { user, isAdmin, hasModule, login, logout } = useAuth();
const { entries, pastures, activeFarmId, loading } = useData();
```

## Guards de Rota
```tsx
<ProtectedRoute>        // apenas auth
<ModuleRoute module="estoque">  // auth + módulo habilitado
```

## Padrões de Layout
- Header: text-3xl font-bold + botão teal-600
- Card: bg-white rounded-2xl shadow-sm border border-gray-100 p-6
- SEM hero banners nas páginas

## Gráficos (NUNCA adicionar LabelList)
```tsx
<Bar dataKey="value" fill="#1a6040" radius={[3,3,0,0]} />
<ReferenceLine y={media} stroke="#e53e3e" strokeDasharray="6 3" />
```

## PDF/Print
Classes: .pdf-brand-bar | .pdf-table | .pdf-badge-{green,blue,purple,orange}

## Toast
```typescript
toast.success('OK'); toast.error('Erro'); toast.loading('...');
```

## Formatação
```typescript
fmt(0.748)   // "0,748"
fmtInt(1200) // "1200"
```