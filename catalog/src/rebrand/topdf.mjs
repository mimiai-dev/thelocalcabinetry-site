import fs from 'fs'
import {open} from './cdp.js'
const {send,ev,sleep}=await open()
const [page='catalog.html',out='cot/new.pdf']=process.argv.slice(2)   // Alibaba variant: node topdf.mjs catalog-alibaba.html cot/new-alibaba.pdf
await send('Page.navigate',{url:'http://127.0.0.1:8790/'+page}); await sleep(4000)
const r=await send('Page.printToPDF',{paperWidth:8.5,paperHeight:11,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0,printBackground:true,preferCSSPageSize:true})
fs.writeFileSync(out,Buffer.from(r.result.data,'base64')); console.log('ok'); process.exit(0)
