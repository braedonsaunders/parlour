import { sessionApply } from '@parlour/engine';
import { heartsGame } from '../game';
import { heartsConfigSchema } from '../config';
const cfg = heartsConfigSchema.resolve({});
function mk(seed:number){ const deckOrder = Array.from({length:52},(_,i)=>`v#${i}`);
  const FACE_ORDER=['C1','C10','C11','C12','C13','C2','C3','C4','C5','C6','C7','C8','C9','D1','D10','D11','D12','D13','D2','D3','D4','D5','D6','D7','D8','D9','H1','H10','H11','H12','H13','H2','H3','H4','H5','H6','H7','H8','H9','S1','S10','S11','S12','S13','S2','S3','S4','S5','S6','S7','S8','S9'];
  const faceOf=new Map<string,string>(); FACE_ORDER.forEach((id,i)=>faceOf.set(deckOrder[i]!,id));
  const s=(heartsGame as any); 
  return {session:(require('@parlour/engine') as any), faceOf}; }
