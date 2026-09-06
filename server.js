import express from 'express';
import sqlite3 from 'sqlite3';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const db = new sqlite3.Database('./helpdesk.db');

// Lista fija de técnicos
const TECHNICIANS = [
  'Ricardo Vidal',
  'Carlos Mendoza',
  'Alejandro Silva',
  'Mariana Gomez'
];

// Creación de tabla y migración automática
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      user_name TEXT,
      department TEXT,
      category TEXT,
      issue TEXT,
      status TEXT DEFAULT 'Abierto',
      assigned_to TEXT DEFAULT NULL,
      resolved_by TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME
    )
  `);

  db.run(`ALTER TABLE tickets ADD COLUMN assigned_to TEXT`, () => {});
  db.run(`ALTER TABLE tickets ADD COLUMN resolved_by TEXT`, () => {});
  db.run(`ALTER TABLE tickets ADD COLUMN resolved_at DATETIME`, () => {});
});

// Lista de técnicos
app.get('/api/technicians', (req, res) => {
  res.json(TECHNICIANS);
});

// 1. Crear Ticket
app.post('/api/tickets', (req, res) => {
  const { user_name, department, category, issue } = req.body;
  if (!user_name || !issue) return res.status(400).json({ error: 'Faltan datos obligatorios' });

  const code = `TK-${Math.floor(1000 + Math.random() * 9000)}`;

  db.run(
    `INSERT INTO tickets (code, user_name, department, category, issue) VALUES (?, ?, ?, ?, ?)`,
    [code, user_name, department, category, issue],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Ticket generado', code });
    }
  );
});

// 2. Consultar ticket por código (para el usuario)
app.get('/api/tickets/track/:code', (req, res) => {
  db.get(`SELECT code, user_name, status, assigned_to, category, created_at FROM tickets WHERE code = ?`, [req.params.code], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Ticket no encontrado' });
    res.json(row);
  });
});

// 3. Listar tickets (Panel Admin)
app.get('/api/tickets', (req, res) => {
  db.all(`SELECT * FROM tickets ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 4. Asignar técnico ('En Proceso')
app.patch('/api/tickets/:id/assign', (req, res) => {
  const { id } = req.params;
  const { technician_name } = req.body;

  db.run(
    `UPDATE tickets SET status = 'En Proceso', assigned_to = ? WHERE id = ?`,
    [technician_name, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Ticket asignado' });
    }
  );
});

// 5. Marcar como Resuelto
app.patch('/api/tickets/:id/resolve', (req, res) => {
  const { id } = req.params;

  db.run(
    `UPDATE tickets 
     SET status = 'Resuelto', 
         resolved_by = CASE WHEN assigned_to IS NOT NULL THEN assigned_to ELSE 'Mesa de Soporte' END, 
         resolved_at = CURRENT_TIMESTAMP 
     WHERE id = ?`,
    [id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Ticket resuelto' });
    }
  );
});

// 6. Métricas
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

// Asignación de puerto dinámico para Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`HelpDesk listo en el puerto ${PORT}`));