// Narrow screens keep the guide itself close to the top. Without scripts the
// native disclosure still makes every section link available.
const wide=window.matchMedia('(min-width:901px)');
for(const contents of document.querySelectorAll('[data-contents]')) {
  contents.open=wide.matches;
  wide.addEventListener('change',event=>{contents.open=event.matches;});
}
// Copy is a convenience; all instructions and links work without this script.
for(const pre of document.querySelectorAll('.developer pre')) {
  const code=pre.querySelector('code');if(!code)continue;
  const button=document.createElement('button'),status=document.createElement('span');
  button.type='button';button.className='copy-code';button.textContent='Copy';
  button.setAttribute('aria-label',pre.dataset.copyLabel||'Copy code');
  status.className='copy-status';status.setAttribute('role','status');
  const controls=document.createElement('div');controls.className='code-controls';
  controls.append(button,status);pre.after(controls);
  button.addEventListener('click',async()=>{
    try {
      await navigator.clipboard.writeText(code.textContent);
      status.textContent='Copied';
    } catch {
      const range=document.createRange();range.selectNodeContents(code);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      status.textContent='Text selected. Use your device’s Copy command.';
    }
  });
}
