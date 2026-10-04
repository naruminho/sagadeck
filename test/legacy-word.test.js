import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {convertLegacyWord} from '../src/import/legacy-word.js';
import {extractDocText} from '../src/ai/context.js';

test('Word legado converte em documento estruturado e PDF sem perder o original',{skip:process.platform!=='win32'||!fs.existsSync('C:/Program Files/Microsoft Office/root/Office16/WINWORD.EXE')},async()=>{
  const original=Buffer.from('{\\rtf1\\ansi Chapter test\\par Numerical methods 123.}');
  const snapshot=Buffer.from(original);
  const docx=await convertLegacyWord(original);
  assert.equal(docx.subarray(0,2).toString(),'PK');
  assert.match((await extractDocText('converted.docx',docx)).text,/Numerical methods 123/);
  assert.equal((await convertLegacyWord(original,'pdf')).subarray(0,4).toString(),'%PDF');
  assert.deepEqual(original,snapshot);
  await assert.rejects(convertLegacyWord(original,'exe'),/inválido/);
});
