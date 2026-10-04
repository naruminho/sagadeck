import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile), conversions=new Map();
// Word legado precisa de um conversor real: nÃ£o decodifique o binÃ¡rio como texto.
export async function convertLegacyWord(bytes,format='docx') {
  if(!['docx','pdf'].includes(format))throw Error('Formato de conversão inválido.');
  const key=crypto.createHash('sha256').update(bytes).digest('hex')+format;
  if(conversions.has(key))return conversions.get(key);
  const pending=(async()=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sagadeck-word-'));
    const input=path.join(dir,'source.doc'),output=path.join(dir,'source.'+format);
    try {
      await fs.writeFile(input,bytes);
      if(process.platform==='win32') {
        const script=path.join(dir,'convert.ps1');
        await fs.writeFile(script,`param([string]$inputFile,[string]$outputFile)
$word=$null; $document=$null
try {
  $word=New-Object -ComObject Word.Application
  $word.Visible=$false; $word.DisplayAlerts=0; $word.AutomationSecurity=3
  $document=$word.Documents.Open($inputFile,$false,$true)
  $document.SaveAs2($outputFile,${format==='pdf'?17:16})
} finally {
  if($document){$document.Close(0); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document)}
  if($word){$word.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)}
}`);
        const command=(await fs.readFile(script,'utf8')).replace('param([string]$inputFile,[string]$outputFile)',`$ErrorActionPreference='Stop'; $inputFile='${input.replace(/'/g,"''")}'; $outputFile='${output.replace(/'/g,"''")}'`);
        await run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{timeout:120000,windowsHide:true});
      } else await run(process.env.SAGADECK_OFFICE_BIN||'libreoffice',['-env:UserInstallation=file://'+path.join(dir,'profile'),'--headless','--convert-to',format,'--outdir',dir,input],{timeout:120000});
      return await fs.readFile(output);
    } catch(cause) {throw new Error('NÃ£o foi possÃ­vel converter o Word antigo (.doc). Ã‰ necessÃ¡rio Microsoft Word no Windows ou LibreOffice no servidor; vocÃª tambÃ©m pode enviar o arquivo como .docx.',{cause});}
    finally {await fs.rm(dir,{recursive:true,force:true});}
  })();
  conversions.set(key,pending);
  try {return await pending;} catch(e){conversions.delete(key);throw e;}
  finally {if(conversions.size>4)conversions.delete(conversions.keys().next().value);}
}
