import { db } from 'hatchable';
export const access = 'user';
export const methods = ['GET','POST','PATCH','DELETE'];

const fields = 'id,title,category,due_date,due_time,estimated_minutes,importance,flexibility,status,notes,description,schedule_name,user_id AS schedule_owner_id,created_by_user_id,updated_by_user_id,created_by_email,updated_by_email,created_at,updated_at';
async function canAccessSchedule(ownerId, uid, scheduleName) {
  if (ownerId === uid) return true;
  const { rows } = await db.query(
    "SELECT id FROM collaboration_requests WHERE owner_user_id=$1 AND requester_user_id=$2 AND status='Approved' AND (scope='all_tasks' OR (scope='separate_schedule' AND schedule_name=$3)) LIMIT 1",
    [ownerId, uid, scheduleName || '']
  );
  return rows.length > 0;
}
async function canAccessTask(task, uid) {
  return canAccessSchedule(task.user_id, uid, task.schedule_name);
}
export default async function(req,res){
 const uid=req.user.id;
 const me=await db.query('SELECT email FROM users WHERE id=$1 LIMIT 1',[uid]);
 const email=me.rows[0]?.email||String(uid);
 if(req.method==='GET'){
  const {rows}=await db.query('SELECT '+fields+' FROM tasks WHERE user_id=$1 ORDER BY CASE WHEN status=\'Done\' THEN 1 ELSE 0 END, due_date ASC NULLS LAST, created_at DESC',[uid]);
  return res.json({tasks:rows});
 }
 if(req.method==='POST'){
  const b=req.body||{};const title=String(b.title||'').trim();if(!title)return res.status(400).json({error:'Task title is required'});
  const category=['Academic','Career','Personal','Errands'].includes(b.category)?b.category:'Academic';
  const importance=['High','Medium','Low'].includes(b.importance)?b.importance:'Medium';
  const flexibility=['Fixed deadline','Flexible'].includes(b.flexibility)?b.flexibility:'Fixed deadline';
  const mins=Math.max(5,Math.min(1440,Number(b.estimated_minutes)||60));
  const scheduleName=String(b.schedule_name||'My Schedule').trim().slice(0,120)||'My Schedule';
  const ownerId=String(b.schedule_owner_id||uid);
  if(!(await canAccessSchedule(ownerId,uid,scheduleName)))return res.status(403).json({error:'You do not have approved access to this schedule.'});
  const requestKey=String(b.request_key||'').slice(0,100)||null;
  if(requestKey){
   const existing=await db.query('SELECT '+fields+' FROM tasks WHERE created_by_user_id=$1 AND request_key=$2 LIMIT 1',[uid,requestKey]);
   if(existing.rows.length)return res.json({task:existing.rows[0],duplicate:true});
  }
  const {rows}=await db.query('INSERT INTO tasks(user_id,created_by_user_id,updated_by_user_id,created_by_email,updated_by_email,title,category,due_date,due_time,estimated_minutes,importance,flexibility,notes,description,schedule_name,request_key) VALUES($1,$2,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING '+fields,[ownerId,uid,email,title,category,b.due_date||null,b.due_time||null,mins,importance,flexibility,String(b.notes||'').slice(0,2000),String(b.description||'').slice(0,4000),scheduleName,requestKey]);
  return res.status(201).json({task:rows[0]});
 }
 const b=req.body||{};const id=Number(b.id);if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'Valid task id required'});
 const found=await db.query('SELECT id,user_id,schedule_name FROM tasks WHERE id=$1 LIMIT 1',[id]);
 if(!found.rows.length)return res.status(404).json({error:'Task not found'});
 const task=found.rows[0];
 if(!(await canAccessTask(task,uid)))return res.status(403).json({error:'You do not have approved access to modify this task.'});
 if(req.method==='PATCH'){
  const updates=[];const values=[];const add=(col,val)=>{values.push(val);updates.push(col+'=$'+values.length)};
  if(Object.prototype.hasOwnProperty.call(b,'status')){if(!['Pending','Done'].includes(b.status))return res.status(400).json({error:'Invalid status'});add('status',b.status)}
  if(Object.prototype.hasOwnProperty.call(b,'title')){const title=String(b.title||'').trim();if(!title)return res.status(400).json({error:'Task title is required'});add('title',title.slice(0,180))}
  if(Object.prototype.hasOwnProperty.call(b,'category'))add('category',['Academic','Career','Personal','Errands'].includes(b.category)?b.category:'Academic');
  if(Object.prototype.hasOwnProperty.call(b,'due_date'))add('due_date',b.due_date||null);
  if(Object.prototype.hasOwnProperty.call(b,'due_time'))add('due_time',b.due_time||null);
  if(Object.prototype.hasOwnProperty.call(b,'estimated_minutes'))add('estimated_minutes',Math.max(5,Math.min(1440,Number(b.estimated_minutes)||60)));
  if(Object.prototype.hasOwnProperty.call(b,'importance'))add('importance',['High','Medium','Low'].includes(b.importance)?b.importance:'Medium');
  if(Object.prototype.hasOwnProperty.call(b,'flexibility'))add('flexibility',['Fixed deadline','Flexible'].includes(b.flexibility)?b.flexibility:'Fixed deadline');
  if(Object.prototype.hasOwnProperty.call(b,'notes'))add('notes',String(b.notes||'').slice(0,2000));
  if(Object.prototype.hasOwnProperty.call(b,'description'))add('description',String(b.description||'').slice(0,4000));
  if(Object.prototype.hasOwnProperty.call(b,'schedule_name')){
   const nextName=String(b.schedule_name||'').trim().slice(0,120)||'My Schedule';
   if(task.user_id!==uid&&nextName!==task.schedule_name)return res.status(403).json({error:'Collaborators cannot move a task out of its shared schedule.'});
   add('schedule_name',nextName);
  }
  if(!updates.length)return res.status(400).json({error:'No task changes provided.'});
  values.push(id);const idParam=values.length;values.push(uid);const uidParam=values.length;values.push(email);const emailParam=values.length;
  updates.push('updated_by_user_id=$'+uidParam,'updated_by_email=$'+emailParam,'updated_at=now()');
  // Re-check membership inside the write itself so a revoked share cannot race the earlier read check.
  values.push(uid);const writerParam=values.length;
  const {rows}=await db.query('UPDATE tasks SET '+updates.join(',')+' WHERE id=$'+idParam+' AND (user_id=$'+writerParam+' OR EXISTS (SELECT 1 FROM collaboration_requests cr WHERE cr.owner_user_id=tasks.user_id AND cr.requester_user_id=$'+writerParam+' AND cr.status=\'Approved\' AND (cr.scope=\'all_tasks\' OR (cr.scope=\'separate_schedule\' AND cr.schedule_name=tasks.schedule_name)))) RETURNING '+fields,values);
  if(!rows.length)return res.status(403).json({error:'You no longer have approved access to edit this task.'});
  return res.json({task:rows[0]});
 }
 const {rows}=await db.query('DELETE FROM tasks WHERE id=$1 RETURNING id',[id]);if(!rows.length)return res.status(404).json({error:'Task not found'});return res.json({ok:true});
}