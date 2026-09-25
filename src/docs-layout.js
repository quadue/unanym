import {slug} from './markdown.js';

// Used only with escaped, rendered documentation. The contents work without JS.
export function documentLayout(content) {
  const headings=[],seen=new Set();
  const body=content.replace(/<h2(?: id="([^"]+)")?>(.*?)<\/h2>/g,(_match,existing,label)=>{
    const base=existing||slug(label.replace(/<[^>]*>/g,''))||'section';
    let id=base,n=2;while(seen.has(id))id=base+'-'+n++;
    seen.add(id);headings.push({id,label});
    return `<h2 id="${id}" tabindex="-1">${label}</h2>`;
  });
  return `<div class="doc-layout"><aside class="doc-contents"><details data-contents><summary>On this page</summary><nav aria-label="On this page"><ul>${headings.map(({id,label})=>`<li><a href="#${id}">${label}</a></li>`).join('')}</ul></nav></details></aside><article class="doc">${body}</article></div>`;
}
