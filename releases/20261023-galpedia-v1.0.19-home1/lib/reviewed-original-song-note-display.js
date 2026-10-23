// Reviewed original-source wording only; never infer an edition or recording.
// Evidence: {"path": "reports/galpedia-song-use-21-20261017/native-note-displays.json", "sha256": "4738301e31da3c4ed84667f13770a0ef2b5897d2c2640568486245b072cfad73"}
const rules = [{"id":"review-20261017-native-note-416","workId":"416","expected":{"creditId":"credit_e6d7b1dbe7a2e3f929f69b2f440452c8","source":"vndb","roleCode":"vocalist","relationId":"vndb:vn-staff:84865","presentationWorkId":"vndb:v9748","sourcePersonId":"vndb:s1419","creditedAliasId":"2348","creditNoteOriginal":"OP \"Suna no Kaze\", ED \"repeat\"","sourceEdition":{"fieldPresent":true,"id":null,"kind":"original","workId":"vndb:v9748"}},"displayText":"ED曲「砂の風」、OP曲「repeat」","basis":"reviewed-original-source-credit-assertion","reason":"与本版用途裁决相同的原版VNDB署名，其英文用途仍相反；只修这条原版来源主张的显示，原始文本和所有版本/人物关系不变。","evidence":{"path":"reports/galpedia-song-use-21-20261017/review-evidence.json","sha256":"7e4a1d8d4692c01055dd43397e420817d2d50eec778397db9d33349cf95d420f"}},{"id":"review-20261017-native-note-582","workId":"582","expected":{"creditId":"credit_7779ef052ace09c5831e3f8ab9b7fbca","source":"vndb","roleCode":"vocalist","relationId":"vndb:vn-staff:20047","presentationWorkId":"vndb:v1107","sourcePersonId":"vndb:s803","creditedAliasId":"1431","creditNoteOriginal":"OP \"Nikoensis - Tsuisou\"","sourceEdition":{"fieldPresent":true,"id":null,"kind":"original","workId":"vndb:v1107"}},"displayText":"ED曲 「nikoensis - 追想」","basis":"reviewed-original-source-credit-assertion","reason":"与本版用途裁决相同的原版VNDB署名，其英文用途仍相反；只修这条原版来源主张的显示，原始文本和所有版本/人物关系不变。","evidence":{"path":"reports/galpedia-song-use-21-20261017/review-evidence.json","sha256":"7e4a1d8d4692c01055dd43397e420817d2d50eec778397db9d33349cf95d420f"}}];

export function reviewedOriginalSongNoteDisplay(credit = {}) {
  for (const rule of rules) {
    const {sourceEdition, ...fields} = rule.expected;
    if (!Object.entries(fields).every(([key,value]) => credit[key] === value)) continue;
    if (!Object.entries(sourceEdition).every(([key,value]) => credit.sourceEdition?.[key] === value)) continue;
    return rule.displayText;
  }
  return null;
}
