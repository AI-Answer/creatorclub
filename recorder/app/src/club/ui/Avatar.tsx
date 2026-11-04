import {avatarColor,initials} from '../format';

/** Two initials on a colour taken from the name. `size` is `xs`, `sm`, `lg` or empty; `sq` rounds the corners instead of a circle. */
export function Avatar({name,size='',sq,color}:{name:string;size?:''|'xs'|'sm'|'lg';sq?:boolean;color?:string}){
 return <span aria-hidden className={`avatar ${size}${sq?' sq':''}`.replace(/\s+/g,' ').trim()} style={{borderRadius:sq?'var(--cc-r-lg)':'50%',background:color||avatarColor(name),color:'var(--cc-on-media)'}}>{initials(name)}</span>;
}
