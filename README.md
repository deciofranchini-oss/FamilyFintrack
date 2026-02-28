# Controle Financeiro do Décio — v2.0

Aplicativo PWA de gerenciamento financeiro pessoal com backend Supabase.

## Arquivos

| Arquivo | Descrição |
|---|---|
| `index.html` | Aplicativo completo (HTML + CSS + JS, single-file) |
| `supabase_schema.sql` | Script SQL para criar o banco no Supabase |
| `manifest.json` | Manifesto PWA para instalação como app |
| `sw.js` | Service Worker — cache offline |
| `icon.svg` | Ícone vetorial |
| `icon-192.png` | Ícone 192×192 px (Android/PWA) |
| `icon-512.png` | Ícone 512×512 px (splash screen) |

## Configuração inicial

### 1. Criar banco no Supabase
1. Acesse [supabase.com](https://supabase.com) e crie um projeto
2. Vá em **SQL Editor** e execute o conteúdo de `supabase_schema.sql`
3. Anote a **Project URL** e a **anon public key** (em Project Settings → API)

### 2. Usar o app
1. Abra `index.html` em qualquer servidor HTTP (ou sirva localmente)
2. Na tela de lock, clique em **"⚙️ Configurar Supabase"**
3. Cole a Project URL e a Anon Key → clique **Conectar e Salvar**
4. Digite o PIN padrão: **191291**

### Servidor local (recomendado para PWA)
```bash
# Python 3
python3 -m http.server 8080

# Node.js
npx serve .
```

## Funcionalidades v2.0

- 🔒 **Lock screen** com PIN + setup Supabase integrado
- ☁️ **Backend Supabase** — dados na nuvem, acessíveis em qualquer dispositivo
- 🏦 **Contas** com tipos: Cartão de Crédito, Conta Corrente, Dinheiro, Investimentos
- 🏦 **Ícones de bancos** brasileiros (Nubank, Itaú, Bradesco, Inter, BB, Caixa…) e franceses (BNP, CA, SG, Boursorama…)
- 🏷️ **Categorias com subcategorias** e ícones personalizados
- 👥 **Beneficiários / Fontes pagadoras** com emoji
- 📊 Dashboard com KPIs e gráficos interativos
- 💸 Lançamentos: Despesas, Receitas, Previsões futuras
- ⚡ Converter previsão em pagamento realizado
- 📋 Relatório mensal com impressão PDF
- 📎 Anexo de comprovantes
- 💾 Backup/restore JSON
- 📱 PWA instalável (funciona offline para leitura)

## PIN padrão
`191291`

## Banco de dados
- **Supabase** (PostgreSQL gerenciado)
- Credenciais salvas em `localStorage` do navegador
- Tabelas: `transactions`, `categories`, `accounts`, `parties`, `ai_files`
