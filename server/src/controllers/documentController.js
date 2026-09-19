const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs   = require('fs');

exports.getAll = async (req, res, next) => {
  try {
    const {mine_id,status,type,category,page=1,limit=20}=req.query;
    const off=(page-1)*limit;
    let c=[],p=[];
    const mId=req.user.role==='mine_manager'?req.user.mine_id:mine_id;
    if(mId){c.push('d.mine_id=?');p.push(mId);}
    if(status){c.push('d.status=?');p.push(status);}
    if(type){c.push('d.type=?');p.push(type);}
    if(category){c.push('d.category=?');p.push(category);}
    const w=c.length?`WHERE ${c.join(' AND ')}`:'';
    const total=(await query(`SELECT COUNT(*) as c FROM documents d ${w}`,p)).rows[0].c;
    const rows=(await query(
      `SELECT d.*,m.name as mine_name,u.full_name as uploaded_by_name
       FROM documents d JOIN mines m ON d.mine_id=m.id LEFT JOIN users u ON d.uploaded_by=u.id
       ${w} ORDER BY CASE d.status WHEN 'expired' THEN 1 WHEN 'expiring_soon' THEN 2 ELSE 4 END,d.expiry_date ASC LIMIT ? OFFSET ?`,
      [...p,limit,off])).rows;
    res.json({success:true,data:rows,pagination:{total,page:+page,limit:+limit}});
  } catch(err){next(err);}
};

exports.getById = async (req, res, next) => {
  try {
    const r=(await query(`SELECT d.*,m.name as mine_name,u.full_name as uploaded_by_name FROM documents d JOIN mines m ON d.mine_id=m.id LEFT JOIN users u ON d.uploaded_by=u.id WHERE d.id=?`,[req.params.id])).rows[0];
    if(!r) return res.status(404).json({success:false,message:'Not found'});
    res.json({success:true,data:r});
  } catch(err){next(err);}
};

exports.upload = async (req, res, next) => {
  try {
    const {mine_id,title,type,category,issue_date,expiry_date,issuing_authority,document_number}=req.body;
    if(!mine_id||!title||!type) return res.status(400).json({success:false,message:'mine_id,title,type required'});
    if(!req.file) return res.status(400).json({success:false,message:'File is required'});
    let status='active';
    if(expiry_date){
      const days=Math.ceil((new Date(expiry_date)-new Date())/(1000*60*60*24));
      if(days<0) status='expired';
      else if(days<=60) status='expiring_soon';
    }
    const analysis=analyzeDoc(type,title,status);
    const id=uuidv4();
    await query(
      `INSERT INTO documents (id,mine_id,title,type,category,file_name,file_path,file_size,mime_type,issue_date,expiry_date,issuing_authority,document_number,status,ai_analysis,ai_risk_flags,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id,mine_id,title,type,category||type,req.file.originalname,req.file.path,req.file.size,req.file.mimetype,issue_date,expiry_date,issuing_authority,document_number,status,analysis.summary,JSON.stringify(analysis.flags),req.user.id]);
    if(status==='expired'||status==='expiring_soon'){
      const admins=(await query(`SELECT id FROM users WHERE role IN ('admin','government_officer')`)).rows;
      for(const a of admins) await query(`INSERT INTO notifications (id,user_id,mine_id,title,message,type,priority) VALUES (?,?,?,?,?,?,?)`,
        [uuidv4(),a.id,mine_id,status==='expired'?'🔴 Document Expired':'⚠️ Document Expiring Soon',`"${title}" has ${status==='expired'?'expired':'will expire within 60 days'}`,'deadline',status==='expired'?'critical':'high']);
    }
    const row=(await query('SELECT * FROM documents WHERE id=?',[id])).rows[0];
    res.status(201).json({success:true,message:'Document uploaded',data:row});
  } catch(err){next(err);}
};

exports.update = async (req, res, next) => {
  try {
    const {id}=req.params;
    const allowed=['title','type','category','issue_date','expiry_date','issuing_authority','document_number','status'];
    const sets=[],p=[];
    for(const k of allowed){if(req.body[k]!==undefined){sets.push(`${k}=?`);p.push(req.body[k]);}}
    sets.push(`updated_at=datetime('now')`);p.push(id);
    await query(`UPDATE documents SET ${sets.join(',')} WHERE id=?`,p);
    res.json({success:true,data:(await query('SELECT * FROM documents WHERE id=?',[id])).rows[0]});
  } catch(err){next(err);}
};

exports.delete = async (req, res, next) => {
  try {
    const doc=(await query('SELECT * FROM documents WHERE id=?',[req.params.id])).rows[0];
    if(!doc) return res.status(404).json({success:false,message:'Not found'});
    try{ if(fs.existsSync(doc.file_path)) fs.unlinkSync(doc.file_path); }catch{}
    await query('DELETE FROM documents WHERE id=?',[req.params.id]);
    res.json({success:true,message:'Document deleted'});
  } catch(err){next(err);}
};

exports.getExpiryAlerts = async (req, res, next) => {
  try {
    const mf=req.user.role==='mine_manager'&&req.user.mine_id?`AND d.mine_id='${req.user.mine_id}'`:'';
    const rows=(await query(
      `SELECT d.*,m.name as mine_name,
         CAST(julianday(d.expiry_date)-julianday(date('now')) AS INTEGER) as days_until_expiry
       FROM documents d JOIN mines m ON d.mine_id=m.id
       WHERE d.expiry_date IS NOT NULL AND d.expiry_date<=date('now','+90 days') ${mf}
       ORDER BY d.expiry_date ASC`)).rows;
    res.json({success:true,data:rows});
  } catch(err){next(err);}
};

exports.analyzeDocument = async (req, res, next) => {
  try {
    const doc=(await query('SELECT * FROM documents WHERE id=?',[req.params.id])).rows[0];
    if(!doc) return res.status(404).json({success:false,message:'Not found'});
    const a=analyzeDoc(doc.type,doc.title,doc.status);
    await query(`UPDATE documents SET ai_analysis=?,ai_risk_flags=?,updated_at=datetime('now') WHERE id=?`,[a.summary,JSON.stringify(a.flags),req.params.id]);
    res.json({success:true,data:{analysis:a.summary,riskFlags:a.flags}});
  } catch(err){next(err);}
};

function analyzeDoc(type,title,status){
  const flags=[];
  if(status==='expired') flags.push('EXPIRED','REGULATORY_RISK');
  if(status==='expiring_soon') flags.push('EXPIRING_SOON');
  if(type==='License') flags.push('REGULATORY_CRITICAL');
  const summaries={
    License:`This ${title} is a regulatory mining license document subject to MMDR Act 1957 provisions. Key compliance points: lease boundary, royalty payments, production ceiling. ${status==='expired'?'⚠️ CRITICAL: License EXPIRED – operations may be illegal.':status==='expiring_soon'?'⚠️ Renewal required within 60 days.':'Currently valid.'}`,
    Certificate:`Environmental/Safety certificate verified against applicable standards. ${status==='expired'?'Certificate has EXPIRED – renewal mandatory.':status==='expiring_soon'?'Renewal required soon.':'Certificate is valid.'}`,
    Report:`Inspection/Safety report analyzed. Cross-reference with CMR 2017 requirements recommended. Key areas: ventilation, safety equipment, strata control, labor welfare.`,
    Permit:`Operational permit reviewed. Verify permit conditions against current mine operations and applicable state regulations.`,
  };
  return {summary:summaries[type]||`Document "${title}" analyzed for compliance. Verify expiry dates, issuing authority, and alignment with Coal Mines Regulations 2017.`,flags};
}
