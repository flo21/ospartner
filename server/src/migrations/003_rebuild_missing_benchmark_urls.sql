INSERT INTO monitored_urls (product_id, url, url_type, label, last_detected_price, last_checked_at, status)
SELECT
  p.id,
  'https://partner.example/products/' || p.id,
  'partenaire',
  'Site partenaire',
  p.price_4000m - 10,
  datetime('now','-1 day'),
  'ok'
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM monitored_urls mu WHERE mu.product_id = p.id);

INSERT INTO monitored_urls (product_id, url, url_type, label, last_detected_price, last_checked_at, status)
SELECT
  p.id,
  'https://sport-decouverte.example/products/' || p.id,
  'concurrent',
  'Sport Découverte',
  p.price_4000m - 25,
  datetime('now','-1 day'),
  'anomalie'
FROM products p
WHERE (SELECT COUNT(*) FROM monitored_urls mu WHERE mu.product_id = p.id) = 1;

INSERT INTO monitored_urls (product_id, url, url_type, label, last_detected_price, last_checked_at, status)
SELECT
  p.id,
  'https://cap-adrenaline.example/products/' || p.id,
  'concurrent',
  'Cap Adrénaline',
  p.price_4000m + 5,
  datetime('now','-1 day'),
  'ok'
FROM products p
WHERE (SELECT COUNT(*) FROM monitored_urls mu WHERE mu.product_id = p.id) = 2;
