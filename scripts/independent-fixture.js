import {randomBytes} from 'node:crypto';

// Fictional loopback demonstration only. This is not a production login system.
// No Firn database, session schema, email or account service is involved.
export function independentFixture() {
  const sessions=new Map();
  const accounts=new Set(['robin','sam']);
  let open=true;
  const sessionToken=req=>{
    const matches=String(req.headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith('pl_session='));
    return matches.length===1 ? matches[0].slice('pl_session='.length) : '';
  };
  const adapter={
    session(req){
      const record=sessions.get(sessionToken(req));
      return open && record && record.expires>Date.now() && accounts.has(record.id) ? {id:record.id} : null;
    },
    account(id){return open && accounts.has(id)?{id}:null;},
    memberships(id){return open && id==='robin' ? [
      {slug:'lakeside',name:'Lakeside community'},
      {slug:'private-circle',name:'Private listening circle'}
    ] : [];},
    isOpen(){return open;},
    csrfBinding(req){return adapter.session(req)?sessionToken(req):'';},
    loginURL(path){return '/?next='+encodeURIComponent(path);},
    close(){open=false;sessions.clear();}
  };
  return {adapter,login(id){
    if(!open || !accounts.has(id))throw new Error('Unknown fixture account');
    const token=randomBytes(32).toString('hex');
    sessions.set(token,{id,expires:Date.now()+3600_000});
    return token;
  },close(){adapter.close();}};
}
