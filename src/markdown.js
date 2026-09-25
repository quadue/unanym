// A deliberately small renderer for this repository's own documentation.
// Supports headings, paragraphs, lists, tables, fenced code, inline code,
// bold and links. All source text is escaped; raw HTML is never passed through.
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const slug=text=>text.toLowerCase().replace(/`/g,'').replace(/[^a-z0-9 -]/g,'').trim().replace(/ /g,'-');

// `links` maps a relative Markdown target (without #anchor) to a served path.
// Unknown relative targets render as plain text rather than broken links.
function inline(source,links) {
  const spans=[];
  const keep=html=>'\u0000'+(spans.push(html)-1)+'\u0000';
  let text=source.replace(/`([^`]+)`/g,(_m,code)=>keep('<code>'+escape(code)+'</code>'));
  text=text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(_m,label,target)=>{
    const [path,anchor]=target.split('#');
    let href=null;
    if(/^https:\/\//.test(target))href=target;
    else if(!path && anchor)href='#'+anchor;
    else if(Object.hasOwn(links,path))href=links[path]+(anchor?'#'+anchor:'');
    const body=inlineText(label,spans,keep);
    return href?keep('<a href="'+escape(href)+'">'+body+'</a>'):keep(body);
  });
  return inlineText(text,spans,keep).replace(/\u0000(\d+)\u0000/g,(_m,i)=>spans[i]);
}
function inlineText(text,spans,keep) {
  return escape(text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\u0000(\d+)\u0000/g,(_m,i)=>spans[i]);
}

export function renderMarkdown(source,{links={}}={}) {
  const lines=source.replace(/\r\n/g,'\n').split('\n'),out=[];
  let i=0;
  const para=[];
  const flush=()=>{if(para.length){out.push('<p>'+inline(para.join(' '),links)+'</p>');para.length=0;}};
  while(i<lines.length) {
    const line=lines[i];
    if(/^```/.test(line)) {
      flush();const code=[];i++;
      while(i<lines.length && !/^```/.test(lines[i]))code.push(lines[i++]);
      i++;out.push('<pre><code>'+escape(code.join('\n'))+'</code></pre>');continue;
    }
    const heading=/^(#{1,4}) (.+)$/.exec(line);
    if(heading) {
      flush();const level=heading[1].length,text=heading[2];
      out.push(`<h${level} id="${escape(slug(text))}">${inline(text,links)}</h${level}>`);i++;continue;
    }
    if(/^\|/.test(line)) {
      flush();const rows=[];
      while(i<lines.length && /^\|/.test(lines[i]))rows.push(lines[i++]);
      const cells=row=>row.replace(/^\|/,'').replace(/\|\s*$/,'').split('|').map(c=>c.trim());
      const body=rows.filter((_r,n)=>n!==1 || !/^\|[\s:|-]+\|?\s*$/.test(rows[1]));
      const [head,...rest]=body;
      out.push('<div class="doc-table"><table><thead><tr>'+cells(head).map(c=>'<th>'+inline(c,links)+'</th>').join('')+'</tr></thead><tbody>'+
        rest.map(r=>'<tr>'+cells(r).map(c=>'<td>'+inline(c,links)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');
      continue;
    }
    const item=/^(\d+\.|[-*]) (.*)$/.exec(line);
    if(item) {
      flush();const ordered=/\d/.test(item[1]),items=[];
      while(i<lines.length) {
        const current=/^(\d+\.|[-*]) (.*)$/.exec(lines[i]);
        if(current && /\d/.test(current[1])===ordered){items.push([current[2]]);i++;}
        else if(items.length && /^\s{2,}\S/.test(lines[i])){items.at(-1).push(lines[i].trim());i++;}
        else break;
      }
      const tag=ordered?'ol':'ul';
      out.push(`<${tag}>`+items.map(parts=>'<li>'+inline(parts.join(' '),links)+'</li>').join('')+`</${tag}>`);
      continue;
    }
    if(!line.trim()){flush();i++;continue;}
    para.push(line.trim());i++;
  }
  flush();
  return out.join('\n');
}
