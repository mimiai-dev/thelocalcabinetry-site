import json,subprocess,os,html
E=html.escape
sw=json.load(open('swatches.json'))
HEX={k:'#%02x%02x%02x'%tuple(v['rgb']) for k,v in sw.items()}; HEX.update({'FE':'#2f1812','HW':'#eae8e9','HG':'#8e8b8a'})
def lum(h): r,g,b=int(h[1:3],16),int(h[3:5],16),int(h[5:7],16); return .299*r+.587*g+.114*b
LINES=[
 ('essential','Essential','Shaker door, framed cabinets, single package',[('SW','Shaker White'),('GR','Gray Shaker'),('SE','Shaker Espresso')],'shaker'),
 ('classic','Classic','Raised panel door, framed cabinets, single package',[('AC','Aspen Charcoal'),('AW','Aspen White'),('CW','Charleston White')],'classic'),
 ('slim-shaker','Slim Shaker','Slim frame shaker door, framed cabinets',[('SDW','Slim Dove White'),('SWO','Slim White Oak'),('SAO','Slim Amber Oak'),('SIB','Slim Iron Black'),('SAG','Slim Aston Green')],'slim'),
 ('charm','Charm','Framed cabinets, single and two package',[('NB','Navy Blue'),('RW','Rustic Wood'),('SB','Sage Breeze'),('LG','Lunar Gray'),('AG','Aston Green'),('SA','Smokey Gray'),('TC','Treasure Chest'),('IB','Iron Black')],'shaker'),
 ('double-shaker','Double Shaker','Double frame shaker door, framed cabinets, two package',[('DDW','Double Dove White'),('DSG','Double Smokey Gray')],'double'),
 ('frameless','Frameless','Slab door, frameless cabinets, two package',[('OB','Oak Blonde'),('OS','Oak Shade'),('MB','Matte Black'),('MI','Matte Ivory'),('CG','Crystal Glass'),('MG','Midnight Glass'),('HW','High Glossy White'),('HG','High Glossy Gray')],'slab'),
 ('builder-grade','Builder Grade','Shaker door, framed cabinets, drop-ship',[('FW','Floral White'),('FG','Floral Gray'),('FE','Floral Espresso')],'shaker'),
]
def door(code,kind,dw=300,dh=430,w=300,h=430):
    c=HEX[code]; dark=lum(c)<110
    line='rgba(255,255,255,.28)' if dark else 'rgba(14,39,64,.28)'
    inner={'shaker':f'<rect x="38" y="48" width="{w-76}" height="{h-96}" fill="none" stroke="{line}" stroke-width="3"/>',
     'classic':f'<rect x="34" y="44" width="{w-68}" height="{h-88}" fill="none" stroke="{line}" stroke-width="3"/><rect x="58" y="68" width="{w-116}" height="{h-136}" rx="6" fill="none" stroke="{line}" stroke-width="2"/>',
     'slim':f'<rect x="22" y="30" width="{w-44}" height="{h-60}" fill="none" stroke="{line}" stroke-width="3"/>',
     'double':f'<rect x="34" y="44" width="{w-68}" height="{h-88}" fill="none" stroke="{line}" stroke-width="3"/><rect x="62" y="72" width="{w-124}" height="{h-144}" fill="none" stroke="{line}" stroke-width="3"/>',
     'slab':f'<line x1="0" y1="2" x2="{w}" y2="2" stroke="{line}" stroke-width="3"/>'}[kind]
    return f'<svg viewBox="0 0 {w} {h}" width="{dw}" height="{dh}" xmlns="http://www.w3.org/2000/svg"><rect width="{w}" height="{h}" rx="6" fill="{c}" stroke="rgba(14,39,64,.22)" stroke-width="2"/>{inner}</svg>'
CSS='''@font-face{font-family:"Figtree";src:url("catalog/src/fonts/Figtree-VF.ttf") format("truetype");font-weight:300 900}
*{box-sizing:border-box}body{margin:0;width:1600px;font-family:"Figtree";color:#14273f;background:#fff}
.hd{display:flex;justify-content:space-between;align-items:flex-end;padding:56px 72px 34px;border-bottom:3px solid #0e2740}
.hd img{height:84px}.hd .t{text-align:right}.hd h1{margin:0;font-size:54px;font-weight:700;color:#0e2740;line-height:1.05}.hd p{margin:8px 0 0;font-size:24px;color:#51606f}
.grid{display:grid;gap:44px 36px;padding:56px 72px 40px}.tile{display:flex;flex-direction:column;align-items:flex-start}
.tile .l{margin-top:16px;font-size:26px;line-height:1.2}.tile .l b{display:block;font-size:34px;color:#0e2740}
.ft{display:flex;justify-content:space-between;padding:26px 72px 40px;border-top:1px solid #e0d6bd;font-size:21px;color:#51606f}
.sec{padding:0 72px}.sec h2{margin:34px 0 12px;font-size:30px;color:#0e2740;border-bottom:2px solid #0e2740;padding-bottom:6px}.sec h2 span{font-size:20px;font-weight:400;color:#51606f;margin-left:12px}
.row{display:grid;grid-template-columns:repeat(8,1fr);gap:18px 14px}.mini{font-size:17px;line-height:1.15}.mini b{display:block;font-size:20px;color:#0e2740;margin-top:6px}
'''
def foot(): return '<div class="ft"><span>Colors are shown as close as a screen allows. Ask us for a door sample before you decide.</span><span>thelocalcabinetry.com &middot; info@thelocalcabinetry.com</span></div>'
def render(name,body,h):
    open(f'fs/{name}.html','w').write(f'<!doctype html><meta charset="utf-8"><base href="file://{os.getcwd()}/"><style>{CSS}</style><body>{body}</body>')
    subprocess.run(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','--headless=new','--disable-gpu','--hide-scrollbars',f'--window-size=1600,{h}',f'--screenshot=fs/{name}.png',f'file://{os.getcwd()}/fs/{name}.html'],capture_output=True)
import sys
ONLY=len(sys.argv)>1
for key,title,sub,items,kind in (LINES if not ONLY else []):
    n=len(items); cols=min(n,4) if n!=5 else 5; 
    cw=(1600-144-36*(cols-1))/cols; w=int(min(cw,330)); h=int(w*1.43)
    tiles=''.join(f'<div class="tile">{door(c,kind,w,h)}<div class="l"><b>{E(c)}</b>{E(nm)}</div></div>' for c,nm in items)
    rows=(n+cols-1)//cols; H=190+56+rows*(h+110)+44+120
    body=f'<div class="hd"><img src="logo-tlc.svg" alt="The Local Cabinetry"><div class="t"><h1>{E(title)} collection</h1><p>{E(sub)}</p></div></div><div class="grid" style="grid-template-columns:repeat({cols},{w}px);justify-content:start">{tiles}</div>{foot()}'
    render('finish-sheet-'+key,body,H)
# overview
secs=''
for key,title,sub,items,kind in LINES:
    minis=''.join(f'<div class="mini">{door(c,kind,150,215)}<b>{E(c)}</b>{E(nm)}</div>' for c,nm in items)
    secs+=f'<div class="sec"><h2>{E(title)}<span>{E(sub)}</span></h2><div class="row">{minis}</div></div>'
render('finish-sheet-all',f'<div class="hd"><img src="logo-tlc.svg" alt="The Local Cabinetry"><div class="t"><h1>All finishes</h1><p>Every collection and finish with its code</p></div></div>{secs}{foot()}',2960)
print('done')
