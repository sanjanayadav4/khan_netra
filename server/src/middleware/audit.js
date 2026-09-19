const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const auditLog = (action, entityType) => async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = async (body) => {
    if (body && body.success !== false && req.user) {
      try {
        const entityId = body.data?.id || req.params.id || null;
        await query(
          `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_values, ip_address, user_agent, mine_id, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [uuidv4(), req.user.id, action, entityType, entityId,
           JSON.stringify(req.body || {}),
           req.ip || req.connection.remoteAddress,
           req.headers['user-agent'],
           req.body?.mine_id || req.user.mine_id || null,
           `${action} ${entityType} by ${req.user.full_name}`]
        );
      } catch (e) { /* non-blocking */ }
    }
    return originalJson(body);
  };
  next();
};

module.exports = { auditLog };
