export class RecorderTasks {
 private pending=new Map<string,{promise:Promise<unknown>;users:Set<symbol>}>();
 acquire<T>(key:string,work:(active:()=>boolean)=>Promise<T>){
  const user=Symbol();let entry=this.pending.get(key);
  if(!entry){const users=new Set<symbol>();const promise=Promise.resolve().then(()=>work(()=>users.size>0));entry={promise,users};this.pending.set(key,entry);void promise.finally(()=>{if(this.pending.get(key)===entry)this.pending.delete(key);}).catch(()=>{});}
  entry.users.add(user);const owned=entry;return {promise:entry.promise as Promise<T>,release:()=>{owned.users.delete(user);}};
 }
}
export const recorderTasks=new RecorderTasks();
