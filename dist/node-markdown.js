// Small, escaped Markdown subset shared by the canvas and Feishu XML exporter.
export const escapeMarkup=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function inlineMarkdown(value='') {
 const text=String(value),tokens=/`([^`\n]+)`|\*\*([^\n]+?)\*\*|~~([^\n]+?)~~|\*([^*\n]+)\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
 let out='',last=0;
 for(const m of text.matchAll(tokens)){
  out+=escapeMarkup(text.slice(last,m.index));
  if(m[1]!==undefined)out+='<code>'+escapeMarkup(m[1])+'</code>';
  else if(m[2]!==undefined)out+='<b>'+inlineMarkdown(m[2])+'</b>';
  else if(m[3]!==undefined)out+='<del>'+inlineMarkdown(m[3])+'</del>';
  else if(m[4]!==undefined)out+='<em>'+escapeMarkup(m[4])+'</em>';
  else out+='<a href="'+escapeMarkup(m[6])+'">'+escapeMarkup(m[5])+'</a>';
  last=m.index+m[0].length;
 }
 return out+escapeMarkup(text.slice(last));
}
export function renderMarkdown(text='') {
 const lines=String(text).replace(/\r\n?/g,'\n').split('\n'),out=[];
 const marker=line=>line.match(/^(\s*)(?:(\d+)[.)]|([-*+]))\s+(.*)$/);
 function list(start){
  const first=marker(lines[start]),indent=first[1].length,type=first[2]?'ol':'ul';let i=start,html='<'+type+'>';
  while(i<lines.length){
   const m=marker(lines[i]);if(!m||m[1].length!==indent||(m[2]?'ol':'ul')!==type)break;
   html+='<li'+(type==='ol'?' seq="auto"':'')+'>'+inlineMarkdown(m[4]);i++;
   while(i<lines.length){
    if(!lines[i].trim()){if(marker(lines[i+1]||'')){i++;continue;}break;}
    const child=marker(lines[i]);
    if(child&&child[1].length>indent){const next=list(i);html+=next.html;i=next.end;continue;}
    if(!child&&lines[i].match(/^\s*/)[0].length>indent){html+='<br/>'+inlineMarkdown(lines[i].trim());i++;continue;}
    break;
   }
   html+='</li>';
  }
  return {html:html+'</'+type+'>',end:i};
 }
 for(let i=0;i<lines.length;i++){
  const l=lines[i];if(!l.trim())continue;
  if(/^\s*```/.test(l)){const code=[];while(++i<lines.length&&!/^\s*```/.test(lines[i]))code.push(lines[i]);out.push('<pre><code>'+escapeMarkup(code.join('\n'))+'</code></pre>');}
  else if(l.includes('|')&&/^\s*\|?\s*:?-+/.test(lines[i+1]||'')){
   const cells=s=>s.trim().replace(/^\||\|$/g,'').split('|').map(v=>v.trim());const header=cells(l),rows=[];i+=2;
   for(;i<lines.length&&lines[i].includes('|');i++)rows.push(cells(lines[i]));i--;
   out.push('<table><thead><tr>'+header.map(c=>'<th>'+inlineMarkdown(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+header.map((_,j)=>'<td>'+inlineMarkdown(r[j]||'')+'</td>').join('')+'</tr>').join('')+'</tbody></table>');
  }else if(marker(l)){const next=list(i);out.push(next.html);i=next.end-1;}
  else if(/^#{1,6}\s/.test(l)){const h=l.match(/^(#+)\s+(.*)$/);out.push('<h'+h[1].length+'>'+inlineMarkdown(h[2])+'</h'+h[1].length+'>');}
  else if(/^\s*>/.test(l)){const quote=[];while(i<lines.length&&/^\s*>/.test(lines[i]))quote.push(lines[i++].replace(/^\s*>\s?/,''));i--;out.push('<blockquote>'+renderMarkdown(quote.join('\n'))+'</blockquote>');}
  else out.push('<p>'+inlineMarkdown(l)+'</p>');
 }
 return out.join('\n');
}
