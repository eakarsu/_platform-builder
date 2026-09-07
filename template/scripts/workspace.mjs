import {groupAssistants} from './assistant-groups.mjs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const modules=JSON.parse(await readFile(new URL('../config/modules.json',import.meta.url)));
export const features=JSON.parse(await readFile(new URL('../config/merged-features.json',import.meta.url))).map(f=>({...f,ai:!['report','audit'].includes(f.mode)&&(f.ai||/\b(ai|assistant|generator|analyzer|predictor|optimizer|summarizer)\b/i.test(f.title))}));
export const assistants=groupAssistants(features);
export const appConfig=JSON.parse(await readFile(new URL('../config/app.json',import.meta.url)));
export async function readiness(module){return {id:module.id,status:'Source reference; native workspace active',issues:[],listening:false};}
