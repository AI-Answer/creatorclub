/** Calls to the club server. Failures carry one sentence that is safe to show. */
export class ClubApiError extends Error{}

export const CANT_REACH="Couldn't reach CreatorClub.";
const GENERIC='That did not work.';

export async function clubFetch<T=unknown>(path:string,init:{method?:string;body?:unknown}={}):Promise<T>{
 let response:Response;
 try{
  response=await fetch(`/api/club${path}`,{method:init.method??(init.body===undefined?'GET':'POST'),headers:init.body===undefined?undefined:{'content-type':'application/json'},body:init.body===undefined?undefined:JSON.stringify(init.body)});
 }catch{throw new ClubApiError(CANT_REACH);}
 const text=await response.text();let body:unknown;
 try{body=text?JSON.parse(text):undefined;}catch{body=undefined;}
 if(!response.ok){
  const message=typeof body==='object'&&body!==null&&'error' in body&&typeof body.error==='string'?body.error:GENERIC;
  throw new ClubApiError(message);
 }
 return body as T;
}

/** The sentence to show for any thrown value. */
export const errorMessage=(error:unknown,fallback=GENERIC)=>error instanceof ClubApiError?error.message:fallback;
