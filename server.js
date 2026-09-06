import express from 'express';
import sqlite3 from 'sqlite3';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const db = new sqlite3.Database('./helpdesk.db');

// Catálogo clasificado por niveles
const SUPPORT_ENTITIES = {
  'Nivel 1': ['Mesa de Entrada', 'Ricardo Vidal', 'Carlos Mendoza'],
  'Nivel 2': ['Infraestructura / Servidores', 'Redes / Conectividad', 'Administrador BD'],
  'Nivel 3': ['Proveedor ERP', 'Proveedor ISP / Enlaces', 'Garantía / Soporte Fabricante']
};

// Base de datos y migraciones seguras
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      user_name TEXT,
      department TEXT,
      category TEXT,
      issue TEXT,
      level TEXT DEFAULT 'Nivel 1',
      status TEXT DEFAULT 'Abierto',
      assigned_to TEXT DEFAULT NULL,
      resolved_by TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME
    )
  `);

  db.run(`ALTER TABLE tickets ADD COLUMN level TEXT DEFAULT 'Nivel 1'`, () => {});
  db.run(`ALTER TABLE tickets ADD COLUMN assigned_to TEXT`, () => {});
  db.run(`ALTER TABLE tickets ADD COLUMN resolved_by TEXT`, () => {});
  db.run(`ALTER TABLE tickets ADD COLUMN resolved_at DATETIME`, () => {});
});

// Endpoint del catálogo de soporte
app.get('/api/support-entities', (req, res) => {
  res.json(SUPPORT_ENTITIES);
});

// 1. Crear Ticket
app.post('/api/tickets', (req, res) => {
  const { user_name, department, category, issue } = req.body;
  if (!user_name || !issue) return res.status(400).json({ error: 'Faltan datos obligatorios' });

  const code = `TK-${Math.floor(1000 + Math.random() * 9000)}`;

  db.run(
    `INSERT INTO tickets (code, user_name, department, category, issue, level) VALUES (?, ?, ?, ?, ?, 'Nivel 1')`,
    [code, user_name, department, category, issue],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Ticket generado', code });
    }
  );
});

// 2. Consultar ticket por código
app.get('/api/tickets/track/:code', (req, res) => {
  db.get(`SELECT code, user_name, status, level, assigned_to, category, created_at FROM tickets WHERE code = ?`, [req.params.code], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Ticket no encontrado' });
    res.json(row);
  });
});

// 3. Listar tickets
app.get('/api/tickets', (req, res) => {
  db.all(`SELECT * FROM tickets ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 4. Asignar / Escalar Ticket
app.patch('/api/tickets/:id/escalate', (req, res) => {
  const { id } = req.params;
  const { level, assigned_to } = req.body;

  db.run(
    `UPDATE tickets SET level = ?, assigned_to = ?, status = 'En Proceso' WHERE id = ?`,
    [level, assigned_to, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Ticket escalado exitosamente' });
    }
  );
});

// 5. Marcar como Resuelto
app.patch('/api/tickets/:id/resolve', (req, res) => {
  const { id } = req.params;

  db.run(
    `UPDATE tickets 
     SET status = 'Resuelto', 
         resolved_by = CASE WHEN assigned_to IS NOT NULL THEN assigned_to ELSE 'Mesa de Entrada' END, 
         resolved_at = CURRENT_TIMESTAMP 
     WHERE id = ?`,
    [id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Ticket resuelto' });
    }
  );
});

// 6. Métricas operativas
app.get('/api/metrics', (req, res) => {
  const topDeptQuery = `SELECT department, COUNT(*) as total FROM tickets GROUP BY department ORDER BY total DESC LIMIT 5`;
  const topTechQuery = `SELECT resolved_by, COUNT(*) as total FROM tickets WHERE status = 'Resuelto' AND resolved_by IS NOT NULL GROUP BY resolved_by ORDER BY total DESC LIMIT 5`;

  db.all(topDeptQuery, [], (err, depts) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all(topTechQuery, [], (err, techs) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ topDepartments: depts, topTechnicians: techs });
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`HelpDesk listo en el puerto ${PORT}`));