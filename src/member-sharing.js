// A member-only read model. This reports permission to share, never admission
// at a receiving website. Only the account adapter supplies current evidence.
export function memberSharing(connections,memberships,confirmations=[]) {
  const availableMemberships=new Map(memberships.map(m=>[m.slug,m]));
  const availableConfirmations=new Map(confirmations.map(c=>[c.slug,c]));
  const places=connections.filter(c=>c.site).map(c=>{
    const active=Boolean(c.active);
    const chosenMemberships=c.memberships.filter(id=>availableMemberships.has(id));
    const chosenConfirmations=(c.confirmations??[]).filter(id=>c.site.allow_confirmations&&availableConfirmations.has(id));
    return {
      client:c.client,name:c.name,active,updated:c.updated,
      site:{name:c.site.name,homepage:c.site.homepage,sharing_uri:c.site.sharing_uri},
      memberships:active?chosenMemberships.map(id=>({slug:id,name:availableMemberships.get(id).name})):[],
      confirmations:active?chosenConfirmations.map(id=>({slug:id,name:availableConfirmations.get(id).name,organisation:availableConfirmations.get(id).organisation.name})):[],
      unavailable:active?c.memberships.length-chosenMemberships.length+(c.confirmations??[]).length-chosenConfirmations.length:0
    };
  });
  const destinations=(kind,id)=>places.filter(p=>p.active&&p[kind].some(c=>c.slug===id)).map(p=>({client:p.client,name:p.site.name}));
  return {places,
    memberships:memberships.map(m=>({name:m.name,organisation:m.organisation?.name??m.name,recordedAt:m.approvedAt,validUntil:m.validUntil,
      sharedWith:destinations('memberships',m.slug)})),
    confirmations:confirmations.map(c=>({name:c.name,organisation:c.organisation.name,recordedAt:c.confirmedAt,validUntil:c.validUntil,
      sharedWith:destinations('confirmations',c.slug)}))
  };
}

export function sharingExport(config,sharing) {
  return {format:'unanym-sharing-summary-v1',created_at:new Date().toISOString(),operator:config.operatorName,
    note:'A summary of current sharing permissions, not a key backup or proof of website access. Websites may retain earlier copies.',
    places:sharing.places.map(p=>({website:p.site.homepage,website_name:p.site.name,connected:p.active,
      name:p.name,name_status:p.active?'chosen_for_website':'previously_shared',permission_updated:p.updated,
      memberships:p.memberships.map(m=>m.name),confirmations:p.confirmations.map(c=>({name:c.name,organisation:c.organisation})),
      unavailable_choices:p.unavailable})),
    memberships:sharing.memberships.map(exportRecord),confirmations:sharing.confirmations.map(exportRecord)};
}
function exportRecord(r) {
  return {name:r.name,organisation:r.organisation,recorded_at:r.recordedAt,valid_until:r.validUntil,
    shared_with:r.sharedWith.map(s=>s.name)};
}
