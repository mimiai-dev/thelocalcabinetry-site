import json,subprocess,os,html,sys
from PIL import Image
E=html.escape
HERE=os.path.dirname(os.path.abspath(__file__))
PHOTOS=os.path.join(HERE,'photos')
CROP=json.load(open(os.path.join(HERE,'photo_crops.json')))
LINES=[
 ('essential','Essential','Shaker door, framed cabinets, single package',[('SW','Shaker White'),('GR','Gray Shaker'),('SE','Shaker Espresso')]),
 ('classic','Classic','Raised panel door, framed cabinets, single package',[('AC','Aspen Charcoal'),('AW','Aspen White'),('CW','Charleston White')]),
 ('slim-shaker','Slim Shaker','Slim frame shaker door, framed cabinets',[('SDW','Slim Dove White'),('SWO','Slim White Oak'),('SAO','Slim Amber Oak'),('SIB','Slim Iron Black'),('SAG','Slim Aston Green')]),
 ('charm','Charm','Framed cabinets, single and two package',[('NB','Navy Blue'),('RW','Rustic Wood'),('SB','Sage Breeze'),('LG','Lunar Gray'),('AG','Aston Green'),('SA','Smokey Gray'),('TC','Treasure Chest'),('IB','Iron Black')]),
 ('double-shaker','Double Shaker','Double frame shaker door, framed cabinets, two package',[('DDW','Double Dove White'),('DSG','Double Smokey Gray')]),
 ('frameless','Frameless','Slab door, frameless cabinets, two package',[('OB','Oak Blonde'),('OS','Oak Shade'),('MB','Matte Black'),('MI','Matte Ivory'),('CG','Crystal Glass'),('MG','Midnight Glass'),('HW','High Glossy White'),('HG','High Glossy Gray')]),
 ('builder-grade','Builder Grade','Shaker door, framed cabinets, drop-ship',[('FW','Floral White'),('FG','Floral Gray'),('FE','Floral Espresso')]),
]
RATIO=1.43
def slug(name): return name.lower().replace(' ','-')
def src_of(name):
    p=os.path.join(PHOTOS,f'door-{slug(name)}.jpg')
    return p if os.path.exists(p) else None
def trim(im):
    g=im.convert('L').point(lambda v:255 if v>=248 else 0)
    w,h=g.size; px=g.load()
    col=lambda x:sum(px[x,y]==255 for y in range(h))>=.98*h
    row=lambda y:sum(px[x,y]==255 for x in range(w))>=.98*w
    l=0
    while l<w-1 and col(l): l+=1
    r=w-1
    while r>l and col(r): r-=1
    t=0
    while t<h-1 and row(t): t+=1
    b=h-1
    while b>t and row(b): b-=1
    return im.crop((l,t,r+1,b+1))
def framed(name,code):
    im=Image.open(src_of(name)).convert('RGB')
    if code in CROP: im=im.crop(tuple(CROP[code]))
    im=trim(im)
    inset=2; im=im.crop((inset,inset,im.width-inset,im.height-inset))
    w,h=im.size
    if h/w>=RATIO: box=(0,0,w,round(w*RATIO))
    else: cw=round(h/RATIO); x=(w-cw)//2; box=(x,0,x+cw,h)
    im=im.crop(box)
    os.makedirs('fs/photos',exist_ok=True)
    out=f'fs/photos/{code}.jpg'
    im.save(out,quality=95)
    return out
MISSING=[]
def tile(code,name,w,h):
    if src_of(name):
        return f'<div class="ph" style="width:{w}px;height:{h}px"><img src="{framed(name,code)}" alt=""></div>'
    if (code,name) not in MISSING: MISSING.append((code,name))
    return f'<div class="ph none" style="width:{w}px;height:{h}px"><span>Photo coming</span></div>'
CSS='''@font-face{font-family:"Figtree";src:url("catalog/src/fonts/Figtree-VF.ttf") format("truetype");font-weight:300 900}
*{box-sizing:border-box}body{margin:0;width:1600px;font-family:"Figtree";color:#14273f;background:#fff}
.hd{display:flex;justify-content:space-between;align-items:flex-end;padding:56px 72px 34px;border-bottom:3px solid #0e2740}
.hd img{height:84px}.hd .t{text-align:right}.hd h1{margin:0;font-size:54px;font-weight:700;color:#0e2740;line-height:1.05}.hd p{margin:8px 0 0;font-size:24px;color:#51606f}
.grid{display:grid;gap:44px 36px;padding:56px 72px 40px}.tile{display:flex;flex-direction:column;align-items:flex-start}
.tile .l{margin-top:16px;font-size:26px;line-height:1.2}.tile .l b{display:block;font-size:34px;color:#0e2740}
.ph{position:relative;overflow:hidden;border-radius:6px;background:#f4f2ec}
.ph img{display:block;width:100%;height:100%;object-fit:cover}
.ph:after{content:"";position:absolute;inset:0;border-radius:6px;box-shadow:inset 0 0 0 2px rgba(14,39,64,.16)}
.ph.none{display:flex;align-items:center;justify-content:center;border:3px dashed #b3ab97;text-align:center}
.ph.none:after{display:none}
.ph.none span{font-size:30px;font-weight:600;color:#51606f;line-height:1.15;padding:0 10px}
.mini .ph.none span{font-size:19px}
.ft{display:flex;justify-content:space-between;padding:26px 72px 40px;border-top:1px solid #e0d6bd;font-size:21px;color:#51606f}
.sec{padding:0 72px}.sec h2{margin:34px 0 12px;font-size:30px;color:#0e2740;border-bottom:2px solid #0e2740;padding-bottom:6px}.sec h2 span{font-size:20px;font-weight:400;color:#51606f;margin-left:12px}
.row{display:grid;grid-template-columns:repeat(8,1fr);gap:18px 14px}.mini{font-size:17px;line-height:1.15}.mini b{display:block;font-size:20px;color:#0e2740;margin-top:6px}
.sec:last-of-type{margin-bottom:36px}
'''
ALIBABA='--alibaba' in sys.argv[1:]
SUFFIX='-alibaba' if ALIBABA else ''
def foot(): return '<div class="ft"><span>Real door photos. Colors vary with screen and light; ask us for a door sample before you decide.</span>'+('' if ALIBABA else '<span>thelocalcabinetry.com &middot; info@thelocalcabinetry.com</span>')+'</div>'
def render(name,body,h):
    open(f'fs/{name}.html','w').write(f'<!doctype html><meta charset="utf-8"><base href="file://{os.getcwd()}/"><style>{CSS}</style><body>{body}</body>')
    subprocess.run(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','--headless=new','--disable-gpu','--hide-scrollbars',f'--window-size=1600,{h}',f'--screenshot=fs/{name}.png',f'file://{os.getcwd()}/fs/{name}.html'],capture_output=True)
ONLY=len([a for a in sys.argv[1:] if a!='--alibaba'])>0
for key,title,sub,items in (LINES if not ONLY else []):
    n=len(items); cols=min(n,4) if n!=5 else 5
    cw=(1600-144-36*(cols-1))/cols; w=int(min(cw,330)); h=int(w*RATIO)
    tiles=''.join(f'<div class="tile">{tile(c,nm,w,h)}<div class="l"><b>{E(c)}</b>{E(nm)}</div></div>' for c,nm in items)
    rows=(n+cols-1)//cols; H=190+56+rows*(h+110)+44+120
    body=f'<div class="hd"><img src="logo-tlc.svg" alt="The Local Cabinetry"><div class="t"><h1>{E(title)} collection</h1><p>{E(sub)}</p></div></div><div class="grid" style="grid-template-columns:repeat({cols},{w}px);justify-content:start">{tiles}</div>{foot()}'
    render('finish-sheet-'+key+SUFFIX,body,H)
secs=''
for key,title,sub,items in LINES:
    minis=''.join(f'<div class="mini">{tile(c,nm,150,215)}<b>{E(c)}</b>{E(nm)}</div>' for c,nm in items)
    secs+=f'<div class="sec"><h2>{E(title)}<span>{E(sub)}</span></h2><div class="row">{minis}</div></div>'
render('finish-sheet-all'+SUFFIX,f'<div class="hd"><img src="logo-tlc.svg" alt="The Local Cabinetry"><div class="t"><h1>All finishes</h1><p>Every collection and finish with its code</p></div></div>{secs}{foot()}',2830)
print('no photo yet: '+(', '.join(f'{c} {nm}' for c,nm in MISSING) or 'none'))
print('done')
