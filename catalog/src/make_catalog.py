import json,re,html,collections,sys
E=html.escape
d=json.load(open('data/design-catalog-index.json')); sku=json.load(open('data/sku-codes.json'))
sw=json.load(open('data/swatches.json'))
HEX={k:'#%02x%02x%02x'%tuple(v['rgb']) for k,v in sw.items()}
HEX.update({'FE':'#2f1812','HW':'#eae8e9','HG':'#8e8b8a'})   # FE/HW/HG: badge-free samples from the factory pages
CAP=int(sys.argv[1]) if len(sys.argv)>1 else 40   # rows per column

# ---------- data: one row per code, with verified size text and which ranges carry it
ent=collections.defaultdict(list)
for line,v in d.items():
    for k,it in v['items'].items(): ent[k].append(it)
def good(c):
    es=ent.get(c)
    if not es: return None
    if len({(e['w'],e['h'],e['d']) for e in es})>1: return None
    e=es[0]; m=re.fullmatch(r'W(\d\d)(\d\d)(GD)?',c)
    if m and e['w'] is not None and (e['w']!=int(m.group(1)) or e['h']!=int(m.group(2))): return None
    return e
fr=set(c for v in sku['framed'].values() for c in v); fl=set(c for v in sku['frameless'].values() for c in v)
allc=sorted(fr|fl)
rows=collections.OrderedDict(); unsized=[]
for c in allc:
    e=good(c)
    if e is None: unsized.append(c); continue
    sec=e['section'].replace("''",'"').title().replace('Cabinets - ','Cabinets, ')
    rows.setdefault(sec,[]).append((c,re.sub(r'\s+',' ',e['desc'].replace('"','"')),c in fr,c in fl))
order=['Wall Cabinets, 12"H','Wall Cabinets, 15"H','Wall Cabinets, 18"H','Wall Cabinets, 24"H','Wall Cabinets, 30"H','Wall Cabinets, 36"H','Wall Cabinets, 42"H']
secs=sorted(rows,key=lambda s:(order.index(s) if s in order else (7 if 'Wall' in s else 20),s))

def sw_item(code,name): return f'<div class="sw"><i style="background:{HEX[code]}"></i><b>{E(code)}</b><span>{E(name)}</span></div>'
def sw_block(title,items): return f'<div class="swb"><h3>{E(title)}</h3><div class="swg">'+''.join(sw_item(c,n) for c,n in items)+'</div></div>'

css='''
@font-face{font-family:"Figtree";src:url("fonts/Figtree-VF.ttf") format("truetype");font-weight:300 900}
@page{size:8.5in 11in;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:"Figtree";font-size:10pt;line-height:1.45;color:#14273f;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{position:relative;width:8.5in;height:11in;overflow:hidden;page-break-after:always;background:#fff;padding:.7in .75in}
.page:last-child{page-break-after:auto}
.eyebrow{font-size:8pt;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#b4862f;margin:0 0 6pt}
h2{font-size:23pt;line-height:1.15;color:#0e2740;margin:0;font-weight:700;letter-spacing:-.01em}
h3{font-size:11.5pt;margin:0 0 5pt;color:#0e2740}
.lead{color:#51606f;margin:8pt 0 14pt;max-width:6in}
.foot{position:absolute;left:.75in;right:.75in;bottom:.42in;display:flex;justify-content:space-between;font-size:8pt;color:#51606f}
.cover{padding:0;background:#0e2740}
.cover .img{height:6.7in;background:url("../../accessories/kitchen-led.jpg") center/cover}
.cover .band{padding:.5in .75in;color:#fff}
.cover .band img{height:.9in;display:block}
.cover h1{font-size:30pt;line-height:1.1;margin:.3in 0 8pt;color:#fff;font-weight:700}
.cover p{margin:0;color:#c9d3de;font-size:11pt}
.welcome p{max-width:5.6in;font-size:11.5pt;line-height:1.6;color:#2a3b50;margin:0 0 12pt}
.three{display:grid;grid-template-columns:repeat(3,1fr);gap:.22in;margin-top:.3in}
.three div{border-top:2px solid #b4862f;padding-top:8pt}
.three b{display:block;font-size:11pt;color:#0e2740;margin-bottom:3pt}
.three span{font-size:9.5pt;color:#51606f}
.swb{margin:0 0 15pt}
.swb h3{border-top:1px solid #e0d6bd;padding-top:8pt}
.swg{display:grid;grid-template-columns:repeat(4,1fr);gap:7pt 12pt}
.sw{display:grid;grid-template-columns:.34in 1fr;grid-template-rows:auto auto;column-gap:7pt;align-items:center}
.sw i{grid-row:1/3;width:.34in;height:.5in;border:1px solid rgba(14,39,64,.25);border-radius:2px}
.sw b{font-size:9pt;color:#0e2740;line-height:1.1}
.sw span{font-size:8.2pt;color:#51606f;line-height:1.15}
.sub{font-size:8pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#b4862f;margin:14pt 0 6pt}
table{border-collapse:collapse;width:100%;font-size:8.6pt}
th,td{border-top:1px solid #e0d6bd;padding:5pt 6pt;text-align:left;vertical-align:top}
th{font-size:7.8pt;letter-spacing:.06em;text-transform:uppercase;color:#51606f;font-weight:700;border-top:2px solid #0e2740}
td:first-child{font-weight:700;color:#0e2740;width:1.15in}
.cols{column-count:2;column-gap:.32in;height:8.1in;column-fill:auto}
.sec{break-inside:avoid;margin:0 0 6pt}
.sec h4{margin:0 0 2pt;font-size:8pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#b4862f;border-bottom:2px solid #0e2740;padding-bottom:2pt;break-after:avoid}
.r{break-inside:avoid;display:grid;grid-template-columns:.78in 1fr .34in;gap:5pt;font-size:7.7pt;line-height:1.25;padding:2.2pt 0;border-bottom:1px solid #eee6d2}
.r b{color:#0e2740;font-weight:700}
.r em{font-style:normal;color:#7a5a14;font-size:7pt;text-align:right}
.legend{font-size:8pt;color:#51606f;margin:6pt 0 8pt}
.photos{display:grid;grid-template-columns:1fr 1fr;gap:.2in}
.photos img{width:100%;height:2.25in;object-fit:cover;display:block}
.cap{font-size:8pt;color:#51606f;margin-top:3pt}
.steps{display:grid;gap:.18in;margin-top:.2in}
.step{display:grid;grid-template-columns:.5in 1fr;gap:.18in;border-top:1px solid #e0d6bd;padding-top:.14in}
.step .n{font-size:24pt;font-weight:300;color:#b4862f;line-height:1}
.step b{display:block;font-size:12pt;color:#0e2740;margin-bottom:2pt}
.step span{color:#51606f;font-size:10pt}
.end{background:#f3f0ea}
.end .big{font-size:12.5pt;margin:0 0 10pt}
.note{font-size:8pt;color:#51606f;margin-top:10pt}
'''
def foot(n): return f'<div class="foot"><span>The Local Cabinetry &middot; thelocalcabinetry.com</span><span>{n}</span></div>'
pages=[]
pages.append('''<section class="page cover"><div class="img"></div><div class="band"><img src="../../logo-tlc-dark.svg" alt="The Local Cabinetry"><h1>Cabinet catalog</h1><p>Collections &middot; finishes &middot; construction &middot; sizes</p></div></section>''')
pages.append(f'''<section class="page welcome"><p class="eyebrow">Welcome</p><h2>Cabinets for kitchens, vanities and closets</h2><p class="lead" style="margin-bottom:18pt">Framed and frameless, ready to assemble or made to order.</p>
<p>The Local Cabinetry supplies cabinetry to homeowners, builders, contractors and remodelers. This catalog shows our collections and finishes, how each line is built, and the cabinet codes with their sizes, so you can plan a project with us from the first sketch to the last box.</p>
<p>You do not need to read it all. Tell us the room and the size, and we draw the layout with you, choose the doors and finishes together, and send you an estimate.</p>
<div class="three"><div><b>Framed and frameless</b><span>Five door collections on framed boxes, plus a frameless line, each in its own range of finishes.</span></div><div><b>Built to last</b><span>How each line is built, side by side, on the construction page.</span></div><div><b>Designed with you</b><span>Chat with us, send a photo or a sketch, and we turn it into a layout and an estimate.</span></div></div>{foot(2)}</section>''')
pages.append(f'''<section class="page"><p class="eyebrow">Collections</p><h2>Framed cabinets</h2><p class="lead">Each finish has a short code. Use it when you ask for a quote or a sample.</p>
{sw_block("Single package: Essential",[("SW","Shaker White"),("GR","Gray Shaker"),("SE","Shaker Espresso")])}
{sw_block("Single package: Classic",[("AC","Aspen Charcoal"),("AW","Aspen White"),("CW","Charleston White")])}
{sw_block("Single package: Slim Shaker and Charm",[("SDW","Slim Dove White"),("SWO","Slim White Oak"),("NB","Navy Blue")])}
{sw_block("Two package: Charm",[("RW","Rustic Wood"),("SB","Sage Breeze"),("LG","Lunar Gray"),("AG","Aston Green"),("SA","Smokey Gray"),("TC","Treasure Chest"),("IB","Iron Black")])}
{sw_block("Two package: Slim Shaker",[("SAO","Slim Amber Oak"),("SIB","Slim Iron Black"),("SAG","Slim Aston Green")])}
{sw_block("Two package: Double Shaker",[("DDW","Double Dove White"),("DSG","Double Smokey Gray")])}
{foot(3)}</section>''')
pages.append(f'''<section class="page"><p class="eyebrow">Collections</p><h2>Frameless and builder grade</h2><p class="lead">Finish colours are shown as close as a printed page allows. Ask us for door samples before you decide.</p>
{sw_block("Frameless, two package",[("OB","Oak Blonde"),("OS","Oak Shade"),("MB","Matte Black"),("MI","Matte Ivory"),("CG","Crystal Glass"),("MG","Midnight Glass"),("HW","High Glossy White"),("HG","High Glossy Gray")])}
{sw_block("Builder grade, drop-ship",[("FW","Floral White"),("FG","Floral Gray"),("FE","Floral Espresso")])}
<p class="note">Single package means one box per cabinet. Two package means a universal box and a front set.</p>{foot(4)}</section>''')
rowsT=[
('Door and drawer front','Full overlay, five-piece, solid wood with MDF center panel','Full overlay, five-piece, solid wood with MDF center panel','Full overlay, PET high glossy slab door style','Full overlay, five-piece, solid wood with MDF center panel'),
('Face frame','3/4 inch solid wood','3/4 inch solid wood','None (frameless)','3/4 inch solid wood'),
('Cabinet box','1/2 inch cabinet-grade plywood','1/2 inch cabinet-grade plywood','3/4 inch plywood with white melamine finish','1/2 inch cabinet-grade furniture board'),
('Drawer box','Solid wood, dovetail, 2 1/2 inch depth','Solid wood, dovetail, 3 1/8 inch depth','3/4 inch plywood with white melamine finish','Plywood, rebate joint'),
('Drawer glides','Concealed undermount, full extension, soft-close','Concealed undermount, full extension, soft-close','Concealed undermount, full extension, soft-close','Builder grade undermount'),
('Hinges','6-way adjustable, soft-close','6-way adjustable, soft-close','6-way adjustable, soft-close','6-way adjustable, not soft-close'),
('Exterior finish','Matching color','Clear UV-coated natural plywood','White melamine','Matching color'),
('Interior finish','Clear UV-coated natural plywood','Clear UV-coated natural plywood','White melamine','Natural melamine'),
('Shelves','3/4 inch plywood, front edge banding','3/4 inch plywood, front edge banding','3/4 inch plywood, white melamine, front edge banding','5/8 inch furniture board, natural melamine, edge banding on all sides'),
('Accessories included','Door bumper, metal shelf pin, metal clips, L bracket for base cabinet','Door bumper, metal shelf pin, metal clips, L bracket for base cabinet','Door bumper, metal shelf pin','Door bumper, metal shelf pin, metal clips, L bracket for base cabinet'),
('Package','One box per cabinet','Two packages: universal box and front set','Two packages: universal box and front set','One box per cabinet')]
trs=''.join('<tr>'+''.join(f'<td>{E(c)}</td>' for c in r)+'</tr>' for r in rowsT)
pages.append(f'''<section class="page"><p class="eyebrow">Construction</p><h2>How each line is built</h2><p class="lead">Single package: Essential and Classic. Two package: Charm, Slim Shaker and Double Shaker (framed) and Frameless. Builder grade ships direct.</p>
<table><tr><th></th><th>Single package</th><th>Two package, framed</th><th>Two package, frameless</th><th>Builder grade</th></tr>{trs}</table>
<p class="note">Frameless boxes join with camlock and dowel construction and have predrilled shelf-pin holes with metal shelf pins.</p><p class="sub" style="margin-top:18pt">Certification</p><p style="font-size:10pt">TSCA Title VI, KCMA and CARB2 certified; NGBS Green.</p>{foot(5)}</section>''')

# ---------- code tables, chunked into pages
blocks=[]
for s in secs:
    rs=rows[s]
    blocks.append((s,rs))
col=[];cols=[];used=0
def flush():
    global col,used
    if col: cols.append(col); col=[]; used=0
for s,rs in blocks:
    i=0
    while i<len(rs):
        room=CAP-used-2
        if room<4: flush(); room=CAP-2
        take=rs[i:i+room]; col.append((s if i==0 else s+' (cont.)',take)); used+=len(take)+2; i+=len(take)
        if used>=CAP-2: flush()
flush()
code_pages=[cols[i:i+2] for i in range(0,len(cols),2)]
def rowhtml(r):
    c,desc,f,l=r; tag=('F' if f else '')+(' L' if l else '')
    return f'<div class="r"><b>{E(c)}</b><span>{E(desc)}</span><em>{tag.strip()}</em></div>'
pn=6
for pi,pg in enumerate(code_pages):
    inner=''.join('<div class="sec"><h4>'+E(t)+'</h4>'+''.join(rowhtml(r) for r in rs)+'</div>' for colx in pg for t,rs in colx)
    # each column is a div with fixed height so columns break exactly where chunked
    cdivs=''.join('<div style="break-inside:avoid-column">'+''.join('<div class="sec"><h4>'+E(t)+'</h4>'+''.join(rowhtml(r) for r in rs)+'</div>' for t,rs in colx)+'</div>' for colx in pg)
    head='<p class="eyebrow">Sizes</p><h2>Cabinet codes and sizes</h2><p class="legend">F = framed range, L = frameless range. Sizes in inches as W x H x D. Ask us for drawings of any code.</p>' if pi==0 else '<p class="eyebrow">Sizes</p><h2>Cabinet codes and sizes (continued)</h2>'
    pages.append(f'<section class="page">{head}<div class="cols">{cdivs}</div>{foot(pn)}</section>'); pn+=1
# unsized codes + panels
uns=''.join(f'<span>{E(c)}</span>' for c in unsized)
panels=[('BSV','23 1/4 x 34 1/2 x 1/4'),('USV2496','23 1/4 x 96 x 1/4'),('FPV4296','42 x 96 x 1/4'),('S2496','24 x 96 x 3/4'),('WSV24','15 x 24 x 1/4'),('WSV30','15 x 30 x 1/4'),('WSV36','15 x 36 x 1/4'),('WSV42','15 x 42 x 1/4'),('Skin panel, interior','48 x 48 x 1/4'),('DWR3','24 x 34 1/2 x 3/4'),('REPV2496','24 x 96 x 1/2'),('REPV2796','27 x 96 x 1/2'),('SD','11 x 15 x 3/4'),('WDEP30','11 1/2 x 29 x 3/4'),('WDEP36','11 1/2 x 35 x 3/4'),('WDEP42','11 1/2 x 41 x 3/4'),('BDEP','23 1/2 x 29 x 3/4'),('VDEP','20 1/2 x 29 x 3/4')]
prs=''.join(f'<tr><td>{E(a)}</td><td>{E(b)}</td></tr>' for a,b in panels)
pages.append(f'''<section class="page"><p class="eyebrow">Sizes</p><h2>Panels and finishing pieces</h2><p class="lead">Sizes in inches, width x height x thickness.</p>
<table style="width:3.7in"><tr><th>Code</th><th>Size, inches</th></tr>{prs}</table>
<p class="sub" style="margin-top:20pt">More codes</p><p style="font-size:8.6pt;color:#51606f;max-width:6in">These codes are also in our range. Ask us for their sizes and drawings.</p><div style="display:flex;flex-wrap:wrap;gap:3pt 10pt;font-size:8.4pt;margin-top:6pt;max-width:6.9in">{uns}</div>{foot(pn)}</section>'''); pn+=1
def ph(src,alt): return f'<div><img src="../../accessories/{src}" alt="{E(alt)}"><div class="cap">{E(alt)}</div></div>'
pages.append(f'''<section class="page"><p class="eyebrow">Projects</p><h2>Built and installed</h2><p class="lead">Photos from our projects.</p>
<div class="photos">{ph("closet.jpg","Walk-in closet")}{ph("handles.jpg","Shaker doors with black handles")}{ph("drawers-run.jpg","Drawer boxes in a base run")}{ph("wardrobe-open.jpg","Wardrobe with shelves and rails")}{ph("boxes.jpg","Drawer base cabinet")}{ph("slides.jpg","Vanity drawers")}</div>{foot(pn)}</section>'''); pn+=1
pages.append(f'''<section class="page"><p class="eyebrow">How we work</p><h2>From first sketch to delivery</h2><p class="lead">No prices are printed here, because every project is different. You get an itemized estimate for yours.</p>
<div class="steps">
<div class="step"><div class="n">1</div><div><b>Tell us about the room</b><span>Chat with us on thelocalcabinetry.com or send an email. A photo, a sketch or rough wall sizes is enough to start.</span></div></div>
<div class="step"><div class="n">2</div><div><b>We design it with you</b><span>We draw the layout, choose door style and finish with you, and send door samples if you want to see a color in person.</span></div></div>
<div class="step"><div class="n">3</div><div><b>You receive an estimate</b><span>An itemized estimate for your layout. Change what you like; we update the drawing and the estimate together.</span></div></div>
<div class="step"><div class="n">4</div><div><b>We build and ship</b><span>We build to your order and deliver by freight. Lead time is about 7 days. Shipping within the US then takes 3 to 7 days, depending on your location. For custom work we confirm the production time when the order is placed.</span></div></div>
</div>{foot(pn)}</section>'''); pn+=1
pages.append(f'''<section class="page end"><p class="eyebrow">Contact</p><h2>Start your project</h2><p class="lead" style="margin-top:14pt">Tell us what you are planning. We reply with a layout and an estimate.</p>
<p class="big">Design your cabinets online: <b>thelocalcabinetry.com/design</b></p>
<p class="big">Email: <b>info@thelocalcabinetry.com</b><br>Houston, TX</p>
<img src="../../logo-tlc.svg" style="height:.9in;margin-top:.6in" alt="The Local Cabinetry">{foot(pn)}</section>''')
open('index.html','w').write(f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The Local Cabinetry Catalog</title><style>{css}</style></head><body>{"".join(pages)}</body></html>')
print('code rows',sum(len(r) for r in rows.values()),'unsized',len(unsized),'pages',len(pages),'code pages',len(code_pages))
