import fitz
d=fitz.open('cot/source.pdf')
for i in range(20):
    open(f'cot/svg/p{i+1}.svg','w').write(d[i].get_svg_image(text_as_path=False)); print(i+1,flush=True)
