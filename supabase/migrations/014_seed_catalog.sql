-- Migration 014: Seed production fragrance catalog
-- 50 iconic/popular fragrances across houses, families, and price tiers.
-- Run in Supabase SQL editor. Safe to re-run (ON CONFLICT DO NOTHING).
-- Uses md5()::uuid for deterministic IDs from human-readable short keys.

-- ─────────────────────────────────────────────────────────────────────
-- Brands
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO brands (id, name, slug, country) VALUES
  (md5('b001')::uuid, 'Chanel',                    'chanel',                    'France'),
  (md5('b002')::uuid, 'Dior',                       'dior',                      'France'),
  (md5('b003')::uuid, 'Tom Ford',                   'tom-ford',                  'USA'),
  (md5('b004')::uuid, 'Creed',                      'creed',                     'France'),
  (md5('b005')::uuid, 'Jo Malone',                  'jo-malone',                 'UK'),
  (md5('b006')::uuid, 'Yves Saint Laurent',         'yves-saint-laurent',        'France'),
  (md5('b007')::uuid, 'Guerlain',                   'guerlain',                  'France'),
  (md5('b008')::uuid, 'Hermès',                     'hermes',                    'France'),
  (md5('b009')::uuid, 'Byredo',                     'byredo',                    'Sweden'),
  (md5('b010')::uuid, 'Le Labo',                    'le-labo',                   'USA'),
  (md5('b011')::uuid, 'Maison Margiela',            'maison-margiela',           'Belgium'),
  (md5('b012')::uuid, 'Parfums de Marly',           'parfums-de-marly',          'France'),
  (md5('b013')::uuid, 'Amouage',                    'amouage',                   'Oman'),
  (md5('b014')::uuid, 'Initio Parfums Privés',      'initio-parfums-prives',     'France'),
  (md5('b015')::uuid, 'Xerjoff',                    'xerjoff',                   'Italy'),
  (md5('b016')::uuid, 'Acqua di Parma',             'acqua-di-parma',            'Italy'),
  (md5('b017')::uuid, 'Diptyque',                   'diptyque',                  'France'),
  (md5('b018')::uuid, 'Maison Francis Kurkdjian',   'maison-francis-kurkdjian',  'France'),
  (md5('b019')::uuid, 'Frederic Malle',             'frederic-malle',            'France'),
  (md5('b020')::uuid, 'Serge Lutens',               'serge-lutens',              'France'),
  (md5('b021')::uuid, 'Valentino',                  'valentino',                 'Italy'),
  (md5('b022')::uuid, 'Prada',                      'prada',                     'Italy'),
  (md5('b023')::uuid, 'Giorgio Armani',             'giorgio-armani',            'Italy'),
  (md5('b024')::uuid, 'Burberry',                   'burberry',                  'UK'),
  (md5('b025')::uuid, 'Viktor & Rolf',              'viktor-rolf',               'Netherlands')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- Fragrances
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO fragrances (
  id, brand_id, name, slug, concentration, fragrance_family, gender,
  top_notes, heart_notes, base_notes,
  top_accords, accord_intensity,
  community_longevity, community_sillage, community_projection,
  compliment_score, versatility_score, office_safe_score,
  price_tier, retail_msrp_usd_cents,
  image_url, similar_fragrance_ids, is_active, release_year
) VALUES

-- CHANEL
(md5('f001')::uuid, md5('b001')::uuid, 'Bleu de Chanel', 'bleu-de-chanel', 'edp', 'Aromatic Woody', 'masculine',
  ARRAY['Grapefruit','Lemon','Mint'], ARRAY['Ginger','Nutmeg','Jasmine'], ARRAY['Labdanum','Sandalwood','Cedar'],
  ARRAY['woody','aromatic','citrus','fresh'],
  '{"woody":4,"aromatic":4,"citrus":3,"fresh":3}'::jsonb,
  4,3,4, 0.88,0.90,0.92, 4,14500,
  'https://images.unsplash.com/photo-1541643600914-78b084683702?w=600',
  ARRAY[md5('f002')::uuid, md5('f010')::uuid, md5('f011')::uuid]::uuid[], true, 2010),

(md5('f002')::uuid, md5('b001')::uuid, 'Chanel No. 5', 'chanel-no-5', 'edp', 'Floral Aldehyde', 'feminine',
  ARRAY['Aldehyde','Neroli','Ylang-ylang'], ARRAY['Rose','Jasmine','Iris'], ARRAY['Sandalwood','Civet','Vetiver'],
  ARRAY['floral','powdery','aldehyde','classic'],
  '{"floral":5,"powdery":4,"aldehyde":4,"classic":4}'::jsonb,
  4,3,3, 0.72,0.65,0.70, 4,16000,
  'https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=600',
  ARRAY[md5('f001')::uuid, md5('f003')::uuid]::uuid[], true, 1921),

-- DIOR
(md5('f003')::uuid, md5('b002')::uuid, 'Sauvage', 'sauvage', 'edp', 'Aromatic Fougere', 'masculine',
  ARRAY['Bergamot','Pepper'], ARRAY['Sichuan Pepper','Lavender','Geranium'], ARRAY['Ambroxan','Cedar','Labdanum'],
  ARRAY['aromatic','fresh','spicy','woody'],
  '{"aromatic":5,"fresh":4,"spicy":3,"woody":3}'::jsonb,
  4,4,4, 0.91,0.88,0.85, 3,12500,
  'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=600',
  ARRAY[md5('f001')::uuid, md5('f011')::uuid, md5('f012')::uuid]::uuid[], true, 2015),

(md5('f004')::uuid, md5('b002')::uuid, 'Miss Dior', 'miss-dior', 'edp', 'Floral', 'feminine',
  ARRAY['Calabrian Bergamot','Pear'], ARRAY['Peony','Rose','Lily of the Valley'], ARRAY['White Musks','Patchouli'],
  ARRAY['floral','fresh','powdery','rose'],
  '{"floral":5,"fresh":3,"powdery":3,"rose":4}'::jsonb,
  3,3,3, 0.78,0.72,0.80, 4,13500,
  'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600',
  ARRAY[md5('f002')::uuid, md5('f005')::uuid, md5('f021')::uuid]::uuid[], true, 2012),

(md5('f005')::uuid, md5('b002')::uuid, 'Dior Homme Intense', 'dior-homme-intense', 'edp', 'Woody Floral Musk', 'masculine',
  ARRAY['Lavender','Iris'], ARRAY['Iris','Pear'], ARRAY['Vetiver','Cashmeran','Ambrette'],
  ARRAY['iris','powdery','woody','floral'],
  '{"iris":5,"powdery":4,"woody":3,"floral":3}'::jsonb,
  4,3,3, 0.82,0.78,0.75, 4,14000,
  'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=600',
  ARRAY[md5('f003')::uuid, md5('f004')::uuid]::uuid[], true, 2011),

-- TOM FORD
(md5('f006')::uuid, md5('b003')::uuid, 'Black Orchid', 'black-orchid', 'edp', 'Oriental Floral', 'unisex',
  ARRAY['Black Truffle','Ylang-ylang'], ARRAY['Black Orchid','Fruit'], ARRAY['Patchouli','Vanilla','Amber'],
  ARRAY['dark','floral','gourmand','oud'],
  '{"dark":5,"floral":4,"gourmand":3,"oud":3}'::jsonb,
  5,4,4, 0.75,0.60,0.45, 5,22500,
  'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=600',
  ARRAY[md5('f007')::uuid, md5('f030')::uuid, md5('f035')::uuid]::uuid[], true, 2006),

(md5('f007')::uuid, md5('b003')::uuid, 'Oud Wood', 'oud-wood', 'edp', 'Woody Oriental', 'unisex',
  ARRAY['Oud','Rosewood','Cardamom'], ARRAY['Sandalwood','Vetiver'], ARRAY['Amber','Tonka Bean','Vanilla'],
  ARRAY['oud','woody','smoky','amber'],
  '{"oud":5,"woody":4,"smoky":3,"amber":4}'::jsonb,
  5,4,3, 0.80,0.65,0.55, 5,24000,
  'https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=600',
  ARRAY[md5('f006')::uuid, md5('f030')::uuid, md5('f031')::uuid]::uuid[], true, 2007),

(md5('f008')::uuid, md5('b003')::uuid, 'Neroli Portofino', 'neroli-portofino', 'edt', 'Citrus Aromatic', 'unisex',
  ARRAY['Bergamot','Lemon','Orange'], ARRAY['Neroli','Petitgrain','Rosewood'], ARRAY['Amber','Oakmoss','White Musks'],
  ARRAY['citrus','fresh','aquatic','aromatic'],
  '{"citrus":5,"fresh":5,"aquatic":3,"aromatic":3}'::jsonb,
  3,3,3, 0.78,0.85,0.90, 5,28000,
  'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600',
  ARRAY[md5('f016')::uuid, md5('f017')::uuid, md5('f009')::uuid]::uuid[], true, 2011),

-- CREED
(md5('f009')::uuid, md5('b004')::uuid, 'Aventus', 'aventus', 'edp', 'Fruity Chypre', 'masculine',
  ARRAY['Blackcurrant','Bergamot','Apple','Pineapple'], ARRAY['Birch','Patchouli','Rose','Jasmine'], ARRAY['Oakmoss','Ambergris','Vanilla','Musk'],
  ARRAY['fruity','woody','smoky','citrus'],
  '{"fruity":4,"woody":4,"smoky":3,"citrus":3}'::jsonb,
  4,4,4, 0.95,0.87,0.80, 5,40500,
  'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600',
  ARRAY[md5('f003')::uuid, md5('f010')::uuid, md5('f015')::uuid]::uuid[], true, 2010),

(md5('f010')::uuid, md5('b004')::uuid, 'Green Irish Tweed', 'green-irish-tweed', 'edp', 'Aromatic Fougere', 'masculine',
  ARRAY['Lemon Verbena','Violet'], ARRAY['Iris','Sandalwood'], ARRAY['Ambergris','White Musks'],
  ARRAY['aromatic','fresh','green','woody'],
  '{"aromatic":4,"fresh":5,"green":4,"woody":3}'::jsonb,
  4,3,3, 0.82,0.78,0.82, 5,35500,
  'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=600',
  ARRAY[md5('f009')::uuid, md5('f001')::uuid, md5('f011')::uuid]::uuid[], true, 1985),

-- JO MALONE
(md5('f011')::uuid, md5('b005')::uuid, 'Wood Sage & Sea Salt', 'wood-sage-sea-salt', 'cologne', 'Aromatic Aquatic', 'unisex',
  ARRAY['Sea Salt','Ambrette'], ARRAY['Sage'], ARRAY['Driftwood'],
  ARRAY['aromatic','aquatic','fresh','salt'],
  '{"aromatic":4,"aquatic":5,"fresh":4,"salt":4}'::jsonb,
  3,3,3, 0.72,0.88,0.90, 3,19500,
  'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600',
  ARRAY[md5('f008')::uuid, md5('f010')::uuid, md5('f016')::uuid]::uuid[], true, 2014),

(md5('f012')::uuid, md5('b005')::uuid, 'Peony & Blush Suede', 'peony-blush-suede', 'cologne', 'Floral', 'feminine',
  ARRAY['Red Apple'], ARRAY['Peony','Jasmine','Rose'], ARRAY['Suede'],
  ARRAY['floral','fruity','powdery','suede'],
  '{"floral":5,"fruity":3,"powdery":3,"suede":4}'::jsonb,
  3,3,3, 0.80,0.75,0.82, 3,18000,
  'https://images.unsplash.com/photo-1541643600914-78b084683702?w=600',
  ARRAY[md5('f004')::uuid, md5('f021')::uuid, md5('f022')::uuid]::uuid[], true, 2012),

-- YSL
(md5('f013')::uuid, md5('b006')::uuid, 'Black Opium', 'black-opium', 'edp', 'Oriental Vanilla', 'feminine',
  ARRAY['Pink Pepper','Orange Blossom'], ARRAY['Coffee','Jasmine'], ARRAY['Patchouli','Vanilla','Cedarwood'],
  ARRAY['gourmand','coffee','floral','vanilla'],
  '{"gourmand":5,"coffee":5,"floral":3,"vanilla":4}'::jsonb,
  4,4,4, 0.88,0.72,0.55, 3,13000,
  'https://images.unsplash.com/photo-1573575155376-b5010099301b?w=600',
  ARRAY[md5('f006')::uuid, md5('f014')::uuid, md5('f035')::uuid]::uuid[], true, 2014),

(md5('f014')::uuid, md5('b006')::uuid, 'Mon Paris', 'mon-paris', 'edp', 'Fruity Floral', 'feminine',
  ARRAY['Strawberry','Pear','Bergamot'], ARRAY['Peony','Rose'], ARRAY['White Musks','Patchouli','Ambroxan'],
  ARRAY['fruity','floral','fresh','rose'],
  '{"fruity":4,"floral":4,"fresh":3,"rose":3}'::jsonb,
  3,3,3, 0.82,0.78,0.75, 3,11000,
  'https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=600',
  ARRAY[md5('f004')::uuid, md5('f012')::uuid, md5('f021')::uuid]::uuid[], true, 2016),

-- GUERLAIN
(md5('f015')::uuid, md5('b007')::uuid, 'Shalimar', 'shalimar', 'edp', 'Oriental Vanilla', 'feminine',
  ARRAY['Bergamot','Lemon'], ARRAY['Iris','Rose','Jasmine'], ARRAY['Vanilla','Opoponax','Vetiver','Civet'],
  ARRAY['oriental','vanilla','powdery','classic'],
  '{"oriental":5,"vanilla":5,"powdery":3,"classic":5}'::jsonb,
  5,3,3, 0.68,0.55,0.48, 3,10500,
  'https://images.unsplash.com/photo-1573575155376-b5010099301b?w=600',
  ARRAY[md5('f006')::uuid, md5('f013')::uuid, md5('f035')::uuid]::uuid[], true, 1925),

(md5('f016')::uuid, md5('b007')::uuid, 'La Petite Robe Noire', 'la-petite-robe-noire', 'edp', 'Fruity Chypre', 'feminine',
  ARRAY['Blackcurrant','Bergamot'], ARRAY['Rose','Licorice','Almond'], ARRAY['Patchouli','Vetiver','Vanilla'],
  ARRAY['fruity','rose','powdery','chypre'],
  '{"fruity":4,"rose":4,"powdery":3,"chypre":3}'::jsonb,
  4,3,3, 0.75,0.70,0.72, 3,10000,
  'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600',
  ARRAY[md5('f004')::uuid, md5('f015')::uuid, md5('f014')::uuid]::uuid[], true, 2012),

-- HERMÈS
(md5('f017')::uuid, md5('b008')::uuid, 'Terre d''Hermès', 'terre-d-hermes', 'edp', 'Woody Citrus', 'masculine',
  ARRAY['Orange','Grapefruit'], ARRAY['Pepper','Pelargonium'], ARRAY['Flint','Vetiver','Benzoin'],
  ARRAY['woody','citrus','earthy','mineral'],
  '{"woody":5,"citrus":4,"earthy":4,"mineral":4}'::jsonb,
  4,3,3, 0.85,0.82,0.88, 4,16500,
  'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=600',
  ARRAY[md5('f001')::uuid, md5('f003')::uuid, md5('f010')::uuid]::uuid[], true, 2006),

(md5('f018')::uuid, md5('b008')::uuid, 'Un Jardin sur le Nil', 'un-jardin-sur-le-nil', 'edt', 'Green Aquatic', 'unisex',
  ARRAY['Grapefruit','Green Mango'], ARRAY['Lotus','Peony'], ARRAY['Wood'],
  ARRAY['aquatic','green','fresh','floral'],
  '{"aquatic":4,"green":5,"fresh":4,"floral":3}'::jsonb,
  3,2,2, 0.68,0.82,0.90, 4,15000,
  'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600',
  ARRAY[md5('f011')::uuid, md5('f008')::uuid, md5('f020')::uuid]::uuid[], true, 2005),

-- BYREDO
(md5('f019')::uuid, md5('b009')::uuid, 'Gypsy Water', 'gypsy-water', 'edp', 'Woody Aromatic', 'unisex',
  ARRAY['Bergamot','Lemon','Pepper'], ARRAY['Incense','Orris','Pine Needles'], ARRAY['Amber','Sandalwood','Vanilla'],
  ARRAY['aromatic','woody','resinous','fresh'],
  '{"aromatic":4,"woody":4,"resinous":4,"fresh":3}'::jsonb,
  4,3,3, 0.80,0.78,0.72, 4,30000,
  'https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=600',
  ARRAY[md5('f020')::uuid, md5('f029')::uuid, md5('f007')::uuid]::uuid[], true, 2008),

(md5('f020')::uuid, md5('b009')::uuid, 'Mojave Ghost', 'mojave-ghost', 'edp', 'Floral Woody Musk', 'unisex',
  ARRAY['Sapodilla','Magnolia'], ARRAY['Ambrette','Violet'], ARRAY['Sandalwood','Cedarwood','Musk'],
  ARRAY['woody','musky','floral','soft'],
  '{"woody":4,"musky":5,"floral":3,"soft":4}'::jsonb,
  4,3,3, 0.75,0.80,0.85, 4,28000,
  'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=600',
  ARRAY[md5('f019')::uuid, md5('f025')::uuid, md5('f028')::uuid]::uuid[], true, 2014),

-- LE LABO
(md5('f021')::uuid, md5('b010')::uuid, 'Santal 33', 'santal-33', 'edp', 'Woody Aromatic', 'unisex',
  ARRAY['Cardamom','Iris','Violet'], ARRAY['Ambrox','Cedarwood','Sandalwood'], ARRAY['Leather','Papyrus','Musk'],
  ARRAY['woody','sandalwood','smoky','aromatic'],
  '{"woody":5,"sandalwood":5,"smoky":4,"aromatic":3}'::jsonb,
  4,3,3, 0.78,0.72,0.65, 5,32000,
  'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=600',
  ARRAY[md5('f007')::uuid, md5('f019')::uuid, md5('f020')::uuid]::uuid[], true, 2011),

(md5('f022')::uuid, md5('b010')::uuid, 'Rose 31', 'rose-31', 'edp', 'Floral Woody', 'unisex',
  ARRAY['Cumin','Grapefruit'], ARRAY['Rose','Laurel'], ARRAY['Oud','Musk','Cedar'],
  ARRAY['rose','woody','spicy','floral'],
  '{"rose":4,"woody":4,"spicy":3,"floral":4}'::jsonb,
  4,3,3, 0.75,0.70,0.65, 5,30000,
  'https://images.unsplash.com/photo-1541643600914-78b084683702?w=600',
  ARRAY[md5('f021')::uuid, md5('f023')::uuid, md5('f019')::uuid]::uuid[], true, 2006),

-- MAISON MARGIELA
(md5('f023')::uuid, md5('b011')::uuid, 'Replica - By the Fireplace', 'replica-by-the-fireplace', 'edp', 'Woody Smoky', 'unisex',
  ARRAY['Clementine','Pink Pepper','Cardamom'], ARRAY['Chestnut','Guaiac Wood'], ARRAY['Vanilla','Cashmeran','Musk'],
  ARRAY['smoky','woody','gourmand','cozy'],
  '{"smoky":5,"woody":4,"gourmand":3,"cozy":5}'::jsonb,
  4,3,3, 0.80,0.75,0.68, 3,17500,
  'https://images.unsplash.com/photo-1573575155376-b5010099301b?w=600',
  ARRAY[md5('f007')::uuid, md5('f021')::uuid, md5('f024')::uuid]::uuid[], true, 2015),

(md5('f024')::uuid, md5('b011')::uuid, 'Replica - Lazy Sunday Morning', 'replica-lazy-sunday-morning', 'edp', 'Floral Musk', 'unisex',
  ARRAY['Aldehydes'], ARRAY['Rose','Peony','Lily of the Valley'], ARRAY['White Musks','Sandalwood'],
  ARRAY['floral','musky','clean','soft'],
  '{"floral":4,"musky":5,"clean":4,"soft":5}'::jsonb,
  3,2,2, 0.70,0.80,0.90, 3,17000,
  'https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=600',
  ARRAY[md5('f023')::uuid, md5('f004')::uuid, md5('f028')::uuid]::uuid[], true, 2012),

-- PARFUMS DE MARLY
(md5('f025')::uuid, md5('b012')::uuid, 'Herod', 'herod', 'edp', 'Oriental Spicy', 'masculine',
  ARRAY['Cinnamon'], ARRAY['Tobacco','Vanilla'], ARRAY['Patchouli','Amber'],
  ARRAY['spicy','tobacco','vanilla','oriental'],
  '{"spicy":4,"tobacco":5,"vanilla":4,"oriental":4}'::jsonb,
  5,4,4, 0.82,0.62,0.45, 5,38000,
  'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=600',
  ARRAY[md5('f026')::uuid, md5('f006')::uuid, md5('f007')::uuid]::uuid[], true, 2012),

(md5('f026')::uuid, md5('b012')::uuid, 'Layton', 'layton', 'edp', 'Aromatic Spicy', 'masculine',
  ARRAY['Apple','Bergamot','Lavender'], ARRAY['Geranium','Jasmine','Violet'], ARRAY['Sandalwood','Amber','Vanilla','Musk'],
  ARRAY['aromatic','fresh','spicy','woody'],
  '{"aromatic":4,"fresh":3,"spicy":3,"woody":4}'::jsonb,
  5,4,4, 0.90,0.82,0.78, 5,38000,
  'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=600',
  ARRAY[md5('f025')::uuid, md5('f003')::uuid, md5('f009')::uuid]::uuid[], true, 2016),

(md5('f027')::uuid, md5('b012')::uuid, 'Delina', 'delina', 'edp', 'Floral', 'feminine',
  ARRAY['Lychee','Bergamot','Rhubarb'], ARRAY['Turkish Rose','Peony','Violet'], ARRAY['Cashmeran','Musk','Vanilla'],
  ARRAY['floral','fruity','rose','powdery'],
  '{"floral":5,"fruity":3,"rose":5,"powdery":4}'::jsonb,
  5,4,4, 0.88,0.75,0.72, 5,38000,
  'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600',
  ARRAY[md5('f004')::uuid, md5('f012')::uuid, md5('f022')::uuid]::uuid[], true, 2017),

-- AMOUAGE
(md5('f028')::uuid, md5('b013')::uuid, 'Interlude Man', 'interlude-man', 'edp', 'Oriental Woody', 'masculine',
  ARRAY['Oregano','Bergamot','Pepper'], ARRAY['Cistus','Amber','Frankincense'], ARRAY['Oud','Sandalwood','Leather'],
  ARRAY['smoky','oud','resinous','spicy'],
  '{"smoky":5,"oud":4,"resinous":5,"spicy":4}'::jsonb,
  5,5,5, 0.75,0.52,0.35, 5,45000,
  'https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=600',
  ARRAY[md5('f007')::uuid, md5('f030')::uuid, md5('f031')::uuid]::uuid[], true, 2012),

(md5('f029')::uuid, md5('b013')::uuid, 'Reflection Man', 'reflection-man', 'edp', 'Aromatic Floral', 'masculine',
  ARRAY['Lavandin','Bergamot'], ARRAY['Neroli','Rose','Jasmine'], ARRAY['Sandalwood','Amber','Musks'],
  ARRAY['aromatic','floral','fresh','soapy'],
  '{"aromatic":4,"floral":4,"fresh":3,"soapy":4}'::jsonb,
  4,4,4, 0.80,0.72,0.78, 5,43000,
  'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600',
  ARRAY[md5('f001')::uuid, md5('f010')::uuid, md5('f019')::uuid]::uuid[], true, 2007),

-- INITIO
(md5('f030')::uuid, md5('b014')::uuid, 'Oud for Greatness', 'oud-for-greatness', 'edp', 'Woody Oriental', 'unisex',
  ARRAY['Oud','Nutmeg'], ARRAY['Saffron','Patchouli'], ARRAY['Musk','Civet'],
  ARRAY['oud','smoky','animalic','spicy'],
  '{"oud":5,"smoky":4,"animalic":4,"spicy":4}'::jsonb,
  5,5,5, 0.72,0.50,0.35, 5,32000,
  'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=600',
  ARRAY[md5('f007')::uuid, md5('f028')::uuid, md5('f031')::uuid]::uuid[], true, 2019),

(md5('f031')::uuid, md5('b014')::uuid, 'Atomic Rose', 'atomic-rose', 'edp', 'Floral Woody Musk', 'unisex',
  ARRAY['Rose','Pepper'], ARRAY['Rose','Oud'], ARRAY['Amber','Musk','Sandalwood'],
  ARRAY['rose','oud','woody','floral'],
  '{"rose":5,"oud":4,"woody":3,"floral":4}'::jsonb,
  4,4,4, 0.78,0.68,0.60, 5,30000,
  'https://images.unsplash.com/photo-1573575155376-b5010099301b?w=600',
  ARRAY[md5('f030')::uuid, md5('f022')::uuid, md5('f007')::uuid]::uuid[], true, 2019),

-- XERJOFF
(md5('f032')::uuid, md5('b015')::uuid, 'Naxos', 'naxos', 'edp', 'Oriental Vanilla', 'masculine',
  ARRAY['Bergamot','Lemon'], ARRAY['Honey','Lavender','Iris'], ARRAY['Tobacco','Vanilla','Tonka Bean','Sandalwood'],
  ARRAY['vanilla','tobacco','honey','oriental'],
  '{"vanilla":5,"tobacco":4,"honey":4,"oriental":5}'::jsonb,
  5,4,4, 0.85,0.65,0.58, 5,47000,
  'https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=600',
  ARRAY[md5('f025')::uuid, md5('f033')::uuid, md5('f013')::uuid]::uuid[], true, 2014),

(md5('f033')::uuid, md5('b015')::uuid, 'Erba Pura', 'erba-pura', 'edp', 'Fruity Floral', 'unisex',
  ARRAY['Sicilian Mandarin','Bergamot'], ARRAY['Jasmine','Orange Blossom','Peach'], ARRAY['Amber','Musk','Sandalwood'],
  ARRAY['citrus','floral','fresh','fruity'],
  '{"citrus":4,"floral":4,"fresh":4,"fruity":3}'::jsonb,
  4,4,4, 0.82,0.78,0.80, 5,38000,
  'https://images.unsplash.com/photo-1541643600914-78b084683702?w=600',
  ARRAY[md5('f008')::uuid, md5('f018')::uuid, md5('f034')::uuid]::uuid[], true, 2015),

-- ACQUA DI PARMA
(md5('f034')::uuid, md5('b016')::uuid, 'Colonia', 'colonia', 'cologne', 'Citrus Aromatic', 'unisex',
  ARRAY['Calabrian Bergamot','Lemon','Orange'], ARRAY['Rose','Lavender','Verbena'], ARRAY['Sandalwood','Vetiver','Musk'],
  ARRAY['citrus','aromatic','classic','fresh'],
  '{"citrus":5,"aromatic":4,"classic":4,"fresh":4}'::jsonb,
  3,3,3, 0.78,0.85,0.92, 4,19500,
  'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600',
  ARRAY[md5('f008')::uuid, md5('f011')::uuid, md5('f033')::uuid]::uuid[], true, 1916),

-- DIPTYQUE
(md5('f035')::uuid, md5('b017')::uuid, 'Philosophia', 'philosophia', 'edp', 'Woody Oriental', 'unisex',
  ARRAY['Cardamom','Bergamot'], ARRAY['Rose','Oud'], ARRAY['Sandalwood','Labdanum','Musk'],
  ARRAY['woody','oud','spicy','oriental'],
  '{"woody":4,"oud":4,"spicy":3,"oriental":4}'::jsonb,
  4,3,3, 0.70,0.65,0.62, 4,26000,
  'https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=600',
  ARRAY[md5('f007')::uuid, md5('f019')::uuid, md5('f028')::uuid]::uuid[], true, 2018),

(md5('f036')::uuid, md5('b017')::uuid, 'Do Son', 'do-son', 'edt', 'Floral Aquatic', 'feminine',
  ARRAY['Pepper'], ARRAY['Tuberose','Rose','Jasmine'], ARRAY['White Musks'],
  ARRAY['floral','aquatic','tuberose','fresh'],
  '{"floral":5,"aquatic":3,"tuberose":5,"fresh":3}'::jsonb,
  3,3,3, 0.72,0.70,0.75, 4,22500,
  'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=600',
  ARRAY[md5('f004')::uuid, md5('f012')::uuid, md5('f022')::uuid]::uuid[], true, 2005),

-- MAISON FRANCIS KURKDJIAN
(md5('f037')::uuid, md5('b018')::uuid, 'Baccarat Rouge 540', 'baccarat-rouge-540', 'edp', 'Floral Woody Musk', 'unisex',
  ARRAY['Jasmine','Saffron'], ARRAY['Amberwood','Ambergris'], ARRAY['Fir Resin','Cedar'],
  ARRAY['amber','floral','woody','sweet'],
  '{"amber":5,"floral":4,"woody":3,"sweet":4}'::jsonb,
  5,4,4, 0.90,0.75,0.68, 5,38500,
  'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=600',
  ARRAY[md5('f021')::uuid, md5('f020')::uuid, md5('f023')::uuid]::uuid[], true, 2015),

(md5('f038')::uuid, md5('b018')::uuid, 'Aqua Universalis', 'aqua-universalis', 'edp', 'Floral Musk', 'unisex',
  ARRAY['Bergamot','Lemon'], ARRAY['White Flowers','White Musk'], ARRAY['Sandalwood','Vetiver'],
  ARRAY['floral','clean','musky','fresh'],
  '{"floral":4,"clean":5,"musky":4,"fresh":4}'::jsonb,
  3,3,3, 0.75,0.82,0.88, 5,33000,
  'https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=600',
  ARRAY[md5('f024')::uuid, md5('f020')::uuid, md5('f011')::uuid]::uuid[], true, 2009),

-- FREDERIC MALLE
(md5('f039')::uuid, md5('b019')::uuid, 'Portrait of a Lady', 'portrait-of-a-lady', 'edp', 'Floral Oriental', 'feminine',
  ARRAY['Blackcurrant','Raspberry'], ARRAY['Turkish Rose','Patchouli','Cloves'], ARRAY['Sandalwood','Musk','Amber'],
  ARRAY['rose','woody','spicy','floral'],
  '{"rose":5,"woody":4,"spicy":4,"floral":4}'::jsonb,
  5,4,4, 0.82,0.65,0.55, 5,44000,
  'https://images.unsplash.com/photo-1573575155376-b5010099301b?w=600',
  ARRAY[md5('f027')::uuid, md5('f022')::uuid, md5('f002')::uuid]::uuid[], true, 2010),

(md5('f040')::uuid, md5('b019')::uuid, 'Musc Ravageur', 'musc-ravageur', 'edp', 'Oriental Musk', 'unisex',
  ARRAY['Bergamot','Mandarin','Lavender'], ARRAY['Cinnamon'], ARRAY['Sandalwood','Musk','Vanilla','Amber'],
  ARRAY['musky','warm','spicy','vanilla'],
  '{"musky":5,"warm":5,"spicy":3,"vanilla":4}'::jsonb,
  5,4,4, 0.75,0.60,0.48, 5,42000,
  'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600',
  ARRAY[md5('f015')::uuid, md5('f032')::uuid, md5('f025')::uuid]::uuid[], true, 2000),

-- SERGE LUTENS
(md5('f041')::uuid, md5('b020')::uuid, 'Feminite du Bois', 'feminite-du-bois', 'edp', 'Woody Floral Musk', 'unisex',
  ARRAY['Cedar','Peach','Plum'], ARRAY['Cedar','Rose','Violet'], ARRAY['Sandalwood','Benzoin','Honey'],
  ARRAY['woody','cedar','fruity','dark'],
  '{"woody":5,"cedar":5,"fruity":3,"dark":4}'::jsonb,
  5,3,3, 0.72,0.60,0.62, 5,38000,
  'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=600',
  ARRAY[md5('f007')::uuid, md5('f021')::uuid, md5('f039')::uuid]::uuid[], true, 1992),

-- VALENTINO
(md5('f042')::uuid, md5('b021')::uuid, 'Valentino Donna Born in Roma', 'valentino-donna-born-in-roma', 'edp', 'Floral Woody', 'feminine',
  ARRAY['Black Currant','Bergamot'], ARRAY['Jasmine Sambac','Rose'], ARRAY['Vanilla','Patchouli','Musks'],
  ARRAY['floral','fruity','woody','vanilla'],
  '{"floral":4,"fruity":3,"woody":3,"vanilla":4}'::jsonb,
  3,3,3, 0.80,0.75,0.78, 3,12500,
  'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600',
  ARRAY[md5('f004')::uuid, md5('f013')::uuid, md5('f014')::uuid]::uuid[], true, 2019),

-- PRADA
(md5('f043')::uuid, md5('b022')::uuid, 'La Femme Prada', 'la-femme-prada', 'edp', 'Floral Oriental', 'feminine',
  ARRAY['Aldehydes','Ylang-ylang'], ARRAY['Tuberose','Patchouli'], ARRAY['Vanilla','Amber'],
  ARRAY['floral','oriental','powdery','warm'],
  '{"floral":4,"oriental":4,"powdery":3,"warm":4}'::jsonb,
  4,3,3, 0.72,0.68,0.65, 3,11000,
  'https://images.unsplash.com/photo-1541643600914-78b084683702?w=600',
  ARRAY[md5('f002')::uuid, md5('f015')::uuid, md5('f039')::uuid]::uuid[], true, 2016),

(md5('f044')::uuid, md5('b022')::uuid, 'Luna Rossa Carbon', 'luna-rossa-carbon', 'edt', 'Aromatic Fougere', 'masculine',
  ARRAY['Calabrian Bergamot','Lavender'], ARRAY['Ambrox','Violet','Orris'], ARRAY['Cashmeran','Gray Musks'],
  ARRAY['aromatic','fresh','woody','clean'],
  '{"aromatic":4,"fresh":4,"woody":3,"clean":4}'::jsonb,
  3,3,3, 0.80,0.82,0.85, 3,10000,
  'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=600',
  ARRAY[md5('f003')::uuid, md5('f001')::uuid, md5('f046')::uuid]::uuid[], true, 2017),

-- GIORGIO ARMANI
(md5('f045')::uuid, md5('b023')::uuid, 'Acqua di Gio', 'acqua-di-gio', 'edt', 'Citrus Aromatic', 'masculine',
  ARRAY['Lime','Lemon','Orange','Bergamot'], ARRAY['Jasmine','Calone','Persimmon'], ARRAY['White Musks','Cedar','Oakmoss'],
  ARRAY['aquatic','fresh','citrus','aromatic'],
  '{"aquatic":5,"fresh":5,"citrus":4,"aromatic":3}'::jsonb,
  3,3,3, 0.82,0.85,0.88, 2,8500,
  'https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=600',
  ARRAY[md5('f008')::uuid, md5('f011')::uuid, md5('f034')::uuid]::uuid[], true, 1996),

(md5('f046')::uuid, md5('b023')::uuid, 'Armani Code', 'armani-code', 'edp', 'Oriental Woody', 'masculine',
  ARRAY['Bergamot','Lemon'], ARRAY['Star Anise','Cardamom','Guaiac Wood'], ARRAY['Leather','Tonka Bean','Olive'],
  ARRAY['spicy','woody','warm','aromatic'],
  '{"spicy":4,"woody":4,"warm":4,"aromatic":3}'::jsonb,
  4,3,3, 0.82,0.75,0.72, 3,10500,
  'https://images.unsplash.com/photo-1573575155376-b5010099301b?w=600',
  ARRAY[md5('f003')::uuid, md5('f005')::uuid, md5('f025')::uuid]::uuid[], true, 2004),

-- BURBERRY
(md5('f047')::uuid, md5('b024')::uuid, 'Mr. Burberry', 'mr-burberry', 'edp', 'Woody Aromatic', 'masculine',
  ARRAY['Grapefruit','Basil','Cardamom'], ARRAY['Birch','Geranium'], ARRAY['Sandalwood','Suede','Vetiver'],
  ARRAY['aromatic','woody','fresh','spicy'],
  '{"aromatic":4,"woody":4,"fresh":3,"spicy":3}'::jsonb,
  3,3,3, 0.78,0.78,0.80, 2,8000,
  'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=600',
  ARRAY[md5('f001')::uuid, md5('f017')::uuid, md5('f003')::uuid]::uuid[], true, 2016),

-- VIKTOR & ROLF
(md5('f048')::uuid, md5('b025')::uuid, 'Flowerbomb', 'flowerbomb', 'edp', 'Floral Oriental', 'feminine',
  ARRAY['Tea','Bergamot','Jasmine'], ARRAY['Freesia','Orchid','Rose','Patchouli'], ARRAY['Vanilla','Amber','Musk'],
  ARRAY['floral','sweet','powdery','vanilla'],
  '{"floral":5,"sweet":4,"powdery":4,"vanilla":4}'::jsonb,
  4,4,4, 0.85,0.68,0.58, 3,14000,
  'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600',
  ARRAY[md5('f002')::uuid, md5('f013')::uuid, md5('f043')::uuid]::uuid[], true, 2005),

(md5('f049')::uuid, md5('b025')::uuid, 'Spicebomb Extreme', 'spicebomb-extreme', 'edp', 'Oriental Spicy', 'masculine',
  ARRAY['Bergamot','Cardamom'], ARRAY['Cinnamon','Tobacco','Saffron'], ARRAY['Amber','Vanilla','Leather'],
  ARRAY['spicy','tobacco','warm','oriental'],
  '{"spicy":5,"tobacco":4,"warm":4,"oriental":4}'::jsonb,
  4,4,4, 0.82,0.65,0.52, 3,11500,
  'https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=600',
  ARRAY[md5('f025')::uuid, md5('f046')::uuid, md5('f040')::uuid]::uuid[], true, 2015),

-- LE LABO bonus
(md5('f050')::uuid, md5('b010')::uuid, 'Bergamote 22', 'bergamote-22', 'edp', 'Citrus Aromatic', 'unisex',
  ARRAY['Bergamot','Grapefruit','Petitgrain'], ARRAY['Neroli','Lily'], ARRAY['Musk','Sandalwood','Vetiver'],
  ARRAY['citrus','fresh','clean','aromatic'],
  '{"citrus":5,"fresh":4,"clean":4,"aromatic":3}'::jsonb,
  3,3,3, 0.75,0.85,0.90, 5,30000,
  'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600',
  ARRAY[md5('f008')::uuid, md5('f034')::uuid, md5('f038')::uuid]::uuid[], true, 2006)

ON CONFLICT (id) DO NOTHING;
