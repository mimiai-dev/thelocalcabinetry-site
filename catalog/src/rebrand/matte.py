import fitz,json,re
d=fitz.open('cot/source.pdf'); out={}
for pn in range(20):
    p=d[pn]; s=set()
    for im in p.get_images(full=True):
        xr=im[0]; sm=im[1]
        if sm and 'Matte' in d.xref_object(sm): s.add((im[2],im[3]))
    out[pn+1]=sorted(s)
json.dump(out,open('cot/matte.json','w')); print({k:len(v) for k,v in out.items()})
