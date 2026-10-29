import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../src/stemProgress.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {estimateStemSeconds,stemCountdown}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('stem estimate scales with track duration and counts down without negative times',()=>{
 assert.ok(estimateStemSeconds(300)>estimateStemSeconds(45));
 assert.ok(estimateStemSeconds(300,'fast')<estimateStemSeconds(300,'best'));
 assert.equal(estimateStemSeconds(45,'fast'),22);
 assert.equal(estimateStemSeconds(45,'best'),33);
 assert.match(stemCountdown(75,0),/1:15 remaining/);
 assert.match(stemCountdown(75,16),/0:59 remaining/);
 assert.match(stemCountdown(75,80),/longer than estimated/);
 assert.doesNotMatch(stemCountdown(75,80),/-|ready/i);
});
