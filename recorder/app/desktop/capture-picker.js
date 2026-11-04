'use strict';
const main = document.getElementById('sources');
let closed = false, timer, choosing = false;
function clearImages() { for (const img of main.querySelectorAll('img')) img.removeAttribute('src'); main.replaceChildren(); }
function close() { closed = true; clearTimeout(timer); clearImages(); }
window.addEventListener('pagehide', close);
document.getElementById('cancel').addEventListener('click', () => { close(); window.capturePicker.cancel(); });
async function refresh() {
 try {
  const data = await window.capturePicker.getData(); if (closed) return;
  // A rebuild between press and release would drop the pressed button and lose the click.
  if (main.matches(':active')) return;
  const focused = document.activeElement?.dataset.sourceId;
  main.replaceChildren();
  for (const kind of ['display', 'window']) {
   const section = document.createElement('section'), heading = document.createElement('h2');
   heading.textContent = kind === 'display' ? 'Displays' : 'Windows'; section.append(heading);
   const list = document.createElement('div'); list.className = 'source-list';
   for (const source of data.sources.filter(source => source.kind === kind)) {
    const button = document.createElement('button'); button.className = 'source-item'; button.dataset.sourceId = source.id; button.disabled = choosing;
    const preview = document.createElement('span'); preview.className = 'source-thumbnail';
    if (source.thumbnail) { const image = document.createElement('img'); image.src = source.thumbnail; image.alt = ''; preview.append(image); }
    button.append(preview);
    const label = document.createElement('strong');
    if (source.appIcon) { const icon = document.createElement('img'); icon.src = source.appIcon; icon.alt = ''; label.append(icon); }
    label.append(document.createTextNode(source.label)); button.append(label);
    const display = data.displays.find(display => display.id === source.displayId), detail = document.createElement('span');
    detail.textContent = display ? `${display.pixelSize.width} × ${display.pixelSize.height}${display.primary ? ' · Main display' : ''}` : kind === 'display' ? 'Entire display' : 'Application window';
    button.append(detail); button.addEventListener('click', () => {
     choosing = true; clearTimeout(timer); for (const item of main.querySelectorAll('button')) item.disabled = true;
     window.capturePicker.finish({ sourceId: source.id, mode: kind }).then(close).catch(() => { choosing = false; void refresh(); });
    }); list.append(button);
   }
   if (!list.childElementCount) { const empty = document.createElement('p'); empty.textContent = `No ${kind === 'display' ? 'displays' : 'windows'} available.`; list.append(empty); }
   section.append(list); main.append(section);
  }
  if (focused) [...main.querySelectorAll('button')].find(button => button.dataset.sourceId === focused)?.focus();
 } catch { if (!closed) main.textContent = 'Sources could not be loaded. Close this picker and try again.'; }
 finally { if (!closed && !choosing) timer = setTimeout(refresh, 2000); }
}
void refresh();
