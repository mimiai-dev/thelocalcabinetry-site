from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
def inst(path,loc):
    f=TTFont(path); return instancer.instantiateVariableFont(f,loc,inplace=False)
fr=inst('fraunces-Fraunces[SOFT,WONK,opsz,wght].ttf',{'wght':600,'opsz':48,'SOFT':0,'WONK':0})
hk=inst('hankengrotesk-HankenGrotesk[wght].ttf',{'wght':700})
def text_path(font,text,size,track=0,x0=0,y0=0):
    gs=font.getGlyphSet(); cmap=font.getBestCmap(); upm=font['head'].unitsPerEm; sc=size/upm
    x=x0; out=[]
    for ch in text:
        gn=cmap[ord(ch)]; g=gs[gn]
        pen=SVGPathPen(gs); tp=TransformPen(pen,(sc,0,0,-sc,x,y0)); g.draw(tp); out.append(pen.getCommands())
        x+=g.width*sc+track
    return ' '.join(out), x-track
# geometry (viewBox units): small line then main line, left aligned
top,topw=text_path(hk,'THE LOCAL',17,track=5.2,x0=3,y0=17)
main,mw=text_path(fr,'Cabinetry',58,track=0,x0=0,y0=70)
W=max(topw,mw)+4
def svg(c_top,c_main,bg=None):
    r=f'<rect width="{W:.0f}" height="84" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} 84" width="{W:.0f}" height="84" role="img" aria-label="The Local Cabinetry">{r}<path fill="{c_top}" d="{top}"/><path fill="{c_main}" d="{main}"/></svg>'
open('logo-light.svg','w').write(svg('#b4862f','#0e2740'))      # for light backgrounds (header)
open('logo-dark.svg','w').write(svg('#d8b25c','#ffffff'))       # for navy backgrounds (footer, dark mode)
print('width',round(W),'main',round(mw),'top',round(topw))
