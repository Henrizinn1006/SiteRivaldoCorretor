-- ============================================================================
--  RIVALDO IMÓVEIS — Banco de dados do site + painel administrativo
--  Compatível com MySQL 5.7+ / 8.x e MariaDB 10.3+
--  Engine InnoDB · charset utf8mb4 · collation utf8mb4_unicode_ci
--
--  Como usar:
--    1. Crie o banco pelo painel da hospedagem (cPanel → MySQL Databases)
--       com collation utf8mb4_unicode_ci.
--    2. Importe este arquivo pelo phpMyAdmin (aba "Importar").
--  O script é idempotente: usa CREATE TABLE IF NOT EXISTS e INSERT IGNORE,
--  então pode ser reimportado sem apagar dados existentes.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '-03:00';

-- ----------------------------------------------------------------------------
--  USUÁRIOS E ACESSO
-- ----------------------------------------------------------------------------

-- Login por usuário (ex.: RivaldoAdmin) ou e-mail.
-- is_provider: o provedor (Vortexis) — único que gerencia usuários e libera trocas de senha.
-- must_change_password: obriga a criar a senha pessoal no próximo acesso.
-- password_change_allowed: troca de senha liberada pelo provedor (vale uma vez).
CREATE TABLE IF NOT EXISTS users (
  id                       INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  name                     VARCHAR(120)     NOT NULL,
  username                 VARCHAR(40)      NULL,
  email                    VARCHAR(190)     NULL,
  password_hash            VARCHAR(255)     NOT NULL,
  role                     ENUM('admin','editor') NOT NULL DEFAULT 'editor',
  is_provider              TINYINT(1)       NOT NULL DEFAULT 0,
  active                   TINYINT(1)       NOT NULL DEFAULT 1,
  must_change_password     TINYINT(1)       NOT NULL DEFAULT 0,
  password_change_allowed  TINYINT(1)       NOT NULL DEFAULT 0,
  last_login_at            DATETIME         NULL,
  created_at               DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Recuperação de senha (estrutura pronta; envio de e-mail em etapa futura).
-- Guarda somente o HASH SHA-256 do token enviado por e-mail.
CREATE TABLE IF NOT EXISTS password_resets (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED  NOT NULL,
  token_hash  CHAR(64)      NOT NULL,
  expires_at  DATETIME      NOT NULL,
  used_at     DATETIME      NULL,
  ip_address  VARCHAR(45)   NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_resets_token (token_hash),
  KEY idx_password_resets_user (user_id),
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tentativas de login (proteção contra força bruta). Sem FK de propósito:
-- também registra tentativas com e-mails que não existem.
CREATE TABLE IF NOT EXISTS login_attempts (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(190)    NOT NULL,
  ip_address    VARCHAR(45)     NOT NULL,
  success       TINYINT(1)      NOT NULL DEFAULT 0,
  attempted_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_login_attempts_email (email, attempted_at),
  KEY idx_login_attempts_ip (ip_address, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  CATÁLOGOS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS property_types (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(80)       NOT NULL,
  slug        VARCHAR(90)       NOT NULL,
  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  active      TINYINT(1)        NOT NULL DEFAULT 1,
  created_at  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_property_types_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cities (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120)  NOT NULL,
  state       CHAR(2)       NOT NULL,
  slug        VARCHAR(140)  NOT NULL,
  active      TINYINT(1)    NOT NULL DEFAULT 1,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cities_slug (slug),
  UNIQUE KEY uq_cities_name_state (name, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS neighborhoods (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  city_id     INT UNSIGNED  NOT NULL,
  name        VARCHAR(120)  NOT NULL,
  zone        VARCHAR(10)   NULL,        -- centro | norte | sul | leste | oeste (filtro do site)
  slug        VARCHAR(140)  NOT NULL,
  active      TINYINT(1)    NOT NULL DEFAULT 1,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_neighborhoods_city_slug (city_id, slug),
  KEY idx_neighborhoods_zone (zone),
  CONSTRAINT fk_neighborhoods_city FOREIGN KEY (city_id) REFERENCES cities (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS features (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(80)       NOT NULL,
  slug        VARCHAR(90)       NOT NULL,
  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  active      TINYINT(1)        NOT NULL DEFAULT 1,
  created_at  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_features_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  IMÓVEIS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS properties (
  id                INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  code              VARCHAR(20)        NULL,        -- IMO-0001 (gerado a partir do id)
  title             VARCHAR(160)       NOT NULL,
  slug              VARCHAR(180)       NOT NULL,
  transaction_type  ENUM('venda','aluguel') NOT NULL DEFAULT 'venda',
  property_type_id  SMALLINT UNSIGNED  NULL,
  price             DECIMAL(14,2)      NULL,
  price_from        TINYINT(1)         NOT NULL DEFAULT 0, -- exibir "A partir de R$ ..."
  old_price         DECIMAL(14,2)      NULL,
  condominium_fee   DECIMAL(12,2)      NULL,
  property_tax      DECIMAL(12,2)      NULL,         -- IPTU
  city_id           INT UNSIGNED       NULL,
  neighborhood_id   INT UNSIGNED       NULL,
  address           VARCHAR(190)       NULL,
  number            VARCHAR(20)        NULL,
  complement        VARCHAR(120)       NULL,
  zip_code          VARCHAR(9)         NULL,
  latitude          DECIMAL(10,7)      NULL,
  longitude         DECIMAL(10,7)      NULL,
  show_address      TINYINT(1)         NOT NULL DEFAULT 0, -- exibir endereço completo no site?
  total_area        DECIMAL(10,2)      NULL,
  usable_area       DECIMAL(10,2)      NULL,
  bedrooms          TINYINT UNSIGNED   NOT NULL DEFAULT 0,
  suites            TINYINT UNSIGNED   NOT NULL DEFAULT 0,
  bathrooms         TINYINT UNSIGNED   NOT NULL DEFAULT 0,
  parking_spaces    TINYINT UNSIGNED   NOT NULL DEFAULT 0,
  description       TEXT               NULL,
  status            ENUM('disponivel','reservado','vendido','alugado','indisponivel','rascunho') NOT NULL DEFAULT 'rascunho',
  featured          TINYINT(1)         NOT NULL DEFAULT 0,
  cover_image_id    INT UNSIGNED       NULL,
  published_at      DATETIME           NULL,
  created_by        INT UNSIGNED       NULL,
  updated_by        INT UNSIGNED       NULL,
  created_at        DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at        DATETIME           NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_properties_code (code),
  UNIQUE KEY uq_properties_slug (slug),
  KEY idx_properties_public (deleted_at, status, published_at),
  KEY idx_properties_featured (featured, status),
  KEY idx_properties_transaction (transaction_type),
  KEY idx_properties_type (property_type_id),
  KEY idx_properties_city (city_id),
  KEY idx_properties_neighborhood (neighborhood_id),
  KEY idx_properties_price (price),
  KEY idx_properties_created (created_at),
  CONSTRAINT fk_properties_type         FOREIGN KEY (property_type_id) REFERENCES property_types (id) ON DELETE SET NULL,
  CONSTRAINT fk_properties_city         FOREIGN KEY (city_id)          REFERENCES cities (id)         ON DELETE SET NULL,
  CONSTRAINT fk_properties_neighborhood FOREIGN KEY (neighborhood_id)  REFERENCES neighborhoods (id)  ON DELETE SET NULL,
  CONSTRAINT fk_properties_created_by   FOREIGN KEY (created_by)       REFERENCES users (id)          ON DELETE SET NULL,
  CONSTRAINT fk_properties_updated_by   FOREIGN KEY (updated_by)       REFERENCES users (id)          ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fotos: o arquivo físico usa "file_key" (UUID) e existe em 3 variantes:
--   uploads/properties/{property_id}/{file_key}-lg.webp  (até 1920px)
--   uploads/properties/{property_id}/{file_key}-md.webp  (card, 900px)
--   uploads/properties/{property_id}/{file_key}-sm.webp  (miniatura, 400px)
CREATE TABLE IF NOT EXISTS property_images (
  id             INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  property_id    INT UNSIGNED      NOT NULL,
  file_key       CHAR(36)          NOT NULL,
  original_name  VARCHAR(190)      NULL,     -- apenas informativo (nunca usado como nome de arquivo)
  mime_type      VARCHAR(40)       NOT NULL,
  width          SMALLINT UNSIGNED NULL,
  height         SMALLINT UNSIGNED NULL,
  size_bytes     INT UNSIGNED      NULL,
  alt_text       VARCHAR(190)      NULL,
  sort_order     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at     DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_property_images_key (file_key),
  KEY idx_property_images_order (property_id, sort_order),
  CONSTRAINT fk_property_images_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FK circular da capa (adicionada depois das duas tabelas existirem).
-- Em reimportação o MySQL avisará que ela já existe — pode ignorar.
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                    WHERE CONSTRAINT_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'properties'
                      AND CONSTRAINT_NAME = 'fk_properties_cover');
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE properties ADD CONSTRAINT fk_properties_cover FOREIGN KEY (cover_image_id) REFERENCES property_images (id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS property_features (
  property_id  INT UNSIGNED      NOT NULL,
  feature_id   SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (property_id, feature_id),
  KEY idx_property_features_feature (feature_id),
  CONSTRAINT fk_property_features_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_property_features_feature  FOREIGN KEY (feature_id)  REFERENCES features (id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  CONFIGURAÇÕES DO SITE (chave / valor)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key    VARCHAR(64)   NOT NULL,
  setting_value  TEXT          NULL,
  updated_by     INT UNSIGNED  NULL,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key),
  CONSTRAINT fk_site_settings_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  LOG DE ATIVIDADES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS activity_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED    NULL,
  action      VARCHAR(50)     NOT NULL,   -- login, logout, create, update, delete, publish…
  entity      VARCHAR(50)     NULL,       -- property, image, user, setting…
  entity_id   INT UNSIGNED    NULL,
  details     TEXT            NULL,       -- JSON com contexto (campos alterados etc.)
  ip_address  VARCHAR(45)     NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_logs_user (user_id, created_at),
  KEY idx_activity_logs_entity (entity, entity_id),
  CONSTRAINT fk_activity_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
--  DADOS INICIAIS
-- ============================================================================

INSERT IGNORE INTO property_types (name, slug, sort_order) VALUES
  ('Apartamento',        'apartamento',        1),
  ('Casa',               'casa',               2),
  ('Casa em condomínio', 'casa-em-condominio', 3),
  ('Cobertura',          'cobertura',          4),
  ('Sobrado',            'sobrado',            5),
  ('Studio',             'studio',             6),
  ('Terreno',            'terreno',            7),
  ('Comercial',          'comercial',          8),
  ('Outros',             'outros',             99);

INSERT IGNORE INTO features (name, slug, sort_order) VALUES
  ('Piscina',            'piscina',            1),
  ('Piscina privativa',  'piscina-privativa',  2),
  ('Academia',           'academia',           3),
  ('Varanda',            'varanda',            4),
  ('Varanda gourmet',    'varanda-gourmet',    5),
  ('Área gourmet',       'area-gourmet',       6),
  ('Churrasqueira',      'churrasqueira',      7),
  ('Elevador',           'elevador',           8),
  ('Portaria 24h',       'portaria-24h',       9),
  ('Ar-condicionado',    'ar-condicionado',    10),
  ('Mobiliado',          'mobiliado',          11),
  ('Aceita pets',        'aceita-pets',        12),
  ('Vista panorâmica',   'vista-panoramica',   13),
  ('Jardim',             'jardim',             14),
  ('Lareira',            'lareira',            15),
  ('Home office',        'home-office',        16),
  ('Energia solar',      'energia-solar',      17),
  ('Automação',          'automacao',          18);

INSERT IGNORE INTO cities (name, state, slug) VALUES
  ('São Paulo',        'SP', 'sao-paulo-sp'),
  ('Barueri',          'SP', 'barueri-sp'),
  ('Guarujá',          'SP', 'guaruja-sp'),
  ('Campos do Jordão', 'SP', 'campos-do-jordao-sp');

-- Bairros de São Paulo com a zona (usada no filtro "Zona" do site)
INSERT IGNORE INTO neighborhoods (city_id, name, slug, zone)
SELECT c.id, b.name, b.slug, b.zone
  FROM cities c
  JOIN (
    SELECT 'Moema' AS name, 'moema' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Vila Nova Conceição' AS name, 'vila-nova-conceicao' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Vila Mariana' AS name, 'vila-mariana' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Brooklin' AS name, 'brooklin' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Campo Belo' AS name, 'campo-belo' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Chácara Santo Antônio' AS name, 'chacara-santo-antonio' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Santo Amaro' AS name, 'santo-amaro' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Jardim Marajoara' AS name, 'jardim-marajoara' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Granja Julieta' AS name, 'granja-julieta' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Alto da Boa Vista' AS name, 'alto-da-boa-vista' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Chácara Flora' AS name, 'chacara-flora' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Paraíso' AS name, 'paraiso' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Saúde' AS name, 'saude' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Vila Andrade' AS name, 'vila-andrade' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Panamby' AS name, 'panamby' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Ipiranga' AS name, 'ipiranga' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Cursino' AS name, 'cursino' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Jabaquara' AS name, 'jabaquara' AS slug, 'sul' AS zone UNION ALL
    SELECT 'Jardins' AS name, 'jardins' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Jardim Paulista' AS name, 'jardim-paulista' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Jardim Europa' AS name, 'jardim-europa' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Jardim América' AS name, 'jardim-america' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Itaim Bibi' AS name, 'itaim-bibi' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Vila Olímpia' AS name, 'vila-olimpia' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Pinheiros' AS name, 'pinheiros' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Alto de Pinheiros' AS name, 'alto-de-pinheiros' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Vila Madalena' AS name, 'vila-madalena' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Perdizes' AS name, 'perdizes' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Pompeia' AS name, 'pompeia' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Sumaré' AS name, 'sumare' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Lapa' AS name, 'lapa' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Alto da Lapa' AS name, 'alto-da-lapa' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Vila Leopoldina' AS name, 'vila-leopoldina' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Butantã' AS name, 'butanta' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Morumbi' AS name, 'morumbi' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Cidade Jardim' AS name, 'cidade-jardim' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Vila Sônia' AS name, 'vila-sonia' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Higienópolis' AS name, 'higienopolis' AS slug, 'centro' AS zone UNION ALL
    SELECT 'Consolação' AS name, 'consolacao' AS slug, 'centro' AS zone UNION ALL
    SELECT 'Bela Vista' AS name, 'bela-vista' AS slug, 'centro' AS zone UNION ALL
    SELECT 'Cerqueira César' AS name, 'cerqueira-cesar' AS slug, 'oeste' AS zone UNION ALL
    SELECT 'Aclimação' AS name, 'aclimacao' AS slug, 'centro' AS zone UNION ALL
    SELECT 'Liberdade' AS name, 'liberdade' AS slug, 'centro' AS zone UNION ALL
    SELECT 'República' AS name, 'republica' AS slug, 'centro' AS zone UNION ALL
    SELECT 'Santa Cecília' AS name, 'santa-cecilia' AS slug, 'centro' AS zone UNION ALL
    SELECT 'Cambuci' AS name, 'cambuci' AS slug, 'centro' AS zone UNION ALL
    SELECT 'Santana' AS name, 'santana' AS slug, 'norte' AS zone UNION ALL
    SELECT 'Jardim São Paulo' AS name, 'jardim-sao-paulo' AS slug, 'norte' AS zone UNION ALL
    SELECT 'Tucuruvi' AS name, 'tucuruvi' AS slug, 'norte' AS zone UNION ALL
    SELECT 'Parada Inglesa' AS name, 'parada-inglesa' AS slug, 'norte' AS zone UNION ALL
    SELECT 'Casa Verde' AS name, 'casa-verde' AS slug, 'norte' AS zone UNION ALL
    SELECT 'Mandaqui' AS name, 'mandaqui' AS slug, 'norte' AS zone UNION ALL
    SELECT 'Água Fria' AS name, 'agua-fria' AS slug, 'norte' AS zone UNION ALL
    SELECT 'Vila Guilherme' AS name, 'vila-guilherme' AS slug, 'norte' AS zone UNION ALL
    SELECT 'Tremembé' AS name, 'tremembe' AS slug, 'norte' AS zone UNION ALL
    SELECT 'Tatuapé' AS name, 'tatuape' AS slug, 'leste' AS zone UNION ALL
    SELECT 'Jardim Anália Franco' AS name, 'jardim-analia-franco' AS slug, 'leste' AS zone UNION ALL
    SELECT 'Mooca' AS name, 'mooca' AS slug, 'leste' AS zone UNION ALL
    SELECT 'Vila Carrão' AS name, 'vila-carrao' AS slug, 'leste' AS zone UNION ALL
    SELECT 'Vila Formosa' AS name, 'vila-formosa' AS slug, 'leste' AS zone UNION ALL
    SELECT 'Belém' AS name, 'belem' AS slug, 'leste' AS zone UNION ALL
    SELECT 'Penha' AS name, 'penha' AS slug, 'leste' AS zone UNION ALL
    SELECT 'Vila Prudente' AS name, 'vila-prudente' AS slug, 'leste' AS zone UNION ALL
    SELECT 'Aricanduva' AS name, 'aricanduva' AS slug, 'leste' AS zone
  ) b
 WHERE c.slug = 'sao-paulo-sp';

INSERT IGNORE INTO site_settings (setting_key, setting_value) VALUES
  ('company_name',   'Rivaldo Duarte'),
  ('tagline',        'Consultor imobiliário'),
  ('about_short',    'Imóveis de alto padrão à venda em São Paulo.'),
  ('phone',          '11958346101'),
  ('whatsapp',       '5511958346101'),
  ('whatsapp_message','Olá! Vim pelo site e gostaria de mais informações.'),
  ('email',          ''),
  ('address',        ''),
  ('creci',          '319061'),
  ('instagram_url',  ''),
  ('facebook_url',   ''),
  ('youtube_url',    ''),
  ('tiktok_url',     ''),
  ('linkedin_url',   ''),
  ('logo_path',      ''),
  ('favicon_path',   '');
