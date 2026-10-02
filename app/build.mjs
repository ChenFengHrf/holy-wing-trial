import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
rmSync('dist',{recursive:true,force:true});
mkdirSync('dist/server',{recursive:true});
writeFileSync('dist/server/index.js',readFileSync('src/worker.mjs','utf8'));
console.log('Built retired Site response; game remains on GitHub Pages.');
