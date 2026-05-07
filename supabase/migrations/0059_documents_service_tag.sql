-- Agrega etiqueta opcional de servicio a documentos del cliente.
-- Permite indicar para qué servicio aplica un documento (ej. Doble Materialidad IA).
ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS service_tag TEXT;
