// Defensive edition-record ceiling, not a claim about measured loading speed.
// 25000 display works can contain additional editions; all consumers share it.
export const CATALOG_RECORD_LIMIT = 50000;
// Every version family contains at least two distinct edition records.
export const PRESENTATION_FAMILY_LIMIT = CATALOG_RECORD_LIMIT / 2;
