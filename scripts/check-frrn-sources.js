#!/usr/bin/env node
// Check a source binding before relying on it. The host only logs these problems,
// because one binding must not stop every other space on it.
// Usage: node scripts/check-frrn-sources.js <sources.json> <frrn.db>
import Database from 'better-sqlite3';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {sourceProblems,validateSources} from '../src/frrn/accounts.js';

const [sourcesFile,databaseFile]=process.argv.slice(2);
if(!sourcesFile || !databaseFile){
  console.error('Usage: node scripts/check-frrn-sources.js <sources.json> <frrn.db>');
  process.exit(2);
}
const explain={
  'unknown-community':'no FRRN community has this ID, so this binding shares nothing',
  'former-organiser':'an approver is not a current FRRN organiser'
};
let db;
try {
  const sources=validateSources(JSON.parse(readFileSync(resolve(sourcesFile),'utf8')));
  db=new Database(resolve(databaseFile),{readonly:true,fileMustExist:true});
  const problems=sourceProblems(db,sources);
  for(const {organisation,kind} of problems)console.error(`${organisation}: ${explain[kind]}`);
  if(problems.length)process.exitCode=1;
  else console.log(`${sources.length} source binding${sources.length===1?'':'s'} ready`);
} catch(error) {
  console.error('Could not check the source binding:',error.message);
  process.exitCode=1;
} finally {db?.close();}
