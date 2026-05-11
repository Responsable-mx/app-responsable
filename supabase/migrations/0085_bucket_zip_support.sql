-- Permitir ZIPs en bucket client-documents para upload directo cliente (presigned URL)
-- file_size_limit: 25MB → 100MB (el ZIP es contenedor; archivos extraídos siguen limitados a 25MB en la API)
UPDATE storage.buckets
SET
  file_size_limit = 104857600, -- 100 MB
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.ms-powerpoint',
    'application/vnd.ms-excel',
    'text/plain',
    'text/markdown',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream'  -- Windows envía ZIPs como octet-stream
  ]
WHERE id = 'client-documents';
