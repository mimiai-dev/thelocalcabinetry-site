import fs from 'fs'
import {open} from './cdp.js'
const {send,ev,sleep}=await open()
await send('Page.navigate',{url:'http://127.0.0.1:8790/catalog.html'}); await sleep(4000)
const r=await send('Page.printToPDF',{paperWidth:8.5,paperHeight:11,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0,printBackground:true,preferCSSPageSize:true})
fs.writeFileSync('cot/new.pdf',Buffer.from(r.result.data,'base64')); console.log('ok'); process.exit(0)
