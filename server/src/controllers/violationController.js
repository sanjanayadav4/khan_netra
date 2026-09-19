const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const refetch = async (table, id) =>
  (await query(`SELECT * FROM ${table} WHERE id=?`, [id])).rows[0];

exports.getAll = async (req, res, next) => {
  try {
    const { mine_id, status, severity, type, page=1, limit=20, search } = req.query;
    const offset = (page-1)*limit;
    let c=[], p=[];
    if (req.user.role==='mine_manager'&&req.user.mine_id){c.push(`v.mine_id=?`);p.push(req.user.mine_id);}
    else if (mine_id){c.push(`v.mine_id=?`);p.push(mine_id);}
    if (status){c.push(`v.status=?`);p.push(status);}
    if (severity){c.push(`v.severity=?`);p.push(severity);}
    if (type){c.push(`v.type=?`);p.push(type);}
    if (search){c.push(`(v.description LIKE ? OR v.violation_number LIKE ? OR v.category LIKE ?)`);p.push(`%${search}%`,`%${search}%`,`%${search}%`);}
    const where=c.length?`WHERE ${c.join(' AND ')}`:'';
    const total=(await query(`SELECT COUNT(*) as c FROM violations v ${where}`,p)).rows[0].c;
    const rows=(await query(
      `SELECT v.*,m.name as mine_name,m.state as mine_state,u.full_name as detected_by_name,
        (SELECT COUNT(*) FROM corrective_actions ca WHERE ca.violation_id=v.id) as corrective_actions_count
       FROM violations v JOIN mines m ON v.mine_id=m.id LEFT JOIN users u ON v.detected_by=u.id
       ${where} ORDER BY CASE v.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,v.detected_date DESC LIMIT ? OFFSET ?`,
      [...p,limit,offset])).rows;
    res.json({success:true,data:rows,pagination:{total,page:+page,limit:+limit}});
  } catch(err){next(err);}
};

exports.getById = async (req, res, next) => {
  try {
    const v=(await query(`SELECT v.*,m.name as mine_name,u.full_name as detected_by_name FROM violations v JOIN mines m ON v.mine_id=m.id LEFT JOIN users u ON v.detected_by=u.id WHERE v.id=?`,[req.params.id])).rows[0];
    if(!v) return res.status(404).json({success:false,message:'Not found'});
    const ca=(await query(`SELECT ca.*,u.full_name as assigned_to_name FROM corrective_actions ca LEFT JOIN users u ON ca.assigned_to=u.id WHERE ca.violation_id=?`,[req.params.id])).rows;
    res.json({success:true,data:{...v,corrective_actions:ca}});
  } catch(err){next(err);}
};

exports.create = async (req, res, next) => {
  try {
    const {mine_id,type,severity,category,description,detected_date,fine_amount,regulation_reference,corrective_action,corrective_deadline}=req.body;
    if(!mine_id||!type||!severity||!category||!description||!detected_date)
      return res.status(400).json({success:false,message:'Required fields missing'});
    const cnt=(await query(`SELECT COUNT(*) as c FROM violations`)).rows[0].c;
    const num=`VIO-${new Date().getFullYear()}-${String(cnt+1).padStart(4,'0')}`;
    const id=uuidv4();
    await query(
      `INSERT INTO violations (id,violation_number,mine_id,type,severity,category,description,detected_date,detected_by,status,fine_amount,regulation_reference,corrective_action,corrective_deadline) VALUES (?,?,?,?,?,?,?,?,?,'open',?,?,?,?)`,
      [id,num,mine_id,type,severity,category,description,detected_date,req.user.id,fine_amount||0,regulation_reference,corrective_action,corrective_deadline]
    );
    await updateMineScores(mine_id);
    await createViolationNotif(mine_id,severity,category);
    res.status(201).json({success:true,message:'Violation created',data:await refetch('violations',id)});
  } catch(err){next(err);}
};

exports.update = async (req, res, next) => {
  try {
    const {id}=req.params;
    const allowed=['status','fine_amount','fine_paid','corrective_action','corrective_deadline','description'];
    const sets=[],p=[];
    for(const k of allowed){if(req.body[k]!==undefined){sets.push(`${k}=?`);p.push(req.body[k]);}}
    if(req.body.status==='closed'){sets.push(`closed_date=date('now')`);sets.push(`closed_by=?`);p.push(req.user.id);}
    sets.push(`updated_at=datetime('now')`);p.push(id);
    await query(`UPDATE violations SET ${sets.join(',')} WHERE id=?`,p);
    const row=await refetch('violations',id);
    if(!row) return res.status(404).json({success:false,message:'Not found'});
    await updateMineScores(row.mine_id);
    res.json({success:true,message:'Updated',data:row});
  } catch(err){next(err);}
};

exports.delete = async (req, res, next) => {
  try {
    const v=(await query('SELECT id,violation_number FROM violations WHERE id=?',[req.params.id])).rows[0];
    if(!v) return res.status(404).json({success:false,message:'Not found'});
    await query('DELETE FROM violations WHERE id=?',[req.params.id]);
    res.json({success:true,message:`Violation ${v.violation_number} deleted`});
  } catch(err){next(err);}
};

exports.getCorrectiveActions = async (req, res, next) => {
  try {
    const {mine_id,status}=req.query;
    let c=[],p=[];
    if(mine_id){c.push(`ca.mine_id=?`);p.push(mine_id);}
    if(status){c.push(`ca.status=?`);p.push(status);}
    const where=c.length?`WHERE ${c.join(' AND ')}`:'';
    const rows=(await query(
      `SELECT ca.*,v.violation_number,v.severity,v.category,m.name as mine_name,u.full_name as assigned_to_name,u2.full_name as assigned_by_name
       FROM corrective_actions ca JOIN violations v ON ca.violation_id=v.id JOIN mines m ON ca.mine_id=m.id
       LEFT JOIN users u ON ca.assigned_to=u.id LEFT JOIN users u2 ON ca.assigned_by=u2.id
       ${where} ORDER BY ca.due_date ASC`,p)).rows;
    res.json({success:true,data:rows});
  } catch(err){next(err);}
};

exports.createCorrectiveAction = async (req, res, next) => {
  try {
    const {violation_id,mine_id,action_description,assigned_to,priority,due_date}=req.body;
    const id=uuidv4();
    await query(
      `INSERT INTO corrective_actions (id,violation_id,mine_id,action_description,assigned_to,assigned_by,priority,status,due_date) VALUES (?,?,?,?,?,?,'${priority||'medium'}','pending',?)`,
      [id,violation_id,mine_id,action_description,assigned_to,req.user.id,due_date]
    );
    res.status(201).json({success:true,data:await refetch('corrective_actions',id)});
  } catch(err){next(err);}
};

exports.updateCorrectiveAction = async (req, res, next) => {
  try {
    const {id}=req.params;
    const allowed=['status','completion_notes','completed_date','priority'];
    const sets=[],p=[];
    for(const k of allowed){if(req.body[k]!==undefined){sets.push(`${k}=?`);p.push(req.body[k]);}}
    if(req.body.status==='completed'&&!req.body.completed_date){sets.push(`completed_date=date('now')`);}
    sets.push(`updated_at=datetime('now')`);p.push(id);
    await query(`UPDATE corrective_actions SET ${sets.join(',')} WHERE id=?`,p);
    res.json({success:true,data:await refetch('corrective_actions',id)});
  } catch(err){next(err);}
};

async function updateMineScores(mineId){
  try{
    const r=(await query(`SELECT SUM(CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END) as w FROM violations WHERE mine_id=? AND status!='closed'`,[mineId])).rows[0];
    const risk=Math.min(100,(r.w||0)*5);
    await query(`UPDATE mines SET risk_score=?,compliance_score=?,updated_at=datetime('now') WHERE id=?`,[risk,Math.max(0,100-risk*0.6),mineId]);
  }catch{}
}

async function createViolationNotif(mineId,severity,category){
  try{
    const admins=(await query(`SELECT id FROM users WHERE role IN ('admin','government_officer')`)).rows;
    for(const a of admins){
      await query(`INSERT INTO notifications (id,user_id,mine_id,title,message,type,priority) VALUES (?,?,?,?,?,?,?)`,
        [uuidv4(),a.id,mineId,`New ${severity.toUpperCase()} Violation`,`${category} violation detected`,'violation',severity==='critical'?'critical':'high']);
    }
  }catch{}
}
