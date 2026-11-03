import { useState } from 'preact/hooks';
import { Modal, Button, Row, Segmented, Toggle } from '../ui.jsx';
import { designLayerImport, finishLayerImport } from './layered.js';

function Choice({ request }) {
  const [indices,setIndices]=useState(request.layers.filter(l=>l.visible).map(l=>l.index));
  const [mode,setMode]=useState('layers');
  return <Modal title="Place Layered Image" width={500} onClose={()=>finishLayerImport()} footer={<><Button onClick={()=>finishLayerImport()}>Cancel</Button><Button variant="primary" disabled={!indices.length} onClick={()=>finishLayerImport({indices,mode})}>Place</Button></>}>
    <p>{request.file.split(/[\\/]/).pop()} · {request.width} × {request.height}</p>
    <Row stacked><Segmented value={mode} options={[{value:'merged',label:'Place as one image'},{value:'layers',label:'Place layers'}]} onChange={setMode}/></Row>
    <div class="dz-import-layers">{[...request.layers].reverse().map(l=><Row key={l.index} label={<><img width={40} height={30} style={{objectFit:'contain',verticalAlign:'middle',marginRight:8}} src={l.thumb}/>{l.name}</>}><Toggle checked={indices.includes(l.index)} onChange={v=>setIndices(v?[...indices,l.index]:indices.filter(i=>i!==l.index))}/></Row>)}</div>
    <p class="hint">Layers keep their positions. They become independent images in this design.</p>
  </Modal>;
}
export function DesignLayerImportDialog(){const request=designLayerImport.value;return request?<Choice key={request.file} request={request}/>:null;}
