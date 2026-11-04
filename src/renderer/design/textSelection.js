import { signal,effect } from '@preact/signals';
import { projectEpoch,room } from '../editor/store.js';
import { currentDesign,selection } from './store.js';
import { textRange,styleTextRange,styleWholeTextLayer,TEXT_STYLE_FIELDS } from '../../shared/designRichText.js';
export const textSelection=signal(null);
export function rememberTextSelection(layer,element){const range=textRange(layer.text,element.selectionStart,element.selectionEnd);textSelection.value=range.end>range.start?{designId:currentDesign.value?.id,layerId:layer.id,text:layer.text,...range}:null;}
export function selectedTextRange(layer){const r=textSelection.value;return r?.layerId===layer.id&&r.designId===currentDesign.value?.id&&r.text===layer.text?r:null;}
export function patchTextSelection(layer,props){const r=selectedTextRange(layer);if(!r)return styleWholeTextLayer(layer,props);const style={},rest={};for(const [key,value]of Object.entries(props))(TEXT_STYLE_FIELDS.includes(key)?style:rest)[key]=value;return{...styleTextRange(layer,r.start,r.end,style),...rest};}
let epoch,ids;
effect(()=>{const next=projectEpoch.value,picked=selection.value,d=currentDesign.value,r=textSelection.value;if(next!==epoch||ids!==picked||room.value!=='design'||r&&(!d||!d.layers.some(l=>l.id===r.layerId&&l.text===r.text)))textSelection.value=null;epoch=next;ids=picked;});
