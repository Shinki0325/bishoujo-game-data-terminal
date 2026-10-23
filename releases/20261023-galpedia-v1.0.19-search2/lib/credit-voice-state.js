// Native placeholder accounts describe a credit state, never a person identity.
export function creditVoiceState(f) {
  if(f.roleCode && f.roleCode !== 'voice-actor')return null;
  const id=String(f.bangumiPersonId??'');
  if(id==='16194')return {entityKind:'voice-state',voiceStatus:'unvoiced',label:'无配音'};
  if(id==='13698')return {entityKind:'voice-state',voiceStatus:'undisclosed',label:'配音未公开'};
  if(f.entityKind==='voice-state')return {entityKind:'voice-state',voiceStatus:f.voiceStatus,label:f.voiceStatus==='unvoiced'?'无配音':'配音未公开'};
  return null;
}
