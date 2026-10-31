/** The page title row for sidebar screens. On the desktop app it also drags the window. */
export function ScreenHeader({title}:{title:string}){
 return <header className="club-drag flex h-16 shrink-0 items-end px-8 pb-2">
  <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
 </header>;
}
