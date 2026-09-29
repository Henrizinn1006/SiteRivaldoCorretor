-- ============================================================================
--  Migração 2026-09-28 — zonas de São Paulo e preço "a partir de"
--  Rode UMA vez em bancos criados antes desta data (phpMyAdmin → SQL).
--  Bancos novos já recebem tudo isso pelo database.sql.
--  (IF NOT EXISTS: pode rodar de novo sem erro — MariaDB, como na Hostinger.)
-- ============================================================================

SET NAMES utf8mb4;

-- Zona do bairro: centro | norte | sul | leste | oeste (vazio = sem zona)
ALTER TABLE neighborhoods
  ADD COLUMN IF NOT EXISTS zone VARCHAR(10) NULL AFTER name,
  ADD KEY IF NOT EXISTS idx_neighborhoods_zone (zone);

-- Preço exibido como "A partir de R$ ..." (lançamentos, várias plantas)
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS price_from TINYINT(1) NOT NULL DEFAULT 0 AFTER price;

-- Bairros de São Paulo já com a zona (só cria os que ainda não existem)
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

-- Bairros de São Paulo que já existiam: recebem a zona (se ainda não tiverem)
UPDATE neighborhoods n
  JOIN cities c ON c.id = n.city_id AND c.slug = 'sao-paulo-sp'
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
  ) b ON b.slug = n.slug
   SET n.zone = b.zone
 WHERE n.zone IS NULL;
