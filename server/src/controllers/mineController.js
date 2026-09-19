const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

exports.getAllMines = async (req, res, next) => {
  try {
    const { status, state, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let conds = [], params = [];

    if (req.user.role === 'mine_manager' && req.user.mine_id) {
      conds.push(`m.id = ?`); params.push(req.user.mine_id);
    }
    if (status) { conds.push(`m.status = ?`); params.push(status); }
    if (state)  { conds.push(`m.state LIKE ?`); params.push(state); }
    if (search) { conds.push(`(m.name LIKE ? OR m.mine_id LIKE ? OR m.owner_company LIKE ?)`); params.push(`%${search}%`,`%${search}%`,`%${search}%`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const total = (await query(`SELECT COUNT(*) as c FROM mines m ${where}`, params)).rows[0].c;

    const rows = (await query(
      `SELECT m.*,
         (SELECT COUNT(*) FROM violations v WHERE v.mine_id=m.id AND v.status!='closed') as open_violations,
         (SELECT COUNT(*) FROM incidents  i WHERE i.mine_id=m.id AND i.status!='closed') as open_incidents,
         (SELECT COUNT(*) FROM documents  d WHERE d.mine_id=m.id AND d.status IN ('expired','expiring_soon')) as document_alerts
       FROM mines m ${where} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )).rows;

    res.json({ success:true, data:rows, pagination:{ total, page:+page, limit:+limit, pages:Math.ceil(total/limit) } });
  } catch (err) { next(err); }
};

exports.getMineById = async (req, res, next) => {
  try {
    const r = await query(
      `SELECT m.*,
         (SELECT COUNT(*) FROM violations v WHERE v.mine_id=m.id) as total_violations,
         (SELECT COUNT(*) FROM violations v WHERE v.mine_id=m.id AND v.status!='closed') as open_violations,
         (SELECT COUNT(*) FROM incidents  i WHERE i.mine_id=m.id) as total_incidents,
         (SELECT COUNT(*) FROM documents  d WHERE d.mine_id=m.id AND d.status='expired') as expired_docs
       FROM mines m WHERE m.id = ?`, [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ success:false, message:'Mine not found' });
    res.json({ success:true, data:r.rows[0] });
  } catch (err) { next(err); }
};

exports.createMine = async (req, res, next) => {
  try {
    const {
      mine_id,name,type,location_name,state,district,latitude,longitude,
      area_hectares,depth_meters,production_capacity_mt,owner_name,owner_company,
      contact_email,contact_phone,workers_count,established_year,mining_method,
      license_number,license_expiry
    } = req.body;
    const id = uuidv4();
    await query(
      `INSERT INTO mines (id,mine_id,name,type,location_name,state,district,latitude,longitude,
        area_hectares,depth_meters,production_capacity_mt,owner_name,owner_company,
        contact_email,contact_phone,workers_count,established_year,mining_method,
        license_number,license_expiry,compliance_score,risk_score,environmental_score,safety_score)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,50,50,50,50)`,
      [id,mine_id,name,type,location_name,state,district,latitude,longitude,
       area_hectares,depth_meters,production_capacity_mt,owner_name,owner_company,
       contact_email,contact_phone,workers_count,established_year,mining_method,
       license_number,license_expiry]
    );
    const mine = (await query('SELECT * FROM mines WHERE id=?',[id])).rows[0];
    res.status(201).json({ success:true, message:'Mine created', data:mine });
  } catch (err) { next(err); }
};

exports.updateMine = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ['name','type','location_name','state','district','latitude','longitude','area_hectares',
      'depth_meters','production_capacity_mt','current_production_mt','owner_name','owner_company',
      'contact_email','contact_phone','status','workers_count','mining_method','license_number',
      'license_expiry','next_inspection_date'];
    const sets = [], params = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k}=?`); params.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ success:false, message:'No valid fields to update' });
    sets.push(`updated_at=datetime('now')`);
    params.push(id);
    await query(`UPDATE mines SET ${sets.join(',')} WHERE id=?`, params);
    const mine = (await query('SELECT * FROM mines WHERE id=?',[id])).rows[0];
    if (!mine) return res.status(404).json({ success:false, message:'Mine not found' });
    res.json({ success:true, message:'Mine updated', data:mine });
  } catch (err) { next(err); }
};

exports.deleteMine = async (req, res, next) => {
  try {
    const m = (await query('SELECT id,name FROM mines WHERE id=?',[req.params.id])).rows[0];
    if (!m) return res.status(404).json({ success:false, message:'Mine not found' });
    await query('DELETE FROM mines WHERE id=?',[req.params.id]);
    res.json({ success:true, message:`Mine "${m.name}" deleted` });
  } catch (err) { next(err); }
};

exports.searchMines = async (req, res, next) => {
  try {
    const { q = '', limit = 8 } = req.query;
    if (!q.trim()) return res.json({ success: true, data: [] });

    // Mine-manager sees only their own mine
    let conds = [`(m.name LIKE ? OR m.mine_id LIKE ? OR m.owner_company LIKE ? OR m.location_name LIKE ?)`];
    let params = [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`];

    if (req.user.role === 'mine_manager' && req.user.mine_id) {
      conds.push(`m.id = ?`); params.push(req.user.mine_id);
    }

    const rows = (await query(
      `SELECT m.id, m.mine_id, m.name, m.state, m.district, m.type, m.status,
              m.compliance_score, m.risk_score
       FROM mines m
       WHERE ${conds.join(' AND ')}
       ORDER BY m.name ASC
       LIMIT ?`,
      [...params, parseInt(limit, 10)]
    )).rows;

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.getMineStats = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [compliance,violations,incidents,docs,inspections] = await Promise.all([
      query(`SELECT status, COUNT(*) as count FROM compliance_records WHERE mine_id=? GROUP BY status`,[id]),
      query(`SELECT severity,COUNT(*) as count FROM violations WHERE mine_id=? GROUP BY severity`,[id]),
      query(`SELECT severity,COUNT(*) as count FROM incidents WHERE mine_id=? GROUP BY severity`,[id]),
      query(`SELECT status,COUNT(*) as count FROM documents WHERE mine_id=? GROUP BY status`,[id]),
      query(`SELECT status,COUNT(*) as count, AVG(overall_score) as avg_score FROM inspections WHERE mine_id=? GROUP BY status`,[id]),
    ]);
    res.json({ success:true, data:{ compliance:compliance.rows, violations:violations.rows, incidents:incidents.rows, documents:docs.rows, inspections:inspections.rows } });
  } catch (err) { next(err); }
};
