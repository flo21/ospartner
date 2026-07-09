ALTER TABLE partners ADD COLUMN afifly_url TEXT;

UPDATE partners
SET afifly_url = 'https://' || afifly_subdomain || '.afifly.fr'
WHERE afifly_subdomain IS NOT NULL
  AND afifly_subdomain <> ''
  AND afifly_url IS NULL;
