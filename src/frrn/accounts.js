import Database from 'better-sqlite3';
import {pactAdapter} from '../pact.js';
import {confirmationKind,confirmationLabel} from '../confirmation-contract.js';

// Explicit operator-reviewed bindings, not a directory of all FRRN communities.
export function validateSources(sources) {
  if (!Array.isArray(sources) || sources.length>50) throw new Error('Use at most 50 membership sources');
  const communities=new Set(),organisations=new Set();
  const text=(x,max=200)=>typeof x==='string' && x.trim().length>0 && x.length<=max && !/[\x00-\x1f\x7f]/.test(x);
  for (const source of sources) {
    if(source.confirmation_kinds!==undefined && (!Array.isArray(source.confirmation_kinds)||source.confirmation_kinds.length!==1||source.confirmation_kinds[0]!==confirmationKind)) throw new Error('Only explicit community introduction confirmations are supported');
    const id=source.organisation?.id;
    if (!text(source.community_id) || !text(id,500) || !/^(urn:|https:\/\/)/.test(id) || !text(source.organisation?.name,120)
      || !Array.isArray(source.approvers) || !source.approvers.length || source.approvers.length>50
      || source.approvers.some(a=>!text(a.user_id)||!text(a.authorisation_reference,1000))
      || new Set(source.approvers.map(a=>a.user_id)).size!==source.approvers.length
      || communities.has(source.community_id) || organisations.has(id)) throw new Error('Invalid or duplicate authorised membership source');
    communities.add(source.community_id);organisations.add(id);
  }
  return structuredClone(sources);
}

/**
 * What a binding can no longer stand behind. None of this may stop the host: one
 * binding must not end every other space on it, and an ordinary organiser handover
 * must not end anything. FRRN allows only a current organiser to approve, so what a
 * former organiser approved was approved with authority, and a recorded approval
 * stays until withdrawal, exit, lapsed readiness or lapsed consent (docs/frrn-host.md).
 * Problems reach the log, so they name no person.
 */
export function sourceProblems(db,bindings) {
  const community=db.prepare('SELECT 1 FROM communities WHERE id=?');
  const organiser=db.prepare("SELECT 1 FROM memberships WHERE community_id=? AND user_id=? AND role='steward' AND status='active'");
  return bindings.flatMap(source=>{
    const organisation=source.organisation.id;
    if(!community.get(source.community_id))return [{organisation,kind:'unknown-community'}];
    return source.approvers.filter(a=>!organiser.get(source.community_id,a.user_id)).map(()=>({organisation,kind:'former-organiser'}));
  });
}

/** Local read-only FRRN account source. No standalone account/admin store is opened. */
export function frrnAccounts({path,modeFile,sources}) {
  const bindings=validateSources(sources);
  const db=new Database(path,{readonly:true,fileMustExist:true});
  let base;
  try {
    const instance=db.prepare('SELECT instance_id FROM identity_source_instance WHERE id=1').get()?.instance_id;
    if (!instance) throw new Error('FRRN membership source version 1 is required');
    const read=db.prepare('SELECT * FROM identity_memberships_v1 WHERE user_id=? AND community_id=?');
    const confirmationSources=bindings.filter(s=>s.confirmation_kinds?.includes(confirmationKind));
    const readConfirmations=confirmationSources.length?db.prepare('SELECT * FROM identity_confirmations_v1 WHERE user_id=? AND community_id=?'):null;
    base=pactAdapter({path,modeFile});
    return {...base,sourceInstance:instance,sourceProblems:sourceProblems(db,bindings),
      memberships(id) {
        if (!base.account(id)) return [];
        return bindings.flatMap(source=>read.all(id,source.community_id)
          .filter(row=>source.approvers.some(a=>a.user_id===row.approved_by))
          .filter(row=>row.valid_until===null || Date.parse(row.valid_until)>Date.now()+1000)
          .map(row=>({slug:`frrn:${source.community_id}:${source.organisation.id}`,name:source.organisation.name,
            display_name:row.display_name,organisation:source.organisation,approvedAt:row.approved_at,validUntil:row.valid_until})));
      },
      confirmations(id){
        if(!base.account(id))return [];
        return confirmationSources.flatMap(source=>readConfirmations.all(id,source.community_id)
          .filter(row=>source.approvers.some(a=>a.user_id===row.approved_by))
          .filter(row=>source.approvers.some(a=>a.user_id===row.confirmed_by))
          .filter(row=>row.valid_until===null||Date.parse(row.valid_until)>Date.now()+1000)
          .map(row=>({slug:`introduction:${source.community_id}`,name:confirmationLabel,organisation:source.organisation,confirmedAt:row.confirmed_at,validUntil:row.valid_until})));
      },
      close(){base.close();db.close();}
    };
  } catch(error) {base?.close();db.close();throw error;}
}
