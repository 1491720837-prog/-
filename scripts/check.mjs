import {readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
for(const dir of ['dist','scripts','browser-extension'])for(const file of await readdir(dir))if(/\.(m?js)$/.test(file))execFileSync(process.execPath,['--check',dir+'/'+file],{stdio:'inherit'});
console.log('JavaScript syntax checks passed');
