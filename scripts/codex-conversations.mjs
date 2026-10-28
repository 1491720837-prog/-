import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
export class CodexConversations{
 constructor(root=resolve('artifacts/codex-chats')){this.root=root;this.active=new Set();}
 key(value){if(!value)return null;for(const k of ['projectId','id'])if(typeof value[k]!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(value[k]))throw Error('项目聊天标识无效');return createHash('sha256').update(JSON.stringify([value.projectId,value.id])).digest('hex');}
 lock(key){if(this.active.has(key))throw Error('这个画布的对话正在生成，请稍后再问');this.active.add(key);}
 release(key){this.active.delete(key);}
 async workspace(key){const directory=resolve(this.root,key,'workspace');await mkdir(directory,{recursive:true,mode:0o700});return directory;}
 async get(key){try{return JSON.parse(await readFile(join(this.root,key+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async put(key,record){await mkdir(this.root,{recursive:true});const file=join(this.root,key+'.json');await writeFile(file+'.tmp',JSON.stringify(record),{mode:0o600});await rename(file+'.tmp',file);}
}
