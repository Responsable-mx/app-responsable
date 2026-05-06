-- Sprint A: agregar servicio "Doble materialidad por IA" al catálogo
INSERT INTO catalog_items (category, value, label, sort_order, is_active)
VALUES ('services', 'doble_materialidad_ia', 'Doble materialidad por IA', 11, true)
ON CONFLICT (category, value) DO NOTHING;
