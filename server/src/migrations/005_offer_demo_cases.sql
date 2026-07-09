UPDATE products
SET is_listed_on_4000m = 0,
    listing_status = 'à_référencer',
    price_4000m = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE name LIKE 'Option vidéo Nantes';

UPDATE products
SET partner_public_price = price_4000m - 20,
    updated_at = CURRENT_TIMESTAMP
WHERE name LIKE 'Saut tandem Annecy';

UPDATE products
SET min_margin_rate = 35,
    updated_at = CURRENT_TIMESTAMP
WHERE name LIKE 'Saut tandem Fréjus';

INSERT INTO tasks (partner_id, product_id, type, priority, title, description, status, source, due_date)
SELECT partner_id, id, 'référencement', 'haute', 'Référencer le produit ' || name || ' chez 4000m',
       'Produit vendu par le partenaire mais absent du catalogue 4000m.', 'ouverte', 'automatique', date('now','+7 days')
FROM products p
WHERE p.is_listed_on_4000m = 0
  AND NOT EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.partner_id = p.partner_id AND t.product_id = p.id AND t.type = 'référencement' AND t.status IN ('ouverte', 'en_cours')
  );
