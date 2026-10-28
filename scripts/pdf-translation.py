"""Local PDF layout/OCR worker. Model calls are made by the Node job runner."""
import sys,json,re,html,subprocess,os,statistics
from pathlib import Path
import pymupdf as fitz
from PIL import Image

def dump(path,data): path.write_text(json.dumps(data,ensure_ascii=False))
def inspect(root):
 d=fitz.open(root/'source.pdf')
 if d.needs_pass: raise ValueError('加密 PDF 需要先解锁')
 if not 0<len(d)<=500: raise ValueError('支持 1–500 页 PDF')
 blocks=[];figures=[]
 for pi,p in enumerate(d):
  if p.rotation: raise ValueError(f'第 {pi+1} 页有页面旋转，请先转正后翻译')
  for b in p.get_text('dict')['blocks']:
   if b['type']!=0: continue
   groups=[];group=[]
   for line in b['lines']:
    if group and (line['bbox'][1]<=group[-1]['bbox'][1]+2 and line['bbox'][0]>group[-1]['bbox'][0]+8 or line['bbox'][1]>p.rect.height-55):
     groups.append(group);group=[]
    group.append(line)
   if group:groups.append(group)
   for lines in groups:
    spans=[s for l in lines for s in l['spans']]
    text='\n'.join(''.join(s['text'] for s in l['spans']) for l in lines).strip()
    if not text:continue
    r=fitz.Rect(lines[0]['bbox'])
    for l in lines[1:]:r|=fitz.Rect(l['bbox'])
    size=statistics.median(s['size'] for s in spans)
    blocks.append(dict(id=f'b{len(blocks)}',page=pi,bbox=list(r),text=text,size=size,bold=any(s['flags']&16 for s in spans),kind='body'))
  # Render each displayed image region so masks, crop and transforms are respected.
  seen=set()
  for im in p.get_image_info():
   box=fitz.Rect(im['bbox'])&p.rect
   if box.is_empty:continue
   key=tuple(round(x,2) for x in box)
   if key in seen:continue
   seen.add(key);fid=f'f{len(figures)}';path=root/(fid+'.png')
   scale=min(4,2400/max(box.width,box.height))
   p.get_pixmap(matrix=fitz.Matrix(scale,scale),clip=box,alpha=False).save(path)
   figures.append(dict(id=fid,page=pi,bbox=list(box),file=path.name))
  if not p.get_text().strip() and not seen:
   raise ValueError(f'第 {pi+1} 页无可识别内容，请检查文件')
 if figures:
  dump(root/'ocr-input.json',[str(root/f['file']) for f in figures])
  env={**os.environ,'CLANG_MODULE_CACHE_PATH':str(root/'module-cache'),'SWIFT_MODULE_CACHE_PATH':str(root/'module-cache')}
  subprocess.run(['/usr/bin/swift',str(Path(__file__).with_name('figure-ocr.swift')),str(root/'ocr-input.json'),str(root/'ocr.json')],env=env,check=True,timeout=300,capture_output=True)
  ocr=json.loads((root/'ocr.json').read_text())
  for fig,data in zip(figures,ocr):
   rect=fitz.Rect(fig['bbox']);im=Image.open(root/fig['file']).convert('RGB');fig['blockIds']=[]
   for line in data['lines']:
    text=line['text'].strip()
    if not re.search('[A-Za-z]{2}',text):continue
    if line['confidence']<.65:raise ValueError(f"第 {fig['page']+1} 页图中文字识别置信度不足：{text[:60]}")
    x0,y0,x1,y1=line['box'];box=fitz.Rect(rect.x0+x0*rect.width,rect.y0+y0*rect.height,rect.x0+x1*rect.width,rect.y0+y1*rect.height)
    # Native text laid over an image is already translated by the body pass.
    if any(b['page']==fig['page'] and b['kind']=='body' and (fitz.Rect(b['bbox'])&box).get_area()>box.get_area()*.7 for b in blocks):continue
    samples=[]
    for x in [x0,(x0+x1)/2,x1]:
     for y in [max(0,y0-.003),min(.999,y1+.003)]:samples.append(im.getpixel((min(im.width-1,int(x*im.width)),min(im.height-1,int(y*im.height)))))
    bg=[statistics.median(c)/255 for c in zip(*samples)]
    pixels=list(im.crop((int(x0*im.width),int(y0*im.height),max(int(x0*im.width)+1,int(x1*im.width)),max(int(y0*im.height)+1,int(y1*im.height)))).getdata())
    ink=[c for c in pixels if sum(c)<sum(bg)*255-150]
    fg=[int(statistics.median(c)) for c in zip(*ink)] if ink else [23,44,54]
    bid=f'b{len(blocks)}';fig['blockIds'].append(bid)
    blocks.append(dict(id=bid,page=fig['page'],bbox=list(box),text=text,size=max(4,box.height*.9),bold=False,kind='figure',figure=fig['id'],background=bg,foreground='#%02x%02x%02x'%tuple(fg)))
 dump(root/'manifest.json',dict(pages=len(d),blocks=blocks,figures=figures))
 print(json.dumps({'pages':len(d),'blocks':len(blocks),'figures':len(figures)}))

def compose(root):
 manifest=json.loads((root/'manifest.json').read_text());translations=json.loads((root/'translations.json').read_text());d=fitz.open(root/'source.pdf');qa=[]
 # OCR line boxes include letter descenders, not a true font size. Normalize
 # similarly sized labels on the same row, while retaining distinct size groups.
 for fig in manifest['figures']:
  labels=sorted([b for b in manifest['blocks'] if b.get('figure')==fig['id']],key=lambda b:b['bbox'][1]);rows=[]
  for b in labels:
   row=next((row for row in rows if abs(row[0]['bbox'][1]-b['bbox'][1])<min(row[0]['size'],b['size'])*.22),None)
   if row is None:rows.append([b])
   else:row.append(b)
  for row in rows:
   groups=[]
   for b in sorted(row,key=lambda b:b['size']):
    if not groups or b['size']/groups[-1][-1]['size']>1.15:groups.append([b])
    else:groups[-1].append(b)
   for group in groups:
    size=min(b['size'] for b in group)
    for b in group:b['size']=size
 if set(translations)!=set(b['id'] for b in manifest['blocks']):raise ValueError('翻译不完整，拒绝生成完成版')
 for pi,p in enumerate(d):
  items=[b for b in manifest['blocks'] if b['page']==pi]
  for b in items:
   if b['kind']=='body' and translations[b['id']]!=b['text']:p.add_redact_annot(fitz.Rect(b['bbox']),fill=False)
  p.apply_redactions(images=0,graphics=0,text=0)
  for b in items:
   text=translations[b['id']]
   if text==b['text']:continue
   r=fitz.Rect(b['bbox'])
   if b['kind']=='figure':
    r+=(-.5,-.5,.5,.5);p.draw_rect(r,color=None,fill=b['background'],overlay=True)
   else:r.x1+=1;r.y1+=1
   css=f"*{{margin:0;padding:0}}div{{font-family:sans-serif;font-size:{b['size']}px;line-height:1.12;font-weight:{'bold' if b['bold'] else 'normal'};color:{b.get('foreground','#172c36')}}}"
   spare,scale=p.insert_htmlbox(r,'<div>'+html.escape(text).replace('\n','<br>')+'</div>',css=css,scale_low=0)
   if spare<0 or scale<.7 or b['size']*scale<min(b['size']*.75,5.5):raise ValueError(f"第 {pi+1} 页文字空间不足，需要人工调整：{b['id']}")
   qa.append(dict(id=b['id'],scale=scale))
 d.subset_fonts();d.set_metadata({'title':'完整中文译本','subject':'正文及全部图内文字翻译；需完成逐图核验后交付'})
 d.save(root/'translated.pdf',garbage=4,deflate=True)
 check=fitz.open(root/'translated.pdf')
 if len(check)!=manifest['pages']:raise ValueError('译本页数与原文不同')
 for pi,p in enumerate(check):
  p.get_pixmap(matrix=fitz.Matrix(1.8,1.8),alpha=False).save(root/f'page-{pi+1}-zh.png')
 for fig in manifest['figures']:
  p=check[fig['page']];rect=fitz.Rect(fig['bbox']);p.get_pixmap(matrix=fitz.Matrix(min(4,2400/max(rect.width,rect.height)),min(4,2400/max(rect.width,rect.height))),clip=rect,alpha=False).save(root/(fig['id']+'-zh.png'))
 dump(root/'layout-check.json',qa)
 print(json.dumps({'pages':len(check),'checkedBlocks':len(qa)}))

if __name__=='__main__':
 try:
  root=Path(sys.argv[2]).resolve()
  {'inspect':inspect,'compose':compose}[sys.argv[1]](root)
 except Exception as e:
  print(str(e),file=sys.stderr);sys.exit(1)
