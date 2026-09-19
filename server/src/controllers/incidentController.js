const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const refetch = async (id) =>
  (await query('SELECT * FROM incidents WHERE id=?', [id])).rows[0];

exports.getAll = async (req, res, next) => {
  try {
    const { mine_id, severity, status, page=1, limit=20 } = req.query;
    const off = (page-1)*limit;
    let c=[], p=[];
    if (req.user.role==='mine_manager'&&req.user.mine_id){c.push('i.mine_id=?');p.push(req.user.mine_id);}
    else if (mine_id){c.push('i.mine_id=?');p.push(mine_id);}
    if (severity){c.push('i.severity=?');p.push(severity);}
    if (status){c.push('i.status=?');p.push(status);}
    const w=c.length?`WHERE ${c.join(' AND ')}`:'';
    const total=(await query(`SELECT COUNT(*) as c FROM incidents i ${w}`,p)).rows[0].c;
    const rows=(await query(
      `SELECT i.*,m.name as mine_name,m.state,u.full_name as reported_by_name
       FROM incidents i JOIN mines m ON i.mine_id=m.id LEFT JOIN users u ON i.reported_by=u.id
       ${w} ORDER BY CASE i.severity WHEN 'fatal' THEN 1 WHEN 'serious' THEN 2 WHEN 'minor' THEN 3 ELSE 4 END,i.incident_date DESC LIMIT ? OFFSET ?`,
      [...p,limit,off])).rows;
    res.json({success:true,data:rows,pagination:{total,page:+page,limit:+limit}});
  } catch(err){next(err);}
};

exports.getById = async (req, res, next) => {
  try {
    const r=(await query(`SELECT i.*,m.name as mine_name,m.state,u.full_name as reported_by_name FROM incidents i JOIN mines m ON i.mine_id=m.id LEFT JOIN users u ON i.reported_by=u.id WHERE i.id=?`,[req.params.id])).rows[0];
    if(!r) return res.status(404).json({success:false,message:'Not found'});
    res.json({success:true,data:r});
  } catch(err){next(err);}
};

exports.create = async (req, res, next) => {
  try {
    const {
      mine_id, type, severity, category, description, incident_date,
      location_in_mine, injuries_count=0, fatalities_count=0, affected_workers=0,
      latitude, longitude, gps_accuracy,
    } = req.body;
    if (!mine_id || !type || !severity || !description || !incident_date)
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    const cnt = (await query('SELECT COUNT(*) as c FROM incidents')).rows[0].c;
    const num = `INC-${new Date().getFullYear()}-${String(cnt+1).padStart(4,'0')}`;
    const id  = uuidv4();
    const dgms = ['fatal','serious'].includes(severity) ? 1 : 0;
    await query(
      `INSERT INTO incidents
         (id,incident_number,mine_id,type,severity,category,description,incident_date,
          location_in_mine,injuries_count,fatalities_count,affected_workers,
          latitude,longitude,gps_accuracy,
          status,reported_by,dgms_notified,dgms_notification_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?)`,
      [
        id, num, mine_id, type, severity, category||type, description, incident_date,
        location_in_mine||null, injuries_count, fatalities_count, affected_workers,
        latitude  ? parseFloat(latitude)  : null,
        longitude ? parseFloat(longitude) : null,
        gps_accuracy ? parseInt(gps_accuracy) : null,
        req.user.id, dgms,
        dgms ? new Date().toISOString().split('T')[0] : null,
      ]
    );
    if(dgms){
      const admins=(await query(`SELECT id FROM users WHERE role IN ('admin','government_officer','inspector')`)).rows;
      for(const a of admins) await query(`INSERT INTO notifications (id,user_id,mine_id,title,message,type,priority) VALUES (?,?,?,?,?,?,?)`,[uuidv4(),a.id,mine_id,`🚨 ${severity.toUpperCase()} Incident`,`${type}: ${description.substring(0,80)}`,'incident','critical']);
    }
    res.status(201).json({success:true,message:'Incident reported',data:await refetch(id)});
  } catch(err){next(err);}
};

exports.update = async (req, res, next) => {
  try {
    const {id}=req.params;
    const allowed=['status','root_cause','corrective_measures','investigated_by','injuries_count','fatalities_count'];
    const sets=[],p=[];
    for(const k of allowed){if(req.body[k]!==undefined){sets.push(`${k}=?`);p.push(req.body[k]);}}
    sets.push(`updated_at=datetime('now')`);p.push(id);
    await query(`UPDATE incidents SET ${sets.join(',')} WHERE id=?`,p);
    res.json({success:true,data:await refetch(id)});
  } catch(err){next(err);}
};

exports.getStats = async (req, res, next) => {
  try {
    const mf=req.user.role==='mine_manager'&&req.user.mine_id?`WHERE mine_id='${req.user.mine_id}'`:'';
    const [bySev,byType,totals]=await Promise.all([
      query(`SELECT severity,COUNT(*) as count FROM incidents ${mf} GROUP BY severity`),
      query(`SELECT type,COUNT(*) as count FROM incidents ${mf} GROUP BY type ORDER BY count DESC LIMIT 10`),
      query(`SELECT COUNT(*) as total,SUM(injuries_count) as injuries,SUM(fatalities_count) as fatalities FROM incidents ${mf}`),
    ]);
    res.json({success:true,data:{bySeverity:bySev.rows,byType:byType.rows,totals:totals.rows[0]}});
  } catch(err){next(err);}
};
