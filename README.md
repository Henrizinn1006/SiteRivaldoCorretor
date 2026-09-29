# Rivaldo Imóveis — Site + Painel Administrativo (PWA)

Site imobiliário (HTML/CSS/JS puro) com painel administrativo em **PHP + MySQL**,
feito para **hospedagem compartilhada (Hostinger)**, sem VPS e sem frameworks.

> Desenvolvido por **Vortexis**. O cliente administra o **conteúdo** pelo painel;
> layout e código continuam sob controle da Vortexis.

| Parte | Status |
|---|---|
| Home pública | ✅ pronta (ainda usa dados de exemplo no `js/main.js`) |
| Banco (`database/database.sql`) | ✅ pronto — **criar na Hostinger (último passo)** |
| Autenticação, sessão, CSRF, anti força-bruta | ✅ |
| Painel: imóveis, fotos, categorias, características, localidades, configurações, usuários, perfil | ✅ |
| API pública para o site (`/api/public/*`) | ✅ pronta |
| PWA (instalável, service worker, ícones, offline) | ✅ |
| Home consumindo a API + página `imovel.html` | ⏭ próxima etapa (depois do banco no ar) |

Arquitetura detalhada: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

---

## Sumário

1. [Estrutura](#1-estrutura)
2. [Publicar na Hostinger (passo a passo)](#2-publicar-na-hostinger)
3. [Criar o banco (último passo)](#3-criar-o-banco)
4. [Criar o primeiro administrador](#4-criar-o-primeiro-administrador)
5. [PWA — instalar o painel](#5-pwa)
6. [Uploads: permissões e limites](#6-uploads)
7. [Segurança](#7-segurança)
8. [API — rotas](#8-api)
9. [Testar localmente (opcional)](#9-testar-localmente)
10. [Manutenção](#10-manutenção)
11. [Solução de problemas](#11-solução-de-problemas)

---

## 1. Estrutura

```
public_html/
├── index.html, css/, js/, assets/     Site público
├── .htaccess                          Segurança básica (sem listagem, bloqueia .sql/.md…)
│
├── admin/                             PAINEL (PWA)
│   ├── login.html  index.html (dashboard)
│   ├── imoveis.html  imovel-form.html
│   ├── categorias.html  caracteristicas.html  localidades.html
│   ├── configuracoes.html  usuarios.html  perfil.html  offline.html
│   ├── manifest.json  service-worker.js  icons/
│   ├── css/admin.css
│   └── js/
│       ├── core/   api · layout · ui · format · icons · money · gallery · pwa
│       └── pages/  uma página = um arquivo
│
├── api/                               Endpoints JSON (ver seção 8)
├── app/          🔒  bootstrap.php · Core/ · Repositories/ · Services/ · Controllers/
├── config/       🔒  config.php · database.example.php (alternativa ao .env)
├── .env          🔒  senha do banco e segredos — criar na hospedagem (NÃO versionar)
├── database/     🔒  database.sql
├── scripts/      🔒  create-admin.php (terminal)
├── install/          Instalador web de uso único — APAGAR depois de usar
├── uploads/          properties/{id}/…webp · site/ (logo, favicon) — PHP bloqueado aqui
└── docs/         🔒
```

🔒 = bloqueado pelo navegador (`.htaccess` + guarda `defined('APP_ROOT')` em todo PHP interno).

**Back-end (`app/`)**

| Pasta | Responsabilidade |
|---|---|
| `Core/` | Database (PDO), Auth, Session, Csrf, Validator, Request/Response, Api (atalhos), Input, Media, ActivityLog |
| `Repositories/` | Consultas SQL por tabela (imóveis, fotos, catálogos, localidades, configurações, usuários) |
| `Services/` | Regras de negócio: `PropertyService` (rascunho/publicação, código, slug, duplicação) e `ImageService` (upload seguro + GD/WebP) |
| `Controllers/` | Fluxos compartilhados (catálogos, galeria) |

---

## 2. Publicar na Hostinger

1. **hPanel → Sites → Gerenciar → Avançado → Configuração do PHP**: escolha **PHP 8.1 ou superior**.
   Em *Extensões*, confira `pdo_mysql`, `gd`, `fileinfo`, `mbstring` (já vêm ativas).
2. **Segurança → SSL**: ative o SSL gratuito do domínio.
3. **Gerenciador de Arquivos** → `public_html`: envie **todo** o conteúdo da pasta do projeto,
   **incluindo os arquivos ocultos `.htaccess`** (não envie a pasta `_to_delete`).
4. No `.htaccess` da raiz, **descomente** o bloco *HTTPS obrigatório*.
5. Faça o passo **3 (banco)** e o passo **4 (administrador)**.
6. Teste — estes endereços precisam responder **403 Proibido**:
   `/.env` · `/config/config.php` · `/database/database.sql` · `/app/bootstrap.php` · `/README.md`
7. Acesse `https://seudominio.com.br/admin/`, entre e instale o app (seção 5).
8. Entregue ao cliente: **URL do painel + e-mail + senha** (a senha por canal seguro).

---

## 3. Criar o banco

> Etapa final, feita direto na Hostinger.

1. **hPanel → Bancos de dados → Gerenciamento**: crie um banco MySQL e um usuário
   (anote nome do banco, usuário e senha — a Hostinger adiciona um prefixo, ex.: `u123456789_rivaldo`).
2. Clique em **phpMyAdmin** ao lado do banco → aba **Importar** → envie `database/database.sql`.
   Ele cria as 12 tabelas + tipos de imóvel, características, cidades iniciais e chaves de configuração.
   Pode ser importado de novo sem apagar dados.
3. Crie o arquivo **`.env`** e preencha:

```ini
APP_ENV=production
APP_DEBUG=false

DB_HOST=localhost                 # na Hostinger é "localhost"
DB_PORT=3306
DB_NAME=u123456789_rivaldo        # nome completo, com prefixo
DB_USER=u123456789_rivaldo
DB_PASSWORD="a-senha-do-banco"    # entre aspas; aspas dentro da senha: \"
DB_CHARSET=utf8mb4

SETUP_TOKEN=                      # só na hora de usar o /install
```

Onde colocar o `.env` (o sistema procura nesta ordem):
- **Uma pasta acima do site** (ex.: `domains/rivaldoduarte.com.br/.env`, ao lado da `public_html`) — o mais seguro;
- ou **na raiz do site** (`public_html/.env`) — o `.htaccess` bloqueia o acesso pelo navegador.

As credenciais existem **só** nesse arquivo, no servidor. Ele está no `.gitignore`.
(`config/database.php` continua aceito como alternativa, mas o `.env` tem prioridade.)

---

## 4. Criar o primeiro administrador

Não existe senha padrão. Escolha **uma** opção:

**A) Instalador web (mais simples na Hostinger)**

1. No `.env`, preencha temporariamente `SETUP_TOKEN=uma-frase-longa-e-aleatoria`.
2. Abra `https://seudominio.com.br/install/`, informe o token, nome, e-mail e senha.
3. **Logo depois:** apague a pasta `install/` e deixe `SETUP_TOKEN=` vazio.

O instalador só funciona com o token preenchido **e** sem nenhum usuário no banco (depois se bloqueia).

**B) Terminal (SSH — planos Premium/Business da Hostinger)**

```bash
cd domains/seudominio.com.br/public_html
php scripts/create-admin.php                    # cria administrador
php scripts/create-admin.php --role=editor      # cria editor
php scripts/create-admin.php --reset-password   # troca a senha de alguém
```

**C) phpMyAdmin** — gere o hash na sua máquina com
`php -r "echo password_hash('SENHA-FORTE', PASSWORD_DEFAULT);"` e rode
`INSERT INTO users (name, email, password_hash, role) VALUES ('Nome', 'email@x.com', 'HASH', 'admin');`

Senha: mínimo de 10 caracteres, com letras e números. O 1º usuário criado pelo instalador é o **provedor**
(`--provider` no terminal). Os demais usuários são criados pelo provedor no painel (**Usuários**).

### Acesso ao painel e senhas

- **Login:** nome de usuário (ex.: `RivaldoAdmin`, sem diferenciar maiúsculas) **ou** e-mail.
- **Provedor** (`users.is_provider = 1`, a Vortexis): único que vê a tela **Usuários**, cria/edita/exclui
  usuários, redefine senhas e **libera trocas de senha**. Pode trocar a própria senha quando quiser.
- **Primeiro acesso:** todo usuário criado recebe uma **senha temporária**. Ao entrar, o painel inteiro fica
  bloqueado (inclusive pela API) até ele criar a senha pessoal em `trocar-senha.html`.
- **Trocas seguintes:** bloqueadas. O provedor usa *Usuários → ⋯ → Liberar troca de senha*; a liberação
  vale **uma** troca e depois volta a bloquear.
- **Esqueceu a senha:** o provedor edita o usuário e define uma nova senha temporária (volta ao 1º acesso).
- Bancos criados antes de 27/09/2026: rode `database/migrations/2026-09-27_usuarios.sql` uma vez.
- Bancos criados antes de 28/09/2026: rode `database/migrations/2026-09-28_zonas.sql` uma vez (zona dos bairros de São Paulo, bairros já cadastrados por zona e a opção de preço “A partir de”).

---

## 5. PWA

O painel é um aplicativo instalável (exige HTTPS):

| Aparelho | Como instalar |
|---|---|
| Android / Chrome | Botão **Instalar aplicativo** no menu lateral, ou menu ⋮ → *Instalar app* |
| iPhone / iPad | Safari → Compartilhar → **Adicionar à Tela de Início** |
| Windows / Mac | Chrome/Edge → ícone de instalar na barra de endereço |

- `admin/manifest.json`: nome, cores (`#0F0F0F`), ícones (192, 512, maskable), atalhos *Adicionar imóvel* e *Imóveis*.
- `admin/service-worker.js`: guarda **apenas** HTML/CSS/JS/ícones do painel.
  **Nenhuma resposta da API, foto enviada ou requisição POST é armazenada** no aparelho.
  Páginas usam "rede primeiro" (sempre a versão mais nova); sem internet, mostra `offline.html`.
- **Ao publicar uma versão nova do painel**, aumente `CACHE_VERSION` em `admin/service-worker.js`
  (ex.: `rv-admin-v2`) e, se criar arquivos JS/CSS novos, inclua-os na lista `APP_SHELL`.

---

## 6. Uploads

- Pastas `755`, arquivos `644` (nunca `777`). O PHP precisa gravar em `uploads/`.
- Cada foto é validada (tipo real, tamanho, se é imagem de verdade), **recodificada pelo GD**
  e salva em 3 tamanhos WebP com nome aleatório (UUID):
  `-lg` (até 1920px, "original otimizada"), `-md` (card, 900px), `-sm` (miniatura, 400px).
  O arquivo enviado nunca é salvo como veio.
- No celular, fotos muito grandes são reduzidas **antes** do envio (economiza dados).
- Limite do sistema: `config/config.php` → `uploads.max_bytes` (10 MB) e `max_per_property` (40).
- Limites do PHP (hPanel → Configuração do PHP → Opções): `upload_max_filesize = 12M`,
  `post_max_size = 64M`, `memory_limit = 256M`, `max_execution_time = 120`.

---

## 7. Segurança

- Senhas com `password_hash()`/`password_verify()`; sessão com `session_regenerate_id(true)`,
  cookie `HttpOnly` + `SameSite=Lax` + `Secure` (HTTPS), expira após 2 h parado / 12 h no total.
- Anti força-bruta: 5 erros em 15 min por e-mail (20 por IP) → bloqueio temporário.
- Toda operação de escrita exige: sessão + **token CSRF** + mesma origem. Toda permissão é
  verificada **no servidor** (`admin` × `editor`); o menu só esconde itens.
- PDO com prepared statements reais em todas as consultas; busca com `LIKE` escapado.
- Validação no servidor para todos os campos (o JS só facilita o preenchimento).
- Saída sempre escapada (XSS). Erros internos vão só para o log do servidor.
- Exclusão de imóvel é lógica (`deleted_at`) e sempre confirmada em modal.
- Usuário desativado perde o acesso na hora; ninguém remove o próprio acesso nem o último administrador.
- `activity_logs` registra login, falhas, criação, edição, publicação, exclusão, fotos, configurações e usuários.

**Papéis**

| | Provedor | Admin | Editor |
|---|---|---|---|
| Imóveis e fotos | ✅ | ✅ | ✅ |
| Criar/editar categorias, características, cidades e bairros | ✅ | ✅ | ✅ |
| Excluir categorias, características, cidades e bairros | ✅ | ✅ | — |
| Configurações do site | ✅ | ✅ | — |
| Usuários, redefinir e liberar troca de senha | ✅ | — | — |
| Trocar a própria senha | sempre | 1º acesso ou com liberação | 1º acesso ou com liberação |

---

## 8. API

Respostas sempre no formato:

```json
{ "success": true,  "message": "Imóvel salvo com sucesso.", "data": {} }
{ "success": false, "message": "Verifique os campos destacados.", "errors": { "price": "Informe um preço válido." } }
```

Status: `200/201` ok · `401` sem sessão · `403` sem permissão · `404` · `405` método · `409` em uso ·
`413/415` envio inválido · `403` + `errors.csrf` token CSRF inválido (o painel renova sozinho) · `422` validação · `429` muitas tentativas · `500` interno.

**Painel (login obrigatório; POST exige header `X-CSRF-Token`)**

| Método | Rota | Descrição |
|---|---|---|
| POST | `auth/login.php` · `auth/logout.php` | Entrar / sair |
| GET | `auth/me.php` | Usuário logado + token CSRF |
| GET | `dashboard/stats.php` | Números e imóveis recentes |
| GET | `catalogs/index.php` | Opções do formulário (tipos, cidades, bairros, características) |
| GET | `properties/index.php` | Lista: `q, status, transaction_type, property_type_id, city_id, neighborhood_id, featured, sort, page, limit` |
| GET | `properties/show.php?id=` | Imóvel completo |
| POST | `properties/create.php` · `properties/update.php` | Salvar (`action: draft\|publish`) |
| POST | `properties/action.php` | `publish, unpublish, feature, unfeature, mark_available, mark_reserved, mark_sold, mark_rented, mark_unavailable` |
| POST | `properties/duplicate.php` · `properties/delete.php` | Duplicar (com fotos) / excluir (lógica) |
| POST | `properties/images/upload.php` (multipart) · `delete.php` · `reorder.php` · `cover.php` | Galeria |
| GET/POST | `categories/index.php` · `save.php` · `delete.php` | Categorias |
| GET/POST | `features/index.php` · `save.php` · `delete.php` | Características |
| GET/POST | `locations/index.php` · `save-city.php` · `delete-city.php` · `save-neighborhood.php` · `delete-neighborhood.php` | Localidades |
| GET/POST | `settings/index.php` · `save.php` · `upload.php` · `remove-asset.php` | Configurações (admin) |
| GET/POST | `users/index.php` · `save.php` · `delete.php` · `password-permission.php` | Usuários (só o provedor) |
| POST | `profile/update.php` · `profile/password.php` | Meu perfil |

**Site público (sem login, só leitura, só imóveis publicados)**

| Rota | Uso |
|---|---|
| `public/properties.php?featured=1` | Carrossel da Home (destaques publicados e **disponíveis**) |
| `public/properties.php` | Busca: `transaction_type, property_type, city, neighborhood, min_price, max_price, bedrooms, suites, parking_spaces, min_area, q, sort, page, limit` |
| `public/property.php?id=` ou `?slug=` | Detalhe (endereço exato só se "mostrar endereço" estiver ligado) |
| `public/settings.php` | Contatos, redes sociais, CRECI, logo, link pronto do WhatsApp |
| `public/filters.php` | Tipos, cidades e bairros ativos para os filtros |

**Regras de publicação**

| Status | Painel | Busca do site | Carrossel |
|---|---|---|---|
| rascunho | ✅ | — | — |
| disponível | ✅ | ✅ | ✅ se destaque |
| reservado | ✅ | ✅ | — |
| vendido / alugado | ✅ | — (a página do imóvel ainda abre, marcada como vendido/alugado) | — |
| indisponível | ✅ | — | — |

---

## 9. Testar localmente

Opcional — precisa de PHP 8+ e MySQL (ex.: XAMPP/Laragon).
Importe `database/database.sql`, crie o `.env`, rode `php scripts/create-admin.php`
e `php -S localhost:8000` na pasta do projeto. Abra `http://localhost:8000/admin/`.
(O servidor embutido não lê `.htaccess`: use só para desenvolvimento.)

---

## 10. Manutenção

- **Novo endpoint protegido:**

```php
<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Api, Request, Response, Validator};

$user = Api::write();                 // POST + login + CSRF   (Api::write('admin') = só admin)
$data = Request::json();
(new Validator($data))->required('name', 'Informe o nome.')->validate();
Response::success('Salvo.', [/* … */]);
```

- **Nova página do painel:** copie uma página `.html` existente, crie `js/pages/<pagina>.js`
  chamando `initLayout({ page, title })`, adicione o item em `NAV` (`js/core/layout.js`)
  e o arquivo em `APP_SHELL` do service worker.
- **Nova configuração do site:** adicione a chave em `SettingsRepository::FIELDS` e o campo em `configuracoes.html`.

---

## 11. Solução de problemas

| Sintoma | Causa provável |
|---|---|
| "Erro interno" em tudo | `.env` ausente/errado (DB_…) ou banco não importado. hPanel → *Logs de erro*. |
| Erro 500 ao abrir o site | Alguma regra do `.htaccess` não aceita — comente blocos para testar. |
| Login volta para a tela de login | Cookie bloqueado: use sempre HTTPS e o mesmo domínio (com ou sem `www`). |
| "Muitas tentativas" | Aguarde 15 min ou `DELETE FROM login_attempts WHERE email = '…';` |
| Foto não sobe | Limites do PHP (seção 6) ou GD sem WebP. |
| Painel não mostra versão nova | Aumente `CACHE_VERSION` no service worker e recarregue. |
| Acentos quebrados | Banco fora de `utf8mb4_unicode_ci`. |

## Publicar atualizações (sem limpar cache)

1. Na pasta `LandingPage`, rode: `python scripts/publicar.py`
   → gera `_publicar/rivaldo-site.zip` só com o que vai para o servidor
   (nunca inclui `.env`, `install/`, `scripts/`, `database/`, `docs/`, README, fotos originais).
2. Suba o zip na **raiz** da hospedagem (fora da `public_html`) e extraia dentro da `public_html`.
3. Se houver arquivo novo em `database/migrations/`, rode no phpMyAdmin.

Cache: o script coloca uma versão em cada CSS/JS/imagem (`style.css?v=3f9a1c2e`), calculada pelo
conteúdo. Arquivo alterado = endereço novo → CDN e navegadores buscam sozinhos. **Não é preciso
limpar o cache da CDN.** O painel (PWA) também atualiza sozinho (versão do Service Worker automática).
Os arquivos da pasta não são alterados — as versões existem só dentro do zip.
