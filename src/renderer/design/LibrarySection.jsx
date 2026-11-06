import { useEffect, useState } from 'preact/hooks';
import { ArrowLeft, ChevronRight } from 'lucide-preact';
import { Button, IconButton } from '../ui.jsx';
import { clearLibraryPreview } from './library.js';
export function LibrarySections({ sections, query = '' }) {
  const [section, setSection] = useState(null), [page, setPage] = useState(0);
  useEffect(() => { setSection(null); setPage(0); clearLibraryPreview(); }, [query]);
  useEffect(() => () => clearLibraryPreview(), []);
  const focused = sections.find(s => s.id === section);
  if (focused) {
    const limit=focused.layout==='emoji'?120:24,currentPage=Math.min(page,Math.max(0,Math.ceil(focused.items.length/limit)-1));
    return <section class="dz-library-section dz-library-all">
      <header><IconButton icon={ArrowLeft} title="Back to sections" onClick={() => { setSection(null); clearLibraryPreview(); }}/><h3>{focused.title}</h3><span class="spacer"/>{focused.actions}</header>{focused.controls}
      <div class={`dz-library-grid${focused.layout==='emoji'?' dz-emoji-grid':''}`}>{focused.items.slice(currentPage*limit,currentPage*limit+limit).map(focused.render)}</div>
      {!focused.items.length && <p class="hint">{query ? 'No matching items.' : focused.empty || 'No items yet.'}</p>}
      {focused.items.length>limit && <RowPages page={currentPage} count={focused.items.length} limit={limit} onChange={setPage}/>}
    </section>;
  }
  return <>{sections.map(s => <section class="dz-library-section" key={s.id}>
    <header><h3>{s.title}</h3><span class="spacer"/>{s.actions}{s.items.length > 2 && <Button class="small dz-see-all" onClick={() => { clearLibraryPreview(); setSection(s.id); setPage(0); }}>See All <ChevronRight size={12}/></Button>}</header>
    {s.controls}{s.items.length ? <div class={s.layout==='emoji'?'dz-emoji-grid':'dz-library-row'}>{s.items.slice(0,s.layout==='emoji'?36:6).map(s.render)}</div> : <p class="hint">{query ? 'No matching items.' : s.empty || 'No items yet.'}</p>}
  </section>)}</>;
}
function RowPages({ page, count, limit=24, onChange }) {
  return <div class="dz-library-pagination"><Button class="small" disabled={!page} onClick={() => onChange(page - 1)}>Previous</Button><span>{page + 1} / {Math.ceil(count/limit)}</span><Button class="small" disabled={(page+1)*limit>=count} onClick={() => onChange(page + 1)}>Next</Button></div>;
}
