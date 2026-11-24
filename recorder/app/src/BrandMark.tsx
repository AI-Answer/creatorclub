/** Creator Compiler mark: a geometric C cleanly sliced and offset along a horizontal splice cut. */
export function BrandMark({className='compiler-mark',size=36}:{className?:string;size?:number}) {
 return <svg className={className} width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <rect x="1" y="1" width="62" height="62" rx="16" fill="var(--cc-brand)"/>
  <path d="M13 21.5A8.5 8.5 0 0 1 21.5 13H47.5L41.5 22.5H24.5A2 2 0 0 0 22.5 24.5V29.75H13Z" fill="var(--cc-on-media)"/>
  <path d="M16.5 34.25H26V39.5A2 2 0 0 0 28 41.5H51L45 51H25A8.5 8.5 0 0 1 16.5 42.5Z" fill="var(--cc-on-media)"/>
 </svg>;
}
