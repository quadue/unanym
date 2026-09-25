// A live receipt preview only. The issuer validates and enforces the form choices.
const input=document.querySelector('#display-name');
const memberships=[...document.querySelectorAll('input[name="memberships"], input[name="confirmations"]')];
function preview(){
  document.querySelector('#consent-preview-name').textContent=input.value.trim()||'Your chosen name';
  const list=document.querySelector('#consent-preview-memberships');
  list.replaceChildren(...memberships.filter(box=>box.checked).map(box=>{
    const item=document.createElement('li');item.textContent=box.dataset.membershipName;return item;
  }));
  list.hidden=!list.children.length;
  document.querySelector('#consent-preview-empty').hidden=!!list.children.length;
}
input.addEventListener('input',preview);
memberships.forEach(box=>box.addEventListener('change',preview));
preview();
