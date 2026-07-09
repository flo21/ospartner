ALTER TABLE products ADD COLUMN margin_exception_accepted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN margin_exception_reason TEXT;

ALTER TABLE crm_card_items ADD COLUMN partner_id TEXT REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE crm_card_items ADD COLUMN product_id TEXT REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE crm_card_items ADD COLUMN type TEXT;
ALTER TABLE crm_card_items ADD COLUMN anomaly_code TEXT;
ALTER TABLE crm_card_items ADD COLUMN description TEXT;
ALTER TABLE crm_card_items ADD COLUMN priority TEXT NOT NULL DEFAULT 'moyenne';
ALTER TABLE crm_card_items ADD COLUMN completed_at TEXT;
ALTER TABLE crm_card_items ADD COLUMN ignored INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_card_items ADD COLUMN ignore_reason TEXT;

UPDATE crm_card_items
SET
  partner_id = (SELECT partner_id FROM crm_cards WHERE crm_cards.id = crm_card_items.card_id),
  product_id = (SELECT product_id FROM crm_cards WHERE crm_cards.id = crm_card_items.card_id),
  type = COALESCE((SELECT type FROM crm_cards WHERE crm_cards.id = crm_card_items.card_id), 'autre'),
  priority = COALESCE((SELECT priority FROM crm_cards WHERE crm_cards.id = crm_card_items.card_id), 'moyenne');

CREATE INDEX idx_crm_items_anomaly ON crm_card_items(partner_id, product_id, type, anomaly_code);
CREATE INDEX idx_crm_items_partner ON crm_card_items(partner_id, completed, ignored);
