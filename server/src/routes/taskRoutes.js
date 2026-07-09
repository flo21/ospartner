import { Router } from 'express';
import { body, param } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../utils/validation.js';

export const taskRoutes = Router();
taskRoutes.use(authenticate, requireRole('admin'));

const statuses = ['todo', 'doing', 'done', 'ignored'];
const priorities = ['basse', 'moyenne', 'haute', 'critique'];
const types = ['référencement', 'prix', 'marge', 'benchmark', 'contrat', 'autre', 'facture'];

function normalizeStatus(status) {
  const map = { ouverte: 'todo', en_cours: 'doing', traitée: 'done', ignorée: 'ignored' };
  return map[status] || status;
}

function orderTasks(rows) {
  return rows.sort((a, b) => {
    const priorityOrder = { critique: 1, haute: 2, moyenne: 3, basse: 4 };
    return (priorityOrder[a.priority] || 5) - (priorityOrder[b.priority] || 5) || new Date(a.created_at) - new Date(b.created_at);
  });
}

function groupKanban(rows) {
  const columns = {
    todo: [],
    doing: [],
    done: []
  };
  for (const status of Object.keys(columns)) {
    const byPartner = new Map();
    for (const task of rows.filter((row) => row.status === status)) {
      const key = task.partner_id || `task-${task.id}`;
      if (!byPartner.has(key)) {
        byPartner.set(key, {
          partner_id: task.partner_id,
          partner_name: task.partner_name || 'Sans partenaire',
          priority: task.priority,
          tasks: []
        });
      }
      const card = byPartner.get(key);
      card.tasks.push(task);
      if (priorities.indexOf(task.priority) > priorities.indexOf(card.priority)) card.priority = task.priority;
    }
    columns[status] = [...byPartner.values()].map((card) => ({ ...card, tasks: orderTasks(card.tasks) }));
  }
  return columns;
}

function mapCard(row) {
  const items = row.items_json ? JSON.parse(row.items_json) : [];
  return {
    ...row,
    items: items.filter((item) => item.id)
  };
}

async function refreshCardStatus(cardId) {
  const items = await query('SELECT priority, completed, ignored FROM crm_card_items WHERE card_id = $1', [cardId]);
  if (!items.rowCount) return;
  const priorityOrder = { basse: 1, moyenne: 2, haute: 3, critique: 4 };
  const priority = items.rows.reduce((current, item) => (
    priorityOrder[item.priority] > priorityOrder[current] ? item.priority : current
  ), 'basse');
  const allResolved = items.rows.every((item) => Number(item.completed) === 1 || Number(item.ignored) === 1);
  await query(
    `UPDATE crm_cards
     SET priority = $2,
         status = CASE WHEN $3 = 1 THEN 'done' WHEN status = 'done' THEN 'todo' ELSE status END,
         resolved_at = CASE WHEN $3 = 1 THEN COALESCE(resolved_at, CURRENT_TIMESTAMP) ELSE NULL END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [cardId, priority, allResolved ? 1 : 0]
  );
}

async function loadCards(where = '', params = []) {
  const result = await query(`
    SELECT
      c.*,
      p.name AS partner_name,
      pr.name AS product_name,
      COALESCE(
        json_group_array(
          json_object(
            'id', item.id,
            'label', item.label,
            'completed', item.completed,
            'completed_at', item.completed_at,
            'ignored', item.ignored,
            'ignore_reason', item.ignore_reason,
            'partner_id', item.partner_id,
            'product_id', item.product_id,
            'type', item.type,
            'anomaly_code', item.anomaly_code,
            'description', item.description,
            'priority', item.priority,
            'position', item.position,
            'created_at', item.created_at,
            'updated_at', item.updated_at
          )
        ) FILTER (WHERE item.id IS NOT NULL),
        '[]'
      ) AS items_json
    FROM crm_cards c
    LEFT JOIN partners p ON p.id = c.partner_id
    LEFT JOIN products pr ON pr.id = c.product_id
    LEFT JOIN crm_card_items item ON item.card_id = c.id
    ${where}
    GROUP BY c.id
    ORDER BY CASE c.priority WHEN 'critique' THEN 1 WHEN 'haute' THEN 2 WHEN 'moyenne' THEN 3 ELSE 4 END, c.created_at DESC
  `, params);
  return result.rows.map(mapCard);
}

function groupCardKanban(cards) {
  return {
    todo: cards.filter((card) => card.status === 'todo'),
    doing: cards.filter((card) => card.status === 'doing'),
    done: cards.filter((card) => card.status === 'done')
  };
}

async function replaceChecklist(cardId, items = []) {
  const card = await query('SELECT partner_id FROM crm_cards WHERE id = $1', [cardId]);
  const partnerId = card.rows[0]?.partner_id || null;
  await query('DELETE FROM crm_card_items WHERE card_id = $1', [cardId]);
  for (const [index, item] of items.entries()) {
    const label = typeof item === 'string' ? item : item.label;
    if (!label) continue;
    await query(
      `INSERT INTO crm_card_items (card_id, partner_id, type, label, completed, completed_at, ignored, ignore_reason, priority, position)
       VALUES ($1, $2, 'autre', $3, $4, CASE WHEN $4 = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, $5, $6, $7, $8)`,
      [
        cardId,
        partnerId,
        label,
        typeof item === 'string' ? 0 : Number(Boolean(item.completed)),
        typeof item === 'string' ? 0 : Number(Boolean(item.ignored)),
        typeof item === 'string' ? null : item.ignore_reason || null,
        typeof item === 'string' ? 'moyenne' : item.priority || 'moyenne',
        index
      ]
    );
  }
  await refreshCardStatus(cardId);
}

taskRoutes.get('/', asyncHandler(async (req, res) => {
  const params = [];
  const filters = [];
  const add = (sql, value) => {
    params.push(value);
    filters.push(sql.replace('?', `$${params.length}`));
  };
  if (req.query.priority) add('t.priority = ?', req.query.priority);
  if (req.query.type) add('t.type = ?', req.query.type);
  if (req.query.partner_id) add('t.partner_id = ?', req.query.partner_id);
  if (req.query.status) add('t.status = ?', normalizeStatus(req.query.status));
  if (req.query.open) filters.push("t.status IN ('todo', 'doing')");
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : "WHERE t.status IN ('todo', 'doing')";
  const result = await query(`
    SELECT t.*, p.name AS partner_name, pr.name AS product_name
    FROM tasks t
    LEFT JOIN partners p ON p.id = t.partner_id
    LEFT JOIN products pr ON pr.id = t.product_id
    ${where}
    ORDER BY CASE t.priority WHEN 'critique' THEN 1 WHEN 'haute' THEN 2 WHEN 'moyenne' THEN 3 ELSE 4 END, t.created_at DESC
  `, params);
  res.json(result.rows);
}));

taskRoutes.get('/kanban', asyncHandler(async (_req, res) => {
  const cards = await loadCards("WHERE c.status IN ('todo', 'doing', 'done')");
  res.json(groupCardKanban(cards));
}));

taskRoutes.get('/cards', asyncHandler(async (req, res) => {
  const params = [];
  const filters = [];
  const add = (sql, value) => {
    params.push(value);
    filters.push(sql.replace('?', `$${params.length}`));
  };
  if (req.query.partner_id) add('c.partner_id = ?', req.query.partner_id);
  if (req.query.status) add('c.status = ?', normalizeStatus(req.query.status));
  if (req.query.open) filters.push("c.status IN ('todo', 'doing')");
  const cards = await loadCards(filters.length ? `WHERE ${filters.join(' AND ')}` : '', params);
  res.json(cards);
}));

taskRoutes.post(
  '/cards',
  body('partner_id').optional({ nullable: true }).isUUID(),
  body('title').notEmpty(),
  body('priority').isIn(priorities),
  body('status').customSanitizer(normalizeStatus).isIn(statuses),
  validate,
  asyncHandler(async (req, res) => {
    const result = await query(
      `INSERT INTO crm_cards (partner_id, title, description, priority, status, source, due_date, notes, type)
       VALUES ($1, $2, $3, $4, $5, 'manuel', $6, $7, 'autre')
       RETURNING *`,
      [req.body.partner_id || null, req.body.title, req.body.description || null, req.body.priority, normalizeStatus(req.body.status), req.body.due_date || null, req.body.notes || null]
    );
    await replaceChecklist(result.rows[0].id, req.body.items || []);
    const cards = await loadCards('WHERE c.id = $1', [result.rows[0].id]);
    res.status(201).json(cards[0]);
  })
);

taskRoutes.put(
  '/cards/:id',
  param('id').isUUID(),
  body('partner_id').optional({ nullable: true }).isUUID(),
  body('title').optional().notEmpty(),
  body('priority').optional().isIn(priorities),
  body('status').optional().customSanitizer(normalizeStatus).isIn(statuses),
  validate,
  asyncHandler(async (req, res) => {
    const fields = ['partner_id', 'title', 'description', 'priority', 'status', 'due_date', 'notes']
      .filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (fields.length) {
      const values = fields.map((field) => field === 'status' ? normalizeStatus(req.body[field]) : req.body[field] || null);
      values.push(req.params.id);
      await query(
        `UPDATE crm_cards
         SET ${fields.map((field, index) => `${field} = $${index + 1}`).join(', ')},
             resolved_at = CASE WHEN status = 'done' THEN CURRENT_TIMESTAMP ELSE NULL END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $${values.length}`,
        values
      );
    }
    if (Array.isArray(req.body.items)) await replaceChecklist(req.params.id, req.body.items);
    const cards = await loadCards('WHERE c.id = $1', [req.params.id]);
    res.json(cards[0]);
  })
);

taskRoutes.delete('/cards/:id', param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  await query('DELETE FROM crm_cards WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));

taskRoutes.post('/cards/:id/checklist', param('id').isUUID(), body('label').notEmpty(), validate, asyncHandler(async (req, res) => {
  const card = await query('SELECT partner_id FROM crm_cards WHERE id = $1', [req.params.id]);
  const position = await query('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM crm_card_items WHERE card_id = $1', [req.params.id]);
  const result = await query(
    `INSERT INTO crm_card_items (card_id, partner_id, type, label, completed, ignored, priority, position)
     VALUES ($1, $2, 'autre', $3, 0, 0, 'moyenne', $4)
     RETURNING *`,
    [req.params.id, card.rows[0]?.partner_id || null, req.body.label, Number(position.rows[0].next)]
  );
  await refreshCardStatus(req.params.id);
  res.status(201).json(result.rows[0]);
}));

taskRoutes.put('/checklist/:id', param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  const fields = ['label', 'completed', 'ignored', 'ignore_reason', 'position'].filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
  if (!fields.length) {
    const item = await query('SELECT * FROM crm_card_items WHERE id = $1', [req.params.id]);
    return res.json(item.rows[0]);
  }
  const values = fields.map((field) => ['completed', 'ignored'].includes(field) ? Number(Boolean(req.body[field])) : req.body[field]);
  values.push(req.params.id);
  const result = await query(
    `UPDATE crm_card_items
     SET ${fields.map((field, index) => `${field} = $${index + 1}`).join(', ')},
         completed_at = CASE
           WHEN ${fields.includes('completed') ? `$${fields.indexOf('completed') + 1}` : 'completed'} = 1 AND completed_at IS NULL THEN CURRENT_TIMESTAMP
           WHEN ${fields.includes('completed') ? `$${fields.indexOf('completed') + 1}` : 'completed'} = 0 THEN NULL
           ELSE completed_at
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );
  await refreshCardStatus(result.rows[0].card_id);
  res.json(result.rows[0]);
}));

taskRoutes.delete('/checklist/:id', param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  const item = await query('SELECT card_id FROM crm_card_items WHERE id = $1', [req.params.id]);
  await query('DELETE FROM crm_card_items WHERE id = $1', [req.params.id]);
  if (item.rowCount) await refreshCardStatus(item.rows[0].card_id);
  res.status(204).end();
}));

async function updateStatus(req, res) {
  const status = normalizeStatus(req.body.status);
  const done = ['done', 'ignored'].includes(status);
  const result = await query(
    `UPDATE tasks
     SET status = $1, resolved_at = ${done ? 'CURRENT_TIMESTAMP' : 'NULL'}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING *`,
    [status, req.params.id]
  );
  res.json(result.rows[0]);
}

taskRoutes.put('/:id/status', param('id').isUUID(), body('status').customSanitizer(normalizeStatus).isIn(statuses), validate, asyncHandler(updateStatus));
taskRoutes.patch('/:id/status', param('id').isUUID(), body('status').customSanitizer(normalizeStatus).isIn(statuses), validate, asyncHandler(updateStatus));

taskRoutes.put('/:id/complete', param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  const result = await query(
    `UPDATE tasks SET status = 'done', resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  res.json(result.rows[0]);
}));

taskRoutes.post(
  '/manual',
  body('partner_id').isUUID(),
  body('product_id').optional({ nullable: true }).isUUID(),
  body('type').isIn(types),
  body('priority').isIn(priorities),
  body('title').notEmpty(),
  validate,
  asyncHandler(async (req, res) => {
    const result = await query(
      `INSERT INTO tasks (partner_id, product_id, type, priority, title, description, status, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'todo', 'manuel')
       RETURNING *`,
      [req.body.partner_id, req.body.product_id || null, req.body.type, req.body.priority, req.body.title, req.body.description || null]
    );
    res.status(201).json(result.rows[0]);
  })
);

taskRoutes.delete('/:id', param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  await query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));
