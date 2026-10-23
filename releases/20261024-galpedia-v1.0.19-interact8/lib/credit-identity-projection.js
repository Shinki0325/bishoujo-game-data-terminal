// Source-ID repairs are shared by forward and reverse projections.
export function resolveCreditPerson(fact, catalog) {
  if(fact.personId)return fact;
  const personId = catalog.creditPersonLinks?.[fact.creditId];
  if (fact.personId || !personId) return fact;
  return {...fact, personId, identityResolution:{basis:'existing-unambiguous-source-person-id'}};
}

export function projectPersonIdentity(ledger, personId, catalog) {
  if (!ledger) return ledger;
  const credits = [...ledger.credits];
  const ids = new Set(credits.map(f => f.evidenceId || f.relationId || f.creditId));
  for (const fact of catalog.personCreditRepairs?.[personId] ?? []) {
    if (fact.personId !== personId) throw Error('人物身份补齐记录不符');
    const key = fact.evidenceId || fact.relationId || fact.creditId;
    if (!ids.has(key)) { credits.push(fact); ids.add(key); }
  }
  return {...ledger, credits, coBrands:catalog.personCompanyRepairs?.[personId] ?? ledger.coBrands};
}

export function projectWorkIdentity(ledger, catalog) {
  return {...ledger, credits:ledger.credits.map(f => resolveCreditPerson(f,catalog))};
}
