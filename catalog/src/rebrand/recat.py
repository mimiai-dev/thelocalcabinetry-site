import re,sys,html
import xml.etree.ElementTree as ET
SVG='http://www.w3.org/2000/svg'; XL='http://www.w3.org/1999/xlink'
ET.register_namespace('',SVG); ET.register_namespace('xlink',XL); ET.register_namespace('inkscape','http://www.inkscape.org/namespaces/inkscape')
q=lambda t:'{%s}%s'%(SVG,t)
NAVY='#0e2740'; NAVY2='#0a1d31'; INK='#14273f'; GOLD='#b4862f'; GOLDD='#8a6420'; CREAM='#f3f0ea'
MERGE=True
import re as _re
_DICT=set(w.strip().lower() for w in open('/usr/share/dict/words',errors='ignore'))|{'thelocalcabinetry','kcma','tsca','carb','ngbs','rta','pet','mdf','uv'}
def rejoin(t):
    w=t.split(' ')
    out=[];i=0
    while i<len(w):
        if i+1<len(w) and w[i].isalpha() and w[i+1].isalpha() and (w[i]+w[i+1]).lower() in _DICT and (w[i].lower() not in _DICT or w[i+1].lower() not in _DICT) and not (len(w[i])==1 and w[i].lower() in ('a','i') and w[i+1].lower() in _DICT):
            out.append(w[i]+w[i+1]); i+=2
        else: out.append(w[i]); i+=1
    return ' '.join(out)
LOG=[]  # (page, old, new, why)
def lum(h):
    return h
def hexof(c):
    c=c.strip().lower()
    if c.startswith('#') and len(c)==4: c='#'+''.join(ch*2 for ch in c[1:])
    return c
SHAPE={ '#000000':NAVY,'#231f20':NAVY,'#272425':NAVY,'#262424':NAVY,'#231f1f':NAVY,'#1f1f1f':NAVY,
 '#d32f26':GOLDD,'#c92126':GOLDD,'#c00000':GOLDD,'#9f0e1a':GOLDD,'#ed9621':NAVY,'#f9a11b':NAVY,'#ad9e63':'#cdbb8a','#afa061':'#cdbb8a','#d4a24c':GOLD}
TEXT={'#f9a11b':INK,'#ed9621':INK,'#000000':INK,'#231f20':INK,'#272425':INK,'#262424':INK,'#101':INK,'#010101':INK,'#9f0e1a':GOLDD,'#c00000':GOLDD,'#afabab':'#97a1ad'}
def near(h,tbl):
    if h in tbl: return tbl[h]
    # nearest for reds/near-black shapes
    try: r,g,b=int(h[1:3],16),int(h[3:5],16),int(h[5:7],16)
    except: return h
    if max(r,g,b)<60: return tbl.get('#000000',h)
    if tbl is TEXT and r>200 and 100<g<210 and b<110: return INK
    if r>170 and g<80 and b<80: return GOLDD
    return h
def fixid(s,p): return re.sub(r'(id="|url\(#|href="#)([A-Za-z0-9_]+)',lambda m:m.group(1)+m.group(2)+'_p%d'%p,s)
import base64,io,json
MATTE={int(k):[tuple(x) for x in v] for k,v in json.load(open('cot/matte.json')).items()}
from PIL import Image
def datauri_img(e):
    h=e.get('{%s}href'%XL) or e.get('href')
    return Image.open(io.BytesIO(base64.b64decode(h.split(',',1)[1])))
def bake(root,p):
    masks={m.get('id'):m for m in root.iter(q('mask'))}
    for g in list(root.iter(q('g'))):
        mid=g.get('mask')
        if not mid or not mid.startswith('url(#'): continue
        m=masks.get(mid[5:-1])
        if m is None: continue
        mi=[e for e in m.iter(q('image'))]; gi=[e for e in g.iter(q('image'))]
        if len(mi)!=1 or len(gi)!=1: print('mask not baked',p,mid); continue
        A=datauri_img(mi[0]).convert('L'); B=datauri_img(gi[0]).convert('RGB')
        if A.size!=B.size: A=A.resize(B.size)
        if tuple(A.size) in MATTE.get(p,[]):
            import numpy as np
            a_=np.asarray(A,dtype=float)/255.0; b_=np.asarray(B,dtype=float)
            b_=np.where(a_[...,None]>0.004,b_/np.maximum(a_[...,None],0.004),b_); B=Image.fromarray(np.clip(b_,0,255).astype('uint8'))
        B.putalpha(A); buf=io.BytesIO(); B.save(buf,'PNG',optimize=True)
        gi[0].set('{%s}href'%XL,'data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode())
        del g.attrib['mask']
    import numpy as np
    from scipy import ndimage
    inmask=set()
    for m in root.iter(q('mask')):
        for x in m.iter(): inmask.add(x)
    for e in root.iter(q('image')):
        if e in inmask: continue
        im=datauri_img(e)
        if im.width<200 or im.height<200: continue
        rgba=im.convert('RGBA'); arr=np.asarray(rgba).copy()
        dark=(arr[...,:3].max(axis=2)<14)&(arr[...,3]>200)
        lab,n=ndimage.label(dark)
        if n==0: continue
        sizes=ndimage.sum(dark,lab,range(1,n+1))
        big=np.isin(lab,[i+1 for i,sz in enumerate(sizes) if sz>6000])
        if big.sum()==0: continue
        # grow by 2px to swallow JPEG halos
        big=ndimage.binary_dilation(big,iterations=2)&(arr[...,:3].max(axis=2)<60)
        arr[big,0],arr[big,1],arr[big,2]=14,39,64
        buf=io.BytesIO(); Image.fromarray(arr).save(buf,'PNG',optimize=True)
        e.set('{%s}href'%XL,'data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()); print('recolored black in image',p,im.size,int(big.sum()),flush=True)
    inside=set()
    for d in root.iter():
        if d.tag in(q('mask'),q('clipPath'),q('defs')):
            for x in d.iter(): inside.add(x)
    for e in root.iter():
        if e in inside: continue
        if e.tag in(q('path'),q('rect'),q('polygon'),q('circle'),q('ellipse')) and e.get('fill') is None: e.set('fill','#000000')
from PIL import ImageFont
_F={}
def natw(txt,fs,fw):
    k=fw
    if k not in _F:
        f=ImageFont.truetype('tlc2/docs/brand-kit/fonts/HankenGrotesk-Variable.ttf',100)
        try: f.set_variation_by_axes([int(fw)])
        except Exception as e: pass
        _F[k]=f
    return _F[k].getlength(txt)*fs/100.0
def pbox(d):
    xs=[];ys=[];cx=cy=0.0
    for cmd,args in re.findall(r'([MLHVZ])([^MLHVZ]*)',d):
        n=[float(v) for v in re.findall(r'-?\d*\.?\d+',args)]
        if cmd in 'ML':
            for k in range(0,len(n)-1,2): cx,cy=n[k],n[k+1]; xs.append(cx); ys.append(cy)
        elif cmd=='H':
            for v in n: cx=v; xs.append(cx); ys.append(cy)
        elif cmd=='V':
            for v in n: cy=v; xs.append(cx); ys.append(cy)
    return xs,ys
def process(p,logo_b64):
    t=ET.parse(f'cot/svg/p{p}.svg'); root=t.getroot()
    root.set('width','612'); root.set('height','792'); root.set('viewBox','33 33 612 792')
    if p==7:
        for e in list(root.iter()):
            if e.tag==q('path') and hexof(e.get('fill','')) in('#ed9621','#f9a11b'):
                xs_,ys_=pbox(e.get('d',''))
                if ys_ and 525<min(ys_) and max(ys_)<555 and 380<min(xs_) and max(xs_)<540:
                    for par in root.iter():
                        if e in list(par): par.remove(e); break
    bake(root,p)
    # recolor (skip mask/clipPath)
    def walk(e,skip=False):
        tag=e.tag.split('}')[1]
        sk=skip or tag in('mask','clipPath')
        if not sk:
            for a in('fill','stroke'):
                v=e.get(a)
                if v and v.startswith('#'):
                    h=hexof(v)
                    e.set(a,near(h,TEXT if tag in('text','tspan') else SHAPE))
        for c in list(e): walk(c,sk)
    walk(root)
    # text handling
    def texts(): return list(root.iter(q('text')))
    def ts_of(tx): return list(tx.iter(q('tspan')))
    lines={}  # (y) -> list of tspans for shifting
    def setx(ts,new): ts.set('x',new)
    for tx in texts():
        ff=tx.get('font-family','')
        fs=float(tx.get('font-size','10'))
        bold='bold' in (tx.get('font-weight','')) or 'Bold' in ff
        # unscaled size accounting for transform scale ignored
        big=fs>=21 and 'Britannic' not in ff
        if tx.get('fill') is None: tx.set('fill',INK)
        if 'Britannic' in ff: continue
        tx.set('font-family','Fraunces' if big else 'Hanken Grotesk')
        tx.set('font-weight','500' if big else ('700' if bold else '400'))
        for ts in ts_of(tx):
            xs=ts.get('x','').split(); txt=ts.text or ''
            _st=txt.rstrip()
            if len(xs)>=2 and len(_st)>=2 and len(xs)>=len(_st): ts.set('data-end',f"{float(xs[len(_st)-1])+(float(xs[len(_st)-1])-float(xs[len(_st)-2])):.2f}")
            if len(xs)>2 and len(xs)>=len(txt.rstrip()):
                n=len(txt.rstrip()); adv=float(xs[n-1])-float(xs[n-2]) if n>=2 else fs*0.5
                w=float(xs[n-1])+adv-float(xs[0])
                ts.set('x',xs[0])
                if not big and not txt.strip().isdigit():
                    nat=natw(txt.rstrip(),fs,'700' if bold else '400')
                    pass
    for tx in texts():
        for ts in ts_of(tx):
            ts.text=(ts.text or '').replace('ﬁ','fi').replace('ﬂ','fl').replace('ﬀ','ff')
    # find helpers
    def find(txt,y=None,exact=True):
        out=[]
        for tx in texts():
            for ts in ts_of(tx):
                if (ts.text==txt if exact else txt in (ts.text or '')) and (y is None or abs(float(ts.get('y'))-y)<2): out.append((tx,ts))
        return out
    def logchg(old,new,why): LOG.append((p,old,new,why))
    if p==19:
        for tx in list(texts()):
            if any((ts.text or '').strip()=='life.' for ts in ts_of(tx)):
                for par in root.iter():
                    if tx in list(par): par.remove(tx); break
                logchg('life. (stray word from the page 18 sentence, cut by the spread)','(removed)','layout artifact')
    def replace_text(ts,new,shift=True,tx=None):
        old=ts.text; ts.text=new
        xs=ts.get('x','').split()
        fs=float((tx.get('font-size') if tx is not None else '10'))
        if len(xs)>1:
            ts.set('x',xs[0])
        if 'textLength' in ts.attrib: del ts.attrib['textLength']
        if shift and len(new)!=len(old):
            y=ts.get('y'); d=(len(new)-len(old))*fs*0.5; x0=float(ts.get('x').split()[0])
            for tx2 in texts():
                for t2 in ts_of(tx2):
                    if t2 is ts or t2.get('y')!=y: continue
                    x2=t2.get('x','').split()
                    if x2 and float(x2[0])>x0: t2.set('x',' '.join(f'{float(v)+d:.2f}' for v in x2))
    # brand
    for tx in list(texts()):
        for ts in ts_of(tx):
            s=ts.text or ''
            if s=='COTOWINS' or (s=='CABINETRY' and p==1):
                pa=None
                for par in root.iter():
                    if tx in list(par): par.remove(tx); break
                break
    if p==1:
        logchg('COTOWINS CABINETRY logo (red wordmark)','The Local Cabinetry wordmark (TLC logo)','brand')
        lg=ET.SubElement(root,q('image')); lg.set('x','441'); lg.set('y','52'); lg.set('width','190'); lg.set('height','58.4'); lg.set('{%s}href'%XL,'data:image/svg+xml;base64,'+logo_b64)
        for tx,ts in find('https://towins.en.alibaba.com'): replace_text(ts,'thelocalcabinetry.com',tx=tx); logchg('https://towins.en.alibaba.com','thelocalcabinetry.com','brand')
    if p==2:
        for tx,ts in find('Cotowins',209): replace_text(ts,'The Local',tx=tx); logchg('Cotowins','The Local','brand name (heading "The Local Cabinetry")')
        for tx,ts in find('Cotowins',645): replace_text(ts,'The Local Cabinetry',tx=tx); logchg('Cotowins','The Local Cabinetry','brand name')
        for tx,ts in find('remodel',328): 
            ts.text='remodelers'; logchg('remodel ers','remodelers','typo')
        for tx,ts in find('ers',328): tx.getparent if False else None; ts.text=''
        for tx,ts in find(' ',328):
            xs=ts.get('x','').split()
            if xs and abs(float(xs[0])-549)<2: ts.text=''
    if p==3:
        for tx,ts in find('Cotowins',278): replace_text(ts,'The Local',tx=tx); logchg('Cotowins Cabinetry','The Local Cabinetry','brand name')
    if p==20:
        for tx,ts in find('https://towins.en.alibaba.com'): replace_text(ts,'thelocalcabinetry.com',tx=tx); logchg('https://towins.en.alibaba.com','thelocalcabinetry.com','brand')
        ne=ET.SubElement(root,q('text')); ne.set('font-family','Hanken Grotesk'); ne.set('font-size','12'); ne.set('fill',INK); ne.set('font-weight','400')
        sp=ET.SubElement(ne,q('tspan')); sp.set('x','441'); sp.set('y','397'); sp.text='info@thelocalcabinetry.com'
        logchg('(none)','info@thelocalcabinetry.com added under the website','contact block')
    if p==7:
        for tx in list(texts()):
            if any(ts.text in('Need to add','BSV, WSV,','USV for the expose part.     ') for ts in ts_of(tx)):
                for par in root.iter():
                    if tx in list(par): par.remove(tx); break
        logchg('Need to add BSV, WSV, USV for the expose part.','(removed)','internal drafting note in the source')
    fixes=[('dovertail','dovetail'),('constrution','construction'),('metel','metal'),('cabint','cabinet'),('lnterior','Interior'),('CA Vl,','CA VI,')]
    for tx in texts():
        for ts in ts_of(tx):
            s=ts.text or ''; o=s
            for a,b in fixes:
                if a in s: s=s.replace(a,b); logchg(a,b,'typo')
            if p==11: 
                if 'inish' in s and 'finish' not in s.lower().replace('inish','',0) and re.search(r'(?<![Ff])inish',s): s=re.sub(r'(?<![Ff])inish','finish',s); logchg(o,s,'typo (missing f)')
            if p==15 and s in('shelves:','package:'): s=s.capitalize(); logchg(o,s,'capitalization')
            if s!=o: ts.text=s
    def fin(c):
        t=c['ts']; t.text=c['txt'].rstrip(' ')
        w=c['end']-c['x0']
        if len(t.text)>3 and c['fs']<21 and not t.text.strip().isdigit():
            nat=natw(t.text,c['fs'],c['fw'] or '400')
            pass
        t.set('x',f"{c['x0']:.2f}")
        if len(t.text)<=3 and 'textLength' in t.attrib: del t.attrib['textLength']

    # merge fragments on one baseline into single text runs (even spacing in the new fonts)
    def tinfo(tx):
        ts=ts_of(tx)
        if len(ts)!=1: return None
        t=ts[0]; txt=t.text or ''
        if tx.get('transform') not in('matrix(1 0 0 1 0 0)',None): return None
        xs=t.get('x','').split()
        if not xs: return None
        fs=float(tx.get('font-size','10')); x0=float(xs[0]); st=txt.rstrip()
        if t.get('data-end'): end=float(t.get('data-end'))
        elif 'textLength' in t.attrib: end=x0+float(t.get('textLength'))
        elif len(xs)>=2 and len(st)>=2 and len(xs)>=len(st): end=float(xs[len(st)-1])+(float(xs[len(st)-1])-float(xs[len(st)-2]))
        elif len(xs)>=2 and len(st)==1: end=x0+(float(xs[1])-x0)
        elif st: end=x0+len(st)*fs*0.5
        else: end=x0+fs*0.28
        return dict(tx=tx,ts=t,txt=txt,x0=x0,end=end,y=round(float(t.get('y')),1),fs=fs,fill=tx.get('fill'),fw=tx.get('font-weight'),ff=tx.get('font-family'))
    infos=[] if not MERGE else [i for i in (tinfo(tx) for tx in texts()) if i and i['txt'].strip() not in ('I T I','2026')]
    from collections import defaultdict
    rows=defaultdict(list)
    _g=defaultdict(list)
    for i in infos: _g[(round(i['fs'],1),i['fill'],i['fw'],i['ff'])].append(i)
    for gk,L0 in _g.items():
        L0.sort(key=lambda i:i['y']); yb=None; n_=0
        for i in L0:
            if yb is None or i['y']-yb>0.7: n_+=1
            yb=i['y']; rows[(n_,gk[0],gk[1],gk[2],gk[3],gk)].append(i)
    dead=[]
    for key,L in rows.items():
        if key[1]<8 and len(L)>1 and all((i['txt'].strip().isupper() or not i['txt'].strip()) for i in L): continue
        L.sort(key=lambda i:i['x0']); cur=None
        for i in L:
            if cur is not None and i['x0']-cur['end']<cur['fs']*0.9 and i['x0']>=cur['end']-cur['fs']*0.8:
                gap=i['x0']-cur['end']
                a=cur['txt'].rstrip(' '); b=i['txt'].lstrip(' ')
                sep=' ' if (cur['txt'].endswith(' ') or i['txt'].startswith(' ') or gap>cur['fs']*0.26) else ''
                if not b.strip(): cur['txt']=a+' '; dead.append(i['tx']); cur['end']=max(cur['end'],i['end']); continue
                cur['txt']=a+sep+b if b else a+sep if False else a+sep+b
                cur['end']=i['end']; dead.append(i['tx'])
            else:
                if cur is not None: fin(cur)
                cur=i
        if cur is not None: fin(cur)
    for tx in texts():
        for ts in ts_of(tx):
            o=ts.text or ''; n=o
            for a,b in (('dovertail','dovetail'),('constrution','construction'),('metel','metal'),('cabint','cabinet'),('lnterior','Interior'),('CA Vl','CA VI'),('Vl,','VI,')):
                n=n.replace(a,b)
            n=re.sub(r'(\d)depth',r'\1 depth',n)
            n=rejoin(n)
            if '仟' in n: LOG.append((p,'o仟er (broken ff ligature)','offer','typo'))
            if '—' in n: LOG.append((p,'finishes—paint','finishes, paint','em dash avoided (house style)'))
            n=n.replace('仟','ff').replace('—',', ')
            for a_,b_ in (('50,0 00','50,000'),('contracto rs','contractors'),('prem ier','premier'),('empowerin g','empowering'),('mela mine','melamine'),('cabin et','cabinet'),('off er','offer'),('draw er','drawer'),('fro nts','fronts'),('Pro ducts','Products'),('construc tion','construction'),('constructio n','construction'),('stainle ss','stainless'),('sta inless','stainless'),('sid es','sides'),('bandin g','banding'),('overla y','overlay'),('distribuitors','distributors')): n=n.replace(a_,b_)
            if n!=o: LOG.append((p,o[:60],n[:60],'typo / spacing')); ts.text=n
    if p==15:
        for tx in texts():
            for ts in ts_of(tx):
                if (ts.text or '').startswith('1 " plywood drawer') and abs(float(ts.get('y'))-239.0)<2:
                    ts.text='1 1/2" plywood drawer box'; LOG.append((15,'1 1/2" plywood drawer box (small fraction piece overlapped the next word)','same text, set as one run','layout'))
        for tx in list(texts()):
            if any((ts.text or '')=='1/2' and abs(float(ts.get('y'))-236.997)<1 for ts in ts_of(tx)):
                for par in root.iter():
                    if tx in list(par): par.remove(tx); break
        for tx in texts():
            for ts in ts_of(tx):
                if (ts.text or '').startswith('package:'): LOG.append((15,ts.text[:20],'P'+ts.text[1:20],'capitalization')); ts.text='P'+ts.text[1:]
    for tx in dead:
        for par in root.iter():
            if tx in list(par): par.remove(tx); break
    return ET.tostring(root,encoding='unicode')
if __name__=='__main__':
    import base64,json
    logo=base64.b64encode(open('tlc2/logo-tlc.svg','rb').read()).decode()
    out=[]
    for p in range(1,21):
        s=process(p,logo); s=fixid(s,p); out.append(s); print(p,len(s),flush=True)
    css='''@font-face{font-family:"Fraunces";font-weight:400 600;src:url(tlc2/fonts/fraunces-latin-var.woff2) format("woff2")}
@font-face{font-family:"Hanken Grotesk";font-weight:100 900;src:url(tlc2/fonts/hanken-grotesk-latin-var.woff2) format("woff2")}
@page{size:612pt 792pt;margin:0}html,body{margin:0;background:#fff}.pg{width:612pt;height:792pt;page-break-after:always;overflow:hidden}.pg svg{display:block;width:612pt;height:792pt}'''
    open('cot/catalog.html','w').write('<!doctype html><meta charset="utf-8"><title>The Local Cabinetry Catalog 2026</title><style>'+css+'</style>'+''.join('<section class="pg">'+s+'</section>' for s in out))
    json.dump(LOG,open('cot/log.json','w'),indent=1); print(len(LOG),'log rows')
