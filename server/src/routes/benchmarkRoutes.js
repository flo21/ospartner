import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { body, param } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { syncPartnerOfferAnomalies } from '../services/offerControlService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../utils/validation.js';

export const benchmarkRoutes = Router();
const upload = multer({ storage: multer.memoryStorage() });

benchmarkRoutes.use(authenticate, requireRole('admin'));

async function ensureTable(partnerId) {
  const existing = await query('SELECT * FROM benchmark_tables WHERE partner_id = $1 ORDER BY created_at LIMIT 1', [partnerId]);
  if (existing.rowCount) return existing.rows[0];
  const created = await query('INSERT INTO benchmark_tables (partner_id, name) VALUES ($1, $2) RETURNING *', [partnerId, 'Benchmark']);
  return created.rows[0];
}

async function loadTable(partnerId) {
  const table = await ensureTable(partnerId);
  const [columns, rows, cells] = await Promise.all([
    query('SELECT * FROM benchmark_columns WHERE table_id = $1 ORDER BY position, name', [table.id]),
    query('SELECT * FROM benchmark_rows WHERE table_id = $1 ORDER BY position, name', [table.id]),
    query(`
      SELECT bc.*
      FROM benchmark_cells bc
      JOIN benchmark_rows br ON br.id = bc.row_id
      WHERE br.table_id = $1
    `, [table.id])
  ]);
  return { table, columns: columns.rows, rows: rows.rows, cells: cells.rows, calculations: calculateDeltas(rows.rows, columns.rows, cells.rows) };
}

function parsePrice(value) {
  if (value == null || value === '') return null;
  const normalized = String(value).replace(/\s/g, '').replace('€', '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function excelValueToString(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text ?? '');
    if ('result' in value) return String(value.result ?? '');
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if (value instanceof Date) return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function calculateDeltas(rows, columns, cells) {
  const row4000m = rows.find((row) => row.type === '4000m');
  const partnerRow = rows.find((row) => row.type === 'partner');
  if (!row4000m && !partnerRow) return [];
  const cellMap = new Map(cells.map((cell) => [`${cell.row_id}:${cell.column_id}`, cell]));
  const results = [];
  for (const row of rows) {
    if (row.type === '4000m' || row.type === 'note') continue;
    for (const column of columns) {
      const value = parsePrice(cellMap.get(`${row.id}:${column.id}`)?.value);
      const value4000m = row4000m ? parsePrice(cellMap.get(`${row4000m.id}:${column.id}`)?.value) : null;
      const partnerValue = partnerRow ? parsePrice(cellMap.get(`${partnerRow.id}:${column.id}`)?.value) : null;
      if (value == null) continue;
      results.push({
        row_id: row.id,
        column_id: column.id,
        gap_with_4000m: value4000m == null ? null : Number((value - value4000m).toFixed(2)),
        gap_with_partner: partnerValue == null ? null : Number((value - partnerValue).toFixed(2)),
        gap_percent_4000m: value4000m ? Number((((value - value4000m) / value4000m) * 100).toFixed(2)) : null
      });
    }
  }
  return results;
}

async function nextPosition(tableId, tableName) {
  const result = await query(`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ${tableName} WHERE table_id = $1`, [tableId]);
  return Number(result.rows[0].next);
}

async function partnerIdFromRow(rowId) {
  const result = await query(`
    SELECT bt.partner_id
    FROM benchmark_rows br
    JOIN benchmark_tables bt ON bt.id = br.table_id
    WHERE br.id = $1
  `, [rowId]);
  return result.rows[0]?.partner_id || null;
}

benchmarkRoutes.get('/partner/:partnerId', param('partnerId').isUUID(), validate, asyncHandler(async (req, res) => {
  res.json(await loadTable(req.params.partnerId));
}));

benchmarkRoutes.post('/partner/:partnerId/columns', param('partnerId').isUUID(), body('name').notEmpty(), validate, asyncHandler(async (req, res) => {
  const table = await ensureTable(req.params.partnerId);
  const position = await nextPosition(table.id, 'benchmark_columns');
  const result = await query('INSERT INTO benchmark_columns (table_id, name, position) VALUES ($1, $2, $3) RETURNING *', [table.id, req.body.name, position]);
  res.status(201).json(result.rows[0]);
}));

benchmarkRoutes.put('/columns/:id', param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  const owner = await query('SELECT bt.partner_id FROM benchmark_columns bc JOIN benchmark_tables bt ON bt.id = bc.table_id WHERE bc.id = $1', [req.params.id]);
  const fields = ['name', 'position'].filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
  const values = fields.map((field) => req.body[field]);
  values.push(req.params.id);
  const result = await query(`UPDATE benchmark_columns SET ${fields.map((field, index) => `${field} = $${index + 1}`).join(', ')} WHERE id = $${values.length} RETURNING *`, values);
  if (owner.rows[0]?.partner_id) await syncPartnerOfferAnomalies(owner.rows[0].partner_id);
  res.json(result.rows[0]);
}));

benchmarkRoutes.delete('/columns/:id', param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  const owner = await query('SELECT bt.partner_id FROM benchmark_columns bc JOIN benchmark_tables bt ON bt.id = bc.table_id WHERE bc.id = $1', [req.params.id]);
  await query('DELETE FROM benchmark_columns WHERE id = $1', [req.params.id]);
  if (owner.rows[0]?.partner_id) await syncPartnerOfferAnomalies(owner.rows[0].partner_id);
  res.status(204).end();
}));

benchmarkRoutes.post('/partner/:partnerId/rows', param('partnerId').isUUID(), body('name').notEmpty(), body('type').isIn(['partner', '4000m', 'competitor', 'note', 'custom']), validate, asyncHandler(async (req, res) => {
  const table = await ensureTable(req.params.partnerId);
  const position = await nextPosition(table.id, 'benchmark_rows');
  const result = await query('INSERT INTO benchmark_rows (table_id, name, type, position) VALUES ($1, $2, $3, $4) RETURNING *', [table.id, req.body.name, req.body.type, position]);
  res.status(201).json(result.rows[0]);
}));

benchmarkRoutes.put('/rows/:id', param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  const owner = await query('SELECT bt.partner_id FROM benchmark_rows br JOIN benchmark_tables bt ON bt.id = br.table_id WHERE br.id = $1', [req.params.id]);
  const fields = ['name', 'type', 'position'].filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
  const values = fields.map((field) => req.body[field]);
  values.push(req.params.id);
  const result = await query(`UPDATE benchmark_rows SET ${fields.map((field, index) => `${field} = $${index + 1}`).join(', ')} WHERE id = $${values.length} RETURNING *`, values);
  if (owner.rows[0]?.partner_id) await syncPartnerOfferAnomalies(owner.rows[0].partner_id);
  res.json(result.rows[0]);
}));

benchmarkRoutes.delete('/rows/:id', param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  const owner = await query('SELECT bt.partner_id FROM benchmark_rows br JOIN benchmark_tables bt ON bt.id = br.table_id WHERE br.id = $1', [req.params.id]);
  await query('DELETE FROM benchmark_rows WHERE id = $1', [req.params.id]);
  if (owner.rows[0]?.partner_id) await syncPartnerOfferAnomalies(owner.rows[0].partner_id);
  res.status(204).end();
}));

benchmarkRoutes.put('/cells', body('row_id').isUUID(), body('column_id').isUUID(), body('color').optional({ nullable: true }).isIn(['none', 'green', 'orange', 'red', 'gray']), validate, asyncHandler(async (req, res) => {
  const result = await query(
    `INSERT INTO benchmark_cells (row_id, column_id, value, color, source_url_id, last_updated)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT(row_id, column_id) DO UPDATE SET
       value = excluded.value,
       color = excluded.color,
       source_url_id = excluded.source_url_id,
       last_updated = CURRENT_TIMESTAMP
     RETURNING *`,
    [req.body.row_id, req.body.column_id, req.body.value ?? '', req.body.color || 'none', req.body.source_url_id || null]
  );
  const partnerId = await partnerIdFromRow(req.body.row_id);
  if (partnerId) await syncPartnerOfferAnomalies(partnerId);
  res.json(result.rows[0]);
}));

benchmarkRoutes.post('/partner/:partnerId/import', param('partnerId').isUUID(), upload.single('file'), validate, asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Missing XLSX file' });
  const table = await ensureTable(req.params.partnerId);
  await query('DELETE FROM benchmark_columns WHERE table_id = $1', [table.id]);
  await query('DELETE FROM benchmark_rows WHERE table_id = $1', [table.id]);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.file.buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return res.status(400).json({ message: 'Empty XLSX file' });
  const rows = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    rows[rowNumber - 1] = row.values.slice(1).map(excelValueToString);
  });
  const headers = (rows[0] || []).slice(1).map((value, index) => String(value || `Colonne ${index + 1}`));
  const createdColumns = [];
  for (const [index, header] of headers.entries()) {
    const created = await query('INSERT INTO benchmark_columns (table_id, name, position) VALUES ($1, $2, $3) RETURNING *', [table.id, header, index]);
    createdColumns.push(created.rows[0]);
  }
  for (const [rowIndex, sourceRow] of rows.slice(1).entries()) {
    const rowName = String(sourceRow[0] || `Ligne ${rowIndex + 1}`);
    const createdRow = await query('INSERT INTO benchmark_rows (table_id, name, type, position) VALUES ($1, $2, $3, $4) RETURNING *', [table.id, rowName, 'custom', rowIndex]);
    for (const [colIndex, column] of createdColumns.entries()) {
      const value = sourceRow[colIndex + 1] ?? '';
      if (value !== '') {
        await query('INSERT INTO benchmark_cells (row_id, column_id, value, color) VALUES ($1, $2, $3, $4)', [createdRow.rows[0].id, column.id, String(value), 'none']);
      }
    }
  }
  await syncPartnerOfferAnomalies(req.params.partnerId);
  res.status(201).json(await loadTable(req.params.partnerId));
}));

benchmarkRoutes.get('/partner/:partnerId/export.csv', param('partnerId').isUUID(), validate, asyncHandler(async (req, res) => {
  const data = await loadTable(req.params.partnerId);
  const cellMap = new Map(data.cells.map((cell) => [`${cell.row_id}:${cell.column_id}`, cell.value || '']));
  const matrix = [['Source', ...data.columns.map((column) => column.name)], ...data.rows.map((row) => [row.name, ...data.columns.map((column) => cellMap.get(`${row.id}:${column.id}`) || '')])];
  const csv = matrix.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="benchmark.csv"');
  res.send(csv);
}));

benchmarkRoutes.get('/partner/:partnerId/export.xlsx', param('partnerId').isUUID(), validate, asyncHandler(async (req, res) => {
  const data = await loadTable(req.params.partnerId);
  const cellMap = new Map(data.cells.map((cell) => [`${cell.row_id}:${cell.column_id}`, cell.value || '']));
  const matrix = [['Source', ...data.columns.map((column) => column.name)], ...data.rows.map((row) => [row.name, ...data.columns.map((column) => cellMap.get(`${row.id}:${column.id}`) || '')])];
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Benchmark');
  worksheet.addRows(matrix);
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="benchmark.xlsx"');
  res.send(Buffer.from(buffer));
}));
