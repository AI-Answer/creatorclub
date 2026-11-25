const FOCUSABLE='a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]';

/** What Tab can reach inside a panel, in order: enabled, visible, and not taken out of the order with tabindex -1. */
export function focusableIn(panel:HTMLElement):HTMLElement[]{
 return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(element=>
  !element.hasAttribute('disabled')&&element.getAttribute('tabindex')!=='-1'&&element.getAttribute('aria-hidden')!=='true'&&!element.closest('[hidden]'));
}

/** Where Tab goes from `active` inside `panel`: the last one wraps to the first and the first (or the panel itself) back to the last. Null leaves it to the browser. */
export function trapTab(panel:HTMLElement,active:Element|null,shift:boolean):HTMLElement|null{
 const items=focusableIn(panel);
 if(!items.length)return panel;
 const first=items[0],last=items[items.length-1];
 if(!active||!panel.contains(active)||active===panel)return shift?last:first;
 if(shift&&active===first)return last;
 if(!shift&&active===last)return first;
 return null;
}
