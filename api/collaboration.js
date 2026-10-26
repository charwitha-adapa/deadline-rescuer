import { db } from 'hatchable';
export const access = 'user';
export const methods = ['GET','POST','PATCH'];
export default async function(req,res){
 const uid=req.user.id;
 const me=await db.query('SELECT email FROM users WHERE id=$1 LIMIT 1',[uid]);
 const email=me.rows[0]?.email||'';
 if(req.method==='GET'){
  const incoming=await db.query('SELECT id,requester_user_id,requester_email,scope,schedule_name,status,created_at FROM collaboration_requests WHERE owner_user_id=$1 ORDER BY created_at DESC LIMIT 100',[uid]);
  const outgoing=await db.query('SELECT id,owner_user_id,owner_email,scope,schedule_name,status,created_at FROM collaboration_requests WHERE requester_user_id=$1 ORDER BY created_at DESC LIMIT 100',[uid]);
  const approvedIncoming=await db.query("SELECT id,requester_user_id,requester_email,scope,schedule_name,status FROM collaboration_requests WHERE owner_user_id=$1 AND status='Approved' ORDER BY created_at DESC",[uid]);
  const approvedOutgoing=await db.query("SELECT id,owner_user_id,owner_email,scope,schedule_name,status FROM collaboration_requests WHERE requester_user_id=$1 AND status='Approved' ORDER BY created_at DESC",[uid]);
  const sharedSchedules=await db.query(`SELECT r.id AS share_id,r.owner_user_id AS schedule_owner_id,r.owner_email,r.requester_user_id,r.requester_email,r.scope,r.schedule_name,'shared_with_me' AS direction,
   COALESCE(r.schedule_name, '') AS label,
   COUNT(DISTINCT t.id)::int AS task_count,
   COUNT(DISTINCT t.id) FILTER (WHERE t.status='Done')::int AS completed_count
   FROM collaboration_requests r LEFT JOIN tasks t ON t.user_id=r.owner_user_id AND (r.scope='all_tasks' OR t.schedule_name=r.schedule_name)
   WHERE r.requester_user_id=$1 AND r.status='Approved'
   GROUP BY r.id
   UNION ALL
   SELECT r.id AS share_id,r.owner_user_id AS schedule_owner_id,r.owner_email,r.requester_user_id,r.requester_email,r.scope,r.schedule_name,'shared_by_me' AS direction,
   COALESCE(r.schedule_name, '') AS label,
   COUNT(DISTINCT t.id)::int AS task_count,
   COUNT(DISTINCT t.id) FILTER (WHERE t.status='Done')::int AS completed_count
   FROM collaboration_requests r LEFT JOIN tasks t ON t.user_id=r.owner_user_id AND (r.scope='all_tasks' OR t.schedule_name=r.schedule_name)
   WHERE r.owner_user_id=$1 AND r.status='Approved'
   GROUP BY r.id
   ORDER BY direction, label`,[uid]);
  const sharedTasks=await db.query(`SELECT t.id,t.title,t.category,t.due_date,t.due_time,t.estimated_minutes,t.importance,t.flexibility,t.status,t.notes,t.description,t.schedule_name,t.user_id AS schedule_owner_id,t.created_by_user_id,t.updated_by_user_id,t.created_by_email,t.updated_by_email,t.created_at,t.updated_at,
   r.owner_email AS shared_by,r.requester_email AS collaborator_email
   FROM tasks t JOIN collaboration_requests r ON r.owner_user_id=t.user_id AND r.status='Approved' AND r.requester_user_id=$1 AND (r.scope='all_tasks' OR (r.scope='separate_schedule' AND r.schedule_name=t.schedule_name))
   ORDER BY t.due_date ASC NULLS LAST,t.created_at DESC`,[uid]);
  const ownedSharedTasks=await db.query(`SELECT t.id,t.title,t.category,t.due_date,t.due_time,t.estimated_minutes,t.importance,t.flexibility,t.status,t.notes,t.description,t.schedule_name,t.user_id AS schedule_owner_id,t.created_by_user_id,t.updated_by_user_id,t.created_by_email,t.updated_by_email,t.created_at,t.updated_at,
   r.requester_email AS collaborator_email,r.owner_email AS shared_by
   FROM tasks t JOIN collaboration_requests r ON r.owner_user_id=t.user_id AND r.status='Approved' AND r.owner_user_id=$1 AND (r.scope='all_tasks' OR (r.scope='separate_schedule' AND r.schedule_name=t.schedule_name))
   ORDER BY t.due_date ASC NULLS LAST,t.created_at DESC`,[uid]);
  return res.json({incoming:incoming.rows,outgoing:outgoing.rows,shared:approvedOutgoing.rows,shared_by_me:approvedIncoming.rows,shared_schedules:sharedSchedules.rows,shared_tasks:sharedTasks.rows,owned_shared_tasks:ownedSharedTasks.rows});
 }
 if(req.method==='POST'){
  const b=req.body||{};const ownerEmail=String(b.owner_email||'').trim().toLowerCase();const scope=['all_tasks','separate_schedule'].includes(b.scope)?b.scope:'all_tasks';const scheduleName=String(b.schedule_name||'').trim().slice(0,120);
  if(!ownerEmail||!ownerEmail.includes('@'))return res.status(400).json({error:'Enter a valid email address.'});
  if(ownerEmail===String(email).toLowerCase())return res.status(400).json({error:'You cannot request access from yourself.'});
  if(scope==='separate_schedule'&&!scheduleName)return res.status(400).json({error:'Enter the name of the schedule you want access to.'});
  const owner=await db.query('SELECT id,email FROM users WHERE lower(email)=lower($1) LIMIT 1',[ownerEmail]);
  if(!owner.rows.length)return res.status(404).json({error:'No Deadline Rescuer account found for that email yet. Ask them to sign in once, then send the request again.'});
  const ownerId=owner.rows[0].id;
  const exists=await db.query('SELECT id FROM collaboration_requests WHERE owner_user_id=$1 AND requester_user_id=$2 AND scope=$3 AND schedule_name=$4 AND status=$5 LIMIT 1',[ownerId,uid,scope,scheduleName,'Pending']);
  if(exists.rows.length)return res.status(409).json({error:'You already have a pending request for this access.'});
  const created=await db.query('INSERT INTO collaboration_requests(owner_user_id,owner_email,requester_user_id,requester_email,scope,schedule_name) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status',[ownerId,owner.rows[0].email,uid,email,scope,scheduleName]);
  return res.status(201).json({request:created.rows[0],message:'Access request sent. The other person can review it in their Collaborate tab.'});
 }
 const b=req.body||{};const id=Number(b.id);const status=b.status;
 if(!Number.isInteger(id)||id<1||!['Approved','Declined'].includes(status))return res.status(400).json({error:'Choose a valid request and response.'});
 const changed=await db.query('UPDATE collaboration_requests SET status=$1,updated_at=now() WHERE id=$2 AND owner_user_id=$3 AND status=$4 RETURNING id,status',[status,id,uid,'Pending']);
 if(!changed.rows.length)return res.status(404).json({error:'Pending request not found.'});
 return res.json({request:changed.rows[0]});
}