-- Biblioteca de imágenes de tragos (uploads) + bucket Storage público.

CREATE TABLE IF NOT EXISTS drink_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path        TEXT NOT NULL UNIQUE,
  url         TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE drink_images ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE policyname = 'drink_images_service_role_only'
      AND tablename = 'drink_images'
  ) THEN
    CREATE POLICY drink_images_service_role_only
      ON drink_images
      FOR ALL
      TO authenticated, anon
      USING (false);
  END IF;
END $$;

GRANT ALL PRIVILEGES ON TABLE drink_images TO postgres, service_role;
REVOKE ALL PRIVILEGES ON TABLE drink_images FROM anon, authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'drink-images',
      'drink-images',
      true,
      2097152,
      ARRAY['image/webp']::text[]
    )
    ON CONFLICT (id) DO UPDATE SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    -- Lectura pública del bucket; escritura solo service_role (API).
    EXECUTE 'DROP POLICY IF EXISTS drink_images_public_read ON storage.objects;';
    EXECUTE 'CREATE POLICY drink_images_public_read ON storage.objects FOR SELECT TO public USING (bucket_id = ''drink-images'');';
  END IF;
END $$;

